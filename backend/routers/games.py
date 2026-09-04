import uuid
from datetime import date, datetime, timedelta, timezone
from collections.abc import Sequence
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy import delete, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_db
from deps import (
    get_current_user,
    get_optional_user,
    log_event,
    require_admin,
    require_game_manager,
)
from models import AppUser, Game, GameBooking
from schemas import BookingOut, GameCreate, GameOut, GameUpdate

router = APIRouter(prefix="/api/games", tags=["games"])

BAR_TZ = timezone(timedelta(hours=3))


def _normalize_starts(starts_at: datetime) -> datetime:
    """Время без таймзоны считаем временем бара (Москва)."""
    return starts_at if starts_at.tzinfo else starts_at.replace(tzinfo=BAR_TZ)


def _validate_schedule(starts_at: datetime, duration_hours: int) -> datetime:
    """Игра должна попадать в часы работы: пн–чт 15:00–24:00, пт–вс 15:00–04:00."""
    starts = _normalize_starts(starts_at)
    if starts < datetime.now(timezone.utc):
        raise HTTPException(status_code=422, detail="Время игры уже в прошлом")
    local = starts.astimezone(BAR_TZ)
    day, hour = local.weekday(), local.hour
    if 4 <= hour < 15:
        raise HTTPException(status_code=422, detail="Бар работает с 15:00 — выбери время позже")
    if hour < 4:  # ночь — хвост предыдущего дня
        day = (day - 1) % 7
        hour += 24
    end_limit = 24 if day <= 3 else 28
    if hour + duration_hours > end_limit:
        raise HTTPException(
            status_code=422,
            detail="Игра выходит за время работы бара (пн–чт до 00:00, пт–вс до 04:00)",
        )
    return starts


async def _game_out(db: AsyncSession, game: Game, me: AppUser | None) -> GameOut:
    return (await _games_out(db, [game], me))[0]


async def _get_game(db: AsyncSession, game_id: uuid.UUID) -> Game:
    game = await db.get(Game, game_id)
    if game is None:
        raise HTTPException(status_code=404, detail="Игра не найдена")
    return game


def _can_manage(user: AppUser, game: Game) -> bool:
    return user.role in {"manager", "admin"} or game.master_id == user.id


async def _lock_user_bookings(db: AsyncSession, user_id: uuid.UUID) -> None:
    """Сериализуем брони одного игрока: два параллельных запроса на
    пересекающиеся игры не пройдут проверку одновременно. Лок держится до
    конца транзакции; в проде это подстраховано EXCLUDE-констрейнтом."""
    await db.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"), {"key": f"booking:{user_id}"}
    )


async def _overlapping_game(db: AsyncSession, user_id: uuid.UUID, game: Game) -> Game | None:
    """Игра, на которую игрок уже записан (заявка или подтверждено) и которая
    пересекается по времени с `game`. ГМу вести две игры разрешено — проверка
    только для игроков. Записей у одного игрока мало — считаем в Python."""
    rows = (
        await db.execute(
            select(Game)
            .join(GameBooking, GameBooking.game_id == Game.id)
            .where(
                GameBooking.user_id == user_id,
                GameBooking.status.in_(["pending", "approved"]),
                Game.id != game.id,
                Game.is_cancelled.is_(False),
                Game.status == "approved",
            )
        )
    ).scalars().all()
    start = _normalize_starts(game.starts_at)
    end = start + timedelta(hours=game.duration_hours)
    for other in rows:
        o_start = _normalize_starts(other.starts_at)
        o_end = o_start + timedelta(hours=other.duration_hours)
        if o_start < end and o_end > start:
            return other
    return None


async def _games_out(db: AsyncSession, games: Sequence[Game], me: AppUser | None) -> list[GameOut]:
    """Список игр за фиксированное число запросов: мастера, счётчики и свои
    брони собираются пачкой, а не по одному на игру."""
    if not games:
        return []
    ids = [g.id for g in games]
    master_ids = {g.master_id for g in games}
    masters = dict(
        (await db.execute(select(AppUser.id, AppUser.name).where(AppUser.id.in_(master_ids)))).all()
    )
    taken = dict(
        (
            await db.execute(
                select(GameBooking.game_id, func.count())
                .where(GameBooking.game_id.in_(ids), GameBooking.status == "approved")
                .group_by(GameBooking.game_id)
            )
        ).all()
    )
    mine: dict[uuid.UUID, str] = {}
    if me is not None:
        mine = dict(
            (
                await db.execute(
                    select(GameBooking.game_id, GameBooking.status).where(
                        GameBooking.game_id.in_(ids), GameBooking.user_id == me.id
                    )
                )
            ).all()
        )
    return [
        GameOut(
            id=g.id,
            title=g.title,
            description=g.description,
            master=masters.get(g.master_id, "—"),
            master_id=g.master_id,
            starts_at=g.starts_at,
            duration_hours=g.duration_hours,
            seats_total=g.seats_total,
            seats_taken=taken.get(g.id, 0),
            is_cancelled=g.is_cancelled,
            status=g.status,
            my_booking_status=mine.get(g.id),
        )
        for g in games
    ]


@router.get("", response_model=list[GameOut])
async def list_games(
    db: Annotated[AsyncSession, Depends(get_db)],
    me: Annotated[AppUser | None, Depends(get_optional_user)],
    from_: Annotated[date | None, Query(alias="from")] = None,
    to: Annotated[date | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 200,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[GameOut]:
    stmt = select(Game).where(Game.is_cancelled.is_(False)).order_by(Game.starts_at)
    # approved — всем; pending — менеджменту и автору; rejected — менеджменту и автору
    if me is None:
        stmt = stmt.where(Game.status == "approved")
    elif me.role in {"manager", "admin"}:
        pass  # всё, включая rejected — можно передумать
    elif me.role == "gamemaster":
        stmt = stmt.where(or_(Game.status == "approved", Game.master_id == me.id))
    else:
        stmt = stmt.where(Game.status == "approved")
    if from_ is not None:
        stmt = stmt.where(Game.starts_at >= datetime(from_.year, from_.month, from_.day, tzinfo=timezone.utc))
    if to is not None:
        stmt = stmt.where(Game.starts_at < datetime(to.year, to.month, to.day, 23, 59, tzinfo=timezone.utc))
    games = (await db.execute(stmt.limit(limit).offset(offset))).scalars().all()
    return await _games_out(db, games, me)


@router.get("/{game_id}", response_model=GameOut)
async def get_game(
    game_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    me: Annotated[AppUser | None, Depends(get_optional_user)],
) -> GameOut:
    game = await _get_game(db, game_id)
    visible = not game.is_cancelled and game.status == "approved"
    if not visible and (me is None or not _can_manage(me, game)):
        raise HTTPException(status_code=404, detail="Игра не найдена")
    return await _game_out(db, game, me)


@router.post("", response_model=GameOut, status_code=201)
async def create_game(
    body: GameCreate,
    user: Annotated[AppUser, Depends(require_game_manager)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> GameOut:
    master_id = user.id
    if body.master_id is not None and body.master_id != user.id:
        if user.role not in {"manager", "admin"}:
            raise HTTPException(status_code=403, detail="ГМ создаёт игры только за себя")
        master = await db.get(AppUser, body.master_id)
        if master is None or not master.is_active:
            raise HTTPException(status_code=404, detail="Мастер не найден")
        master_id = body.master_id
    starts = _validate_schedule(body.starts_at, body.duration_hours)
    # ГМ подаёт заявку, админ публикует сразу
    status = "approved" if user.role == "admin" else "pending"
    game = Game(
        title=body.title,
        description=body.description,
        master_id=master_id,
        starts_at=starts,
        duration_hours=body.duration_hours,
        seats_total=body.seats_total,
        status=status,
    )
    db.add(game)
    await db.flush()
    await log_event(db, user.id, "game.request", "game", game.id, {"title": body.title, "status": status})
    await db.commit()
    return await _game_out(db, game, user)


@router.patch("/{game_id}", response_model=GameOut)
async def update_game(
    game_id: uuid.UUID,
    body: GameUpdate,
    user: Annotated[AppUser, Depends(require_game_manager)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> GameOut:
    game = await _get_game(db, game_id)
    if not _can_manage(user, game):
        raise HTTPException(status_code=403, detail="Можно править только свои игры")
    changes = body.model_dump(exclude_unset=True)
    if "starts_at" in changes or "duration_hours" in changes:
        changes_starts = changes.get("starts_at", game.starts_at)
        changes["starts_at"] = _validate_schedule(
            changes_starts, changes.get("duration_hours", game.duration_hours)
        )
    for field, value in changes.items():
        setattr(game, field, value)
    game.updated_at = datetime.now(timezone.utc)
    await log_event(db, user.id, "game.update", "game", game.id, {k: str(v) for k, v in changes.items()})
    await db.commit()
    return await _game_out(db, game, user)


@router.delete("/{game_id}", status_code=204)
async def delete_game(
    game_id: uuid.UUID,
    admin: Annotated[AppUser, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    game = await _get_game(db, game_id)
    await log_event(db, admin.id, "game.delete", "game", game.id, {"title": game.title})
    await db.delete(game)  # брони — каскадом
    await db.commit()


@router.post("/{game_id}/approve", response_model=GameOut)
async def approve_game(
    game_id: uuid.UUID,
    admin: Annotated[AppUser, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> GameOut:
    game = await _get_game(db, game_id)
    game.status = "approved"
    game.updated_at = datetime.now(timezone.utc)
    await log_event(db, admin.id, "game.approve", "game", game.id)
    await db.commit()
    return await _game_out(db, game, admin)


@router.post("/{game_id}/reject", response_model=GameOut)
async def reject_game(
    game_id: uuid.UUID,
    admin: Annotated[AppUser, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> GameOut:
    game = await _get_game(db, game_id)
    game.status = "rejected"
    game.updated_at = datetime.now(timezone.utc)
    await log_event(db, admin.id, "game.reject", "game", game.id)
    await db.commit()
    return await _game_out(db, game, admin)


@router.post("/{game_id}/book", response_model=GameOut)
async def request_seat(
    game_id: uuid.UUID,
    user: Annotated[AppUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> GameOut:
    game = await _get_game(db, game_id)
    if game.is_cancelled or game.status != "approved":
        raise HTTPException(status_code=409, detail="Игра недоступна для записи")
    if game.starts_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=409, detail="Игра уже началась")
    await _lock_user_bookings(db, user.id)
    existing = (
        await db.execute(
            select(GameBooking.id).where(
                GameBooking.game_id == game.id, GameBooking.user_id == user.id
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=409, detail="Заявка уже подана")
    clash = await _overlapping_game(db, user.id, game)
    if clash is not None:
        raise HTTPException(
            status_code=409,
            detail=f"В это время вы уже записаны на «{clash.title}» — сначала отмените ту запись",
        )
    approved = (
        await db.execute(
            select(func.count())
            .select_from(GameBooking)
            .where(GameBooking.game_id == game.id, GameBooking.status == "approved")
        )
    ).scalar_one()
    if approved >= game.seats_total:
        raise HTTPException(status_code=409, detail="Мест не осталось")
    db.add(GameBooking(game_id=game.id, user_id=user.id, status="pending"))
    await log_event(db, user.id, "booking.request", "game", game.id)
    try:
        await db.commit()
    except IntegrityError:  # сработал EXCLUDE: успели записаться на пересекающуюся игру
        await db.rollback()
        raise HTTPException(status_code=409, detail="В это время вы уже записаны на другую игру")
    return await _game_out(db, game, user)


@router.delete("/{game_id}/book", response_model=GameOut)
async def cancel_booking(
    game_id: uuid.UUID,
    user: Annotated[AppUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> GameOut:
    game = await _get_game(db, game_id)
    result = await db.execute(
        delete(GameBooking).where(GameBooking.game_id == game.id, GameBooking.user_id == user.id)
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Заявки не было")
    await log_event(db, user.id, "booking.cancel", "game", game.id)
    await db.commit()
    return await _game_out(db, game, user)


@router.get("/{game_id}/bookings", response_model=list[BookingOut])
async def list_bookings(
    game_id: uuid.UUID,
    user: Annotated[AppUser, Depends(require_game_manager)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[BookingOut]:
    game = await _get_game(db, game_id)
    if not _can_manage(user, game):
        raise HTTPException(status_code=403, detail="Только ГМ игры или менеджер/админ")
    rows = (
        await db.execute(
            select(GameBooking, AppUser.name, AppUser.title)
            .join(AppUser, AppUser.id == GameBooking.user_id)
            .where(GameBooking.game_id == game.id)
            .order_by(GameBooking.created_at)
        )
    ).all()
    return [
        BookingOut(
            id=b.id,
            user_id=b.user_id,
            user_name=name,
            user_title=title,
            status=b.status,
            created_at=b.created_at,
        )
        for b, name, title in rows
    ]


async def _set_booking_status(
    db: AsyncSession, user: AppUser, game_id: uuid.UUID, booking_id: uuid.UUID, status: str
) -> BookingOut:
    game = await _get_game(db, game_id)
    if not _can_manage(user, game):
        raise HTTPException(status_code=403, detail="Только ГМ игры или менеджер/админ")
    booking = await db.get(GameBooking, booking_id)
    if booking is None or booking.game_id != game.id:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    if status == "approved" and booking.status != "approved":
        await _lock_user_bookings(db, booking.user_id)
        # пока заявка лежала, игрок мог записаться на другую игру в это время
        clash = await _overlapping_game(db, booking.user_id, game)
        if clash is not None:
            raise HTTPException(
                status_code=409,
                detail=f"Игрок уже записан на «{clash.title}» в это время — одобрить нельзя",
            )
    # сверх seats_total — можно, овербукинг на совести ГМа
    booking.status = status
    player = await db.get(AppUser, booking.user_id)
    await log_event(db, user.id, f"booking.{status}", "game", game.id, {"player": str(booking.user_id)})
    await db.commit()
    return BookingOut(
        id=booking.id,
        user_id=booking.user_id,
        user_name=player.name if player else "—",
        user_title=player.title if player else None,
        status=booking.status,
        created_at=booking.created_at,
    )


@router.post("/{game_id}/bookings/{booking_id}/approve", response_model=BookingOut)
async def approve_booking(
    game_id: uuid.UUID,
    booking_id: uuid.UUID,
    user: Annotated[AppUser, Depends(require_game_manager)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BookingOut:
    return await _set_booking_status(db, user, game_id, booking_id, "approved")


@router.post("/{game_id}/bookings/{booking_id}/reject", response_model=BookingOut)
async def reject_booking(
    game_id: uuid.UUID,
    booking_id: uuid.UUID,
    user: Annotated[AppUser, Depends(require_game_manager)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BookingOut:
    return await _set_booking_status(db, user, game_id, booking_id, "rejected")
