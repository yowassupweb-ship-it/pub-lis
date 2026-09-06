import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from warehouse_models import ActivityLogEntry


async def log_activity(
    db: AsyncSession,
    actor_id: uuid.UUID | None,
    actor_name: str | None,
    action: str,
    entity: str,
    entity_id: uuid.UUID | None = None,
    payload: dict | None = None,
) -> None:
    """Аналог deps.log_event, но пишет в activity_log отдельной БД склада —
    общий журнал для всех устройств вместо прежнего per-browser clientLog."""
    db.add(
        ActivityLogEntry(
            actor_id=actor_id,
            actor_name=actor_name,
            action=action,
            entity=entity,
            entity_id=entity_id,
            payload=payload or {},
        )
    )
