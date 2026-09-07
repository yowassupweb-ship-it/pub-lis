# Деплой «Хитрого лиса»

Вся система живёт на одном VPS в Docker: Caddy (вход :80/:443) →
фронт Next.js (`web`) и FastAPI (`api`) → Postgres. Vercel не нужен
(опционально — превью веток).

## Первый запуск на сервере

Нужны: Docker (`curl -fsSL https://get.docker.com | sh`), открытые порты 80/443.

```bash
git clone <репозиторий> && cd <папка>
cp .env.example .env
nano .env   # ОБЯЗАТЕЛЬНО: свой POSTGRES_PASSWORD
            # API_DOMAIN=домен (TLS сам) или ":80" для демо по IP (тогда COOKIE_SECURE=0)

docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec api alembic upgrade head
docker compose -f docker-compose.prod.yml exec api python seed.py   # демо-данные
```

Проверка: `curl http://localhost/api/health` → `{"status":"ok"}`,
в браузере `http://<IP>` — расписание игр.

Если сборка фронта падает по памяти (VPS < 2ГБ) — добавь swap:
`fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile`.

## Обновление

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec api alembic upgrade head
```

## Бэкапы

Снимок текущего состояния — `./backup.sh`. Внутрь попадают обе базы
(`hitry_lis_crm` и `hitry_lis_warehouse`) в формате `pg_dump -Fc`, том с
загруженными аватарками, `.env` и метаданные: дата, коммит, версии alembic.
Архив кладётся в `backups/` с правами 600 и контрольной суммой рядом.

```bash
./backup.sh                     # снимок + ротация (держим 14 последних)
./backup.sh --label pre-update  # пометка попадёт в имя файла
./backup.sh --out /mnt/backup   # складывать на другой диск
./backup.sh --no-secrets        # без .env, если снимок уезжает наружу
```

Развернуть систему из снимка — `./restore.sh`:

```bash
./restore.sh backups/lis-20260904-181500.tar.gz            # спросит подтверждение
./restore.sh backups/lis-*.tar.gz --dry-run                # только показать, что внутри
./restore.sh backups/lis-*.tar.gz --yes                    # без вопросов, для автоматики
./restore.sh backups/lis-*.tar.gz --no-uploads --no-env    # только базы
```

Что делает `restore.sh`: сверяет контрольную сумму, показывает метаданные,
сам снимает страховочный снимок текущего состояния (метка `before-restore`),
останавливает `api` и `web`, накатывает дампы через `pg_restore --clean
--if-exists --single-transaction`, возвращает аватарки в том, поднимает стек,
прогоняет обе цепочки миграций (код может быть новее снимка) и проверяет, что
API и фронт отвечают. Текущий `.env` перед подменой сохраняется рядом как
`.env.before-restore-*`.

Снимок содержит пароли и персональные данные: `backups/` исключён из git,
храни архивы как секрет и увози копию с сервера. Ежедневный снимок в 4 утра:

```
0 4 * * * cd /path/to/repo && ./backup.sh --keep 14 >> /var/log/lis-backup.log 2>&1
```

Раз в месяц стоит проверять, что снимок разворачивается: подними стек на
запасной машине и накати туда последний архив — бэкап, который ни разу не
восстанавливали, бэкапом не считается.

## Обслуживание

Аудит, истёкшие сессии и счётчики попыток входа растут — чистим по расписанию.
Раз в сутки на сервере (crontab -e):

```
0 5 * * * cd /path/to/repo && docker compose -f docker-compose.prod.yml exec -T api python cleanup.py >> /var/log/lis-cleanup.log 2>&1
```

Глубина хранения аудита — `AUDIT_KEEP_DAYS` в `.env` (по умолчанию 90 дней).

## Полезное

- Роль пользователю: `docker compose -f docker-compose.prod.yml exec api python set_role.py <email> admin`
  (без аргументов — список всех).
- Логи: `docker compose -f docker-compose.prod.yml logs -f api` (или web/caddy/postgres).
- Полный сброс данных: `docker compose -f docker-compose.prod.yml down -v`, затем первый запуск заново.
- Локальная разработка не меняется: `docker compose up -d` (только Postgres),
  uvicorn и `npm run dev` руками, мок Prism по README.

## Демо-аккаунты (пароль у всех: demo)

admin@lis.bar (админ) · manager@lis.bar (менеджер) · gm@lis.bar, mira@lis.bar (ГМ)
· user@lis.bar, polina@lis.bar, stas@lis.bar, vika@lis.bar (игроки)

## Сценарий показа (5 минут)

1. Инкогнито (гость): расписание недели — полная игра серым, полупустая жёлтым.
2. Регистрация нового игрока → заявка на «Ваншот» → статус «заявка у ГМа».
3. Окно ГМа (gm@lis.bar): клик по игре → одобрить заявку → у игрока «вы записаны».
4. ГМ: «Забронировать игру» → заявка уходит админу (фиолетовая в сетке).
5. Окно админа: клик по фиолетовой → «Подтвердить игру» → открылась запись.
6. Бонус: клик по имени игрока в заявках → профиль с историей; «Служебный
   раздел» — склад и позиции бара.
