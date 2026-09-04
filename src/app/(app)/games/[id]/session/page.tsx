"use client";

import { ArrowLeft, Dices, Map, Moon, Pause, Play, Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useSession } from "@/components/SessionContext";
import { apiGame, apiGameSession, type ApiGame, type ApiGameSession } from "@/lib/api";

const TABS = ["Обзор", "События", "Заметки", "Участники"] as const;

const QUICK_ACTIONS = [
  { icon: Dices, label: "Бросок инициативы" },
  { icon: Sparkles, label: "Бросок навыка" },
  { icon: Map, label: "Карта локации" },
  { icon: Moon, label: "Короткий отдых" },
];

/** 03:12:45 — часы за столом всегда крупно. */
function clock(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

export default function GameSessionPage() {
  const params = useParams<{ id: string }>();
  const gameId = params.id;
  const { user } = useSession();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Обзор");
  const [game, setGame] = useState<ApiGame | null>(null);
  const [state, setState] = useState<ApiGameSession | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    apiGame(gameId).then(setGame);
    apiGameSession(gameId).then((s) => {
      setState(s);
      setElapsed(s?.elapsed_seconds ?? 0);
      setRunning(s?.running ?? false);
    });
  }, [gameId]);

  // таймер крутится на клиенте: бэка под сессию нет, сохранять пока нечего
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setElapsed((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  const addNote = () => {
    const text = draft.trim();
    if (!text || !state) return;
    setState({
      ...state,
      notes: [
        { id: `local-${Date.now()}`, text, created_at: new Date().toISOString() },
        ...state.notes,
      ],
    });
    setDraft("");
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6 sm:py-6">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/games" className="btn-brown px-2 py-1.5" aria-label="К расписанию">
          <ArrowLeft className="size-4" />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-xl font-bold text-[#ece3d2]">
          {game?.title ?? "Игра"}
        </h1>
        <span className="chip chip-ghost">за столом</span>
      </div>

      <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-[#33291c] bg-[#16110d] p-1">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`shrink-0 rounded-lg px-3.5 py-1.5 text-sm font-bold transition ${
              tab === t ? "bg-[#d3a24a]/15 text-[#f0c674]" : "tavern-soft hover:text-[#ece3d2]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Обзор" && (
        <div className="space-y-4">
          <section className="parchment flex items-center justify-between gap-4 p-5">
            <div>
              <p className="tavern-label mb-1">Время игры</p>
              <p className="font-mono text-3xl font-bold tracking-wider text-[#f0c674] sm:text-4xl">
                {clock(elapsed)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setRunning((v) => !v)}
              className="grid size-14 shrink-0 place-items-center rounded-full border border-[#d3a24a]/50 bg-[#d3a24a]/12 text-[#f0c674]"
              aria-label={running ? "Пауза" : "Продолжить"}
            >
              {running ? <Pause className="size-6" /> : <Play className="size-6" />}
            </button>
          </section>

          <section className="parchment p-4">
            <h2 className="section-title mb-3">Состояния игроков</h2>
            {!state || state.participants.length === 0 ? (
              <p className="text-sm tavern-soft">Пока никого за столом</p>
            ) : (
              <ul className="space-y-2.5">
                {state.participants.map((p) => (
                  <li key={p.name} className="flex items-center gap-3">
                    <span className="card-2 grid size-8 shrink-0 place-items-center text-sm">
                      {p.is_master ? "🎩" : "🗡️"}
                    </span>
                    <span className="w-28 shrink-0 truncate text-sm text-[#ece3d2]">{p.name}</span>
                    <span className={`meter flex-1 ${p.is_master ? "" : "meter-green"}`}>
                      <span
                        style={{ width: `${p.hp_max ? (p.hp / p.hp_max) * 100 : 100}%` }}
                      />
                    </span>
                    <span className="w-16 shrink-0 text-right text-xs tavern-soft">
                      {p.is_master ? "мастер" : `${p.hp} / ${p.hp_max}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="parchment p-4">
            <h2 className="section-title mb-3">Быстрые действия</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {QUICK_ACTIONS.map(({ icon: Icon, label }) => (
                <button
                  key={label}
                  type="button"
                  className="card-2 flex flex-col items-center gap-1.5 p-3 text-center text-[11px] text-[#cfc2ab] transition hover:border-[#d3a24a]/40"
                >
                  <Icon className="size-5 tavern-gold" />
                  {label}
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      {(tab === "Заметки" || tab === "Обзор") && (
        <section className="parchment mt-4 p-4">
          <h2 className="section-title mb-3">Быстрые заметки</h2>
          <div className="mb-3 flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addNote()}
              placeholder="Что случилось за столом?"
              className="tavern-input"
            />
            <button type="button" onClick={addNote} className="btn-gold shrink-0 px-3">
              <Plus className="size-4" />
            </button>
          </div>
          {!state || state.notes.length === 0 ? (
            <p className="text-sm tavern-soft">Заметок пока нет</p>
          ) : (
            <ul className="space-y-2">
              {state.notes.map((n) => (
                <li key={n.id} className="card-2 p-3">
                  <p className="text-sm text-[#ece3d2]">{n.text}</p>
                  <p className="mt-1 text-[10px] tavern-soft">
                    {new Date(n.created_at).toLocaleString("ru-RU", {
                      day: "numeric",
                      month: "long",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === "События" && (
        <section className="parchment p-8 text-center text-sm tavern-soft">
          Журнал событий появится вместе с бэком сессии.
        </section>
      )}

      {tab === "Участники" && (
        <section className="parchment p-4">
          <h2 className="section-title mb-3">За столом</h2>
          <ul className="divide-y divide-[#262018]">
            {(state?.participants ?? []).map((p) => (
              <li key={p.name} className="flex items-center justify-between py-2.5 text-sm">
                <span className="text-[#ece3d2]">{p.name}</span>
                <span className="chip chip-ghost">{p.is_master ? "мастер" : "игрок"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-4 text-xs tavern-soft">
        Экран сессии живёт на моке <code className="mx-1 rounded bg-white/5 px-1">/api/games/{"{id}"}/session</code>:
        таймер и заметки не сохраняются между заходами{user ? "" : ", а гостю доступен только просмотр"}.
      </p>
    </div>
  );
}
