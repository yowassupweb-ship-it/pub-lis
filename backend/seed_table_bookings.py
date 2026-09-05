"""Тестовые брони столов — по 5 на неделю (эта и следующая), разные дни/время."""

import asyncio
from datetime import date, timedelta

from sqlalchemy import select

from db import SessionLocal
from models import AppUser, FloorMap, TableBooking

# (сдвиг дней от понедельника недели, время начала, время конца, telegram гостя, id стола)
PLAN = [
    (0, "18:00", "20:00", "test_guest_01"),
    (1, "19:30", "21:30", "test_guest_02"),
    (3, "20:00", "23:00", "test_guest_03"),
    (4, "21:00", "23:59", "test_guest_04"),
    (5, "13:00", "15:00", "test_guest_05"),
]


def monday_of(d: date) -> date:
    return d - timedelta(days=d.weekday())


async def main() -> None:
    async with SessionLocal() as db:
        floor_map = (await db.execute(select(FloorMap).order_by(FloorMap.created_at))).scalars().first()
        if floor_map is None:
            print("Нет ни одной карты зала — сначала создайте её в разделе Столы")
            return
        tables = (floor_map.layout or {}).get("tables") or []
        if not tables:
            print("На карте нет столов — добавьте хотя бы один в редакторе")
            return
        table_ids = [t["id"] for t in tables]

        guests_by_tg = {
            u.telegram: u
            for u in (await db.execute(select(AppUser).where(AppUser.telegram.like("test_guest_%")))).scalars()
        }

        this_monday = monday_of(date.today())
        weeks = [this_monday, this_monday + timedelta(days=7)]

        created = 0
        for week_start in weeks:
            for i, (day_offset, start, end, tg) in enumerate(PLAN):
                guest = guests_by_tg.get(tg)
                if guest is None:
                    continue
                booking_date = week_start + timedelta(days=day_offset)
                table_id = table_ids[i % len(table_ids)]
                exists = (
                    await db.execute(
                        select(TableBooking).where(
                            TableBooking.map_id == floor_map.id,
                            TableBooking.table_id == table_id,
                            TableBooking.booking_date == booking_date,
                            TableBooking.time_start == start,
                        )
                    )
                ).scalar_one_or_none()
                if exists:
                    continue
                db.add(
                    TableBooking(
                        map_id=floor_map.id,
                        table_id=table_id,
                        booking_date=booking_date,
                        time_start=start,
                        time_end=end,
                        guest_id=guest.id,
                        guest_name=guest.name,
                        comment="",
                    )
                )
                created += 1
        await db.commit()
        print(f"Создано броней: {created} (карта: {floor_map.name})")


if __name__ == "__main__":
    asyncio.run(main())
