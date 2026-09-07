#!/usr/bin/env bash
# Развернуть систему из снимка, сделанного backup.sh.
#
#   ./restore.sh backups/lis-20260904-181500.tar.gz
#   ./restore.sh снимок.tar.gz --yes          без вопросов (для автоматики)
#   ./restore.sh снимок.tar.gz --no-uploads   не трогать аватарки
#   ./restore.sh снимок.tar.gz --no-env       не подменять .env
#   ./restore.sh снимок.tar.gz --dry-run      только показать, что внутри
#
# Операция разрушительная: текущие базы заменяются содержимым снимка. Перед
# накатом скрипт сам делает страховочный снимок (если стек жив).
set -euo pipefail
cd "$(dirname "$0")"

COMPOSE="docker compose -f docker-compose.prod.yml"
PG_CONTAINER="hitry-lis-postgres"
API_CONTAINER="hitry-lis-api"
ASSUME_YES=0
WITH_UPLOADS=1
WITH_ENV=1
DRY_RUN=0
ARCHIVE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes|-y) ASSUME_YES=1; shift ;;
    --no-uploads) WITH_UPLOADS=0; shift ;;
    --no-env) WITH_ENV=0; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    -*) echo "Неизвестный аргумент: $1" >&2; exit 2 ;;
    *) ARCHIVE="$1"; shift ;;
  esac
done

die() { echo "ОШИБКА: $*" >&2; exit 1; }
say() { echo "== $*"; }

[[ -n "$ARCHIVE" ]] || die "укажи снимок: ./restore.sh backups/lis-*.tar.gz"
[[ -f "$ARCHIVE" ]] || die "файл не найден: $ARCHIVE"
[[ -f docker-compose.prod.yml ]] || die "запускать из каталога проекта"
command -v docker >/dev/null || die "docker не найден"

# --- целостность: контрольная сумма лежит рядом, если снимок делал backup.sh ---
if [[ -f "$ARCHIVE.sha256" ]]; then
  say "проверка контрольной суммы"
  (cd "$(dirname "$ARCHIVE")" && sha256sum -c "$(basename "$ARCHIVE").sha256" >/dev/null) \
    || die "контрольная сумма не сошлась — снимок повреждён"
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
tar -xzf "$ARCHIVE" -C "$WORK"
[[ -f "$WORK/meta.json" ]] || die "это не снимок «Лисьей Норы»: нет meta.json"

say "содержимое снимка"
sed 's/^/   /' "$WORK/meta.json"
for f in db-main.dump db-warehouse.dump uploads.tar.gz env; do
  [[ -s "$WORK/$f" ]] && echo "   есть: $f ($(du -h "$WORK/$f" | cut -f1))"
done

if [[ "$DRY_RUN" == "1" ]]; then
  say "--dry-run: ничего не меняю"
  exit 0
fi

if [[ "$ASSUME_YES" != "1" ]]; then
  echo
  echo "Текущие базы будут ЗАМЕНЕНЫ содержимым снимка. Это необратимо."
  read -r -p 'Напиши ДА, чтобы продолжить: ' answer
  [[ "$answer" == "ДА" ]] || die "отменено"
fi

# --- страховка: снимаем текущее состояние, пока действует ЕЩЁ СТАРЫЙ .env,
# иначе дамп уйдёт не из тех баз, что сейчас работают ---
if [[ -f .env && "$(docker inspect -f '{{.State.Running}}' "$PG_CONTAINER" 2>/dev/null || echo false)" == "true" ]]; then
  say "страховочный снимок текущего состояния"
  ./backup.sh --label before-restore --keep 0 >/dev/null && echo "   лежит в backups/"
fi

# --- .env: подменяем его до чтения переменных, иначе имена баз будут старыми ---
if [[ "$WITH_ENV" == "1" && -s "$WORK/env" ]]; then
  if [[ -f .env ]] && ! cmp -s "$WORK/env" .env; then
    cp .env ".env.before-restore-$(date +%Y%m%d-%H%M%S)"
    say "текущий .env сохранён рядом как .env.before-restore-*"
  fi
  cp "$WORK/env" .env
  chmod 600 .env
fi
[[ -f .env ]] || die ".env не найден и в снимке его нет — восстанавливать некуда"
set -a; . ./.env; set +a

DB_MAIN="${POSTGRES_DB:-hitry_lis_crm}"
DB_WAREHOUSE="${WAREHOUSE_POSTGRES_DB:-hitry_lis_warehouse}"
PG_USER="${POSTGRES_USER:-postgres}"

say "поднимаю postgres, останавливаю api и web"
$COMPOSE up -d postgres >/dev/null
$COMPOSE stop api web >/dev/null 2>&1 || true

for _ in $(seq 1 30); do
  docker exec "$PG_CONTAINER" pg_isready -U "$PG_USER" >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$PG_CONTAINER" pg_isready -U "$PG_USER" >/dev/null 2>&1 || die "postgres не поднялся"

restore_db() {
  local db="$1" file="$2"
  [[ -s "$WORK/$file" ]] || { echo "   в снимке нет $file — пропускаю"; return 0; }
  say "восстанавливаю базу $db"
  docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname='$db'" | grep -q 1 \
    || docker exec "$PG_CONTAINER" createdb -U "$PG_USER" "$db"
  # --clean --if-exists сносит старые объекты; ошибки на несуществующих глушим
  docker exec -i "$PG_CONTAINER" pg_restore -U "$PG_USER" -d "$db" \
    --clean --if-exists --no-owner --no-acl --single-transaction < "$WORK/$file"
  echo "   готово"
}

restore_db "$DB_MAIN" db-main.dump
restore_db "$DB_WAREHOUSE" db-warehouse.dump

# --- аватарки обратно в том ---
if [[ "$WITH_UPLOADS" == "1" && -s "$WORK/uploads.tar.gz" ]]; then
  $COMPOSE up -d --no-start api >/dev/null 2>&1 || true
  UPLOADS_VOL="$(docker inspect "$API_CONTAINER" \
    --format '{{range .Mounts}}{{if eq .Destination "/app/uploads"}}{{.Name}}{{end}}{{end}}' 2>/dev/null || true)"
  if [[ -n "$UPLOADS_VOL" ]]; then
    say "аватарки в том $UPLOADS_VOL"
    docker run --rm -i -v "$UPLOADS_VOL":/data postgres:16-alpine \
      sh -c 'find /data -mindepth 1 -delete; tar -xzf - -C /data'  < "$WORK/uploads.tar.gz"
  else
    say "том с аватарками не найден — файлы не восстановлены"
  fi
fi

say "поднимаю стек"
$COMPOSE up -d --build >/dev/null

# --- код может быть новее снимка: догоняем схему миграциями ---
say "миграции"
$COMPOSE exec -T api alembic upgrade head
$COMPOSE exec -T api alembic -c alembic_warehouse.ini upgrade head

say "проверка"
sleep 3
curl -sf http://localhost/api/health >/dev/null && echo "   api ок" || echo "   ВНИМАНИЕ: api не отвечает"
curl -sf -o /dev/null http://localhost && echo "   фронт ок" || echo "   ВНИМАНИЕ: фронт не отвечает"

USERS="$(docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$DB_MAIN" -tAc \
  'SELECT count(*) FROM app_users' 2>/dev/null || echo '?')"
GAMES="$(docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$DB_MAIN" -tAc \
  'SELECT count(*) FROM games' 2>/dev/null || echo '?')"
echo "   в базе: пользователей $USERS, игр $GAMES"
say "развёрнуто из $(basename "$ARCHIVE")"
