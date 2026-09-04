"""Чистка разрастающихся таблиц. Запускать по расписанию (cron/systemd timer):

    docker compose -f docker-compose.prod.yml exec -T api python cleanup.py

Аудит старше AUDIT_KEEP_DAYS и мёртвые сессии удаляются; VACUUM оставляем
автовакууму.
"""

import asyncio
import os

from sqlalchemy import text

from db import SessionLocal

AUDIT_KEEP_DAYS = int(os.getenv("AUDIT_KEEP_DAYS", "90"))
LOGIN_ATTEMPTS_KEEP_DAYS = 7


async def main() -> None:
    async with SessionLocal() as db:
        sessions = (
            await db.execute(
                text(
                    "DELETE FROM user_sessions "
                    "WHERE expires_at < now() OR revoked_at < now() - interval '7 days'"
                )
            )
        ).rowcount
        audit = (
            await db.execute(
                text("DELETE FROM audit_events WHERE created_at < now() - make_interval(days => :days)"),
                {"days": AUDIT_KEEP_DAYS},
            )
        ).rowcount
        attempts = (
            await db.execute(
                text("DELETE FROM login_attempts WHERE updated_at < now() - make_interval(days => :days)"),
                {"days": LOGIN_ATTEMPTS_KEEP_DAYS},
            )
        ).rowcount
        await db.commit()
        print(f"сессий: {sessions}, аудита: {audit}, попыток входа: {attempts}")


if __name__ == "__main__":
    asyncio.run(main())
