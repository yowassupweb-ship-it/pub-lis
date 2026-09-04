"use client";

import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Plus,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { SceneCover } from "@/components/SceneCover";
import { useSession } from "@/components/SessionContext";
import {
  apiApproveBooking,
  apiApproveGame,
  apiBookSeat,
  apiCancelBooking,
  apiCreateGame,
  apiDeleteGame,
  apiGame,
  apiGameBookings,
  apiGames,
  apiRejectBooking,
  apiRejectGame,
  canManageGames,
  type ApiBooking,
  type ApiGame,
} from "@/lib/api";

// пн–чт 15:00–24:00, пт–вс 15:00–04:00. Час > 23 — уже после полуночи (27 = 03:00)
const OPEN_HOUR = 5;
const START_HOUR = 15;
const endHourFor = (dayIndex: number) => (dayIndex <= 3 ? 24 : 28); // 0 = понедельник
const ALL_HOURS = Array.from({ length: 28 - START_HOUR }, (_, i) => START_HOUR + i);

const DAY_NAMES = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function mondayOf(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

const formatHour = (hour: number) => `${String(hour % 24).padStart(2, "0")}:00`;

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

/** Конец игры словами: 18:00 + 4 ч = 22:00, за полночь считается корректно. */
function endTime(game: ApiGame): string {
  const end = new Date(new Date(game.starts_at).getTime() + game.duration_hours * 3_600_000);
  return end.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

/** Игровой день: всё, что началось до 05:00, относится к предыдущему вечеру. */
function gameDay(game: ApiGame): Date {
  const starts = new Date(game.starts_at);
  const day = new Date(starts);
  if (starts.getHours() < OPEN_HOUR) day.setDate(day.getDate() - 1);
  day.setHours(0, 0, 0, 0);
  return day;
}

function gameSlot(game: ApiGame, weekStart: Date): { day: number; hour: number } | null {
  const starts = new Date(game.starts_at);
  if (Number.isNaN(starts.getTime())) return null;
  let hour = starts.getHours();
  if (hour < OPEN_HOUR) hour += 24;
  const dayIndex = Math.round((gameDay(game).getTime() - weekStart.getTime()) / 86_400_000);
  if (dayIndex < 0 || dayIndex > 6) return null;
  return { day: dayIndex, hour };
}

export default function GamesPage() {
  const { user, loaded: authChecked } = useSession();
  const [view, setView] = useState<"calendar" | "grid">("calendar");
  const [month, setMonth] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [selectedDay, setSelectedDay] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [weekOffset, setWeekOffset] = useState(0);
  const [games, setGames] = useState<ApiGame[]>([]);
  const [selected, setSelected] = useState<ApiGame | null>(null);
  const [bookings, setBookings] = useState<ApiBooking[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    date: "",
    time: "19:00",
    duration_hours: 4,
    seats_total: 6,
  });
  const [notice, setNotice] = useState<string | null>(null);
  const [qrData, setQrData] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState<string | null>(null); // какая мутация выполняется

  // одна кнопка за раз: повторный клик по занятой кнопке ничего не шлёт
  const run = (key: string, fn: () => Promise<unknown>) => async () => {
    if (busy) return;
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  // закрываем только если mousedown и mouseup оба на подложке — иначе выделение
  // текста с уводом курсора за модалку её закрывало
  const mouseDownOnOverlay = useRef(false);
  const overlayProps = (close: () => void) => ({
    onMouseDown: (e: React.MouseEvent) => {
      mouseDownOnOverlay.current = e.target === e.currentTarget;
    },
    onClick: (e: React.MouseEvent) => {
      if (mouseDownOnOverlay.current && e.target === e.currentTarget) close();
    },
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setSelected(null);
      setCreateOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const weekStart = useMemo(() => addDays(mondayOf(new Date()), weekOffset * 7), [weekOffset]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  // календарь тянет месяц с запасом в неделю по краям — там видны хвосты соседних месяцев
  const range = useMemo(() => {
    if (view === "grid") return { from: weekStart, to: addDays(weekStart, 7) };
    const first = mondayOf(month);
    const last = addDays(mondayOf(addDays(new Date(month.getFullYear(), month.getMonth() + 1, 0), 1)), 7);
    return { from: first, to: last };
  }, [view, weekStart, month]);

  const reloadGames = () => {
    apiGames(isoDate(range.from), isoDate(range.to)).then((list) => setGames(list ?? []));
  };

  useEffect(reloadGames, [range.from, range.to, authChecked]);

  // несколько игр в одном часе — это разные столы, стакаем их в ячейке
  const grid = useMemo(() => {
    const map = new Map<string, Array<{ game: ApiGame; isStart: boolean }>>();
    for (const game of games) {
      const slot = gameSlot(game, weekStart);
      if (!slot) continue;
      for (let i = 0; i < Math.max(1, game.duration_hours); i += 1) {
        const key = `${slot.day}:${slot.hour + i}`;
        const list = map.get(key) ?? [];
        list.push({ game, isStart: i === 0 });
        map.set(key, list);
      }
    }
    return map;
  }, [games, weekStart]);

  // ключ — игровой день, значение — игры этого вечера по времени
  const byDay = useMemo(() => {
    const map = new Map<string, ApiGame[]>();
    for (const game of games) {
      const key = isoDate(gameDay(game));
      map.set(key, [...(map.get(key) ?? []), game]);
    }
    for (const list of map.values()) list.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    return map;
  }, [games]);

  // сетка месяца: всегда целые недели с понедельника
  const monthCells = useMemo(() => {
    const first = mondayOf(month);
    const cells: Date[] = [];
    for (let i = 0; i < 42; i += 1) {
      const d = addDays(first, i);
      cells.push(d);
      if (i >= 34 && d.getMonth() !== month.getMonth()) break;
    }
    return cells;
  }, [month]);

  const canManageGame = (game: ApiGame) =>
    !!user && (["manager", "admin"].includes(user.role) || game.master_id === user.id);

  const openGame = (game: ApiGame) => {
    setSelected(game);
    setBookings(null);
    setNotice(null);
    setQrData(null);
    setCopied(false);
    setConfirmDelete(false);
    if (user && canManageGame(game)) {
      apiGameBookings(game.id).then(setBookings);
      const link = `${window.location.origin}/g/${game.id}`;
      import("qrcode")
        .then((q) => q.toDataURL(link, { width: 480, margin: 1 }))
        .then(setQrData)
        .catch(() => setQrData(null));
    }
  };

  const gameLink = (game: ApiGame) => `${window.location.origin}/g/${game.id}`;

  const copyLink = (game: ApiGame) => {
    navigator.clipboard?.writeText(gameLink(game)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const patchGameInState = (updated: ApiGame | null) => {
    if (!updated) return;
    setGames((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
    setSelected((prev) => (prev && prev.id === updated.id ? updated : prev));
  };

  const submitCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy("create");
    const { data: created, error } = await apiCreateGame({
      title: form.title.trim(),
      description: form.description.trim(),
      starts_at: `${form.date}T${form.time}:00`,
      duration_hours: Number(form.duration_hours),
      seats_total: Number(form.seats_total),
    });
    setBusy(null);
    if (!created) {
      setNotice(error ?? "Не удалось создать заявку");
      return;
    }
    setCreateOpen(false);
    setForm({ title: "", description: "", date: "", time: "19:00", duration_hours: 4, seats_total: 6 });
    reloadGames();
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const cellStyle = (game: ApiGame) => {
    if (game.status === "rejected") return "bg-[#b23b2e]/25";
    if (game.status === "pending") return "bg-[#d98a2b]/25";
    if (game.my_booking_status === "approved") return "bg-[#4f8a3d]/25";
    if (game.my_booking_status === "pending") return "bg-[#3d6f8a]/25";
    if (game.seats_taken >= game.seats_total) return "bg-white/5";
    return "bg-[#d3a24a]/20 hover:bg-[#d3a24a]/35";
  };

  const cellNote = (game: ApiGame) => {
    if (game.status === "rejected") return "отклонена";
    if (game.status === "pending") return "ожидание";
    if (game.my_booking_status === "approved") return "вы записаны";
    if (game.my_booking_status === "pending") return "заявка у ГМа";
    if (game.my_booking_status === "rejected") return "заявка отклонена";
    if (game.seats_taken >= game.seats_total) return "мест нет";
    return `${game.seats_taken}/${game.seats_total}`;
  };

  const statusChip = (game: ApiGame) => {
    if (game.status === "rejected") return <span className="chip chip-red">Отклонена</span>;
    if (game.status === "pending") return <span className="chip chip-orange">Ожидание</span>;
    return <span className="chip chip-green">Подтверждено</span>;
  };

  /** Правая метка на карточке: что игроку делать с этой игрой. */
  const gameBadge = (game: ApiGame) => {
    if (game.status === "pending") return <span className="chip chip-orange">На согласовании</span>;
    if (game.status === "rejected") return <span className="chip chip-red">Отклонена</span>;
    if (game.my_booking_status === "approved") return <span className="chip chip-green">Вы за столом</span>;
    if (game.my_booking_status === "pending") return <span className="chip chip-blue">Заявка у ГМа</span>;
    if (game.seats_taken >= game.seats_total) return <span className="chip chip-ghost">Мест нет</span>;
    return <span className="chip chip-gold">Забронировать</span>;
  };

  const dayGames = byDay.get(isoDate(selectedDay)) ?? [];

  return (
    <>
      <section className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-6 sm:py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-[#ece3d2]">Бронирование</h1>
          <div className="flex items-center gap-2">
            {canManageGames(user) && (
              <button type="button" onClick={() => setCreateOpen(true)} className="btn-gold text-xs">
                <Plus className="size-3.5" /> Новая игра
              </button>
            )}
            <button
              type="button"
              onClick={() => setView((v) => (v === "calendar" ? "grid" : "calendar"))}
              className="btn-brown text-xs"
            >
              {view === "calendar" ? (
                <>
                  <LayoutGrid className="size-3.5" /> Сетка недели
                </>
              ) : (
                <>
                  <CalendarDays className="size-3.5" /> Календарь
                </>
              )}
            </button>
          </div>
        </div>

        {view === "calendar" ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:items-start">
            {/* Месяц */}
            <div className="parchment p-4">
              <div className="mb-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
                  className="btn-brown px-2 py-1"
                  aria-label="Предыдущий месяц"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <span className="text-sm font-bold capitalize text-[#ece3d2]">
                  {month.toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}
                </span>
                <button
                  type="button"
                  onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
                  className="btn-brown px-2 py-1"
                  aria-label="Следующий месяц"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1 text-center text-[11px] tavern-soft">
                {DAY_NAMES.map((d) => (
                  <span key={d} className="py-1">
                    {d}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {monthCells.map((d) => {
                  const inMonth = d.getMonth() === month.getMonth();
                  const chosen = d.getTime() === selectedDay.getTime();
                  const isToday = d.getTime() === today.getTime();
                  const count = (byDay.get(isoDate(d)) ?? []).length;
                  return (
                    <button
                      key={d.toISOString()}
                      type="button"
                      onClick={() => setSelectedDay(d)}
                      className={`relative aspect-square rounded-full text-sm transition ${
                        chosen
                          ? "bg-[#c8912f] font-bold text-[#241704]"
                          : inMonth
                            ? "text-[#ece3d2] hover:bg-white/5"
                            : "text-[#6d6152] hover:bg-white/5"
                      } ${isToday && !chosen ? "ring-1 ring-[#d3a24a]/60" : ""}`}
                    >
                      {d.getDate()}
                      {count > 0 && (
                        <span
                          className={`absolute inset-x-0 bottom-1 mx-auto size-1 rounded-full ${
                            chosen ? "bg-[#241704]" : "bg-[#d3a24a]"
                          }`}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-xs tavern-soft">
                Будни — с 15:00 до полуночи, в пятницу и выходные до 04:00. Точка под числом — в этот
                вечер есть игры.
              </p>
            </div>

            {/* День */}
            <div className="parchment p-4">
              <h2 className="section-title mb-3 capitalize">
                {selectedDay.toLocaleDateString("ru-RU", {
                  day: "numeric",
                  month: "long",
                  weekday: "long",
                })}
              </h2>
              {dayGames.length === 0 ? (
                <p className="py-8 text-center text-sm tavern-soft">
                  В этот вечер игр не запланировано
                </p>
              ) : (
                <ul className="space-y-2">
                  {dayGames.map((game) => (
                    <li key={game.id}>
                      <button
                        type="button"
                        onClick={() => openGame(game)}
                        className="card-2 flex w-full items-center gap-3 p-2.5 text-left transition hover:border-[#d3a24a]/40"
                      >
                        <SceneCover text={`${game.title} ${game.description}`} seed={game.id} className="size-16 shrink-0 rounded-lg" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-bold text-[#ece3d2]">{game.title}</span>
                          <span className="block text-xs tavern-soft">
                            {timeOf(game.starts_at)} – {endTime(game)} · Мастер: {game.master}
                          </span>
                          <span className="mt-0.5 flex items-center gap-1 text-xs tavern-soft">
                            <Users className="size-3" />
                            {game.seats_taken} / {game.seats_total} игроков
                          </span>
                        </span>
                        <span className="shrink-0">{gameBadge(game)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <div className="parchment p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setWeekOffset((w) => w - 1)}
                className="btn-brown px-2 py-1"
                aria-label="Предыдущая неделя"
              >
                <ChevronLeft className="size-4" />
              </button>
              <span className="text-center text-xs font-bold text-[#ece3d2] sm:text-sm">
                {days[0].toLocaleDateString("ru-RU", { day: "numeric", month: "short" })} —{" "}
                {days[6].toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
              </span>
              <button
                type="button"
                onClick={() => setWeekOffset((w) => w + 1)}
                className="btn-brown px-2 py-1"
                aria-label="Следующая неделя"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>

            <div className="overflow-x-auto rounded-lg border border-[#33291c]">
              <table className="w-full min-w-[560px] border-collapse text-[11px]">
                <thead>
                  <tr className="bg-white/[0.03]">
                    <th className="w-14 border-b border-[#33291c] p-2 tavern-soft">Час</th>
                    {days.map((day, i) => (
                      <th
                        key={i}
                        className={`border-b border-l border-[#262018] p-2 text-center font-bold ${
                          day.getTime() === today.getTime() ? "tavern-gold" : "text-[#ece3d2]"
                        }`}
                      >
                        {DAY_NAMES[i]}{" "}
                        <span className="font-normal tavern-soft">
                          {day.toLocaleDateString("ru-RU", { day: "numeric", month: "numeric" })}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ALL_HOURS.map((hour) => (
                    <tr key={hour}>
                      <td className="border-t border-[#262018] p-1.5 text-center tavern-soft">
                        {formatHour(hour)}
                      </td>
                      {days.map((_, dayIndex) => {
                        if (hour >= endHourFor(dayIndex)) {
                          return (
                            <td
                              key={dayIndex}
                              className="border-l border-t border-[#262018] bg-black/30 p-0"
                            />
                          );
                        }
                        const cellGames = grid.get(`${dayIndex}:${hour}`);
                        if (!cellGames?.length) {
                          return (
                            <td key={dayIndex} className="h-9 border-l border-t border-[#262018] p-0" />
                          );
                        }
                        const anyStart = cellGames.some((c) => c.isStart);
                        return (
                          <td
                            key={dayIndex}
                            className={`h-9 border-l border-[#262018] p-0 ${
                              anyStart ? "border-t" : "border-t border-t-transparent"
                            }`}
                          >
                            <div className="flex h-full gap-px">
                              {cellGames.map(({ game, isStart }) => (
                                <div
                                  key={game.id}
                                  role="button"
                                  onClick={() => openGame(game)}
                                  className={`min-w-0 flex-1 cursor-pointer overflow-hidden px-1.5 py-0.5 ${cellStyle(game)}`}
                                  title={`${game.title} — ${game.master} (${cellNote(game)})`}
                                >
                                  {isStart && (
                                    <>
                                      <p className="truncate text-[11px] font-bold leading-tight text-[#ece3d2]">
                                        {game.title}
                                      </p>
                                      <p className="truncate text-[10px] leading-tight tavern-soft">
                                        {game.master} · {cellNote(game)}
                                      </p>
                                    </>
                                  )}
                                </div>
                              ))}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs tavern-soft">
              Клик по игре — подробности и запись; заявка игрока попадает на одобрение гейм-мастеру.
            </p>
          </div>
        )}
      </section>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-4"
          {...overlayProps(() => setSelected(null))}
        >
          <div className="parchment max-h-[92vh] w-full max-w-md overflow-y-auto p-4 sm:p-5">
            <div className="mb-1 flex items-start justify-between gap-3">
              <h3 className="text-lg font-bold text-[#ece3d2]">{selected.title}</h3>
              <button type="button" onClick={() => setSelected(null)} className="tavern-soft hover:text-[#ece3d2]">
                <X className="size-4" />
              </button>
            </div>
            <p className="text-xs tavern-soft">
              {new Date(selected.starts_at).toLocaleString("ru-RU", {
                weekday: "long",
                day: "numeric",
                month: "long",
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              · {selected.duration_hours} ч · ГМ: {selected.master}
            </p>
            {selected.description && <p className="mt-3 text-sm text-[#ece3d2]">{selected.description}</p>}
            <p className="mt-3 flex items-center gap-2 text-sm tavern-soft">
              За столом: <b className="text-[#ece3d2]">{selected.seats_taken}/{selected.seats_total}</b>
              {statusChip(selected)}
            </p>

            {notice && <p className="mt-3 text-sm font-bold text-[#e79b8f]">{notice}</p>}

            {user &&
              !canManageGame(selected) &&
              selected.status === "approved" &&
              new Date(selected.starts_at) > new Date() && (
                <div className="mt-4">
                  {selected.my_booking_status === null &&
                    (selected.seats_taken < selected.seats_total ? (
                      <button
                        type="button"
                        onClick={run("book", async () => {
                          const { data: updated, error } = await apiBookSeat(selected.id);
                          if (updated) patchGameInState(updated);
                          else setNotice(error ?? "Не удалось подать заявку");
                        })}
                        disabled={busy === "book"}
                        className="btn-gold w-full"
                      >
                        {busy === "book" ? "Секунду…" : "Подать заявку на место"}
                      </button>
                    ) : (
                      <p className="text-sm tavern-soft">Мест не осталось</p>
                    ))}
                  {selected.my_booking_status === "pending" && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="chip chip-blue">Заявка у ГМа</span>
                      <button
                        type="button"
                        onClick={run("cancel", async () => patchGameInState(await apiCancelBooking(selected.id)))}
                        disabled={busy === "cancel"}
                        className="btn-brown text-xs"
                      >
                        Отозвать
                      </button>
                    </div>
                  )}
                  {selected.my_booking_status === "approved" && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="chip chip-green">Вы записаны</span>
                      <button
                        type="button"
                        onClick={run("cancel", async () => patchGameInState(await apiCancelBooking(selected.id)))}
                        disabled={busy === "cancel"}
                        className="btn-brown text-xs"
                      >
                        Отменить запись
                      </button>
                    </div>
                  )}
                  {selected.my_booking_status === "rejected" && (
                    <span className="chip chip-red">Заявку отклонил гейм-мастер</span>
                  )}
                </div>
              )}
            {!user && authChecked && selected.status === "approved" && (
              <a href="/login" className="btn-gold mt-4 w-full">
                Войдите, чтобы записаться
              </a>
            )}

            {/* отклонённую игру можно вернуть */}
            {user?.role === "admin" &&
              (selected.status === "pending" || selected.status === "rejected") && (
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={run("approveGame", async () => {
                      patchGameInState(await apiApproveGame(selected.id));
                      reloadGames();
                    })}
                    disabled={busy === "approveGame"}
                    className="btn-gold flex-1"
                  >
                    <Check className="size-4" />
                    {selected.status === "rejected" ? "Вернуть и подтвердить" : "Подтвердить игру"}
                  </button>
                  {selected.status === "pending" && (
                    <button
                      type="button"
                      onClick={run("rejectGame", async () => {
                        patchGameInState(await apiRejectGame(selected.id));
                        reloadGames();
                      })}
                      disabled={busy === "rejectGame"}
                      className="btn-danger flex-1"
                    >
                      <X className="size-4" /> Отклонить
                    </button>
                  )}
                </div>
              )}

            {user?.role === "admin" && (
              <div className="mt-4 border-t border-[#262018] pt-3">
                {!confirmDelete ? (
                  <button type="button" onClick={() => setConfirmDelete(true)} className="btn-danger text-xs">
                    Удалить игру
                  </button>
                ) : (
                  <div className="rounded-lg border border-[#b23b2e]/50 bg-[#b23b2e]/10 p-3">
                    <p className="text-sm font-bold text-[#e79b8f]">
                      Точно удалить «{selected.title}»? Игра и все заявки игроков пропадут безвозвратно.
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={run("delete", async () => {
                          await apiDeleteGame(selected.id);
                          setSelected(null);
                          reloadGames();
                        })}
                        disabled={busy === "delete"}
                        className="btn-danger text-xs"
                      >
                        Да, удалить
                      </button>
                      <button type="button" onClick={() => setConfirmDelete(false)} className="btn-brown text-xs">
                        Отмена
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {user && canManageGame(selected) && (
              <a href={`/games/${selected.id}/session`} className="btn-brown mt-4 w-full text-sm">
                Экран за столом
              </a>
            )}

            {user && canManageGame(selected) && (
              <div className="mt-4 border-t border-[#262018] pt-3">
                <span className="tavern-label">Ссылка на запись</span>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={gameLink(selected)}
                    onFocus={(e) => e.target.select()}
                    className="tavern-input py-1.5 text-xs"
                  />
                  <button type="button" onClick={() => copyLink(selected)} className="btn-brown shrink-0 text-xs">
                    {copied ? "Скопировано" : "Копировать"}
                  </button>
                </div>
                {qrData && (
                  <div className="mt-3 flex justify-center rounded-lg border border-[#33291c] bg-white p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrData} alt="QR для записи на игру" className="h-44 w-44" />
                  </div>
                )}
              </div>
            )}

            {user && canManageGame(selected) && (
              <div className="mt-4 border-t border-[#262018] pt-3">
                <span className="tavern-label">Заявки игроков</span>
                {bookings === null && <p className="text-sm tavern-soft">Загрузка…</p>}
                {bookings !== null && bookings.length === 0 && (
                  <p className="text-sm tavern-soft">Пока никто не записался</p>
                )}
                {bookings?.map((b) => (
                  <div key={b.id} className="flex items-center justify-between gap-2 py-1.5">
                    <span className="min-w-0 text-sm">
                      <a
                        href={`/users/${b.user_id}`}
                        className="font-bold text-[#ece3d2] underline decoration-[#33291c] underline-offset-2 hover:text-[#f0c674]"
                        title="Профиль игрока"
                      >
                        {b.user_name}
                      </a>
                      {b.user_title && (
                        <span className="ml-1.5 text-xs italic tavern-gold">✦ {b.user_title}</span>
                      )}
                    </span>
                    {b.status === "pending" ? (
                      <span className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={run(`approve-${b.id}`, async () => {
                            const updated = await apiApproveBooking(selected.id, b.id);
                            if (!updated) {
                              setNotice("Не удалось одобрить заявку");
                              return;
                            }
                            setBookings((prev) => (prev ? prev.map((x) => (x.id === b.id ? updated : x)) : prev));
                            apiGame(selected.id).then(patchGameInState);
                            reloadGames();
                          })}
                          disabled={busy === `approve-${b.id}`}
                          className="btn-gold px-2 py-1 text-xs"
                        >
                          Одобрить
                        </button>
                        <button
                          type="button"
                          onClick={run(`reject-${b.id}`, async () => {
                            const updated = await apiRejectBooking(selected.id, b.id);
                            if (updated)
                              setBookings((prev) => (prev ? prev.map((x) => (x.id === b.id ? updated : x)) : prev));
                            apiGame(selected.id).then(patchGameInState);
                            reloadGames();
                          })}
                          disabled={busy === `reject-${b.id}`}
                          className="btn-danger px-2 py-1 text-xs"
                        >
                          Отклонить
                        </button>
                      </span>
                    ) : b.status === "approved" ? (
                      <span className="chip chip-green">за столом</span>
                    ) : (
                      <span className="chip chip-red">отклонена</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {createOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-4"
          {...overlayProps(() => setCreateOpen(false))}
        >
          <form
            onSubmit={submitCreate}
            className="parchment max-h-[92vh] w-full max-w-md space-y-3 overflow-y-auto p-4 sm:p-5"
          >
            <div className="flex items-start justify-between">
              <h3 className="text-lg font-bold text-[#ece3d2]">Забронировать игру</h3>
              <button type="button" onClick={() => setCreateOpen(false)} className="tavern-soft">
                <X className="size-4" />
              </button>
            </div>
            <p className="text-xs tavern-soft">
              {user?.role === "admin"
                ? "Игра будет опубликована сразу."
                : "Заявка уйдёт админу; после подтверждения игра появится в расписании и откроется запись."}
            </p>
            <input
              required
              placeholder="Название игры"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              maxLength={120}
              className="tavern-input"
            />
            <textarea
              placeholder="Описание (система, сюжет, для кого)"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              maxLength={2000}
              className="tavern-input"
            />
            <div className="flex gap-2">
              <input
                required
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="tavern-input"
              />
              <input
                required
                type="time"
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
                className="tavern-input"
              />
            </div>
            <div className="flex gap-2">
              <label className="flex-1">
                <span className="tavern-label">Длительность, ч</span>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={form.duration_hours}
                  onChange={(e) => setForm({ ...form, duration_hours: Number(e.target.value) })}
                  className="tavern-input"
                />
              </label>
              <label className="flex-1">
                <span className="tavern-label">Мест за столом</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={form.seats_total}
                  onChange={(e) => setForm({ ...form, seats_total: Number(e.target.value) })}
                  className="tavern-input"
                />
              </label>
            </div>
            {notice && <p className="text-sm font-bold text-[#e79b8f]">{notice}</p>}
            <button type="submit" disabled={busy === "create"} className="btn-gold w-full">
              {busy === "create" ? "Секунду…" : "Отправить заявку"}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
