"""Фиксация базовой схемы (db/init/001_schema.sql).

Базовую схему применяет Postgres сам при первом старте контейнера
(docker-entrypoint-initdb.d) либо вручную:
    psql "$DATABASE_URL" -f db/init/001_schema.sql
Миграция лишь проверяет, что схема на месте.
"""

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    exists = conn.execute(sa.text("SELECT to_regclass('app_users')")).scalar()
    if exists is None:
        raise RuntimeError(
            "Базовая схема не применена. Выполни db/init/001_schema.sql "
            "(docker compose делает это сам при первом старте volume) и повтори."
        )


def downgrade() -> None:
    raise NotImplementedError("Базовая схема не откатывается")
