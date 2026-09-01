# Хитрый лис CRM

CRM-интерфейс для бара на Next.js, Node.js и Postgres.

## Локальный запуск

```bash
npm run dev
```

Приложение откроется на `http://localhost:3000`.

## Postgres

На текущей машине обнаружена запущенная Windows-служба `postgresql-x64-16`, но пароль пользователя `postgres` не задан в окружении, поэтому схема не применялась автоматически.

Для контейнерного запуска после установки Docker Desktop:

```bash
docker compose up -d
```

Пустая схема базы лежит в `db/init/001_schema.sql`. Seed-данных нет.
