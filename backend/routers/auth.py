import io
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated

from PIL import Image, UnidentifiedImageError
from fastapi import APIRouter, Depends, HTTPException, Request, Response, UploadFile
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from db import get_db
from deps import COOKIE_NAME, get_current_user, log_event
from models import AppUser, UserSession
from routers.quests import sync_auto_quests
from schemas import LoginRequest, MeUpdate, PasswordChange, RegisterRequest, UserOut
from security import hash_password, hash_token, new_session_token, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Троттлинг логина: 5 промахов подряд — минута паузы. In-memory, на один процесс
MAX_ATTEMPTS = 5
LOCK_SECONDS = 60
_failed_logins: dict[str, tuple[int, float]] = {}  # ident -> (промахов, заблокирован до)


def _check_login_throttle(email: str) -> None:
    count, until = _failed_logins.get(email, (0, 0.0))
    if count >= MAX_ATTEMPTS and time.monotonic() < until:
        raise HTTPException(status_code=429, detail="Слишком много попыток, подожди минуту")


def _register_login_failure(email: str) -> None:
    count, _ = _failed_logins.get(email, (0, 0.0))
    _failed_logins[email] = (count + 1, time.monotonic() + LOCK_SECONDS)


def normalize_telegram(handle: str) -> str:
    return handle.strip().lstrip("@").lower()


async def _telegram_taken(db: AsyncSession, handle: str, except_id=None) -> bool:
    stmt = select(AppUser.id).where(func.lower(AppUser.telegram) == handle)
    if except_id is not None:
        stmt = stmt.where(AppUser.id != except_id)
    return (await db.execute(stmt)).scalar_one_or_none() is not None


def _start_session(db: AsyncSession, request: Request, response: Response, user: AppUser) -> None:
    token, token_hash = new_session_token()
    db.add(
        UserSession(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=datetime.now(timezone.utc) + timedelta(days=settings.session_ttl_days),
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
    )
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=settings.session_ttl_days * 86400,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )


@router.post("/register", response_model=UserOut, status_code=201)
async def register(
    body: RegisterRequest,
    request: Request,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AppUser:
    telegram = normalize_telegram(body.telegram)
    if len(telegram) < 3:
        raise HTTPException(status_code=422, detail="Слишком короткий телеграм")
    if await _telegram_taken(db, telegram):
        raise HTTPException(status_code=409, detail="Телеграм уже занят")
    email = body.email.lower() if body.email else None
    if email is not None:
        exists = await db.execute(select(AppUser.id).where(AppUser.email == email))
        if exists.scalar_one_or_none() is not None:
            raise HTTPException(status_code=409, detail="Email уже занят")
    user = AppUser(
        name=body.name,
        email=email,
        telegram=telegram,
        role="user",
        password_hash=hash_password(body.password),
    )
    db.add(user)
    await db.flush()
    _start_session(db, request, response, user)
    # первый sync — новичок получает свои автоквесты
    await sync_auto_quests(db, user)
    await log_event(db, user.id, "auth.register", "user", user.id)
    await db.commit()
    return user


@router.post("/login", response_model=UserOut)
async def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AppUser:
    # похоже на email — ищем по email, иначе по телеграму
    ident = body.login.strip().lower()
    _check_login_throttle(ident)
    if "@" in ident[1:]:
        cond = AppUser.email == ident
    else:
        cond = func.lower(AppUser.telegram) == normalize_telegram(ident)
    result = await db.execute(select(AppUser).where(cond, AppUser.is_active.is_(True)))
    user = result.scalar_one_or_none()
    if user is None or not user.password_hash or not verify_password(user.password_hash, body.password):
        _register_login_failure(ident)
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")
    _failed_logins.pop(ident, None)

    _start_session(db, request, response, user)
    await sync_auto_quests(db, user)
    await log_event(db, user.id, "auth.login", "user", user.id)
    await db.commit()
    return user


@router.post("/logout", status_code=204)
async def logout(
    request: Request,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    token = request.cookies.get(COOKIE_NAME)
    if token:
        await db.execute(
            update(UserSession)
            .where(UserSession.token_hash == hash_token(token), UserSession.revoked_at.is_(None))
            .values(revoked_at=datetime.now(timezone.utc))
        )
        await db.commit()
    response.delete_cookie(COOKIE_NAME, path="/")


@router.get("/me", response_model=UserOut)
async def me(user: Annotated[AppUser, Depends(get_current_user)]) -> AppUser:
    return user


@router.patch("/me", response_model=UserOut)
async def update_me(
    body: MeUpdate,
    user: Annotated[AppUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AppUser:
    changes = body.model_dump(exclude_unset=True)
    if "telegram" in changes and not (changes["telegram"] or "").strip().lstrip("@"):
        raise HTTPException(status_code=422, detail="Телеграм — основной логин, его нельзя убрать")
    if changes.get("telegram"):
        changes["telegram"] = normalize_telegram(changes["telegram"])
        if changes["telegram"] != (user.telegram or "") and await _telegram_taken(
            db, changes["telegram"], except_id=user.id
        ):
            raise HTTPException(status_code=409, detail="Телеграм уже занят")
    if "email" in changes and changes["email"]:
        changes["email"] = changes["email"].lower()
    if "email" in changes and changes["email"] != user.email:
        taken = (
            await db.execute(select(AppUser.id).where(AppUser.email == changes["email"]))
        ).scalar_one_or_none()
        if taken is not None:
            raise HTTPException(status_code=409, detail="Email уже занят")
    for field, value in changes.items():
        setattr(user, field, value)
    user.updated_at = datetime.now(timezone.utc)
    await sync_auto_quests(db, user)
    await log_event(db, user.id, "profile.update", "user", user.id, {k: "set" for k in changes})
    await db.commit()
    return user


AVATAR_DIR = Path(__file__).resolve().parents[1] / "uploads" / "avatars"
MAX_AVATAR_BYTES = 3 * 1024 * 1024


@router.post("/me/avatar", response_model=UserOut)
async def upload_avatar(
    file: UploadFile,
    user: Annotated[AppUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AppUser:
    raw = await file.read()
    if len(raw) > MAX_AVATAR_BYTES:
        raise HTTPException(status_code=413, detail="Файл больше 3 МБ")
    try:
        img = Image.open(io.BytesIO(raw))
        img.load()
    except (UnidentifiedImageError, OSError):
        raise HTTPException(status_code=422, detail="Это не похоже на картинку")
    # квадрат 512, webp: без exif и лишнего веса
    img = img.convert("RGB")
    side = min(img.size)
    left, top = (img.width - side) // 2, (img.height - side) // 2
    img = img.crop((left, top, left + side, top + side)).resize((512, 512))
    AVATAR_DIR.mkdir(parents=True, exist_ok=True)
    img.save(AVATAR_DIR / f"{user.id}.webp", "WEBP", quality=85)

    user.avatar = f"/api/media/avatars/{user.id}.webp?v={int(time.time())}"
    user.updated_at = datetime.now(timezone.utc)
    await sync_auto_quests(db, user)
    await log_event(db, user.id, "profile.avatar", "user", user.id)
    await db.commit()
    return user


@router.post("/me/password", status_code=204)
async def change_password(
    body: PasswordChange,
    request: Request,
    user: Annotated[AppUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    if not user.password_hash or not verify_password(user.password_hash, body.current_password):
        raise HTTPException(status_code=400, detail="Текущий пароль неверен")
    user.password_hash = hash_password(body.new_password)
    user.updated_at = datetime.now(timezone.utc)
    # остальные сессии рубим: если пароль меняли из-за утечки — чужие устройства вылетят
    current_token = request.cookies.get(COOKIE_NAME)
    await db.execute(
        update(UserSession)
        .where(
            UserSession.user_id == user.id,
            UserSession.revoked_at.is_(None),
            UserSession.token_hash != (hash_token(current_token) if current_token else ""),
        )
        .values(revoked_at=datetime.now(timezone.utc))
    )
    await log_event(db, user.id, "profile.password", "user", user.id)
    await db.commit()
