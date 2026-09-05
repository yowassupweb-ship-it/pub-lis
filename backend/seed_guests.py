"""15 тестовых гостей для раздела /staff -> Гости. Идемпотентно: пропускает уже созданных по telegram."""

import asyncio

from sqlalchemy import select

from db import SessionLocal
from models import AppUser

GUESTS = [
    {"name": "Игорь Соколов", "phone": "+7 901 111-22-33", "telegram": "test_guest_01"},
    {"name": "Мария Волкова", "phone": "+7 902 111-22-34", "telegram": "test_guest_02"},
    {"name": "Дмитрий Кузнецов", "phone": "+7 903 111-22-35", "telegram": "test_guest_03"},
    {"name": "Анна Лебедева", "phone": "+7 904 111-22-36", "telegram": "test_guest_04"},
    {"name": "Сергей Морозов", "phone": "+7 905 111-22-37", "telegram": "test_guest_05"},
    {"name": "Екатерина Зайцева", "phone": "+7 906 111-22-38", "telegram": "test_guest_06"},
    {"name": "Павел Козлов", "phone": "+7 907 111-22-39", "telegram": "test_guest_07"},
    {"name": "Ольга Новикова", "phone": "+7 908 111-22-40", "telegram": "test_guest_08"},
    {"name": "Артём Фёдоров", "phone": "+7 909 111-22-41", "telegram": "test_guest_09"},
    {"name": "Виктория Егорова", "phone": "+7 910 111-22-42", "telegram": "test_guest_10"},
    {"name": "Максим Никитин", "phone": "+7 911 111-22-43", "telegram": "test_guest_11"},
    {"name": "Дарья Соловьёва", "phone": "+7 912 111-22-44", "telegram": "test_guest_12"},
    {"name": "Роман Быков", "phone": "+7 913 111-22-45", "telegram": "test_guest_13"},
    {"name": "Полина Орлова", "phone": "+7 914 111-22-46", "telegram": "test_guest_14"},
    {"name": "Никита Воробьёв", "phone": "+7 915 111-22-47", "telegram": "test_guest_15"},
]


async def main() -> None:
    async with SessionLocal() as db:
        existing = set(
            (await db.execute(select(AppUser.telegram).where(AppUser.telegram.in_([g["telegram"] for g in GUESTS])))).scalars()
        )
        created = 0
        for guest in GUESTS:
            if guest["telegram"] in existing:
                continue
            db.add(AppUser(name=guest["name"], phone=guest["phone"], telegram=guest["telegram"], role="user"))
            created += 1
        await db.commit()
        print(f"Создано гостей: {created}, уже было: {len(GUESTS) - created}")


if __name__ == "__main__":
    asyncio.run(main())
