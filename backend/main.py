from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

# Подписи полей для 422 — фронт показывает detail как есть
FIELD_LABELS = {
    "phone": "Телефон",
    "email": "Email",
    "telegram": "Телеграм",
    "name": "Имя",
    "password": "Пароль",
    "new_password": "Новый пароль",
    "title": "Название",
    "description": "Описание",
    "starts_at": "Дата и время",
    "duration_hours": "Длительность",
    "seats_total": "Мест",
    "xp_reward": "Награда",
    "login": "Логин",
    "avatar": "Аватар",
}
FIELD_HINTS = {
    "phone": "только цифры, пробелы, «+», «-» и скобки, 5–20 символов",
}


def _humanize(err: dict) -> str:
    field = next((str(p) for p in reversed(err.get("loc", [])) if p != "body"), "")
    label = FIELD_LABELS.get(field, field)
    if field in FIELD_HINTS:
        return f"{label}: {FIELD_HINTS[field]}"
    msg = err.get("msg", "неверное значение")
    typ = err.get("type", "")
    if typ == "string_too_short":
        msg = f"минимум {err.get('ctx', {}).get('min_length')} символов"
    elif typ == "string_too_long":
        msg = f"максимум {err.get('ctx', {}).get('max_length')} символов"
    elif typ == "missing":
        msg = "обязательное поле"
    elif typ.startswith("greater_than") or typ.startswith("less_than"):
        msg = f"допустимо {err.get('ctx', {})}"
    elif typ == "value_error" and "email" in msg.lower():
        msg = "некорректный адрес"
    return f"{label}: {msg}" if label else msg

from routers import audit, auth, events, games, guests, menu, orders, quests, tables, uploads, users, warehouse, warehouse_activity

MEDIA_DIR = Path(__file__).resolve().parent / "uploads"
(MEDIA_DIR / "avatars").mkdir(parents=True, exist_ok=True)
(MEDIA_DIR / "images").mkdir(parents=True, exist_ok=True)

app = FastAPI(title="CRM API", version="0.1.0")


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    """422 с detail-строкой на русском — фронт показывает её как есть,
    вместо сырого списка pydantic-ошибок."""
    messages = [_humanize(e) for e in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": "; ".join(dict.fromkeys(messages))})

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Аватарки под /api — идут через тот же прокси, отдельный маршрут не нужен
app.mount("/api/media", StaticFiles(directory=MEDIA_DIR), name="media")

app.include_router(auth.router)
app.include_router(games.router)
app.include_router(quests.router)
app.include_router(users.router)
app.include_router(users.profile_router)
app.include_router(guests.router)
app.include_router(tables.router)
app.include_router(events.router)
app.include_router(uploads.router)
app.include_router(audit.router)
app.include_router(warehouse.router)
app.include_router(menu.router)
app.include_router(menu.staff_router)
app.include_router(orders.router)
app.include_router(warehouse_activity.router)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}
