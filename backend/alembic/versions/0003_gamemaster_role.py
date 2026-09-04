"""Роль gamemaster для мастеров игр D&D."""

from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'gamemaster'")


def downgrade() -> None:
    raise NotImplementedError("Удаление значения из enum не поддерживается Postgres")
