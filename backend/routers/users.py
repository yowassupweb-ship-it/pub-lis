import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_db
from deps import log_event, require_admin, require_game_manager
from models import AppUser, Game, GameBooking, UserSession
from schemas import UserBookingOut, UserCreate, UserDetail, UserOut, UserUpdate
from security import hash_password

router = APIRouter(prefix="/api/users", tags=["users"], dependencies=[Depends(require_admin)])

# Профиль игрока для ГМа и менеджмента — посмотреть, кто записался
profile_router = APIRouter(prefix="/api/users", tags=["users"])


@profile_router.get("/{user_id}", response_model=UserDetail)
async def get_user_detail(
    user_id: uuid.UUID,
    viewer: Annotated[AppUser, Depends(require_game_manager)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserDetail:
    user = await db.get(AppUser, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    rows = (
        await db.execute(
            select(GameBooking, Game.title, Game.starts_at)
            .join(Game, Game.id == GameBooking.game_id)
            .where(GameBooking.user_id == user.id)
            .order_by(Game.starts_at.desc())
        )
    ).all()
    return UserDetail(
        id=user.id,
        name=user.name,
        email=user.email,
        role=user.role,
        is_active=user.is_active,
        phone=user.phone,
        telegram=user.telegram,
        title=user.title,
        avatar=user.avatar,
        created_at=user.created_at,
        bookings=[
            UserBookingOut(game_id=b.game_id, game_title=title, starts_at=starts, status=b.status)
            for b, title, starts in rows
        ],
    )


@router.get("", response_model=list[UserOut])
async def list_users(
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[AppUser]:
    result = await db.execute(select(AppUser).order_by(AppUser.created_at).limit(limit).offset(offset))
    return list(result.scalars())


@router.post("", response_model=UserOut, status_code=201)
async def create_user(
    body: UserCreate,
    admin: Annotated[AppUser, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AppUser:
    email = body.email.lower()
    exists = await db.execute(select(AppUser.id).where(AppUser.email == email))
    if exists.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="Email уже занят")
    user = AppUser(
        name=body.name,
        email=email,
        role=body.role,
        password_hash=hash_password(body.password),
    )
    db.add(user)
    await db.flush()
    await log_event(db, admin.id, "user.create", "user", user.id, {"role": body.role})
    await db.commit()
    return user


@router.patch("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: uuid.UUID,
    body: UserUpdate,
    admin: Annotated[AppUser, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AppUser:
    user = await db.get(AppUser, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    changes: dict = {}
    if body.name is not None:
        user.name = changes["name"] = body.name
    if body.role is not None:
        user.role = changes["role"] = body.role
    if body.is_active is not None:
        user.is_active = changes["is_active"] = body.is_active
    if body.password is not None:
        user.password_hash = hash_password(body.password)
        changes["password"] = "changed"
    if body.title is not None:
        user.title = changes["title"] = body.title.strip() or None
    user.updated_at = datetime.now(timezone.utc)
    if "role" in changes or "title" in changes:
        from routers.quests import sync_auto_quests  # роль/титул могут открыть квесты

        await sync_auto_quests(db, user)
    await log_event(db, admin.id, "user.update", "user", user.id, changes)
    await db.commit()
    return user


@router.post("/{user_id}/revoke-sessions", status_code=204)
async def revoke_sessions(
    user_id: uuid.UUID,
    admin: Annotated[AppUser, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    user = await db.get(AppUser, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    await db.execute(
        update(UserSession)
        .where(UserSession.user_id == user_id, UserSession.revoked_at.is_(None))
        .values(revoked_at=datetime.now(timezone.utc))
    )
    await log_event(db, admin.id, "sessions.revoke", "user", user_id)
    await db.commit()
