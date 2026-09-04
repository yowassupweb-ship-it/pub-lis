"""Троттлинг логина в БД (переживает рестарт и работает на нескольких воркерах)
+ недостающий индекс по броням игрока."""

from alembic import op

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS login_attempts (
          ident text PRIMARY KEY,
          failures integer NOT NULL DEFAULT 0,
          locked_until timestamptz,
          updated_at timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS login_attempts_updated_idx ON login_attempts(updated_at)")
    op.execute("CREATE INDEX IF NOT EXISTS game_bookings_user_idx ON game_bookings(user_id)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS game_bookings_user_idx")
    op.execute("DROP TABLE IF EXISTS login_attempts")
