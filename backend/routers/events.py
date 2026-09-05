import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_db
from deps import log_event, require_staff
from models import AppUser, Event
from schemas import EventCreate, EventOut

router = APIRouter(prefix="/api/events", tags=["events"], dependencies=[Depends(require_staff)])


@router.get("", response_model=list[EventOut])
async def list_events(
    db: Annotated[AsyncSession, Depends(get_db)],
    date_from: Annotated[date | None, Query()] = None,
    date_to: Annotated[date | None, Query()] = None,
) -> list[Event]:
    query = select(Event)
    if date_from is not None:
        query = query.where(Event.date_to >= date_from)
    if date_to is not None:
        query = query.where(Event.date_from <= date_to)
    result = await db.execute(query.order_by(Event.date_from))
    return list(result.scalars())


@router.post("", response_model=EventOut, status_code=201)
async def create_event(
    body: EventCreate,
    staff: Annotated[AppUser, Depends(require_staff)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Event:
    if body.date_to < body.date_from:
        raise HTTPException(status_code=422, detail="Дата окончания раньше даты начала")
    event = Event(
        name=body.name,
        participants_count=body.participants_count,
        date_from=body.date_from,
        date_to=body.date_to,
    )
    db.add(event)
    await db.flush()
    await log_event(db, staff.id, "event.create", "event", event.id)
    await db.commit()
    return event


@router.delete("/{event_id}", status_code=204)
async def delete_event(
    event_id: uuid.UUID,
    staff: Annotated[AppUser, Depends(require_staff)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    event = await db.get(Event, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Мероприятие не найдено")
    await db.delete(event)
    await log_event(db, staff.id, "event.delete", "event", event_id)
    await db.commit()
