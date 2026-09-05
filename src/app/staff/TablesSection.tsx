"use client";

import {
  Calendar as CalendarIcon,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  DoorOpen,
  LocateFixed,
  Map as MapIcon,
  Minus as WallIcon,
  MousePointer2,
  Plus,
  RotateCw,
  Square,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  apiCreateFloorMap,
  apiCreateTableBooking,
  apiDeleteTableBooking,
  apiEvents,
  apiFloorMap,
  apiFloorMaps,
  apiGames,
  apiSaveFloorMapLayout,
  apiTableBookings,
  type ApiEvent,
  type ApiFloorMapMeta,
  type ApiGame,
  type ApiTableBooking,
  type ApiUser,
  type FloorLayout,
} from "@/lib/api";
import TimeRangeInput from "@/components/TimeRangeInput";

type Point = { x: number; y: number };
type TableShape = "rect" | "l-shape";
type MapTable = {
  id: string;
  number: number;
  seats: number;
  x: number;
  y: number;
  rotation: number;
  shape: TableShape;
};
type MapWall = { id: string; x1: number; y1: number; x2: number; y2: number };
type MapDoor = { id: string; x: number; y: number; rotation: number };
type Mode = "select" | "draw-wall" | "place-table" | "place-table-l" | "place-door";

const CANVAS_W = 2400;
const CANVAS_H = 1600;
const TABLE_W = 140;
const TABLE_H = 80;
const DOOR_W = 70;
const L_ARM_W = Math.round(TABLE_H * 0.7);
const L_ARM_H = TABLE_H;
const SNAP = 20;
const WALL_WIDTH = 8;
const INIT_VB = { x: 0, y: 0, w: CANVAS_W * 0.55, h: CANVAS_H * 0.55 };
const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MONTHS = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

function snapToGrid(v: number) {
  return Math.round(v / SNAP) * SNAP;
}
function uid() {
  return Math.random().toString(36).slice(2, 10);
}
function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function emptyLayout(): FloorLayout {
  return { walls: [], tables: [], doors: [] };
}

function timeToMinutes(value: string) {
  const [h, m] = value.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function bookingStatusNow(booking: ApiTableBooking, isToday: boolean, nowMinutes: number): "current" | "upcoming" | "past" {
  if (!isToday || !booking.time_start) return "current"; // без времени/не сегодня — считаем занятым весь день
  const start = timeToMinutes(booking.time_start);
  const end = booking.time_end ? timeToMinutes(booking.time_end) : start + 120;
  if (nowMinutes < start) return "upcoming";
  if (nowMinutes > end) return "past";
  return "current";
}

function ToolButton({
  active,
  title,
  icon,
  onClick,
}: {
  active: boolean;
  title: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className={`grid size-9 place-items-center rounded-xl border transition ${
        active ? "border-violet-400 bg-violet-500/20 text-violet-300" : "border-white/8 text-zinc-400 hover:bg-[#25272c]"
      }`}
      type="button"
      title={title}
      onClick={onClick}
    >
      {icon}
    </button>
  );
}

export default function TablesSection({ guests }: { guests: ApiUser[] }) {
  const [view, setView] = useState<"map" | "calendar">("map");
  const [selectedDate, setSelectedDate] = useState(() => isoDate(new Date()));
  const [calendarCursor, setCalendarCursor] = useState(() => isoDate(new Date()));

  const [maps, setMaps] = useState<ApiFloorMapMeta[]>([]);
  const [activeMapId, setActiveMapId] = useState<string | null>(null);
  const [layout, setLayout] = useState<FloorLayout>(emptyLayout());
  const [isMapPickerOpen, setIsMapPickerOpen] = useState(false);
  const [newMapName, setNewMapName] = useState("");
  const [saving, setSaving] = useState(false);

  const [bookings, setBookings] = useState<ApiTableBooking[]>([]);
  const [games, setGames] = useState<ApiGame[]>([]);
  const [events, setEvents] = useState<ApiEvent[]>([]);

  const [mode, setMode] = useState<Mode>("select");
  const [vb, setVb] = useState(INIT_VB);
  const [drawPoints, setDrawPoints] = useState<Point[]>([]);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTableId, setActiveTableId] = useState<string | null>(null);
  const [bookingDraft, setBookingDraft] = useState({ guestName: "", start: "", end: "", comment: "" });
  const [quickBookingDate, setQuickBookingDate] = useState<string | null>(null);
  const [quickBookingDraft, setQuickBookingDraft] = useState({
    tableId: "",
    guestName: "",
    start: "",
    end: "",
    comment: "",
  });
  const [nowTick, setNowTick] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNowTick(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const isSelectedDateToday = selectedDate === isoDate(nowTick);
  const nowMinutes = nowTick.getHours() * 60 + nowTick.getMinutes();

  const svgRef = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const panRef = useRef<{ startClientX: number; startClientY: number; origX: number; origY: number } | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const layoutRef = useRef(layout);
  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  const tables = layout.tables as unknown as MapTable[];
  const walls = layout.walls as unknown as MapWall[];
  const doors = layout.doors as unknown as MapDoor[];

  useEffect(() => {
    apiFloorMaps().then((list) => {
      const items = list ?? [];
      setMaps(items);
      setActiveMapId((current) => current ?? items[0]?.id ?? null);
    });
  }, []);

  useEffect(() => {
    if (!activeMapId) return;
    apiFloorMap(activeMapId).then((data) => {
      if (data) setLayout((data.layout as FloorLayout) ?? emptyLayout());
      setVb(INIT_VB);
      setSelectedId(null);
      setActiveTableId(null);
    });
  }, [activeMapId]);

  const monthRange = useMemo(() => {
    const base = view === "calendar" ? calendarCursor : selectedDate;
    const d = new Date(`${base}T12:00:00`);
    const from = new Date(d.getFullYear(), d.getMonth(), 1);
    const to = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return { from: isoDate(from), to: isoDate(to) };
  }, [view, calendarCursor, selectedDate]);

  useEffect(() => {
    if (!activeMapId) return;
    apiTableBookings(activeMapId, monthRange.from, monthRange.to).then((list) => setBookings(list ?? []));
  }, [activeMapId, monthRange.from, monthRange.to]);

  useEffect(() => {
    apiGames(monthRange.from, monthRange.to).then((list) => setGames(list ?? []));
  }, [monthRange.from, monthRange.to]);

  useEffect(() => {
    apiEvents(monthRange.from, monthRange.to).then((list) => setEvents(list ?? []));
  }, [monthRange.from, monthRange.to]);

  const isEventDay = (iso: string) => events.some((e) => e.date_from <= iso && iso <= e.date_to);

  const scheduleSave = useCallback(() => {
    if (!activeMapId) return;
    setSaving(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      apiSaveFloorMapLayout(activeMapId, layoutRef.current).finally(() => setSaving(false));
    }, 500);
  }, [activeMapId]);

  const setTables = (updater: (prev: MapTable[]) => MapTable[]) =>
    setLayout((prev) => ({ ...prev, tables: updater(prev.tables as unknown as MapTable[]) }));
  const setWalls = (updater: (prev: MapWall[]) => MapWall[]) =>
    setLayout((prev) => ({ ...prev, walls: updater(prev.walls as unknown as MapWall[]) }));
  const setDoors = (updater: (prev: MapDoor[]) => MapDoor[]) =>
    setLayout((prev) => ({ ...prev, doors: updater(prev.doors as unknown as MapDoor[]) }));

  const nextTableNumber = useMemo(
    () => (tables.length > 0 ? Math.max(...tables.map((t) => t.number)) + 1 : 1),
    [tables],
  );

  const createMap = async () => {
    const name = newMapName.trim() || "Зал";
    const { data } = await apiCreateFloorMap(name);
    if (data) {
      setMaps((prev) => [...prev, { id: data.id, name: data.name, updated_at: data.updated_at }]);
      setActiveMapId(data.id);
      setNewMapName("");
      setIsMapPickerOpen(false);
    }
  };

  const screenToCanvas = useCallback((clientX: number, clientY: number): Point => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const pt = screenToCanvas(e.clientX, e.clientY);
      setCursor({ x: snapToGrid(pt.x), y: snapToGrid(pt.y) });
      if (dragRef.current) {
        const { id, startX, startY, origX, origY } = dragRef.current;
        const nx = snapToGrid(origX + (pt.x - startX));
        const ny = snapToGrid(origY + (pt.y - startY));
        setTables((prev) => prev.map((t) => (t.id === id ? { ...t, x: nx, y: ny } : t)));
        setDoors((prev) => prev.map((d) => (d.id === id ? { ...d, x: nx, y: ny } : d)));
      }
      if (panRef.current) {
        const { startClientX, startClientY, origX, origY } = panRef.current;
        const rect = canvasRef.current!.getBoundingClientRect();
        const dx = ((e.clientX - startClientX) / rect.width) * vb.w;
        const dy = ((e.clientY - startClientY) / rect.height) * vb.h;
        setVb((prev) => ({ ...prev, x: origX - dx, y: origY - dy }));
      }
    },
    [screenToCanvas, vb.w, vb.h],
  );

  const handleMouseUp = useCallback(() => {
    if (dragRef.current) scheduleSave();
    dragRef.current = null;
    panRef.current = null;
  }, [scheduleSave]);

  const finishWall = useCallback(() => {
    if (drawPoints.length >= 2) {
      const toAdd: MapWall[] = [];
      for (let i = 0; i < drawPoints.length - 1; i++) {
        toAdd.push({ id: uid(), x1: drawPoints[i].x, y1: drawPoints[i].y, x2: drawPoints[i + 1].x, y2: drawPoints[i + 1].y });
      }
      setWalls((prev) => [...prev, ...toAdd]);
      scheduleSave();
    }
    setDrawPoints([]);
  }, [drawPoints, scheduleSave]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 2) {
        if (mode === "draw-wall") finishWall();
        else if (mode !== "select") setMode("select");
        return;
      }
      const pt = screenToCanvas(e.clientX, e.clientY);
      if (mode === "select") {
        panRef.current = { startClientX: e.clientX, startClientY: e.clientY, origX: vb.x, origY: vb.y };
        setSelectedId(null);
      } else if (mode === "draw-wall") {
        setDrawPoints((prev) => [...prev, { x: snapToGrid(pt.x), y: snapToGrid(pt.y) }]);
      } else if (mode === "place-table" || mode === "place-table-l") {
        setTables((prev) => [
          ...prev,
          {
            id: uid(),
            number: nextTableNumber,
            seats: 4,
            x: snapToGrid(pt.x - TABLE_W / 2),
            y: snapToGrid(pt.y - TABLE_H / 2),
            rotation: 0,
            shape: mode === "place-table-l" ? "l-shape" : "rect",
          },
        ]);
        scheduleSave();
        setMode("select");
      } else if (mode === "place-door") {
        setDoors((prev) => [
          ...prev,
          { id: uid(), x: snapToGrid(pt.x - DOOR_W / 2), y: snapToGrid(pt.y - DOOR_W / 2), rotation: 0 },
        ]);
        scheduleSave();
        setMode("select");
      }
    },
    [mode, screenToCanvas, vb.x, vb.y, nextTableNumber, scheduleSave, finishWall],
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.12 : 0.89;
      const pt = screenToCanvas(e.clientX, e.clientY);
      setVb((prev) => {
        const newW = Math.max(300, Math.min(CANVAS_W * 2, prev.w * factor));
        const newH = Math.max(200, Math.min(CANVAS_H * 2, prev.h * factor));
        return { x: pt.x - (pt.x - prev.x) * (newW / prev.w), y: pt.y - (pt.y - prev.y) * (newH / prev.h), w: newW, h: newH };
      });
    },
    [screenToCanvas],
  );

  const zoomBy = (factor: number) => {
    setVb((prev) => {
      const cx = prev.x + prev.w / 2;
      const cy = prev.y + prev.h / 2;
      const newW = Math.max(300, Math.min(CANVAS_W * 2, prev.w * factor));
      const newH = Math.max(200, Math.min(CANVAS_H * 2, prev.h * factor));
      return { x: cx - newW / 2, y: cy - newH / 2, w: newW, h: newH };
    });
  };

  const fitToContent = useCallback(() => {
    if (tables.length === 0 && walls.length === 0 && doors.length === 0) {
      setVb(INIT_VB);
      return;
    }
    const PAD = 100;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const t of tables) {
      minX = Math.min(minX, t.x); minY = Math.min(minY, t.y);
      maxX = Math.max(maxX, t.x + TABLE_W); maxY = Math.max(maxY, t.y + TABLE_H);
    }
    for (const w of walls) {
      minX = Math.min(minX, w.x1, w.x2); minY = Math.min(minY, w.y1, w.y2);
      maxX = Math.max(maxX, w.x1, w.x2); maxY = Math.max(maxY, w.y1, w.y2);
    }
    for (const d of doors) {
      minX = Math.min(minX, d.x); minY = Math.min(minY, d.y);
      maxX = Math.max(maxX, d.x + DOOR_W); maxY = Math.max(maxY, d.y + DOOR_W);
    }
    setVb({ x: minX - PAD, y: minY - PAD, w: maxX - minX + PAD * 2, h: maxY - minY + PAD * 2 });
  }, [tables, walls, doors]);

  const rotateSelected = () => {
    if (!selectedId) return;
    const norm = (r: number) => ((r + 45) % 360 + 360) % 360;
    setTables((prev) => prev.map((t) => (t.id === selectedId ? { ...t, rotation: norm(t.rotation) } : t)));
    setDoors((prev) => prev.map((d) => (d.id === selectedId ? { ...d, rotation: norm(d.rotation) } : d)));
    scheduleSave();
  };

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    setWalls((prev) => prev.filter((w) => w.id !== selectedId));
    setTables((prev) => prev.filter((t) => t.id !== selectedId));
    setDoors((prev) => prev.filter((d) => d.id !== selectedId));
    if (activeTableId === selectedId) setActiveTableId(null);
    setSelectedId(null);
    scheduleSave();
  }, [selectedId, activeTableId, scheduleSave]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isInput = tag === "INPUT" || tag === "TEXTAREA";
      if (isInput) return;
      if (e.key === "Escape") {
        setDrawPoints([]);
        setSelectedId(null);
        setMode("select");
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) deleteSelected();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedId, deleteSelected]);

  const bookingsByTableAndDate = useMemo(() => {
    const map = new Map<string, ApiTableBooking[]>();
    for (const booking of bookings) {
      const key = `${booking.table_id}__${booking.booking_date}`;
      const list = map.get(key) ?? [];
      list.push(booking);
      map.set(key, list);
    }
    return map;
  }, [bookings]);

  const activeTableBookings = activeTableId
    ? (bookingsByTableAndDate.get(`${activeTableId}__${selectedDate}`) ?? [])
    : [];
  const activeTable = tables.find((t) => t.id === activeTableId) ?? null;

  const submitBooking = async () => {
    if (!activeMapId || !activeTableId) return;
    const guestName = bookingDraft.guestName.trim();
    if (!guestName) return;
    const matchedGuest = guests.find((g) => g.name.toLowerCase() === guestName.toLowerCase());
    const { data } = await apiCreateTableBooking(activeMapId, {
      table_id: activeTableId,
      booking_date: selectedDate,
      time_start: bookingDraft.start || undefined,
      time_end: bookingDraft.end || undefined,
      guest_id: matchedGuest?.id,
      guest_name: guestName,
      comment: bookingDraft.comment.trim() || undefined,
    });
    if (data) {
      setBookings((prev) => [...prev, data]);
      setBookingDraft({ guestName: "", start: "", end: "", comment: "" });
    }
  };

  const openQuickBooking = (iso: string) => {
    setQuickBookingDate(iso);
    setQuickBookingDraft({ tableId: tables[0]?.id ?? "", guestName: "", start: "", end: "", comment: "" });
  };

  const submitQuickBooking = async () => {
    if (!activeMapId || !quickBookingDate || !quickBookingDraft.tableId) return;
    const guestName = quickBookingDraft.guestName.trim();
    if (!guestName) return;
    const matchedGuest = guests.find((g) => g.name.toLowerCase() === guestName.toLowerCase());
    const { data } = await apiCreateTableBooking(activeMapId, {
      table_id: quickBookingDraft.tableId,
      booking_date: quickBookingDate,
      time_start: quickBookingDraft.start || undefined,
      time_end: quickBookingDraft.end || undefined,
      guest_id: matchedGuest?.id,
      guest_name: guestName,
      comment: quickBookingDraft.comment.trim() || undefined,
    });
    if (data) {
      setBookings((prev) => [...prev, data]);
      setQuickBookingDate(null);
    }
  };

  const removeBooking = async (booking: ApiTableBooking) => {
    if (!activeMapId) return;
    const { error } = await apiDeleteTableBooking(activeMapId, booking.id);
    if (!error) setBookings((prev) => prev.filter((b) => b.id !== booking.id));
  };

  // ── Календарь: игры D&D + брони столов вместе ─────────────────────────
  const calendarDays = useMemo(() => {
    const d = new Date(`${calendarCursor}T12:00:00`);
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    const firstWeekday = (first.getDay() + 6) % 7; // 0 = Пн
    const start = addDays(first, -firstWeekday);
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [calendarCursor]);

  const itemsByDate = useMemo(() => {
    const map = new Map<string, { time: string; label: string; kind: "game" | "booking" }[]>();
    const push = (date: string, item: { time: string; label: string; kind: "game" | "booking" }) => {
      const list = map.get(date) ?? [];
      list.push(item);
      map.set(date, list);
    };
    for (const game of games) {
      const date = game.starts_at.slice(0, 10);
      const time = game.starts_at.slice(11, 16);
      push(date, { time, label: game.title, kind: "game" });
    }
    for (const booking of bookings) {
      const table = tables.find((t) => t.id === booking.table_id);
      const label = `Стол ${table?.number ?? "?"}${booking.guest_name ? ` · ${booking.guest_name}` : ""}`;
      push(booking.booking_date, { time: booking.time_start ?? "", label, kind: "booking" });
    }
    for (const list of map.values()) list.sort((a, b) => a.time.localeCompare(b.time));
    return map;
  }, [games, bookings, tables]);

  const selectedDayItems = itemsByDate.get(selectedDate) ?? [];
  const cursorMonth = new Date(`${calendarCursor}T12:00:00`);


  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-full border border-white/8 bg-[#1b1c20] p-1">
          <button
            className={`flex h-9 items-center gap-2 rounded-full px-4 text-sm ${view === "map" ? "bg-zinc-100 text-zinc-950" : "text-zinc-400"}`}
            type="button"
            onClick={() => setView("map")}
          >
            <MapIcon className="size-4" />
            Карта
          </button>
          <button
            className={`flex h-9 items-center gap-2 rounded-full px-4 text-sm ${view === "calendar" ? "bg-zinc-100 text-zinc-950" : "text-zinc-400"}`}
            type="button"
            onClick={() => setView("calendar")}
          >
            <CalendarIcon className="size-4" />
            Календарь
          </button>
        </div>

        {view === "map" ? (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-xl border border-white/8 bg-[#1b1c20] p-1">
              <button
                className="grid size-8 place-items-center rounded text-zinc-400 hover:bg-[#25272c]"
                type="button"
                onClick={() => setSelectedDate(isoDate(addDays(new Date(`${selectedDate}T12:00:00`), -1)))}
              >
                <ChevronLeft className="size-4" />
              </button>
              <span className="px-2 text-sm">
                {selectedDate}
                <span className="ml-1.5 text-zinc-500">
                  · {WEEKDAYS[(new Date(`${selectedDate}T12:00:00`).getDay() + 6) % 7]}
                </span>
              </span>
              <button
                className="grid size-8 place-items-center rounded text-zinc-400 hover:bg-[#25272c]"
                type="button"
                onClick={() => setSelectedDate(isoDate(addDays(new Date(`${selectedDate}T12:00:00`), 1)))}
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
            <button
              className="h-9 rounded-xl border border-white/8 bg-[#1b1c20] px-3 text-sm text-zinc-300 hover:bg-[#25272c]"
              type="button"
              onClick={() => setSelectedDate(isoDate(new Date()))}
            >
              Сегодня
            </button>
            <div className="relative">
              <button
                className="flex h-9 items-center gap-2 rounded-xl border border-white/8 bg-[#1b1c20] px-3 text-sm text-zinc-300 hover:bg-[#25272c]"
                type="button"
                onClick={() => setIsMapPickerOpen((v) => !v)}
              >
                {maps.find((m) => m.id === activeMapId)?.name ?? "Карта зала"}
                <ChevronDown className="size-4" />
              </button>
              {isMapPickerOpen && (
                <div className="absolute right-0 top-10 z-30 w-64 rounded-xl border border-white/10 bg-[#17181b] p-2 shadow-2xl">
                  {maps.map((m) => (
                    <button
                      key={m.id}
                      className={`flex h-9 w-full items-center rounded px-2 text-left text-sm ${
                        m.id === activeMapId ? "bg-zinc-100 text-zinc-950" : "text-zinc-300 hover:bg-white/8"
                      }`}
                      type="button"
                      onClick={() => {
                        setActiveMapId(m.id);
                        setIsMapPickerOpen(false);
                      }}
                    >
                      {m.name}
                    </button>
                  ))}
                  <div className="mt-2 flex gap-1 border-t border-white/8 pt-2">
                    <input
                      className="h-9 min-w-0 flex-1 rounded-xl border border-white/8 bg-[#111214] px-2 text-sm outline-none focus:border-zinc-400"
                      placeholder="Название зала"
                      value={newMapName}
                      onChange={(e) => setNewMapName(e.target.value)}
                    />
                    <button
                      className="grid size-9 shrink-0 place-items-center rounded-xl bg-zinc-100 text-zinc-950 hover:bg-white"
                      type="button"
                      title="Создать"
                      onClick={createMap}
                    >
                      <Plus className="size-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
            <span className="text-xs text-zinc-500">{saving ? "Сохранение…" : "Сохранено"}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 rounded-xl border border-white/8 bg-[#1b1c20] p-1">
            <button
              className="grid size-8 place-items-center rounded text-zinc-400 hover:bg-[#25272c]"
              type="button"
              onClick={() => setCalendarCursor(isoDate(new Date(cursorMonth.getFullYear(), cursorMonth.getMonth() - 1, 1)))}
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="px-2 text-sm">
              {MONTHS[cursorMonth.getMonth()]} {cursorMonth.getFullYear()}
            </span>
            <button
              className="grid size-8 place-items-center rounded text-zinc-400 hover:bg-[#25272c]"
              type="button"
              onClick={() => setCalendarCursor(isoDate(new Date(cursorMonth.getFullYear(), cursorMonth.getMonth() + 1, 1)))}
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        )}
      </div>

      {view === "map" ? (
        !activeMapId ? (
          <div className="grid min-h-[420px] place-items-center rounded-xl border border-white/8 bg-[#1b1c20] text-sm text-zinc-500">
            Нет карт зала — создайте первую через выбор карты справа сверху
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 gap-3">
            <div className="flex shrink-0 flex-col gap-1 overflow-y-auto rounded-xl border border-white/8 bg-[#1b1c20] p-1">
              <ToolButton active={mode === "select"} title="Выбор / перемещение" icon={<MousePointer2 className="size-4" />} onClick={() => setMode("select")} />
              <ToolButton active={mode === "draw-wall"} title="Стена (клик — точки, ПКМ — завершить)" icon={<WallIcon className="size-4" />} onClick={() => setMode("draw-wall")} />
              <ToolButton active={mode === "place-table"} title="Стол прямой" icon={<Square className="size-4" />} onClick={() => setMode("place-table")} />
              <ToolButton active={mode === "place-table-l"} title="Стол угловой" icon={<Square className="size-4 rotate-45" />} onClick={() => setMode("place-table-l")} />
              <ToolButton active={mode === "place-door"} title="Дверь / проход" icon={<DoorOpen className="size-4" />} onClick={() => setMode("place-door")} />
              <div className="my-1 h-px bg-white/8" />
              <ToolButton active={false} title="Повернуть на 45°" icon={<RotateCw className="size-4" />} onClick={rotateSelected} />
              <ToolButton active={false} title="Удалить выбранное" icon={<Trash2 className="size-4" />} onClick={deleteSelected} />
              <div className="my-1 h-px bg-white/8" />
              <ToolButton active={false} title="Приблизить" icon={<ZoomIn className="size-4" />} onClick={() => zoomBy(0.89)} />
              <ToolButton active={false} title="Отдалить" icon={<ZoomOut className="size-4" />} onClick={() => zoomBy(1.12)} />
              <ToolButton active={false} title="По содержимому" icon={<LocateFixed className="size-4" />} onClick={fitToContent} />
            </div>

            <div
              ref={canvasRef}
              className="relative min-w-0 flex-1 overflow-hidden rounded-xl border border-white/8"
              style={{ background: "#0f1012" }}
              onWheel={handleWheel}
            >
              {mode !== "select" && (
                <div className="absolute inset-x-0 top-0 z-10 bg-violet-500/90 px-4 py-1.5 text-center text-xs text-white">
                  {mode === "draw-wall" && "Кликайте для точек стены. ПКМ — завершить."}
                  {mode === "place-table" && `Кликните, чтобы поставить стол №${nextTableNumber}.`}
                  {mode === "place-table-l" && `Кликните, чтобы поставить угловой стол №${nextTableNumber}.`}
                  {mode === "place-door" && "Кликните, чтобы поставить дверь."}
                </div>
              )}
              <svg
                ref={svgRef}
                viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
                className="h-full w-full"
                style={{ cursor: mode === "select" ? "default" : "crosshair", userSelect: "none" }}
                onMouseMove={handleMouseMove}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onContextMenu={(e) => e.preventDefault()}
              >
                <defs>
                  <pattern id="tables-grid" width={SNAP} height={SNAP} patternUnits="userSpaceOnUse">
                    <path d={`M ${SNAP} 0 L 0 0 0 ${SNAP}`} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
                  </pattern>
                  <pattern id="tables-major-grid" width={SNAP * 5} height={SNAP * 5} patternUnits="userSpaceOnUse">
                    <rect width={SNAP * 5} height={SNAP * 5} fill="url(#tables-grid)" />
                    <path d={`M ${SNAP * 5} 0 L 0 0 0 ${SNAP * 5}`} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="0.8" />
                  </pattern>
                </defs>
                <rect x={0} y={0} width={CANVAS_W} height={CANVAS_H} fill="url(#tables-major-grid)" />
                <rect x={0} y={0} width={CANVAS_W} height={CANVAS_H} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={2} strokeDasharray="8 4" />

                {walls.map((wall) => (
                  <line
                    key={wall.id}
                    x1={wall.x1} y1={wall.y1} x2={wall.x2} y2={wall.y2}
                    stroke={selectedId === wall.id ? "#a78bfa" : "#71717a"}
                    strokeWidth={selectedId === wall.id ? WALL_WIDTH + 1.5 : WALL_WIDTH}
                    strokeLinecap="round"
                    style={{ cursor: mode === "select" ? "pointer" : "default" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (mode !== "select") return;
                      setSelectedId(wall.id);
                    }}
                  />
                ))}

                {mode === "draw-wall" && drawPoints.length > 0 && cursor && (
                  <>
                    {drawPoints.slice(0, -1).map((pt, i) => (
                      <line key={i} x1={pt.x} y1={pt.y} x2={drawPoints[i + 1].x} y2={drawPoints[i + 1].y} stroke="#a78bfa" strokeWidth={WALL_WIDTH} strokeLinecap="round" opacity={0.7} />
                    ))}
                    <line x1={drawPoints[drawPoints.length - 1].x} y1={drawPoints[drawPoints.length - 1].y} x2={cursor.x} y2={cursor.y} stroke="#a78bfa" strokeWidth={3} strokeLinecap="round" strokeDasharray="8 4" opacity={0.6} />
                    {drawPoints.map((pt, i) => (
                      <circle key={i} cx={pt.x} cy={pt.y} r={5} fill="#a78bfa" opacity={0.8} />
                    ))}
                  </>
                )}

                {doors.map((door) => {
                  const cx = DOOR_W / 2;
                  const stroke = selectedId === door.id ? "#a78bfa" : "#a1a1aa";
                  return (
                    <g
                      key={door.id}
                      transform={`translate(${door.x},${door.y}) rotate(${door.rotation},${cx},${cx})`}
                      style={{ cursor: "grab" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (mode !== "select") return;
                        setSelectedId(door.id);
                      }}
                      onMouseDown={(e) => {
                        if (e.button !== 0 || mode !== "select") return;
                        e.stopPropagation();
                        panRef.current = null;
                        const pt = screenToCanvas(e.clientX, e.clientY);
                        dragRef.current = { id: door.id, startX: pt.x, startY: pt.y, origX: door.x, origY: door.y };
                        setSelectedId(door.id);
                      }}
                    >
                      <rect x={-12} y={-6} width={DOOR_W + 24} height={DOOR_W + 6} fill="transparent" />
                      <line x1={-12} y1={0} x2={0} y2={0} stroke={stroke} strokeWidth={WALL_WIDTH} />
                      <line x1={DOOR_W} y1={0} x2={DOOR_W + 12} y2={0} stroke={stroke} strokeWidth={WALL_WIDTH} />
                      <line x1={0} y1={0} x2={0} y2={DOOR_W} stroke={stroke} strokeWidth={2.5} strokeLinecap="round" />
                      <path d={`M ${DOOR_W},0 A ${DOOR_W},${DOOR_W} 0 0,1 0,${DOOR_W}`} fill="none" stroke={stroke} strokeWidth={1.5} strokeDasharray="6 3" opacity={0.75} />
                    </g>
                  );
                })}

                {tables.map((table) => {
                  const tableBookings = bookingsByTableAndDate.get(`${table.id}__${selectedDate}`) ?? [];
                  const current = tableBookings.find(
                    (b) => bookingStatusNow(b, isSelectedDateToday, nowMinutes) === "current",
                  );
                  const upcoming = tableBookings
                    .filter((b) => bookingStatusNow(b, isSelectedDateToday, nowMinutes) === "upcoming")
                    .sort((a, b) => (a.time_start ?? "").localeCompare(b.time_start ?? ""))[0];
                  const color = current
                    ? { bg: "#450a0a", border: "#f87171", text: "#fca5a5" }
                    : upcoming
                      ? { bg: "#451a03", border: "#fb923c", text: "#fdba74" }
                      : { bg: "#14532d", border: "#4ade80", text: "#86efac" };
                  const isLShape = table.shape === "l-shape";
                  const bboxH = isLShape ? TABLE_H + L_ARM_H : TABLE_H;
                  const rcx = TABLE_W / 2;
                  const rcy = bboxH / 2;
                  const lPath = `M 0,0 L ${TABLE_W},0 L ${TABLE_W},${TABLE_H} L ${L_ARM_W},${TABLE_H} L ${L_ARM_W},${TABLE_H + L_ARM_H} L 0,${TABLE_H + L_ARM_H} Z`;
                  const first = current ?? upcoming ?? tableBookings[0];
                  const selected = selectedId === table.id;
                  return (
                    <g
                      key={table.id}
                      transform={`translate(${table.x + rcx},${table.y + rcy}) rotate(${table.rotation}) translate(${-rcx},${-rcy})`}
                      style={{ cursor: "pointer" }}
                      onClick={() => {
                        if (mode !== "select") return;
                        setActiveTableId(table.id);
                        setSelectedId(table.id);
                        setBookingDraft({ guestName: "", start: "", end: "", comment: "" });
                      }}
                      onMouseDown={(e) => {
                        if (e.button !== 0 || mode !== "select") return;
                        e.stopPropagation();
                        panRef.current = null;
                        const pt = screenToCanvas(e.clientX, e.clientY);
                        dragRef.current = { id: table.id, startX: pt.x, startY: pt.y, origX: table.x, origY: table.y };
                        setSelectedId(table.id);
                      }}
                    >
                      {isLShape ? (
                        <path d={lPath} fill={color.bg} stroke={selected ? "#a78bfa" : color.border} strokeWidth={selected ? 3 : 2} strokeLinejoin="round" />
                      ) : (
                        <rect width={TABLE_W} height={TABLE_H} rx={10} fill={color.bg} stroke={selected ? "#a78bfa" : color.border} strokeWidth={selected ? 3 : 2} />
                      )}
                      <text x={rcx} y={rcy - 8} textAnchor="middle" dominantBaseline="middle" fill={color.text} style={{ pointerEvents: "none", userSelect: "none" }}>
                        <tspan fontSize={20} fontWeight={800}>{table.number}</tspan>
                        <tspan fontSize={11} fontWeight={400} dx={5}>{table.seats} мест</tspan>
                      </text>
                      {first && (
                        <text x={rcx} y={rcy + 14} textAnchor="middle" dominantBaseline="middle" fontSize={11} fontWeight={700} fill={color.text} style={{ pointerEvents: "none", userSelect: "none" }}>
                          {upcoming && !current && first.time_start ? `с ${first.time_start} · ` : ""}
                          {first.guest_name ?? "Бронь"}{tableBookings.length > 1 ? ` +${tableBookings.length - 1}` : ""}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>

            {activeTable && (
              <div className="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto rounded-xl border border-white/8 bg-[#1b1c20] p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Стол {activeTable.number} · {selectedDate}</h3>
                  <button
                    className="grid size-8 place-items-center rounded-xl border border-white/8 text-zinc-400 hover:bg-[#25272c]"
                    type="button"
                    onClick={() => setActiveTableId(null)}
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <label className="grid gap-1">
                  <span className="text-[11px] uppercase tracking-wide text-zinc-500">Мест за столом</span>
                  <input
                    className="h-9 rounded-xl border border-white/8 bg-[#111214] px-3 text-sm outline-none focus:border-zinc-400"
                    inputMode="numeric"
                    value={activeTable.seats}
                    onChange={(e) => {
                      const seats = Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1);
                      setTables((prev) => prev.map((t) => (t.id === activeTable.id ? { ...t, seats } : t)));
                      scheduleSave();
                    }}
                  />
                </label>

                <div className="space-y-2">
                  {activeTableBookings.length === 0 ? (
                    <p className="text-sm text-zinc-500">На эту дату броней нет</p>
                  ) : (
                    activeTableBookings.map((booking) => (
                      <div key={booking.id} className="flex items-start justify-between gap-2 rounded-xl border border-white/8 bg-[#111214] p-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{booking.guest_name ?? "Гость"}</p>
                          <p className="text-xs text-zinc-500">
                            {[booking.time_start && booking.time_end ? `${booking.time_start}–${booking.time_end}` : null, booking.comment || null]
                              .filter(Boolean)
                              .join(" · ") || "без деталей"}
                          </p>
                        </div>
                        <button
                          className="grid size-7 shrink-0 place-items-center rounded text-zinc-500 hover:bg-[#25272c] hover:text-rose-400"
                          type="button"
                          title="Удалить бронь"
                          onClick={() => removeBooking(booking)}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <div className="space-y-2 border-t border-white/8 pt-3">
                  <p className="text-[11px] uppercase tracking-wide text-zinc-500">Новая бронь</p>
                  <input
                    className="h-9 w-full rounded-xl border border-white/8 bg-[#111214] px-3 text-sm outline-none focus:border-zinc-400"
                    placeholder="Имя гостя"
                    list="tables-guests-list"
                    value={bookingDraft.guestName}
                    onChange={(e) => setBookingDraft((d) => ({ ...d, guestName: e.target.value }))}
                  />
                  <datalist id="tables-guests-list">
                    {guests.map((g) => (
                      <option key={g.id} value={g.name} />
                    ))}
                  </datalist>
                  <TimeRangeInput
                    start={bookingDraft.start}
                    end={bookingDraft.end}
                    onChange={(start, end) => setBookingDraft((d) => ({ ...d, start, end }))}
                    className="h-9 w-full rounded-xl border border-white/8 bg-[#111214] px-3 text-sm outline-none focus:border-zinc-400"
                  />
                  <input
                    className="h-9 w-full rounded-xl border border-white/8 bg-[#111214] px-3 text-sm outline-none focus:border-zinc-400"
                    placeholder="Комментарий"
                    value={bookingDraft.comment}
                    onChange={(e) => setBookingDraft((d) => ({ ...d, comment: e.target.value }))}
                  />
                  <button
                    className="h-9 w-full rounded-xl bg-zinc-100 text-sm font-medium text-zinc-950 hover:bg-white"
                    type="button"
                    onClick={submitBooking}
                  >
                    Добавить бронь
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      ) : (
        <div className="grid h-full min-h-0 gap-3 lg:grid-cols-[1fr_320px]">
          <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-white/8 bg-[#1b1c20] p-3">
            <div className="grid shrink-0 grid-cols-7 gap-1 pb-2 text-center text-xs uppercase tracking-wide text-zinc-500">
              {WEEKDAYS.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className="grid flex-1 auto-rows-fr grid-cols-7 gap-1">
              {calendarDays.map((day) => {
                const iso = isoDate(day);
                const items = itemsByDate.get(iso) ?? [];
                const inMonth = day.getMonth() === cursorMonth.getMonth();
                const isSelected = iso === selectedDate;
                const hasEvent = isEventDay(iso);
                return (
                  <div
                    key={iso}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedDate(iso)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedDate(iso);
                      }
                    }}
                    className={`flex cursor-pointer flex-col items-start gap-1 overflow-hidden rounded-xl border p-1.5 text-left transition ${
                      isSelected
                        ? "border-violet-400 bg-violet-500/15"
                        : hasEvent
                          ? "border-fuchsia-400 bg-fuchsia-500/15"
                          : inMonth
                            ? "border-white/8 bg-[#111214] hover:bg-[#17181b]"
                            : "border-white/5 bg-transparent opacity-40"
                    }`}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span className="text-xs font-medium">{day.getDate()}</span>
                      {activeMapId && tables.length > 0 && (
                        <button
                          type="button"
                          title="Добавить бронь"
                          className="grid size-4 shrink-0 place-items-center rounded-full text-zinc-500 hover:bg-white/10 hover:text-zinc-200"
                          onClick={(e) => {
                            e.stopPropagation();
                            openQuickBooking(iso);
                          }}
                        >
                          <Plus className="size-3" />
                        </button>
                      )}
                    </div>
                    <div className="flex w-full flex-col gap-0.5 overflow-hidden">
                      {items.slice(0, 2).map((item, i) => (
                        <span
                          key={i}
                          className={`truncate rounded px-1 py-0.5 text-[10px] ${
                            item.kind === "game" ? "bg-amber-500/20 text-amber-300" : "bg-emerald-500/20 text-emerald-300"
                          }`}
                        >
                          {item.time ? `${item.time} ` : ""}{item.label}
                        </span>
                      ))}
                      {items.length > 2 && <span className="text-[10px] text-zinc-500">+{items.length - 2}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-white/8 bg-[#1b1c20] p-4">
            <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
              <h3 className="min-w-0 truncate font-semibold">{selectedDate}</h3>
              <div className="flex shrink-0 gap-2">
                {activeMapId && tables.length > 0 && (
                  <button
                    className="flex items-center gap-1.5 rounded-xl border border-white/8 px-3 py-1.5 text-xs text-zinc-300 hover:bg-[#25272c]"
                    type="button"
                    onClick={() => openQuickBooking(selectedDate)}
                  >
                    <Plus className="size-3.5" />
                    Бронь
                  </button>
                )}
                <button
                  className="rounded-xl border border-white/8 px-3 py-1.5 text-xs text-zinc-300 hover:bg-[#25272c]"
                  type="button"
                  onClick={() => setView("map")}
                >
                  Открыть карту
                </button>
              </div>
            </div>
            {selectedDayItems.length === 0 ? (
              <p className="text-sm text-zinc-500">На этот день ничего не запланировано</p>
            ) : (
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
                {selectedDayItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-xl border border-white/8 bg-[#111214] p-3 text-sm">
                    <span className="w-12 shrink-0 text-zinc-500">{item.time || "—"}</span>
                    <span
                      className={`size-1.5 shrink-0 rounded-full ${item.kind === "game" ? "bg-amber-400" : "bg-emerald-400"}`}
                    />
                    <span className="truncate">{item.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {quickBookingDate && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={() => setQuickBookingDate(null)}>
          <div
            className="w-full max-w-sm space-y-3 rounded-xl border border-white/10 bg-[#1b1c20] p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Новая бронь · {quickBookingDate}</h3>
              <button
                className="grid size-8 place-items-center rounded-lg text-zinc-500 hover:bg-[#25272c]"
                type="button"
                onClick={() => setQuickBookingDate(null)}
              >
                <X className="size-4" />
              </button>
            </div>
            <select
              className="h-10 w-full rounded-xl border border-white/8 bg-[#111214] px-3 text-sm outline-none focus:border-zinc-400"
              value={quickBookingDraft.tableId}
              onChange={(e) => setQuickBookingDraft((d) => ({ ...d, tableId: e.target.value }))}
            >
              {tables.map((t) => (
                <option key={t.id} value={t.id}>
                  Стол {t.number} · {t.seats} мест
                </option>
              ))}
            </select>
            <input
              className="h-10 w-full rounded-xl border border-white/8 bg-[#111214] px-3 text-sm outline-none focus:border-zinc-400"
              placeholder="Имя гостя"
              list="tables-guests-list"
              value={quickBookingDraft.guestName}
              onChange={(e) => setQuickBookingDraft((d) => ({ ...d, guestName: e.target.value }))}
            />
            <TimeRangeInput
              start={quickBookingDraft.start}
              end={quickBookingDraft.end}
              onChange={(start, end) => setQuickBookingDraft((d) => ({ ...d, start, end }))}
              className="h-10 w-full rounded-xl border border-white/8 bg-[#111214] px-3 text-sm outline-none focus:border-zinc-400"
            />
            <input
              className="h-10 w-full rounded-xl border border-white/8 bg-[#111214] px-3 text-sm outline-none focus:border-zinc-400"
              placeholder="Комментарий"
              value={quickBookingDraft.comment}
              onChange={(e) => setQuickBookingDraft((d) => ({ ...d, comment: e.target.value }))}
            />
            <button
              className="h-10 w-full rounded-xl bg-zinc-100 text-sm font-medium text-zinc-950 hover:bg-white"
              type="button"
              onClick={submitQuickBooking}
            >
              Добавить бронь
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
