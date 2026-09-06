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
  time_from: string;
  time_to: string;
};

export type EventCreatePayload = {
  name: string;
  participants_count: number;
  date_from: string;
  date_to: string;
  time_from: string;
  time_to: string;
};

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

// Загрузка картинки (сейчас — фото позиций меню). Без Content-Type: json —
// браузер сам проставит multipart-boundary для FormData.
export const apiUploadImage = async (file: File): Promise<{ url: string | null; error: string | null }> => {
  try {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/uploads/image", { method: "POST", credentials: "include", body: form });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const detail = body && typeof body.detail === "string" ? body.detail : `Ошибка (${res.status})`;
      return { url: null, error: detail };
    }
    return { url: body?.url ?? null, error: null };
  } catch {
    return { url: null, error: "Сервер недоступен" };
  }
};

// ── Журнал действий («Действия») ────────────────────────────────────────

export type ApiAuditEvent = {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
};

export const apiAuditEvents = (limit = 500) => request<ApiAuditEvent[]>(`/audit-events?limit=${limit}`);

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

// ── Склад: типы товаров, товары, партии ─────────────────────────────────

export type ApiProductType = { id: string; name: string; unit: string };

export type ApiBatch = {
  id: string;
  packs: number;
  remaining_amount: number;
  total_price: number | null;
  received_at: string;
  expires_at: string;
  shelf_life_days: number;
};

export type ApiProduct = {
  id: string;
  type_id: string;
  name: string;
  normalized_name: string;
  package_size: number;
  stock_unit: string;
  shelf_life_days: number;
  batches: ApiBatch[];
};

export type ManualProductPayload = {
  name: string;
  type_id: string;
  package_size: number;
  stock_unit: string;
  shelf_life_days: number;
  packs: number;
  total_price?: number | null;
  received_at?: string;
};

export type ApiPurchase = {
  id: string;
  supplier: string | null;
  source_text: string;
  received_at: string;
  item_count: number;
  total: number;
  created_at: string;
};

export type PurchaseItemPayload = {
  name: string;
  type_id: string;
  package_size: number;
  stock_unit: string;
  shelf_life_days: number;
  packs: number;
  total_price?: number | null;
};

export type PurchaseCreatePayload = {
  supplier?: string;
  source_text: string;
  received_at?: string;
  items: PurchaseItemPayload[];
};

export type ApiWriteOff = {
  id: string;
  product_id: string;
  product_name: string;
  batch_id: string;
  amount: number;
  unit: string;
  reason: string;
  value: number;
  created_at: string;
};

export const apiProductTypes = () => request<ApiProductType[]>("/warehouse/product-types");

export const apiCreateProductType = (payload: { id: string; name: string; unit: string }) =>
  requestWithError<ApiProductType>("/warehouse/product-types", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export type ApiProductTypesImportResult = { created: number; skipped: number };

export const apiImportProductTypes = (productTypes: { id: string; name: string; unit: string }[]) =>
  requestWithError<ApiProductTypesImportResult>("/warehouse/product-types/import", {
    method: "POST",
    body: JSON.stringify({ product_types: productTypes }),
  });

export const apiProducts = () => request<ApiProduct[]>("/warehouse/products");

export const apiAddManualProduct = (payload: ManualProductPayload) =>
  requestWithError<ApiProduct>("/warehouse/products", { method: "POST", body: JSON.stringify(payload) });

export const apiUpdateProduct = (
  productId: string,
  payload: { package_size?: number; shelf_life_days?: number },
) =>
  requestWithError<ApiProduct>(`/warehouse/products/${productId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

export const apiUpdateBatch = (
  productId: string,
  batchId: string,
  payload: { packs?: number; remaining_amount?: number; received_at?: string; shelf_life_days?: number },
) =>
  requestWithError<ApiProduct>(`/warehouse/products/${productId}/batches/${batchId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

// ── Импорт/экспорт склада в JSON (бэкап, перенос между окружениями) ────────
// Экспорт — отдельного эндпоинта нет, экспортируется уже загруженный
// apiProducts() на клиенте. Импорт принимает ровно тот же формат обратно
// (round-trip): матчит товары по normalized_name, добавляет партии.

export type BatchImportPayload = {
  packs: number;
  remaining_amount?: number | null;
  total_price?: number | null;
  received_at?: string | null;
  shelf_life_days?: number | null;
};

export type ProductImportPayload = {
  name: string;
  type_id: string;
  package_size?: number;
  stock_unit?: string;
  shelf_life_days?: number;
  batches?: BatchImportPayload[];
};

export type ApiProductsImportResult = {
  products_created: number;
  products_matched: number;
  batches_created: number;
};

export const apiImportProducts = (products: ProductImportPayload[]) =>
  requestWithError<ApiProductsImportResult>("/warehouse/products/import", {
    method: "POST",
    body: JSON.stringify({ products }),
  });

export const apiPurchases = () => request<ApiPurchase[]>("/warehouse/purchases");

export const apiCreatePurchase = (payload: PurchaseCreatePayload) =>
  requestWithError<ApiPurchase>("/warehouse/purchases", { method: "POST", body: JSON.stringify(payload) });

export const apiWriteOffs = () => request<ApiWriteOff[]>("/warehouse/write-offs");

export const apiCreateWriteOff = (payload: {
  product_id: string;
  batch_id: string;
  amount: number;
  reason: string;
}) => requestWithError<ApiWriteOff>("/warehouse/write-offs", { method: "POST", body: JSON.stringify(payload) });

// ── Меню ─────────────────────────────────────────────────────────────────

export type ApiMenuCategory = { id: string; name: string; sort_order: number };

export type ApiMenuIngredient = {
  id: string;
  type_id: string;
  alt_type_ids: string[];
  amount: number;
};

export type ApiMenuPosition = {
  id: string;
  category_id: string | null;
  name: string;
  price: number;
  image_url: string | null;
  order_step: number | null;
  order_unit: string | null;
  comment: string;
  is_active: boolean;
  ingredients: ApiMenuIngredient[];
};

export type ApiPublicMenuPosition = {
  id: string;
  category_id: string | null;
  name: string;
  price: number;
  image_url: string | null;
  order_step: number | null;
  order_unit: string | null;
  ingredients: { type_id: string; amount: number }[];
};

export type MenuIngredientPayload = { type_id: string; alt_type_ids?: string[]; amount: number };

export type MenuPositionPayload = {
  name: string;
  price: number;
  category_id?: string | null;
  image_url?: string | null;
  order_step?: number | null;
  order_unit?: string | null;
  comment?: string;
  is_active?: boolean;
  ingredients: MenuIngredientPayload[];
};

export const apiMenuCategories = () => request<ApiMenuCategory[]>("/menu/categories");

export const apiCreateMenuCategory = (name: string) =>
  requestWithError<ApiMenuCategory>("/menu/categories", { method: "POST", body: JSON.stringify({ name }) });

export const apiUpdateMenuCategory = (categoryId: string, name: string) =>
  requestWithError<ApiMenuCategory>(`/menu/categories/${categoryId}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });

export const apiDeleteMenuCategory = (categoryId: string) =>
  requestWithError<null>(`/menu/categories/${categoryId}`, { method: "DELETE" });

export const apiMenuPositions = () => request<ApiMenuPosition[]>("/menu/positions");

export const apiPublicMenuPositions = () => request<ApiPublicMenuPosition[]>("/menu/public");

export const apiCreateMenuPosition = (payload: MenuPositionPayload) =>
  requestWithError<ApiMenuPosition>("/menu/positions", { method: "POST", body: JSON.stringify(payload) });

export const apiUpdateMenuPosition = (positionId: string, payload: MenuPositionPayload) =>
  requestWithError<ApiMenuPosition>(`/menu/positions/${positionId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

export const apiDeleteMenuPosition = (positionId: string) =>
  requestWithError<null>(`/menu/positions/${positionId}`, { method: "DELETE" });

// ── Импорт/экспорт позиций меню в JSON ──────────────────────────────────────
// Раздел адресуется по имени (category_name), не по id — id не переносится
// между окружениями. Экспорт можно скормить обратно в импорт как есть.

export type MenuPositionExportPayload = {
  name: string;
  price: number;
  category_name: string | null;
  image_url: string | null;
  order_step: number | null;
  order_unit: string | null;
  comment: string;
  is_active: boolean;
  ingredients: MenuIngredientPayload[];
};

export type ApiMenuPositionsImportResult = {
  positions_created: number;
  positions_updated: number;
  categories_created: number;
};

export const apiExportMenuPositions = () => request<MenuPositionExportPayload[]>("/menu/positions/export");

export const apiImportMenuPositions = (positions: MenuPositionExportPayload[]) =>
  requestWithError<ApiMenuPositionsImportResult>("/menu/positions/import", {
    method: "POST",
    body: JSON.stringify({ positions }),
  });

// ── Заказы ───────────────────────────────────────────────────────────────

export type ApiOrderRoute = "kitchen" | "self";
export type ApiOrderStatus = "active" | "completed" | "cancelled";
export type ApiKitchenStatus = "new" | "accepted" | "ready" | "done";

export type ApiOrderLineIngredient = {
  type_id: string;
  name: string;
  amount_label: string;
  raw_amount: number;
};

export type ApiOrderLine = {
  id: string;
  menu_position_id: string | null;
  name: string;
  price: number;
  quantity: number;
  comment: string | null;
  ingredients: ApiOrderLineIngredient[];
};

export type ApiOrder = {
  id: string;
  number: number;
  created_at: string;
  completed_at: string | null;
  status: ApiOrderStatus;
  kitchen_status: ApiKitchenStatus;
  route: ApiOrderRoute;
  guest_id: string | null;
  guest_name: string | null;
  total: number;
  items: ApiOrderLine[];
};

export type OrderLinePayload = {
  menu_position_id?: string | null;
  name: string;
  price: number;
  quantity: number;
  comment?: string | null;
};

export type OrderCreatePayload = {
  route: ApiOrderRoute;
  guest_id?: string | null;
  guest_name?: string | null;
  items: OrderLinePayload[];
};

export const apiOrders = (params?: {
  route?: ApiOrderRoute;
  status?: ApiOrderStatus;
  date_from?: string;
  date_to?: string;
}) => {
  const qs = new URLSearchParams();
  if (params?.route) qs.set("route", params.route);
  if (params?.status) qs.set("status", params.status);
  if (params?.date_from) qs.set("date_from", params.date_from);
  if (params?.date_to) qs.set("date_to", params.date_to);
  const suffix = qs.toString() ? `?${qs}` : "";
  return request<ApiOrder[]>(`/orders${suffix}`);
};

export const apiCreateOrder = (payload: OrderCreatePayload) =>
  requestWithError<ApiOrder>("/orders", { method: "POST", body: JSON.stringify(payload) });

export const apiUpdateOrderKitchenStatus = (orderId: string, kitchen_status: ApiKitchenStatus) =>
  requestWithError<ApiOrder>(`/orders/${orderId}/kitchen-status`, {
    method: "PATCH",
    body: JSON.stringify({ kitchen_status }),
  });

export const apiCancelOrder = (orderId: string) =>
  requestWithError<ApiOrder>(`/orders/${orderId}/cancel`, { method: "POST" });

export const apiEditOrder = (orderId: string, items: OrderLinePayload[]) =>
  requestWithError<ApiOrder>(`/orders/${orderId}`, { method: "PATCH", body: JSON.stringify({ items }) });

// ── Журнал действий склада ───────────────────────────────────────────────

export type ApiActivityLogEntry = {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
};

export const apiWarehouseActivity = (limit = 1000) =>
  request<ApiActivityLogEntry[]>(`/warehouse/activity?limit=${limit}`);
