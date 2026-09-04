"""Ревизия схемы: индексы под реальные запросы, единый тип статусов,
триггер updated_at и запрет пересекающихся броней на уровне БД.

Пересечения: у брони появляется slot (tstzrange), который ведут триггеры по
данным игры. EXCLUDE поверх него физически не даёт одному игроку занять два
пересекающихся стола — это страховка к проверке в коде. Отменённая игра
обнуляет slot, поэтому её брони никому не мешают.
"""

from alembic import op

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- индексы под запросы, которых раньше не покрывали ---
    op.execute("CREATE INDEX IF NOT EXISTS quests_assignee_idx ON quests(assignee_id)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS audit_events_entity_idx ON audit_events(entity, entity_id, created_at DESC)"
    )
    op.execute("CREATE INDEX IF NOT EXISTS audit_events_created_idx ON audit_events(created_at DESC)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS user_sessions_expires_idx ON user_sessions(expires_at) "
        "WHERE revoked_at IS NULL"
    )

    # --- статусы одним типом: role тоже text + CHECK, как всё остальное ---
    op.execute("DROP VIEW IF EXISTS user_facts")
    op.execute("ALTER TABLE app_users ALTER COLUMN role DROP DEFAULT")
    op.execute("ALTER TABLE app_users ALTER COLUMN role TYPE text USING role::text")
    op.execute("ALTER TABLE app_users ALTER COLUMN role SET DEFAULT 'user'")
    op.execute(
        "ALTER TABLE app_users ADD CONSTRAINT app_users_role_check "
        "CHECK (role IN ('user', 'gamemaster', 'bartender', 'manager', 'admin'))"
    )
    op.execute("DROP TYPE IF EXISTS app_role")
    # view пересоздаём: он зависел от старого типа колонки
    op.execute(
        """
        CREATE OR REPLACE VIEW user_facts AS
        SELECT
          u.id, u.name, u.email, u.phone, u.telegram, u.title, u.avatar, u.role, u.xp,
          u.is_active, u.created_at,
          (SELECT count(*) FROM game_bookings b JOIN games g ON g.id = b.game_id
             WHERE b.user_id = u.id AND b.status = 'approved' AND g.status = 'approved'
               AND NOT g.is_cancelled AND g.starts_at < now())::int AS games_played,
          (SELECT count(*) FROM games g
             WHERE g.master_id = u.id AND g.status = 'approved'
               AND NOT g.is_cancelled AND g.starts_at < now())::int AS games_mastered
        FROM app_users u
        """
    )

    # --- updated_at ведёт БД, а не каждый вызов в коде ---
    op.execute(
        """
        CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
        BEGIN
          NEW.updated_at := now();
          RETURN NEW;
        END $$ LANGUAGE plpgsql;
        """
    )
    for table in ("app_users", "games", "quests", "quest_assignments", "login_attempts"):
        op.execute(f"DROP TRIGGER IF EXISTS {table}_touch ON {table}")
        op.execute(
            f"CREATE TRIGGER {table}_touch BEFORE UPDATE ON {table} "
            f"FOR EACH ROW EXECUTE FUNCTION touch_updated_at()"
        )

    # --- время брони рядом с бронью: нужно для EXCLUDE ---
    op.execute("ALTER TABLE game_bookings ADD COLUMN IF NOT EXISTS slot tstzrange")
    op.execute(
        """
        CREATE OR REPLACE FUNCTION booking_slot_from_game() RETURNS trigger AS $$
        DECLARE g games%ROWTYPE;
        BEGIN
          SELECT * INTO g FROM games WHERE id = NEW.game_id;
          IF g.id IS NULL OR g.is_cancelled OR g.status <> 'approved' OR NEW.status = 'rejected' THEN
            NEW.slot := NULL;
          ELSE
            NEW.slot := tstzrange(g.starts_at, g.starts_at + (g.duration_hours || ' hours')::interval, '[)');
          END IF;
          RETURN NEW;
        END $$ LANGUAGE plpgsql;
        """
    )
    op.execute("DROP TRIGGER IF EXISTS game_bookings_slot ON game_bookings")
    op.execute(
        "CREATE TRIGGER game_bookings_slot BEFORE INSERT OR UPDATE ON game_bookings "
        "FOR EACH ROW EXECUTE FUNCTION booking_slot_from_game()"
    )
    op.execute(
        """
        CREATE OR REPLACE FUNCTION refresh_bookings_slots() RETURNS trigger AS $$
        BEGIN
          UPDATE game_bookings SET slot = CASE
            WHEN NEW.is_cancelled OR NEW.status <> 'approved' OR status = 'rejected' THEN NULL
            ELSE tstzrange(NEW.starts_at, NEW.starts_at + (NEW.duration_hours || ' hours')::interval, '[)')
          END
          WHERE game_id = NEW.id;
          RETURN NEW;
        END $$ LANGUAGE plpgsql;
        """
    )
    op.execute("DROP TRIGGER IF EXISTS games_slot_refresh ON games")
    op.execute(
        "CREATE TRIGGER games_slot_refresh AFTER UPDATE OF starts_at, duration_hours, is_cancelled, status "
        "ON games FOR EACH ROW EXECUTE FUNCTION refresh_bookings_slots()"
    )
    op.execute(
        """
        UPDATE game_bookings b SET slot = tstzrange(
          g.starts_at, g.starts_at + (g.duration_hours || ' hours')::interval, '[)')
        FROM games g
        WHERE g.id = b.game_id AND NOT g.is_cancelled AND g.status = 'approved' AND b.status <> 'rejected'
        """
    )
    # EXCLUDE требует btree_gist; в окружениях без contrib остаётся проверка в коде
    op.execute(
        """
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'btree_gist') THEN
            CREATE EXTENSION IF NOT EXISTS btree_gist;
            BEGIN
              ALTER TABLE game_bookings ADD CONSTRAINT game_bookings_no_overlap
                EXCLUDE USING gist (user_id WITH =, slot WITH &&);
            EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
            END;
          ELSE
            RAISE NOTICE 'btree_gist недоступен — EXCLUDE не создан, пересечения ловит только код';
          END IF;
        END $$;
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE game_bookings DROP CONSTRAINT IF EXISTS game_bookings_no_overlap")
    op.execute("DROP TRIGGER IF EXISTS games_slot_refresh ON games")
    op.execute("DROP TRIGGER IF EXISTS game_bookings_slot ON game_bookings")
    op.execute("DROP FUNCTION IF EXISTS refresh_bookings_slots()")
    op.execute("DROP FUNCTION IF EXISTS booking_slot_from_game()")
    op.execute("ALTER TABLE game_bookings DROP COLUMN IF EXISTS slot")
    for table in ("app_users", "games", "quests", "quest_assignments", "login_attempts"):
        op.execute(f"DROP TRIGGER IF EXISTS {table}_touch ON {table}")
    op.execute("DROP FUNCTION IF EXISTS touch_updated_at()")
    op.execute("ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_role_check")
    op.execute("DROP INDEX IF EXISTS user_sessions_expires_idx")
    op.execute("DROP INDEX IF EXISTS audit_events_created_idx")
    op.execute("DROP INDEX IF EXISTS audit_events_entity_idx")
    op.execute("DROP INDEX IF EXISTS quests_assignee_idx")
