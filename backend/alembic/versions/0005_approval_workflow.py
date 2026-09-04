"""Статусы подтверждения: игры одобряет админ, записи игроков — ГМ.

Существующие игры и брони считаем подтверждёнными.
"""

from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE games ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'approved', 'rejected'))
        """
    )
    op.execute("UPDATE games SET status = 'approved'")
    op.execute(
        """
        ALTER TABLE game_bookings ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'approved', 'rejected'))
        """
    )
    op.execute("UPDATE game_bookings SET status = 'approved'")


def downgrade() -> None:
    op.execute("ALTER TABLE game_bookings DROP COLUMN IF EXISTS status")
    op.execute("ALTER TABLE games DROP COLUMN IF EXISTS status")
