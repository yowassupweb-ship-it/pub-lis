# Деплой lis-pub на Vercel

Интерфейс полностью клиентский: данные (склад, закупки, позиции) лежат в коде как тестовые сиды
и в `localStorage` браузера. Ни базы, ни переменных окружения для показа не нужно.

## Что уже готово

- `package.json` → `"name": "lis-pub"` — Vercel предложит именно это имя проекта.
- `vercel.json` — framework `nextjs`, сборка `next build --webpack`.
  Webpack выбран специально: локальный нативный `@next/swc-win32-x64-msvc` битый, и эта команда проверена.
- `.vercelignore` — в деплой не уезжают `node_modules`, `.next`, `db/`, `docker-compose.yml`, скриншоты и заметки агентов.
- `npm run build` проходит: маршрут `/` собирается как статическая страница.

## Как выложить

```powershell
cd C:\Users\a.nikolyuk\Desktop\лис\bar-crm-temp
vercel login        # если ещё не залогинен
vercel              # первый деплой: подтвердить имя проекта lis-pub -> preview-ссылка
vercel --prod       # продакшн-ссылка lis-pub.vercel.app
```

На вопросы CLI при первом запуске:

- Set up and deploy — `y`
- Which scope — свой аккаунт
- Link to existing project — `n`
- Project name — `lis-pub`
- Directory — `./`
- Override settings — `n` (настройки берутся из `vercel.json`)

## Тестовые данные

- Закупки засеяны относительными датами: 2, 20 и 60 дней назад, поэтому на демо всегда видно
  и годные партии, и просроченные.
- Версия сидов — константа `currentDataVersion` в `src/app/page.tsx`. Если поменять данные,
  подними версию: браузер пересеет `localStorage` сам.
- Сбросить демо у себя в браузере: DevTools → Application → Local Storage → удалить ключи `hitry-lis-*`.
