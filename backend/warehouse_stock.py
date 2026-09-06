"""FIFO-логика склада: списание/возврат по типу товара и разрешение
альтернатив. Общая для routers/orders.py (списание при заказе, возврат при
отмене) и routers/warehouse.py (ручное списание по конкретной партии)."""

import re
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from warehouse_models import Product, ProductBatch

EPSILON = 0.0001


def normalize_name(name: str) -> str:
    lowered = name.lower().replace("ё", "е")
    collapsed = re.sub(r"[^\w\s]|_", " ", lowered, flags=re.UNICODE)
    return re.sub(r"\s+", " ", collapsed).strip()


async def get_type_available_amount(db: AsyncSession, type_id: str) -> float:
    today = date.today()
    result = await db.execute(
        select(ProductBatch.remaining_amount)
        .join(Product, Product.id == ProductBatch.product_id)
        .where(Product.type_id == type_id, ProductBatch.expires_at >= today)
    )
    return sum(float(v) for v in result.scalars())


async def resolve_type_id(db: AsyncSession, type_id: str, alt_type_ids: list[str], amount: float) -> str:
    for candidate in [type_id, *alt_type_ids]:
        if await get_type_available_amount(db, candidate) + EPSILON >= amount:
            return candidate
    return type_id


async def _fifo_batches(db: AsyncSession, type_id: str) -> list[ProductBatch]:
    today = date.today()
    result = await db.execute(
        select(ProductBatch)
        .join(Product, Product.id == ProductBatch.product_id)
        .where(Product.type_id == type_id, ProductBatch.expires_at >= today)
        .order_by(ProductBatch.expires_at.asc())
    )
    return list(result.scalars())


async def deduct_fifo(db: AsyncSession, type_id: str, amount: float) -> None:
    """Списывает amount с самых старых по сроку годности партий этого типа.
    Бросает ValueError, если остатков не хватает — вызывающий код должен
    откатить транзакцию (не коммитить)."""
    left = amount
    for batch in await _fifo_batches(db, type_id):
        if left <= EPSILON:
            break
        take = min(float(batch.remaining_amount), left)
        batch.remaining_amount = float(batch.remaining_amount) - take
        left -= take
    if left > EPSILON:
        raise ValueError(f"Недостаточно остатков для типа {type_id}")


async def restore_fifo(db: AsyncSession, type_id: str, amount: float) -> None:
    """Возвращает amount на склад по партиям того же типа (FIFO по сроку
    годности, как и при списании), не превышая физическую ёмкость партии."""
    left = amount
    batches = await _fifo_batches(db, type_id)
    for batch in batches:
        if left <= EPSILON:
            break
        product = await db.get(Product, batch.product_id)
        if product is None:
            continue
        capacity = float(batch.packs) * float(product.package_size)
        can_add = max(0.0, capacity - float(batch.remaining_amount))
        add = min(can_add, left)
        if add <= 0:
            continue
        batch.remaining_amount = float(batch.remaining_amount) + add
        left -= add
    # Если партия того типа больше не существует вовсе (товар удалён) —
    # остаток молча теряется, как и раньше на клиенте.
