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
  ShoppingCart,
  Trash2,
  User,
  UsersRound,
  Utensils,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  STAFF_ROLES,
  apiCreateGuest,
  apiDeleteGuest,
  apiGuests,
  apiUpdateGuest,
  apiLogout,
  apiMe,
  type ApiUser,
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
  | "stats";
type WarehouseTab = "purchases" | "products" | "write-offs";

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
  name: string;
  quantity: number;
  price: number;
  comment?: string;
  ingredients: { name: string; amount: string }[];
};

type OrderRecord = {
  id: string;
  number: number;
  createdAt: string;
  completedAt: string | null;
  items: OrderLineRecord[];
  total: number;
  status: "active" | "completed" | "cancelled";
  kitchenStatus: "new" | "accepted" | "done";
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

type ProductSeed = {
  id: string;
  name: string;
  typeId: string;
  packageSize: number;
  stockUnit: string;
  shelfLifeDays: string;
  batches: Array<{
    id: string;
    packs: number;
    totalPrice: number | null;
    receivedAt: string;
  }>;
};

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
};

const productTypes: ProductType[] = PRODUCT_TYPES;

const productSeeds: ProductSeed[] = [
  {
    id: "p-dried-onion",
    name: "METRO Chef Лук сушеный жареный, 600г",
    typeId: "type-dried-onion",
    packageSize: 0.6,
    stockUnit: "кг",
    shelfLifeDays: "180",
    batches: [{ id: "b-2026-08-08-dried-onion", packs: 1, totalPrice: 619, receivedAt: daysAgo(2) }],
  },
  {
    id: "p-potato-wedges",
    name: "METRO Chef Дольки картофельные со специями быстрозамороженные, 2.5кг",
    typeId: "type-potato-wedges",
    packageSize: 2.5,
    stockUnit: "кг",
    shelfLifeDays: "180",
    batches: [{ id: "b-2026-08-08-potato-wedges", packs: 1, totalPrice: 569, receivedAt: daysAgo(2) }],
  },
  {
    id: "p-bacon",
    name: "METRO Chef Бекон сырокопченый нарезка, 1кг",
    typeId: "type-bacon",
    packageSize: 1,
    stockUnit: "кг",
    shelfLifeDays: "30",
    batches: [{ id: "b-2026-08-08-bacon", packs: 1, totalPrice: 769, receivedAt: daysAgo(2) }],
  },
  {
    id: "p-fish-sticks",
    name: "METRO Chef Рыбные палочки из филе минтая в панировке замороженные, 1кг",
    typeId: "type-fish-sticks",
    packageSize: 1,
    stockUnit: "кг",
    shelfLifeDays: "180",
    batches: [
      { id: "b-2026-06-23-fish-sticks", packs: 2, totalPrice: 1438, receivedAt: daysAgo(60) },
      { id: "b-2026-08-08-fish-sticks", packs: 2, totalPrice: 1338, receivedAt: daysAgo(2) },
    ],
  },
  {
    id: "p-calamari",
    name: "METRO Chef Кольца кальмара в панировке замороженные, 1кг",
    typeId: "type-calamari",
    packageSize: 1,
    stockUnit: "кг",
    shelfLifeDays: "180",
    batches: [
      { id: "b-2026-06-23-calamari", packs: 1, totalPrice: 1249, receivedAt: daysAgo(60) },
      { id: "b-2026-08-08-calamari", packs: 1, totalPrice: 1249, receivedAt: daysAgo(2) },
    ],
  },
  {
    id: "p-fries-metro",
    name: "METRO Chef Картофель фри 9x9мм замороженный, 2.5кг",
    typeId: "type-fries",
    packageSize: 2.5,
    stockUnit: "кг",
    shelfLifeDays: "180",
    batches: [{ id: "b-2026-06-23-fries-metro", packs: 3, totalPrice: 1797, receivedAt: daysAgo(60) }],
  },
  {
    id: "p-caesar-sauce",
    name: "Соус Efko Food Professional цезарь 50.5%, 1кг",
    typeId: "type-caesar-sauce",
    packageSize: 1,
    stockUnit: "кг",
    shelfLifeDays: "60",
    batches: [{ id: "b-2026-06-23-caesar-sauce", packs: 1, totalPrice: 329, receivedAt: daysAgo(60) }],
  },
  {
    id: "p-bbq-sauce",
    name: "Соус Efko Food Special барбекю ГОСТ, 1кг",
    typeId: "type-bbq-sauce",
    packageSize: 1,
    stockUnit: "кг",
    shelfLifeDays: "60",
    batches: [{ id: "b-2026-06-23-bbq-sauce", packs: 2, totalPrice: 698, receivedAt: daysAgo(60) }],
  },
  {
    id: "p-cheese-sauce",
    name: "Соус Efko Food Professional сырный 35%, 1кг",
    typeId: "type-cheese-sauce",
    packageSize: 1,
    stockUnit: "кг",
    shelfLifeDays: "60",
    batches: [
      { id: "b-2026-06-23-cheese-sauce", packs: 1, totalPrice: 329, receivedAt: daysAgo(60) },
      { id: "b-2026-07-09-cheese-sauce", packs: 2, totalPrice: 576.4, receivedAt: daysAgo(20) },
    ],
  },
  {
    id: "p-onion-rings",
    name: "METRO Chef Луковые кольца в панировке замороженные, 1кг",
    typeId: "type-onion-rings",
    packageSize: 1,
    stockUnit: "кг",
    shelfLifeDays: "180",
    batches: [{ id: "b-2026-07-09-onion-rings", packs: 2, totalPrice: 918, receivedAt: daysAgo(20) }],
  },
  {
    id: "p-burger-bun",
    name: "METRO Chef Булочка для гамбургера с кунжутом замороженная 125мм (89г x 12шт), 1.068кг",
    typeId: "type-burger-bun",
    packageSize: 12,
    stockUnit: "шт",
    shelfLifeDays: "90",
    batches: [{ id: "b-2026-07-09-burger-bun", packs: 3, totalPrice: 1119.51, receivedAt: daysAgo(20) }],
  },
  {
    id: "p-fries-triumph",
    name: "Картофель фри Triumph без панировки быстрозамороженный 9 x 9мм, 2.5кг",
    typeId: "type-fries",
    packageSize: 2.5,
    stockUnit: "кг",
    shelfLifeDays: "180",
    batches: [{ id: "b-2026-07-09-fries-triumph", packs: 3, totalPrice: 1578.33, receivedAt: daysAgo(20) }],
  },
  {
    id: "p-garlic-sauce",
    name: "Соус Efko Food Professional чесночный ГОСТ 35%, 1кг",
    typeId: "type-garlic-sauce",
    packageSize: 1,
    stockUnit: "кг",
    shelfLifeDays: "60",
    batches: [{ id: "b-2026-07-09-garlic-sauce", packs: 2, totalPrice: 576.4, receivedAt: daysAgo(20) }],
  },
  {
    id: "p-mustard-sauce",
    name: "Соус Efko Food Special горчичный ГОСТ 22%, 1кг",
    typeId: "type-mustard-sauce",
    packageSize: 1,
    stockUnit: "кг",
    shelfLifeDays: "60",
    batches: [{ id: "b-2026-07-09-mustard-sauce", packs: 1, totalPrice: null, receivedAt: daysAgo(20) }],
  },
  {
    id: "p-chicken-wings",
    name: "Куриные крылья",
    typeId: "type-chicken-wings",
    packageSize: 1,
    stockUnit: "кг",
    shelfLifeDays: "5",
    batches: [{ id: "b-2026-08-08-chicken-wings", packs: 8, totalPrice: null, receivedAt: daysAgo(2) }],
  },
  {
    id: "p-draft-lager",
    name: "Разливное пиво: лагер, кег 30л",
    typeId: "type-draft-lager",
    packageSize: 30,
    stockUnit: "л",
    shelfLifeDays: "10",
    batches: [{ id: "b-2026-08-08-draft-lager", packs: 1, totalPrice: 4200, receivedAt: daysAgo(2) }],
  },
  {
    id: "p-draft-ipa",
    name: "Разливное пиво: IPA, кег 30л",
    typeId: "type-draft-ipa",
    packageSize: 30,
    stockUnit: "л",
    shelfLifeDays: "10",
    batches: [{ id: "b-2026-08-08-draft-ipa", packs: 1, totalPrice: 5400, receivedAt: daysAgo(2) }],
  },
  {
    id: "p-draft-stout",
    name: "Разливное пиво: стаут, кег 30л",
    typeId: "type-draft-stout",
    packageSize: 30,
    stockUnit: "л",
    shelfLifeDays: "10",
    batches: [{ id: "b-2026-08-08-draft-stout", packs: 1, totalPrice: 5100, receivedAt: daysAgo(2) }],
  },
  {
    id: "p-plastic-bottle-05",
    name: "Бутылка пластиковая 0.5л",
    typeId: "type-plastic-bottle-05",
    packageSize: 1,
    stockUnit: "шт",
    shelfLifeDays: "365",
    batches: [{ id: "b-2026-08-08-plastic-bottle-05", packs: 100, totalPrice: 2500, receivedAt: daysAgo(2) }],
  },
];

const initialPurchases: PurchaseRecord[] = [
  { id: "purchase-2026-08-08", receivedAt: daysAgo(2), itemCount: 6, total: 4544 },
  { id: "purchase-2026-07-09", receivedAt: daysAgo(20), itemCount: 7, total: 4768.24 },
  { id: "purchase-2026-06-23", receivedAt: daysAgo(60), itemCount: 6, total: 5840 },
];

const initialMenuPositions: MenuPosition[] = [
  {
    id: "menu-burger-classic",
    name: "Бургер классический",
    price: "590",
    imageUrl: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=80",
    ingredients: [
      { id: "i-classic-bun", typeId: "type-burger-bun", amount: "1" },
      { id: "i-classic-bacon", typeId: "type-bacon", amount: "0.12" },
      { id: "i-classic-cheese", typeId: "type-cheese-sauce", amount: "0.04" },
      { id: "i-classic-onion", typeId: "type-dried-onion", amount: "0.02" },
    ],
  },
  {
    id: "menu-burger-bbq",
    name: "Бургер BBQ",
    price: "640",
    imageUrl: "https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=900&q=80",
    ingredients: [
      { id: "i-bbq-bun", typeId: "type-burger-bun", amount: "1" },
      { id: "i-bbq-bacon", typeId: "type-bacon", amount: "0.14" },
      { id: "i-bbq-sauce", typeId: "type-bbq-sauce", amount: "0.05" },
      { id: "i-bbq-rings", typeId: "type-onion-rings", amount: "0.12" },
    ],
  },
  {
    id: "menu-fries",
    name: "Картошка фри",
    price: "290",
    imageUrl: "https://images.unsplash.com/photo-1639024471283-03518883512d?auto=format&fit=crop&w=900&q=80",
    ingredients: [{ id: "i-fries", typeId: "type-fries", amount: "0.2" }],
  },
  {
    id: "menu-nuggets",
    name: "Наггетсы",
    price: "360",
    imageUrl: "https://www.arise-app.com/images/dishes/de/hahnchennuggets-mit-saucen-wwjat0.webp",
    ingredients: [
      { id: "i-nuggets-fish", typeId: "type-fish-sticks", amount: "0.24" },
      { id: "i-nuggets-garlic", typeId: "type-garlic-sauce", amount: "0.04" },
    ],
  },
  {
    id: "menu-wings",
    name: "Крылья BBQ",
    price: "490",
    imageUrl: "https://images.unsplash.com/photo-1608039829572-78524f79c4c7?auto=format&fit=crop&w=900&q=80",
    ingredients: [
      { id: "i-wings-main", typeId: "type-chicken-wings", amount: "0.35" },
      { id: "i-wings-bbq", typeId: "type-bbq-sauce", amount: "0.06" },
    ],
  },
  {
    id: "menu-burger-pickle",
    name: "Бургер с огурцом",
    price: "620",
    imageUrl: "https://images.unsplash.com/photo-1594212699903-ec8a3eca50f5?auto=format&fit=crop&w=900&q=80",
    ingredients: [
      { id: "i-pickle-bun", typeId: "type-burger-bun", amount: "1" },
      { id: "i-pickle-bacon", typeId: "type-bacon", amount: "0.12" },
      { id: "i-pickle-cheese", typeId: "type-cheese-sauce", amount: "0.04" },
      { id: "i-pickle-missing", typeId: "type-pickled-cucumber", amount: "0.08" },
    ],
  },
  {
    id: "menu-draft-lager",
    name: "Лагер разливной",
    price: "190",
    imageUrl: "https://images.unsplash.com/photo-1608270586620-248524c67de9?auto=format&fit=crop&w=900&q=80",
    orderStep: 0.5,
    orderUnit: "л",
    ingredients: [{ id: "i-draft-lager", typeId: "type-draft-lager", amount: "0.5" }],
  },
  {
    id: "menu-draft-ipa",
    name: "IPA разливная",
    price: "240",
    imageUrl: "https://images.unsplash.com/photo-1535958636474-b021ee887b13?auto=format&fit=crop&w=900&q=80",
    orderStep: 0.5,
    orderUnit: "л",
    ingredients: [{ id: "i-draft-ipa", typeId: "type-draft-ipa", amount: "0.5" }],
  },
  {
    id: "menu-draft-stout",
    name: "Стаут разливной",
    price: "230",
    imageUrl: "https://images.unsplash.com/photo-1571613316887-6f8d5cbf7ef7?auto=format&fit=crop&w=900&q=80",
    orderStep: 0.5,
    orderUnit: "л",
    ingredients: [{ id: "i-draft-stout", typeId: "type-draft-stout", amount: "0.5" }],
  },
];

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

const dataVersionStorageKey = "hitry-lis-data-version";
const currentDataVersion = "2026-09-01-labels-v9";

const orderPortion = (position: MenuPosition) => position.orderStep ?? 1;

const formatOrderQuantity = (position: MenuPosition, quantity: number) => {
  const total = Math.round(quantity * orderPortion(position) * 100) / 100;
  return `${total} ${position.orderUnit ?? "шт"}`;
};
const productsStorageKey = "hitry-lis-products";
const purchasesStorageKey = "hitry-lis-purchases";
const menuStorageKey = "hitry-lis-menu-positions";
const ordersStorageKey = "hitry-lis-orders";
const orderCounterStorageKey = "hitry-lis-order-counter";
const writeOffsStorageKey = "hitry-lis-write-offs";
const shiftNotesStorageKey = "hitry-lis-shift-notes";
const menuCategoriesStorageKey = "hitry-lis-menu-categories";

function normalizeName(name: string) {
  return name
    .toLowerCase()
    .replaceAll("ё", "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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
  for (const type of productTypes) {
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

  for (const type of productTypes) {
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
      id: crypto.randomUUID(),
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

function createInitialProducts() {
  return productSeeds
    .map((product) => {
      const batches = product.batches.map((batch) => ({
        ...batch,
        remainingAmount: batch.packs * product.packageSize,
        expiresAt: addDays(batch.receivedAt, product.shelfLifeDays),
        shelfLifeDays: product.shelfLifeDays,
      }));

      return {
        id: product.id,
        name: product.name,
        normalizedName: normalizeName(product.name),
        typeId: product.typeId,
        packageSize: product.packageSize,
        stockUnit: product.stockUnit,
        packs: batches.reduce((sum, batch) => sum + batch.packs, 0),
        amount: batches.reduce((sum, batch) => sum + batch.remainingAmount, 0),
        shelfLifeDays: product.shelfLifeDays,
        batches,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

function formatMoney(value: number | null) {
  if (value === null) return "—";

  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
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

function getProductType(typeId: string) {
  return productTypes.find((type) => type.id === typeId);
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
  const [products, setProducts] = useState<Product[]>(() => createInitialProducts());
  const [purchases, setPurchases] = useState<PurchaseRecord[]>(initialPurchases);
  const [menuPositions, setMenuPositions] = useState<MenuPosition[]>(initialMenuPositions);
  const [menuCategories, setMenuCategories] = useState<MenuCategory[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<string>("all");
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [expandedProductId, setExpandedProductId] = useState<string | null>("p-fish-sticks");
  const [expandedPurchaseId, setExpandedPurchaseId] = useState<string | null>("purchase-2026-08-08");
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isPositionModalOpen, setIsPositionModalOpen] = useState(false);
  const [editingPositionId, setEditingPositionId] = useState<string | null>(null);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [orderCounter, setOrderCounter] = useState(0);
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
  const [shiftNotes, setShiftNotes] = useState("");
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
  });
  const [draftPosition, setDraftPosition] = useState<MenuPosition>(() => createBlankPosition());
  const isStorageReady = useRef(false);

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

  useEffect(() => {
    window.queueMicrotask(() => {
      const version = window.localStorage.getItem(dataVersionStorageKey);

      if (version !== currentDataVersion) {
        window.localStorage.setItem(dataVersionStorageKey, currentDataVersion);
        window.localStorage.setItem(productsStorageKey, JSON.stringify(createInitialProducts()));
        window.localStorage.setItem(purchasesStorageKey, JSON.stringify(initialPurchases));
        window.localStorage.setItem(menuStorageKey, JSON.stringify(initialMenuPositions));
        isStorageReady.current = true;
        return;
      }

      const savedProducts = window.localStorage.getItem(productsStorageKey);
      const savedPurchases = window.localStorage.getItem(purchasesStorageKey);
      const savedMenu = window.localStorage.getItem(menuStorageKey);
      if (savedProducts) setProducts(JSON.parse(savedProducts) as Product[]);
      if (savedPurchases) setPurchases(JSON.parse(savedPurchases) as PurchaseRecord[]);
      if (savedMenu) setMenuPositions(JSON.parse(savedMenu) as MenuPosition[]);
      isStorageReady.current = true;
    });

    // История заказов, списаний и счётчик номеров переживают сброс версии сид-данных — это не сиды, а факты
    window.queueMicrotask(() => {
      const savedOrders = window.localStorage.getItem(ordersStorageKey);
      const savedCounter = window.localStorage.getItem(orderCounterStorageKey);
      const savedWriteOffs = window.localStorage.getItem(writeOffsStorageKey);
      const savedShiftNotes = window.localStorage.getItem(shiftNotesStorageKey);
      const savedCategories = window.localStorage.getItem(menuCategoriesStorageKey);
      if (savedOrders) setOrders(JSON.parse(savedOrders) as OrderRecord[]);
      if (savedCounter) setOrderCounter(Number(savedCounter) || 0);
      if (savedWriteOffs) setWriteOffs(JSON.parse(savedWriteOffs) as WriteOffRecord[]);
      if (savedShiftNotes) setShiftNotes(savedShiftNotes);
      if (savedCategories) setMenuCategories(JSON.parse(savedCategories) as MenuCategory[]);
    });
  }, []);

  useEffect(() => {
    if (!isStorageReady.current) return;
    window.localStorage.setItem(productsStorageKey, JSON.stringify(products));
    window.localStorage.setItem(purchasesStorageKey, JSON.stringify(purchases));
    window.localStorage.setItem(menuStorageKey, JSON.stringify(menuPositions));
  }, [products, purchases, menuPositions]);

  useEffect(() => {
    if (!isStorageReady.current) return;
    window.localStorage.setItem(menuCategoriesStorageKey, JSON.stringify(menuCategories));
  }, [menuCategories]);

  useEffect(() => {
    if (!isStorageReady.current) return;
    window.localStorage.setItem(ordersStorageKey, JSON.stringify(orders));
    window.localStorage.setItem(orderCounterStorageKey, String(orderCounter));
  }, [orders, orderCounter]);

  useEffect(() => {
    if (!isStorageReady.current) return;
    window.localStorage.setItem(writeOffsStorageKey, JSON.stringify(writeOffs));
  }, [writeOffs]);

  useEffect(() => {
    if (!isStorageReady.current) return;
    window.localStorage.setItem(shiftNotesStorageKey, shiftNotes);
  }, [shiftNotes]);

  useEffect(() => {
    if (lastOrderNumber === null) return;
    const timer = setTimeout(() => setLastOrderNumber(null), 3000);
    return () => clearTimeout(timer);
  }, [lastOrderNumber]);

  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Повар (/chef-display) меняет статусы заказов в том же localStorage —
  // подхватываем это здесь, иначе таймер в «Заказах» не остановится, когда
  // повар нажмёт «Готово», и отмену на кассе повар увидит с опозданием.
  const lastOrdersJson = useRef("");
  useEffect(() => {
    const sync = () => {
      if (!isStorageReady.current) return;
      const raw = window.localStorage.getItem(ordersStorageKey);
      if (!raw || raw === lastOrdersJson.current) return;
      lastOrdersJson.current = raw;
      try {
        setOrders(JSON.parse(raw) as OrderRecord[]);
      } catch {
        // битые данные в сторедже — игнорируем
      }
    };
    window.addEventListener("storage", sync);
    const timer = setInterval(sync, 3000);
    return () => {
      window.removeEventListener("storage", sync);
      clearInterval(timer);
    };
  }, []);

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

  const updateProduct = (id: string, patch: Partial<Product>) => {
    setProducts((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const updateProductPackageSize = (id: string, packageSize: number) => {
    setProducts((items) =>
      items.map((product) => {
        if (product.id !== id) return product;

        const batches = product.batches.map((batch) => ({
          ...batch,
          remainingAmount: batch.packs * packageSize,
        }));

        return {
          ...product,
          packageSize,
          amount: batches.reduce((sum, batch) => sum + batch.remainingAmount, 0),
          batches,
        };
      }),
    );
  };

  const updateProductBatch = (productId: string, batchId: string, patch: Partial<StockBatch>) => {
    setProducts((items) =>
      items.map((product) => {
        if (product.id !== productId) return product;

        const batches = product.batches.map((batch) => {
          if (batch.id !== batchId) return batch;

          const nextBatch = { ...batch, ...patch };
          const nextPacks = patch.packs ?? nextBatch.packs;
          const nextShelfLifeDays = patch.shelfLifeDays ?? nextBatch.shelfLifeDays;
          const nextReceivedAt = patch.receivedAt ?? nextBatch.receivedAt;
          const nextAmount = nextPacks * product.packageSize;
          const nextRemainingAmount =
            patch.remainingAmount !== undefined
              ? Math.min(patch.remainingAmount, nextAmount)
              : patch.packs !== undefined
                ? nextAmount
                : nextBatch.remainingAmount;

          return {
            ...nextBatch,
            packs: nextPacks,
            remainingAmount: nextRemainingAmount,
            expiresAt:
              patch.receivedAt !== undefined || patch.shelfLifeDays !== undefined
                ? addDays(nextReceivedAt, nextShelfLifeDays)
                : nextBatch.expiresAt,
          };
        });

        return {
          ...product,
          packs: batches.reduce((sum, batch) => sum + batch.packs, 0),
          amount: batches.reduce((sum, batch) => sum + batch.remainingAmount, 0),
          shelfLifeDays: batches[0]?.shelfLifeDays ?? product.shelfLifeDays,
          batches,
        };
      }),
    );
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

  const writeOffIngredients = (ingredients: MenuIngredient[]) => {
    const required = collectRequirements(ingredients);
    if (!hasEnoughStock(ingredients)) return false;

    setProducts((currentProducts) => {
      const nextProducts = currentProducts.map((product) => ({ ...product, batches: [...product.batches] }));

      for (const [typeId, amount] of required) {
        let left = amount;
        const batchRefs = nextProducts
          .filter((product) => product.typeId === typeId)
          .flatMap((product) => product.batches.map((batch, index) => ({ product, batch, index })))
          .filter((ref) => ref.batch.remainingAmount > 0 && !isBatchExpired(ref.batch))
          .sort((a, b) => a.batch.expiresAt.localeCompare(b.batch.expiresAt));

        for (const ref of batchRefs) {
          if (left <= epsilon) break;
          const writeOff = Math.min(ref.batch.remainingAmount, left);
          left -= writeOff;
          ref.product.batches[ref.index] = {
            ...ref.batch,
            remainingAmount: formatAmount(ref.batch.remainingAmount - writeOff),
          };
        }
      }

      return nextProducts.map((product) => ({
        ...product,
        amount: formatAmount(product.batches.reduce((sum, batch) => sum + batch.remainingAmount, 0)),
      }));
    });

    return true;
  };

  const submitWriteOff = () => {
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

    setProducts((items) =>
      items.map((item) => {
        if (item.id !== product.id) return item;
        const batches = item.batches.map((b) =>
          b.id === batch.id ? { ...b, remainingAmount: Math.max(0, b.remainingAmount - amount) } : b,
        );
        return { ...item, batches, amount: batches.reduce((sum, b) => sum + b.remainingAmount, 0) };
      }),
    );

    const unitPrice = getBatchUnitPrice(product, batch) ?? 0;
    setWriteOffs((prev) => [
      {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        productName: product.name,
        batchId: batch.id,
        amount,
        unit: product.stockUnit,
        reason,
        value: Math.round(unitPrice * amount * 100) / 100,
      },
      ...prev,
    ]);

    setWriteOffTarget(null);
    setWriteOffAmount("");
    setWriteOffCustomReason("");
    setWriteOffFormError(null);
  };

  const addProductBatch = (item: ParsedItem) => {
    const packs = parseNumber(item.quantity);
    const packageSize = Math.max(0, parseNumber(item.packageSize || "1"));
    const stockUnit = item.stockUnit || productTypes.find((type) => type.id === item.typeId)?.unit || item.unit || "шт";
    if (!item.name.trim() || packs <= 0 || packageSize <= 0) return;

    const normalizedName = normalizeName(item.name);
    const batch: StockBatch = {
      id: crypto.randomUUID(),
      packs,
      remainingAmount: packs * packageSize,
      totalPrice: item.totalPrice,
      receivedAt,
      expiresAt: addDays(receivedAt, item.shelfLifeDays),
      shelfLifeDays: item.shelfLifeDays || "7",
    };

    setProducts((currentProducts) => {
      const nextProducts = currentProducts.map((product) => ({ ...product, batches: [...product.batches] }));
      const existing = nextProducts.find((product) => product.normalizedName === normalizedName);

      if (existing) {
        existing.packs += packs;
        existing.amount += batch.remainingAmount;
        existing.typeId = item.typeId || existing.typeId;
        existing.packageSize = packageSize || existing.packageSize;
        existing.stockUnit = stockUnit;
        existing.shelfLifeDays = item.shelfLifeDays || existing.shelfLifeDays;
        existing.batches = [batch, ...existing.batches];
      } else {
        nextProducts.push({
          id: crypto.randomUUID(),
          name: item.name.trim(),
          normalizedName,
          typeId: item.typeId || "type-misc",
          packageSize,
          stockUnit,
          packs,
          amount: batch.remainingAmount,
          shelfLifeDays: item.shelfLifeDays || "7",
          batches: [batch],
        });
      }

      return nextProducts.sort((a, b) => a.name.localeCompare(b.name, "ru"));
    });
  };

  const applyPurchase = () => {
    if (parsedItems.length === 0) return;

    parsedItems.forEach(addProductBatch);
    setPurchases((items) => [
      { id: crypto.randomUUID(), receivedAt, itemCount: parsedItems.length, total: purchaseTotal },
      ...items,
    ]);
    setRawText("");
    setParsedItems([]);
    setIsPurchaseModalOpen(false);
    setActiveSection("warehouse");
    setActiveTab("purchases");
  };

  const addManualProduct = () => {
    if (!newProduct.name.trim()) return;

    const packs = parseNumber(newProduct.quantity);
    const packageSize = Math.max(0, parseNumber(newProduct.packageSize || "1"));
    const normalizedName = normalizeName(newProduct.name);

    setProducts((currentProducts) => {
      const nextProducts = currentProducts.map((product) => ({ ...product, batches: [...product.batches] }));
      const existing = nextProducts.find((product) => product.normalizedName === normalizedName);
      const batch =
        packs > 0 && packageSize > 0
          ? {
              id: crypto.randomUUID(),
              packs,
              remainingAmount: packs * packageSize,
              totalPrice: null,
              receivedAt,
              expiresAt: addDays(receivedAt, newProduct.shelfLifeDays || "7"),
              shelfLifeDays: newProduct.shelfLifeDays || "7",
            }
          : null;

      if (existing) {
        existing.name = newProduct.name.trim();
        existing.typeId = newProduct.typeId || existing.typeId;
        existing.packageSize = packageSize || existing.packageSize;
        existing.stockUnit = newProduct.stockUnit || existing.stockUnit;
        existing.shelfLifeDays = newProduct.shelfLifeDays || existing.shelfLifeDays;
        if (batch) {
          existing.packs += packs;
          existing.amount += batch.remainingAmount;
          existing.batches = [batch, ...existing.batches];
        }
      } else {
        nextProducts.push({
          id: crypto.randomUUID(),
          name: newProduct.name.trim(),
          normalizedName,
          typeId: newProduct.typeId || "type-misc",
          packageSize: packageSize || 1,
          stockUnit: newProduct.stockUnit || "шт",
          packs,
          amount: batch?.remainingAmount ?? 0,
          shelfLifeDays: newProduct.shelfLifeDays || "7",
          batches: batch ? [batch] : [],
        });
      }

      return nextProducts.sort((a, b) => a.name.localeCompare(b.name, "ru"));
    });

    setNewProduct({ name: "", quantity: "", unit: "уп", typeId: "", packageSize: "1", stockUnit: "кг", shelfLifeDays: "7" });
    setIsProductModalOpen(false);
    setActiveSection("warehouse");
    setActiveTab("products");
  };

  const addIngredientRow = () => {
    setDraftPosition((position) => ({
      ...position,
      ingredients: [...position.ingredients, { id: crypto.randomUUID(), typeId: "", amount: "" }],
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
    setIsPositionModalOpen(true);
  };

  const saveMenuPosition = () => {
    const ingredients = draftPosition.ingredients
      .filter((ingredient) => ingredient.typeId && parseNumber(ingredient.amount) > 0)
      .map((ingredient) => ({
        ...ingredient,
        altTypeIds: (ingredient.altTypeIds ?? []).filter(Boolean),
      }));
    if (!draftPosition.name.trim() || ingredients.length === 0) return;

    if (editingPositionId) {
      setMenuPositions((items) =>
        items.map((item) =>
          item.id === editingPositionId
            ? { ...draftPosition, id: editingPositionId, name: draftPosition.name.trim(), ingredients }
            : item,
        ),
      );
    } else {
      setMenuPositions((items) => [
        { ...draftPosition, id: crypto.randomUUID(), name: draftPosition.name.trim(), ingredients },
        ...items,
      ]);
    }
    setEditingPositionId(null);
    setDraftPosition(createBlankPosition());
    setIsPositionModalOpen(false);
  };

  const createCategory = () => {
    const name = newCategoryName.trim();
    if (!name) return;
    setMenuCategories((prev) => [...prev, { id: crypto.randomUUID(), name }]);
    setNewCategoryName("");
  };

  const startRenameCategory = (category: MenuCategory) => {
    setEditingCategoryId(category.id);
    setEditingCategoryName(category.name);
  };

  const saveRenameCategory = () => {
    const name = editingCategoryName.trim();
    if (!name || !editingCategoryId) {
      setEditingCategoryId(null);
      return;
    }
    setMenuCategories((prev) => prev.map((c) => (c.id === editingCategoryId ? { ...c, name } : c)));
    setEditingCategoryId(null);
  };

  const deleteCategory = (category: MenuCategory) => {
    if (!window.confirm(`Удалить раздел «${category.name}»? Позиции останутся, но без раздела.`)) return;
    setMenuCategories((prev) => prev.filter((c) => c.id !== category.id));
    setMenuPositions((prev) =>
      prev.map((position) => (position.categoryId === category.id ? { ...position, categoryId: null } : position)),
    );
    if (activeCategoryId === category.id) setActiveCategoryId("all");
  };

  const canSellMenuPosition = (position: MenuPosition) => hasEnoughStock(position.ingredients);

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

  const completeOrder = (route: "kitchen" | "self") => {
    if (orderLines.length === 0 || !canCompleteOrder()) return;

    if (!writeOffIngredients(orderIngredients)) return;

    const number = orderCounter + 1;
    const order: OrderRecord = {
      id: crypto.randomUUID(),
      number,
      createdAt: new Date().toISOString(),
      items: orderLines.map((line) => ({
        name: line.position.name,
        quantity: line.quantity,
        price: parseNumber(line.position.price),
        comment: line.position.comment || undefined,
        ingredients: line.position.ingredients.map((ingredient) => {
          const type = getProductType(resolveIngredientTypeId(ingredient));
          const amount = formatAmount(parseNumber(ingredient.amount) * line.quantity);
          return { name: type?.name ?? "Ингредиент", amount: `${amount} ${type?.unit ?? ""}`.trim() };
        }),
      })),
      total: orderTotal,
      status: "active",
      completedAt: null,
      kitchenStatus: "new",
      route,
      guestId: orderGuest?.id ?? null,
      guestName: orderGuest?.name ?? null,
    };
    setOrders((prev) => [order, ...prev]);
    setOrderCounter(number);
    setLastOrderNumber(number);
    setOrderItems({});
    setOrderGuest(null);
    setGuestSearchQuery("");
    setIsOrderModalOpen(false);
  };

  const cancelOrder = (order: OrderRecord) => {
    if (!window.confirm(`Отменить заказ №${order.number}?`)) return;
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: "cancelled" } : o)));
  };

  const markOrderDone = (order: OrderRecord) => {
    setOrders((prev) =>
      prev.map((o) => (o.id === order.id ? { ...o, status: "completed", completedAt: new Date().toISOString() } : o)),
    );
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

  const saveOrderEdit = () => {
    if (!editingOrderId) return;
    const total = orderEditItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    setOrders((prev) =>
      prev.map((o) => (o.id === editingOrderId ? { ...o, items: orderEditItems, total } : o)),
    );
    setEditingOrderId(null);
    setOrderEditItems([]);
  };

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
            <a
              href="/"
              className="inline-flex items-center gap-2 rounded-xl border border-white/8 bg-[#1b1c20] px-4 py-2 text-sm text-zinc-300 transition hover:text-zinc-100"
            >
              К расписанию игр
            </a>
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
            <div className="mb-8 flex items-center gap-3 px-2">
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
                  <div className="flex min-w-0 items-center gap-3">
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
            className={`flex-1 space-y-4 overflow-y-auto p-4 md:p-6 ${activeSection === "tables" ? "hidden" : ""}`}
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
                            <p className="font-medium">
                              Заказ №{order.number}
                              <span className="ml-2 text-xs font-normal text-zinc-500">
                                {new Date(order.createdAt).toLocaleString("ru-RU")}
                              </span>
                              {order.guestName && (
                                <span className="ml-2 rounded-full bg-white/8 px-2 py-0.5 text-[10px] text-zinc-300">
                                  {order.guestName}
                                </span>
                              )}
                              <span
                                className={`ml-2 rounded-full px-2 py-0.5 text-[10px] ${
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

            {activeSection === "events" && <EventsSection />}

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

            {activeSection !== "tables" && activeSection !== "orders" && activeSection !== "shift" && activeSection !== "finance" && activeSection !== "events" && activeSection !== "stats" && (
            <>
            <section className="flex flex-wrap items-center justify-between gap-3">
              {activeSection === "warehouse" ? (
                <div className="flex rounded-full border border-white/8 bg-[#1b1c20] p-1">
                  {[
                    ["purchases", "Закупки"],
                    ["products", "Товары"],
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
                    onClick={() => setIsCategoryModalOpen(true)}
                  >
                    Разделы…
                  </button>
                </div>
              ) : (
                <div />
              )}

              <div className="flex flex-wrap gap-2">
                {activeSection === "positions" ? (
                  <button
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-zinc-100 px-4 text-sm font-medium text-zinc-950 shadow-md shadow-black/25 hover:bg-white"
                    type="button"
                    onClick={() => {
                      setEditingPositionId(null);
                      setDraftPosition(createBlankPosition());
                      setIsPositionModalOpen(true);
                    }}
                  >
                    <Plus className="size-4" />
                    <span>Добавить позицию</span>
                  </button>
                ) : activeSection === "guests" ? (
                  <button
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-zinc-100 px-4 text-sm font-medium text-zinc-950 shadow-md shadow-black/25 hover:bg-white"
                    type="button"
                    onClick={openCreateGuest}
                  >
                    <Plus className="size-4" />
                    <span>Добавить гостя</span>
                  </button>
                ) : (
                  <>
                    <button
                      className="inline-flex h-10 items-center gap-2 rounded-xl bg-zinc-100 px-4 text-sm font-medium text-zinc-950 shadow-md shadow-black/25 hover:bg-white"
                      type="button"
                      onClick={() => setIsPurchaseModalOpen(true)}
                    >
                      <Plus className="size-4" />
                      <span>Добавить закупку</span>
                    </button>
                    <button
                      className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/8 px-4 text-sm text-zinc-300 hover:bg-[#25272c]"
                      type="button"
                      onClick={() => setIsProductModalOpen(true)}
                    >
                      <Plus className="size-4" />
                      <span>Добавить товар</span>
                    </button>
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
                  {listMenuPositions.length === 0 ? (
                    <Empty icon={Utensils} />
                  ) : (
                    listMenuPositions.map((position) => {
                      const available = canSellMenuPosition(position);
                      return (
                        <div
                          key={position.id}
                          className={`flex items-center gap-3 px-4 py-2 ${available ? "" : "opacity-55"}`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img className="size-9 shrink-0 rounded-full object-cover" src={position.imageUrl} alt="" />
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
                  {listProducts.map((product) => {
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
                          onClick={() =>
                            setExpandedProductId(expandedProductId === product.id ? null : product.id)
                          }
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{product.name}</span>
                            <span className="mt-1 block truncate text-xs text-zinc-500">
                              {type?.name ?? "Тип не указан"}
                            </span>
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
                            className={`size-4 text-zinc-500 transition ${
                              expandedProductId === product.id ? "rotate-180" : ""
                            }`}
                          />
                        </button>

                        {expandedProductId === product.id && (
                          <div className="space-y-3 border-t border-white/8 bg-[#17181b] p-4">
                            <div className="grid gap-3 md:grid-cols-[minmax(220px,420px)_220px_130px_120px_160px]">
                              <Field label="Название товара" hint="Как товар назван у поставщика">
                                <input
                                  className="h-10 w-full min-w-0 rounded-xl border border-white/8 bg-[#111214] px-3 text-sm outline-none focus:border-zinc-400"
                                  value={product.name}
                                  onChange={(event) =>
                                    updateProduct(product.id, {
                                      name: event.target.value,
                                      normalizedName: normalizeName(event.target.value),
                                    })
                                  }
                                />
                              </Field>
                              <Field label="Тип расхода" hint="Из этого типа блюда списывают ингредиент">
                                <DarkSelect
                                  value={product.typeId}
                                  options={productTypes.map((item) => ({ id: item.id, label: item.name }))}
                                  onChange={(value) => {
                                    const selectedType = getProductType(value);
                                    updateProduct(product.id, {
                                      typeId: value,
                                      stockUnit: selectedType?.unit ?? product.stockUnit,
                                    });
                                  }}
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
                              <Field label="Ед. расхода" hint="В чём списываем: кг, л или шт">
                                <input
                                  className="h-10 w-full min-w-0 rounded-xl border border-white/8 bg-[#111214] px-3 text-sm outline-none focus:border-zinc-400"
                                  value={product.stockUnit}
                                  onChange={(event) => updateProduct(product.id, { stockUnit: event.target.value })}
                                />
                              </Field>
                              <Field label="Срок по умолчанию, дн." hint="Подставляется новым партиям этого товара">
                                <input
                                  className="h-10 w-full min-w-0 rounded-xl border border-white/8 bg-[#111214] px-3 text-sm outline-none focus:border-zinc-400"
                                  inputMode="numeric"
                                  value={product.shelfLifeDays}
                                  onChange={(event) =>
                                    updateProduct(product.id, { shelfLifeDays: numericInput(event.target.value) })
                                  }
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
                                          <span className="rounded bg-rose-500/15 px-2 py-0.5 text-xs text-rose-300">
                                            просрочено
                                          </span>
                                        )}
                                        {!expired && spent && (
                                          <span className="rounded bg-white/6 px-2 py-0.5 text-xs text-zinc-400">
                                            израсходовано
                                          </span>
                                        )}
                                      </span>
                                      <span className="text-zinc-500">
                                        закуплено {batch.receivedAt}, годен до {batch.expiresAt}
                                      </span>
                                      <span className="text-zinc-400">
                                        {batchUnitPrice === null
                                          ? "без цены"
                                          : `${formatMoney(batchUnitPrice)} / ${product.stockUnit}`}
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
                                            updateProductBatch(product.id, batch.id, {
                                              packs: parseNumber(event.target.value),
                                            })
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
                                      <Field label="Цена партии, ₽" hint="Сумма по чеку за всю партию">
                                        <input
                                          className="h-9 w-full min-w-0 rounded-xl border border-white/8 bg-[#17181b] px-3 text-sm outline-none focus:border-zinc-400"
                                          inputMode="decimal"
                                          placeholder="Цена партии"
                                          value={batch.totalPrice ?? ""}
                                          onChange={(event) =>
                                            updateProductBatch(product.id, batch.id, {
                                              totalPrice:
                                                event.target.value.trim() === "" ? null : parseNumber(event.target.value),
                                            })
                                          }
                                        />
                                      </Field>
                                      <Field label="Дата закупки" hint="От неё считается срок годности">
                                        <input
                                          className="h-9 w-full min-w-0 rounded-xl border border-white/8 bg-[#17181b] px-3 text-sm outline-none focus:border-zinc-400"
                                          type="date"
                                          value={batch.receivedAt}
                                          onChange={(event) =>
                                            updateProductBatch(product.id, batch.id, { receivedAt: event.target.value })
                                          }
                                        />
                                      </Field>
                                      <Field label="Срок, дн." hint="Сколько дней партия годна с даты закупки">
                                        <input
                                          className="h-9 w-full min-w-0 rounded-xl border border-white/8 bg-[#17181b] px-3 text-sm outline-none focus:border-zinc-400"
                                          inputMode="numeric"
                                          value={batch.shelfLifeDays}
                                          onChange={(event) =>
                                            updateProductBatch(product.id, batch.id, {
                                              shelfLifeDays: numericInput(event.target.value),
                                            })
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
                                              shelfLifeDays: String(
                                                Math.max(0, daysBetween(batch.receivedAt, event.target.value)),
                                              ),
                                            })
                                          }
                                        />
                                      </Field>
                                    </div>
                                    <div className="mt-3 h-2 rounded-full bg-zinc-800">
                                      <div
                                        className={`h-2 rounded-full ${
                                          percent <= 25
                                            ? "bg-red-400"
                                            : percent <= 50
                                              ? "bg-amber-300"
                                              : "bg-emerald-400"
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="size-20 shrink-0 rounded-full object-cover" src={infoPosition.imageUrl} alt="" />
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
          title={`Новый заказ · №${orderCounter + 1}`}
          onClose={() => {
            setIsOrderModalOpen(false);
            setSearchQuery("");
          }}
        >
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="flex min-h-0 flex-col rounded-xl border border-white/8 bg-[#17181b]">
              <label className="flex h-12 items-center gap-2 border-b border-white/8 px-4">
                <Search className="size-4 text-zinc-500" />
                <input
                  autoFocus
                  className="w-full bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
                  placeholder="Поиск позиции"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </label>
              <div className="divide-y divide-white/8">
                {filteredMenuPositions.length === 0 ? (
                  <Empty icon={Utensils} />
                ) : (
                  filteredMenuPositions.map((position) => {
                    const quantity = orderItems[position.id] ?? 0;
                    const available = canSellMenuPosition(position);
                    const canAddMore = canAddToOrder(position);
                    return (
                      <div
                        key={position.id}
                        className={`flex items-center gap-3 px-4 py-2 ${available ? "" : "opacity-55"}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="size-9 shrink-0 rounded-full object-cover" src={position.imageUrl} alt="" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{position.name}</p>
                          <p className="text-xs text-zinc-500">
                            {formatMoney(parseNumber(position.price))} · {formatOrderQuantity(position, 1)}
                          </p>
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
                  })
                )}
              </div>
            </div>

            <aside className="flex min-h-[420px] flex-col rounded-xl border border-white/8 bg-[#17181b]">
              <div className="flex items-center gap-2 border-b border-white/8 p-4">
                <ShoppingCart className="size-4 text-violet-300" />
                <h4 className="font-semibold">Заказ</h4>
              </div>
              <div className="flex-1 divide-y divide-white/8">
                {orderLines.length === 0 ? (
                  <Empty icon={ShoppingCart} />
                ) : (
                  orderLines.map((line) => (
                    <div key={line.position.id} className="flex items-center justify-between gap-3 p-4 text-sm">
                      <div>
                        <p className="font-medium">{line.position.name}</p>
                        <p className="text-zinc-500">{formatOrderQuantity(line.position, line.quantity)}</p>
                      </div>
                      <p className="font-semibold">{formatMoney(parseNumber(line.position.price) * line.quantity)}</p>
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
                <h4 className="font-semibold">Распознано</h4>
                <button
                  className="h-10 rounded-xl bg-zinc-100 px-4 text-sm font-medium text-zinc-950 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={parsedItems.length === 0}
                  type="button"
                  onClick={applyPurchase}
                >
                  Применить
                </button>
              </div>
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
          <div className="grid gap-3 xl:grid-cols-[minmax(240px,420px)_240px_100px_120px_110px_120px_150px]">
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
            <Field label="Упаковок" hint="0 — если заводим карточку без остатка">
              <input
                className="h-10 w-full rounded-xl border border-white/8 bg-[#111214] px-3 text-sm outline-none focus:border-zinc-400"
                inputMode="decimal"
                value={newProduct.quantity}
                onChange={(event) => setNewProduct((item) => ({ ...item, quantity: numericInput(event.target.value) }))}
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
              <Field label="Фото, ссылка" hint="Картинка для карточки и кассы">
                <input
                  className="h-11 w-full rounded-xl border border-white/8 bg-[#111214] px-3 text-sm outline-none focus:border-zinc-400"
                  placeholder="Фото URL"
                  value={draftPosition.imageUrl}
                  onChange={(event) => setDraftPosition((position) => ({ ...position, imageUrl: event.target.value }))}
                />
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
}: {
  value: string;
  options: Array<{ id: string; label: string }>;
  onChange: (value: string) => void;
  icon?: LucideIcon;
  pill?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selected = options.find((option) => option.id === value) ?? options[0];

  return (
    <div className="relative min-w-0">
      <button
        className={`flex h-10 w-full min-w-0 items-center justify-between gap-3 border border-white/8 bg-[#1b1c20] px-3 text-sm text-zinc-100 outline-none hover:bg-[#25272c] ${
          pill ? "min-w-44 rounded-full" : "rounded-xl"
        }`}
        type="button"
        onClick={() => setIsOpen((current) => !current)}
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
