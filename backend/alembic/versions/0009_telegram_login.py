"""Телеграм — основной логин: нормализация и уникальность.

Существующие ники приводятся к нижнему регистру без '@'. При дублях ник
остаётся у старшего аккаунта, у младших обнуляется (это контакт, не логин —
пользователь заполнит заново). Уникальный индекс по lower(telegram).
"""

from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "UPDATE app_users SET telegram = lower(ltrim(trim(telegram), '@')) WHERE telegram IS NOT NULL"
    )
    op.execute("UPDATE app_users SET telegram = NULL WHERE telegram = ''")
    op.execute(
        """
        UPDATE app_users u SET telegram = NULL
        WHERE telegram IS NOT NULL AND EXISTS (
          SELECT 1 FROM app_users v
          WHERE v.telegram = u.telegram AND v.created_at < u.created_at
        )
        """
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS app_users_telegram_lower_idx "
        "ON app_users (lower(telegram)) WHERE telegram IS NOT NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS app_users_telegram_lower_idx")
