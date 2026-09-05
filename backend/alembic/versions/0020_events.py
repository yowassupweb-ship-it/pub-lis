"""Мероприятия бара — название, число участников, диапазон дат."""

from alembic import op

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS events (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          name text NOT NULL,
          participants_count integer NOT NULL CHECK (participants_count >= 0),
          date_from date NOT NULL,
          date_to date NOT NULL CHECK (date_to >= date_from),
          created_at timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS events_date_idx ON events(date_from, date_to)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS events")
