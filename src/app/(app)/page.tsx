"use client";

import { Check, ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

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
  type ApiBooking,
  type ApiGame,
} from "@/lib/api";

// пн–чт 15:00–24:00, пт–вс 15:00–04:00. Час > 23 — после полуночи (27 = 03:00)
const OPEN_HOUR = 5;
const START_HOUR = 15;
const endHourFor = (dayIndex: number) => (dayIndex <= 3 ? 24 : 28); // 0 = понедельник
const ALL_HOURS = Array.from({ length: 28 - START_HOUR }, (_, i) => START_HOUR + i);

const DAY_NAMES = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const GAME_MANAGER_ROLES = ["gamemaster", "manager", "admin"];

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

function formatHour(hour: number): string {
  return `${String(hour % 24).padStart(2, "0")}:00`;
}

function gameSlot(game: ApiGame, weekStart: Date): { day: number; hour: number } | null {
  const starts = new Date(game.starts_at);
  if (Number.isNaN(starts.getTime())) return null;
  let day = new Date(starts);
  let hour = starts.getHours();
  if (hour < OPEN_HOUR) {
    day = addDays(day, -1);
    hour += 24;
  }
  day.setHours(0, 0, 0, 0);
  const dayIndex = Math.round((day.getTime() - weekStart.getTime()) / 86_400_000);
  if (dayIndex < 0 || dayIndex > 6) return null;
  return { day: dayIndex, hour };
}

export default function SchedulePage() {
  const { user, loaded: authChecked } = useSession();
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
  // закрываем только если mousedown и mouseup оба на подложке — иначе выделение текста
  // с уводом курсора за модалку её закрывало
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

  const reloadGames = () => {
    apiGames(isoDate(weekStart), isoDate(addDays(weekStart, 7))).then((list) =>
      setGames(list ?? [])
    );
  };

  useEffect(reloadGames, [weekStart, authChecked]); // eslint-disable-line react-hooks/exhaustive-deps

  // несколько игр в одном слоте — разные столы, стакаем
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
    const { data: created, error } = await apiCreateGame({
      title: form.title.trim(),
      description: form.description.trim(),
      starts_at: `${form.date}T${form.time}:00`,
      duration_hours: Number(form.duration_hours),
      seats_total: Number(form.seats_total),
    });
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
    if (game.status === "pending") return "bg-[#d98a2b]/30";
    if (game.my_booking_status === "approved") return "bg-[#4f8a3d]/30";
    if (game.my_booking_status === "pending") return "bg-[#3d6f8a]/25";
    if (game.seats_taken >= game.seats_total) return "bg-[#8a744f]/25";
    return "bg-[#e3a83e]/35 hover:bg-[#e3a83e]/55";
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

  return (
    <>

      <section className="px-2 py-4 sm:px-4 sm:py-6">
        <div className="parchment p-2 sm:p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="chip chip-gold">Расписание игр</span>
              {user && GAME_MANAGER_ROLES.includes(user.role) && (
                <button type="button" onClick={() => setCreateOpen(true)} className="btn-gold text-xs">
                  <Plus className="h-3.5 w-3.5" />
                  Забронировать игру
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setWeekOffset((w) => w - 1)}
                className="btn-brown px-2 py-1"
                aria-label="Предыдущая неделя"
              >
                <ChevronLeft className="size-4" />
              </button>
              <span className="min-w-32 text-center text-xs font-bold sm:min-w-40 sm:text-sm">
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
          </div>

          <div className="overflow-x-auto rounded-md border-2 border-[#8a744f]">
            {/* на телефоне колонка часов липкая, остальное скроллится */}
            <table className="w-full min-w-[560px] border-collapse text-[10px] sm:text-xs">
              <thead>
                <tr className="bg-[#e0cfa4]">
                  <th className="sticky left-0 z-10 w-12 border-b-2 border-[#8a744f] bg-[#e0cfa4] p-1.5 tavern-soft sm:w-14 sm:p-2">Час</th>
                  {days.map((day, i) => (
                    <th
                      key={i}
                      className={`border-b-2 border-l border-[#8a744f] p-2 text-center font-bold ${
                        day.getTime() === today.getTime() ? "text-[#8a4f1d]" : "tavern-ink"
                      }`}
                    >
                      {DAY_NAMES[i]}{" "}
                      <span className="tavern-soft font-normal">
                        {day.toLocaleDateString("ru-RU", { day: "numeric", month: "numeric" })}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ALL_HOURS.map((hour) => (
                  <tr key={hour}>
                    <td className="sticky left-0 z-10 border-t border-[#c9b58a] bg-[#f0e4c8] p-1.5 text-center tavern-soft sm:p-2">
                      {formatHour(hour)}
                    </td>
                    {days.map((_, dayIndex) => {
                      if (hour >= endHourFor(dayIndex)) {
                        return (
                          <td key={dayIndex} className="border-l border-t border-[#c9b58a] bg-[#8a744f]/30 p-0" />
                        );
                      }
                      const cellGames = grid.get(`${dayIndex}:${hour}`);
                      if (!cellGames?.length) {
                        return <td key={dayIndex} className="h-9 border-l border-t border-[#c9b58a] p-0" />;
                      }
                      const anyStart = cellGames.some((c) => c.isStart);
                      return (
                        <td
                          key={dayIndex}
                          className={`h-9 border-l border-[#c9b58a] p-0 ${
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
                                    <p className="truncate text-[11px] font-bold leading-tight tavern-ink">
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
            Будни — с 15:00 до полуночи, в пятницу и выходные — до 04:00. Клик по игре —
            подробности и запись; заявка игрока попадает на одобрение гейм-мастеру.
          </p>
        </div>
      </section>

      {selected && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-2 sm:p-4"
          {...overlayProps(() => setSelected(null))}
        >
          <div className="parchment max-h-[92vh] w-full max-w-md overflow-y-auto p-4 sm:p-5">
            <div className="mb-1 flex items-start justify-between gap-3">
              <h3 className="text-lg font-bold tavern-ink">{selected.title}</h3>
              <button type="button" onClick={() => setSelected(null)} className="tavern-soft hover:tavern-ink">
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
            {selected.description && <p className="mt-3 text-sm tavern-ink">{selected.description}</p>}
            <p className="mt-3 flex items-center gap-2 text-sm tavern-soft">
              За столом: <b className="tavern-ink">{selected.seats_taken}/{selected.seats_total}</b>
              {statusChip(selected)}
            </p>

            {notice && <p className="mt-3 text-sm font-bold text-[#8a3327]">{notice}</p>}

            {user &&
              !canManageGame(selected) &&
              selected.status === "approved" &&
              new Date(selected.starts_at) > new Date() && (
              <div className="mt-4">
                {selected.my_booking_status === null &&
                  (selected.seats_taken < selected.seats_total ? (
                    <button
                      type="button"
                      onClick={async () => {
                        const { data: updated, error } = await apiBookSeat(selected.id);
                        if (updated) patchGameInState(updated);
                        else setNotice(error ?? "Не удалось подать заявку");
                      }}
                      className="btn-gold w-full"
                    >
                      Подать заявку на место
                    </button>
                  ) : (
                    <p className="text-sm tavern-soft">Мест не осталось</p>
                  ))}
                {selected.my_booking_status === "pending" && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="chip chip-blue">Заявка у ГМа</span>
                    <button
                      type="button"
                      onClick={async () => patchGameInState(await apiCancelBooking(selected.id))}
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
                      onClick={async () => patchGameInState(await apiCancelBooking(selected.id))}
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

            {/* rejected можно вернуть */}
            {user?.role === "admin" &&
              (selected.status === "pending" || selected.status === "rejected") && (
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      patchGameInState(await apiApproveGame(selected.id));
                      reloadGames();
                    }}
                    className="btn-gold flex-1"
                  >
                    <Check className="size-4" />
                    {selected.status === "rejected" ? "Вернуть и подтвердить" : "Подтвердить игру"}
                  </button>
                  {selected.status === "pending" && (
                    <button
                      type="button"
                      onClick={async () => {
                        const updated = await apiRejectGame(selected.id);
                        patchGameInState(updated);
                        reloadGames();
                      }}
                      className="btn-danger flex-1"
                    >
                      <X className="size-4" /> Отклонить
                    </button>
                  )}
                </div>
              )}

            {user?.role === "admin" && (
              <div className="mt-4 border-t-2 border-[#c9b58a] pt-3">
                {!confirmDelete ? (
                  <button type="button" onClick={() => setConfirmDelete(true)} className="btn-danger text-xs">
                    Удалить игру
                  </button>
                ) : (
                  <div className="rounded-md border-2 border-[#8a3327] bg-[#b23b2e]/15 p-3">
                    <p className="text-sm font-bold text-[#6d251b]">
                      Точно удалить «{selected.title}»? Игра и все заявки игроков будут удалены безвозвратно.
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          await apiDeleteGame(selected.id);
                          setSelected(null);
                          reloadGames();
                        }}
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
              <div className="mt-4 border-t-2 border-[#c9b58a] pt-3">
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
                  <div className="mt-3 flex justify-center rounded-md border-2 border-[#8a744f] bg-white p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrData} alt="QR для записи на игру" className="h-44 w-44" />
                  </div>
                )}
              </div>
            )}

            {user && canManageGame(selected) && (
              <div className="mt-4 border-t-2 border-[#c9b58a] pt-3">
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
                        className="font-bold tavern-ink underline decoration-[#8a744f] underline-offset-2 hover:text-[#8a4f1d]"
                        title="Профиль игрока"
                      >
                        {b.user_name}
                      </a>
                      {b.user_title && (
                        <span className="ml-1.5 text-xs italic text-[#8a6216]">✦ {b.user_title}</span>
                      )}
                    </span>
                    {b.status === "pending" ? (
                      <span className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={async () => {
                            const updated = await apiApproveBooking(selected.id, b.id);
                            if (!updated) {
                              setNotice("Не удалось одобрить заявку");
                              return;
                            }
                            setBookings((prev) =>
                              prev ? prev.map((x) => (x.id === b.id ? updated : x)) : prev
                            );
                            apiGame(selected.id).then(patchGameInState);
                            reloadGames();
                          }}
                          className="btn-gold px-2 py-1 text-xs"
                        >
                          Одобрить
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            const updated = await apiRejectBooking(selected.id, b.id);
                            if (updated)
                              setBookings((prev) =>
                                prev ? prev.map((x) => (x.id === b.id ? updated : x)) : prev
                              );
                            apiGame(selected.id).then(patchGameInState);
                            reloadGames();
                          }}
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
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-2 sm:p-4"
          {...overlayProps(() => setCreateOpen(false))}
        >
          <form onSubmit={submitCreate} className="parchment max-h-[92vh] w-full max-w-md space-y-3 overflow-y-auto p-4 sm:p-5">
            <div className="flex items-start justify-between">
              <h3 className="text-lg font-bold tavern-ink">Забронировать игру</h3>
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
            {notice && <p className="text-sm font-bold text-[#8a3327]">{notice}</p>}
            <button type="submit" className="btn-gold w-full">
              Отправить заявку
            </button>
          </form>
        </div>
      )}
    </>
  );
}
