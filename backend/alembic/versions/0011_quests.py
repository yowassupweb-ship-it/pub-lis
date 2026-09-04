"""Задания (квесты) и опыт игроков."""

from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE app_users ADD COLUMN IF NOT EXISTS xp integer NOT NULL DEFAULT 0")
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS quests (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          title text NOT NULL,
          description text NOT NULL DEFAULT '',
          category text NOT NULL CHECK (category IN ('general', 'bar', 'game')),
          xp_reward integer NOT NULL CHECK (xp_reward BETWEEN 1 AND 10000),
          created_by uuid NOT NULL REFERENCES app_users(id),
          assignee_id uuid REFERENCES app_users(id),
          max_takers integer CHECK (max_takers >= 1),
          is_active boolean NOT NULL DEFAULT true,
          deadline timestamptz,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS quest_assignments (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          quest_id uuid NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
          user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
          status text NOT NULL DEFAULT 'taken'
            CHECK (status IN ('taken', 'submitted', 'completed', 'rejected')),
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (quest_id, user_id)
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS quest_assignments_user_idx ON quest_assignments(user_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS quest_assignments")
    op.execute("DROP TABLE IF EXISTS quests")
    op.execute("ALTER TABLE app_users DROP COLUMN IF EXISTS xp")
