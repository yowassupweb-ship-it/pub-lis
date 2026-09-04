"""Телефон и телеграм в профиле пользователя."""

from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE app_users ADD COLUMN IF NOT EXISTS phone text")
    op.execute("ALTER TABLE app_users ADD COLUMN IF NOT EXISTS telegram text")


def downgrade() -> None:
    op.execute("ALTER TABLE app_users DROP COLUMN IF EXISTS telegram")
    op.execute("ALTER TABLE app_users DROP COLUMN IF EXISTS phone")
