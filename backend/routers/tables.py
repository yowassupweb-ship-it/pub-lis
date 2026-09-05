import uuid
from datetime import date, datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_db
from deps import log_event, require_staff
from models import AppUser, FloorMap, TableBooking
from schemas import (
    FloorMapCreate,
    FloorMapLayoutUpdate,
    FloorMapMeta,
    FloorMapOut,
    TableBookingCreate,
    TableBookingOut,
    TableBookingUpdate,
)

router = APIRouter(prefix="/api/floor-maps", tags=["tables"], dependencies=[Depends(require_staff)])


async def _get_map(db: AsyncSession, map_id: uuid.UUID) -> FloorMap:
    floor_map = await db.get(FloorMap, map_id)
    if floor_map is None:
        raise HTTPException(status_code=404, detail="Карта зала не найдена")
    return floor_map


@router.get("", response_model=list[FloorMapMeta])
async def list_maps(db: Annotated[AsyncSession, Depends(get_db)]) -> list[FloorMap]:
    result = await db.execute(select(FloorMap).order_by(FloorMap.created_at))
    return list(result.scalars())


@router.post("", response_model=FloorMapOut, status_code=201)
async def create_map(
    body: FloorMapCreate,
    staff: Annotated[AppUser, Depends(require_staff)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FloorMap:
    floor_map = FloorMap(name=body.name)
    db.add(floor_map)
    await db.flush()
    await log_event(db, staff.id, "floor_map.create", "floor_map", floor_map.id)
    await db.commit()
    return floor_map


@router.get("/{map_id}", response_model=FloorMapOut)
async def get_map(map_id: uuid.UUID, db: Annotated[AsyncSession, Depends(get_db)]) -> FloorMap:
    return await _get_map(db, map_id)


@router.put("/{map_id}", response_model=FloorMapOut)
async def update_map_layout(
    map_id: uuid.UUID,
    body: FloorMapLayoutUpdate,
    staff: Annotated[AppUser, Depends(require_staff)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FloorMap:
    floor_map = await _get_map(db, map_id)
    floor_map.layout = body.layout
    floor_map.updated_at = datetime.now(timezone.utc)
    await log_event(db, staff.id, "floor_map.update_layout", "floor_map", floor_map.id)
    await db.commit()
    return floor_map


@router.delete("/{map_id}", status_code=204)
async def delete_map(
    map_id: uuid.UUID,
    staff: Annotated[AppUser, Depends(require_staff)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    floor_map = await _get_map(db, map_id)
    await db.delete(floor_map)
    await log_event(db, staff.id, "floor_map.delete", "floor_map", map_id)
    await db.commit()


@router.get("/{map_id}/bookings", response_model=list[TableBookingOut])
async def list_bookings(
    map_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    date_from: Annotated[date | None, Query()] = None,
    date_to: Annotated[date | None, Query()] = None,
) -> list[TableBooking]:
    await _get_map(db, map_id)
    query = select(TableBooking).where(TableBooking.map_id == map_id)
    if date_from is not None:
        query = query.where(TableBooking.booking_date >= date_from)
    if date_to is not None:
        query = query.where(TableBooking.booking_date <= date_to)
    result = await db.execute(query.order_by(TableBooking.booking_date, TableBooking.time_start))
    return list(result.scalars())


@router.post("/{map_id}/bookings", response_model=TableBookingOut, status_code=201)
async def create_booking(
    map_id: uuid.UUID,
    body: TableBookingCreate,
    staff: Annotated[AppUser, Depends(require_staff)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TableBooking:
    await _get_map(db, map_id)
    booking = TableBooking(map_id=map_id, **body.model_dump())
    db.add(booking)
    await db.flush()
    await log_event(db, staff.id, "table_booking.create", "table_booking", booking.id)
    await db.commit()
    return booking


@router.patch("/{map_id}/bookings/{booking_id}", response_model=TableBookingOut)
async def update_booking(
    map_id: uuid.UUID,
    booking_id: uuid.UUID,
    body: TableBookingUpdate,
    staff: Annotated[AppUser, Depends(require_staff)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TableBooking:
    booking = await db.get(TableBooking, booking_id)
    if booking is None or booking.map_id != map_id:
        raise HTTPException(status_code=404, detail="Бронь не найдена")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(booking, field, value)
    booking.updated_at = datetime.now(timezone.utc)
    await log_event(db, staff.id, "table_booking.update", "table_booking", booking.id)
    await db.commit()
    return booking


@router.delete("/{map_id}/bookings/{booking_id}", status_code=204)
async def delete_booking(
    map_id: uuid.UUID,
    booking_id: uuid.UUID,
    staff: Annotated[AppUser, Depends(require_staff)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    booking = await db.get(TableBooking, booking_id)
    if booking is None or booking.map_id != map_id:
        raise HTTPException(status_code=404, detail="Бронь не найдена")
    await db.delete(booking)
    await log_event(db, staff.id, "table_booking.delete", "table_booking", booking_id)
    await db.commit()
