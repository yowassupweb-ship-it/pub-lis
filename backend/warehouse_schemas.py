import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# ── Справочник типов ────────────────────────────────────────────────────────


class ProductTypeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    unit: str


class ProductTypeCreate(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=120)
    unit: str = Field(min_length=1, max_length=16)


# ── Склад: товары и партии ──────────────────────────────────────────────────


class BatchOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    packs: float
    remaining_amount: float
    total_price: float | None
    received_at: date
    expires_at: date
    shelf_life_days: int


class BatchUpdate(BaseModel):
    packs: float | None = Field(default=None, ge=0)
    remaining_amount: float | None = Field(default=None, ge=0)
    received_at: date | None = None
    shelf_life_days: int | None = Field(default=None, ge=0, le=3650)


class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    type_id: str
    name: str
    normalized_name: str
    package_size: float
    stock_unit: str
    shelf_life_days: int
    batches: list[BatchOut] = []


class ProductUpdate(BaseModel):
    package_size: float | None = Field(default=None, gt=0)
    shelf_life_days: int | None = Field(default=None, ge=0, le=3650)


class ManualProductCreate(BaseModel):
    """Ручное добавление товара + первой партии (без закупки)."""

    name: str = Field(min_length=1, max_length=160)
    type_id: str
    package_size: float = Field(gt=0)
    stock_unit: str = Field(min_length=1, max_length=16)
    shelf_life_days: int = Field(ge=0, le=3650, default=7)
    packs: float = Field(gt=0)
    total_price: float | None = Field(default=None, ge=0)
    received_at: date | None = None


# ── Импорт/экспорт склада в JSON (бэкап, перенос между окружениями) ────────


class BatchImport(BaseModel):
    packs: float = Field(gt=0)
    remaining_amount: float | None = Field(default=None, ge=0)  # None — считаем как новую (=packs*package_size)
    total_price: float | None = Field(default=None, ge=0)
    received_at: date | None = None
    shelf_life_days: int | None = Field(default=None, ge=0, le=3650)


class ProductImportItem(BaseModel):
    """Тот же набор полей, что отдаёт GET /api/warehouse/products — export
    можно импортировать обратно как есть (round-trip), либо собрать вручную."""

    name: str = Field(min_length=1, max_length=160)
    type_id: str
    package_size: float = Field(gt=0, default=1)
    stock_unit: str = Field(min_length=1, max_length=16, default="шт")
    shelf_life_days: int = Field(ge=0, le=3650, default=7)
    batches: list[BatchImport] = Field(default_factory=list)


class ProductsImportRequest(BaseModel):
    products: list[ProductImportItem] = Field(min_length=1, max_length=2000)


class ProductsImportResult(BaseModel):
    products_created: int
    products_matched: int
    batches_created: int


# ── Закупки ──────────────────────────────────────────────────────────────


class PurchaseItemIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    type_id: str
    package_size: float = Field(gt=0)
    stock_unit: str = Field(min_length=1, max_length=16)
    shelf_life_days: int = Field(ge=0, le=3650, default=7)
    packs: float = Field(gt=0)
    total_price: float | None = Field(default=None, ge=0)


class PurchaseCreate(BaseModel):
    supplier: str | None = Field(default=None, max_length=160)
    source_text: str = Field(default="", max_length=4000)
    received_at: date | None = None
    items: list[PurchaseItemIn] = Field(min_length=1)


class PurchaseOut(BaseModel):
    id: uuid.UUID
    supplier: str | None
    source_text: str
    received_at: date
    item_count: int
    total: float
    created_at: datetime


# ── Списания ─────────────────────────────────────────────────────────────

WRITE_OFF_REASONS = ["Просрочка", "Порча", "Бой/потери", "Излишек по инвентаризации", "Другое"]


class WriteOffCreate(BaseModel):
    product_id: uuid.UUID
    batch_id: uuid.UUID
    amount: float = Field(gt=0)
    reason: str = Field(min_length=1, max_length=120)


class WriteOffOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    product_id: uuid.UUID
    product_name: str
    batch_id: uuid.UUID
    amount: float
    unit: str
    reason: str
    value: float
    created_at: datetime


# ── Меню: категории и позиции ───────────────────────────────────────────────


class MenuCategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    sort_order: int


class MenuCategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class MenuCategoryUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class MenuIngredientIn(BaseModel):
    type_id: str
    alt_type_ids: list[str] = Field(default_factory=list)
    amount: float = Field(gt=0)


class MenuIngredientOut(MenuIngredientIn):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID


class MenuPositionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    category_id: uuid.UUID | None
    name: str
    price: float
    image_url: str | None
    order_step: float | None
    order_unit: str | None
    comment: str
    is_active: bool
    ingredients: list[MenuIngredientOut] = []


class MenuPositionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    price: float = Field(ge=0)
    category_id: uuid.UUID | None = None
    image_url: str | None = None
    order_step: float | None = Field(default=None, gt=0)
    order_unit: str | None = Field(default=None, max_length=16)
    comment: str = Field(default="", max_length=1000)
    is_active: bool = True
    ingredients: list[MenuIngredientIn] = Field(default_factory=list)


class MenuPositionUpdate(MenuPositionCreate):
    pass


class MenuPositionImportItem(BaseModel):
    """Импорт/экспорт позиций меню в JSON — раздел адресуется по имени
    (category_name), а не id: id категории не переносится между окружениями,
    имя типа ингредиента (type_id) — переносится, это стабильный справочник."""

    name: str = Field(min_length=1, max_length=160)
    price: float = Field(ge=0)
    category_name: str | None = Field(default=None, max_length=80)
    image_url: str | None = None
    order_step: float | None = Field(default=None, gt=0)
    order_unit: str | None = Field(default=None, max_length=16)
    comment: str = Field(default="", max_length=1000)
    is_active: bool = True
    ingredients: list[MenuIngredientIn] = Field(default_factory=list)


class MenuPositionsImportRequest(BaseModel):
    positions: list[MenuPositionImportItem] = Field(min_length=1, max_length=2000)


class MenuPositionsImportResult(BaseModel):
    positions_created: int
    positions_updated: int
    categories_created: int


class MenuPositionExportOut(BaseModel):
    """Форма экспорта — то же, что MenuPositionImportItem, плюс id/entity для
    справки; экспорт можно скормить обратно в /positions/import как есть."""

    name: str
    price: float
    category_name: str | None
    image_url: str | None
    order_step: float | None
    order_unit: str | None
    comment: str
    is_active: bool
    ingredients: list[MenuIngredientIn]


class PublicMenuIngredientOut(BaseModel):
    type_id: str
    amount: float


class PublicMenuPositionOut(BaseModel):
    id: uuid.UUID
    category_id: uuid.UUID | None
    name: str
    price: float
    image_url: str | None
    order_step: float | None
    order_unit: str | None
    ingredients: list[PublicMenuIngredientOut]


# ── Заказы ───────────────────────────────────────────────────────────────

OrderRoute = Literal["kitchen", "self"]
OrderStatus = Literal["active", "completed", "cancelled"]
KitchenStatus = Literal["new", "accepted", "ready", "done"]


class OrderLineIn(BaseModel):
    # состав считает сервер из текущего рецепта menu_position_id на момент
    # заказа — клиент не может подделать остатки, присылая свои ingredients
    menu_position_id: uuid.UUID | None = None
    name: str = Field(min_length=1, max_length=160)
    price: float = Field(ge=0)
    quantity: float = Field(gt=0)
    comment: str | None = Field(default=None, max_length=500)


class OrderCreate(BaseModel):
    route: OrderRoute
    guest_id: uuid.UUID | None = None
    guest_name: str | None = Field(default=None, max_length=80)
    items: list[OrderLineIn] = Field(min_length=1)


class OrderLineIngredientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    type_id: str
    name: str
    amount_label: str
    raw_amount: float


class OrderLineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    menu_position_id: uuid.UUID | None
    name: str
    price: float
    quantity: float
    comment: str | None
    ingredients: list[OrderLineIngredientOut] = []


class OrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    number: int
    created_at: datetime
    completed_at: datetime | None
    status: OrderStatus
    kitchen_status: KitchenStatus
    route: OrderRoute
    guest_id: uuid.UUID | None
    guest_name: str | None
    total: float
    items: list[OrderLineOut] = []


class OrderKitchenStatusUpdate(BaseModel):
    kitchen_status: KitchenStatus


class OrderEditUpdate(BaseModel):
    items: list[OrderLineIn] = Field(min_length=1)


# ── Журнал действий ──────────────────────────────────────────────────────


class ActivityLogOut(BaseModel):
    id: uuid.UUID
    actor_id: uuid.UUID | None
    actor_name: str | None
    action: str
    entity: str
    entity_id: uuid.UUID | None
    payload: dict
    created_at: datetime
