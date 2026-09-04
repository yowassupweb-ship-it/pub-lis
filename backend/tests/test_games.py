import asyncio
from datetime import datetime, timedelta, timezone

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from db import SessionLocal
from main import app
from tests.conftest import login, register

pytestmark = pytest.mark.asyncio(loop_scope="session")

BAR_TZ = timezone(timedelta(hours=3))


def next_friday_at(hour: int) -> str:
    now = datetime.now(BAR_TZ)
    days = (4 - now.weekday()) % 7 or 7
    d = (now + timedelta(days=days)).replace(hour=hour, minute=0, second=0, microsecond=0)
    return d.isoformat()


async def _admin_game(client, title, starts_at, duration=3, seats=5):
    r = await client.post(
        "/api/games",
        json={"title": title, "starts_at": starts_at, "duration_hours": duration, "seats_total": seats},
    )
    assert r.status_code == 201, r.text
    return r.json()


@pytest.fixture
async def games_cleanup():
    ids: list[str] = []
    yield ids
    async with SessionLocal() as db:
        for gid in ids:
            await db.execute(text("DELETE FROM games WHERE id = :id"), {"id": gid})
        await db.commit()


async def test_player_cannot_book_overlapping_games(client, cleanup, games_cleanup):
    await login(client, "admin@lis.bar")  # у админа игры сразу approved
    g1 = await _admin_game(client, "t-игра-1", next_friday_at(18), duration=3)
    g2 = await _admin_game(client, "t-игра-2", next_friday_at(20), duration=3)  # 20–23 бьётся с 18–21
    g3 = await _admin_game(client, "t-игра-3", next_friday_at(21), duration=2)  # 21–23 встык — можно
    games_cleanup.extend([g1["id"], g2["id"], g3["id"]])

    player = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    async with player:
        await register(player, cleanup)
        assert (await player.post(f"/api/games/{g1['id']}/book")).status_code == 200
        r = await player.post(f"/api/games/{g2['id']}/book")
        assert r.status_code == 409
        assert "t-игра-1" in r.json()["detail"]
        assert (await player.post(f"/api/games/{g3['id']}/book")).status_code == 200, "встык — не пересечение"


async def test_gm_cannot_approve_if_player_got_overlap_meanwhile(client, cleanup, games_cleanup):
    await login(client, "admin@lis.bar")
    g1 = await _admin_game(client, "t-первая", next_friday_at(16), duration=3)
    g2 = await _admin_game(client, "t-вторая", next_friday_at(17), duration=3)
    games_cleanup.extend([g1["id"], g2["id"]])

    player = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    async with player:
        await register(player, cleanup)
        assert (await player.post(f"/api/games/{g1['id']}/book")).status_code == 200
        assert (await player.post(f"/api/games/{g2['id']}/book")).status_code == 409

    # единственную заявку одобрить можно
    bookings = (await client.get(f"/api/games/{g1['id']}/bookings")).json()
    r = await client.post(f"/api/games/{g1['id']}/bookings/{bookings[0]['id']}/approve")
    assert r.status_code == 200


async def test_validation_errors_are_human_readable(client, cleanup):
    player = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    async with player:
        await register(player, cleanup)
        r = await player.patch("/api/auth/me", json={"phone": "abc"})
        assert r.status_code == 422
        detail = r.json()["detail"]
        assert isinstance(detail, str) and detail.startswith("Телефон:"), detail
        r = await player.post("/api/auth/me/password", json={"current_password": "x", "new_password": "12"})
        assert r.status_code == 422
        assert "Новый пароль" in r.json()["detail"]


async def test_parallel_bookings_do_not_overlap(client, cleanup, games_cleanup):
    """Два одновременных запроса на пересекающиеся игры: пройти должен один.
    Держится на advisory-локе; в проде поверх ещё EXCLUDE-констрейнт."""
    await login(client, "admin@lis.bar")
    g1 = await _admin_game(client, "t-гонка-1", next_friday_at(15), duration=4)
    g2 = await _admin_game(client, "t-гонка-2", next_friday_at(17), duration=4)
    games_cleanup.extend([g1["id"], g2["id"]])

    player = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    async with player:
        me = await register(player, cleanup)
    handle = me["telegram"]

    async def book(game_id: str) -> int:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            await c.post("/api/auth/login", json={"login": handle, "password": "secret9"})
            r = await c.post(f"/api/games/{game_id}/book")
            return r.status_code

    codes = await asyncio.gather(book(g1["id"]), book(g2["id"]))
    assert sorted(codes) == [200, 409], codes
