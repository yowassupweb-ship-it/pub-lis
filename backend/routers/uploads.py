import io
import time
import uuid
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError

from deps import require_staff
from models import AppUser

router = APIRouter(prefix="/api/uploads", tags=["uploads"], dependencies=[Depends(require_staff)])

IMAGES_DIR = Path(__file__).resolve().parents[1] / "uploads" / "images"
MAX_IMAGE_BYTES = 5 * 1024 * 1024


@router.post("/image")
async def upload_image(
    file: UploadFile,
    staff: Annotated[AppUser, Depends(require_staff)],
) -> dict[str, str]:
    """Общая загрузка картинок для CRM (сейчас — фото позиций меню).
    Не привязана к сущности: просто сохраняет файл и отдаёт URL."""
    raw = await file.read()
    if len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Файл больше 5 МБ")
    try:
        img = Image.open(io.BytesIO(raw))
        img.load()
    except (UnidentifiedImageError, OSError):
        raise HTTPException(status_code=422, detail="Это не похоже на картинку") from None

    img = img.convert("RGB")
    img.thumbnail((1200, 1200))
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}.webp"
    img.save(IMAGES_DIR / name, "WEBP", quality=85)

    return {"url": f"/api/media/images/{name}?v={int(time.time())}"}
