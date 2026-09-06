import uuid
from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from deps import require_staff
from models import AppUser
from warehouse_db import get_warehouse_db
from warehouse_deps import log_activity
from warehouse_models import Product, ProductBatch, ProductType, Purchase, PurchaseItem, WriteOff
from warehouse_schemas import (
    BatchUpdate,
    ManualProductCreate,
    ProductOut,
    ProductsImportRequest,
    ProductsImportResult,
    ProductTypeCreate,
    ProductTypeOut,
    ProductTypesImportRequest,
    ProductTypesImportResult,
    ProductUpdate,
    PurchaseCreate,
    PurchaseOut,
    WriteOffCreate,
    WriteOffOut,
)
from warehouse_stock import normalize_name

router = APIRouter(prefix="/api/warehouse", tags=["warehouse"], dependencies=[Depends(require_staff)])


# ── Типы товаров ─────────────────────────────────────────────────────────


@router.get("/product-types", response_model=list[ProductTypeOut])
async def list_product_types(db: Annotated[AsyncSession, Depends(get_warehouse_db)]) -> list[ProductType]:
    result = await db.execute(select(ProductType).order_by(ProductType.name))
    return list(result.scalars())


@router.post("/product-types", response_model=ProductTypeOut, status_code=201)
async def create_product_type(
    body: ProductTypeCreate,
    staff: Annotated[AppUser, Depends(require_staff)],
    db: Annotated[AsyncSession, Depends(get_warehouse_db)],
) -> ProductType:
    if await db.get(ProductType, body.id) is not None:
        raise HTTPException(status_code=409, detail="Такой тип уже существует")
    product_type = ProductType(id=body.id, name=body.name, unit=body.unit)
    db.add(product_type)
    await log_activity(db, staff.id, staff.name, "product_type.create", "product_type", None, {"name": body.name})
    await db.commit()
    return product_type


@router.post("/product-types/import", response_model=ProductTypesImportResult)
async def import_product_types(
    body: ProductTypesImportRequest,
    staff: Annotated[AppUser, Depends(require_staff)],
    db: Annotated[AsyncSession, Depends(get_warehouse_db)],
) -> ProductTypesImportResult:
    """Массовое добавление ингредиентов из JSON (например, список, который
    предложил GPT при разработке рецептов). Существующие id пропускаются —
    это справочник, изменять существующие записи так не нужно."""
    created = 0
    skipped = 0
    for item in body.product_types:
        if await db.get(ProductType, item.id) is not None:
            skipped += 1
            continue
        db.add(ProductType(id=item.id, name=item.name, unit=item.unit))
        created += 1
    await log_activity(
        db, staff.id, staff.name, "product_type.import", "product_type", None,
        {"created": created, "skipped": skipped},
    )
    await db.commit()
    return ProductTypesImportResult(created=created, skipped=skipped)


# ── Товары и партии ──────────────────────────────────────────────────────


@router.get("/products", response_model=list[ProductOut])
async def list_products(db: Annotated[AsyncSession, Depends(get_warehouse_db)]) -> list[Product]:
    result = await db.execute(select(Product).options(selectinload(Product.batches)).order_by(Product.name))
    return list(result.scalars())


@router.post("/products", response_model=ProductOut, status_code=201)
async def add_manual_product(
    body: ManualProductCreate,
    staff: Annotated[AppUser, Depends(require_staff)],
    db: Annotated[AsyncSession, Depends(get_warehouse_db)],
) -> Product:
    normalized = normalize_name(body.name)
    result = await db.execute(select(Product).where(Product.normalized_name == normalized))
    product = result.scalar_one_or_none()
    if product is None:
        product = Product(
            type_id=body.type_id,
            name=body.name,
            normalized_name=normalized,
            package_size=body.package_size,
            stock_unit=body.stock_unit,
            shelf_life_days=body.shelf_life_days,
        )
        db.add(product)
        await db.flush()

    received_at = body.received_at or date.today()
    batch = ProductBatch(
        product_id=product.id,
        packs=body.packs,
        remaining_amount=body.packs * body.package_size,
        total_price=body.total_price,
        received_at=received_at,
        expires_at=received_at + timedelta(days=body.shelf_life_days),
        shelf_life_days=body.shelf_life_days,
    )
    db.add(batch)
    await log_activity(db, staff.id, staff.name, "product.add_batch", "product", product.id, {"name": product.name})
    await db.commit()
    await db.refresh(product, attribute_names=["batches"])
    return product


@router.patch("/products/{product_id}", response_model=ProductOut)
async def update_product(
    product_id: uuid.UUID,
    body: ProductUpdate,
    staff: Annotated[AppUser, Depends(require_staff)],
    db: Annotated[AsyncSession, Depends(get_warehouse_db)],
) -> Product:
    product = await db.get(Product, product_id, options=[selectinload(Product.batches)])
    if product is None:
        raise HTTPException(status_code=404, detail="Товар не найден")
    if body.package_size is not None:
        product.package_size = body.package_size
        for batch in product.batches:
            batch.remaining_amount = float(batch.packs) * body.package_size
    if body.shelf_life_days is not None:
        product.shelf_life_days = body.shelf_life_days
    await log_activity(db, staff.id, staff.name, "product.update", "product", product.id, {"name": product.name})
    await db.commit()
    return product


@router.patch("/products/{product_id}/batches/{batch_id}", response_model=ProductOut)
async def update_batch(
    product_id: uuid.UUID,
    batch_id: uuid.UUID,
    body: BatchUpdate,
    staff: Annotated[AppUser, Depends(require_staff)],
    db: Annotated[AsyncSession, Depends(get_warehouse_db)],
) -> Product:
    product = await db.get(Product, product_id, options=[selectinload(Product.batches)])
    if product is None:
        raise HTTPException(status_code=404, detail="Товар не найден")
    batch = await db.get(ProductBatch, batch_id)
    if batch is None or batch.product_id != product_id:
        raise HTTPException(status_code=404, detail="Партия не найдена")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(batch, field, value)
    if body.received_at is not None or body.shelf_life_days is not None:
        batch.expires_at = batch.received_at + timedelta(days=batch.shelf_life_days)
    await log_activity(db, staff.id, staff.name, "product.update_batch", "product", product.id, {"name": product.name})
    await db.commit()
    await db.refresh(product, attribute_names=["batches"])
    return product


# ── Импорт/экспорт JSON (бэкап, перенос между окружениями) ──────────────────
# Экспорт — это просто GET /products как есть, отдельного эндпоинта не нужно.


@router.post("/products/import", response_model=ProductsImportResult)
async def import_products(
    body: ProductsImportRequest,
    staff: Annotated[AppUser, Depends(require_staff)],
    db: Annotated[AsyncSession, Depends(get_warehouse_db)],
) -> ProductsImportResult:
    """Импорт списка товаров + партий из JSON (тот же формат, что отдаёт
    GET /products) — восстановление бэкапа или перенос данных вручную.
    Товары сопоставляются по normalized_name, как и везде на складе:
    существующий товар получает дополнительные партии, новый — создаётся."""
    products_created = 0
    products_matched = 0
    batches_created = 0

    for item in body.products:
        normalized = normalize_name(item.name)
        result = await db.execute(select(Product).where(Product.normalized_name == normalized))
        product = result.scalar_one_or_none()
        if product is None:
            product = Product(
                type_id=item.type_id,
                name=item.name,
                normalized_name=normalized,
                package_size=item.package_size,
                stock_unit=item.stock_unit,
                shelf_life_days=item.shelf_life_days,
            )
            db.add(product)
            await db.flush()
            products_created += 1
        else:
            products_matched += 1

        for batch in item.batches:
            received_at = batch.received_at or date.today()
            shelf_life_days = batch.shelf_life_days if batch.shelf_life_days is not None else item.shelf_life_days
            remaining_amount = (
                batch.remaining_amount if batch.remaining_amount is not None else batch.packs * item.package_size
            )
            db.add(
                ProductBatch(
                    product_id=product.id,
                    packs=batch.packs,
                    remaining_amount=remaining_amount,
                    total_price=batch.total_price,
                    received_at=received_at,
                    expires_at=received_at + timedelta(days=shelf_life_days),
                    shelf_life_days=shelf_life_days,
                )
            )
            batches_created += 1

    await log_activity(
        db, staff.id, staff.name, "product.import", "product", None,
        {"products_created": products_created, "products_matched": products_matched, "batches_created": batches_created},
    )
    await db.commit()
    return ProductsImportResult(
        products_created=products_created, products_matched=products_matched, batches_created=batches_created
    )


# ── Закупки ──────────────────────────────────────────────────────────────


@router.get("/purchases", response_model=list[PurchaseOut])
async def list_purchases(db: Annotated[AsyncSession, Depends(get_warehouse_db)]) -> list[PurchaseOut]:
    items_agg = (
        select(
            PurchaseItem.purchase_id,
            func.count().label("item_count"),
            func.coalesce(func.sum(PurchaseItem.total_price), 0).label("total"),
        )
        .group_by(PurchaseItem.purchase_id)
        .subquery()
    )
    query = select(Purchase, items_agg.c.item_count, items_agg.c.total).outerjoin(
        items_agg, items_agg.c.purchase_id == Purchase.id
    )
    rows = (await db.execute(query.order_by(Purchase.created_at.desc()))).all()
    return [
        PurchaseOut(
            id=purchase.id,
            supplier=purchase.supplier,
            source_text=purchase.source_text,
            received_at=purchase.received_at,
            item_count=int(item_count or 0),
            total=float(total or 0),
            created_at=purchase.created_at,
        )
        for purchase, item_count, total in rows
    ]


@router.post("/purchases", response_model=PurchaseOut, status_code=201)
async def create_purchase(
    body: PurchaseCreate,
    staff: Annotated[AppUser, Depends(require_staff)],
    db: Annotated[AsyncSession, Depends(get_warehouse_db)],
) -> PurchaseOut:
    received_at = body.received_at or date.today()
    purchase = Purchase(
        supplier=body.supplier,
        source_text=body.source_text,
        received_at=received_at,
        created_by=staff.id,
        created_by_name=staff.name,
    )
    db.add(purchase)
    await db.flush()

    total = 0.0
    for item in body.items:
        normalized = normalize_name(item.name)
        result = await db.execute(select(Product).where(Product.normalized_name == normalized))
        product = result.scalar_one_or_none()
        if product is None:
            product = Product(
                type_id=item.type_id,
                name=item.name,
                normalized_name=normalized,
                package_size=item.package_size,
                stock_unit=item.stock_unit,
                shelf_life_days=item.shelf_life_days,
            )
            db.add(product)
            await db.flush()
        batch = ProductBatch(
            product_id=product.id,
            purchase_id=purchase.id,
            packs=item.packs,
            remaining_amount=item.packs * item.package_size,
            total_price=item.total_price,
            received_at=received_at,
            expires_at=received_at + timedelta(days=item.shelf_life_days),
            shelf_life_days=item.shelf_life_days,
        )
        db.add(batch)
        await db.flush()
        db.add(
            PurchaseItem(
                purchase_id=purchase.id,
                product_id=product.id,
                batch_id=batch.id,
                quantity=item.packs,
                unit_price=(item.total_price / item.packs) if item.total_price and item.packs else None,
                total_price=item.total_price,
            )
        )
        total += item.total_price or 0

    await log_activity(
        db, staff.id, staff.name, "purchase.create", "purchase", purchase.id,
        {"item_count": len(body.items), "total": total},
    )
    await db.commit()
    return PurchaseOut(
        id=purchase.id,
        supplier=purchase.supplier,
        source_text=purchase.source_text,
        received_at=purchase.received_at,
        item_count=len(body.items),
        total=total,
        created_at=purchase.created_at,
    )


# ── Списания ─────────────────────────────────────────────────────────────


@router.get("/write-offs", response_model=list[WriteOffOut])
async def list_write_offs(db: Annotated[AsyncSession, Depends(get_warehouse_db)]) -> list[WriteOff]:
    result = await db.execute(select(WriteOff).order_by(WriteOff.created_at.desc()))
    return list(result.scalars())


@router.post("/write-offs", response_model=WriteOffOut, status_code=201)
async def create_write_off(
    body: WriteOffCreate,
    staff: Annotated[AppUser, Depends(require_staff)],
    db: Annotated[AsyncSession, Depends(get_warehouse_db)],
) -> WriteOff:
    product = await db.get(Product, body.product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Товар не найден")
    batch = await db.get(ProductBatch, body.batch_id)
    if batch is None or batch.product_id != body.product_id:
        raise HTTPException(status_code=404, detail="Партия не найдена")
    if float(batch.remaining_amount) < body.amount:
        raise HTTPException(status_code=422, detail="На складе меньше, чем указано в списании")

    capacity = float(batch.packs) * float(product.package_size)
    unit_value = (float(batch.total_price) / capacity) if batch.total_price and capacity else 0
    value = round(unit_value * body.amount, 2)

    batch.remaining_amount = float(batch.remaining_amount) - body.amount
    write_off = WriteOff(
        product_id=product.id,
        batch_id=batch.id,
        product_name=product.name,
        amount=body.amount,
        unit=product.stock_unit,
        reason=body.reason,
        value=value,
        created_by=staff.id,
        created_by_name=staff.name,
    )
    db.add(write_off)
    await db.flush()
    await log_activity(
        db, staff.id, staff.name, "write_off.create", "write_off", write_off.id,
        {"product_name": product.name, "amount": body.amount, "unit": product.stock_unit, "reason": body.reason},
    )
    await db.commit()
    return write_off
