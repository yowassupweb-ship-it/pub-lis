"""Комментарий персонала к гостю (например «любит лагер»)."""

from alembic import op

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE app_users ADD COLUMN IF NOT EXISTS comment text NOT NULL DEFAULT ''")


def downgrade() -> None:
    op.execute("ALTER TABLE app_users DROP COLUMN IF EXISTS comment")
