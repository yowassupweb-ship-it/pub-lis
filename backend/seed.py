"""Демо-данные: пользователи всех ролей (пароль demo) и автоквесты профиля.

Запуск: python seed.py  (после alembic upgrade head). Идемпотентен:
пользователей не дублирует, автоквесты создаёт один раз.
"""

import asyncio

from sqlalchemy import func, select

from db import SessionLocal
from models import AppUser, Quest
from security import hash_password

# Профильные автоквесты: (title, описание, условия, XP)
AUTO_QUESTS = [
    ("Обзаведись лицом", "Поставь аватарку в личном кабинете — свою или из пресетов.",
     [{"field": "avatar", "op": "filled", "value": None}], 50),
    ("Оставь контакты", "Укажи телефон в личном кабинете, чтобы таверна могла дозвониться.",
     [{"field": "phone", "op": "filled", "value": None}], 50),
    ("Полный портрет", "Заполни профиль целиком: аватар, телефон и почта.",
     [{"field": f, "op": "filled", "value": None} for f in ("avatar", "phone", "email")], 150),
]

DEMO_USERS = [
    ("Юра Игроков", "user@lis.bar", "user"),
    ("Поляна", "polina@lis.bar", "user"),
    ("Стасос Следопыт", "stas@lis.bar", "user"),
    ("Волшебница", "vika@lis.bar", "user"),
    ("ГМ #1", "gm@lis.bar", "gamemaster"),
    ("Мира", "mira@lis.bar", "gamemaster"),
    ("Бармен", "bartender@lis.bar", "bartender"),
    ("Менеджер", "manager@lis.bar", "manager"),
    ("Админ", "admin@lis.bar", "admin"),
]


async def main() -> None:
    async with SessionLocal() as db:
        users: dict[str, AppUser] = {}
        for name, email, role in DEMO_USERS:
            user = (
                await db.execute(select(AppUser).where(AppUser.email == email))
            ).scalar_one_or_none()
            if user is None:
                user = AppUser(
                    name=name,
                    email=email,
                    telegram=email.split("@")[0],
                    role=role,
                    password_hash=hash_password("demo"),
                )
                db.add(user)
                print(f"создан {email} ({role})")
            users[email] = user
        await db.commit()
        for u in users.values():
            await db.refresh(u)

        admin = users["admin@lis.bar"]
        auto_exists = (
            await db.execute(
                select(func.count()).select_from(Quest).where(Quest.complete_conditions.is_not(None))
            )
        ).scalar_one()
        if not auto_exists:
            for title, desc, conds, xp in AUTO_QUESTS:
                db.add(
                    Quest(
                        title=title,
                        description=desc,
                        category="general",
                        xp_reward=xp,
                        created_by=admin.id,
                        complete_conditions=conds,
                        auto_assign=True,
                        assign_conditions=[],
                        retro_credit=True,  # заполнил профиль до квеста — всё равно зачёт, так решили
                    )
                )
                print(f"автоквест: {title} (+{xp}XP)")
            await db.commit()
        else:
            print("автоквесты уже есть, пропускаю")


if __name__ == "__main__":
    asyncio.run(main())
