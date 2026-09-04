"""Email без учёта регистра.

Существующие адреса приводятся к нижнему регистру. Если при этом возникает
дубль (weak@ и WEAK@) — старший по дате аккаунт получает нормальный email,
младший переименовывается в '<email>.dup-<id8>' и деактивируется (данные не
теряются, админ разберётся руками). Сверху — уникальный индекс по lower(email).
"""

from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        DECLARE r RECORD;
        BEGIN
          FOR r IN
            SELECT id, email FROM app_users
            WHERE email IS NOT NULL AND email <> lower(email)
            ORDER BY created_at
          LOOP
            IF EXISTS (
              SELECT 1 FROM app_users
              WHERE lower(email) = lower(r.email) AND id <> r.id
            ) THEN
              UPDATE app_users
              SET email = lower(email) || '.dup-' || left(id::text, 8),
                  is_active = false
              WHERE id = r.id;
            ELSE
              UPDATE app_users SET email = lower(email) WHERE id = r.id;
            END IF;
          END LOOP;
        END $$;
        """
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS app_users_email_lower_idx ON app_users (lower(email))"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS app_users_email_lower_idx")
