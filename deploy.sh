#!/usr/bin/env bash
# Обновление всего стека на сервере одной командой: ./deploy.sh
set -euo pipefail
cd "$(dirname "$0")"
COMPOSE="docker compose -f docker-compose.prod.yml"

echo "== git pull =="
git pull --ff-only

echo "== build + up =="
$COMPOSE up -d --build

echo "== миграции =="
$COMPOSE exec -T api alembic upgrade head

echo "== caddy: перечитать конфиг =="
$COMPOSE restart caddy >/dev/null

echo "== проверка =="
sleep 3
curl -sf http://localhost/api/health && echo " <- api ок"
curl -sf -o /dev/null http://localhost && echo "фронт ок"
echo "Готово."
