import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_db
from deps import log_event, require_staff
from models import AppUser
from routers.auth import _telegram_taken, normalize_telegram
from schemas import GuestCreate, GuestUpdate, UserOut

# Гости бара — те же app_users с ролью user, но раздел живёт отдельно от
# админской /api/users (там полноценные аккаунты персонала с ролями и паролем).
router = APIRouter(prefix="/api/guests", tags=["guests"], dependencies=[Depends(require_staff)])


@router.get("", response_model=list[UserOut])
async def list_guests(
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[AppUser]:
    result = await db.execute(
        select(AppUser)
        .where(AppUser.role == "user")
        .order_by(AppUser.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars())


@router.post("", response_model=UserOut, status_code=201)
async def create_guest(
    body: GuestCreate,
    staff: Annotated[AppUser, Depends(require_staff)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AppUser:
    telegram = normalize_telegram(body.telegram) if body.telegram else None
    if telegram and await _telegram_taken(db, telegram):
        raise HTTPException(status_code=409, detail="Такой телеграм уже занят")
    guest = AppUser(name=body.name, phone=body.phone, telegram=telegram, comment=body.comment, role="user")
    db.add(guest)
    await db.flush()
    await log_event(db, staff.id, "guest.create", "user", guest.id)
    await db.commit()
    return guest


async def _get_guest(db: AsyncSession, guest_id: uuid.UUID) -> AppUser:
    guest = await db.get(AppUser, guest_id)
    if guest is None or guest.role != "user":
        raise HTTPException(status_code=404, detail="Гость не найден")
    return guest


@router.patch("/{guest_id}", response_model=UserOut)
async def update_guest(
    guest_id: uuid.UUID,
    body: GuestUpdate,
    staff: Annotated[AppUser, Depends(require_staff)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AppUser:
    guest = await _get_guest(db, guest_id)
    changes = body.model_dump(exclude_unset=True)
    if changes.get("telegram"):
        changes["telegram"] = normalize_telegram(changes["telegram"])
        if changes["telegram"] != (guest.telegram or "") and await _telegram_taken(
            db, changes["telegram"], except_id=guest.id
        ):
            raise HTTPException(status_code=409, detail="Такой телеграм уже занят")
    for field, value in changes.items():
        setattr(guest, field, value)
    guest.updated_at = datetime.now(timezone.utc)
    await log_event(db, staff.id, "guest.update", "user", guest.id, changes)
    await db.commit()
    return guest


@router.delete("/{guest_id}", status_code=204)
async def delete_guest(
    guest_id: uuid.UUID,
    staff: Annotated[AppUser, Depends(require_staff)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    guest = await _get_guest(db, guest_id)
    await db.delete(guest)
    await log_event(db, staff.id, "guest.delete", "user", guest_id)
    await db.commit()
