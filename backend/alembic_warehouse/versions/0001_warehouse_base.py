"""Базовая схема склада/меню/заказов — отдельная БД (не hitry_lis_crm).

Revision ID: 0001
Revises:
Create Date: 2026-09-06

"""

from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

# Те же id/name/unit, что раньше были захардкожены в src/lib/productTypes.ts —
# сохраняем строковые id, чтобы не переписывать typeId по всему фронту.
PRODUCT_TYPES = [
    ("type-burger-bun", "Булочка бургерная", "шт"),
    ("type-bacon", "Бекон", "кг"),
    ("type-cheese-sauce", "Соус сырный", "кг"),
    ("type-bbq-sauce", "Соус BBQ", "кг"),
    ("type-garlic-sauce", "Соус чесночный", "кг"),
    ("type-mustard-sauce", "Соус горчичный", "кг"),
    ("type-caesar-sauce", "Соус цезарь", "кг"),
    ("type-dried-onion", "Лук сушеный", "кг"),
    ("type-onion-rings", "Луковые кольца", "кг"),
    ("type-fries", "Картофель фри", "кг"),
    ("type-potato-wedges", "Картофельные дольки", "кг"),
    ("type-fish-sticks", "Рыбные палочки", "кг"),
    ("type-calamari", "Кольца кальмара", "кг"),
    ("type-chicken-wings", "Куриные крылья", "кг"),
    ("type-pickled-cucumber", "Огурец маринованный", "кг"),
    ("type-draft-lager", "Пиво лагер разливное", "л"),
    ("type-draft-ipa", "Пиво IPA разливное", "л"),
    ("type-draft-stout", "Пиво стаут разливное", "л"),
    ("type-plastic-bottle-05", "Бутылка пластиковая 0.5", "шт"),
    ("type-misc", "Другое", "шт"),
]


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS product_types (
          id text PRIMARY KEY,
          name text NOT NULL UNIQUE,
          unit text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        )
    """)
    for type_id, name, unit in PRODUCT_TYPES:
        op.execute(
            "INSERT INTO product_types (id, name, unit) VALUES "
            f"('{type_id}', '{name}', '{unit}') ON CONFLICT (id) DO NOTHING"
        )

    op.execute("""
        CREATE TABLE IF NOT EXISTS products (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          type_id text NOT NULL REFERENCES product_types(id) ON DELETE RESTRICT,
          name text NOT NULL,
          normalized_name text NOT NULL UNIQUE,
          package_size numeric(12,3) NOT NULL DEFAULT 1,
          stock_unit text NOT NULL DEFAULT 'шт',
          shelf_life_days integer NOT NULL DEFAULT 7,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS products_type_idx ON products(type_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS purchases (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          supplier text,
          source_text text NOT NULL DEFAULT '',
          received_at date NOT NULL DEFAULT CURRENT_DATE,
          created_by uuid,
          created_by_name text,
          created_at timestamptz NOT NULL DEFAULT now()
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS product_batches (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
          purchase_id uuid REFERENCES purchases(id) ON DELETE SET NULL,
          packs numeric(12,3) NOT NULL CHECK (packs >= 0),
          remaining_amount numeric(12,3) NOT NULL CHECK (remaining_amount >= 0),
          total_price numeric(12,2),
          received_at date NOT NULL DEFAULT CURRENT_DATE,
          expires_at date NOT NULL,
          shelf_life_days integer NOT NULL DEFAULT 7,
          created_at timestamptz NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS product_batches_product_expires_idx ON product_batches(product_id, expires_at)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS purchase_items (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          purchase_id uuid NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
          product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
          batch_id uuid NOT NULL REFERENCES product_batches(id) ON DELETE CASCADE,
          quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
          unit_price numeric(12,2),
          total_price numeric(12,2),
          created_at timestamptz NOT NULL DEFAULT now()
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS write_offs (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
          batch_id uuid NOT NULL REFERENCES product_batches(id) ON DELETE RESTRICT,
          product_name text NOT NULL,
          amount numeric(12,3) NOT NULL CHECK (amount > 0),
          unit text NOT NULL,
          reason text NOT NULL,
          value numeric(12,2) NOT NULL DEFAULT 0,
          created_by uuid,
          created_by_name text,
          created_at timestamptz NOT NULL DEFAULT now()
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS menu_categories (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          name text NOT NULL,
          sort_order integer NOT NULL DEFAULT 0,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS menu_positions (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          category_id uuid REFERENCES menu_categories(id) ON DELETE SET NULL,
          name text NOT NULL,
          price numeric(12,2) NOT NULL,
          image_url text,
          order_step numeric(12,3),
          order_unit text,
          comment text NOT NULL DEFAULT '',
          is_active boolean NOT NULL DEFAULT true,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS menu_positions_category_idx ON menu_positions(category_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS menu_position_ingredients (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          menu_position_id uuid NOT NULL REFERENCES menu_positions(id) ON DELETE CASCADE,
          type_id text NOT NULL REFERENCES product_types(id) ON DELETE RESTRICT,
          alt_type_ids text[] NOT NULL DEFAULT '{}',
          amount numeric(12,3) NOT NULL CHECK (amount > 0),
          created_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (menu_position_id, type_id)
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS orders (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          number integer GENERATED ALWAYS AS IDENTITY UNIQUE,
          created_at timestamptz NOT NULL DEFAULT now(),
          completed_at timestamptz,
          status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
          kitchen_status text NOT NULL DEFAULT 'new' CHECK (kitchen_status IN ('new', 'accepted', 'ready', 'done')),
          route text NOT NULL CHECK (route IN ('kitchen', 'self')),
          guest_id uuid,
          guest_name text,
          total numeric(12,2) NOT NULL DEFAULT 0,
          created_by uuid,
          created_by_name text
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS orders_status_route_idx ON orders(status, route)")
    op.execute("CREATE INDEX IF NOT EXISTS orders_created_idx ON orders(created_at)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS order_lines (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
          menu_position_id uuid REFERENCES menu_positions(id) ON DELETE SET NULL,
          name text NOT NULL,
          price numeric(12,2) NOT NULL,
          quantity numeric(12,3) NOT NULL,
          comment text,
          created_at timestamptz NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS order_lines_order_idx ON order_lines(order_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS order_line_ingredients (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          order_line_id uuid NOT NULL REFERENCES order_lines(id) ON DELETE CASCADE,
          type_id text NOT NULL,
          name text NOT NULL,
          amount_label text NOT NULL,
          raw_amount numeric(12,3) NOT NULL
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS order_line_ingredients_line_idx ON order_line_ingredients(order_line_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS activity_log (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          actor_id uuid,
          actor_name text,
          action text NOT NULL,
          entity text NOT NULL,
          entity_id uuid,
          payload jsonb NOT NULL DEFAULT '{}'::jsonb,
          created_at timestamptz NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS activity_log_created_idx ON activity_log(created_at)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS activity_log")
    op.execute("DROP TABLE IF EXISTS order_line_ingredients")
    op.execute("DROP TABLE IF EXISTS order_lines")
    op.execute("DROP TABLE IF EXISTS orders")
    op.execute("DROP TABLE IF EXISTS menu_position_ingredients")
    op.execute("DROP TABLE IF EXISTS menu_positions")
    op.execute("DROP TABLE IF EXISTS menu_categories")
    op.execute("DROP TABLE IF EXISTS write_offs")
    op.execute("DROP TABLE IF EXISTS purchase_items")
    op.execute("DROP TABLE IF EXISTS product_batches")
    op.execute("DROP TABLE IF EXISTS purchases")
    op.execute("DROP TABLE IF EXISTS products")
    op.execute("DROP TABLE IF EXISTS product_types")
