"""Сменить роль пользователя по email.

Локально:  python set_role.py user@lis.bar admin
На сервере: docker compose -f docker-compose.prod.yml exec api python set_role.py user@lis.bar admin

Без аргументов выводит список пользователей и ролей.
"""

import asyncio
import sys

from sqlalchemy import select

from db import SessionLocal
from models import AppUser

ROLES = ("user", "gamemaster", "bartender", "manager", "admin")


async def list_users() -> None:
    async with SessionLocal() as db:
        users = (await db.execute(select(AppUser).order_by(AppUser.created_at))).scalars()
        for u in users:
            flag = "" if u.is_active else "  [деактивирован]"
            print(f"{u.email:32} {u.role:12} {u.name}{flag}")


async def set_role(email: str, role: str) -> None:
    if role not in ROLES:
        sys.exit(f"Неизвестная роль '{role}'. Доступные: {', '.join(ROLES)}")
    async with SessionLocal() as db:
        user = (
            await db.execute(select(AppUser).where(AppUser.email == email))
        ).scalar_one_or_none()
        if user is None:
            sys.exit(f"Пользователь {email} не найден")
        old = user.role
        user.role = role
        await db.commit()
        print(f"{email}: {old} -> {role}")


if __name__ == "__main__":
    if len(sys.argv) == 1:
        asyncio.run(list_users())
    elif len(sys.argv) == 3:
        asyncio.run(set_role(sys.argv[1], sys.argv[2]))
    else:
        sys.exit(__doc__)
