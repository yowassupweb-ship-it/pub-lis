from datetime import date, datetime, time, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_db
from deps import require_staff
from models import AppUser, AuditEvent
from schemas import AuditEventOut

router = APIRouter(prefix="/api/audit-events", tags=["audit"], dependencies=[Depends(require_staff)])


@router.get("", response_model=list[AuditEventOut])
async def list_audit_events(
    db: Annotated[AsyncSession, Depends(get_db)],
    date_from: Annotated[date | None, Query()] = None,
    date_to: Annotated[date | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=1000)] = 500,
) -> list[AuditEventOut]:
    """Журнал действий персонала — вкладка «Действия». Читает ту же таблицу,
    что пишут log_event() во всех роутерах (гости, столы, мероприятия,
    пользователи, квесты, игры)."""
    query = select(AuditEvent, AppUser.name).outerjoin(AppUser, AppUser.id == AuditEvent.actor_id)
    if date_from is not None:
        query = query.where(AuditEvent.created_at >= datetime.combine(date_from, time.min, tzinfo=timezone.utc))
    if date_to is not None:
        query = query.where(AuditEvent.created_at <= datetime.combine(date_to, time.max, tzinfo=timezone.utc))
    query = query.order_by(AuditEvent.created_at.desc()).limit(limit)
    rows = (await db.execute(query)).all()
    return [
        AuditEventOut(
            id=event.id,
            actor_id=event.actor_id,
            actor_name=actor_name,
            action=event.action,
            entity=event.entity,
            entity_id=event.entity_id,
            payload=event.payload,
            created_at=event.created_at,
        )
        for event, actor_name in rows
    ]
