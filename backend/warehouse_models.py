import uuid
from datetime import date as date_type
from datetime import datetime

from sqlalchemy import ARRAY, Boolean, Date, DateTime, ForeignKey, Identity, Integer, Numeric, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

# Отдельная БД (см. warehouse_db.py) — своя декларативная база, не пересекается
# с models.py (там аккаунты/игры/квесты, за которые отвечает не эта часть).
class WarehouseBase(DeclarativeBase):
    pass


class ProductType(WarehouseBase):
    """Справочник складских типов — раньше был захардкожен во фронте
    (src/lib/productTypes.ts), теперь общая таблица. id — те же строковые
    слаги, что были в PRODUCT_TYPES, чтобы не переписывать typeId по фронту."""

    __tablename__ = "product_types"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    name: Mapped[str] = mapped_column(Text, unique=True)
    unit: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))


class Product(WarehouseBase):
    __tablename__ = "products"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    type_id: Mapped[str] = mapped_column(ForeignKey("product_types.id", ondelete="RESTRICT"))
    name: Mapped[str] = mapped_column(Text)
    normalized_name: Mapped[str] = mapped_column(Text, unique=True)
    package_size: Mapped[float] = mapped_column(Numeric(12, 3), server_default=text("1"))
    stock_unit: Mapped[str] = mapped_column(Text, server_default="шт")
    shelf_life_days: Mapped[int] = mapped_column(Integer, server_default=text("7"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))

    batches: Mapped[list["ProductBatch"]] = relationship(
        order_by="ProductBatch.expires_at", cascade="all, delete-orphan"
    )


class Purchase(WarehouseBase):
    __tablename__ = "purchases"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    supplier: Mapped[str | None] = mapped_column(Text)
    source_text: Mapped[str] = mapped_column(Text, server_default="")
    received_at: Mapped[date_type] = mapped_column(Date, server_default=text("CURRENT_DATE"))
    # без FK на app_users — та таблица в другой БД, только денормализованный снимок
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    created_by_name: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))


class ProductBatch(WarehouseBase):
    __tablename__ = "product_batches"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"))
    purchase_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("purchases.id", ondelete="SET NULL"))
    packs: Mapped[float] = mapped_column(Numeric(12, 3))
    remaining_amount: Mapped[float] = mapped_column(Numeric(12, 3))
    total_price: Mapped[float | None] = mapped_column(Numeric(12, 2))
    received_at: Mapped[date_type] = mapped_column(Date, server_default=text("CURRENT_DATE"))
    expires_at: Mapped[date_type] = mapped_column(Date)
    shelf_life_days: Mapped[int] = mapped_column(Integer, server_default=text("7"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))


class PurchaseItem(WarehouseBase):
    __tablename__ = "purchase_items"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    purchase_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("purchases.id", ondelete="CASCADE"))
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id", ondelete="RESTRICT"))
    batch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("product_batches.id", ondelete="CASCADE"))
    quantity: Mapped[float] = mapped_column(Numeric(12, 3))
    unit_price: Mapped[float | None] = mapped_column(Numeric(12, 2))
    total_price: Mapped[float | None] = mapped_column(Numeric(12, 2))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))


class WriteOff(WarehouseBase):
    __tablename__ = "write_offs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id", ondelete="RESTRICT"))
    batch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("product_batches.id", ondelete="RESTRICT"))
    product_name: Mapped[str] = mapped_column(Text)
    amount: Mapped[float] = mapped_column(Numeric(12, 3))
    unit: Mapped[str] = mapped_column(Text)
    reason: Mapped[str] = mapped_column(Text)
    value: Mapped[float] = mapped_column(Numeric(12, 2), server_default=text("0"))
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    created_by_name: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))


class MenuCategory(WarehouseBase):
    __tablename__ = "menu_categories"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    name: Mapped[str] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))


class MenuPosition(WarehouseBase):
    __tablename__ = "menu_positions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    category_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("menu_categories.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(Text)
    price: Mapped[float] = mapped_column(Numeric(12, 2))
    image_url: Mapped[str | None] = mapped_column(Text)
    order_step: Mapped[float | None] = mapped_column(Numeric(12, 3))
    order_unit: Mapped[str | None] = mapped_column(Text)
    comment: Mapped[str] = mapped_column(Text, server_default="")
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))

    ingredients: Mapped[list["MenuPositionIngredient"]] = relationship(cascade="all, delete-orphan")


class MenuPositionIngredient(WarehouseBase):
    __tablename__ = "menu_position_ingredients"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    menu_position_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("menu_positions.id", ondelete="CASCADE"))
    # ссылка на type, не на конкретный product — так работают FIFO/альтернативы
    type_id: Mapped[str] = mapped_column(ForeignKey("product_types.id", ondelete="RESTRICT"))
    alt_type_ids: Mapped[list[str]] = mapped_column(ARRAY(Text), server_default=text("'{}'"))
    amount: Mapped[float] = mapped_column(Numeric(12, 3))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))


class Order(WarehouseBase):
    __tablename__ = "orders"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    # атомарный номер на уровне БД — закрывает гонку, которая раньше решалась
    # на клиенте чтением "свежего" localStorage
    number: Mapped[int] = mapped_column(Integer, Identity(always=True), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(Text, server_default="active")
    kitchen_status: Mapped[str] = mapped_column(Text, server_default="new")
    route: Mapped[str] = mapped_column(Text)
    guest_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    guest_name: Mapped[str | None] = mapped_column(Text)
    total: Mapped[float] = mapped_column(Numeric(12, 2), server_default=text("0"))
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    created_by_name: Mapped[str | None] = mapped_column(Text)

    items: Mapped[list["OrderLine"]] = relationship(order_by="OrderLine.created_at", cascade="all, delete-orphan")


class OrderLine(WarehouseBase):
    __tablename__ = "order_lines"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"))
    menu_position_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("menu_positions.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(Text)
    price: Mapped[float] = mapped_column(Numeric(12, 2))
    quantity: Mapped[float] = mapped_column(Numeric(12, 3))
    comment: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))

    ingredients: Mapped[list["OrderLineIngredient"]] = relationship(cascade="all, delete-orphan")


class OrderLineIngredient(WarehouseBase):
    """Снимок состава строки заказа на момент оформления — нужен, чтобы точно
    вернуть на склад при отмене (typeId/raw_amount уже разрешены на момент
    заказа, независимо от того, что случится со складом дальше)."""

    __tablename__ = "order_line_ingredients"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    order_line_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("order_lines.id", ondelete="CASCADE"))
    type_id: Mapped[str] = mapped_column(Text)
    name: Mapped[str] = mapped_column(Text)
    amount_label: Mapped[str] = mapped_column(Text)
    raw_amount: Mapped[float] = mapped_column(Numeric(12, 3))


class ActivityLogEntry(WarehouseBase):
    """Журнал действий склада/меню/заказов — общий для всех устройств
    (заменяет прежний per-browser localStorage clientLog)."""

    __tablename__ = "activity_log"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    actor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    actor_name: Mapped[str | None] = mapped_column(Text)
    action: Mapped[str] = mapped_column(Text)
    entity: Mapped[str] = mapped_column(Text)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    payload: Mapped[dict] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
