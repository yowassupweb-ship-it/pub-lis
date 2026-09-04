"""Интеграционные тесты против настоящего Postgres.

Нужны: DATABASE_URL на тестовую базу с применёнными миграциями
(alembic upgrade head) и seed.py. Тесты создают своих юзеров с префиксом
`t-` и подчищают за собой.

    DATABASE_URL=postgresql://.../hitry_lis_test pytest -q
"""

import uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from db import SessionLocal
from main import app


@pytest_asyncio.fixture(loop_scope="session")
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture(loop_scope="session")
async def cleanup():
    """Удаляет тестовых юзеров/квесты после теста (по префиксу t-)."""
    created: dict[str, list[str]] = {"users": [], "quests": []}
    yield created
    async with SessionLocal() as db:
        for qid in created["quests"]:
            await db.execute(text("DELETE FROM quests WHERE id = :id"), {"id": qid})
        for tg in created["users"]:
            await db.execute(
                text("DELETE FROM audit_events WHERE actor_id IN (SELECT id FROM app_users WHERE telegram = :tg)"),
                {"tg": tg},
            )
            await db.execute(text("DELETE FROM app_users WHERE telegram = :tg"), {"tg": tg})
        await db.commit()


def fresh_handle() -> str:
    return f"t-{uuid.uuid4().hex[:10]}"


async def login(client: AsyncClient, login: str, password: str = "demo") -> AsyncClient:
    r = await client.post("/api/auth/login", json={"login": login, "password": password})
    assert r.status_code == 200, r.text
    return client


async def register(client: AsyncClient, cleanup, name: str = "Тест") -> dict:
    tg = fresh_handle()
    cleanup["users"].append(tg)
    r = await client.post("/api/auth/register", json={"name": name, "telegram": tg, "password": "secret9"})
    assert r.status_code == 201, r.text
    return r.json()
