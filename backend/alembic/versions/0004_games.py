"""Игры D&D и брони мест."""

from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS games (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          title text NOT NULL,
          description text NOT NULL DEFAULT '',
          master_id uuid NOT NULL REFERENCES app_users(id),
          starts_at timestamptz NOT NULL,
          duration_hours integer NOT NULL DEFAULT 4 CHECK (duration_hours BETWEEN 1 AND 12),
          seats_total integer NOT NULL CHECK (seats_total BETWEEN 1 AND 20),
          is_cancelled boolean NOT NULL DEFAULT false,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS games_starts_idx ON games(starts_at)")
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS game_bookings (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
          user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
          created_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (game_id, user_id)
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS game_bookings")
    op.execute("DROP TABLE IF EXISTS games")
