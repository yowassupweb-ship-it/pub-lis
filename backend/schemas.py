import uuid
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

RoleId = Literal["user", "gamemaster", "bartender", "manager", "admin"]


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    email: EmailStr | None = None
    role: RoleId
    is_active: bool
    phone: str | None = None
    telegram: str | None = None
    title: str | None = None
    avatar: str | None = None
    comment: str = ""
    xp: int = 0


PHONE_PATTERN = r"^\+?[\d\s\-()]{5,20}$"


class MeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, pattern=PHONE_PATTERN)
    telegram: str | None = Field(default=None, max_length=64)
    avatar: str | None = Field(default=None, max_length=16)


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6)


class LoginRequest(BaseModel):
    login: str = Field(min_length=1, max_length=254)  # телеграм или email
    password: str


class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    telegram: str = Field(min_length=3, max_length=64)
    email: EmailStr | None = None
    password: str = Field(min_length=6)


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: RoleId = "user"


class GuestCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    phone: str | None = Field(default=None, pattern=PHONE_PATTERN)
    telegram: str | None = Field(default=None, max_length=64)
    comment: str = Field(default="", max_length=500)


class GuestUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    phone: str | None = Field(default=None, pattern=PHONE_PATTERN)
    telegram: str | None = Field(default=None, max_length=64)
    comment: str | None = Field(default=None, max_length=500)


class UserUpdate(BaseModel):
    name: str | None = None
    role: RoleId | None = None
    is_active: bool | None = None
    password: str | None = None
    title: str | None = None  # "" снимает титул


QuestCategory = Literal["general", "bar", "game"]
QuestStatus = Literal["taken", "submitted", "completed", "rejected"]
ConditionOp = Literal["filled", "eq", "ne", "gte", "lte", "gt", "lt"]


class Condition(BaseModel):
    """Одно условие по столбцу view user_facts. Список условий = AND."""

    field: str = Field(min_length=1, max_length=40)
    op: ConditionOp = "filled"
    value: str | int | None = None


class QuestCreate(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=2000)
    category: QuestCategory
    xp_reward: int = Field(ge=1, le=10000)
    assignee_id: uuid.UUID | None = None  # задан — задание персональное
    max_takers: int | None = Field(default=None, ge=1, le=100)
    deadline: datetime | None = None
    complete_conditions: list[Condition] | None = Field(default=None, max_length=10)  # None — проверяет автор руками
    auto_assign: bool = False
    assign_conditions: list[Condition] = Field(default_factory=list, max_length=10)  # [] — всем
    retro_credit: bool = True  # False — уже выполнившим не выдаём


class QuestUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    xp_reward: int | None = Field(default=None, ge=1, le=10000)
    is_active: bool | None = None
    deadline: datetime | None = None


class QuestOut(BaseModel):
    id: uuid.UUID
    title: str
    description: str
    category: QuestCategory
    xp_reward: int
    creator: str
    created_by: uuid.UUID
    assignee_id: uuid.UUID | None
    max_takers: int | None
    is_active: bool
    deadline: datetime | None
    takers: int  # без rejected
    complete_conditions: list[Condition] | None = None
    auto_assign: bool = False
    assign_conditions: list[Condition] = []
    retro_credit: bool = True
    my_status: QuestStatus | None = None


class QuestAssignmentOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    user_name: str
    status: QuestStatus
    updated_at: datetime


GameStatus = Literal["pending", "approved", "rejected"]
BookingStatus = Literal["pending", "approved", "rejected"]


class GameOut(BaseModel):
    id: uuid.UUID
    title: str
    description: str
    master: str
    master_id: uuid.UUID
    starts_at: datetime
    duration_hours: int
    seats_total: int
    seats_taken: int  # только approved
    is_cancelled: bool
    status: GameStatus
    my_booking_status: BookingStatus | None = None


class UserBookingOut(BaseModel):
    game_id: uuid.UUID
    game_title: str
    starts_at: datetime
    status: BookingStatus


class UserDetail(BaseModel):
    id: uuid.UUID
    name: str
    email: EmailStr | None = None
    role: RoleId
    is_active: bool
    phone: str | None = None
    telegram: str | None = None
    title: str | None = None
    avatar: str | None = None
    xp: int = 0
    created_at: datetime
    bookings: list[UserBookingOut]


class BookingOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    user_name: str
    user_title: str | None = None
    status: BookingStatus
    created_at: datetime


class GameCreate(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=2000)
    starts_at: datetime
    duration_hours: int = Field(default=4, ge=1, le=12)
    seats_total: int = Field(ge=1, le=20)
    master_id: uuid.UUID | None = None  # менеджер/админ могут назначить другого мастера, ГМ — только себя


class GameUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    starts_at: datetime | None = None
    duration_hours: int | None = Field(default=None, ge=1, le=12)
    seats_total: int | None = Field(default=None, ge=1, le=20)
    is_cancelled: bool | None = None


# ── Столы: карта зала (стены/столы/двери) и брони по дате ──────────────────


class FloorMapMeta(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    updated_at: datetime


class FloorMapOut(FloorMapMeta):
    layout: dict[str, Any]
    created_at: datetime


class FloorMapCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class FloorMapLayoutUpdate(BaseModel):
    layout: dict[str, Any]


class TableBookingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    map_id: uuid.UUID
    table_id: str
    booking_date: date
    time_start: str | None = None
    time_end: str | None = None
    guest_id: uuid.UUID | None = None
    guest_name: str | None = None
    comment: str = ""


class TableBookingCreate(BaseModel):
    table_id: str
    booking_date: date
    time_start: str | None = Field(default=None, max_length=5)
    time_end: str | None = Field(default=None, max_length=5)
    guest_id: uuid.UUID | None = None
    guest_name: str | None = Field(default=None, max_length=80)
    comment: str = Field(default="", max_length=500)


class TableBookingUpdate(BaseModel):
    time_start: str | None = Field(default=None, max_length=5)
    time_end: str | None = Field(default=None, max_length=5)
    guest_id: uuid.UUID | None = None
    guest_name: str | None = Field(default=None, max_length=80)
    comment: str | None = Field(default=None, max_length=500)


# ── Мероприятия: название, число участников, диапазон дат ──────────────────


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    participants_count: int
    date_from: date
    date_to: date
    time_from: str
    time_to: str


class EventCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    time_from: str = Field(min_length=1, max_length=5)
    time_to: str = Field(min_length=1, max_length=5)
    participants_count: int = Field(ge=0, le=10000)
    date_from: date
    date_to: date
