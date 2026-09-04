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
