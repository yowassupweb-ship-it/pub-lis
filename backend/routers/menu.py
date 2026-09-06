import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from deps import require_staff
from models import AppUser
from warehouse_db import get_warehouse_db
from warehouse_deps import log_activity
from warehouse_models import MenuCategory, MenuPosition, MenuPositionIngredient
from warehouse_schemas import (
    MenuCategoryCreate,
    MenuCategoryOut,
    MenuCategoryUpdate,
    MenuIngredientIn,
    MenuPositionCreate,
    MenuPositionExportOut,
    MenuPositionOut,
    MenuPositionsImportRequest,
    MenuPositionsImportResult,
    MenuPositionUpdate,
    PublicMenuPositionOut,
)

router = APIRouter(prefix="/api/menu", tags=["menu"])
staff_router = APIRouter(prefix="/api/menu", tags=["menu"], dependencies=[Depends(require_staff)])


# ── Публичный экран /menu-display — без авторизации ─────────────────────────


@router.get("/public", response_model=list[PublicMenuPositionOut])
async def list_public_positions(db: Annotated[AsyncSession, Depends(get_warehouse_db)]) -> list[MenuPosition]:
    result = await db.execute(
        select(MenuPosition)
        .options(selectinload(MenuPosition.ingredients))
        .where(MenuPosition.is_active.is_(True))
        .order_by(MenuPosition.name)
    )
    return list(result.scalars())


# ── Категории (только персонал) ─────────────────────────────────────────────


@staff_router.get("/categories", response_model=list[MenuCategoryOut])
async def list_categories(db: Annotated[AsyncSession, Depends(get_warehouse_db)]) -> list[MenuCategory]:
    result = await db.execute(select(MenuCategory).order_by(MenuCategory.sort_order, MenuCategory.name))
    return list(result.scalars())


@staff_router.post("/categories", response_model=MenuCategoryOut, status_code=201)
async def create_category(
    body: MenuCategoryCreate,
    staff: Annotated[AppUser, Depends(require_staff)],
    db: Annotated[AsyncSession, Depends(get_warehouse_db)],
) -> MenuCategory:
    category = MenuCategory(name=body.name)
    db.add(category)
    await db.flush()
    await log_activity(db, staff.id, staff.name, "menu_category.create", "menu_category", category.id, {"name": body.name})
    await db.commit()
    return category


@staff_router.patch("/categories/{category_id}", response_model=MenuCategoryOut)
async def rename_category(
    category_id: uuid.UUID,
    body: MenuCategoryUpdate,
    staff: Annotated[AppUser, Depends(require_staff)],
    db: Annotated[AsyncSession, Depends(get_warehouse_db)],
) -> MenuCategory:
    category = await db.get(MenuCategory, category_id)
    if category is None:
        raise HTTPException(status_code=404, detail="Раздел не найден")
    category.name = body.name
    await log_activity(db, staff.id, staff.name, "menu_category.update", "menu_category", category.id, {"name": body.name})
    await db.commit()
    return category


@staff_router.delete("/categories/{category_id}", status_code=204)
async def delete_category(
    category_id: uuid.UUID,
    staff: Annotated[AppUser, Depends(require_staff)],
    db: Annotated[AsyncSession, Depends(get_warehouse_db)],
) -> None:
    category = await db.get(MenuCategory, category_id)
    if category is None:
        raise HTTPException(status_code=404, detail="Раздел не найден")
    await db.execute(
        MenuPosition.__table__.update().where(MenuPosition.category_id == category_id).values(category_id=None)
    )
    name = category.name
    await db.delete(category)
    await log_activity(db, staff.id, staff.name, "menu_category.delete", "menu_category", category_id, {"name": name})
    await db.commit()


# ── Позиции меню (только персонал) ──────────────────────────────────────────


@staff_router.get("/positions", response_model=list[MenuPositionOut])
async def list_positions(db: Annotated[AsyncSession, Depends(get_warehouse_db)]) -> list[MenuPosition]:
    result = await db.execute(
        select(MenuPosition).options(selectinload(MenuPosition.ingredients)).order_by(MenuPosition.name)
    )
    return list(result.scalars())


def _add_ingredients(db: AsyncSession, position_id: uuid.UUID, body: MenuPositionCreate) -> None:
    """Для новой позиции: добавляем строки напрямую, не трогая relationship
    (на только что созданном объекте она ещё не подгружена — обращение к ней
    синхронно вызвало бы ленивую подгрузку и упало бы MissingGreenlet)."""
    for ingredient in body.ingredients:
        db.add(
            MenuPositionIngredient(
                menu_position_id=position_id,
                type_id=ingredient.type_id,
                alt_type_ids=ingredient.alt_type_ids,
                amount=ingredient.amount,
            )
        )


async def _replace_ingredients(db: AsyncSession, position_id: uuid.UUID, ingredients: list[MenuIngredientIn]) -> None:
    """Полностью заменяет состав позиции. Явный DELETE + flush перед INSERT —
    a не relationship .clear()/.append(): при сохранении того же type_id
    (например, поменяли только количество) SQLAlchemy не гарантирует, что
    удаление старой строки уйдёт в БД раньше вставки новой в одном flush,
    и падает UniqueViolationError на (menu_position_id, type_id)."""
    await db.execute(MenuPositionIngredient.__table__.delete().where(MenuPositionIngredient.menu_position_id == position_id))
    await db.flush()
    for ingredient in ingredients:
        db.add(
            MenuPositionIngredient(
                menu_position_id=position_id,
                type_id=ingredient.type_id,
                alt_type_ids=ingredient.alt_type_ids,
                amount=ingredient.amount,
            )
        )


@staff_router.post("/positions", response_model=MenuPositionOut, status_code=201)
async def create_position(
    body: MenuPositionCreate,
    staff: Annotated[AppUser, Depends(require_staff)],
    db: Annotated[AsyncSession, Depends(get_warehouse_db)],
) -> MenuPosition:
    position = MenuPosition(
        category_id=body.category_id,
        name=body.name,
        price=body.price,
        image_url=body.image_url,
        order_step=body.order_step,
        order_unit=body.order_unit,
        comment=body.comment,
        is_active=body.is_active,
    )
    db.add(position)
    await db.flush()
    _add_ingredients(db, position.id, body)
    await log_activity(db, staff.id, staff.name, "menu_position.create", "menu_position", position.id, {"name": body.name})
    await db.commit()
    await db.refresh(position, attribute_names=["ingredients"])
    return position


@staff_router.patch("/positions/{position_id}", response_model=MenuPositionOut)
async def update_position(
    position_id: uuid.UUID,
    body: MenuPositionUpdate,
    staff: Annotated[AppUser, Depends(require_staff)],
    db: Annotated[AsyncSession, Depends(get_warehouse_db)],
) -> MenuPosition:
    position = await db.get(MenuPosition, position_id)
    if position is None:
        raise HTTPException(status_code=404, detail="Позиция не найдена")
    position.category_id = body.category_id
    position.name = body.name
    position.price = body.price
    position.image_url = body.image_url
    position.order_step = body.order_step
    position.order_unit = body.order_unit
    position.comment = body.comment
    position.is_active = body.is_active
    await _replace_ingredients(db, position.id, body.ingredients)
    await log_activity(db, staff.id, staff.name, "menu_position.update", "menu_position", position.id, {"name": body.name})
    await db.commit()
    await db.refresh(position, attribute_names=["ingredients"])
    return position


@staff_router.delete("/positions/{position_id}", status_code=204)
async def delete_position(
    position_id: uuid.UUID,
    staff: Annotated[AppUser, Depends(require_staff)],
    db: Annotated[AsyncSession, Depends(get_warehouse_db)],
) -> None:
    position = await db.get(MenuPosition, position_id)
    if position is None:
        raise HTTPException(status_code=404, detail="Позиция не найдена")
    name = position.name
    await db.delete(position)
    await log_activity(db, staff.id, staff.name, "menu_position.delete", "menu_position", position_id, {"name": name})
    await db.commit()


# ── Импорт/экспорт позиций меню в JSON ──────────────────────────────────────
# Раздел адресуется по имени (category_name), не по id — id категории не
# переносится между окружениями, а type_id ингредиентов переносится как есть
# (стабильный сидированный справочник product_types).


@staff_router.get("/positions/export", response_model=list[MenuPositionExportOut])
async def export_positions(db: Annotated[AsyncSession, Depends(get_warehouse_db)]) -> list[MenuPositionExportOut]:
    result = await db.execute(
        select(MenuPosition, MenuCategory.name)
        .options(selectinload(MenuPosition.ingredients))
        .outerjoin(MenuCategory, MenuCategory.id == MenuPosition.category_id)
        .order_by(MenuPosition.name)
    )
    return [
        MenuPositionExportOut(
            name=position.name,
            price=float(position.price),
            category_name=category_name,
            image_url=position.image_url,
            order_step=float(position.order_step) if position.order_step is not None else None,
            order_unit=position.order_unit,
            comment=position.comment,
            is_active=position.is_active,
            ingredients=[
                MenuIngredientIn(type_id=i.type_id, alt_type_ids=i.alt_type_ids, amount=float(i.amount))
                for i in position.ingredients
            ],
        )
        for position, category_name in result.all()
    ]


@staff_router.post("/positions/import", response_model=MenuPositionsImportResult)
async def import_positions(
    body: MenuPositionsImportRequest,
    staff: Annotated[AppUser, Depends(require_staff)],
    db: Annotated[AsyncSession, Depends(get_warehouse_db)],
) -> MenuPositionsImportResult:
    """Импорт списка позиций меню (тот же формат, что отдаёт GET
    /positions/export) — восстановление бэкапа или перенос между окружениями.
    Позиции сопоставляются по имени (без учёта регистра): существующая
    обновляется целиком (включая состав), новая — создаётся вместе с
    разделом, если раздела с таким именем ещё нет."""
    positions_created = 0
    positions_updated = 0
    categories_created = 0
    category_cache: dict[str, uuid.UUID] = {}

    async def resolve_category(name: str | None) -> uuid.UUID | None:
        nonlocal categories_created
        if not name:
            return None
        if name in category_cache:
            return category_cache[name]
        result = await db.execute(select(MenuCategory).where(MenuCategory.name == name))
        category = result.scalar_one_or_none()
        if category is None:
            category = MenuCategory(name=name)
            db.add(category)
            await db.flush()
            categories_created += 1
        category_cache[name] = category.id
        return category.id

    for item in body.positions:
        category_id = await resolve_category(item.category_name)
        result = await db.execute(
            select(MenuPosition).where(func.lower(MenuPosition.name) == item.name.strip().lower())
        )
        existing = result.scalar_one_or_none()
        if existing is None:
            position = MenuPosition(
                category_id=category_id,
                name=item.name,
                price=item.price,
                image_url=item.image_url,
                order_step=item.order_step,
                order_unit=item.order_unit,
                comment=item.comment,
                is_active=item.is_active,
            )
            db.add(position)
            await db.flush()
            for ingredient in item.ingredients:
                db.add(
                    MenuPositionIngredient(
                        menu_position_id=position.id,
                        type_id=ingredient.type_id,
                        alt_type_ids=ingredient.alt_type_ids,
                        amount=ingredient.amount,
                    )
                )
            positions_created += 1
        else:
            existing.category_id = category_id
            existing.price = item.price
            existing.image_url = item.image_url
            existing.order_step = item.order_step
            existing.order_unit = item.order_unit
            existing.comment = item.comment
            existing.is_active = item.is_active
            await _replace_ingredients(db, existing.id, item.ingredients)
            positions_updated += 1

    await log_activity(
        db, staff.id, staff.name, "menu_position.import", "menu_position", None,
        {"positions_created": positions_created, "positions_updated": positions_updated, "categories_created": categories_created},
    )
    await db.commit()
    return MenuPositionsImportResult(
        positions_created=positions_created, positions_updated=positions_updated, categories_created=categories_created
    )
