"use client";

import {
  Archive,
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  ConciergeBell,
  PartyPopper,
  LayoutDashboard,
  LogIn,
  LogOut,
  Info,
  Menu,
  Minus,
  PackageCheck,
  Pencil,
  Plus,
  Search,
  Settings,
  Terminal,
  ShoppingCart,
  Trash2,
  User,
  UsersRound,
  Utensils,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import {
  STAFF_ROLES,
  apiAddManualProduct,
  apiCreateProductType,
  apiAuditEvents,
  apiCancelOrder,
  apiCreateGuest,
  apiCreateMenuCategory,
  apiCreateMenuPosition,
  apiCreateOrder,
  apiCreatePurchase,
  apiCreateWriteOff,
  apiDeleteGuest,
  apiDeleteMenuCategory,
  apiDeleteMenuPosition,
  apiEditOrder,
  apiExportMenuPositions,
  apiGuests,
  apiImportMenuPositions,
  apiImportProductTypes,
  apiImportProducts,
  apiLogout,
  apiMe,
  apiMenuCategories,
  apiMenuPositions,
  apiOrders,
  apiProductTypes,
  apiProducts,
  apiPurchases,
  apiUpdateBatch,
  apiUpdateGuest,
  apiUpdateMenuCategory,
  apiUpdateMenuPosition,
  apiUpdateOrderKitchenStatus,
  apiUpdateProduct,
  apiUploadImage,
  apiWarehouseActivity,
  apiWriteOffs,
  type ApiActivityLogEntry,
  type ApiAuditEvent,
  type ApiBatch,
  type ApiMenuCategory as ApiMenuCategoryType,
  type ApiMenuIngredient as ApiMenuIngredientType,
  type ApiMenuPosition as ApiMenuPositionType,
  type ApiOrder,
  type ApiOrderLine,
  type ApiOrderLineIngredient,
  type ApiProduct,
  type ApiPurchase as ApiPurchaseType,
  type ApiUser,
  type ApiWriteOff,
  type MenuIngredientPayload,
  type MenuPositionExportPayload,
  type MenuPositionPayload,
  type OrderLinePayload,
  type ProductImportPayload,
  type PurchaseItemPayload,
} from "@/lib/api";
import { PRODUCT_TYPES } from "@/lib/productTypes";
import EventsSection from "./EventsSection";
import TablesSection from "./TablesSection";

type RoleId = "user" | "gamemaster" | "bartender" | "manager" | "admin";
type ActiveSection =
  | "warehouse"
  | "positions"
  | "guests"
  | "tables"
  | "orders"
  | "shift"
  | "finance"
  | "events"
  | "stats"
  | "audit";
type WarehouseTab = "purchases" | "products" | "write-offs" | "ingredients";

type ParsedItem = {
  id: string;
  name: string;
  quantity: string;
  unit: string;
  typeId: string;
  packageSize: string;
  stockUnit: string;
  totalPrice: number | null;
  unitPrice: number | null;
  shelfLifeDays: string;
};

type StockBatch = {
  id: string;
  packs: number;
  remainingAmount: number;
  totalPrice: number | null;
  receivedAt: string;
  expiresAt: string;
  shelfLifeDays: string;
};

type ProductType = {
  id: string;
  name: string;
  unit: string;
};

type Product = {
  id: string;
  name: string;
  normalizedName: string;
  typeId: string;
  packageSize: number;
  stockUnit: string;
  packs: number;
  amount: number;
  shelfLifeDays: string;
  batches: StockBatch[];
};

type PurchaseRecord = {
  id: string;
  receivedAt: string;
  itemCount: number;
  total: number;
};

type WriteOffRecord = {
  id: string;
  createdAt: string;
  productName: string;
  batchId: string;
  amount: number;
  unit: string;
  reason: string;
  value: number;
};

const WRITE_OFF_REASONS = ["Просрочка", "Порча", "Бой/потери", "Излишек по инвентаризации", "Другое"];

type OrderLineRecord = {
  menuPositionId?: string | null;
  name: string;
  quantity: number;
  price: number;
  comment?: string;
  ingredients: { name: string; amount: string; typeId: string; rawAmount: number }[];
};

type OrderRecord = {
  id: string;
  number: number;
  createdAt: string;
  completedAt: string | null;
  items: OrderLineRecord[];
  total: number;
  status: "active" | "completed" | "cancelled";
  kitchenStatus: "new" | "accepted" | "ready" | "done";
  route: "kitchen" | "self";
  guestId: string | null;
  guestName: string | null;
};

type MenuIngredient = {
  id: string;
  typeId: string;
  altTypeIds?: string[];
  amount: string;
};

type MenuPosition = {
  id: string;
  name: string;
  price: string;
  imageUrl: string;
  orderStep?: number;
  orderUnit?: string;
  categoryId?: string | null;
  comment?: string;
  ingredients: MenuIngredient[];
};

type MenuCategory = { id: string; name: string };

const uncategorizedCategoryId = "__uncategorized__";

const roles: Array<{ id: RoleId; label: string }> = [
  { id: "user", label: "Юзер" },
  { id: "gamemaster", label: "Гейм-мастер" },
  { id: "bartender", label: "Бармен" },
  { id: "manager", label: "Менеджер" },
  { id: "admin", label: "Администратор" },
];

const roleLabel = (id: RoleId) => roles.find((r) => r.id === id)?.label ?? id;

const navItems = [
  { id: "shift", label: "Смена", icon: LayoutDashboard, enabled: true },
  { id: "orders", label: "Заказы", icon: ClipboardList, enabled: true },
  { id: "tables", label: "Столы", icon: ConciergeBell, enabled: true },
  { id: "guests", label: "Гости", icon: UsersRound, enabled: true },
  { id: "warehouse", label: "Склад", icon: PackageCheck, enabled: true },
  { id: "positions", label: "Позиции", icon: Utensils, enabled: true },
  { id: "finance", label: "Финансы", icon: CircleDollarSign, enabled: true },
  { id: "stats", label: "Статистика", icon: BarChart3, enabled: true },
  { id: "events", label: "Мероприятия", icon: PartyPopper, enabled: true },
  { id: "audit", label: "Действия", icon: Terminal, enabled: true },
  { id: "settings", label: "Настройки", icon: Settings, enabled: false },
];

const SECTION_TITLES: Record<string, string> = {
  positions: "Позиции",
  guests: "Гости",
  tables: "Столы",
  orders: "Заказы",
  shift: "Смена",
  finance: "Финансы",
  stats: "Статистика",
  events: "Мероприятия",
  warehouse: "Склад",
  audit: "Действия",
};

// Статический справочник используется только для чисто клиентских эвристик
// разбора текста закупки (guessTypeId/typeKeywords) — актуальный список типов
// приходит с бэкенда через apiProductTypes() в состояние компонента ниже.
const staticProductTypes: ProductType[] = PRODUCT_TYPES;

const ignoredLines = [
  /^товары:\s*\d+/i,
  /^заказ\b/i,
  /^повторить заказ$/i,
  /^связаться с поддержкой$/i,
  /^акции$/i,
  /^каталог$/i,
  /^корзина$/i,
  /^профиль$/i,
  /^\d{1,2}:\d{2}$/,
];

const orderPortion = (position: MenuPosition) => position.orderStep ?? 1;

const formatOrderQuantity = (position: MenuPosition, quantity: number) => {
  const total = Math.round(quantity * orderPortion(position) * 100) / 100;
  return `${total} ${position.orderUnit ?? "шт"}`;
};

// shiftNotes — единственная сущность здесь, оставшаяся в localStorage: это
// чисто заметка смены на конкретном устройстве, не бизнес-данные склада/заказов.
const shiftNotesStorageKey = "hitry-lis-shift-notes";

function parseNumber(value: string) {
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parsePrice(line: string) {
  const match = line.match(/(\d[\d\s]*(?:[,.]\d+)?)\s*₽/);
  return match ? parseNumber(match[1]) : null;
}

function isTotalPriceLine(line: string) {
  return /^\d[\d\s]*(?:[,.]\d+)?\s*₽$/.test(line);
}

function isUnitPriceLine(line: string) {
  return /^\d[\d\s]*(?:[,.]\d+)?\s*₽\s*\/\s*[\d\s]*(?:[,.]\d+)?\s*\S+$/i.test(line);
}

function parseQuantity(line: string) {
  const match = line.match(/^(\d+(?:[,.]\d+)?)\s*([а-яa-z.]+)$/i);
  if (!match) return null;

  return {
    quantity: match[1].replace(",", "."),
    unit: match[2].replace(".", "").toLowerCase(),
  };
}

const packageSuffixPattern = /(\d+(?:[.,]\d+)?)\s*(кг|kg|г|g|л|l|мл|ml|шт|pcs)\.?\s*$/i;

function parsePackage(name: string) {
  const match = name.match(packageSuffixPattern);
  if (!match) return { packageSize: "1", stockUnit: "шт" };

  const value = parseNumber(match[1]);
  const unit = match[2].toLowerCase();

  if (unit === "г" || unit === "g") return { packageSize: String(Math.round(value) / 1000), stockUnit: "кг" };
  if (unit === "мл" || unit === "ml") return { packageSize: String(Math.round(value) / 1000), stockUnit: "л" };
  if (unit === "кг" || unit === "kg") return { packageSize: String(value), stockUnit: "кг" };
  if (unit === "л" || unit === "l") return { packageSize: String(value), stockUnit: "л" };
  return { packageSize: String(value), stockUnit: "шт" };
}

const typeSynonyms: [RegExp, string][] = [
  [/bbq/gi, "барбекю"],
  [/ipa/gi, "ипа"],
];

function normalizeForMatch(value: string) {
  let normalized = value.toLowerCase().replace(/ё/g, "е");
  for (const [pattern, replacement] of typeSynonyms) {
    normalized = normalized.replace(pattern, replacement);
  }
  return normalized;
}

function typeKeywords(type: ProductType) {
  return normalizeForMatch(type.name)
    .split(/[^a-zа-я0-9]+/)
    .filter((word) => word.length > 3);
}

// слова, которые встречаются больше чем у одного типа ("соус", "пиво"), не различают типы
const commonTypeWords = (() => {
  const counter = new Map<string, number>();
  for (const type of staticProductTypes) {
    for (const word of new Set(typeKeywords(type))) {
      counter.set(word, (counter.get(word) ?? 0) + 1);
    }
  }
  return new Set([...counter.entries()].filter(([, count]) => count > 1).map(([word]) => word));
})();

// подбираем тип расхода по различающим словам названия: "Соус ... сырный ..." -> "Соус сырный"
function guessTypeId(name: string) {
  const normalized = normalizeForMatch(name);
  let bestId = "";
  let bestScore = 0;

  for (const type of staticProductTypes) {
    const words = typeKeywords(type).filter((word) => !commonTypeWords.has(word));
    if (words.length === 0) continue;

    const score = words.filter((word) => normalized.includes(word.slice(0, Math.max(4, word.length - 2)))).length;
    if (score > bestScore) {
      bestScore = score;
      bestId = type.id;
    }
  }

  return bestScore > 0 ? bestId : "";
}

function isNameLine(line: string) {
  return /[a-zа-яё]/i.test(line) && !isTotalPriceLine(line) && !isUnitPriceLine(line) && parseQuantity(line) === null;
}

// строка начинает новый товар, если предыдущее название уже закончено фасовкой
// или новая строка начинается как самостоятельное название
function startsNewItem(currentName: string[], line: string) {
  if (currentName.length === 0) return false;
  if (packageSuffixPattern.test(currentName.join(" "))) return true;
  return /^[A-ZА-ЯЁ0-9]/.test(line);
}

function parsePurchaseText(text: string): ParsedItem[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !ignoredLines.some((pattern) => pattern.test(line)));

  const items: ParsedItem[] = [];
  let currentName: string[] = [];
  let totalPrice: number | null = null;
  let unitPrice: number | null = null;
  let quantity = "";
  let unit = "уп";

  const hasDetails = () => quantity !== "" || totalPrice !== null || unitPrice !== null;

  const flush = () => {
    const name = currentName.join(" ").replace(/\s+/g, " ").trim();
    currentName = [];
    const packageInfo = parsePackage(name);
    const parsedQuantity = quantity;
    const parsedUnit = unit;
    const parsedTotal = totalPrice;
    const parsedUnitPrice = unitPrice;

    totalPrice = null;
    unitPrice = null;
    quantity = "";
    unit = "уп";

    if (!name || !/[a-zа-яё]/i.test(name)) return;

    items.push({
      id: newId(),
      name,
      quantity: parsedQuantity || "1",
      unit: parsedUnit,
      typeId: guessTypeId(name),
      packageSize: packageInfo.packageSize,
      stockUnit: packageInfo.stockUnit,
      totalPrice: parsedTotal,
      unitPrice: parsedUnitPrice,
      shelfLifeDays: "7",
    });
  };

  for (const line of lines) {
    const parsedQuantity = parseQuantity(line);

    if (parsedQuantity && currentName.length > 0) {
      quantity = parsedQuantity.quantity;
      unit = parsedQuantity.unit;
      continue;
    }

    if (isUnitPriceLine(line)) {
      unitPrice = parsePrice(line);
      continue;
    }

    if (isTotalPriceLine(line)) {
      totalPrice = parsePrice(line);
      continue;
    }

    if (!isNameLine(line)) continue;

    if (hasDetails() || startsNewItem(currentName, line)) flush();
    currentName.push(line);
  }

  flush();

  return items;
}

// ── Маппинг ответов API (snake_case) в локальные camelCase-типы компонента —
// вся остальная логика рендера/производных вычислений продолжает работать
// с теми же типами Product/PurchaseRecord/... что и раньше, не заметив
// разницы между localStorage и бэкендом.

function mapApiBatch(batch: ApiBatch): StockBatch {
  return {
    id: batch.id,
    packs: batch.packs,
    remainingAmount: batch.remaining_amount,
    totalPrice: batch.total_price,
    receivedAt: batch.received_at,
    expiresAt: batch.expires_at,
    shelfLifeDays: String(batch.shelf_life_days),
  };
}

function mapApiProduct(product: ApiProduct): Product {
  const batches = product.batches.map(mapApiBatch);
  return {
    id: product.id,
    name: product.name,
    normalizedName: product.normalized_name,
    typeId: product.type_id,
    packageSize: product.package_size,
    stockUnit: product.stock_unit,
    packs: batches.reduce((sum, batch) => sum + batch.packs, 0),
    amount: batches.reduce((sum, batch) => sum + batch.remainingAmount, 0),
    shelfLifeDays: String(product.shelf_life_days),
    batches,
  };
}

function mapApiPurchase(purchase: ApiPurchaseType): PurchaseRecord {
  return {
    id: purchase.id,
    receivedAt: purchase.received_at,
    itemCount: purchase.item_count,
    total: purchase.total,
  };
}

function mapApiWriteOff(entry: ApiWriteOff): WriteOffRecord {
  return {
    id: entry.id,
    createdAt: entry.created_at,
    productName: entry.product_name,
    batchId: entry.batch_id,
    amount: entry.amount,
    unit: entry.unit,
    reason: entry.reason,
    value: entry.value,
  };
}

function mapApiMenuCategory(category: ApiMenuCategoryType): MenuCategory {
  return { id: category.id, name: category.name };
}

function mapApiMenuIngredient(ingredient: ApiMenuIngredientType): MenuIngredient {
  return {
    id: ingredient.id,
    typeId: ingredient.type_id,
    altTypeIds: ingredient.alt_type_ids,
    amount: String(ingredient.amount),
  };
}

function mapApiMenuPosition(position: ApiMenuPositionType): MenuPosition {
  return {
    id: position.id,
    name: position.name,
    price: String(position.price),
    imageUrl: position.image_url ?? "",
    orderStep: position.order_step ?? undefined,
    orderUnit: position.order_unit ?? undefined,
    categoryId: position.category_id,
    comment: position.comment,
    ingredients: position.ingredients.map(mapApiMenuIngredient),
  };
}

function mapApiOrderLineIngredient(ingredient: ApiOrderLineIngredient) {
  return {
    name: ingredient.name,
    amount: ingredient.amount_label,
    typeId: ingredient.type_id,
    rawAmount: ingredient.raw_amount,
  };
}

function mapApiOrderLine(line: ApiOrderLine): OrderLineRecord {
  return {
    menuPositionId: line.menu_position_id,
    name: line.name,
    quantity: line.quantity,
    price: line.price,
    comment: line.comment ?? undefined,
    ingredients: line.ingredients.map(mapApiOrderLineIngredient),
  };
}

function mapApiOrder(order: ApiOrder): OrderRecord {
  return {
    id: order.id,
    number: order.number,
    createdAt: order.created_at,
    completedAt: order.completed_at,
    items: order.items.map(mapApiOrderLine),
    total: order.total,
    status: order.status,
    kitchenStatus: order.kitchen_status,
    route: order.route,
    guestId: order.guest_id,
    guestName: order.guest_name,
  };
}

function formatMoney(value: number | null) {
  if (value === null) return "—";

  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

// crypto.randomUUID() требует secure context (HTTPS/localhost) — на голом
// HTTP по IP (демо без домена) его нет вообще, и без этого падало создание
// заказов/позиций/etc. Тут просто нужен уникальный id, не крипто-стойкий UUID.
function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    return `${hours} ч ${minutes % 60} мин`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function daysAgo(days: number) {
  const value = new Date();
  value.setDate(value.getDate() - days);
  return value.toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date: string, daysValue: string) {
  const days = Math.max(0, Math.trunc(parseNumber(daysValue)));
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string) {
  const diff = new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime();
  return Math.ceil(diff / 86_400_000);
}

function numericInput(value: string) {
  return value.replace(/[^\d.,]/g, "").replace(",", ".");
}

function shortId(id: string) {
  return id.replace(/-/g, "").slice(-6).toUpperCase();
}

function shelfPercent(batch: StockBatch) {
  const total = Math.max(1, parseNumber(batch.shelfLifeDays));
  const left = Math.max(0, daysBetween(today(), batch.expiresAt));
  return Math.min(100, Math.round((left / total) * 100));
}

const epsilon = 0.0001;

function isBatchExpired(batch: StockBatch) {
  return daysBetween(today(), batch.expiresAt) < 0;
}

function getProductAvailableAmount(product: Product) {
  return product.batches
    .filter((batch) => !isBatchExpired(batch))
    .reduce((sum, batch) => sum + batch.remainingAmount, 0);
}

function getProductExpiredAmount(product: Product) {
  return product.batches
    .filter((batch) => isBatchExpired(batch))
    .reduce((sum, batch) => sum + batch.remainingAmount, 0);
}

function formatAmount(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 1000) / 1000;
}

function getBatchAmount(product: Product, batch: StockBatch) {
  const packs = Number.isFinite(batch.packs) ? batch.packs : 0;
  const packageSize = Number.isFinite(product.packageSize) ? product.packageSize : 0;
  return packs * packageSize;
}

function getBatchUnitPrice(product: Product, batch: StockBatch) {
  const amount = getBatchAmount(product, batch);
  if (batch.totalPrice === null || amount <= 0) return null;
  return batch.totalPrice / amount;
}

function createBlankPosition(): MenuPosition {
  return {
    id: "draft",
    name: "",
    price: "",
    imageUrl: "",
    categoryId: null,
    ingredients: [{ id: "draft-ingredient-1", typeId: "", amount: "" }],
  };
}

export default function StaffApp() {
  const [currentRole, setCurrentRole] = useState<RoleId>("user");
  const [apiUser, setApiUser] = useState<ApiUser | null>(null);
  const [authState, setAuthState] = useState<"loading" | "guest" | "authed">("loading");

  // роль и имя — из сессии
  useEffect(() => {
    apiMe().then((user) => {
      if (user) {
        setApiUser(user);
        setCurrentRole(user.role);
        setAuthState("authed");
      } else {
        setAuthState("guest");
      }
    });
  }, []);

  const handleLogout = () => {
    apiLogout().finally(() => {
      setApiUser(null);
      setAuthState("guest");
    });
  };
  // Раздел живёт в обычном React-state, а не в Next-роутинге: переключение
  // должно быть мгновенным, без перерисовки страницы через router.push
  // (это давало заметную заминку/мигание при каждом клике по вкладке).
  // URL в адресной строке при этом всё равно обновляется вручную —
  // раздел можно освежить по F5 или дать ссылку коллеге.
  const parseSectionFromPath = (path: string): ActiveSection => {
    const slug = path.replace(/^\/staff\/?/, "").split("/")[0];
    return (
      [
        "warehouse",
        "positions",
        "guests",
        "tables",
        "orders",
        "shift",
        "finance",
        "stats",
        "events",
        "audit",
      ] as ActiveSection[]
    ).includes(slug as ActiveSection)
      ? (slug as ActiveSection)
      : "positions";
  };
  // usePathname() тут только ради безопасной SSR/гидратации первого рендера —
  // сервер и клиент видят одно и то же значение. После монтирования раздел
  // живёт своей жизнью в activeSectionState и от этого пути уже не зависит.
  const initialPathname = usePathname();
  const [activeSection, setActiveSectionState] = useState<ActiveSection>(() =>
    parseSectionFromPath(initialPathname),
  );
  const setActiveSection = (section: ActiveSection) => {
    setActiveSectionState(section);
    window.history.pushState(null, "", `/staff/${section}`);
  };
  useEffect(() => {
    const onPopState = () => setActiveSectionState(parseSectionFromPath(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  const [activeTab, setActiveTab] = useState<WarehouseTab>("products");
  const [productTypes, setProductTypes] = useState<ProductType[]>(staticProductTypes);
  const [products, setProducts] = useState<Product[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [menuPositions, setMenuPositions] = useState<MenuPosition[]>([]);
  const [menuCategories, setMenuCategories] = useState<MenuCategory[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<string>("all");
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);
  const [expandedPurchaseId, setExpandedPurchaseId] = useState<string | null>(null);
  const [expandedTypeId, setExpandedTypeId] = useState<string | null>(null);
  const [selectedTypeIds, setSelectedTypeIds] = useState<Set<string>>(new Set());
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [newProductError, setNewProductError] = useState<string | null>(null);
  const [positionFormError, setPositionFormError] = useState<string | null>(null);
  const [purchaseFormError, setPurchaseFormError] = useState<string | null>(null);
  const [categoryFormError, setCategoryFormError] = useState<string | null>(null);
  const [isTypeModalOpen, setIsTypeModalOpen] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeId, setNewTypeId] = useState("");
  const [newTypeIdTouched, setNewTypeIdTouched] = useState(false);
  const [newTypeUnit, setNewTypeUnit] = useState("шт");
  const [newTypeError, setNewTypeError] = useState<string | null>(null);
  const [isPositionModalOpen, setIsPositionModalOpen] = useState(false);
  const [editingPositionId, setEditingPositionId] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [auditEvents, setAuditEvents] = useState<ApiAuditEvent[]>([]);
  const [warehouseActivity, setWarehouseActivity] = useState<ApiActivityLogEntry[]>([]);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [lastOrderNumber, setLastOrderNumber] = useState<number | null>(null);
  const [orderGuest, setOrderGuest] = useState<ApiUser | null>(null);
  const [guestSearchQuery, setGuestSearchQuery] = useState("");
  const [orderStatusTab, setOrderStatusTab] = useState<"active" | "completed" | "cancelled">("active");
  const [orderDateFrom, setOrderDateFrom] = useState("");
  const [orderDateTo, setOrderDateTo] = useState("");
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [writeOffs, setWriteOffs] = useState<WriteOffRecord[]>([]);
  const [writeOffTarget, setWriteOffTarget] = useState<{ product: Product; batch: StockBatch } | null>(null);
  const [writeOffAmount, setWriteOffAmount] = useState("");
  const [writeOffReason, setWriteOffReason] = useState(WRITE_OFF_REASONS[0]);
  const [writeOffCustomReason, setWriteOffCustomReason] = useState("");
  const [writeOffFormError, setWriteOffFormError] = useState<string | null>(null);
  const [shiftNotes, setShiftNotes] = useState(() =>
    typeof window === "undefined" ? "" : window.localStorage.getItem(shiftNotesStorageKey) ?? "",
  );
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [orderEditItems, setOrderEditItems] = useState<OrderLineRecord[]>([]);
  const [orderItems, setOrderItems] = useState<Record<string, number>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [listQueries, setListQueries] = useState<Record<string, string>>({});
  const [infoPositionId, setInfoPositionId] = useState<string | null>(null);
  const [rawText, setRawText] = useState("");
  const [receivedAt, setReceivedAt] = useState(today());
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [newProduct, setNewProduct] = useState({
    name: "",
    quantity: "",
    unit: "уп",
    typeId: "",
    packageSize: "1",
    stockUnit: "кг",
    shelfLifeDays: "7",
    totalPrice: "",
  });
  const [draftPosition, setDraftPosition] = useState<MenuPosition>(() => createBlankPosition());

  const [guests, setGuests] = useState<ApiUser[]>([]);
  const [guestsError, setGuestsError] = useState<string | null>(null);
  const [isGuestModalOpen, setIsGuestModalOpen] = useState(false);
  const [guestFormError, setGuestFormError] = useState<string | null>(null);
  const [draftGuest, setDraftGuest] = useState({ name: "", phone: "", telegram: "", comment: "" });
  const [editingGuestId, setEditingGuestId] = useState<string | null>(null);
  const [isNavOpen, setIsNavOpen] = useState(false);

  const loadGuests = () => {
    apiGuests()
      .then((list) => {
        setGuests(list ?? []);
        setGuestsError(null);
      })
      .catch(() => setGuestsError("Не удалось загрузить гостей"));
  };

  useEffect(() => {
    if (authState === "authed" && apiUser && STAFF_ROLES.includes(apiUser.role)) {
      loadGuests();
    }
  }, [authState, apiUser]);

  const openCreateGuest = () => {
    setEditingGuestId(null);
    setDraftGuest({ name: "", phone: "", telegram: "", comment: "" });
    setGuestFormError(null);
    setIsGuestModalOpen(true);
  };

  const openEditGuest = (guest: ApiUser) => {
    setEditingGuestId(guest.id);
    setDraftGuest({
      name: guest.name,
      phone: guest.phone ?? "",
      telegram: guest.telegram ?? "",
      comment: guest.comment ?? "",
    });
    setGuestFormError(null);
    setIsGuestModalOpen(true);
  };

  const submitGuest = async () => {
    const name = draftGuest.name.trim();
    if (!name) {
      setGuestFormError("Укажите имя гостя");
      return;
    }
    setGuestFormError(null);
    const payload = {
      name,
      phone: draftGuest.phone.trim() || undefined,
      telegram: draftGuest.telegram.trim() || undefined,
      comment: draftGuest.comment.trim(),
    };
    const { data, error } = editingGuestId
      ? await apiUpdateGuest(editingGuestId, payload)
      : await apiCreateGuest(payload);
    if (error || !data) {
      setGuestFormError(error ?? "Не удалось сохранить гостя");
      return;
    }
    setGuests((current) =>
      editingGuestId ? current.map((g) => (g.id === data.id ? data : g)) : [data, ...current],
    );
    setDraftGuest({ name: "", phone: "", telegram: "", comment: "" });
    setEditingGuestId(null);
    setIsGuestModalOpen(false);
  };

  const deleteGuest = async (guest: ApiUser) => {
    if (!window.confirm(`Удалить гостя «${guest.name}»?`)) return;
    const { error } = await apiDeleteGuest(guest.id);
    if (error) {
      setGuestsError(error);
      return;
    }
    setGuests((current) => current.filter((g) => g.id !== guest.id));
  };

  // shiftNotes — единственное, что осталось в localStorage (см. комментарий у ключа выше);
  // начальное значение читается лениво в useState выше, тут только персистим изменения.
  useEffect(() => {
    window.localStorage.setItem(shiftNotesStorageKey, shiftNotes);
  }, [shiftNotes]);

  const loadProducts = () => {
    apiProducts().then((list) => setProducts((list ?? []).map(mapApiProduct)));
  };
  const loadPurchases = () => {
    apiPurchases().then((list) => setPurchases((list ?? []).map(mapApiPurchase)));
  };
  const loadWriteOffs = () => {
    apiWriteOffs().then((list) => setWriteOffs((list ?? []).map(mapApiWriteOff)));
  };
  const loadMenuCategories = () => {
    apiMenuCategories().then((list) => setMenuCategories((list ?? []).map(mapApiMenuCategory)));
  };
  const loadMenuPositions = () => {
    apiMenuPositions().then((list) => setMenuPositions((list ?? []).map(mapApiMenuPosition)));
  };
  const loadOrders = () => {
    apiOrders().then((list) => {
      if (list) setOrders(list.map(mapApiOrder));
    });
  };

  // Первичная загрузка складских/меню/заказных данных с бэкенда — источник
  // истины теперь БД, а не localStorage; всё стартует пустым до ответа API.
  useEffect(() => {
    if (authState !== "authed" || !apiUser || !STAFF_ROLES.includes(apiUser.role)) return;
    apiProductTypes().then((list) => {
      if (list && list.length > 0) setProductTypes(list);
    });
    loadProducts();
    loadPurchases();
    loadWriteOffs();
    loadMenuCategories();
    loadMenuPositions();
    loadOrders();
  }, [authState, apiUser]);

  useEffect(() => {
    if (lastOrderNumber === null) return;
    const timer = setTimeout(() => setLastOrderNumber(null), 3000);
    return () => clearTimeout(timer);
  }, [lastOrderNumber]);

  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (activeSection !== "audit") return;
    apiAuditEvents(1000).then((list) => setAuditEvents(list ?? []));
    apiWarehouseActivity(1000).then((list) => setWarehouseActivity(list ?? []));
  }, [activeSection]);

  // Заказы теперь общие для всех устройств через бэкенд (не localStorage) —
  // кухня/касса/другие вкладки могут менять статус заказа откуда угодно,
  // поэтому просто опрашиваем API вместо слежения за одним браузерным ключом.
  useEffect(() => {
    if (authState !== "authed" || !apiUser || !STAFF_ROLES.includes(apiUser.role)) return;
    const timer = setInterval(loadOrders, 3000);
    return () => clearInterval(timer);
  }, [authState, apiUser]);

  // Живой справочник типов (из apiProductTypes(), с фолбэком на статический
  // список пока запрос не ответил) — в отличие от одноимённой module-level
  // константы staticProductTypes, используемой только эвристикой парсинга.
  const getProductType = (typeId: string) => productTypes.find((type) => type.id === typeId);

  const purchaseTotal = useMemo(
    () => parsedItems.reduce((sum, item) => sum + (item.totalPrice ?? 0), 0),
    [parsedItems],
  );
  const totalUnits = useMemo(
    () => products.reduce((sum, product) => sum + getProductAvailableAmount(product), 0),
    [products],
  );
  const expiredCount = useMemo(
    () => products.flatMap((product) => product.batches).filter((batch) => isBatchExpired(batch) && batch.remainingAmount > 0).length,
    [products],
  );
  const expiringCount = useMemo(
    () => products.flatMap((product) => product.batches).filter((batch) => shelfPercent(batch) <= 25).length,
    [products],
  );
  const orderLines = useMemo(
    () =>
      menuPositions
        .map((position) => ({ position, quantity: orderItems[position.id] ?? 0 }))
        .filter((line) => line.quantity > 0),
    [menuPositions, orderItems],
  );
  const infoPosition = menuPositions.find((position) => position.id === infoPositionId) ?? null;
  const orderTotal = useMemo(
    () => orderLines.reduce((sum, line) => sum + parseNumber(line.position.price) * line.quantity, 0),
    [orderLines],
  );
  const positionSearchText = (position: MenuPosition) =>
    [
      position.name,
      ...position.ingredients.map((ingredient) => getProductType(ingredient.typeId)?.name ?? ""),
    ]
      .join(" ")
      .toLowerCase();

  const filterPositions = (positions: MenuPosition[], query: string) => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return positions;
    return positions.filter((position) => positionSearchText(position).includes(normalized));
  };

  const listKey =
    activeSection === "positions"
      ? "positions"
      : activeSection === "guests"
        ? "guests"
        : `warehouse-${activeTab}`;
  const listQuery = listQueries[listKey] ?? "";

  const filteredGuests = useMemo(() => {
    const normalized = listQuery.trim().toLowerCase();
    if (!normalized) return guests;
    return guests.filter((guest) =>
      [guest.name, guest.phone ?? "", guest.telegram ?? ""].join(" ").toLowerCase().includes(normalized),
    );
  }, [guests, listQuery]);
  const setListQuery = (value: string) =>
    setListQueries((queries) => ({ ...queries, [listKey]: value }));

  const filteredMenuPositions = useMemo(
    () => filterPositions(menuPositions, searchQuery),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [menuPositions, productTypes, searchQuery],
  );
  const listMenuPositions = useMemo(() => {
    const byCategory =
      activeCategoryId === "all"
        ? menuPositions
        : activeCategoryId === uncategorizedCategoryId
          ? menuPositions.filter((p) => !p.categoryId)
          : menuPositions.filter((p) => p.categoryId === activeCategoryId);
    return filterPositions(byCategory, listQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuPositions, productTypes, listQuery, activeCategoryId]);
  const listProducts = useMemo(() => {
    const query = listQuery.trim().toLowerCase();
    if (!query) return products;
    return products.filter((product) =>
      `${product.name} ${getProductType(product.typeId)?.name ?? ""}`.toLowerCase().includes(query),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, productTypes, listQuery]);

  // Ингредиент = "папка": один type_id может объединять несколько разных
  // товаров (разные поставщики/фасовки одного и того же по сути товара).
  // Склад автоматически списывает/суммирует остаток по всем товарам папки.
  const listIngredientGroups = useMemo(() => {
    const query = listQuery.trim().toLowerCase();
    const byType = new Map<string, Product[]>();
    for (const product of products) {
      const list = byType.get(product.typeId) ?? [];
      list.push(product);
      byType.set(product.typeId, list);
    }
    return productTypes
      .map((type) => ({ type, products: byType.get(type.id) ?? [] }))
      .filter(
        (group) => !query || `${group.type.name} ${group.products.map((p) => p.name).join(" ")}`.toLowerCase().includes(query),
      )
      .sort((a, b) => a.type.name.localeCompare(b.type.name, "ru"));
  }, [products, productTypes, listQuery]);

  const renderProductRow = (product: Product) => {
    const type = getProductType(product.typeId);
    const lastBatch = product.batches.at(-1);
    const lastUnitPrice = lastBatch ? getBatchUnitPrice(product, lastBatch) : null;
    const amount = getProductAvailableAmount(product);
    const expiredAmount = getProductExpiredAmount(product);
    const packageSize = Number.isFinite(product.packageSize) ? product.packageSize : 0;
    return (
      <div key={product.id}>
        <button
          className="grid w-full gap-3 p-4 text-left lg:grid-cols-[minmax(0,1fr)_130px_150px_130px_40px]"
          type="button"
          onClick={() => setExpandedProductId(expandedProductId === product.id ? null : product.id)}
        >
          <span className="min-w-0">
            <span className="block truncate font-medium">{product.name}</span>
            <span className="mt-1 block truncate text-xs text-zinc-500">{type?.name ?? "Тип не указан"}</span>
          </span>
          <span className="text-sm text-zinc-400">
            {formatAmount(amount)} {product.stockUnit}
            {expiredAmount > 0 && (
              <span className="mt-1 block text-xs text-rose-400">
                просрочено {formatAmount(expiredAmount)} {product.stockUnit}
              </span>
            )}
          </span>
          <span className="text-sm text-zinc-400">
            {formatAmount(packageSize)} {product.stockUnit} / уп.
          </span>
          <span className="text-sm text-zinc-400">
            {lastUnitPrice === null ? "без цены" : `${formatMoney(lastUnitPrice)} / ${product.stockUnit}`}
          </span>
          <ChevronDown
            className={`size-4 text-zinc-500 transition ${expandedProductId === product.id ? "rotate-180" : ""}`}
          />
        </button>

        {expandedProductId === product.id && (
          <div className="space-y-3 border-t border-white/8 bg-[#17181b] p-4">
            <div className="grid gap-3 md:grid-cols-[minmax(220px,420px)_220px_130px_120px_160px]">
              <Field label="Название товара" hint="Меняется только через новую закупку — бэкенд не поддерживает переименование товара">
                <input
                  className="h-10 w-full min-w-0 rounded-xl border border-white/8 bg-[#111214] px-3 text-sm text-zinc-400 outline-none"
                  value={product.name}
                  readOnly
                />
              </Field>
              <Field label="Тип расхода" hint="Задаётся при создании товара — бэкенд не поддерживает смену типа">
                <DarkSelect
                  value={product.typeId}
                  options={productTypes.map((item) => ({ id: item.id, label: item.name }))}
                  onChange={() => {}}
                  disabled
                />
              </Field>
              <Field label="Фасовка" hint="Сколько единиц расхода в одной упаковке">
                <input
                  className="h-10 w-full min-w-0 rounded-xl border border-white/8 bg-[#111214] px-3 text-sm outline-none focus:border-zinc-400"
                  inputMode="decimal"
                  value={product.packageSize}
                  onChange={(event) =>
                    updateProductPackageSize(product.id, Math.max(0, parseNumber(event.target.value)))
                  }
                />
              </Field>
              <Field label="Ед. расхода" hint="Задаётся при создании товара — бэкенд не поддерживает смену единицы">
                <input
                  className="h-10 w-full min-w-0 rounded-xl border border-white/8 bg-[#111214] px-3 text-sm text-zinc-400 outline-none"
                  value={product.stockUnit}
                  readOnly
                />
              </Field>
              <Field label="Срок по умолчанию, дн." hint="Подставляется новым партиям этого товара">
                <input
                  className="h-10 w-full min-w-0 rounded-xl border border-white/8 bg-[#111214] px-3 text-sm outline-none focus:border-zinc-400"
                  inputMode="numeric"
                  value={product.shelfLifeDays}
                  onChange={(event) => updateProductShelfLifeDays(product.id, event.target.value)}
                />
              </Field>
            </div>

            {product.batches.length === 0 ? (
              <div className="grid min-h-20 place-items-center rounded-xl border border-white/8 bg-[#111214]">
                <Archive className="size-5 text-zinc-600" />
              </div>
            ) : (
              product.batches.map((batch) => {
                const percent = shelfPercent(batch);
                const batchAmount = getBatchAmount(product, batch);
                const batchUnitPrice = getBatchUnitPrice(product, batch);
                const expired = isBatchExpired(batch);
                const spent = batch.remainingAmount <= 0;
                return (
                  <div key={batch.id} className="space-y-3 rounded-xl border border-white/8 bg-[#111214] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2">
                        <span>
                          Партия: {formatAmount(batch.remainingAmount)} из {formatAmount(batchAmount)}{" "}
                          {product.stockUnit}, {formatAmount(batch.packs)} уп.
                        </span>
                        {expired && (
                          <span className="rounded bg-rose-500/15 px-2 py-0.5 text-xs text-rose-300">просрочено</span>
                        )}
                        {!expired && spent && (
                          <span className="rounded bg-white/6 px-2 py-0.5 text-xs text-zinc-400">израсходовано</span>
                        )}
                      </span>
                      <span className="text-zinc-500">
                        закуплено {batch.receivedAt}, годен до {batch.expiresAt}
                      </span>
                      <span className="text-zinc-400">
                        {batchUnitPrice === null ? "без цены" : `${formatMoney(batchUnitPrice)} / ${product.stockUnit}`}
                      </span>
                      <button
                        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-xl border border-white/8 px-3 text-xs text-zinc-300 hover:bg-[#25272c] disabled:cursor-not-allowed disabled:opacity-40"
                        type="button"
                        disabled={spent}
                        onClick={() => {
                          setWriteOffTarget({ product, batch });
                          setWriteOffAmount(String(formatAmount(batch.remainingAmount)));
                          setWriteOffReason(WRITE_OFF_REASONS[0]);
                          setWriteOffCustomReason("");
                          setWriteOffFormError(null);
                        }}
                      >
                        <Trash2 className="size-3.5" />
                        Списать
                      </button>
                    </div>
                    <div className="grid gap-2 md:grid-cols-[110px_130px_140px_150px_110px_150px]">
                      <Field label="Упаковок" hint="Сколько упаковок пришло в этой партии">
                        <input
                          className="h-9 w-full min-w-0 rounded-xl border border-white/8 bg-[#17181b] px-3 text-sm outline-none focus:border-zinc-400"
                          inputMode="decimal"
                          value={batch.packs}
                          onChange={(event) =>
                            updateProductBatch(product.id, batch.id, { packs: parseNumber(event.target.value) })
                          }
                        />
                      </Field>
                      <Field label={`Остаток, ${product.stockUnit}`} hint="Сколько реально осталось от партии">
                        <input
                          className="h-9 w-full min-w-0 rounded-xl border border-white/8 bg-[#17181b] px-3 text-sm outline-none focus:border-zinc-400"
                          inputMode="decimal"
                          value={batch.remainingAmount}
                          onChange={(event) =>
                            updateProductBatch(product.id, batch.id, {
                              remainingAmount: Math.max(0, parseNumber(event.target.value)),
                            })
                          }
                        />
                      </Field>
                      <Field label="Цена партии, ₽" hint="Сумма по чеку — бэкенд не поддерживает правку цены после создания партии">
                        <input
                          className="h-9 w-full min-w-0 rounded-xl border border-white/8 bg-[#17181b] px-3 text-sm text-zinc-400 outline-none"
                          value={batch.totalPrice ?? "без цены"}
                          readOnly
                        />
                      </Field>
                      <Field label="Дата закупки" hint="От неё считается срок годности">
                        <input
                          className="h-9 w-full min-w-0 rounded-xl border border-white/8 bg-[#17181b] px-3 text-sm outline-none focus:border-zinc-400"
                          type="date"
                          value={batch.receivedAt}
                          onChange={(event) => updateProductBatch(product.id, batch.id, { receivedAt: event.target.value })}
                        />
                      </Field>
                      <Field label="Срок, дн." hint="Сколько дней партия годна с даты закупки">
                        <input
                          className="h-9 w-full min-w-0 rounded-xl border border-white/8 bg-[#17181b] px-3 text-sm outline-none focus:border-zinc-400"
                          inputMode="numeric"
                          value={batch.shelfLifeDays}
                          onChange={(event) =>
                            updateProductBatch(product.id, batch.id, { shelfLifeDays: numericInput(event.target.value) })
                          }
                        />
                      </Field>
                      <Field label="Годен до" hint="Реальная дата с упаковки: свежая партия или уже уставшая">
                        <input
                          className="h-9 w-full min-w-0 rounded-xl border border-white/8 bg-[#17181b] px-3 text-sm outline-none focus:border-zinc-400"
                          type="date"
                          value={batch.expiresAt}
                          onChange={(event) =>
                            updateProductBatch(product.id, batch.id, {
                              shelfLifeDays: String(Math.max(0, daysBetween(batch.receivedAt, event.target.value))),
                            })
                          }
                        />
                      </Field>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-zinc-800">
                      <div
                        className={`h-2 rounded-full ${
                          percent <= 25 ? "bg-red-400" : percent <= 50 ? "bg-amber-300" : "bg-emerald-400"
                        }`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    );
  };

  const getPurchaseBatches = (purchase: PurchaseRecord) =>
    products
      .flatMap((product) =>
        product.batches
          .filter((batch) => batch.receivedAt === purchase.receivedAt)
          .map((batch) => ({ product, batch })),
      )
      .sort((a, b) => a.product.name.localeCompare(b.product.name, "ru"));

  const listPurchases = useMemo(() => {
    const query = listQuery.trim().toLowerCase();
    if (!query) return purchases;
    return purchases.filter((purchase) => {
      const items = getPurchaseBatches(purchase)
        .map(({ product }) => product.name)
        .join(" ");
      return `${purchase.receivedAt} ${items} ${shortId(purchase.id)}`.toLowerCase().includes(query);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchases, products, listQuery]);

  const listWriteOffs = useMemo(() => {
    const query = listQuery.trim().toLowerCase();
    if (!query) return writeOffs;
    return writeOffs.filter((entry) => `${entry.productName} ${entry.reason}`.toLowerCase().includes(query));
  }, [writeOffs, listQuery]);

  const todayKey = new Date().toISOString().slice(0, 10);
  const todayOrders = useMemo(
    () => orders.filter((order) => order.createdAt.slice(0, 10) === todayKey),
    [orders, todayKey],
  );
  const todayWriteOffs = useMemo(
    () => writeOffs.filter((entry) => entry.createdAt.slice(0, 10) === todayKey),
    [writeOffs, todayKey],
  );
  const todayRevenue = todayOrders.reduce((sum, order) => sum + order.total, 0);

  // Финансы: единое ядро маржинальности — сводит выручку заказов, расходы на
  // закупки и потери от списаний по всем сущностям склада/касс в одну картину.
  const activeOrders = useMemo(() => orders.filter((o) => o.status !== "cancelled"), [orders]);
  const totalRevenue = useMemo(() => activeOrders.reduce((sum, o) => sum + o.total, 0), [activeOrders]);
  const totalPurchasesCost = useMemo(() => purchases.reduce((sum, p) => sum + p.total, 0), [purchases]);
  const totalWriteOffLoss = useMemo(() => writeOffs.reduce((sum, w) => sum + w.value, 0), [writeOffs]);
  const netMargin = totalRevenue - totalPurchasesCost - totalWriteOffLoss;
  const todayWriteOffLoss = todayWriteOffs.reduce((sum, w) => sum + w.value, 0);
  const todayPurchasesCost = useMemo(
    () => purchases.filter((p) => p.receivedAt === todayKey).reduce((sum, p) => sum + p.total, 0),
    [purchases, todayKey],
  );
  const todayMargin = todayRevenue - todayPurchasesCost - todayWriteOffLoss;

  // Статистика: детализация по позициям, дням выручки и причинам списаний —
  // считается из тех же заказов/списаний, что и «Финансы», просто подробнее.
  const topPositions = useMemo(() => {
    const stats = new Map<string, { qty: number; revenue: number }>();
    for (const order of activeOrders) {
      for (const line of order.items) {
        const entry = stats.get(line.name) ?? { qty: 0, revenue: 0 };
        entry.qty += line.quantity;
        entry.revenue += line.price * line.quantity;
        stats.set(line.name, entry);
      }
    }
    return [...stats.entries()].sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 10);
  }, [activeOrders]);

  const revenueByDay = useMemo(() => {
    const days: [string, number][] = Array.from({ length: 14 }, (_, i) => [daysAgo(13 - i), 0]);
    const byDay = new Map(days);
    for (const order of activeOrders) {
      const key = order.createdAt.slice(0, 10);
      if (byDay.has(key)) byDay.set(key, (byDay.get(key) ?? 0) + order.total);
    }
    return days.map(([day]) => [day, byDay.get(day) ?? 0] as [string, number]);
  }, [activeOrders]);

  const writeOffsByReason = useMemo(() => {
    const stats = new Map<string, number>();
    for (const entry of writeOffs) {
      stats.set(entry.reason, (stats.get(entry.reason) ?? 0) + entry.value);
    }
    return [...stats.entries()].sort((a, b) => b[1] - a[1]);
  }, [writeOffs]);

  const guestSearchResults = useMemo(() => {
    const query = guestSearchQuery.trim().toLowerCase();
    if (!query) return [];
    return guests
      .filter((g) => [g.name, g.telegram ?? "", g.phone ?? ""].join(" ").toLowerCase().includes(query))
      .slice(0, 6);
  }, [guests, guestSearchQuery]);

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (order.status !== orderStatusTab) return false;
      const date = order.createdAt.slice(0, 10);
      if (orderDateFrom && date < orderDateFrom) return false;
      if (orderDateTo && date > orderDateTo) return false;
      return true;
    });
  }, [orders, orderStatusTab, orderDateFrom, orderDateTo]);

  const updateParsedItem = (id: string, patch: Partial<ParsedItem>) => {
    setParsedItems((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  // Бэкенд (ProductUpdate) поддерживает обновление товара только по двум
  // полям — package_size и shelf_life_days; name/type_id/stock_unit менять
  // нельзя (см. warehouse_schemas.py). Поля с названием/типом/ед. расхода в
  // разметке ниже сделаны read-only по этой причине (отклонение от исходной
  // localStorage-версии, где это было чисто клиентское состояние).
  const updateProductPackageSize = async (id: string, packageSize: number) => {
    if (packageSize <= 0) return;
    const { data } = await apiUpdateProduct(id, { package_size: packageSize });
    if (data) setProducts((items) => items.map((item) => (item.id === id ? mapApiProduct(data) : item)));
  };

  const updateProductShelfLifeDays = async (id: string, shelfLifeDays: string) => {
    const days = Math.max(0, Math.trunc(parseNumber(shelfLifeDays)));
    const { data } = await apiUpdateProduct(id, { shelf_life_days: days });
    if (data) setProducts((items) => items.map((item) => (item.id === id ? mapApiProduct(data) : item)));
  };

  // BatchUpdate тоже не поддерживает total_price — цену партии показываем,
  // но менять с бэкендом синхронно нельзя, поле сделано read-only.
  const updateProductBatch = async (productId: string, batchId: string, patch: Partial<StockBatch>) => {
    const payload: { packs?: number; remaining_amount?: number; received_at?: string; shelf_life_days?: number } = {};
    if (patch.packs !== undefined) payload.packs = patch.packs;
    if (patch.remainingAmount !== undefined) payload.remaining_amount = patch.remainingAmount;
    if (patch.receivedAt !== undefined) payload.received_at = patch.receivedAt;
    if (patch.shelfLifeDays !== undefined) {
      payload.shelf_life_days = Math.max(0, Math.trunc(parseNumber(patch.shelfLifeDays)));
    }
    if (Object.keys(payload).length === 0) return;
    const { data } = await apiUpdateBatch(productId, batchId, payload);
    if (data) setProducts((items) => items.map((item) => (item.id === productId ? mapApiProduct(data) : item)));
  };

  const changeOrderQuantity = (positionId: string, delta: number) => {
    setOrderItems((items) => {
      const nextQuantity = Math.max(0, (items[positionId] ?? 0) + delta);
      const next = { ...items };
      if (nextQuantity === 0) {
        delete next[positionId];
      } else {
        next[positionId] = nextQuantity;
      }
      return next;
    });
  };

  const getTypeAvailableAmount = (typeId: string) =>
    products
      .filter((product) => product.typeId === typeId)
      .reduce((sum, product) => sum + getProductAvailableAmount(product), 0);

  // Если у ингредиента есть альтернативы (например, картофель фри от другого
  // поставщика) — берём первую, на которой хватает остатка, иначе основную.
  const resolveIngredientTypeId = (ingredient: MenuIngredient) => {
    const amount = parseNumber(ingredient.amount);
    const candidates = [ingredient.typeId, ...(ingredient.altTypeIds ?? [])].filter(Boolean);
    return candidates.find((id) => getTypeAvailableAmount(id) + epsilon >= amount) ?? ingredient.typeId;
  };

  // Читаемый состав порции — чтобы бармен мог назвать его гостю прямо во время заказа
  const describeComposition = (position: MenuPosition) =>
    position.ingredients
      .map((ingredient) => {
        const type = getProductType(resolveIngredientTypeId(ingredient));
        if (!type) return null;
        return `${type.name} ${formatAmount(parseNumber(ingredient.amount))} ${type.unit}`;
      })
      .filter(Boolean)
      .join(", ");

  const collectRequirements = (ingredients: MenuIngredient[]) => {
    const required = new Map<string, number>();
    for (const ingredient of ingredients) {
      if (!ingredient.typeId) continue;
      const resolvedTypeId = resolveIngredientTypeId(ingredient);
      required.set(resolvedTypeId, (required.get(resolvedTypeId) ?? 0) + parseNumber(ingredient.amount));
    }
    return required;
  };

  const hasEnoughStock = (ingredients: MenuIngredient[]) =>
    [...collectRequirements(ingredients).entries()].every(
      ([typeId, amount]) => getTypeAvailableAmount(typeId) + epsilon >= amount,
    );

  const submitWriteOff = async () => {
    if (!writeOffTarget) return;
    const { product, batch } = writeOffTarget;
    const amount = parseNumber(writeOffAmount);
    const reason = writeOffReason === "Другое" ? writeOffCustomReason.trim() : writeOffReason;
    if (amount <= 0 || amount > batch.remainingAmount + epsilon) {
      setWriteOffFormError(`Укажите количество от 0 до ${formatAmount(batch.remainingAmount)} ${product.stockUnit}`);
      return;
    }
    if (!reason) {
      setWriteOffFormError("Укажите причину списания");
      return;
    }

    const { error } = await apiCreateWriteOff({
      product_id: product.id,
      batch_id: batch.id,
      amount,
      reason,
    });
    if (error) {
      setWriteOffFormError(error);
      return;
    }

    loadProducts();
    loadWriteOffs();
    setWriteOffTarget(null);
    setWriteOffAmount("");
    setWriteOffCustomReason("");
    setWriteOffFormError(null);
  };

  const applyPurchase = async () => {
    if (parsedItems.length === 0) {
      setPurchaseFormError("Нечего сохранять — распознайте или добавьте хотя бы одну позицию закупки");
      return;
    }

    const items: PurchaseItemPayload[] = parsedItems.map((item) => ({
      name: item.name.trim(),
      type_id: item.typeId || "type-misc",
      package_size: Math.max(0, parseNumber(item.packageSize || "1")) || 1,
      stock_unit: item.stockUnit || getProductType(item.typeId)?.unit || item.unit || "шт",
      shelf_life_days: Math.max(0, Math.trunc(parseNumber(item.shelfLifeDays || "7"))),
      packs: parseNumber(item.quantity),
      total_price: item.totalPrice,
    }));

    const { error } = await apiCreatePurchase({
      source_text: rawText,
      received_at: receivedAt,
      items,
    });
    if (error) {
      setPurchaseFormError(error);
      return;
    }

    loadProducts();
    loadPurchases();
    setRawText("");
    setParsedItems([]);
    setPurchaseFormError(null);
    setIsPurchaseModalOpen(false);
    setActiveSection("warehouse");
    setActiveTab("purchases");
  };

  const addManualProduct = async () => {
    if (!newProduct.name.trim()) {
      setNewProductError("Укажите название товара");
      return;
    }

    const packs = parseNumber(newProduct.quantity);
    const packageSize = Math.max(0, parseNumber(newProduct.packageSize || "1")) || 1;
    if (packs <= 0) {
      setNewProductError("Укажите количество упаковок (больше нуля)");
      return;
    }

    const { error } = await apiAddManualProduct({
      name: newProduct.name.trim(),
      type_id: newProduct.typeId || "type-misc",
      package_size: packageSize,
      stock_unit: newProduct.stockUnit || "шт",
      shelf_life_days: Math.max(0, Math.trunc(parseNumber(newProduct.shelfLifeDays || "7"))),
      packs,
      total_price: newProduct.totalPrice ? parseNumber(newProduct.totalPrice) : null,
      received_at: receivedAt,
    });
    if (error) {
      setNewProductError(error);
      return;
    }

    loadProducts();
    setNewProduct({
      name: "",
      quantity: "",
      unit: "уп",
      typeId: "",
      packageSize: "1",
      stockUnit: "кг",
      shelfLifeDays: "7",
      totalPrice: "",
    });
    setNewProductError(null);
    setIsProductModalOpen(false);
    setActiveSection("warehouse");
    setActiveTab("products");
  };

  const slugifyTypeId = (name: string) =>
    "type-" +
    name
      .toLowerCase()
      .replaceAll("ё", "е")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "");

  const createProductType = async () => {
    const name = newTypeName.trim();
    const id = (newTypeId.trim() || slugifyTypeId(name)).trim();
    const unit = newTypeUnit.trim();
    if (!name) {
      setNewTypeError("Укажите название ингредиента");
      return;
    }
    if (!id || id === "type-") {
      setNewTypeError("Укажите id (латиницей) — не удалось собрать его из названия");
      return;
    }
    if (!unit) {
      setNewTypeError("Укажите единицу измерения");
      return;
    }
    if (productTypes.some((type) => type.id === id)) {
      setNewTypeError("Ингредиент с таким id уже существует");
      return;
    }
    const { data, error } = await apiCreateProductType({ id, name, unit });
    if (error || !data) {
      setNewTypeError(error ?? "Не удалось создать ингредиент");
      return;
    }
    setProductTypes((prev) => [...prev, data]);
    setIsTypeModalOpen(false);
  };

  // Экспорт/импорт справочника ингредиентов (product_types) — отдельно от
  // экспорта товаров/остатков: это компактный список "какие ингредиенты
  // вообще есть в системе и сколько их сейчас на складе", нужен как
  // структурная подсказка для GPT при написании рецептов (какие type_id
  // валидны, что реально в наличии). Если что-то отмечено чекбоксами —
  // выгружаем только это, иначе — все ингредиенты.
  const exportIngredientTypesJson = () => {
    const idsToExport = selectedTypeIds.size > 0 ? selectedTypeIds : new Set(productTypes.map((t) => t.id));
    const ingredients = productTypes
      .filter((type) => idsToExport.has(type.id))
      .map((type) => ({
        id: type.id,
        name: type.name,
        unit: type.unit,
        available_amount: Math.round(getTypeAvailableAmount(type.id) * 1000) / 1000,
      }));
    const blob = new Blob([JSON.stringify({ ingredients }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ingredients-export-${today()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importIngredientTypesFromFile = async (file: File) => {
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      window.alert("Файл повреждён или это не JSON");
      return;
    }
    const rawItems = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as { ingredients?: unknown }).ingredients)
        ? (parsed as { ingredients: unknown[] }).ingredients
        : parsed && typeof parsed === "object" && Array.isArray((parsed as { product_types?: unknown }).product_types)
          ? (parsed as { product_types: unknown[] }).product_types
          : null;
    if (!rawItems) {
      window.alert("Неверный формат файла: ожидался массив ингредиентов или объект {ingredients: [...]}");
      return;
    }
    const items = rawItems
      .filter((item): item is { id: string; name: string; unit: string } => {
        const rec = item as Record<string, unknown>;
        return typeof rec?.id === "string" && typeof rec?.name === "string" && typeof rec?.unit === "string";
      })
      .map((item) => ({ id: item.id, name: item.name, unit: item.unit }));
    if (items.length === 0) {
      window.alert("В файле нет ни одной записи с id/name/unit");
      return;
    }
    const { data, error } = await apiImportProductTypes(items);
    if (error || !data) {
      window.alert(error ?? "Не удалось импортировать ингредиенты");
      return;
    }
    window.alert(`Импорт завершён: новых ингредиентов — ${data.created}, пропущено (уже есть) — ${data.skipped}`);
    apiProductTypes().then((list) => {
      if (list) setProductTypes(list);
    });
  };

  // Экспорт/импорт склада в JSON — бэкап/перенос между окружениями. Экспорт
  // сознательно шлёт свежий сырой ответ apiProducts() (snake_case, тот же
  // ProductOut[], что отдаёт GET /warehouse/products), а не реshaping
  // camelCase-стейта products — тогда файл 1:1 подходит обратно в импорт
  // без какой-либо трансформации на клиенте.
  const exportProductsJson = async () => {
    const list = await apiProducts();
    if (!list) {
      window.alert("Не удалось получить товары для экспорта");
      return;
    }
    const blob = new Blob([JSON.stringify(list, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `warehouse-export-${today()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importProductsFromFile = async (file: File) => {
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      window.alert("Файл повреждён или это не JSON");
      return;
    }
    const items = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as { products?: unknown }).products)
        ? (parsed as { products: unknown[] }).products
        : null;
    if (!items) {
      window.alert("Неверный формат файла: ожидался массив товаров или объект {products: [...]}");
      return;
    }
    const { data, error } = await apiImportProducts(items as ProductImportPayload[]);
    if (error || !data) {
      window.alert(error ?? "Не удалось импортировать товары");
      return;
    }
    window.alert(
      `Импорт завершён: новых товаров — ${data.products_created}, найдено существующих — ${data.products_matched}, добавлено партий — ${data.batches_created}`,
    );
    loadProducts();
  };

  const exportPositionsJson = async () => {
    const list = await apiExportMenuPositions();
    if (!list) {
      window.alert("Не удалось получить позиции для экспорта");
      return;
    }
    const blob = new Blob([JSON.stringify(list, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `menu-positions-export-${today()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importPositionsFromFile = async (file: File) => {
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      window.alert("Файл повреждён или это не JSON");
      return;
    }
    const items = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as { positions?: unknown }).positions)
        ? (parsed as { positions: unknown[] }).positions
        : null;
    if (!items) {
      window.alert("Неверный формат файла: ожидался массив позиций или объект {positions: [...]}");
      return;
    }
    const { data, error } = await apiImportMenuPositions(items as MenuPositionExportPayload[]);
    if (error || !data) {
      window.alert(error ?? "Не удалось импортировать позиции");
      return;
    }
    window.alert(
      `Импорт завершён: новых позиций — ${data.positions_created}, обновлено — ${data.positions_updated}, новых разделов — ${data.categories_created}`,
    );
    loadMenuPositions();
    loadMenuCategories();
  };

  const addIngredientRow = () => {
    setDraftPosition((position) => ({
      ...position,
      ingredients: [...position.ingredients, { id: newId(), typeId: "", amount: "" }],
    }));
  };

  const updateIngredient = (id: string, patch: Partial<MenuIngredient>) => {
    setDraftPosition((position) => ({
      ...position,
      ingredients: position.ingredients.map((ingredient) =>
        ingredient.id === id ? { ...ingredient, ...patch } : ingredient,
      ),
    }));
  };

  const removeIngredientRow = (id: string) => {
    setDraftPosition((position) => ({
      ...position,
      ingredients: position.ingredients.filter((ingredient) => ingredient.id !== id),
    }));
  };

  const addIngredientAlt = (id: string) => {
    setDraftPosition((position) => ({
      ...position,
      ingredients: position.ingredients.map((ingredient) =>
        ingredient.id === id ? { ...ingredient, altTypeIds: [...(ingredient.altTypeIds ?? []), ""] } : ingredient,
      ),
    }));
  };

  const updateIngredientAlt = (id: string, altIndex: number, value: string) => {
    setDraftPosition((position) => ({
      ...position,
      ingredients: position.ingredients.map((ingredient) =>
        ingredient.id === id
          ? { ...ingredient, altTypeIds: (ingredient.altTypeIds ?? []).map((a, i) => (i === altIndex ? value : a)) }
          : ingredient,
      ),
    }));
  };

  const removeIngredientAlt = (id: string, altIndex: number) => {
    setDraftPosition((position) => ({
      ...position,
      ingredients: position.ingredients.map((ingredient) =>
        ingredient.id === id
          ? { ...ingredient, altTypeIds: (ingredient.altTypeIds ?? []).filter((_, i) => i !== altIndex) }
          : ingredient,
      ),
    }));
  };

  const openEditPosition = (position: MenuPosition) => {
    setEditingPositionId(position.id);
    setDraftPosition({ ...position, ingredients: position.ingredients.map((i) => ({ ...i })) });
    setPositionFormError(null);
    setIsPositionModalOpen(true);
  };

  const deletePosition = async (position: MenuPosition) => {
    if (!window.confirm(`Удалить позицию «${position.name}»?`)) return;
    const { error } = await apiDeleteMenuPosition(position.id);
    if (error) {
      window.alert(error);
      return;
    }
    setMenuPositions((prev) => prev.filter((p) => p.id !== position.id));
  };

  const uploadPositionImage = async (file: File) => {
    setIsUploadingImage(true);
    setImageUploadError(null);
    const { url, error } = await apiUploadImage(file);
    setIsUploadingImage(false);
    if (error || !url) {
      setImageUploadError(error ?? "Не удалось загрузить фото");
      return;
    }
    setDraftPosition((position) => ({ ...position, imageUrl: url }));
  };

  // is_active всегда true — в этом клиенте нет переключателя видимости
  // позиции, все созданные позиции сразу видны на /menu-display.
  const buildMenuPositionPayload = (position: MenuPosition, ingredients: MenuIngredient[]): MenuPositionPayload => ({
    name: position.name.trim(),
    price: parseNumber(position.price),
    category_id: position.categoryId || null,
    image_url: position.imageUrl || null,
    order_step: position.orderStep ?? null,
    order_unit: position.orderUnit ?? null,
    comment: position.comment ?? "",
    is_active: true,
    ingredients: ingredients.map(
      (ingredient): MenuIngredientPayload => ({
        type_id: ingredient.typeId,
        alt_type_ids: (ingredient.altTypeIds ?? []).filter(Boolean),
        amount: parseNumber(ingredient.amount),
      }),
    ),
  });

  const saveMenuPosition = async () => {
    if (!draftPosition.name.trim()) {
      setPositionFormError("Укажите название позиции");
      return;
    }
    const ingredients = draftPosition.ingredients.filter(
      (ingredient) => ingredient.typeId && parseNumber(ingredient.amount) > 0,
    );
    if (ingredients.length === 0) {
      setPositionFormError(
        draftPosition.ingredients.length === 0
          ? "Добавьте хотя бы один ингредиент в состав"
          : "В строках состава не выбран тип расхода или указан нулевой расход — заполните хотя бы одну строку целиком",
      );
      return;
    }

    const payload = buildMenuPositionPayload(draftPosition, ingredients);
    const { error } = editingPositionId
      ? await apiUpdateMenuPosition(editingPositionId, payload)
      : await apiCreateMenuPosition(payload);
    if (error) {
      setPositionFormError(error);
      return;
    }

    loadMenuPositions();
    setEditingPositionId(null);
    setDraftPosition(createBlankPosition());
    setPositionFormError(null);
    setIsPositionModalOpen(false);
  };

  const createCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) {
      setCategoryFormError("Укажите название раздела");
      return;
    }
    const { data, error } = await apiCreateMenuCategory(name);
    if (error || !data) {
      setCategoryFormError(error ?? "Не удалось создать раздел");
      return;
    }
    setMenuCategories((prev) => [...prev, mapApiMenuCategory(data)]);
    setNewCategoryName("");
    setCategoryFormError(null);
  };

  const startRenameCategory = (category: MenuCategory) => {
    setEditingCategoryId(category.id);
    setEditingCategoryName(category.name);
  };

  const saveRenameCategory = async () => {
    const name = editingCategoryName.trim();
    const categoryId = editingCategoryId;
    setEditingCategoryId(null);
    if (!name || !categoryId) return;
    const { data, error } = await apiUpdateMenuCategory(categoryId, name);
    if (error || !data) {
      window.alert(error ?? "Не удалось переименовать раздел");
      return;
    }
    setMenuCategories((prev) => prev.map((c) => (c.id === data.id ? mapApiMenuCategory(data) : c)));
  };

  const deleteCategory = async (category: MenuCategory) => {
    if (!window.confirm(`Удалить раздел «${category.name}»? Позиции останутся, но без раздела.`)) return;
    const { error } = await apiDeleteMenuCategory(category.id);
    if (error) {
      window.alert(error);
      return;
    }
    setMenuCategories((prev) => prev.filter((c) => c.id !== category.id));
    setMenuPositions((prev) =>
      prev.map((position) => (position.categoryId === category.id ? { ...position, categoryId: null } : position)),
    );
    if (activeCategoryId === category.id) setActiveCategoryId("all");
  };

  const canSellMenuPosition = (position: MenuPosition) => hasEnoughStock(position.ingredients);

  // Правило: доступные позиции всегда сверху, недоступные — снизу.
  const byAvailability = (list: MenuPosition[]) =>
    [...list].sort((a, b) => Number(canSellMenuPosition(b)) - Number(canSellMenuPosition(a)));
  const sortedListMenuPositions = byAvailability(listMenuPositions);
  const sortedFilteredMenuPositions = byAvailability(filteredMenuPositions);

  // Меню в модалке заказа — разбито на разделы с заголовками, как в реальном меню
  const groupPositionsByCategory = (positions: MenuPosition[]) => {
    const byCategory = new Map<string, MenuPosition[]>();
    for (const position of positions) {
      const key = position.categoryId ?? uncategorizedCategoryId;
      const list = byCategory.get(key) ?? [];
      list.push(position);
      byCategory.set(key, list);
    }
    const groups: { id: string; label: string; positions: MenuPosition[] }[] = [];
    for (const category of menuCategories) {
      const positions = byCategory.get(category.id);
      if (positions) groups.push({ id: category.id, label: category.name, positions });
    }
    const uncategorized = byCategory.get(uncategorizedCategoryId);
    if (uncategorized) groups.push({ id: uncategorizedCategoryId, label: "Без раздела", positions: uncategorized });
    return groups;
  };
  const groupedOrderPositions = groupPositionsByCategory(sortedFilteredMenuPositions);

  const orderIngredients = orderLines.flatMap((line) =>
    line.position.ingredients.map((ingredient) => ({
      ...ingredient,
      id: `${line.position.id}-${ingredient.id}`,
      amount: String(parseNumber(ingredient.amount) * line.quantity),
    })),
  );

  const canCompleteOrder = () => hasEnoughStock(orderIngredients);

  // хватает ли остатка ещё на одну порцию с учётом уже набранного заказа
  const canAddToOrder = (position: MenuPosition) =>
    hasEnoughStock([...orderIngredients, ...position.ingredients]);

  const completeOrder = async (route: "kitchen" | "self") => {
    if (orderLines.length === 0 || !canCompleteOrder()) return;

    // Состав/списание остатков теперь считает и делает сервер атомарно —
    // клиент только присылает menu_position_id/количество, ingredients и
    // сам номер заказа (identity-колонка в БД) больше не нужны на клиенте.
    const items: OrderLinePayload[] = orderLines.map((line) => ({
      menu_position_id: line.position.id,
      name: line.position.name,
      price: parseNumber(line.position.price),
      quantity: line.quantity,
      comment: line.position.comment || undefined,
    }));

    const { data, error } = await apiCreateOrder({
      route,
      guest_id: orderGuest?.id ?? undefined,
      guest_name: orderGuest?.name ?? undefined,
      items,
    });
    if (error || !data) {
      window.alert(error ?? "Не удалось оформить заказ");
      return;
    }

    const order = mapApiOrder(data);
    setOrders((prev) => [order, ...prev]);
    loadProducts(); // сервер списал остатки — подтягиваем актуальные партии
    setLastOrderNumber(order.number);
    setOrderItems({});
    setOrderGuest(null);
    setGuestSearchQuery("");
    setIsOrderModalOpen(false);
  };

  const cancelOrder = async (order: OrderRecord) => {
    if (order.status === "cancelled") return; // уже отменён — второй раз возвращать нечего
    if (!window.confirm(`Отменить заказ №${order.number}? Списанные продукты вернутся на склад.`)) return;
    const { data, error } = await apiCancelOrder(order.id);
    if (error || !data) return;
    setOrders((prev) => prev.map((o) => (o.id === order.id ? mapApiOrder(data) : o)));
    loadProducts(); // сервер вернул остатки на склад FIFO — подтягиваем актуальные
  };

  const markOrderDone = async (order: OrderRecord) => {
    const { data, error } = await apiUpdateOrderKitchenStatus(order.id, "done");
    if (error || !data) return;
    setOrders((prev) => prev.map((o) => (o.id === order.id ? mapApiOrder(data) : o)));
  };

  const openEditOrder = (order: OrderRecord) => {
    setEditingOrderId(order.id);
    setOrderEditItems(order.items.map((item) => ({ ...item })));
  };

  const updateOrderEditQuantity = (index: number, quantity: number) => {
    setOrderEditItems((items) =>
      items.map((item, i) => (i === index ? { ...item, quantity: Math.max(0, quantity) } : item)).filter((item) => item.quantity > 0),
    );
  };

  const saveOrderEdit = async () => {
    if (!editingOrderId) return;
    if (orderEditItems.length === 0) {
      window.alert("В заказе не осталось ни одной позиции — отмените заказ целиком вместо обнуления состава");
      return;
    }
    const items: OrderLinePayload[] = orderEditItems.map((item) => ({
      menu_position_id: item.menuPositionId ?? undefined,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      comment: item.comment,
    }));
    const { data, error } = await apiEditOrder(editingOrderId, items);
    if (error || !data) {
      window.alert(error ?? "Не удалось сохранить изменения заказа");
      return;
    }
    const updated = mapApiOrder(data);
    setOrders((prev) => prev.map((o) => (o.id === editingOrderId ? updated : o)));
    setEditingOrderId(null);
    setOrderEditItems([]);
  };

  // Журнал действий: серверные log_event (гости/столы/мероприятия/аккаунты/
  // вход, БД hitry_lis_crm) + серверный журнал склада/меню/заказов
  // (apiWarehouseActivity(), отдельная БД hitry_lis_warehouse) — общий вид:
  // [время] кто · что. Раньше последнее было чисто клиентским clientLog.
  const AUDIT_ACTION_LABELS: Record<string, string> = {
    "auth.login": "вход в систему",
    "guest.create": "создал гостя",
    "guest.update": "изменил гостя",
    "guest.delete": "удалил гостя",
    "floor_map.create": "создал карту зала",
    "floor_map.update_layout": "изменил карту зала",
    "floor_map.delete": "удалил карту зала",
    "table_booking.create": "создал бронь стола",
    "table_booking.update": "изменил бронь стола",
    "table_booking.delete": "удалил бронь стола",
    "event.create": "создал мероприятие",
    "event.delete": "удалил мероприятие",
    "user.create": "создал аккаунт",
    "user.update": "изменил аккаунт",
    "sessions.revoke": "отозвал сессии",
    "product_type.create": "создал тип товара",
    "product.add_batch": "добавил партию товара",
    "product.update": "изменил товар",
    "product.update_batch": "изменил партию товара",
    "purchase.create": "оформил закупку",
    "write_off.create": "списал товар",
    "menu_category.create": "создал раздел меню",
    "menu_category.update": "переименовал раздел меню",
    "menu_category.delete": "удалил раздел меню",
    "menu_position.create": "создал позицию меню",
    "menu_position.update": "изменил позицию меню",
    "menu_position.delete": "удалил позицию меню",
    "order.create": "создал заказ",
    "order.kitchen_status": "изменил статус заказа",
    "order.cancel": "отменил заказ",
    "order.edit": "изменил заказ",
  };

  type ActivityEntry = { id: string; at: string; text: string };
  const activityFeed: ActivityEntry[] = [
    ...auditEvents.map((e): ActivityEntry => ({
      id: e.id,
      at: e.created_at,
      text: `${e.actor_name ?? "—"} · ${AUDIT_ACTION_LABELS[e.action] ?? e.action}${
        e.entity_id ? ` #${shortId(e.entity_id)}` : ""
      }`,
    })),
    ...warehouseActivity.map((e): ActivityEntry => ({
      id: e.id,
      at: e.created_at,
      text: `${e.actor_name ?? "—"} · ${AUDIT_ACTION_LABELS[e.action] ?? e.action}${
        e.entity_id ? ` #${shortId(e.entity_id)}` : ""
      }`,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const activityByDay = new Map<string, ActivityEntry[]>();
  for (const entry of activityFeed) {
    const day = entry.at.slice(0, 10);
    const list = activityByDay.get(day) ?? [];
    list.push(entry);
    activityByDay.set(day, list);
  }

  if (authState === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#111214] text-zinc-500">
        Загрузка…
      </main>
    );
  }

  if (authState === "guest" || (apiUser && !STAFF_ROLES.includes(apiUser.role))) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#111214] p-4 text-zinc-100">
        <div className="max-w-md text-center">
          <h1 className="text-3xl font-semibold">Служебный раздел</h1>
          <p className="mt-3 text-zinc-400">
            {authState === "guest"
              ? "Нужно войти под учётной записью персонала."
              : "Доступно только персоналу бара: бармену, менеджеру и администратору."}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-xl border border-white/8 bg-[#1b1c20] px-4 py-2 text-sm text-zinc-300 transition hover:text-zinc-100"
            >
              К расписанию игр
            </Link>
            {authState === "guest" && (
              <a
                href="/login"
                className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2 text-sm font-medium text-zinc-950 transition hover:bg-amber-300"
              >
                <LogIn className="h-4 w-4" />
                Войти
              </a>
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="h-screen overflow-hidden bg-[#111214] text-zinc-100">
      <div className="flex h-full">
        <aside className="hidden w-72 shrink-0 flex-col border-r border-white/8 bg-[#17181b] lg:flex">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
            <div className="mb-8 flex items-center gap-2 px-2">
              <Image src="/logo.png" alt="Хмельной лис" width={53} height={53} className="size-[53px] shrink-0 rounded-xl object-cover" />
              <span className="tavern-font truncate text-xl font-bold text-amber-200">Хмельной лис</span>
            </div>

            <nav className="space-y-1">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  className={`flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm transition ${
                    item.id === activeSection
                      ? "bg-zinc-100 text-zinc-950"
                      : item.enabled
                        ? "text-zinc-300 hover:bg-white/6"
                        : "text-zinc-600 opacity-60"
                  }`}
                  disabled={!item.enabled}
                  type="button"
                  onClick={() => item.enabled && setActiveSection(item.id as ActiveSection)}
                  title={item.label}
                >
                  <item.icon className="size-4" />
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
          </div>

          <div className="shrink-0 border-t border-white/8 p-3">
            <div className="mb-2 flex items-center gap-2 rounded-xl border border-white/8 bg-[#1b1c20] px-3 py-2 text-xs text-zinc-300">
              <User className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
              <span className="truncate">{apiUser ? `${apiUser.name} · ${roleLabel(currentRole)}` : "…"}</span>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-white/8 text-sm text-zinc-400 transition hover:bg-[#1b1c20] hover:text-zinc-200"
            >
              <LogOut className="h-4 w-4" />
              Выйти
            </button>
          </div>
        </aside>

        {isNavOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              type="button"
              aria-label="Закрыть меню"
              onClick={() => setIsNavOpen(false)}
            />
            <nav className="absolute inset-y-0 left-0 flex w-72 flex-col border-r border-white/8 bg-[#17181b]">
              <div className="min-h-0 flex-1 overflow-y-auto p-4 pt-5">
                <div className="mb-6 flex items-center justify-between px-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <Image src="/logo.png" alt="Хмельной лис" width={53} height={53} className="size-[53px] shrink-0 rounded-xl object-cover" />
                    <span className="tavern-font truncate text-xl font-bold text-amber-200">Хмельной лис</span>
                  </div>
                  <button
                    className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/8 text-zinc-400 hover:bg-[#25272c]"
                    type="button"
                    title="Закрыть"
                    onClick={() => setIsNavOpen(false)}
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <div className="space-y-1">
                  {navItems.map((item) => (
                    <button
                      key={item.id}
                      className={`flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm transition ${
                        item.id === activeSection
                          ? "bg-zinc-100 text-zinc-950"
                          : item.enabled
                            ? "text-zinc-300 hover:bg-white/6"
                            : "text-zinc-600 opacity-60"
                      }`}
                      disabled={!item.enabled}
                      type="button"
                      onClick={() => {
                        if (!item.enabled) return;
                        setActiveSection(item.id as ActiveSection);
                        setIsNavOpen(false);
                      }}
                      title={item.label}
                    >
                      <item.icon className="size-4" />
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="shrink-0 border-t border-white/8 p-3">
                <div className="mb-2 flex items-center gap-2 rounded-xl border border-white/8 bg-[#111214] px-3 py-2 text-xs text-zinc-300">
                  <User className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                  <span className="truncate">{apiUser ? `${apiUser.name} · ${roleLabel(currentRole)}` : "…"}</span>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-white/8 text-sm text-zinc-400 transition hover:bg-[#111214] hover:text-zinc-200"
                >
                  <LogOut className="h-4 w-4" />
                  Выйти
                </button>
              </div>
            </nav>
          </div>
        )}

        <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="shrink-0 border-b border-white/8 bg-[#111214] px-4 py-3 md:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <button
                  className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/8 text-zinc-300 hover:bg-[#1b1c20] lg:hidden"
                  type="button"
                  title="Меню"
                  onClick={() => setIsNavOpen(true)}
                >
                  <Menu className="size-4" />
                </button>
                <h2 className="text-2xl font-semibold">{SECTION_TITLES[activeSection] ?? "Склад"}</h2>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-violet-500 px-3 text-sm font-semibold text-white shadow-lg shadow-violet-950/30 hover:bg-violet-400 sm:px-4"
                  type="button"
                  onClick={() => setIsOrderModalOpen(true)}
                >
                  <Plus className="size-4" />
                  <span className="hidden sm:inline">Новый заказ</span>
                </button>
              </div>
            </div>
          </header>

          <div
            className={`min-h-0 flex-1 flex-col overflow-hidden p-4 md:p-6 ${
              activeSection === "tables" ? "flex" : "hidden"
            }`}
          >
            <TablesSection guests={guests} />
          </div>

          <div
            className={`min-h-0 flex-1 flex-col overflow-hidden p-4 md:p-6 ${
              activeSection === "events" ? "flex" : "hidden"
            }`}
          >
            <EventsSection />
          </div>

          <div
            className={`flex-1 space-y-4 overflow-y-auto p-4 md:p-6 ${
              activeSection === "tables" || activeSection === "events" ? "hidden" : ""
            }`}
          >
            {activeSection === "orders" && (
              <section className="rounded-xl border border-white/8 bg-[#1b1c20]">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 p-4">
                  <div className="flex rounded-full border border-white/8 bg-[#111214] p-1">
                    {(
                      [
                        ["active", "Активные"],
                        ["completed", "Выполненные"],
                        ["cancelled", "Отменённые"],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        className={`h-9 rounded-full px-4 text-sm ${
                          orderStatusTab === id ? "bg-zinc-100 text-zinc-950" : "text-zinc-400"
                        }`}
                        type="button"
                        onClick={() => setOrderStatusTab(id)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <input
                      type="date"
                      className="h-9 rounded-xl border border-white/8 bg-[#111214] px-2 text-sm text-zinc-300 outline-none focus:border-zinc-400"
                      value={orderDateFrom}
                      onChange={(event) => setOrderDateFrom(event.target.value)}
                    />
                    <span className="text-zinc-500">—</span>
                    <input
                      type="date"
                      className="h-9 rounded-xl border border-white/8 bg-[#111214] px-2 text-sm text-zinc-300 outline-none focus:border-zinc-400"
                      value={orderDateTo}
                      onChange={(event) => setOrderDateTo(event.target.value)}
                    />
                    {(orderDateFrom || orderDateTo) && (
                      <button
                        className="text-xs text-zinc-500 hover:text-zinc-300"
                        type="button"
                        onClick={() => {
                          setOrderDateFrom("");
                          setOrderDateTo("");
                        }}
                      >
                        Сбросить
                      </button>
                    )}
                  </div>
                </div>
                <div className="divide-y divide-white/8">
                  {filteredOrders.length === 0 ? (
                    <Empty icon={ClipboardList} />
                  ) : (
                    filteredOrders.map((order) => {
                      const elapsedMs =
                        (order.status === "active" ? nowTick : new Date(order.completedAt ?? order.createdAt).getTime()) -
                        new Date(order.createdAt).getTime();
                      return (
                        <div key={order.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                          {order.status === "active" && (
                            <button
                              className="grid size-8 shrink-0 place-items-center rounded-lg border border-white/8 hover:bg-[#25272c]"
                              type="button"
                              title="Заказ выполнен"
                              onClick={() => markOrderDone(order)}
                            >
                              <Check className="size-4 text-zinc-500" />
                            </button>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
                              <span>Заказ №{order.number}</span>
                              <span className="text-xs font-normal text-zinc-500">
                                {new Date(order.createdAt).toLocaleString("ru-RU")}
                              </span>
                              {order.guestName && (
                                <span className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] text-zinc-300">
                                  {order.guestName}
                                </span>
                              )}
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] ${
                                  order.route === "self"
                                    ? "bg-white/8 text-zinc-400"
                                    : "bg-amber-500/15 text-amber-300"
                                }`}
                              >
                                {order.route === "self" ? "самостоятельно" : "кухня"}
                              </span>
                            </p>
                            <p className="truncate text-xs text-zinc-500">
                              {order.items.map((line) => `${line.name} ×${line.quantity}`).join(", ")}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 text-xs ${order.status === "active" ? "text-amber-300" : "text-zinc-500"}`}
                          >
                            {formatDuration(elapsedMs)}
                          </span>
                          <span className="shrink-0 font-semibold">{formatMoney(order.total)}</span>
                          <button
                            className="grid size-8 shrink-0 place-items-center rounded-xl border border-white/8 text-zinc-400 hover:bg-[#25272c]"
                            type="button"
                            title="Редактировать"
                            onClick={() => openEditOrder(order)}
                          >
                            <Pencil className="size-4" />
                          </button>
                          {order.status !== "cancelled" && (
                            <button
                              className="grid size-8 shrink-0 place-items-center rounded-xl border border-white/8 text-zinc-400 hover:bg-[#25272c] hover:text-rose-400"
                              type="button"
                              title="Отменить заказ"
                              onClick={() => cancelOrder(order)}
                            >
                              <X className="size-4" />
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </section>
            )}

            {activeSection === "shift" && (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <button
                    className="flex h-32 flex-col items-center justify-center gap-2 rounded-2xl bg-violet-500 text-xl font-bold text-white shadow-lg shadow-violet-950/30 hover:bg-violet-400"
                    type="button"
                    onClick={() => setIsOrderModalOpen(true)}
                  >
                    <Plus className="size-8" />
                    Новый заказ
                  </button>
                  <button
                    className="flex h-32 flex-col items-center justify-center gap-2 rounded-2xl bg-zinc-100 text-xl font-bold text-zinc-950 shadow-lg shadow-black/25 hover:bg-white"
                    type="button"
                    onClick={openCreateGuest}
                  >
                    <UsersRound className="size-8" />
                    Новый клиент
                  </button>
                </div>
              <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
                <section className="rounded-xl border border-white/8 bg-[#1b1c20] p-4">
                  <h3 className="mb-3 font-semibold">Сводка на сегодня</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <Metric label="Заказов" value={todayOrders.length} />
                    <Metric label="Выручка" value={Math.round(todayRevenue)} />
                    <Metric label="Гостей всего" value={guests.length} />
                    <Metric label="Списаний" value={todayWriteOffs.length} />
                  </div>
                </section>
                <section className="flex flex-col rounded-xl border border-white/8 bg-[#1b1c20] p-4">
                  <h3 className="mb-3 font-semibold">Заметки смены</h3>
                  <textarea
                    className="min-h-40 flex-1 resize-none rounded-xl border border-white/8 bg-[#111214] p-3 text-sm outline-none focus:border-zinc-400"
                    placeholder="Что важно передать следующей смене: остатки, проблемы гостей, форс-мажоры…"
                    value={shiftNotes}
                    onChange={(event) => setShiftNotes(event.target.value)}
                  />
                </section>
              </div>
              </div>
            )}

            {activeSection === "finance" && (
              <div className="space-y-4">
                <section className="rounded-xl border border-white/8 bg-[#1b1c20] p-4">
                  <h3 className="mb-3 font-semibold">Сегодня</h3>
                  <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                    <Metric label="Выручка" value={Math.round(todayRevenue)} />
                    <Metric label="Закупки" value={Math.round(todayPurchasesCost)} />
                    <Metric label="Списано, ₽" value={Math.round(todayWriteOffLoss)} />
                    <Metric label="Маржа" value={Math.round(todayMargin)} />
                  </div>
                </section>
                <section className="rounded-xl border border-white/8 bg-[#1b1c20] p-4">
                  <h3 className="mb-3 font-semibold">За всё время</h3>
                  <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                    <Metric label="Выручка" value={Math.round(totalRevenue)} />
                    <Metric label="Закупки" value={Math.round(totalPurchasesCost)} />
                    <Metric label="Списано, ₽" value={Math.round(totalWriteOffLoss)} />
                    <Metric label="Маржа" value={Math.round(netMargin)} />
                  </div>
                  <p className="mt-3 text-xs text-zinc-500">
                    Маржа = выручка активных заказов − сумма закупок − стоимость списаний. Единый расчёт по всем
                    сущностям: заказы, склад, списания.
                  </p>
                </section>
              </div>
            )}

            {activeSection === "stats" && (
              <div className="space-y-4">
                <section className="rounded-xl border border-white/8 bg-[#1b1c20] p-4">
                  <h3 className="mb-3 font-semibold">Топ позиций по продажам</h3>
                  {topPositions.length === 0 ? (
                    <p className="text-sm text-zinc-500">Пока нет проданных заказов</p>
                  ) : (
                    <div className="space-y-2">
                      {topPositions.map(([name, stat]) => (
                        <div key={name} className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-[#111214] p-3 text-sm">
                          <span className="min-w-0 truncate">{name}</span>
                          <span className="shrink-0 text-zinc-400">
                            {stat.qty} шт · {formatMoney(stat.revenue)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
                <section className="rounded-xl border border-white/8 bg-[#1b1c20] p-4">
                  <h3 className="mb-3 font-semibold">Выручка по дням (последние 14 дней)</h3>
                  {revenueByDay.every(([, v]) => v === 0) ? (
                    <p className="text-sm text-zinc-500">Пока нет данных</p>
                  ) : (
                    <div className="flex items-end gap-1.5" style={{ height: 140 }}>
                      {revenueByDay.map(([day, value]) => {
                        const max = Math.max(...revenueByDay.map(([, v]) => v), 1);
                        return (
                          <div key={day} className="flex flex-1 flex-col items-center gap-1">
                            <div
                              className="w-full rounded-t bg-violet-500/70"
                              style={{ height: `${Math.max(2, (value / max) * 100)}px` }}
                              title={`${day}: ${formatMoney(value)}`}
                            />
                            <span className="text-[9px] text-zinc-600">{day.slice(8, 10)}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
                <section className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/8 bg-[#1b1c20] p-4">
                    <h3 className="mb-3 font-semibold">Списания по причинам</h3>
                    {writeOffsByReason.length === 0 ? (
                      <p className="text-sm text-zinc-500">Списаний не было</p>
                    ) : (
                      <div className="space-y-2">
                        {writeOffsByReason.map(([reason, value]) => (
                          <div key={reason} className="flex items-center justify-between text-sm">
                            <span className="text-zinc-400">{reason}</span>
                            <span className="text-rose-400">{formatMoney(value)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="rounded-xl border border-white/8 bg-[#1b1c20] p-4">
                    <h3 className="mb-3 font-semibold">Заказы</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <Metric label="Активных" value={orders.filter((o) => o.status === "active").length} />
                      <Metric label="Выполнено" value={orders.filter((o) => o.status === "completed").length} />
                      <Metric label="Отменено" value={orders.filter((o) => o.status === "cancelled").length} />
                      <Metric label="Средний чек" value={Math.round(totalRevenue / Math.max(1, activeOrders.length))} />
                    </div>
                  </div>
                </section>
              </div>
            )}

            {activeSection === "audit" && (
              <div className="space-y-4 font-mono">
                {activityByDay.size === 0 ? (
                  <p className="text-sm text-zinc-500">Пока нет действий</p>
                ) : (
                  [...activityByDay.entries()].map(([day, entries]) => (
                    <section key={day} className="rounded-xl border border-white/8 bg-[#1b1c20]">
                      <div className="border-b border-white/8 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        {new Date(`${day}T12:00:00`).toLocaleDateString("ru-RU", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          weekday: "short",
                        })}
                      </div>
                      <div className="divide-y divide-white/5">
                        {entries.map((entry) => (
                          <div key={entry.id} className="flex gap-3 px-4 py-1.5 text-xs">
                            <span className="shrink-0 text-zinc-600">
                              {new Date(entry.at).toLocaleTimeString("ru-RU", {
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                              })}
                            </span>
                            <span className="text-zinc-300">{entry.text}</span>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))
                )}
              </div>
            )}

            {activeSection !== "tables" && activeSection !== "orders" && activeSection !== "shift" && activeSection !== "finance" && activeSection !== "events" && activeSection !== "stats" && activeSection !== "audit" && (
            <>
            <section className="flex flex-wrap items-center justify-between gap-3">
              {activeSection === "warehouse" ? (
                <div className="flex rounded-full border border-white/8 bg-[#1b1c20] p-1">
                  {[
                    ["purchases", "Закупки"],
                    ["products", "Товары"],
                    ["ingredients", "Ингредиенты"],
                    ["write-offs", "Списания"],
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      className={`h-9 rounded-full px-4 text-sm ${
                        activeTab === id ? "bg-zinc-100 text-zinc-950" : "text-zinc-400"
                      }`}
                      type="button"
                      onClick={() => setActiveTab(id as WarehouseTab)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : activeSection === "positions" ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    className={`h-9 rounded-full border px-4 text-sm ${
                      activeCategoryId === "all"
                        ? "border-zinc-100 bg-zinc-100 text-zinc-950"
                        : "border-white/8 text-zinc-400 hover:bg-[#1b1c20]"
                    }`}
                    type="button"
                    onClick={() => setActiveCategoryId("all")}
                  >
                    Все
                  </button>
                  {menuCategories.map((category) => (
                    <button
                      key={category.id}
                      className={`h-9 rounded-full border px-4 text-sm ${
                        activeCategoryId === category.id
                          ? "border-zinc-100 bg-zinc-100 text-zinc-950"
                          : "border-white/8 text-zinc-400 hover:bg-[#1b1c20]"
                      }`}
                      type="button"
                      onClick={() => setActiveCategoryId(category.id)}
                    >
                      {category.name}
                    </button>
                  ))}
                  <button
                    className={`h-9 rounded-full border px-4 text-sm ${
                      activeCategoryId === uncategorizedCategoryId
                        ? "border-zinc-100 bg-zinc-100 text-zinc-950"
                        : "border-white/8 text-zinc-400 hover:bg-[#1b1c20]"
                    }`}
                    type="button"
                    onClick={() => setActiveCategoryId(uncategorizedCategoryId)}
                  >
                    Без раздела
                  </button>
                  <button
                    className="h-9 rounded-full border border-dashed border-white/15 px-4 text-sm text-zinc-500 hover:bg-[#1b1c20]"
                    type="button"
                    onClick={() => {
                      setCategoryFormError(null);
                      setIsCategoryModalOpen(true);
                    }}
                  >
                    Разделы…
                  </button>
                </div>
              ) : (
                <div />
              )}

              <div className="flex flex-wrap gap-2">
                {activeSection === "positions" ? (
                  <>
                    <button
                      className="inline-flex h-10 items-center gap-2 rounded-xl bg-zinc-100 px-4 text-sm font-medium text-zinc-950 shadow-md shadow-black/25 hover:bg-white"
                      type="button"
                      onClick={() => {
                        setEditingPositionId(null);
                        setDraftPosition(createBlankPosition());
                        setPositionFormError(null);
                        setIsPositionModalOpen(true);
                      }}
                    >
                      <Plus className="size-4" />
                      <span>Добавить позицию</span>
                    </button>
                    <button
                      className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/8 px-4 text-sm text-zinc-300 hover:bg-[#25272c]"
                      type="button"
                      onClick={exportPositionsJson}
                    >
                      <span>Экспорт JSON</span>
                    </button>
                    <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-white/8 px-4 text-sm text-zinc-300 hover:bg-[#25272c]">
                      <span>Импорт JSON</span>
                      <input
                        className="hidden"
                        type="file"
                        accept=".json,application/json"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = "";
                          if (file) importPositionsFromFile(file);
                        }}
                      />
                    </label>
                  </>
                ) : activeSection === "guests" ? (
                  <button
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-zinc-100 px-4 text-sm font-medium text-zinc-950 shadow-md shadow-black/25 hover:bg-white"
                    type="button"
                    onClick={openCreateGuest}
                  >
                    <Plus className="size-4" />
                    <span>Добавить гостя</span>
                  </button>
                ) : activeTab === "ingredients" ? (
                  <>
                    <button
                      className="inline-flex h-10 items-center gap-2 rounded-xl bg-zinc-100 px-4 text-sm font-medium text-zinc-950 shadow-md shadow-black/25 hover:bg-white"
                      type="button"
                      onClick={() => {
                        setNewTypeName("");
                        setNewTypeId("");
                        setNewTypeIdTouched(false);
                        setNewTypeUnit("шт");
                        setNewTypeError(null);
                        setIsTypeModalOpen(true);
                      }}
                    >
                      <Plus className="size-4" />
                      <span>Создать ингредиент</span>
                    </button>
                    <button
                      className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/8 px-4 text-sm text-zinc-300 hover:bg-[#25272c]"
                      type="button"
                      onClick={exportIngredientTypesJson}
                      title={
                        selectedTypeIds.size > 0
                          ? `Выгрузить выбранные (${selectedTypeIds.size})`
                          : "Выгрузить все ингредиенты (ничего не выбрано)"
                      }
                    >
                      <span>Экспорт JSON{selectedTypeIds.size > 0 ? ` (${selectedTypeIds.size})` : ""}</span>
                    </button>
                    <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-white/8 px-4 text-sm text-zinc-300 hover:bg-[#25272c]">
                      <span>Импорт JSON</span>
                      <input
                        className="hidden"
                        type="file"
                        accept=".json,application/json"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = "";
                          if (file) importIngredientTypesFromFile(file);
                        }}
                      />
                    </label>
                  </>
                ) : (
                  <>
                    <button
                      className="inline-flex h-10 items-center gap-2 rounded-xl bg-zinc-100 px-4 text-sm font-medium text-zinc-950 shadow-md shadow-black/25 hover:bg-white"
                      type="button"
                      onClick={() => {
                        setPurchaseFormError(null);
                        setIsPurchaseModalOpen(true);
                      }}
                    >
                      <Plus className="size-4" />
                      <span>Добавить закупку</span>
                    </button>
                    <button
                      className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/8 px-4 text-sm text-zinc-300 hover:bg-[#25272c]"
                      type="button"
                      onClick={() => {
                        setNewProductError(null);
                        setIsProductModalOpen(true);
                      }}
                    >
                      <Plus className="size-4" />
                      <span>Добавить товар</span>
                    </button>
                    <button
                      className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/8 px-4 text-sm text-zinc-300 hover:bg-[#25272c]"
                      type="button"
                      onClick={exportProductsJson}
                    >
                      <span>Экспорт JSON</span>
                    </button>
                    <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-white/8 px-4 text-sm text-zinc-300 hover:bg-[#25272c]">
                      <span>Импорт JSON</span>
                      <input
                        className="hidden"
                        type="file"
                        accept=".json,application/json"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = "";
                          if (file) importProductsFromFile(file);
                        }}
                      />
                    </label>
                  </>
                )}
              </div>
            </section>

            {activeSection === "guests" && (
              <section className="grid grid-cols-2 gap-3 xl:grid-cols-3">
                <Metric label="Гостей" value={guests.length} />
                <Metric label="С телефоном" value={guests.filter((g) => !!g.phone).length} />
                <Metric label="С телеграмом" value={guests.filter((g) => !!g.telegram).length} />
              </section>
            )}

            {activeSection === "warehouse" && (
              <section className="grid grid-cols-2 gap-3 xl:grid-cols-5">
                <Metric label="Позиции" value={menuPositions.length} />
                <Metric label="Товары" value={products.length} />
                <Metric label="Остаток" value={Math.round(totalUnits * 100) / 100} />
                <Metric label="Истекают" value={expiringCount} />
                <Metric label="Просрочено" value={expiredCount} />
              </section>
            )}

            <ListSearch
              placeholder={
                activeSection === "positions"
                  ? "Поиск по позициям и ингредиентам"
                  : activeSection === "guests"
                    ? "Имя, телефон, телеграм"
                    : activeTab === "purchases"
                      ? "Поиск по закупкам: дата или товар"
                      : activeTab === "write-offs"
                        ? "Поиск по списаниям: товар или причина"
                        : "Поиск по товарам и типам"
              }
              value={listQuery}
              onChange={setListQuery}
            />
            </>
            )}

            {activeSection === "positions" && (
              <section className="rounded-xl border border-white/8 bg-[#1b1c20]">
                <div className="border-b border-white/8 p-4">
                  <h3 className="font-semibold">Позиции</h3>
                </div>
                <div className="divide-y divide-white/8">
                  {sortedListMenuPositions.length === 0 ? (
                    <Empty icon={Utensils} />
                  ) : (
                    sortedListMenuPositions.map((position) => {
                      const available = canSellMenuPosition(position);
                      return (
                        <div
                          key={position.id}
                          className={`flex items-center gap-3 px-4 py-2 ${available ? "" : "opacity-55"}`}
                        >
                          <PositionThumb src={position.imageUrl} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{position.name}</p>
                            <p className="text-xs text-zinc-500">
                              {formatOrderQuantity(position, 1)}
                              {available ? "" : " · нет ингредиента"}
                            </p>
                          </div>
                          <span className="shrink-0 text-sm font-semibold">
                            {formatMoney(parseNumber(position.price))}
                          </span>
                          <button
                            className="grid size-8 shrink-0 place-items-center rounded-xl border border-white/8 text-zinc-400 hover:bg-[#25272c]"
                            type="button"
                            title="Состав"
                            onClick={() => setInfoPositionId(position.id)}
                          >
                            <Info className="size-4" />
                          </button>
                          <button
                            className="grid size-8 shrink-0 place-items-center rounded-xl border border-white/8 text-zinc-400 hover:bg-[#25272c]"
                            type="button"
                            title="Редактировать"
                            onClick={() => openEditPosition(position)}
                          >
                            <Pencil className="size-4" />
                          </button>
                          <button
                            className="grid size-8 shrink-0 place-items-center rounded-xl border border-white/8 text-zinc-400 hover:bg-[#25272c] hover:text-rose-400"
                            type="button"
                            title="Удалить"
                            onClick={() => deletePosition(position)}
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </section>
            )}

            {activeSection === "warehouse" && activeTab === "purchases" && (
              <section className="rounded-xl border border-white/8 bg-[#1b1c20]">
                <div className="border-b border-white/8 p-4">
                  <h3 className="font-semibold">Закупки</h3>
                </div>
                <div className="divide-y divide-white/8">
                  {listPurchases.length === 0 && <Empty icon={ClipboardList} />}
                  {listPurchases.map((purchase) => {
                    const purchaseBatches = getPurchaseBatches(purchase);
                    return (
                      <div key={purchase.id}>
                        <button
                          className="grid w-full items-center gap-3 p-4 text-left md:grid-cols-[140px_1fr_140px_40px]"
                          type="button"
                          onClick={() =>
                            setExpandedPurchaseId(expandedPurchaseId === purchase.id ? null : purchase.id)
                          }
                        >
                          <span className="font-medium">
                            {purchase.receivedAt}
                            <span className="block text-[10px] font-normal uppercase tracking-wide text-zinc-500">
                              #{shortId(purchase.id)}
                            </span>
                          </span>
                          <span className="text-sm text-zinc-500">{purchase.itemCount} позиций</span>
                          <span className="font-semibold">{formatMoney(purchase.total)}</span>
                          <ChevronDown
                            className={`size-4 text-zinc-500 transition ${
                              expandedPurchaseId === purchase.id ? "rotate-180" : ""
                            }`}
                          />
                        </button>

                        {expandedPurchaseId === purchase.id && (
                          <div className="border-t border-white/8 bg-[#17181b] p-4">
                            <div className="mb-2 hidden grid-cols-[minmax(0,1fr)_130px_120px_130px_140px] gap-3 px-3 text-xs uppercase text-zinc-500 md:grid">
                              <span>Товар</span>
                              <span>Тип</span>
                              <span>Партия</span>
                              <span>Цена</span>
                              <span>Срок</span>
                            </div>
                            <div className="space-y-2">
                              {purchaseBatches.map(({ product, batch }) => {
                                const type = getProductType(product.typeId);
                                const unitPrice = getBatchUnitPrice(product, batch);
                                return (
                                  <div
                                    key={batch.id}
                                    className="grid gap-2 rounded-xl border border-white/8 bg-[#111214] p-3 text-sm md:grid-cols-[minmax(0,1fr)_130px_120px_130px_140px]"
                                  >
                                    <span className="min-w-0 truncate font-medium">{product.name}</span>
                                    <span className="text-zinc-400">{type?.name ?? "Тип"}</span>
                                    <span className="text-zinc-400">
                                      {formatAmount(batch.packs)} уп. / {formatAmount(getBatchAmount(product, batch))}{" "}
                                      {product.stockUnit}
                                    </span>
                                    <span className="text-zinc-400">
                                      {unitPrice === null ? "без цены" : `${formatMoney(unitPrice)} / ${product.stockUnit}`}
                                    </span>
                                    <span className="text-zinc-400">{batch.shelfLifeDays} дн. до {batch.expiresAt}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {activeSection === "warehouse" && activeTab === "products" && (
              <section className="rounded-xl border border-white/8 bg-[#1b1c20]">
                <div className="border-b border-white/8 p-4">
                  <h3 className="font-semibold">Товары</h3>
                </div>
                <div className="divide-y divide-white/8">
                  <div className="hidden grid-cols-[minmax(0,1fr)_130px_150px_130px_40px] gap-3 px-4 py-3 text-xs uppercase text-zinc-500 lg:grid">
                    <span>Товар / тип</span>
                    <span>Остаток</span>
                    <span>Фасовка</span>
                    <span>Цена</span>
                    <span />
                  </div>
                  {listProducts.length === 0 && <Empty icon={PackageCheck} />}
                  {listProducts.map((product) => renderProductRow(product))}
                </div>
              </section>
            )}

            {activeSection === "warehouse" && activeTab === "ingredients" && (
              <section className="rounded-xl border border-white/8 bg-[#1b1c20]">
                <div className="border-b border-white/8 p-4">
                  <h3 className="font-semibold">Ингредиенты</h3>
                  <p className="mt-1 text-xs text-zinc-500">
                    Ингредиент — это тип (папка), внутри которого может лежать несколько разных товаров (разные
                    поставщики, фасовки). Рецепты позиций ссылаются на тип, а не на конкретный товар — списание при
                    заказе само выбирает нужную партию по сроку годности среди всех товаров этого типа.
                  </p>
                </div>
                <div className="divide-y divide-white/8">
                  <div className="hidden grid-cols-[24px_minmax(0,1fr)_130px_130px_40px] items-center gap-3 px-4 py-3 text-xs uppercase text-zinc-500 lg:grid">
                    <input
                      type="checkbox"
                      className="size-4 accent-zinc-100"
                      checked={selectedTypeIds.size > 0 && selectedTypeIds.size === listIngredientGroups.length}
                      onChange={(event) =>
                        setSelectedTypeIds(
                          event.target.checked ? new Set(listIngredientGroups.map((g) => g.type.id)) : new Set(),
                        )
                      }
                      title="Выбрать все"
                    />
                    <span>Ингредиент</span>
                    <span>Остаток</span>
                    <span>Товаров</span>
                    <span />
                  </div>
                  {listIngredientGroups.length === 0 && <Empty icon={PackageCheck} />}
                  {listIngredientGroups.map(({ type, products: typeProducts }) => {
                    const totalAmount = typeProducts.reduce((sum, product) => sum + getProductAvailableAmount(product), 0);
                    const isExpanded = expandedTypeId === type.id;
                    const isSelected = selectedTypeIds.has(type.id);
                    return (
                      <div key={type.id}>
                        <div
                          role="button"
                          tabIndex={0}
                          className="grid w-full cursor-pointer gap-3 p-4 text-left lg:grid-cols-[24px_minmax(0,1fr)_130px_130px_40px]"
                          onClick={() => setExpandedTypeId(isExpanded ? null : type.id)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") setExpandedTypeId(isExpanded ? null : type.id);
                          }}
                        >
                          <input
                            type="checkbox"
                            className="size-4 accent-zinc-100"
                            checked={isSelected}
                            onClick={(event) => event.stopPropagation()}
                            onChange={() =>
                              setSelectedTypeIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(type.id)) next.delete(type.id);
                                else next.add(type.id);
                                return next;
                              })
                            }
                          />
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{type.name}</span>
                            <span className="mt-1 block truncate text-xs text-zinc-500">{type.id}</span>
                          </span>
                          <span className="text-sm text-zinc-400">
                            {formatAmount(totalAmount)} {type.unit}
                          </span>
                          <span className="text-sm text-zinc-400">{typeProducts.length}</span>
                          <ChevronDown className={`size-4 text-zinc-500 transition ${isExpanded ? "rotate-180" : ""}`} />
                        </div>

                        {isExpanded && (
                          <div className="divide-y divide-white/8 border-t border-white/8 bg-[#141517]">
                            {typeProducts.length === 0 ? (
                              <div className="grid min-h-20 place-items-center">
                                <p className="text-xs text-zinc-500">
                                  Нет товаров этого типа — добавьте через «Добавить закупку» или «Добавить товар» на
                                  вкладке «Товары».
                                </p>
                              </div>
                            ) : (
                              typeProducts.map((product) => renderProductRow(product))
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {activeSection === "warehouse" && activeTab === "write-offs" && (
              <section className="rounded-xl border border-white/8 bg-[#1b1c20]">
                <div className="border-b border-white/8 p-4">
                  <h3 className="font-semibold">Архив списаний</h3>
                </div>
                <div className="divide-y divide-white/8">
                  {listWriteOffs.length === 0 ? (
                    <Empty icon={Trash2} />
                  ) : (
                    listWriteOffs.map((entry) => (
                      <div key={entry.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{entry.productName}</p>
                          <p className="truncate text-xs text-zinc-500">
                            {new Date(entry.createdAt).toLocaleString("ru-RU")} · {entry.reason}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-zinc-400">
                            −{formatAmount(entry.amount)} {entry.unit}
                          </p>
                          {entry.value > 0 && <p className="text-xs text-rose-400">−{formatMoney(entry.value)}</p>}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            )}

            {activeSection === "guests" && (
              <section className="rounded-xl border border-white/8 bg-[#1b1c20]">
                <div className="border-b border-white/8 p-4">
                  <h3 className="font-semibold">Гости</h3>
                </div>
                <div className="divide-y divide-white/8">
                  {guestsError ? (
                    <div className="grid min-h-44 place-items-center p-6 text-sm text-rose-400">{guestsError}</div>
                  ) : filteredGuests.length === 0 ? (
                    <Empty icon={UsersRound} />
                  ) : (
                    filteredGuests.map((guest) => (
                      <div key={guest.id} className="flex items-center gap-3 px-4 py-2">
                        <div className="grid size-9 shrink-0 place-items-center rounded-full bg-white/8 text-sm font-medium">
                          {guest.name.slice(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{guest.name}</p>
                          <p className="truncate text-xs text-zinc-500">
                            {[guest.phone, guest.telegram ? `@${guest.telegram}` : null]
                              .filter(Boolean)
                              .join(" · ") || "нет контактов"}
                          </p>
                          {guest.comment && <p className="truncate text-xs text-amber-300/80">{guest.comment}</p>}
                        </div>
                        <span className="shrink-0 text-xs text-zinc-500">{guest.xp} XP</span>
                        <button
                          className="grid size-8 shrink-0 place-items-center rounded-xl border border-white/8 text-zinc-400 hover:bg-[#25272c]"
                          type="button"
                          title="Редактировать"
                          onClick={() => openEditGuest(guest)}
                        >
                          <Pencil className="size-4" />
                        </button>
                        <button
                          className="grid size-8 shrink-0 place-items-center rounded-xl border border-white/8 text-zinc-400 hover:bg-[#25272c] hover:text-rose-400"
                          type="button"
                          title="Удалить"
                          onClick={() => deleteGuest(guest)}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </section>
            )}
          </div>
        </section>
      </div>

      {infoPosition && (
        <Modal title={infoPosition.name} onClose={() => setInfoPositionId(null)}>
          <div className="mx-auto grid max-w-3xl gap-4">
            <div className="flex items-center gap-4">
              <PositionThumb src={infoPosition.imageUrl} size="size-20" />
              <div>
                <p className="text-lg font-semibold">{infoPosition.name}</p>
                <p className="text-sm text-zinc-500">
                  {formatMoney(parseNumber(infoPosition.price))} · порция {formatOrderQuantity(infoPosition, 1)}
                </p>
              </div>
            </div>
            <div className="rounded-xl border border-white/8 bg-[#17181b]">
              <div className="border-b border-white/8 px-4 py-3 text-sm font-semibold">Состав</div>
              <div className="divide-y divide-white/8">
                {infoPosition.ingredients.map((ingredient) => {
                  const type = getProductType(ingredient.typeId);
                  const available = getTypeAvailableAmount(ingredient.typeId);
                  const enough = available >= parseNumber(ingredient.amount);
                  return (
                    <div key={ingredient.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                      <span>{type?.name ?? "Тип"}</span>
                      <span className="text-zinc-400">
                        расход {ingredient.amount} {type?.unit ?? ""}
                      </span>
                      <span className={enough ? "text-emerald-400" : "text-rose-400"}>
                        остаток {Math.round(available * 100) / 100} {type?.unit ?? ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {isOrderModalOpen && (
        <Modal
          title="Новый заказ"
          onClose={() => {
            setIsOrderModalOpen(false);
            setSearchQuery("");
          }}
        >
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="flex min-h-0 flex-col rounded-xl border border-white/8 bg-[#17181b]">
              <label className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b border-white/8 bg-[#17181b] px-4">
                <Search className="size-4 text-zinc-500" />
                <input
                  autoFocus
                  className="w-full bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
                  placeholder="Поиск позиции"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </label>
              <div>
                {groupedOrderPositions.length === 0 ? (
                  <Empty icon={Utensils} />
                ) : (
                  groupedOrderPositions.map((group) => (
                    <div key={group.id}>
                      <div className="sticky top-12 z-10 bg-[#17181b] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        {group.label}
                      </div>
                      <div className="divide-y divide-white/8">
                        {group.positions.map((position) => {
                          const quantity = orderItems[position.id] ?? 0;
                          const available = canSellMenuPosition(position);
                          const canAddMore = canAddToOrder(position);
                          return (
                            <div
                              key={position.id}
                              className={`flex items-center gap-3 px-4 py-2 ${available ? "" : "opacity-55"}`}
                            >
                              <PositionThumb src={position.imageUrl} />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">{position.name}</p>
                                <p className="text-xs text-zinc-500">
                                  {formatMoney(parseNumber(position.price))} · {formatOrderQuantity(position, 1)}
                                </p>
                                <p className="truncate text-[11px] text-zinc-600">{describeComposition(position)}</p>
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                <button
                                  className="grid size-8 place-items-center rounded-xl border border-white/8 text-zinc-300 hover:bg-[#25272c] disabled:opacity-30"
                                  disabled={quantity === 0}
                                  type="button"
                                  title="Убрать"
                                  onClick={() => changeOrderQuantity(position.id, -1)}
                                >
                                  <Minus className="size-4" />
                                </button>
                                <span
                                  className={`min-w-16 text-center text-sm font-semibold ${
                                    quantity > 0 ? "text-violet-300" : "text-zinc-600"
                                  }`}
                                >
                                  {quantity > 0 ? formatOrderQuantity(position, quantity) : "—"}
                                </span>
                                <button
                                  className="grid size-8 place-items-center rounded-xl bg-zinc-100 text-zinc-950 hover:bg-white disabled:cursor-not-allowed disabled:opacity-30"
                                  disabled={!canAddMore}
                                  type="button"
                                  title={canAddMore ? "Добавить" : "Не хватает остатка"}
                                  onClick={() => changeOrderQuantity(position.id, 1)}
                                >
                                  <Plus className="size-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <aside className="sticky top-0 flex max-h-[calc(100vh-8rem)] min-h-[420px] flex-col self-start overflow-hidden rounded-xl border border-white/8 bg-[#17181b]">
              <div className="flex items-center gap-2 border-b border-white/8 p-4">
                <ShoppingCart className="size-4 text-violet-300" />
                <h4 className="font-semibold">Заказ</h4>
              </div>
              <div className="min-h-0 flex-1 divide-y divide-white/8 overflow-y-auto">
                {orderLines.length === 0 ? (
                  <Empty icon={ShoppingCart} />
                ) : (
                  orderLines.map((line) => (
                    <div key={line.position.id} className="flex items-center justify-between gap-3 p-4 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium">{line.position.name}</p>
                        <p className="text-zinc-500">{formatOrderQuantity(line.position, line.quantity)}</p>
                        <p className="truncate text-[11px] text-zinc-600">{describeComposition(line.position)}</p>
                      </div>
                      <p className="shrink-0 font-semibold">{formatMoney(parseNumber(line.position.price) * line.quantity)}</p>
                    </div>
                  ))
                )}
              </div>
              <div className="space-y-3 border-t border-white/8 p-4">
                <div className="relative">
                  {orderGuest ? (
                    <div className="flex items-center justify-between rounded-xl border border-white/8 bg-[#111214] px-3 py-2 text-sm">
                      <span className="truncate">{orderGuest.name}</span>
                      <button
                        className="grid size-6 shrink-0 place-items-center rounded-full text-zinc-500 hover:bg-[#25272c]"
                        type="button"
                        title="Убрать гостя"
                        onClick={() => setOrderGuest(null)}
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ) : (
                    <input
                      className="h-10 w-full rounded-xl border border-white/8 bg-[#111214] px-3 text-sm outline-none focus:border-zinc-400"
                      placeholder="Гость: имя, ник или телеграм"
                      value={guestSearchQuery}
                      onChange={(event) => setGuestSearchQuery(event.target.value)}
                    />
                  )}
                  {!orderGuest && guestSearchResults.length > 0 && (
                    <div className="absolute bottom-11 left-0 right-0 z-20 max-h-48 overflow-y-auto rounded-xl border border-white/10 bg-[#111214] p-1 shadow-2xl">
                      {guestSearchResults.map((g) => (
                        <button
                          key={g.id}
                          className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-zinc-200 hover:bg-white/8"
                          type="button"
                          onClick={() => {
                            setOrderGuest(g);
                            setGuestSearchQuery("");
                          }}
                        >
                          <span className="truncate">{g.name}</span>
                          <span className="shrink-0 text-xs text-zinc-500">{g.telegram ? `@${g.telegram}` : g.phone}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-500">Итого</span>
                  <strong>{formatMoney(orderTotal)}</strong>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    className="h-11 rounded-xl bg-violet-500 px-2 text-sm font-semibold text-white hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={orderLines.length === 0 || !canCompleteOrder()}
                    type="button"
                    onClick={() => completeOrder("kitchen")}
                  >
                    Передать на кухню
                  </button>
                  <button
                    className="h-11 rounded-xl bg-zinc-100 px-2 text-sm font-semibold text-zinc-950 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={orderLines.length === 0 || !canCompleteOrder()}
                    type="button"
                    onClick={() => completeOrder("self")}
                  >
                    Самостоятельно
                  </button>
                </div>
              </div>
            </aside>
          </div>
        </Modal>
      )}

      {isPurchaseModalOpen && (
        <Modal title="Добавить закупку" onClose={() => setIsPurchaseModalOpen(false)}>
          <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
            <div className="space-y-3">
              <Field label="Дата закупки" hint="От неё считаются сроки годности всех партий этой закупки">
                <div className="flex items-center gap-2">
                  <CalendarDays className="size-4 text-zinc-500" />
                  <input
                    className="h-10 w-full rounded-xl border border-white/8 bg-[#111214] px-3 text-sm text-zinc-100 outline-none focus:border-zinc-400"
                    type="date"
                    value={receivedAt}
                    onChange={(event) => setReceivedAt(event.target.value)}
                  />
                </div>
              </Field>
              <Field label="Текст заказа" hint="Вставь список из письма или приложения поставщика">
              <textarea
                className="min-h-[calc(100vh-260px)] w-full resize-none rounded-xl border border-white/8 bg-[#111214] p-4 text-sm leading-6 text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-zinc-400"
                placeholder="Вставь текст заказа"
                value={rawText}
                onChange={(event) => {
                  setRawText(event.target.value);
                  setParsedItems(parsePurchaseText(event.target.value));
                }}
              />
              </Field>
            </div>

            <div className="rounded-xl border border-white/8 bg-[#17181b]">
              <div className="flex items-center justify-between border-b border-white/8 p-4">
                <h4 className="font-semibold">
                  Распознано
                  {parsedItems.length > 0 && (
                    <span className="ml-2 text-sm font-normal text-zinc-500">{formatMoney(purchaseTotal)}</span>
                  )}
                </h4>
                <button
                  className="h-10 rounded-xl bg-zinc-100 px-4 text-sm font-medium text-zinc-950 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={parsedItems.length === 0}
                  type="button"
                  onClick={applyPurchase}
                >
                  Применить
                </button>
              </div>
              {purchaseFormError && <p className="border-b border-white/8 px-4 py-2 text-sm text-rose-400">{purchaseFormError}</p>}
              {parsedItems.length === 0 ? (
                <Empty icon={Archive} />
              ) : (
                <div className="max-h-[calc(100vh-210px)] divide-y divide-white/8 overflow-auto">
                  {parsedItems.map((item) => (
                    <div key={item.id} className="grid gap-3 p-4">
                      <Field label="Название товара" hint="Как товар назван у поставщика">
                        <input
                          className="h-10 w-full rounded-xl border border-white/8 bg-[#111214] px-3 text-sm outline-none focus:border-zinc-400"
                          value={item.name}
                          onChange={(event) => updateParsedItem(item.id, { name: event.target.value })}
                        />
                      </Field>
                      <div className="grid gap-2 xl:grid-cols-[minmax(180px,1fr)_90px_110px_90px_110px_100px_150px_110px_44px]">
                        <Field label="Тип расхода" hint="Из этого типа блюда списывают ингредиент">
                          <DarkSelect
                            value={item.typeId}
                            options={[
                              { id: "", label: "Тип" },
                              ...productTypes.map((type) => ({ id: type.id, label: type.name })),
                            ]}
                            onChange={(value) => {
                              const selectedType = getProductType(value);
                              updateParsedItem(item.id, {
                                typeId: value,
                                stockUnit: selectedType?.unit ?? item.stockUnit,
                              });
                            }}
                          />
                        </Field>
                        <Field label="Упаковок" hint="Сколько упаковок привезли">
                          <input
                            className="h-10 w-full rounded-xl border border-white/8 bg-[#111214] px-3 text-sm outline-none focus:border-zinc-400"
                            inputMode="decimal"
                            value={item.quantity}
                            onChange={(event) => updateParsedItem(item.id, { quantity: numericInput(event.target.value) })}
                          />
                        </Field>
                        <Field label="Фасовка" hint="Сколько единиц расхода в одной упаковке">
                          <input
                            className="h-10 w-full rounded-xl border border-white/8 bg-[#111214] px-3 text-sm outline-none focus:border-zinc-400"
                            inputMode="decimal"
                            value={item.packageSize}
                            onChange={(event) =>
                              updateParsedItem(item.id, { packageSize: numericInput(event.target.value) })
                            }
                          />
                        </Field>
                        <Field label="Ед. упаковки" hint="Как считаем упаковку: уп., шт., кег">
                          <input
                            className="h-10 w-full rounded-xl border border-white/8 bg-[#111214] px-3 text-sm outline-none focus:border-zinc-400"
                            value={item.unit}
                            onChange={(event) => updateParsedItem(item.id, { unit: event.target.value })}
                          />
                        </Field>
                        <Field label="Ед. расхода" hint="В чём списываем: кг, л или шт">
                          <input
                            className="h-10 w-full rounded-xl border border-white/8 bg-[#111214] px-3 text-sm outline-none focus:border-zinc-400"
                            value={item.stockUnit}
                            onChange={(event) => updateParsedItem(item.id, { stockUnit: event.target.value })}
                          />
                        </Field>
                        <Field label="Срок, дн." hint="Сколько дней товар годен с даты закупки">
                          <input
                            className="h-10 w-full rounded-xl border border-white/8 bg-[#111214] px-3 text-sm outline-none focus:border-zinc-400"
                            inputMode="numeric"
                            value={item.shelfLifeDays}
                            onChange={(event) =>
                              updateParsedItem(item.id, { shelfLifeDays: numericInput(event.target.value) })
                            }
                          />
                        </Field>
                        <Field label="Годен до" hint="Реальная дата с упаковки: привезли свежее или уже уставшее">
                          <input
                            className="h-10 w-full rounded-xl border border-white/8 bg-[#111214] px-3 text-sm outline-none focus:border-zinc-400"
                            type="date"
                            value={addDays(receivedAt, item.shelfLifeDays)}
                            onChange={(event) =>
                              updateParsedItem(item.id, {
                                shelfLifeDays: String(Math.max(0, daysBetween(receivedAt, event.target.value))),
                              })
                            }
                          />
                        </Field>
                        <Field label="Сумма" hint="Сумма по чеку за эту строку">
                          <div className="flex h-10 items-center rounded-xl bg-[#202226] px-3 text-sm">
                            {formatMoney(item.totalPrice)}
                          </div>
                        </Field>
                        <Field label=" " hint="Убрать строку из закупки">
                          <button
                            className="grid h-10 w-full place-items-center rounded-xl border border-white/8 text-zinc-400 hover:bg-red-400/10 hover:text-red-200"
                            type="button"
                            title="Удалить"
                            onClick={() => setParsedItems((items) => items.filter((row) => row.id !== item.id))}
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </Field>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {isProductModalOpen && (
        <Modal title="Добавить товар" onClose={() => setIsProductModalOpen(false)}>
          <div className="grid gap-3 xl:grid-cols-[minmax(240px,420px)_240px_100px_120px_120px_110px_120px_150px]">
            <Field label="Название товара" hint="Как товар назван у поставщика">
              <input
                className="h-10 w-full rounded-xl border border-white/8 bg-[#111214] px-3 text-sm outline-none focus:border-zinc-400"
                placeholder="Название товара"
                value={newProduct.name}
                onChange={(event) => setNewProduct((item) => ({ ...item, name: event.target.value }))}
              />
            </Field>
            <Field label="Тип расхода" hint="Из этого типа блюда списывают ингредиент">
              <DarkSelect
                value={newProduct.typeId}
                options={[
                  { id: "", label: "Тип" },
                  ...productTypes.map((type) => ({ id: type.id, label: type.name })),
                ]}
                onChange={(value) => {
                  const selectedType = getProductType(value);
                  setNewProduct((item) => ({
                    ...item,
                    typeId: value,
                    stockUnit: selectedType?.unit ?? item.stockUnit,
                  }));
                }}
              />
            </Field>
            <Field label="Упаковок" hint="Сколько упаковок пришло (нужно хотя бы одну)">
              <input
                className="h-10 w-full rounded-xl border border-white/8 bg-[#111214] px-3 text-sm outline-none focus:border-zinc-400"
                inputMode="decimal"
                value={newProduct.quantity}
                onChange={(event) => setNewProduct((item) => ({ ...item, quantity: numericInput(event.target.value) }))}
              />
            </Field>
            <Field label="Цена, ₽" hint="Сколько заплатили за всё — необязательно, если чека нет">
              <input
                className="h-10 w-full rounded-xl border border-white/8 bg-[#111214] px-3 text-sm outline-none focus:border-zinc-400"
                placeholder="без цены"
                inputMode="decimal"
                value={newProduct.totalPrice}
                onChange={(event) =>
                  setNewProduct((item) => ({ ...item, totalPrice: numericInput(event.target.value) }))
                }
              />
            </Field>
            <Field label="Фасовка" hint="Сколько единиц расхода в одной упаковке">
              <input
                className="h-10 w-full rounded-xl border border-white/8 bg-[#111214] px-3 text-sm outline-none focus:border-zinc-400"
                inputMode="decimal"
                value={newProduct.packageSize}
                onChange={(event) =>
                  setNewProduct((item) => ({ ...item, packageSize: numericInput(event.target.value) }))
                }
              />
            </Field>
            <Field label="Ед. расхода" hint="В чём списываем: кг, л или шт">
              <input
                className="h-10 w-full rounded-xl border border-white/8 bg-[#111214] px-3 text-sm outline-none focus:border-zinc-400"
                value={newProduct.stockUnit}
                onChange={(event) => setNewProduct((item) => ({ ...item, stockUnit: event.target.value }))}
              />
            </Field>
            <Field label="Срок, дн." hint="Сколько дней товар годен с даты закупки">
              <input
                className="h-10 w-full rounded-xl border border-white/8 bg-[#111214] px-3 text-sm outline-none focus:border-zinc-400"
                inputMode="numeric"
                value={newProduct.shelfLifeDays}
                onChange={(event) =>
                  setNewProduct((item) => ({ ...item, shelfLifeDays: numericInput(event.target.value) }))
                }
              />
            </Field>
            <Field label="Годен до" hint="Реальная дата с упаковки">
              <input
                className="h-10 w-full rounded-xl border border-white/8 bg-[#111214] px-3 text-sm outline-none focus:border-zinc-400"
                type="date"
                value={addDays(receivedAt, newProduct.shelfLifeDays || "0")}
                onChange={(event) =>
                  setNewProduct((item) => ({
                    ...item,
                    shelfLifeDays: String(Math.max(0, daysBetween(receivedAt, event.target.value))),
                  }))
                }
              />
            </Field>
          </div>
          {newProductError && <p className="mt-3 text-sm text-rose-400">{newProductError}</p>}
          <div className="mt-4 flex justify-end">
            <button
              className="h-10 rounded-xl bg-zinc-100 px-4 text-sm font-medium text-zinc-950 shadow-md shadow-black/25 hover:bg-white"
              type="button"
              onClick={addManualProduct}
            >
              Сохранить
            </button>
          </div>
        </Modal>
      )}

      {writeOffTarget && (
        <Modal title={`Списать: ${writeOffTarget.product.name}`} onClose={() => setWriteOffTarget(null)}>
          <div className="mx-auto grid max-w-md gap-3">
            <Field
              label={`Количество, ${writeOffTarget.product.stockUnit}`}
              hint={`Доступно: ${formatAmount(writeOffTarget.batch.remainingAmount)} ${writeOffTarget.product.stockUnit}`}
            >
              <input
                className="h-11 w-full rounded-xl border border-white/8 bg-[#111214] px-3 text-sm outline-none focus:border-zinc-400"
                inputMode="decimal"
                value={writeOffAmount}
                onChange={(event) => setWriteOffAmount(numericInput(event.target.value))}
              />
            </Field>
            <Field label="Причина">
              <DarkSelect
                value={writeOffReason}
                options={WRITE_OFF_REASONS.map((reason) => ({ id: reason, label: reason }))}
                onChange={setWriteOffReason}
              />
            </Field>
            {writeOffReason === "Другое" && (
              <Field label="Уточните причину">
                <input
                  className="h-11 w-full rounded-xl border border-white/8 bg-[#111214] px-3 text-sm outline-none focus:border-zinc-400"
                  value={writeOffCustomReason}
                  onChange={(event) => setWriteOffCustomReason(event.target.value)}
                />
              </Field>
            )}
            {writeOffFormError && <p className="text-sm text-rose-400">{writeOffFormError}</p>}
            <button
              className="h-10 rounded-xl bg-zinc-100 px-4 text-sm font-medium text-zinc-950 shadow-md shadow-black/25 hover:bg-white"
              type="button"
              onClick={submitWriteOff}
            >
              Списать
            </button>
          </div>
        </Modal>
      )}

      {editingOrderId && (
        <Modal title="Редактировать заказ" onClose={() => setEditingOrderId(null)}>
          <div className="mx-auto grid max-w-lg gap-3">
            {orderEditItems.length === 0 ? (
              <p className="text-sm text-zinc-500">В заказе не осталось позиций</p>
            ) : (
              orderEditItems.map((item, index) => (
                <div key={index} className="flex items-center gap-3 rounded-xl border border-white/8 bg-[#111214] p-3">
                  <span className="min-w-0 flex-1 truncate text-sm">{item.name}</span>
                  <span className="shrink-0 text-xs text-zinc-500">{formatMoney(item.price)} / шт</span>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      className="grid size-7 place-items-center rounded-lg border border-white/8 text-zinc-300 hover:bg-[#25272c]"
                      type="button"
                      onClick={() => updateOrderEditQuantity(index, item.quantity - 1)}
                    >
                      <Minus className="size-3.5" />
                    </button>
                    <span className="w-6 text-center text-sm">{item.quantity}</span>
                    <button
                      className="grid size-7 place-items-center rounded-lg border border-white/8 text-zinc-300 hover:bg-[#25272c]"
                      type="button"
                      onClick={() => updateOrderEditQuantity(index, item.quantity + 1)}
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
            <div className="flex items-center justify-between border-t border-white/8 pt-3">
              <span className="text-sm text-zinc-400">Итого</span>
              <strong>
                {formatMoney(orderEditItems.reduce((sum, item) => sum + item.price * item.quantity, 0))}
              </strong>
            </div>
            <button
              className="h-10 rounded-xl bg-zinc-100 px-4 text-sm font-medium text-zinc-950 shadow-md shadow-black/25 hover:bg-white"
              type="button"
              onClick={saveOrderEdit}
            >
              Сохранить
            </button>
          </div>
        </Modal>
      )}

      {isCategoryModalOpen && (
        <Modal title="Разделы меню" onClose={() => setIsCategoryModalOpen(false)}>
          <div className="mx-auto grid max-w-md gap-3">
            {menuCategories.length === 0 ? (
              <p className="text-sm text-zinc-500">Разделов пока нет</p>
            ) : (
              menuCategories.map((category) => (
                <div key={category.id} className="flex items-center gap-2 rounded-xl border border-white/8 bg-[#111214] p-2">
                  {editingCategoryId === category.id ? (
                    <input
                      autoFocus
                      className="h-9 min-w-0 flex-1 rounded-lg border border-white/8 bg-[#1b1c20] px-3 text-sm outline-none focus:border-zinc-400"
                      value={editingCategoryName}
                      onChange={(event) => setEditingCategoryName(event.target.value)}
                      onKeyDown={(event) => event.key === "Enter" && saveRenameCategory()}
                      onBlur={saveRenameCategory}
                    />
                  ) : (
                    <span className="min-w-0 flex-1 truncate px-2 text-sm">{category.name}</span>
                  )}
                  <button
                    className="grid size-8 shrink-0 place-items-center rounded-lg text-zinc-400 hover:bg-[#25272c]"
                    type="button"
                    title="Переименовать"
                    onClick={() => startRenameCategory(category)}
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    className="grid size-8 shrink-0 place-items-center rounded-lg text-zinc-400 hover:bg-[#25272c] hover:text-rose-400"
                    type="button"
                    title="Удалить"
                    onClick={() => deleteCategory(category)}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))
            )}
            {categoryFormError && <p className="text-sm text-rose-400">{categoryFormError}</p>}
            <div className="flex gap-2 border-t border-white/8 pt-3">
              <input
                className="h-10 min-w-0 flex-1 rounded-xl border border-white/8 bg-[#111214] px-3 text-sm outline-none focus:border-zinc-400"
                placeholder="Новый раздел"
                value={newCategoryName}
                onChange={(event) => setNewCategoryName(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && createCategory()}
              />
              <button
                className="grid size-10 shrink-0 place-items-center rounded-xl bg-zinc-100 text-zinc-950 hover:bg-white"
                type="button"
                title="Добавить"
                onClick={createCategory}
              >
                <Plus className="size-4" />
              </button>
            </div>
          </div>
        </Modal>
      )}

      {isTypeModalOpen && (
        <Modal title="Новый ингредиент" onClose={() => setIsTypeModalOpen(false)}>
          <div className="mx-auto grid max-w-md gap-3">
            <p className="text-xs text-zinc-500">
              Ингредиент — общая «папка» для товаров (например, «Бекон»): рецепты позиций ссылаются на неё, а не на
              конкретный товар, поэтому под одним ингредиентом можно завести сколько угодно разных товаров.
            </p>
            <Field label="Название" hint="Как ингредиент будет называться в рецептах">
              <input
                autoFocus
                className="h-10 w-full rounded-xl border border-white/8 bg-[#111214] px-3 text-sm outline-none focus:border-zinc-400"
                placeholder="Например, Помидор"
                value={newTypeName}
                onChange={(event) => {
                  const name = event.target.value;
                  setNewTypeName(name);
                  if (!newTypeIdTouched) setNewTypeId(slugifyTypeId(name));
                }}
              />
            </Field>
            <Field label="id" hint="Латиницей, генерируется из названия — можно поправить вручную">
              <input
                className="h-10 w-full rounded-xl border border-white/8 bg-[#111214] px-3 text-sm outline-none focus:border-zinc-400"
                value={newTypeId}
                onChange={(event) => {
                  setNewTypeIdTouched(true);
                  setNewTypeId(event.target.value);
                }}
              />
            </Field>
            <Field label="Единица измерения" hint="кг, л, шт — как считать остаток">
              <input
                className="h-10 w-full rounded-xl border border-white/8 bg-[#111214] px-3 text-sm outline-none focus:border-zinc-400"
                placeholder="кг"
                value={newTypeUnit}
                onChange={(event) => setNewTypeUnit(event.target.value)}
              />
            </Field>
            {newTypeError && <p className="text-sm text-rose-400">{newTypeError}</p>}
            <button
              className="h-10 w-full rounded-xl bg-zinc-100 text-sm font-medium text-zinc-950 hover:bg-white"
              type="button"
              onClick={createProductType}
            >
              Создать
            </button>
          </div>
        </Modal>
      )}

      {isPositionModalOpen && (
        <Modal
          title={editingPositionId ? "Изменить позицию" : "Собрать позицию"}
          onClose={() => {
            setIsPositionModalOpen(false);
            setEditingPositionId(null);
          }}
        >
          <div className="grid gap-4 lg:grid-cols-[420px_minmax(0,1fr)]">
            <div className="space-y-3">
              <Field label="Название позиции" hint="Как блюдо называется в меню">
                <input
                  className="h-11 w-full rounded-xl border border-white/8 bg-[#111214] px-3 text-sm outline-none focus:border-zinc-400"
                  placeholder="Название позиции"
                  value={draftPosition.name}
                  onChange={(event) => setDraftPosition((position) => ({ ...position, name: event.target.value }))}
                />
              </Field>
              <Field label="Цена продажи, ₽" hint="Сколько гость платит за одну порцию">
                <input
                  className="h-11 w-full rounded-xl border border-white/8 bg-[#111214] px-3 text-sm outline-none focus:border-zinc-400"
                  inputMode="decimal"
                  placeholder="Цена"
                  value={draftPosition.price}
                  onChange={(event) =>
                    setDraftPosition((position) => ({ ...position, price: numericInput(event.target.value) }))
                  }
                />
              </Field>
              <Field label="Фото" hint="Загрузите файл или вставьте ссылку">
                <div className="flex items-center gap-3">
                  {draftPosition.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      className="size-11 shrink-0 rounded-xl border border-white/8 object-cover"
                      src={draftPosition.imageUrl}
                      alt=""
                    />
                  )}
                  <input
                    className="h-11 w-full min-w-0 flex-1 rounded-xl border border-white/8 bg-[#111214] px-3 text-sm outline-none focus:border-zinc-400"
                    placeholder="Фото URL"
                    value={draftPosition.imageUrl}
                    onChange={(event) => setDraftPosition((position) => ({ ...position, imageUrl: event.target.value }))}
                  />
                  <label className="flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-white/8 px-3 text-sm text-zinc-300 hover:bg-[#25272c]">
                    {isUploadingImage ? "Загрузка…" : "Загрузить"}
                    <input
                      className="hidden"
                      type="file"
                      accept="image/*"
                      disabled={isUploadingImage}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (file) uploadPositionImage(file);
                      }}
                    />
                  </label>
                </div>
                {imageUploadError && <p className="mt-1 text-xs text-rose-400">{imageUploadError}</p>}
              </Field>
              <Field label="Раздел" hint="К какому разделу меню относится позиция">
                <DarkSelect
                  value={draftPosition.categoryId ?? ""}
                  options={[
                    { id: "", label: "Без раздела" },
                    ...menuCategories.map((c) => ({ id: c.id, label: c.name })),
                  ]}
                  onChange={(value) =>
                    setDraftPosition((position) => ({ ...position, categoryId: value || null }))
                  }
                />
              </Field>
              <Field label="Комментарий повару" hint="Особые указания по приготовлению — увидит повар на кухне">
                <input
                  className="h-11 w-full rounded-xl border border-white/8 bg-[#111214] px-3 text-sm outline-none focus:border-zinc-400"
                  placeholder="Например: без сыра по запросу"
                  value={draftPosition.comment ?? ""}
                  onChange={(event) => setDraftPosition((position) => ({ ...position, comment: event.target.value }))}
                />
              </Field>
              {positionFormError && <p className="text-sm text-rose-400">{positionFormError}</p>}
              <button
                className="h-10 rounded-xl bg-zinc-100 px-4 text-sm font-medium text-zinc-950 shadow-md shadow-black/25 hover:bg-white"
                type="button"
                onClick={saveMenuPosition}
              >
                Сохранить
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-sm text-zinc-500">
                Состав: из каких складских типов и сколько списывать на одну порцию.
              </p>
              {draftPosition.ingredients.map((ingredient) => (
                <div key={ingredient.id} className="space-y-2 rounded-xl border border-white/8 p-3">
                  <div className="grid min-w-0 gap-2 md:grid-cols-[minmax(0,1fr)_140px_40px]">
                    <Field label="Тип расхода" hint="Помидоры любых поставщиков — один тип">
                    <DarkSelect
                      value={ingredient.typeId}
                      options={[
                        { id: "", label: "Тип склада" },
                        ...productTypes.map((type) => ({ id: type.id, label: type.name })),
                      ]}
                      onChange={(value) => updateIngredient(ingredient.id, { typeId: value })}
                    />
                    </Field>
                    <Field
                      label={`Расход на порцию${getProductType(ingredient.typeId)?.unit ? `, ${getProductType(ingredient.typeId)?.unit}` : ""}`}
                      hint="Сколько уходит на одну порцию"
                    >
                    <input
                      className="h-10 w-full rounded-xl border border-white/8 bg-[#111214] px-3 text-sm outline-none focus:border-zinc-400"
                      inputMode="decimal"
                      placeholder="Вес/кол-во"
                      value={ingredient.amount}
                      onChange={(event) => updateIngredient(ingredient.id, { amount: numericInput(event.target.value) })}
                    />
                    </Field>
                    <button
                      className="h-10 self-end rounded-xl border border-white/8 text-zinc-500 hover:bg-[#25272c] hover:text-rose-400"
                      type="button"
                      title="Удалить строку"
                      onClick={() => removeIngredientRow(ingredient.id)}
                    >
                      <Trash2 className="mx-auto size-4" />
                    </button>
                  </div>

                  {(ingredient.altTypeIds ?? []).map((altId, altIndex) => (
                    <div key={altIndex} className="grid min-w-0 gap-2 pl-4 md:grid-cols-[minmax(0,1fr)_40px]">
                      <DarkSelect
                        value={altId}
                        options={[
                          { id: "", label: "Альтернативный тип" },
                          ...productTypes.map((type) => ({ id: type.id, label: type.name })),
                        ]}
                        onChange={(value) => updateIngredientAlt(ingredient.id, altIndex, value)}
                      />
                      <button
                        className="h-10 rounded-xl border border-white/8 text-zinc-500 hover:bg-[#25272c] hover:text-rose-400"
                        type="button"
                        title="Убрать альтернативу"
                        onClick={() => removeIngredientAlt(ingredient.id, altIndex)}
                      >
                        <X className="mx-auto size-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    className="pl-4 text-xs text-zinc-500 hover:text-zinc-300"
                    type="button"
                    onClick={() => addIngredientAlt(ingredient.id)}
                  >
                    + альтернативный тип (если можно списывать с другого склада)
                  </button>
                </div>
              ))}
              <button
                className="h-10 rounded-xl border border-white/8 px-4 text-sm text-zinc-300 hover:bg-[#25272c]"
                type="button"
                onClick={addIngredientRow}
              >
                Добавить строку
              </button>
            </div>
          </div>
        </Modal>
      )}

      {isGuestModalOpen && (
        <Modal
          title={editingGuestId ? "Изменить гостя" : "Добавить гостя"}
          onClose={() => {
            setIsGuestModalOpen(false);
            setEditingGuestId(null);
          }}
        >
          <div className="mx-auto grid max-w-md gap-3">
            <Field label="Имя" hint="Как обращаться к гостю">
              <input
                className="h-11 w-full rounded-xl border border-white/8 bg-[#111214] px-3 text-sm outline-none focus:border-zinc-400"
                placeholder="Имя гостя"
                value={draftGuest.name}
                onChange={(event) => setDraftGuest((guest) => ({ ...guest, name: event.target.value }))}
              />
            </Field>
            <Field label="Телефон" hint="Необязательно">
              <input
                className="h-11 w-full rounded-xl border border-white/8 bg-[#111214] px-3 text-sm outline-none focus:border-zinc-400"
                placeholder="+7 900 000-00-00"
                value={draftGuest.phone}
                onChange={(event) => setDraftGuest((guest) => ({ ...guest, phone: event.target.value }))}
              />
            </Field>
            <Field label="Телеграм" hint="Необязательно, без @">
              <input
                className="h-11 w-full rounded-xl border border-white/8 bg-[#111214] px-3 text-sm outline-none focus:border-zinc-400"
                placeholder="username"
                value={draftGuest.telegram}
                onChange={(event) => setDraftGuest((guest) => ({ ...guest, telegram: event.target.value }))}
              />
            </Field>
            <Field label="Комментарий" hint="Например: любит лагер">
              <input
                className="h-11 w-full rounded-xl border border-white/8 bg-[#111214] px-3 text-sm outline-none focus:border-zinc-400"
                placeholder="Заметка о госте"
                value={draftGuest.comment}
                onChange={(event) => setDraftGuest((guest) => ({ ...guest, comment: event.target.value }))}
              />
            </Field>
            {guestFormError && <p className="text-sm text-rose-400">{guestFormError}</p>}
            <button
              className="h-10 rounded-xl bg-zinc-100 px-4 text-sm font-medium text-zinc-950 shadow-md shadow-black/25 hover:bg-white"
              type="button"
              onClick={submitGuest}
            >
              Сохранить
            </button>
          </div>
        </Modal>
      )}

      {lastOrderNumber !== null && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-3 text-sm font-medium text-emerald-300 shadow-2xl">
          Заказ №{lastOrderNumber} оформлен
        </div>
      )}
    </main>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="grid min-w-0 gap-1">
      <span className="truncate text-[11px] uppercase tracking-wide text-zinc-500" title={hint ?? label}>
        {label}
      </span>
      {children}
    </label>
  );
}

function ListSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="flex justify-center">
      <label className="flex h-11 w-full max-w-[300px] items-center gap-2 rounded-[100px] border border-white/8 bg-[#1b1c20] px-4">
        <Search className="size-4 shrink-0 text-zinc-500" />
        <input
          className="w-full bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        {value && (
          <button
            className="grid size-7 shrink-0 place-items-center rounded-full text-zinc-500 hover:bg-[#25272c] hover:text-zinc-200"
            type="button"
            title="Очистить"
            onClick={() => onChange("")}
          >
            <X className="size-4" />
          </button>
        )}
      </label>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-[#1b1c20] p-4 shadow-lg shadow-black/20">
      <p className="text-sm text-zinc-500">{label}</p>
      <strong className="mt-3 block text-2xl font-semibold">{value}</strong>
    </div>
  );
}

function PositionThumb({ src, size = "size-9" }: { src: string; size?: string }) {
  if (!src) {
    return (
      <div className={`grid ${size} shrink-0 place-items-center rounded-full bg-white/8 text-zinc-500`}>
        <Utensils className="size-4" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={`${size} shrink-0 rounded-full object-cover`} src={src} alt="" />
  );
}

function Empty({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <div className="grid min-h-44 place-items-center p-6">
      <Icon className="size-10 text-zinc-600" />
    </div>
  );
}

function DarkSelect({
  value,
  options,
  onChange,
  icon: Icon,
  pill = false,
  disabled = false,
}: {
  value: string;
  options: Array<{ id: string; label: string }>;
  onChange: (value: string) => void;
  icon?: LucideIcon;
  pill?: boolean;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selected = options.find((option) => option.id === value) ?? options[0];

  return (
    <div className="relative min-w-0">
      <button
        className={`flex h-10 w-full min-w-0 items-center justify-between gap-3 border border-white/8 bg-[#1b1c20] px-3 text-sm text-zinc-100 outline-none hover:bg-[#25272c] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-[#1b1c20] ${
          pill ? "min-w-44 rounded-full" : "rounded-xl"
        }`}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((current) => !current)}
      >
        <span className="flex min-w-0 items-center gap-2">
          {Icon && <Icon className="size-4 shrink-0 text-zinc-400" />}
          <span className="truncate">{selected?.label}</span>
        </span>
        <ChevronDown className={`size-4 shrink-0 text-zinc-400 transition ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 top-11 z-40 max-h-72 overflow-auto rounded-xl border border-white/10 bg-[#111214] p-1 shadow-2xl">
          {options.map((option) => (
            <button
              key={option.id}
              className={`flex min-h-9 w-full items-center rounded px-3 py-2 text-left text-sm ${
                option.id === value
                  ? "bg-zinc-100 text-zinc-950"
                  : "text-zinc-300 hover:bg-white/8 hover:text-zinc-100"
              }`}
              type="button"
              onClick={() => {
                onChange(option.id);
                setIsOpen(false);
              }}
            >
              <span className="break-words">{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/78 backdrop-blur-sm">
      <div className="flex h-screen w-screen flex-col border-white/8 bg-[#1b1c20] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/8 p-4">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button
            className="grid size-9 place-items-center rounded-xl border border-white/8 text-zinc-400 hover:bg-[#25272c]"
            type="button"
            title="Закрыть"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4 md:p-6">{children}</div>
      </div>
    </div>
  );
}
