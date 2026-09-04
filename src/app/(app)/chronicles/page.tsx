"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { SceneCover } from "@/components/SceneCover";
import { useSession } from "@/components/SessionContext";
import {
  apiAchievements,
  apiChronicles,
  type ApiAchievement,
  type ApiChronicle,
} from "@/lib/api";

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });

export default function ChroniclesPage() {
  const { user, loaded } = useSession();
  const [tab, setTab] = useState<"adventures" | "achievements">("adventures");
  const [chronicles, setChronicles] = useState<ApiChronicle[]>([]);
  const [achievements, setAchievements] = useState<ApiAchievement[]>([]);

  useEffect(() => {
    if (!user) return;
    apiChronicles().then(setChronicles);
    apiAchievements().then(setAchievements);
  }, [user]);

  if (loaded && !user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="mb-4 text-sm tavern-soft">Хроники доступны после входа.</p>
        <Link href="/login" className="btn-gold">
          Войти
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6 sm:py-6">
      <h1 className="mb-4 text-2xl font-bold text-[#ece3d2]">Хроники</h1>

      <div className="mb-4 inline-flex rounded-xl border border-[#33291c] bg-[#16110d] p-1">
        {(
          [
            ["adventures", "Приключения"],
            ["achievements", "Достижения"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-lg px-4 py-1.5 text-sm font-bold transition ${
              tab === key ? "bg-[#d3a24a]/15 text-[#f0c674]" : "tavern-soft hover:text-[#ece3d2]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "adventures" &&
        (chronicles.length === 0 ? (
          <p className="parchment p-8 text-center text-sm tavern-soft">
            Хроник пока нет — они появятся после первой игры.
          </p>
        ) : (
          <ul className="space-y-4">
            {chronicles.map((c) => (
              <li key={c.id} className="parchment overflow-hidden">
                <SceneCover as="div" text={c.title} seed={c.id} className="relative flex h-36 items-end p-4 sm:h-44">
                  <div className="relative">
                    <h2 className="text-lg font-bold text-[#ece3d2]">{c.title}</h2>
                    <p className="text-xs tavern-soft">
                      {new Date(c.date).toLocaleDateString("ru-RU", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <span className="absolute right-4 top-4">
                    {c.status === "in_progress" ? (
                      <span className="chip chip-blue">В процессе</span>
                    ) : (
                      <span className="chip chip-green">Завершено</span>
                    )}
                  </span>
                </SceneCover>

                {/* Лента событий: слева дата, справа запись, между ними линия времени */}
                <ol className="p-4">
                  {c.entries.map((e, i) => (
                    <li key={`${e.date}-${i}`} className="flex gap-3">
                      <span className="w-16 shrink-0 pt-2 text-right text-[11px] tavern-soft">
                        {shortDate(e.date)}
                      </span>
                      <span className="relative flex flex-col items-center">
                        <span className="size-2 shrink-0 translate-y-2.5 rounded-full bg-[#d3a24a]" />
                        {i < c.entries.length - 1 && <span className="w-px flex-1 bg-[#33291c]" />}
                      </span>
                      <span className="flex-1 py-1.5 text-sm text-[#ece3d2]">{e.text}</span>
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ul>
        ))}

      {tab === "achievements" &&
        (achievements.length === 0 ? (
          <p className="parchment p-8 text-center text-sm tavern-soft">
            Достижений пока нет — всё впереди.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {achievements.map((a) => (
              <li
                key={a.id}
                className={`parchment flex items-start gap-3 p-3 ${a.earned_at ? "" : "opacity-55"}`}
              >
                <span className="card-2 grid size-12 shrink-0 place-items-center text-xl">{a.icon}</span>
                <span className="min-w-0">
                  <span className="block font-bold text-[#ece3d2]">{a.title}</span>
                  <span className="block text-xs tavern-soft">{a.description}</span>
                  <span className="mt-1 block text-[10px] tavern-soft">
                    {a.earned_at ? `Получено ${shortDate(a.earned_at)}` : "Ещё не получено"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ))}

      <p className="mt-4 text-xs tavern-soft">
        Раздел работает на моках контракта: бэку остаётся реализовать
        <code className="mx-1 rounded bg-white/5 px-1">/api/chronicles</code>и
        <code className="mx-1 rounded bg-white/5 px-1">/api/achievements</code>.
      </p>
    </div>
  );
}
