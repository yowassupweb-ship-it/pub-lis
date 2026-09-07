#!/usr/bin/env bash
# Снимок состояния «Лисьей Норы»: обе базы, загруженные аватарки и метаданные.
#
#   ./backup.sh                    снимок в ./backups
#   ./backup.sh --label pre-update пометка попадёт в имя файла
#   ./backup.sh --out /mnt/disk    складывать в другое место
#   ./backup.sh --keep 30          сколько снимков оставить (по умолчанию 14)
#   ./backup.sh --no-secrets       не класть .env внутрь
#
# Разворачивает снимок обратно restore.sh.
set -euo pipefail
cd "$(dirname "$0")"

COMPOSE="docker compose -f docker-compose.prod.yml"
OUT_DIR="backups"
KEEP=14
LABEL=""
WITH_SECRETS=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --out) OUT_DIR="$2"; shift 2 ;;
    --keep) KEEP="$2"; shift 2 ;;
    --label) LABEL="$2"; shift 2 ;;
    --no-secrets) WITH_SECRETS=0; shift ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "Неизвестный аргумент: $1" >&2; exit 2 ;;
  esac
done

die() { echo "ОШИБКА: $*" >&2; exit 1; }
say() { echo "== $*"; }

[[ -f docker-compose.prod.yml ]] || die "запускать из каталога проекта"
command -v docker >/dev/null || die "docker не найден"

# .env нужен ради имён баз и пароля; в проде он рядом с compose-файлом
[[ -f .env ]] || die ".env не найден — без него неизвестно, какие базы дампить"
set -a; . ./.env; set +a

DB_MAIN="${POSTGRES_DB:-hitry_lis_crm}"
DB_WAREHOUSE="${WAREHOUSE_POSTGRES_DB:-hitry_lis_warehouse}"
PG_USER="${POSTGRES_USER:-postgres}"
PG_CONTAINER="hitry-lis-postgres"
API_CONTAINER="hitry-lis-api"

docker inspect "$PG_CONTAINER" >/dev/null 2>&1 || die "контейнер $PG_CONTAINER не найден — стек не поднят?"
[[ "$(docker inspect -f '{{.State.Running}}' "$PG_CONTAINER")" == "true" ]] \
  || die "$PG_CONTAINER не запущен: docker compose -f docker-compose.prod.yml up -d postgres"

STAMP="$(date +%Y%m%d-%H%M%S)"
NAME="lis-${STAMP}${LABEL:+-$LABEL}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$OUT_DIR"

# --- базы: custom-формат, его restore умеет накатывать с --clean ---
dump_db() {
  local db="$1" file="$2"
  if ! docker exec "$PG_CONTAINER" psql -U "$PG_USER" -lqtA -F: 2>/dev/null | cut -d: -f1 | grep -qx "$db"; then
    echo "   базы $db нет — пропускаю"
    return 0
  fi
  say "дамп базы $db"
  docker exec "$PG_CONTAINER" pg_dump -U "$PG_USER" -d "$db" -Fc --no-owner --no-acl > "$WORK/$file"
  [[ -s "$WORK/$file" ]] || die "дамп $db получился пустым"
  echo "   $(du -h "$WORK/$file" | cut -f1)"
}

dump_db "$DB_MAIN" db-main.dump
dump_db "$DB_WAREHOUSE" db-warehouse.dump

# --- аватарки: том, подключённый к api как /app/uploads ---
UPLOADS_VOL=""
if docker inspect "$API_CONTAINER" >/dev/null 2>&1; then
  UPLOADS_VOL="$(docker inspect "$API_CONTAINER" \
    --format '{{range .Mounts}}{{if eq .Destination "/app/uploads"}}{{.Name}}{{end}}{{end}}')"
fi
if [[ -n "$UPLOADS_VOL" ]]; then
  say "аватарки из тома $UPLOADS_VOL"
  # postgres:16-alpine уже скачан на сервере — берём его как «контейнер с tar»
  docker run --rm -v "$UPLOADS_VOL":/data:ro postgres:16-alpine \
    tar -czf - -C /data . > "$WORK/uploads.tar.gz"
  echo "   $(du -h "$WORK/uploads.tar.gz" | cut -f1)"
else
  say "том с аватарками не найден — снимок будет без них"
  : > "$WORK/uploads.tar.gz"
fi

# --- секреты: без них снимок не развернётся на чистой машине ---
if [[ "$WITH_SECRETS" == "1" ]]; then
  cp .env "$WORK/env"
  say ".env внутри — держи снимок как секрет"
else
  say "снимок без .env (--no-secrets)"
fi

# --- метаданные: по ним видно, к какому коду снимок подходит ---
ALEMBIC_MAIN="$(docker exec "$API_CONTAINER" alembic current 2>/dev/null | tail -1 || echo "неизвестно")"
ALEMBIC_WH="$(docker exec "$API_CONTAINER" alembic -c alembic_warehouse.ini current 2>/dev/null | tail -1 || echo "неизвестно")"
cat > "$WORK/meta.json" <<JSON
{
  "created_at": "$(date --iso-8601=seconds)",
  "host": "$(hostname)",
  "label": "${LABEL}",
  "git_commit": "$(git rev-parse --verify -q HEAD 2>/dev/null || echo unknown)",
  "git_branch": "$(git rev-parse --abbrev-ref --verify -q HEAD 2>/dev/null || echo unknown)",
  "databases": { "main": "$DB_MAIN", "warehouse": "$DB_WAREHOUSE" },
  "alembic": { "main": "$ALEMBIC_MAIN", "warehouse": "$ALEMBIC_WH" },
  "uploads_volume": "${UPLOADS_VOL:-нет}",
  "with_secrets": $([[ "$WITH_SECRETS" == "1" ]] && echo true || echo false),
  "format": 1
}
JSON

ARCHIVE="$OUT_DIR/$NAME.tar.gz"
tar -czf "$ARCHIVE" -C "$WORK" .
chmod 600 "$ARCHIVE"
(cd "$OUT_DIR" && sha256sum "$NAME.tar.gz" > "$NAME.tar.gz.sha256")

# --- ротация: старые снимки уезжают, чтобы диск не кончился ---
if [[ "$KEEP" -gt 0 ]]; then
  mapfile -t OLD < <(ls -1t "$OUT_DIR"/lis-*.tar.gz 2>/dev/null | tail -n "+$((KEEP + 1))")
  for f in "${OLD[@]:-}"; do
    [[ -n "$f" ]] || continue
    rm -f "$f" "$f.sha256"
    echo "   удалён старый снимок: $(basename "$f")"
  done
fi

say "готово: $ARCHIVE ($(du -h "$ARCHIVE" | cut -f1))"
echo "Развернуть: ./restore.sh $ARCHIVE"
