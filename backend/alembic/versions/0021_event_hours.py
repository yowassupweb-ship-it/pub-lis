"""Мероприятие проходит в конкретные часы, не только даты."""

from alembic import op

revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE events ADD COLUMN IF NOT EXISTS time_from text NOT NULL DEFAULT '15:00'")
    op.execute("ALTER TABLE events ADD COLUMN IF NOT EXISTS time_to text NOT NULL DEFAULT '23:00'")


def downgrade() -> None:
    op.execute("ALTER TABLE events DROP COLUMN IF EXISTS time_from")
    op.execute("ALTER TABLE events DROP COLUMN IF EXISTS time_to")
