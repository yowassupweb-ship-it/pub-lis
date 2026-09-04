"""Титулы пользователей — декоративные подписи по заслугам."""

from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE app_users ADD COLUMN IF NOT EXISTS title text")


def downgrade() -> None:
    op.execute("ALTER TABLE app_users DROP COLUMN IF EXISTS title")
