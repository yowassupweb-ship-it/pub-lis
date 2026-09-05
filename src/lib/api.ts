// Клиент API по openapi.yaml. Ходит на /api, дальше решает прокси из next.config.ts

export type ApiRole = "user" | "gamemaster" | "bartender" | "manager" | "admin";

// единственный источник ролевых списков на фронте (бэк — deps.py)
export const STAFF_ROLES: ApiRole[] = ["bartender", "manager", "admin"];
export const GAME_MANAGER_ROLES: ApiRole[] = ["gamemaster", "manager", "admin"];
export const QUEST_CREATABLE: Record<ApiRole, QuestCategory[]> = {
  admin: ["general", "bar", "game"],
  manager: ["bar"],
  bartender: ["bar"],
  gamemaster: ["game"],
  user: [],
};
export const isStaff = (u: { role: ApiRole } | null) => !!u && STAFF_ROLES.includes(u.role);
export const canManageGames = (u: { role: ApiRole } | null) => !!u && GAME_MANAGER_ROLES.includes(u.role);

export type ApprovalStatus = "pending" | "approved" | "rejected";

export type ApiGame = {
  id: string;
  title: string;
  description: string;
  master: string;
  master_id: string;
  starts_at: string;
  duration_hours: number;
  seats_total: number;
  seats_taken: number;
  is_cancelled: boolean;
  status: ApprovalStatus;
  my_booking_status: ApprovalStatus | null;
};

export type ApiBooking = {
  id: string;
  user_id: string;
  user_name: string;
  user_title: string | null;
  status: ApprovalStatus;
  created_at: string;
};

export type ApiUserDetail = {
  id: string;
  name: string;
  email: string | null;
  role: ApiRole;
  is_active: boolean;
  phone: string | null;
  telegram: string | null;
  title: string | null;
  avatar: string | null;
  xp: number;
  created_at: string;
  bookings: Array<{
    game_id: string;
    game_title: string;
    starts_at: string;
    status: ApprovalStatus;
  }>;
};

export type GameCreatePayload = {
  title: string;
  description: string;
  starts_at: string;
  duration_hours: number;
  seats_total: number;
};

export type ApiUser = {
  id: string;
  name: string;
  email: string | null;
  role: ApiRole;
  is_active: boolean;
  phone: string | null;
  telegram: string | null;
  title: string | null;
  avatar: string | null;
  comment: string;
  xp: number;
};

// пороги опыта D&D 5e, индекс = уровень - 1
export const XP_THRESHOLDS = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
  85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000,
];

export function levelFromXp(xp: number): { level: number; current: number; next: number | null } {
  let level = 1;
  for (let i = XP_THRESHOLDS.length - 1; i >= 0; i -= 1) {
    if (xp >= XP_THRESHOLDS[i]) {
      level = i + 1;
      break;
    }
  }
  const next = level < XP_THRESHOLDS.length ? XP_THRESHOLDS[level] : null;
  return { level, current: xp, next };
}

export type QuestCategory = "general" | "bar" | "game";
export type QuestStatus = "taken" | "submitted" | "completed" | "rejected";

export type ApiQuest = {
  id: string;
  title: string;
  description: string;
  category: QuestCategory;
  xp_reward: number;
  creator: string;
  created_by: string;
  assignee_id: string | null;
  max_takers: number | null;
  is_active: boolean;
  deadline: string | null;
  takers: number;
  complete_conditions: QuestCondition[] | null;
  auto_assign: boolean;
  assign_conditions: QuestCondition[];
  retro_credit: boolean;
  my_status: QuestStatus | null;
};

export type ConditionOp = "filled" | "eq" | "ne" | "gte" | "lte" | "gt" | "lt";
export type QuestCondition = { field: string; op: ConditionOp; value: string | number | null };

export const CONDITION_FIELDS = [
  "name", "email", "phone", "telegram", "title", "avatar", "role",
  "xp", "games_played", "games_mastered",
] as const;
export const NUMERIC_CONDITION_FIELDS = ["xp", "games_played", "games_mastered"];
export const CONDITION_OPS: Array<[ConditionOp, string]> = [
  ["filled", "заполнено"],
  ["eq", "="],
  ["ne", "≠"],
  ["gte", "≥"],
  ["lte", "≤"],
  ["gt", ">"],
  ["lt", "<"],
];

export type ApiQuestAssignment = {
  id: string;
  user_id: string;
  user_name: string;
  status: QuestStatus;
  updated_at: string;
};

export type AuthResult = { user: ApiUser | null; error: string | null };

async function request<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(`/api${path}`, {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      ...init,
    });
    if (!res.ok) return null;
    return res.status === 204 ? (null as T) : ((await res.json()) as T);
  } catch {
    return null; // бэк лежит — страница живёт без данных
  }
}

async function authRequest(path: string, body: object): Promise<AuthResult> {
  try {
    const res = await fetch(`/api${path}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const detail =
        data && typeof data.detail === "string" ? data.detail : `Ошибка (${res.status})`;
      return { user: null, error: detail };
    }
    return { user: data as ApiUser, error: null };
  } catch {
    return { user: null, error: "Сервер недоступен" };
  }
}

export const apiMe = () => request<ApiUser>("/auth/me");

export const apiLogin = (login: string, password: string) =>
  authRequest("/auth/login", { login, password });

export const apiRegister = (
  name: string,
  telegram: string,
  password: string,
  email?: string
) => authRequest("/auth/register", { name, telegram, password, email: email || undefined });

export const apiLogout = () => request<void>("/auth/logout", { method: "POST" });

export const apiUsers = () => request<ApiUser[]>("/users");

export const apiUserDetail = (userId: string) => request<ApiUserDetail>(`/users/${userId}`);

export const apiGuests = () => request<ApiUser[]>("/guests");

export type GuestCreatePayload = { name: string; phone?: string; telegram?: string; comment?: string };

export type MeUpdatePayload = {
  name?: string;
  email?: string;
  phone?: string | null;
  telegram?: string | null;
  avatar?: string | null;
};

// вариант request с текстом ошибки от бэка
async function requestWithError<T>(
  path: string,
  init: RequestInit
): Promise<{ data: T | null; error: string | null; status: number }> {
  try {
    const res = await fetch(`/api${path}`, {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      ...init,
    });
    if (res.status === 204) return { data: null, error: null, status: 204 };
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const detail = body && typeof body.detail === "string" ? body.detail : `Ошибка (${res.status})`;
      return { data: null, error: detail, status: res.status };
    }
    return { data: body as T, error: null, status: res.status };
  } catch {
    // status 0 — сеть/сервер недоступен, это не то же самое, что 403 или 404
    return { data: null, error: "Сервер недоступен", status: 0 };
  }
}

export const apiAdminUpdateUser = (userId: string, payload: { title?: string }) =>
  requestWithError<ApiUser>(`/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

export const apiCreateGuest = (payload: GuestCreatePayload) =>
  requestWithError<ApiUser>("/guests", { method: "POST", body: JSON.stringify(payload) });

export const apiUpdateGuest = (guestId: string, payload: Partial<GuestCreatePayload>) =>
  requestWithError<ApiUser>(`/guests/${guestId}`, { method: "PATCH", body: JSON.stringify(payload) });

export const apiDeleteGuest = (guestId: string) =>
  requestWithError<null>(`/guests/${guestId}`, { method: "DELETE" });

export const apiUpdateMe = (payload: MeUpdatePayload) =>
  requestWithError<ApiUser>("/auth/me", { method: "PATCH", body: JSON.stringify(payload) });

export const apiQuests = () => request<ApiQuest[]>("/quests");

export const apiCreateQuest = (payload: {
  title: string;
  description: string;
  category: QuestCategory;
  xp_reward: number;
  assignee_id?: string;
  max_takers?: number;
  complete_conditions?: QuestCondition[] | null;
  auto_assign?: boolean;
  assign_conditions?: QuestCondition[];
  retro_credit?: boolean;
}) => requestWithError<ApiQuest>("/quests", { method: "POST", body: JSON.stringify(payload) });

export const apiSyncQuest = (questId: string) =>
  requestWithError<{ assigned: number }>(`/quests/${questId}/sync`, { method: "POST" });

export const apiTakeQuest = (questId: string) =>
  requestWithError<ApiQuest>(`/quests/${questId}/take`, { method: "POST" });

export const apiSubmitQuest = (questId: string) =>
  requestWithError<ApiQuest>(`/quests/${questId}/submit`, { method: "POST" });

export const apiQuestAssignments = (questId: string) =>
  request<ApiQuestAssignment[]>(`/quests/${questId}/assignments`);

export const apiCompleteAssignment = (questId: string, assignmentId: string) =>
  requestWithError<ApiQuestAssignment>(`/quests/${questId}/assignments/${assignmentId}/complete`, {
    method: "POST",
  });

export const apiRejectAssignment = (questId: string, assignmentId: string) =>
  requestWithError<ApiQuestAssignment>(`/quests/${questId}/assignments/${assignmentId}/reject`, {
    method: "POST",
  });

export const apiCloseQuest = (questId: string) =>
  requestWithError<ApiQuest>(`/quests/${questId}`, {
    method: "PATCH",
    body: JSON.stringify({ is_active: false }),
  });

// аватар — эмодзи-пресет или URL файла
export const isAvatarUrl = (avatar: string | null): avatar is string =>
  !!avatar && avatar.startsWith("/");

export const apiUploadAvatar = async (
  file: File
): Promise<{ data: ApiUser | null; error: string | null }> => {
  try {
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/auth/me/avatar", {
      method: "POST",
      credentials: "include",
      body,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const detail = data && typeof data.detail === "string" ? data.detail : `Ошибка (${res.status})`;
      return { data: null, error: detail };
    }
    return { data: data as ApiUser, error: null };
  } catch {
    return { data: null, error: "Сервер недоступен" };
  }
};

export const apiChangePassword = (current_password: string, new_password: string) =>
  requestWithError<void>("/auth/me/password", {
    method: "POST",
    body: JSON.stringify({ current_password, new_password }),
  });

// ── Столы: карта зала и брони ────────────────────────────────────────────

export type ApiFloorMapMeta = { id: string; name: string; updated_at: string };

export type FloorLayout = { walls: unknown[]; tables: unknown[]; doors: unknown[] };

export type ApiFloorMap = ApiFloorMapMeta & { layout: FloorLayout; created_at: string };

export type ApiTableBooking = {
  id: string;
  map_id: string;
  table_id: string;
  booking_date: string;
  time_start: string | null;
  time_end: string | null;
  guest_id: string | null;
  guest_name: string | null;
  comment: string;
};

export type TableBookingPayload = {
  table_id: string;
  booking_date: string;
  time_start?: string;
  time_end?: string;
  guest_id?: string;
  guest_name?: string;
  comment?: string;
};

export const apiFloorMaps = () => request<ApiFloorMapMeta[]>("/floor-maps");

export const apiCreateFloorMap = (name: string) =>
  requestWithError<ApiFloorMap>("/floor-maps", { method: "POST", body: JSON.stringify({ name }) });

export const apiFloorMap = (mapId: string) => request<ApiFloorMap>(`/floor-maps/${mapId}`);

export const apiSaveFloorMapLayout = (mapId: string, layout: FloorLayout) =>
  requestWithError<ApiFloorMap>(`/floor-maps/${mapId}`, {
    method: "PUT",
    body: JSON.stringify({ layout }),
  });

export const apiDeleteFloorMap = (mapId: string) =>
  requestWithError<null>(`/floor-maps/${mapId}`, { method: "DELETE" });

export const apiTableBookings = (mapId: string, dateFrom: string, dateTo: string) =>
  request<ApiTableBooking[]>(`/floor-maps/${mapId}/bookings?date_from=${dateFrom}&date_to=${dateTo}`);

export const apiCreateTableBooking = (mapId: string, payload: TableBookingPayload) =>
  requestWithError<ApiTableBooking>(`/floor-maps/${mapId}/bookings`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const apiUpdateTableBooking = (
  mapId: string,
  bookingId: string,
  payload: Partial<TableBookingPayload>,
) =>
  requestWithError<ApiTableBooking>(`/floor-maps/${mapId}/bookings/${bookingId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

export const apiDeleteTableBooking = (mapId: string, bookingId: string) =>
  requestWithError<null>(`/floor-maps/${mapId}/bookings/${bookingId}`, { method: "DELETE" });

// ── Мероприятия ──────────────────────────────────────────────────────────

export type ApiEvent = {
  id: string;
  name: string;
  participants_count: number;
  date_from: string;
  date_to: string;
};

export type EventCreatePayload = { name: string; participants_count: number; date_from: string; date_to: string };

export const apiEvents = (dateFrom?: string, dateTo?: string) => {
  const qs = new URLSearchParams();
  if (dateFrom) qs.set("date_from", dateFrom);
  if (dateTo) qs.set("date_to", dateTo);
  const suffix = qs.toString() ? `?${qs}` : "";
  return request<ApiEvent[]>(`/events${suffix}`);
};

export const apiCreateEvent = (payload: EventCreatePayload) =>
  requestWithError<ApiEvent>("/events", { method: "POST", body: JSON.stringify(payload) });

export const apiDeleteEvent = (eventId: string) =>
  requestWithError<null>(`/events/${eventId}`, { method: "DELETE" });

export const apiGame = (gameId: string) => request<ApiGame>(`/games/${gameId}`);

export const apiGames = (from: string, to: string) =>
  request<ApiGame[]>(`/games?from=${from}&to=${to}`);

export const apiBookSeat = (gameId: string) =>
  requestWithError<ApiGame>(`/games/${gameId}/book`, { method: "POST" });

export const apiCancelBooking = (gameId: string) =>
  request<ApiGame>(`/games/${gameId}/book`, { method: "DELETE" });

export const apiCreateGame = (payload: GameCreatePayload) =>
  requestWithError<ApiGame>("/games", { method: "POST", body: JSON.stringify(payload) });

export const apiDeleteGame = (gameId: string) =>
  request<void>(`/games/${gameId}`, { method: "DELETE" });

export const apiApproveGame = (gameId: string) =>
  request<ApiGame>(`/games/${gameId}/approve`, { method: "POST" });

export const apiRejectGame = (gameId: string) =>
  request<ApiGame>(`/games/${gameId}/reject`, { method: "POST" });

export const apiGameBookings = (gameId: string) =>
  request<ApiBooking[]>(`/games/${gameId}/bookings`);

export const apiApproveBooking = (gameId: string, bookingId: string) =>
  request<ApiBooking>(`/games/${gameId}/bookings/${bookingId}/approve`, { method: "POST" });

export const apiRejectBooking = (gameId: string, bookingId: string) =>
  request<ApiBooking>(`/games/${gameId}/bookings/${bookingId}/reject`, { method: "POST" });
