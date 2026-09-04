"""Автовыдача квестов по предикату (см. docs/quests-auto-assign-plan.md).

auto_assign — квест выдаётся системой; assign_field/assign_value — кому
(пусто = всем). Профильные квесты из сида переводятся на auto_assign.
"""

from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE quests ADD COLUMN IF NOT EXISTS auto_assign boolean NOT NULL DEFAULT false")
    op.execute("ALTER TABLE quests ADD COLUMN IF NOT EXISTS assign_field text")
    op.execute("ALTER TABLE quests ADD COLUMN IF NOT EXISTS assign_value text")
    op.execute(
        "UPDATE quests SET auto_assign = true "
        "WHERE auto_field IS NOT NULL AND assignee_id IS NULL"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE quests DROP COLUMN IF EXISTS assign_value")
    op.execute("ALTER TABLE quests DROP COLUMN IF EXISTS assign_field")
    op.execute("ALTER TABLE quests DROP COLUMN IF EXISTS auto_assign")
