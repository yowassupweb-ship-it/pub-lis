import uuid
from datetime import datetime, timezone
from collections.abc import Sequence
from typing import Annotated, Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import func, or_, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_db
from deps import get_current_user, log_event
from models import AppUser, Quest, QuestAssignment
from schemas import Condition, QuestAssignmentOut, QuestCreate, QuestOut, QuestUpdate

router = APIRouter(prefix="/api/quests", tags=["quests"])

# кто какие категории заводит
CATEGORY_ROLES = {
    "general": {"admin"},
    "bar": {"bartender", "manager", "admin"},
    "game": {"gamemaster", "admin"},
}


# ---- Условия: и для выдачи, и для зачёта. Поля — столбцы view user_facts ----
NUMERIC_FIELDS = {"xp", "games_played", "games_mastered"}
TEXT_FIELDS = {"name", "email", "phone", "telegram", "title", "avatar", "role"}
ALLOWED_FIELDS = NUMERIC_FIELDS | TEXT_FIELDS
NUMERIC_OPS = {"gte", "lte", "gt", "lt"}
MAX_SYNC_ROUNDS = 5  # каскад XP -> квест -> XP, крутим до неподвижной точки


def validate_conditions(conds: list[Condition], what: str) -> None:
    for c in conds:
        if c.field not in ALLOWED_FIELDS:
            raise HTTPException(
                status_code=422,
                detail=f"{what}: поле «{c.field}» недоступно. Разрешены: {', '.join(sorted(ALLOWED_FIELDS))}",
            )
        if c.op == "filled":
            continue
        if c.value is None or str(c.value).strip() == "":
            raise HTTPException(status_code=422, detail=f"{what}: для оператора {c.op} нужно значение")
        if c.op in NUMERIC_OPS or c.field in NUMERIC_FIELDS:
            if c.field not in NUMERIC_FIELDS:
                raise HTTPException(status_code=422, detail=f"{what}: {c.op} только для числовых полей")
            try:
                float(c.value)
            except (TypeError, ValueError):
                raise HTTPException(status_code=422, detail=f"{what}: «{c.value}» — не число")


def _cond_ok(facts: dict[str, Any], c: dict) -> bool:
    value = facts.get(c["field"])
    op, target = c.get("op", "filled"), c.get("value")
    filled = value is not None and not (isinstance(value, str) and not value.strip())
    if op == "filled":
        return filled
    if op == "eq":
        return filled and str(value) == str(target)
    if op == "ne":
        return str(value) != str(target)
    try:
        num, tgt = float(value), float(target)
    except (TypeError, ValueError):
        return False
    return {"gte": num >= tgt, "lte": num <= tgt, "gt": num > tgt, "lt": num < tgt}[op]


def conditions_met(facts: dict[str, Any], conds: list | None) -> bool:
    """None = условий нет (не автоматическое); [] = выполнено всегда."""
    if conds is None:
        return False
    return all(_cond_ok(facts, c) for c in conds)


async def load_facts(db: AsyncSession, user_id: uuid.UUID) -> dict[str, Any]:
    row = (
        await db.execute(text("SELECT * FROM user_facts WHERE id = :id"), {"id": user_id})
    ).mappings().first()
    return dict(row) if row else {}


async def sync_auto_quests(db: AsyncSession, user: AppUser) -> None:
    """Выдать подходящие автоквесты + зачесть выполненные. Коммитит вызывающий.

    Вызывается в точках изменения состояния (регистрация, логин, профиль,
    роль, XP) и при раздаче админом — не на чтениях. Вставка через
    ON CONFLICT DO NOTHING (UNIQUE quest_id+user_id): параллельные вызовы
    безопасны. Крутится до неподвижной точки: зачёт может дать XP, который
    открывает следующий квест.
    """
    for _ in range(MAX_SYNC_ROUNDS):
        await db.flush()
        facts = await load_facts(db, user.id)
        facts["xp"] = user.xp  # из сессии — view ещё не видит незакоммиченный XP
        changed = False

        # выдача; любая существующая запись = не выдаём повторно
        have = set(
            (await db.execute(select(QuestAssignment.quest_id).where(QuestAssignment.user_id == user.id))).scalars()
        )
        candidates = (
            await db.execute(
                select(Quest).where(
                    Quest.auto_assign.is_(True), Quest.is_active.is_(True), Quest.assignee_id.is_(None)
                )
            )
        ).scalars().all()
        for quest in candidates:
            if quest.id in have or not conditions_met(facts, quest.assign_conditions or []):
                continue
            if not quest.retro_credit and conditions_met(facts, quest.complete_conditions):
                continue  # уже выполнил — не про него
            res = await db.execute(
                pg_insert(QuestAssignment)
                .values(quest_id=quest.id, user_id=user.id, status="taken")
                .on_conflict_do_nothing(index_elements=["quest_id", "user_id"])
            )
            if res.rowcount:
                changed = True
                await log_event(db, user.id, "quest.auto_assigned", "quest", quest.id)

        # зачёт
        rows = (
            await db.execute(
                select(QuestAssignment, Quest)
                .join(Quest, Quest.id == QuestAssignment.quest_id)
                .where(
                    QuestAssignment.user_id == user.id,
                    QuestAssignment.status.in_(["taken", "submitted", "rejected"]),
                    Quest.complete_conditions.is_not(None),
                )
            )
        ).all()
        for assignment, quest in rows:
            if conditions_met(facts, quest.complete_conditions):
                assignment.status = "completed"
                assignment.updated_at = datetime.now(timezone.utc)
                user.xp += quest.xp_reward
                changed = True
                await log_event(db, user.id, "quest.auto_completed", "quest", quest.id, {"xp": quest.xp_reward})
        if not changed:
            break


async def sync_everyone(db: AsyncSession) -> int:
    """Раздача автоквестов всем подходящим: факты и существующие назначения
    читаются пачкой, вставка — одним INSERT. Зачёт выполненных при этом не
    делается — он случится при ближайшем действии юзера (вход, профиль)."""
    quests = (
        await db.execute(
            select(Quest).where(
                Quest.auto_assign.is_(True), Quest.is_active.is_(True), Quest.assignee_id.is_(None)
            )
        )
    ).scalars().all()
    if not quests:
        return 0
    facts = [dict(r) for r in (await db.execute(text("SELECT * FROM user_facts WHERE is_active"))).mappings()]
    existing = {
        (q, u)
        for q, u in (
            await db.execute(select(QuestAssignment.quest_id, QuestAssignment.user_id))
        ).all()
    }
    rows = []
    for quest in quests:
        for f in facts:
            if (quest.id, f["id"]) in existing:
                continue
            if not conditions_met(f, quest.assign_conditions or []):
                continue
            if not quest.retro_credit and conditions_met(f, quest.complete_conditions):
                continue
            rows.append({"quest_id": quest.id, "user_id": f["id"], "status": "taken"})
    if not rows:
        return 0
    await db.execute(
        pg_insert(QuestAssignment).on_conflict_do_nothing(index_elements=["quest_id", "user_id"]),
        rows,
    )
    return len(rows)


async def sync_everyone_background() -> None:
    """Фоновая раздача после создания автоквеста: своя сессия, свой коммит.
    Запрос на создание не ждёт обхода всех юзеров."""
    from db import SessionLocal

    async with SessionLocal() as db:
        await sync_everyone(db)
        await db.commit()




def _can_review(user: AppUser, quest: Quest) -> bool:
    return user.role == "admin" or quest.created_by == user.id


async def _quests_out(db: AsyncSession, quests: Sequence[Quest], me: AppUser) -> list[QuestOut]:
    """Список заданий за фиксированное число запросов вместо трёх на задание."""
    if not quests:
        return []
    ids = [q.id for q in quests]
    creators = dict(
        (
            await db.execute(
                select(AppUser.id, AppUser.name).where(AppUser.id.in_({q.created_by for q in quests}))
            )
        ).all()
    )
    takers = dict(
        (
            await db.execute(
                select(QuestAssignment.quest_id, func.count())
                .where(QuestAssignment.quest_id.in_(ids), QuestAssignment.status != "rejected")
                .group_by(QuestAssignment.quest_id)
            )
        ).all()
    )
    mine = dict(
        (
            await db.execute(
                select(QuestAssignment.quest_id, QuestAssignment.status).where(
                    QuestAssignment.quest_id.in_(ids), QuestAssignment.user_id == me.id
                )
            )
        ).all()
    )
    return [
        QuestOut(
            id=q.id,
            title=q.title,
            description=q.description,
            category=q.category,
            xp_reward=q.xp_reward,
            creator=creators.get(q.created_by, "—"),
            created_by=q.created_by,
            assignee_id=q.assignee_id,
            max_takers=q.max_takers,
            is_active=q.is_active,
            deadline=q.deadline,
            takers=takers.get(q.id, 0),
            complete_conditions=q.complete_conditions,
            auto_assign=q.auto_assign,
            assign_conditions=q.assign_conditions or [],
            retro_credit=q.retro_credit,
            my_status=mine.get(q.id),
        )
        for q in quests
    ]


async def _quest_out(db: AsyncSession, quest: Quest, me: AppUser) -> QuestOut:
    return (await _quests_out(db, [quest], me))[0]


async def _get_quest(db: AsyncSession, quest_id: uuid.UUID) -> Quest:
    quest = await db.get(Quest, quest_id)
    if quest is None:
        raise HTTPException(status_code=404, detail="Задание не найдено")
    return quest


@router.get("", response_model=list[QuestOut])
async def list_quests(
    me: Annotated[AppUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[QuestOut]:
    """Доска (активные общие) + мои персональные + созданные мной. Без записи."""
    stmt = (
        select(Quest)
        .where(
            or_(
                (Quest.assignee_id.is_(None)) & Quest.is_active.is_(True),
                Quest.assignee_id == me.id,
                Quest.created_by == me.id,
            )
        )
        .order_by(Quest.created_at.desc())
    )
    quests = (await db.execute(stmt.limit(limit).offset(offset))).scalars().all()
    return await _quests_out(db, quests, me)


@router.post("", response_model=QuestOut, status_code=201)
async def create_quest(
    body: QuestCreate,
    background: BackgroundTasks,
    me: Annotated[AppUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> QuestOut:
    allowed = CATEGORY_ROLES[body.category]
    if me.role not in allowed:
        raise HTTPException(
            status_code=403,
            detail=f"Категорию «{body.category}» могут создавать: {', '.join(sorted(allowed))}",
        )
    # сначала 422, потом 404
    if body.auto_assign and body.assignee_id is not None:
        raise HTTPException(status_code=422, detail="Автовыдача несовместима с персональным заданием")
    if body.complete_conditions is not None:
        validate_conditions(body.complete_conditions, "Условие выполнения")
    if body.auto_assign:
        validate_conditions(body.assign_conditions, "Условие выдачи")
    if body.assignee_id is not None:
        assignee = await db.get(AppUser, body.assignee_id)
        if assignee is None or not assignee.is_active:
            raise HTTPException(status_code=404, detail="Игрок не найден")
    quest = Quest(
        title=body.title,
        description=body.description,
        category=body.category,
        xp_reward=body.xp_reward,
        created_by=me.id,
        assignee_id=body.assignee_id,
        max_takers=body.max_takers,
        deadline=body.deadline,
        complete_conditions=(
            [c.model_dump() for c in body.complete_conditions] if body.complete_conditions is not None else None
        ),
        auto_assign=body.auto_assign,
        assign_conditions=[c.model_dump() for c in body.assign_conditions] if body.auto_assign else None,
        retro_credit=body.retro_credit,
    )
    db.add(quest)
    await db.flush()
    if body.assignee_id is not None:

        db.add(QuestAssignment(quest_id=quest.id, user_id=body.assignee_id, status="taken"))
    await log_event(db, me.id, "quest.create", "quest", quest.id, {"category": body.category})
    await db.commit()
    if body.auto_assign:
        # раздача всем — в фоне, запрос не ждёт обхода юзеров
        background.add_task(sync_everyone_background)
    return await _quest_out(db, quest, me)


@router.patch("/{quest_id}", response_model=QuestOut)
async def update_quest(
    quest_id: uuid.UUID,
    body: QuestUpdate,
    me: Annotated[AppUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> QuestOut:
    quest = await _get_quest(db, quest_id)
    if not _can_review(me, quest):
        raise HTTPException(status_code=403, detail="Только автор задания или админ")
    changes = body.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(quest, field, value)
    quest.updated_at = datetime.now(timezone.utc)
    await log_event(db, me.id, "quest.update", "quest", quest.id, {k: str(v) for k, v in changes.items()})
    await db.commit()
    return await _quest_out(db, quest, me)


@router.post("/{quest_id}/take", response_model=QuestOut)
async def take_quest(
    quest_id: uuid.UUID,
    me: Annotated[AppUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> QuestOut:
    quest = await _get_quest(db, quest_id)
    if not quest.is_active:
        raise HTTPException(status_code=409, detail="Задание уже снято с доски")
    if quest.assignee_id is not None and quest.assignee_id != me.id:
        raise HTTPException(status_code=403, detail="Это персональное задание другого игрока")
    existing = (
        await db.execute(
            select(QuestAssignment.id).where(
                QuestAssignment.quest_id == quest.id, QuestAssignment.user_id == me.id
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=409, detail="Задание уже у вас")
    if quest.max_takers is not None:
        takers = (
            await db.execute(
                select(func.count())
                .select_from(QuestAssignment)
                .where(QuestAssignment.quest_id == quest.id, QuestAssignment.status != "rejected")
            )
        ).scalar_one()
        if takers >= quest.max_takers:
            raise HTTPException(status_code=409, detail="Задание уже разобрали")
    db.add(QuestAssignment(quest_id=quest.id, user_id=me.id, status="taken"))
    await log_event(db, me.id, "quest.take", "quest", quest.id)
    await db.flush()
    # условие могло быть выполнено заранее — зачитываем сразу
    if quest.complete_conditions is not None:
        await sync_auto_quests(db, me)
    await db.commit()
    return await _quest_out(db, quest, me)


@router.post("/{quest_id}/sync", status_code=200)
async def sync_quest_for_everyone(
    quest_id: uuid.UUID,
    me: Annotated[AppUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Немедленно раздать автоквест всем подходящим активным юзерам (админ)."""
    if me.role != "admin":
        raise HTTPException(status_code=403, detail="Только админ")
    quest = await _get_quest(db, quest_id)
    if not quest.auto_assign:
        raise HTTPException(status_code=409, detail="У задания не включена автовыдача")
    assigned = await sync_everyone(db)
    await log_event(db, me.id, "quest.sync_all", "quest", quest.id, {"assigned": assigned})
    await db.commit()
    return {"assigned": assigned}


@router.post("/{quest_id}/submit", response_model=QuestOut)
async def submit_quest(
    quest_id: uuid.UUID,
    me: Annotated[AppUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> QuestOut:
    quest = await _get_quest(db, quest_id)
    assignment = (
        await db.execute(
            select(QuestAssignment).where(
                QuestAssignment.quest_id == quest.id, QuestAssignment.user_id == me.id
            )
        )
    ).scalar_one_or_none()
    if assignment is None:
        raise HTTPException(status_code=404, detail="Вы не брали это задание")
    if assignment.status == "completed":
        raise HTTPException(status_code=409, detail="Задание уже засчитано")
    if quest.complete_conditions is not None:
        raise HTTPException(status_code=409, detail="Это автоматическое задание — зачтётся само")
    assignment.status = "submitted"
    assignment.updated_at = datetime.now(timezone.utc)
    await log_event(db, me.id, "quest.submit", "quest", quest.id)
    await db.commit()
    return await _quest_out(db, quest, me)


@router.get("/{quest_id}/assignments", response_model=list[QuestAssignmentOut])
async def list_assignments(
    quest_id: uuid.UUID,
    me: Annotated[AppUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[QuestAssignmentOut]:
    quest = await _get_quest(db, quest_id)
    if not _can_review(me, quest):
        raise HTTPException(status_code=403, detail="Только автор задания или админ")
    rows = (
        await db.execute(
            select(QuestAssignment, AppUser.name)
            .join(AppUser, AppUser.id == QuestAssignment.user_id)
            .where(QuestAssignment.quest_id == quest.id)
            .order_by(QuestAssignment.created_at)
        )
    ).all()
    return [
        QuestAssignmentOut(id=a.id, user_id=a.user_id, user_name=name, status=a.status, updated_at=a.updated_at)
        for a, name in rows
    ]


async def _set_assignment_status(
    db: AsyncSession, me: AppUser, quest_id: uuid.UUID, assignment_id: uuid.UUID, status: str
) -> QuestAssignmentOut:
    quest = await _get_quest(db, quest_id)
    if not _can_review(me, quest):
        raise HTTPException(status_code=403, detail="Только автор задания или админ")
    assignment = await db.get(QuestAssignment, assignment_id)
    if assignment is None or assignment.quest_id != quest.id:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    player = await db.get(AppUser, assignment.user_id)
    if status == "completed":
        if assignment.status == "completed":
            raise HTTPException(status_code=409, detail="Уже засчитано")
        if player is not None:
            player.xp += quest.xp_reward
    assignment.status = status
    assignment.updated_at = datetime.now(timezone.utc)
    if status == "completed" and player is not None:
        await sync_auto_quests(db, player)  # XP мог открыть квесты с порогом
    await log_event(
        db, me.id, f"quest.{status}", "quest", quest.id,
        {"player": str(assignment.user_id), "xp": quest.xp_reward if status == "completed" else 0},
    )
    await db.commit()
    return QuestAssignmentOut(
        id=assignment.id,
        user_id=assignment.user_id,
        user_name=player.name if player else "—",
        status=assignment.status,
        updated_at=assignment.updated_at,
    )


@router.post("/{quest_id}/assignments/{assignment_id}/complete", response_model=QuestAssignmentOut)
async def complete_assignment(
    quest_id: uuid.UUID,
    assignment_id: uuid.UUID,
    me: Annotated[AppUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> QuestAssignmentOut:
    return await _set_assignment_status(db, me, quest_id, assignment_id, "completed")


@router.post("/{quest_id}/assignments/{assignment_id}/reject", response_model=QuestAssignmentOut)
async def reject_assignment(
    quest_id: uuid.UUID,
    assignment_id: uuid.UUID,
    me: Annotated[AppUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> QuestAssignmentOut:
    return await _set_assignment_status(db, me, quest_id, assignment_id, "rejected")
