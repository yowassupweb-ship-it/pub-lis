"""Автопроверяемые задания: целевой столбец app_users и нужное значение.

auto_field — имя столбца (или несколько через запятую: все должны быть
заполнены); auto_value — требуемое значение (NULL = «поле заполнено»).
"""

from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE quests ADD COLUMN IF NOT EXISTS auto_field text")
    op.execute("ALTER TABLE quests ADD COLUMN IF NOT EXISTS auto_value text")


def downgrade() -> None:
    op.execute("ALTER TABLE quests DROP COLUMN IF EXISTS auto_value")
    op.execute("ALTER TABLE quests DROP COLUMN IF EXISTS auto_field")
