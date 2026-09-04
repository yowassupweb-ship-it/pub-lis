"""Сменить роль пользователя. Ищет по телеграму (основной логин) или email.

Локально:  python set_role.py @username admin
           python set_role.py user@lis.bar admin
На сервере: docker compose -f docker-compose.prod.yml exec api python set_role.py @username admin

Без аргументов выводит список пользователей и ролей.
"""

import asyncio
import sys

from sqlalchemy import func, or_, select

from db import SessionLocal
from models import AppUser

ROLES = ("user", "gamemaster", "bartender", "manager", "admin")


async def list_users() -> None:
    async with SessionLocal() as db:
        users = (await db.execute(select(AppUser).order_by(AppUser.created_at))).scalars()
        for u in users:
            handle = f"@{u.telegram}" if u.telegram else "—"
            flag = "" if u.is_active else "  [деактивирован]"
            print(f"{handle:20} {u.email or '—':28} {u.role:12} {u.name}{flag}")


async def set_role(ident: str, role: str) -> None:
    if role not in ROLES:
        sys.exit(f"Неизвестная роль '{role}'. Доступные: {', '.join(ROLES)}")
    key = ident.strip().lstrip("@").lower()
    async with SessionLocal() as db:
        found = (
            await db.execute(
                select(AppUser).where(
                    or_(func.lower(AppUser.telegram) == key, func.lower(AppUser.email) == key)
                )
            )
        ).scalars().all()
        if not found:
            sys.exit(f"Пользователь «{ident}» не найден — посмотри список: python set_role.py")
        if len(found) > 1:  # телеграм одного совпал с почтой другого
            print("Под запрос подходит несколько:")
            for u in found:
                print(f"  @{u.telegram or '—'} / {u.email or '—'} — {u.name}")
            sys.exit("Уточни: укажи email целиком или телеграм с @")
        user = found[0]
        old, user.role = user.role, role
        await db.commit()
        print(f"@{user.telegram or '—'} ({user.name}): {old} -> {role}")


if __name__ == "__main__":
    if len(sys.argv) == 1:
        asyncio.run(list_users())
    elif len(sys.argv) == 3:
        asyncio.run(set_role(sys.argv[1], sys.argv[2]))
    else:
        sys.exit(__doc__)
