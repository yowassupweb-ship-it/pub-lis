"""Условия квестов как структура + view user_facts.

Строковый DSL (auto_field/auto_value, assign_field/assign_value) заменяется на
JSONB-списки условий [{field, op, value}] — AND по списку, оператор — enum,
валидация на записи. Факты о юзере (в т.ч. счётчики по броням) читаются из
view user_facts, без материализованных столбцов и хуков.
retro_credit=false — не выдавать тем, кто условие выполнения уже закрыл.
"""

from alembic import op

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE quests ADD COLUMN IF NOT EXISTS complete_conditions jsonb")
    op.execute("ALTER TABLE quests ADD COLUMN IF NOT EXISTS assign_conditions jsonb")
    op.execute(
        "ALTER TABLE quests ADD COLUMN IF NOT EXISTS retro_credit boolean NOT NULL DEFAULT true"
    )
    # Конвертация старого DSL: "a,b" + value -> [{field:a,op,value},{field:b,op,value}]
    op.execute(
        """
        CREATE OR REPLACE FUNCTION _quest_cond(fields text, val text) RETURNS jsonb AS $$
        DECLARE f text; res jsonb := '[]'::jsonb; o text; v text;
        BEGIN
          IF fields IS NULL OR btrim(fields) = '' THEN RETURN NULL; END IF;
          v := btrim(coalesce(val, ''));
          IF v = '' THEN o := 'filled'; v := NULL;
          ELSIF v LIKE '>=%' THEN o := 'gte'; v := btrim(substr(v, 3));
          ELSIF v LIKE '<=%' THEN o := 'lte'; v := btrim(substr(v, 3));
          ELSIF v LIKE '!=%' THEN o := 'ne';  v := btrim(substr(v, 3));
          ELSIF v LIKE '>%'  THEN o := 'gt';  v := btrim(substr(v, 2));
          ELSIF v LIKE '<%'  THEN o := 'lt';  v := btrim(substr(v, 2));
          ELSE o := 'eq'; END IF;
          FOREACH f IN ARRAY string_to_array(fields, ',') LOOP
            IF btrim(f) <> '' THEN
              res := res || jsonb_build_object('field', btrim(f), 'op', o, 'value', v);
            END IF;
          END LOOP;
          RETURN res;
        END $$ LANGUAGE plpgsql;
        """
    )
    op.execute("UPDATE quests SET complete_conditions = _quest_cond(auto_field, auto_value)")
    op.execute(
        "UPDATE quests SET assign_conditions = coalesce(_quest_cond(assign_field, assign_value), '[]'::jsonb) "
        "WHERE auto_assign"
    )
    op.execute("DROP FUNCTION _quest_cond(text, text)")
    op.execute("ALTER TABLE quests DROP COLUMN IF EXISTS auto_field")
    op.execute("ALTER TABLE quests DROP COLUMN IF EXISTS auto_value")
    op.execute("ALTER TABLE quests DROP COLUMN IF EXISTS assign_field")
    op.execute("ALTER TABLE quests DROP COLUMN IF EXISTS assign_value")

    # Факты о юзере для предикатов: профиль + агрегаты по играм
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


def downgrade() -> None:
    op.execute("DROP VIEW IF EXISTS user_facts")
    op.execute("ALTER TABLE quests DROP COLUMN IF EXISTS retro_credit")
    op.execute("ALTER TABLE quests DROP COLUMN IF EXISTS assign_conditions")
    op.execute("ALTER TABLE quests DROP COLUMN IF EXISTS complete_conditions")
