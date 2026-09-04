import asyncio

import pytest
from httpx import ASGITransport, AsyncClient

from main import app
from tests.conftest import login, register

# один loop на сессию — пул движка привязан к loop'у, per-test падает «attached to a different loop»
pytestmark = pytest.mark.asyncio(loop_scope="session")


async def _admin(client):
    return await login(client, "admin@lis.bar")


async def _create(client, cleanup, **payload):
    body = {"title": "t-квест", "category": "general", "xp_reward": 10, **payload}
    r = await client.post("/api/quests", json=body)
    assert r.status_code == 201, r.text
    q = r.json()
    cleanup["quests"].append(q["id"])
    return q


async def _my(client, title):
    r = await client.get("/api/quests")
    assert r.status_code == 200
    return next((q for q in r.json() if q["title"] == title), None)


async def test_validation_rejects_bad_conditions(client, cleanup):
    await _admin(client)
    bad = [
        {"auto_assign": True, "assign_conditions": [{"field": "role", "op": "gte", "value": "5"}]},
        {"auto_assign": True, "assign_conditions": [{"field": "role", "op": "eq"}]},
        {"complete_conditions": [{"field": "password_hash", "op": "filled"}]},
        {"auto_assign": True, "assignee_id": "00000000-0000-4000-8000-000000000000"},
    ]
    for payload in bad:
        r = await client.post("/api/quests", json={"title": "x", "category": "general", "xp_reward": 1, **payload})
        assert r.status_code == 422, (payload, r.text)


async def test_registration_gets_profile_quests_and_autocompletes(client, cleanup):
    await _admin(client)
    q = await _create(
        client, cleanup, title="t-телефон", auto_assign=True,
        complete_conditions=[{"field": "phone", "op": "filled"}], xp_reward=50,
    )
    player = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    async with player:
        me = await register(player, cleanup)
        assert me["xp"] == 0
        assert (await _my(player, "t-телефон"))["my_status"] == "taken"
        assert (await player.post(f"/api/quests/{q['id']}/submit")).status_code == 409
        # в базе могут быть чужие квесты на телефон — смотрим статусы и дельту, не абсолют
        r = await player.patch("/api/auth/me", json={"phone": "+7 900 000-00-00"})
        xp_after = r.json()["xp"]
        assert xp_after >= 50
        assert (await _my(player, "t-телефон"))["my_status"] == "completed"
        r = await player.patch("/api/auth/me", json={"phone": "+7 900 000-00-01"})
        assert r.json()["xp"] == xp_after


async def test_assign_conditions_and_retro_credit(client, cleanup):
    await _admin(client)
    await _create(
        client, cleanup, title="t-для-гм", auto_assign=True,
        assign_conditions=[{"field": "role", "op": "eq", "value": "gamemaster"}],
    )
    await _create(
        client, cleanup, title="t-без-инфляции", auto_assign=True, retro_credit=False,
        complete_conditions=[{"field": "phone", "op": "filled"}],
    )
    player = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    async with player:
        await register(player, cleanup)
        assert (await _my(player, "t-для-гм")) is None or (await _my(player, "t-для-гм"))["my_status"] is None
        assert (await _my(player, "t-без-инфляции"))["my_status"] == "taken"
    gm = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    async with gm:
        await login(gm, "gm@lis.bar")
        assert (await _my(gm, "t-для-гм"))["my_status"] == "taken"


async def test_xp_cascade_reaches_fixed_point(client, cleanup):
    await _admin(client)
    # телефон -> +100 -> открывается xp>=100 -> зачёт по telegram, всё за один вызов
    await _create(
        client, cleanup, title="t-шаг1", auto_assign=True, xp_reward=100,
        complete_conditions=[{"field": "phone", "op": "filled"}],
    )
    await _create(
        client, cleanup, title="t-шаг2", auto_assign=True, xp_reward=5,
        assign_conditions=[{"field": "xp", "op": "gte", "value": 100}],
        complete_conditions=[{"field": "telegram", "op": "filled"}],
    )
    player = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    async with player:
        await register(player, cleanup)
        assert (await _my(player, "t-шаг2")) is None or (await _my(player, "t-шаг2"))["my_status"] is None
        r = await player.patch("/api/auth/me", json={"phone": "+7 900 000-00-02"})
        assert r.json()["xp"] >= 105
        assert (await _my(player, "t-шаг1"))["my_status"] == "completed"
        assert (await _my(player, "t-шаг2"))["my_status"] == "completed"


async def test_parallel_logins_do_not_duplicate_assignments(client, cleanup):
    await _admin(client)
    await _create(client, cleanup, title="t-гонка", auto_assign=True)
    player = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    async with player:
        me = await register(player, cleanup)
    handle = me["telegram"]

    async def one():
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            r = await c.post("/api/auth/login", json={"login": handle, "password": "secret9"})
            assert r.status_code == 200
            return (await c.get("/api/quests")).json()

    results = await asyncio.gather(*[one() for _ in range(6)])
    for quests in results:
        mine = [q for q in quests if q["title"] == "t-гонка"]
        assert len(mine) == 1
