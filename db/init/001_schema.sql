CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE app_role AS ENUM ('user', 'bartender', 'manager', 'admin');

CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text UNIQUE,
  role app_role NOT NULL DEFAULT 'user',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  normalized_name text NOT NULL UNIQUE,
  unit text NOT NULL DEFAULT 'шт',
  default_shelf_life_days integer NOT NULL DEFAULT 7,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier text,
  source_text text NOT NULL DEFAULT '',
  received_at date NOT NULL DEFAULT current_date,
  created_by uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier, received_at)
);

CREATE TABLE IF NOT EXISTS stock_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id uuid NOT NULL REFERENCES stock_positions(id) ON DELETE CASCADE,
  purchase_id uuid REFERENCES stock_purchases(id) ON DELETE SET NULL,
  quantity numeric(12, 3) NOT NULL CHECK (quantity >= 0),
  remaining_quantity numeric(12, 3) NOT NULL CHECK (remaining_quantity >= 0),
  unit text NOT NULL DEFAULT 'шт',
  total_price numeric(12, 2),
  unit_price numeric(12, 2),
  received_at date NOT NULL DEFAULT current_date,
  expires_at date NOT NULL,
  shelf_life_days integer NOT NULL DEFAULT 7,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (position_id, purchase_id)
);

CREATE TABLE IF NOT EXISTS stock_purchase_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES stock_purchases(id) ON DELETE CASCADE,
  position_id uuid NOT NULL REFERENCES stock_positions(id) ON DELETE RESTRICT,
  batch_id uuid NOT NULL REFERENCES stock_batches(id) ON DELETE CASCADE,
  source_name text NOT NULL,
  quantity numeric(12, 3) NOT NULL CHECK (quantity > 0),
  unit text NOT NULL DEFAULT 'шт',
  total_price numeric(12, 2),
  unit_price numeric(12, 2),
  shelf_life_days integer NOT NULL DEFAULT 7,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS menu_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  price numeric(12, 2),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS menu_position_ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_position_id uuid NOT NULL REFERENCES menu_positions(id) ON DELETE CASCADE,
  stock_position_id uuid NOT NULL REFERENCES stock_positions(id) ON DELETE RESTRICT,
  amount numeric(12, 3) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (menu_position_id, stock_position_id)
);

CREATE TABLE IF NOT EXISTS menu_position_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_position_id uuid NOT NULL REFERENCES menu_positions(id) ON DELETE RESTRICT,
  sold_by uuid REFERENCES app_users(id),
  sold_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_write_offs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid REFERENCES menu_position_sales(id) ON DELETE SET NULL,
  batch_id uuid NOT NULL REFERENCES stock_batches(id) ON DELETE RESTRICT,
  stock_position_id uuid NOT NULL REFERENCES stock_positions(id) ON DELETE RESTRICT,
  quantity numeric(12, 3) NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES app_users(id),
  action text NOT NULL,
  entity text NOT NULL,
  entity_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stock_batches_position_expires_idx
  ON stock_batches(position_id, expires_at);

CREATE INDEX IF NOT EXISTS menu_position_ingredients_position_idx
  ON menu_position_ingredients(stock_position_id);

INSERT INTO stock_positions (name, normalized_name, unit, default_shelf_life_days)
VALUES
  ('METRO Chef Лук сушеный жареный, 600г', 'metro chef лук сушеный жареный 600г', 'шт', 180),
  ('METRO Chef Дольки картофельные со специями быстрозамороженные, 2.5кг', 'metro chef дольки картофельные со специями быстрозамороженные 2 5кг', 'шт', 180),
  ('METRO Chef Бекон сырокопченый нарезка, 1кг', 'metro chef бекон сырокопченый нарезка 1кг', 'шт', 30),
  ('METRO Chef Рыбные палочки из филе минтая в панировке замороженные, 1кг', 'metro chef рыбные палочки из филе минтая в панировке замороженные 1кг', 'шт', 180),
  ('METRO Chef Кольца кальмара в панировке замороженные, 1кг', 'metro chef кольца кальмара в панировке замороженные 1кг', 'шт', 180),
  ('METRO Chef Картофель фри 9x9мм замороженный, 2.5кг', 'metro chef картофель фри 9x9мм замороженный 2 5кг', 'шт', 180),
  ('Соус Efko Food Professional цезарь 50.5%, 1кг', 'соус efko food professional цезарь 50 5 1кг', 'шт', 60),
  ('Соус Efko Food Special барбекю ГОСТ, 1кг', 'соус efko food special барбекю гост 1кг', 'шт', 60),
  ('Соус Efko Food Professional сырный 35%, 1кг', 'соус efko food professional сырный 35 1кг', 'шт', 60),
  ('METRO Chef Луковые кольца в панировке замороженные, 1кг', 'metro chef луковые кольца в панировке замороженные 1кг', 'шт', 180),
  ('METRO Chef Булочка для гамбургера с кунжутом замороженная 125мм (89г x 12шт), 1.068кг', 'metro chef булочка для гамбургера с кунжутом замороженная 125мм 89г x 12шт 1 068кг', 'шт', 90),
  ('Картофель фри Triumph без панировки быстрозамороженный 9 x 9мм, 2.5кг', 'картофель фри triumph без панировки быстрозамороженный 9 x 9мм 2 5кг', 'шт', 180),
  ('Соус Efko Food Professional чесночный ГОСТ 35%, 1кг', 'соус efko food professional чесночный гост 35 1кг', 'шт', 60),
  ('Соус Efko Food Special горчичный ГОСТ 22%, 1кг', 'соус efko food special горчичный гост 22 1кг', 'шт', 60),
  ('Куриные крылья', 'куриные крылья', 'кг', 5)
ON CONFLICT (normalized_name) DO UPDATE
SET unit = EXCLUDED.unit,
    default_shelf_life_days = EXCLUDED.default_shelf_life_days;

INSERT INTO stock_purchases (supplier, received_at, source_text)
VALUES
  ('METRO', '2026-06-23', 'Заказ 23 июня 2026, 00:24'),
  ('METRO', '2026-07-09', 'Заказ 9 июля 2026, 23:06'),
  ('METRO', '2026-08-08', 'Заказ 8 августа 2026, 16:56')
ON CONFLICT (supplier, received_at) DO NOTHING;

WITH seed_batches(normalized_name, received_at, quantity, total_price, shelf_life_days) AS (
  VALUES
    ('metro chef кольца кальмара в панировке замороженные 1кг', DATE '2026-06-23', 1.000, 1249.00, 180),
    ('metro chef рыбные палочки из филе минтая в панировке замороженные 1кг', DATE '2026-06-23', 2.000, 1438.00, 180),
    ('соус efko food professional цезарь 50 5 1кг', DATE '2026-06-23', 1.000, 329.00, 60),
    ('соус efko food special барбекю гост 1кг', DATE '2026-06-23', 2.000, 698.00, 60),
    ('соус efko food professional сырный 35 1кг', DATE '2026-06-23', 1.000, 329.00, 60),
    ('metro chef картофель фри 9x9мм замороженный 2 5кг', DATE '2026-06-23', 3.000, 1797.00, 180),
    ('metro chef луковые кольца в панировке замороженные 1кг', DATE '2026-07-09', 2.000, 918.00, 180),
    ('metro chef булочка для гамбургера с кунжутом замороженная 125мм 89г x 12шт 1 068кг', DATE '2026-07-09', 3.000, 1119.51, 90),
    ('картофель фри triumph без панировки быстрозамороженный 9 x 9мм 2 5кг', DATE '2026-07-09', 3.000, 1578.33, 180),
    ('соус efko food professional сырный 35 1кг', DATE '2026-07-09', 2.000, 576.40, 60),
    ('соус efko food professional чесночный гост 35 1кг', DATE '2026-07-09', 2.000, 576.40, 60),
    ('соус efko food special горчичный гост 22 1кг', DATE '2026-07-09', 1.000, NULL, 60),
    ('metro chef лук сушеный жареный 600г', DATE '2026-08-08', 1.000, 619.00, 180),
    ('metro chef дольки картофельные со специями быстрозамороженные 2 5кг', DATE '2026-08-08', 1.000, 569.00, 180),
    ('metro chef бекон сырокопченый нарезка 1кг', DATE '2026-08-08', 1.000, 769.00, 30),
    ('metro chef рыбные палочки из филе минтая в панировке замороженные 1кг', DATE '2026-08-08', 2.000, 1338.00, 180),
    ('metro chef кольца кальмара в панировке замороженные 1кг', DATE '2026-08-08', 1.000, 1249.00, 180),
    ('куриные крылья', DATE '2026-08-08', 8.000, NULL, 5)
)
INSERT INTO stock_batches (
  position_id,
  purchase_id,
  quantity,
  remaining_quantity,
  unit,
  total_price,
  unit_price,
  received_at,
  expires_at,
  shelf_life_days
)
SELECT
  sp.id,
  pu.id,
  sb.quantity,
  sb.quantity,
  sp.unit,
  sb.total_price,
  CASE WHEN sb.total_price IS NULL THEN NULL ELSE ROUND(sb.total_price / sb.quantity, 2) END,
  sb.received_at,
  sb.received_at + sb.shelf_life_days,
  sb.shelf_life_days
FROM seed_batches sb
JOIN stock_positions sp ON sp.normalized_name = sb.normalized_name
JOIN stock_purchases pu ON pu.supplier = 'METRO' AND pu.received_at = sb.received_at
ON CONFLICT (position_id, purchase_id) DO NOTHING;

INSERT INTO menu_positions (name, price)
VALUES
  ('Бургер классический', 590.00),
  ('Бургер BBQ', 640.00),
  ('Картошка фри', 290.00),
  ('Наггеты', 360.00),
  ('Крылья BBQ', 490.00)
ON CONFLICT (name) DO NOTHING;

WITH recipe(menu_name, stock_normalized_name, amount) AS (
  VALUES
    ('Бургер классический', 'metro chef булочка для гамбургера с кунжутом замороженная 125мм 89г x 12шт 1 068кг', 1.000),
    ('Бургер классический', 'metro chef бекон сырокопченый нарезка 1кг', 0.120),
    ('Бургер классический', 'соус efko food professional сырный 35 1кг', 0.040),
    ('Бургер классический', 'metro chef лук сушеный жареный 600г', 0.020),
    ('Бургер BBQ', 'metro chef булочка для гамбургера с кунжутом замороженная 125мм 89г x 12шт 1 068кг', 1.000),
    ('Бургер BBQ', 'metro chef бекон сырокопченый нарезка 1кг', 0.140),
    ('Бургер BBQ', 'соус efko food special барбекю гост 1кг', 0.050),
    ('Бургер BBQ', 'metro chef луковые кольца в панировке замороженные 1кг', 0.120),
    ('Картошка фри', 'картофель фри triumph без панировки быстрозамороженный 9 x 9мм 2 5кг', 0.200),
    ('Наггеты', 'metro chef рыбные палочки из филе минтая в панировке замороженные 1кг', 0.240),
    ('Наггеты', 'соус efko food professional чесночный гост 35 1кг', 0.040),
    ('Крылья BBQ', 'куриные крылья', 0.350),
    ('Крылья BBQ', 'соус efko food special барбекю гост 1кг', 0.060)
)
INSERT INTO menu_position_ingredients (menu_position_id, stock_position_id, amount)
SELECT mp.id, sp.id, recipe.amount
FROM recipe
JOIN menu_positions mp ON mp.name = recipe.menu_name
JOIN stock_positions sp ON sp.normalized_name = recipe.stock_normalized_name
ON CONFLICT (menu_position_id, stock_position_id) DO UPDATE
SET amount = EXCLUDED.amount;
