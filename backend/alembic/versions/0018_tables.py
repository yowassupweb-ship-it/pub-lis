"""Карта зала (столы/стены/двери) и брони столов по дате."""

from alembic import op

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS floor_maps (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          name text NOT NULL,
          layout jsonb NOT NULL DEFAULT '{"walls":[],"tables":[],"doors":[]}'::jsonb,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS table_bookings (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          map_id uuid NOT NULL REFERENCES floor_maps(id) ON DELETE CASCADE,
          table_id text NOT NULL,
          booking_date date NOT NULL,
          time_start text,
          time_end text,
          guest_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
          guest_name text,
          comment text NOT NULL DEFAULT '',
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS table_bookings_map_date_idx ON table_bookings(map_id, booking_date)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS table_bookings")
    op.execute("DROP TABLE IF EXISTS floor_maps")
