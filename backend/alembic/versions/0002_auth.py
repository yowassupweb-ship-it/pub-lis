"""password_hash у app_users + таблица user_sessions."""

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE app_users ADD COLUMN IF NOT EXISTS password_hash text")
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS user_sessions (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
          token_hash text NOT NULL UNIQUE,
          created_at timestamptz NOT NULL DEFAULT now(),
          expires_at timestamptz NOT NULL,
          revoked_at timestamptz,
          ip text,
          user_agent text
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS user_sessions_user_idx ON user_sessions(user_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS user_sessions")
    op.execute("ALTER TABLE app_users DROP COLUMN IF EXISTS password_hash")
