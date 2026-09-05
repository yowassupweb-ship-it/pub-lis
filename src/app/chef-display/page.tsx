"use client";

import { LogIn } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { STAFF_ROLES, apiMe, type ApiUser } from "@/lib/api";

type OrderLine = {
  name: string;
  quantity: number;
  comment?: string;
  ingredients: { name: string; amount: string }[];
};
type Order = {
  id: string;
  number: number;
  createdAt: string;
  completedAt?: string | null;
  items: OrderLine[];
  status: "active" | "completed" | "cancelled";
  kitchenStatus: "new" | "accepted" | "done";
  route?: "kitchen" | "self";
};

const ordersStorageKey = "hitry-lis-orders";

function readOrders(): Order[] {
  const raw = window.localStorage.getItem(ordersStorageKey);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Order[];
  } catch {
    return [];
  }
}

function writeOrders(orders: Order[]) {
  window.localStorage.setItem(ordersStorageKey, JSON.stringify(orders));
}

function isForKitchen(order: Order) {
  return (order.route ?? "kitchen") === "kitchen";
}

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

// Сигналы через Web Audio — без внешних файлов. Отмена звучит иначе, чем новый заказ.
function playTone(frequencies: number[]) {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    frequencies.forEach((freq, i) => {
      const delay = i * 0.18;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.001, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + delay + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.18);
    });
  } catch {
    // звук недоступен (например, автовоспроизведение заблокировано) — не критично
  }
}

const playNewOrderChime = () => playTone([880, 880]);
const playCancelChime = () => playTone([440, 330, 220]);
const playReadyChime = () => playTone([660, 990]);

export default function ChefDisplay() {
  const [authState, setAuthState] = useState<"loading" | "guest" | "authed">("loading");
  const [apiUser, setApiUser] = useState<ApiUser | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [tab, setTab] = useState<"active" | "history">("active");
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [cancelAlerts, setCancelAlerts] = useState<{ id: string; number: number }[]>([]);
  const prevOrdersRef = useRef<Map<string, Order> | null>(null);

  useEffect(() => {
    apiMe().then((user) => {
      if (user) {
        setApiUser(user);
        setAuthState("authed");
      } else {
        setAuthState("guest");
      }
    });
  }, []);

  useEffect(() => {
    const load = () => {
      const fresh = readOrders();
      const freshKitchen = fresh.filter(isForKitchen);
      const prev = prevOrdersRef.current;
      if (prev === null) {
        // первая загрузка — просто запоминаем, не сигналим
      } else {
        for (const order of freshKitchen) {
          const before = prev.get(order.id);
          if (!before && order.kitchenStatus === "new") playNewOrderChime();
          if (before && before.status !== "cancelled" && order.status === "cancelled") {
            playCancelChime();
            setCancelAlerts((alerts) => [...alerts, { id: order.id, number: order.number }]);
            setTimeout(() => setCancelAlerts((alerts) => alerts.filter((a) => a.id !== order.id)), 15000);
          }
        }
      }
      prevOrdersRef.current = new Map(freshKitchen.map((o) => [o.id, o]));
      setOrders(fresh);
    };
    load();
    window.addEventListener("storage", load);
    const timer = setInterval(load, 2000);
    return () => {
      window.removeEventListener("storage", load);
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const updateOrder = (order: Order, patch: Partial<Order>) => {
    const next = readOrders().map((o) => (o.id === order.id ? { ...o, ...patch } : o));
    writeOrders(next);
    setOrders(next);
  };

  const markReady = (order: Order) => {
    playReadyChime();
    updateOrder(order, {
      kitchenStatus: "done",
      status: "completed",
      completedAt: new Date().toISOString(),
    });
  };

  const kitchenOrders = orders.filter(isForKitchen);
  // В историю уходит всё, что перестало быть активным заказом — неважно, кто
  // закрыл его: повар кнопкой «Готово» или бармен галочкой в CRM.
  const activeOrders = kitchenOrders
    .filter((o) => o.status === "active" && o.kitchenStatus !== "done")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const historyOrders = kitchenOrders
    .filter((o) => o.status !== "active" || o.kitchenStatus === "done")
    .sort((a, b) => (b.completedAt ?? b.createdAt).localeCompare(a.completedAt ?? a.createdAt))
    .slice(0, 50);

  if (authState === "loading") {
    return (
      <main className="grid min-h-screen place-items-center bg-black font-mono text-zinc-500">Загрузка…</main>
    );
  }

  if (authState === "guest" || (apiUser && !STAFF_ROLES.includes(apiUser.role))) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black p-4 font-mono text-zinc-100">
        <div className="max-w-md text-center">
          <h1 className="text-3xl font-bold">ЭКРАН КУХНИ</h1>
          <p className="mt-3 text-zinc-400">Нужно войти под учётной записью персонала.</p>
          <a
            href="/login"
            className="mt-6 inline-flex items-center gap-2 border border-amber-400 px-4 py-2 text-sm font-medium text-amber-400 transition hover:bg-amber-400 hover:text-black"
          >
            <LogIn className="h-4 w-4" />
            Войти
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black p-4 font-mono text-zinc-100">
      {cancelAlerts.length > 0 && (
        <div className="fixed inset-x-0 top-0 z-50 flex flex-col gap-1 bg-rose-600 p-2 text-center text-sm font-bold uppercase tracking-wide text-white">
          {cancelAlerts.map((a) => (
            <div key={a.id}>Заказ #{a.number} ОТМЕНЁН</div>
          ))}
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3">
        <h1 className="text-2xl font-bold uppercase tracking-wider">Заказы</h1>
        <div className="flex items-center gap-3">
          <div className="flex border border-zinc-700">
            <button
              className={`px-4 py-1.5 text-sm uppercase tracking-wide ${tab === "active" ? "bg-amber-400 text-black" : "text-zinc-400"}`}
              type="button"
              onClick={() => setTab("active")}
            >
              Активные ({activeOrders.length})
            </button>
            <button
              className={`px-4 py-1.5 text-sm uppercase tracking-wide ${tab === "history" ? "bg-amber-400 text-black" : "text-zinc-400"}`}
              type="button"
              onClick={() => setTab("history")}
            >
              История
            </button>
          </div>
          <span className="tabular-nums text-zinc-500">
            {new Date(nowTick).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>
        </div>
      </div>

      {tab === "active" ? (
        activeOrders.length === 0 ? (
          <p className="text-center text-xl text-zinc-600">Очередь пуста</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {activeOrders.map((order) => {
              const elapsed = nowTick - new Date(order.createdAt).getTime();
              const isNew = order.kitchenStatus === "new";
              return (
                <div
                  key={order.id}
                  className={`border-l-4 bg-zinc-950 p-4 ${isNew ? "border-amber-400" : "border-emerald-500"}`}
                >
                  <div className="mb-2 flex items-center justify-between border-b border-zinc-800 pb-2">
                    <span className="text-xl font-bold">#{order.number}</span>
                    <span className={`tabular-nums text-sm ${elapsed > 15 * 60_000 ? "text-rose-400" : "text-zinc-400"}`}>
                      {formatDuration(elapsed)}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {order.items.map((line, i) => (
                      <div key={i}>
                        <p className="text-base font-semibold">
                          {line.name} <span className="text-zinc-500">x{line.quantity}</span>
                        </p>
                        <ul className="text-xs text-zinc-500">
                          {line.ingredients.map((ingredient, j) => (
                            <li key={j}>
                              {ingredient.name} — {ingredient.amount}
                            </li>
                          ))}
                        </ul>
                        {line.comment && <p className="mt-0.5 text-xs text-amber-300">! {line.comment}</p>}
                      </div>
                    ))}
                  </div>
                  {isNew ? (
                    <button
                      className="mt-3 h-11 w-full bg-amber-400 text-sm font-bold uppercase tracking-wide text-black hover:bg-amber-300"
                      type="button"
                      onClick={() => updateOrder(order, { kitchenStatus: "accepted" })}
                    >
                      Принять
                    </button>
                  ) : (
                    <button
                      className="mt-3 h-11 w-full bg-emerald-500 text-sm font-bold uppercase tracking-wide text-black hover:bg-emerald-400"
                      type="button"
                      onClick={() => markReady(order)}
                    >
                      Готово
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : historyOrders.length === 0 ? (
        <p className="text-center text-xl text-zinc-600">История пуста</p>
      ) : (
        <div className="divide-y divide-zinc-800 border border-zinc-800">
          {historyOrders.map((order) => (
            <div key={order.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="w-16 font-bold">#{order.number}</span>
              <span
                className={`w-24 shrink-0 uppercase ${order.status === "cancelled" ? "text-rose-400" : "text-emerald-400"}`}
              >
                {order.status === "cancelled" ? "отменён" : "готово"}
              </span>
              <span className="w-40 text-zinc-500">
                {new Date(order.completedAt ?? order.createdAt).toLocaleString("ru-RU")}
              </span>
              <span className="min-w-0 flex-1 truncate text-zinc-400">
                {order.items.map((line) => `${line.name} x${line.quantity}`).join(", ")}
              </span>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
