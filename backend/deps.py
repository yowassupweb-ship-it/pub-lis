import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_db
from models import AppUser, AuditEvent, UserSession
from security import hash_token

COOKIE_NAME = "sid"


async def get_current_user(
    request: Request, db: Annotated[AsyncSession, Depends(get_db)]
) -> AppUser:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Не авторизован")
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(AppUser)
        .join(UserSession, UserSession.user_id == AppUser.id)
        .where(
            UserSession.token_hash == hash_token(token),
            UserSession.revoked_at.is_(None),
            UserSession.expires_at > now,
            AppUser.is_active.is_(True),
        )
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=401, detail="Не авторизован")
    return user


STAFF_ROLES = {"bartender", "manager", "admin"}
GAME_MANAGER_ROLES = {"gamemaster", "manager", "admin"}


async def get_optional_user(
    request: Request, db: Annotated[AsyncSession, Depends(get_db)]
) -> AppUser | None:
    try:
        return await get_current_user(request, db)
    except HTTPException:
        return None


async def require_game_manager(
    user: Annotated[AppUser, Depends(get_current_user)]
) -> AppUser:
    if user.role not in GAME_MANAGER_ROLES:
        raise HTTPException(status_code=403, detail="Требуется роль gamemaster, manager или admin")
    return user


async def require_admin(
    user: Annotated[AppUser, Depends(get_current_user)]
) -> AppUser:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Требуется роль admin")
    return user


async def require_staff(
    user: Annotated[AppUser, Depends(get_current_user)]
) -> AppUser:
    """Служебная часть (склад, внутренняя система): бармен, менеджер, админ."""
    if user.role not in STAFF_ROLES:
        raise HTTPException(status_code=403, detail="Доступно только персоналу")
    return user


async def log_event(
    db: AsyncSession,
    actor_id: uuid.UUID | None,
    action: str,
    entity: str,
    entity_id: uuid.UUID | None = None,
    payload: dict | None = None,
) -> None:
    db.add(
        AuditEvent(
            actor_id=actor_id,
            action=action,
            entity=entity,
            entity_id=entity_id,
            payload=payload or {},
        )
    )
