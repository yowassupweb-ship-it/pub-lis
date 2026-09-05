"use client";

import { ChevronLeft, ChevronRight, PartyPopper, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { apiCreateEvent, apiDeleteEvent, apiEvents, type ApiEvent } from "@/lib/api";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MONTHS = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

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

export default function EventsSection() {
  const [events, setEvents] = useState<ApiEvent[]>([]);
  const [cursor, setCursor] = useState(() => isoDate(new Date()));
  const [name, setName] = useState("");
  const [participants, setParticipants] = useState("");
  const [dateFrom, setDateFrom] = useState(() => isoDate(new Date()));
  const [dateTo, setDateTo] = useState(() => isoDate(new Date()));
  const [timeFrom, setTimeFrom] = useState("15:00");
  const [timeTo, setTimeTo] = useState("23:00");
  const [error, setError] = useState<string | null>(null);

  const cursorMonth = new Date(`${cursor}T12:00:00`);

  const monthRange = useMemo(() => {
    const from = new Date(cursorMonth.getFullYear(), cursorMonth.getMonth() - 1, 1);
    const to = new Date(cursorMonth.getFullYear(), cursorMonth.getMonth() + 2, 0);
    return { from: isoDate(from), to: isoDate(to) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor]);

  const loadEvents = () => {
    apiEvents(monthRange.from, monthRange.to).then((list) => setEvents(list ?? []));
  };

  useEffect(loadEvents, [monthRange.from, monthRange.to]);

  const calendarDays = useMemo(() => {
    const first = new Date(cursorMonth.getFullYear(), cursorMonth.getMonth(), 1);
    const firstWeekday = (first.getDay() + 6) % 7;
    const start = addDays(first, -firstWeekday);
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor]);

  const eventsForDay = (iso: string) => events.filter((e) => e.date_from <= iso && iso <= e.date_to);

  const createEvent = async () => {
    const trimmed = name.trim();
    const count = Number(participants);
    if (!trimmed) {
      setError("Укажите название мероприятия");
      return;
    }
    if (!Number.isFinite(count) || count < 0) {
      setError("Укажите количество участников");
      return;
    }
    if (dateTo < dateFrom) {
      setError("Дата окончания раньше даты начала");
      return;
    }
    if (!timeFrom || !timeTo) {
      setError("Укажите часы мероприятия");
      return;
    }
    const { data, error: apiError } = await apiCreateEvent({
      name: trimmed,
      participants_count: count,
      date_from: dateFrom,
      date_to: dateTo,
      time_from: timeFrom,
      time_to: timeTo,
    });
    if (apiError || !data) {
      setError(apiError ?? "Не удалось создать мероприятие");
      return;
    }
    setError(null);
    setName("");
    setParticipants("");
    loadEvents();
  };

  const removeEvent = async (event: ApiEvent) => {
    if (!window.confirm(`Удалить мероприятие «${event.name}»?`)) return;
    const { error: apiError } = await apiDeleteEvent(event.id);
    if (!apiError) setEvents((prev) => prev.filter((e) => e.id !== event.id));
  };

  const selectDay = (iso: string) => {
    setDateFrom(iso);
    setDateTo(iso);
  };

  return (
    <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[1fr_360px]">
      <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-white/8 bg-[#1b1c20] p-3">
        <div className="mb-2 flex shrink-0 items-center justify-between">
          <button
            className="grid size-8 place-items-center rounded-lg text-zinc-400 hover:bg-[#25272c]"
            type="button"
            onClick={() => setCursor(isoDate(new Date(cursorMonth.getFullYear(), cursorMonth.getMonth() - 1, 1)))}
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="text-sm font-medium">
            {MONTHS[cursorMonth.getMonth()]} {cursorMonth.getFullYear()}
          </span>
          <button
            className="grid size-8 place-items-center rounded-lg text-zinc-400 hover:bg-[#25272c]"
            type="button"
            onClick={() => setCursor(isoDate(new Date(cursorMonth.getFullYear(), cursorMonth.getMonth() + 1, 1)))}
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
        <div className="grid shrink-0 grid-cols-7 gap-1 pb-2 text-center text-xs uppercase tracking-wide text-zinc-500">
          {WEEKDAYS.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="grid flex-1 auto-rows-fr grid-cols-7 gap-1">
          {calendarDays.map((day) => {
            const iso = isoDate(day);
            const dayEvents = eventsForDay(iso);
            const inMonth = day.getMonth() === cursorMonth.getMonth();
            const hasEvent = dayEvents.length > 0;
            const isSelected = iso === dateFrom && iso === dateTo;
            return (
              <button
                key={iso}
                type="button"
                onClick={() => selectDay(iso)}
                className={`flex flex-col items-start gap-1 overflow-hidden rounded-xl border p-1.5 text-left transition ${
                  isSelected
                    ? "border-violet-400 bg-violet-500/15"
                    : hasEvent
                      ? "border-fuchsia-400 bg-fuchsia-500/20"
                      : inMonth
                        ? "border-white/8 bg-[#111214] hover:bg-[#17181b]"
                        : "border-white/5 bg-transparent opacity-40"
                }`}
              >
                <span className="text-xs font-medium">{day.getDate()}</span>
                {dayEvents.map((e) => (
                  <span key={e.id} className="truncate text-[10px] text-fuchsia-200">
                    {e.name}
                  </span>
                ))}
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto">
        <div className="rounded-xl border border-white/8 bg-[#1b1c20] p-4">
          <h3 className="mb-3 font-semibold">Новое мероприятие</h3>
          <div className="space-y-2">
            <input
              className="h-10 w-full rounded-xl border border-white/8 bg-[#111214] px-3 text-sm outline-none focus:border-zinc-400"
              placeholder="Название"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className="h-10 w-full rounded-xl border border-white/8 bg-[#111214] px-3 text-sm outline-none focus:border-zinc-400"
              placeholder="Количество участников"
              inputMode="numeric"
              value={participants}
              onChange={(e) => setParticipants(e.target.value.replace(/\D/g, ""))}
            />
            <div className="flex items-center gap-2">
              <input
                type="date"
                className="h-10 min-w-0 flex-1 rounded-xl border border-white/8 bg-[#111214] px-2 text-sm outline-none focus:border-zinc-400"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
              <span className="text-zinc-500">—</span>
              <input
                type="date"
                className="h-10 min-w-0 flex-1 rounded-xl border border-white/8 bg-[#111214] px-2 text-sm outline-none focus:border-zinc-400"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="time"
                className="h-10 min-w-0 flex-1 rounded-xl border border-white/8 bg-[#111214] px-2 text-sm outline-none focus:border-zinc-400"
                value={timeFrom}
                onChange={(e) => setTimeFrom(e.target.value)}
              />
              <span className="text-zinc-500">—</span>
              <input
                type="time"
                className="h-10 min-w-0 flex-1 rounded-xl border border-white/8 bg-[#111214] px-2 text-sm outline-none focus:border-zinc-400"
                value={timeTo}
                onChange={(e) => setTimeTo(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-rose-400">{error}</p>}
            <button
              className="h-10 w-full rounded-xl bg-zinc-100 text-sm font-medium text-zinc-950 hover:bg-white"
              type="button"
              onClick={createEvent}
            >
              Создать
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 rounded-xl border border-white/8 bg-[#1b1c20]">
          <div className="border-b border-white/8 p-4">
            <h3 className="font-semibold">Мероприятия</h3>
          </div>
          <div className="divide-y divide-white/8">
            {events.length === 0 ? (
              <div className="grid min-h-32 place-items-center text-zinc-600">
                <PartyPopper className="size-8" />
              </div>
            ) : (
              events.map((e) => (
                <div key={e.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{e.name}</p>
                    <p className="text-xs text-zinc-500">
                      {e.date_from === e.date_to ? e.date_from : `${e.date_from} — ${e.date_to}`}, {e.time_from}–{e.time_to} ·{" "}
                      {e.participants_count} чел.
                    </p>
                  </div>
                  <button
                    className="grid size-8 shrink-0 place-items-center rounded-xl text-zinc-500 hover:bg-[#25272c] hover:text-rose-400"
                    type="button"
                    onClick={() => removeEvent(e)}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
