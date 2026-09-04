# Хитрый лис CRM

CRM для бара: фронт на Next.js, бэк на Python (FastAPI + uvicorn), Postgres.

## Локальный запуск

```bash
# фронт
npm run dev

# бэк (в отдельном терминале)
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Фронт откроется на `http://localhost:3000`; запросы `/api/*` он проксирует
на бэк (`next.config.ts`, переменная `API_PROXY_TARGET`, по умолчанию
`http://localhost:8000`). Демо-вход: `manager@lis.bar` / `demo` — фронт
логинится сам, у каждой роли свой аккаунт `<роль>@lis.bar`.

## API-контракт и мок через Prism

Источник правды по API — `openapi.yaml` в корне: бэк реализует его,
фронт ходит только по описанным эндпоинтам. У каждой операции есть
`x-status`: `live` (реализована на бэке) или `mock` (пока заглушка).
`next.config.ts` читает спеку при старте и проксирует каждый путь по
статусу: live → бэк (8000), mock → мок-сервер [Prism](https://github.com/stoplightio/prism) (4010),
который отвечает example-данными прямо из спеки.

Процесс: фронтендер добавляет нужный ему эндпоинт в спеку с
`x-status: mock` и примерами — и сразу работает с мок-данными;
бэкендер видит mock-операции, реализует их и меняет статус на `live`.

Запуск с моками (бэк при этом можно не поднимать):

```bash
npx @stoplight/prism-cli mock openapi.yaml -p 4010
npm run dev   # в отдельном терминале
```

После правки `openapi.yaml` dev-сервер фронта нужно перезапустить —
маршруты прокси строятся при старте. Полный оверрайд на мок:
`API_PROXY_TARGET=http://localhost:4010 npm run dev`.

Prism также валидирует запросы по схеме — если фронт шлёт что-то мимо
контракта, в логе мока будет ошибка. Это и есть проверка, что обе
стороны держатся одного `openapi.yaml`.

## Postgres

Бэк работает с настоящей БД: пользователи, argon2-пароли, сессии в таблице
`user_sessions` (принудительный разлогин = `POST /api/users/{id}/revoke-sessions`).

Первый запуск:

```bash
docker compose up -d            # Postgres; базовую схему применит сам из db/init/
cd backend
pip install -r requirements.txt
alembic upgrade head            # миграции: password_hash, user_sessions
python seed.py                  # демо-юзеры всех ролей, пароль demo
uvicorn main:app --reload --port 8000
```

Если Postgres не в докере — примени схему руками перед миграциями:
`psql "$DATABASE_URL" -f db/init/001_schema.sql`.

Настройки — через переменные окружения или `.env` в корне
(см. `.env.example`): `DATABASE_URL`, `SESSION_TTL_DAYS`, `COOKIE_SECURE`.

## Тесты бэка

Интеграционные, против настоящего Postgres с миграциями и seed:

```bash
cd backend
pip install -r requirements-dev.txt
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/hitry_lis_crm pytest -q
```

Тесты создают юзеров/квесты с префиксом `t-` и подчищают за собой.
Спека системы заданий — `docs/quests-auto-assign-plan.md`.
