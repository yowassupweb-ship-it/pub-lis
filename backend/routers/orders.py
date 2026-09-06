import uuid
from datetime import date, datetime, time, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from deps import require_staff
from models import AppUser
from warehouse_db import get_warehouse_db
from warehouse_deps import log_activity
from warehouse_models import MenuPosition, Order, OrderLine, OrderLineIngredient, ProductType
from warehouse_schemas import (
    OrderCreate,
    OrderEditUpdate,
    OrderKitchenStatusUpdate,
    OrderOut,
    OrderRoute,
    OrderStatus,
)
from warehouse_stock import deduct_fifo, get_type_available_amount, resolve_type_id, restore_fifo

router = APIRouter(prefix="/api/orders", tags=["orders"], dependencies=[Depends(require_staff)])

_LOAD_ITEMS = selectinload(Order.items).selectinload(OrderLine.ingredients)


async def _get_order(db: AsyncSession, order_id: uuid.UUID) -> Order:
    # populate_existing=True — иначе для объекта, уже сидящего в identity map
    # этой же сессии (только что созданного/изменённого), get() отдаст его
    # как есть, без применения _LOAD_ITEMS, и сериализация ответа упадёт
    # ленивой подгрузкой (MissingGreenlet) на ещё не загруженной items/ingredients
    order = await db.get(Order, order_id, options=[_LOAD_ITEMS], populate_existing=True)
    if order is None:
        raise HTTPException(status_code=404, detail="Заказ не найден")
    return order


@router.get("", response_model=list[OrderOut])
async def list_orders(
    db: Annotated[AsyncSession, Depends(get_warehouse_db)],
    route: Annotated[OrderRoute | None, Query()] = None,
    status: Annotated[OrderStatus | None, Query()] = None,
    date_from: Annotated[date | None, Query()] = None,
    date_to: Annotated[date | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=2000)] = 500,
) -> list[Order]:
    query = select(Order).options(_LOAD_ITEMS)
    if route is not None:
        query = query.where(Order.route == route)
    if status is not None:
        query = query.where(Order.status == status)
    if date_from is not None:
        query = query.where(Order.created_at >= datetime.combine(date_from, time.min, tzinfo=timezone.utc))
    if date_to is not None:
        query = query.where(Order.created_at <= datetime.combine(date_to, time.max, tzinfo=timezone.utc))
    result = await db.execute(query.order_by(Order.created_at.desc()).limit(limit))
    return list(result.scalars())


@router.post("", response_model=OrderOut, status_code=201)
async def create_order(
    body: OrderCreate,
    staff: Annotated[AppUser, Depends(require_staff)],
    db: Annotated[AsyncSession, Depends(get_warehouse_db)],
) -> Order:
    # 1) считаем требуемое количество по типам, разрешая альтернативы по
    # текущим остаткам — как раньше делал клиент, только теперь на сервере,
    # в одной транзакции со списанием и созданием заказа.
    requirements: dict[str, float] = {}
    line_ingredients: list[list[tuple[str, str, float]]] = []  # per line: (type_id, name, raw_amount)
    type_names: dict[str, str] = {}
    type_units: dict[str, str] = {}

    for item in body.items:
        ingredients: list[tuple[str, str, float]] = []
        if item.menu_position_id is not None:
            position = await db.get(
                MenuPosition, item.menu_position_id, options=[selectinload(MenuPosition.ingredients)]
            )
            if position is not None:
                for ingredient in position.ingredients:
                    needed = float(ingredient.amount) * item.quantity
                    resolved = await resolve_type_id(db, ingredient.type_id, ingredient.alt_type_ids, needed)
                    if resolved not in type_names:
                        product_type = await db.get(ProductType, resolved)
                        type_names[resolved] = product_type.name if product_type else resolved
                        type_units[resolved] = product_type.unit if product_type else ""
                    requirements[resolved] = requirements.get(resolved, 0) + needed
                    ingredients.append((resolved, type_names[resolved], needed))
        line_ingredients.append(ingredients)

    for type_id, needed in requirements.items():
        if await get_type_available_amount(db, type_id) + 1e-4 < needed:
            raise HTTPException(status_code=422, detail=f"Недостаточно остатков: {type_names.get(type_id, type_id)}")

    for type_id, needed in requirements.items():
        try:
            await deduct_fifo(db, type_id, needed)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from None

    total = sum(item.price * item.quantity for item in body.items)
    order = Order(
        route=body.route,
        guest_id=body.guest_id,
        guest_name=body.guest_name,
        total=total,
        created_by=staff.id,
        created_by_name=staff.name,
    )
    db.add(order)
    await db.flush()

    for item, ingredients in zip(body.items, line_ingredients, strict=True):
        line = OrderLine(
            order_id=order.id,
            menu_position_id=item.menu_position_id,
            name=item.name,
            price=item.price,
            quantity=item.quantity,
            comment=item.comment,
        )
        db.add(line)
        await db.flush()
        for type_id, name, raw_amount in ingredients:
            unit = type_units.get(type_id, "")
            db.add(
                OrderLineIngredient(
                    order_line_id=line.id,
                    type_id=type_id,
                    name=name,
                    amount_label=f"{raw_amount:g} {unit}".strip(),
                    raw_amount=raw_amount,
                )
            )

    await log_activity(
        db, staff.id, staff.name, "order.create", "order", order.id,
        {"route": body.route, "total": total},
    )
    await db.commit()
    return await _get_order(db, order.id)


@router.patch("/{order_id}/kitchen-status", response_model=OrderOut)
async def update_kitchen_status(
    order_id: uuid.UUID,
    body: OrderKitchenStatusUpdate,
    staff: Annotated[AppUser, Depends(require_staff)],
    db: Annotated[AsyncSession, Depends(get_warehouse_db)],
) -> Order:
    order = await _get_order(db, order_id)
    order.kitchen_status = body.kitchen_status
    if body.kitchen_status == "done":
        order.status = "completed"
        order.completed_at = datetime.now(timezone.utc)
    await log_activity(db, staff.id, staff.name, "order.kitchen_status", "order", order.id, {"kitchen_status": body.kitchen_status})
    await db.commit()
    return await _get_order(db, order.id)


@router.post("/{order_id}/cancel", response_model=OrderOut)
async def cancel_order(
    order_id: uuid.UUID,
    staff: Annotated[AppUser, Depends(require_staff)],
    db: Annotated[AsyncSession, Depends(get_warehouse_db)],
) -> Order:
    order = await _get_order(db, order_id)
    if order.status == "cancelled":
        raise HTTPException(status_code=409, detail="Заказ уже отменён")

    for line in order.items:
        for ingredient in line.ingredients:
            await restore_fifo(db, ingredient.type_id, float(ingredient.raw_amount))

    order.status = "cancelled"
    await log_activity(
        db, staff.id, staff.name, "order.cancel", "order", order.id,
        {"number": order.number},
    )
    await db.commit()
    return await _get_order(db, order.id)


@router.patch("/{order_id}", response_model=OrderOut)
async def edit_order(
    order_id: uuid.UUID,
    body: OrderEditUpdate,
    staff: Annotated[AppUser, Depends(require_staff)],
    db: Annotated[AsyncSession, Depends(get_warehouse_db)],
) -> Order:
    """Правка количества/состава строк уже созданного заказа — как и раньше,
    не трогает склад (списание было зафиксировано при создании заказа)."""
    order = await _get_order(db, order_id)
    existing = list(order.items)
    for index, item in enumerate(body.items):
        if index < len(existing):
            line = existing[index]
            line.name = item.name
            line.price = item.price
            line.quantity = item.quantity
            line.comment = item.comment
        else:
            db.add(
                OrderLine(
                    order_id=order.id,
                    menu_position_id=item.menu_position_id,
                    name=item.name,
                    price=item.price,
                    quantity=item.quantity,
                    comment=item.comment,
                )
            )
    for extra_line in existing[len(body.items) :]:
        await db.delete(extra_line)

    order.total = sum(item.price * item.quantity for item in body.items)
    await log_activity(db, staff.id, staff.name, "order.edit", "order", order.id, {"number": order.number})
    await db.commit()
    return await _get_order(db, order.id)
