from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from config import settings

# Отдельная БД для склада/меню/заказов — не пересекается с hitry_lis_crm
# (там живут аккаунты/игры/квесты, за которые отвечает не эта часть системы).
warehouse_engine = create_async_engine(settings.async_warehouse_database_url, pool_pre_ping=True)
WarehouseSessionLocal = async_sessionmaker(warehouse_engine, expire_on_commit=False)


async def get_warehouse_db() -> AsyncGenerator[AsyncSession, None]:
    async with WarehouseSessionLocal() as session:
        yield session
