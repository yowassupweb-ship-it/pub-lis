"""Прод-ограничения для квестов: форма условий и инварианты — на уровне БД.

Приложение валидирует, но БД — последняя линия: кривой JSON, автовыдача
с персональным заданием или отрицательный XP не пройдут мимо любого кода.
"""

from alembic import op

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # JSON-null (артефакт ORM без none_as_null) -> настоящий SQL NULL
    op.execute("UPDATE quests SET complete_conditions = NULL WHERE complete_conditions = 'null'::jsonb")
    op.execute("UPDATE quests SET assign_conditions = NULL WHERE assign_conditions = 'null'::jsonb")
    op.execute(
        """
        ALTER TABLE quests
          ADD CONSTRAINT quests_complete_conditions_shape
            CHECK (complete_conditions IS NULL OR jsonb_typeof(complete_conditions) = 'array'),
          ADD CONSTRAINT quests_assign_conditions_shape
            CHECK (assign_conditions IS NULL OR jsonb_typeof(assign_conditions) = 'array'),
          ADD CONSTRAINT quests_auto_assign_not_personal
            CHECK (NOT auto_assign OR assignee_id IS NULL)
        """
    )
    op.execute("ALTER TABLE app_users ADD CONSTRAINT app_users_xp_nonnegative CHECK (xp >= 0)")
    # sync читает только активные автоквесты — частичный индекс ровно под этот запрос
    op.execute(
        "CREATE INDEX IF NOT EXISTS quests_auto_assign_active_idx ON quests (id) "
        "WHERE auto_assign AND is_active AND assignee_id IS NULL"
    )
    op.execute("CREATE INDEX IF NOT EXISTS quests_created_by_idx ON quests (created_by)")
    op.execute("CREATE INDEX IF NOT EXISTS games_master_idx ON games (master_id)")
    op.execute("CREATE INDEX IF NOT EXISTS audit_events_actor_created_idx ON audit_events (actor_id, created_at)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS audit_events_actor_created_idx")
    op.execute("DROP INDEX IF EXISTS games_master_idx")
    op.execute("DROP INDEX IF EXISTS quests_created_by_idx")
    op.execute("DROP INDEX IF EXISTS quests_auto_assign_active_idx")
    op.execute("ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_xp_nonnegative")
    op.execute(
        "ALTER TABLE quests DROP CONSTRAINT IF EXISTS quests_auto_assign_not_personal, "
        "DROP CONSTRAINT IF EXISTS quests_assign_conditions_shape, "
        "DROP CONSTRAINT IF EXISTS quests_complete_conditions_shape"
    )
