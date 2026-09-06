from datetime import date, datetime, time, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from deps import require_staff
from warehouse_db import get_warehouse_db
from warehouse_models import ActivityLogEntry
from warehouse_schemas import ActivityLogOut

router = APIRouter(prefix="/api/warehouse/activity", tags=["warehouse"], dependencies=[Depends(require_staff)])


@router.get("", response_model=list[ActivityLogOut])
async def list_activity(
    db: Annotated[AsyncSession, Depends(get_warehouse_db)],
    date_from: Annotated[date | None, Query()] = None,
    date_to: Annotated[date | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=2000)] = 1000,
) -> list[ActivityLogEntry]:
    """Журнал действий склада/меню/заказов — общий для всех устройств
    (заменяет прежний per-browser localStorage clientLog)."""
    query = select(ActivityLogEntry)
    if date_from is not None:
        query = query.where(ActivityLogEntry.created_at >= datetime.combine(date_from, time.min, tzinfo=timezone.utc))
    if date_to is not None:
        query = query.where(ActivityLogEntry.created_at <= datetime.combine(date_to, time.max, tzinfo=timezone.utc))
    query = query.order_by(ActivityLogEntry.created_at.desc()).limit(limit)
    result = await db.execute(query)
    return list(result.scalars())
