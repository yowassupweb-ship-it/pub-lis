"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useSession } from "@/components/SessionContext";
import { DEMO_CHARACTER, apiMyCharacter, type ApiCharacter } from "@/lib/api";

// Порядок как в листе персонажа D&D, подписи — сокращения из русского перевода
const STATS: Array<[keyof ApiCharacter["stats"], string]> = [
  ["str", "СИЛ"],
  ["dex", "ЛВК"],
  ["con", "ВЫН"],
  ["int", "ИНТ"],
  ["wis", "МДР"],
  ["cha", "ХАР"],
];

const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

export default function CharacterPage() {
  const { user, loaded } = useSession();
  const [character, setCharacter] = useState<ApiCharacter | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!user) return;
    // бэка под персонажа ещё нет: если мок не поднят, показываем пустую болванку
    apiMyCharacter().then((c) => {
      setCharacter(c ?? { ...DEMO_CHARACTER, name: user.name });
      setReady(true);
    });
  }, [user]);

  if (loaded && !user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="tavern-soft mb-4 text-sm">Лист персонажа доступен после входа.</p>
        <Link href="/login" className="btn-gold">
          Войти
        </Link>
      </div>
    );
  }

  if (!ready || !character) {
    return <p className="px-6 py-16 text-center text-sm tavern-soft">Разворачиваем свиток…</p>;
  }

  const xpPercent = character.xp_next
    ? Math.min(100, Math.round((character.xp / character.xp_next) * 100))
    : 100;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-5 sm:px-6 sm:py-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-[#ece3d2]">Мой персонаж</h1>
        <span className="chip chip-ghost">черновик · без бэка</span>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:items-start">
        {/* Портрет и опыт */}
        <section className="parchment p-4">
          <div className="flex items-center gap-3">
            <span className="poster grid size-20 shrink-0 place-items-center rounded-xl text-3xl">
              {character.portrait ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={character.portrait} alt="" className="h-full w-full rounded-xl object-cover" />
              ) : (
                "🧝"
              )}
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-xl font-bold text-[#ece3d2]">{character.name}</h2>
              <p className="text-xs tavern-soft">
                {character.race}-{character.klass.toLowerCase()} · Уровень {character.level}
              </p>
              <p className="mt-1 text-xs tavern-soft">
                Опыт: {character.xp} / {character.xp_next}
              </p>
              <div className="meter mt-1 w-40">
                <span style={{ width: `${xpPercent}%` }} />
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-6 gap-1 text-center">
            {STATS.map(([key, label]) => (
              <div key={key} className="card-2 py-2">
                <p className="text-[10px] tavern-soft">{label}</p>
                <p className="text-base font-bold text-[#ece3d2]">{character.stats[key]}</p>
              </div>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div className="card-2 p-2.5">
              <p className="text-[10px] tavern-soft">Класс</p>
              <p className="font-bold text-[#ece3d2]">{character.klass}</p>
            </div>
            <div className="card-2 p-2.5">
              <p className="text-[10px] tavern-soft">Мировоззрение</p>
              <p className="font-bold text-[#ece3d2]">{character.alignment}</p>
            </div>
            <div className="card-2 p-2.5">
              <p className="text-[10px] tavern-soft">Предыстория</p>
              <p className="font-bold text-[#ece3d2]">{character.subclass}</p>
            </div>
            <div className="card-2 p-2.5">
              <p className="text-[10px] tavern-soft">Уровень</p>
              <p className="font-bold text-[#ece3d2]">{character.level}</p>
            </div>
          </div>

          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <div className="card-2 p-2.5">
              <p className="text-[10px] tavern-soft">Хиты</p>
              <p className="font-bold text-[#ece3d2]">
                {character.hp} <span className="tavern-soft">/ {character.hp_max}</span>
              </p>
              <div className="meter meter-red mt-1">
                <span
                  style={{
                    width: `${character.hp_max ? (character.hp / character.hp_max) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
            <div className="card-2 p-2.5">
              <p className="text-[10px] tavern-soft">КД</p>
              <p className="text-lg font-bold text-[#ece3d2]">{character.ac}</p>
            </div>
            <div className="card-2 p-2.5">
              <p className="text-[10px] tavern-soft">Инициатива</p>
              <p className="text-lg font-bold text-[#ece3d2]">{sign(character.initiative)}</p>
            </div>
          </div>
        </section>

        {/* Навыки и снаряжение */}
        <section className="space-y-4">
          <div className="parchment p-4">
            <h3 className="section-title mb-2">Навыки</h3>
            {character.skills.length === 0 ? (
              <p className="text-sm tavern-soft">Навыки ещё не выбраны</p>
            ) : (
              <ul className="divide-y divide-[#262018]">
                {character.skills.map((s) => (
                  <li key={s.name} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-[#ece3d2]">{s.name}</span>
                    <span className="font-bold tavern-gold">{sign(s.bonus)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="parchment p-4">
            <h3 className="section-title mb-2">Снаряжение</h3>
            {character.gear.length === 0 ? (
              <p className="text-sm tavern-soft">Сумка пуста</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {character.gear.map((g) => (
                  <li
                    key={g.name}
                    title={g.name}
                    className="card-2 grid size-12 place-items-center text-xl"
                  >
                    {g.icon || "📦"}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <p className="mt-4 text-xs tavern-soft">
        Лист персонажа пока читается из мока: правки не сохраняются, пока бэк не реализует
        <code className="mx-1 rounded bg-white/5 px-1">/api/characters/me</code>.
      </p>
    </div>
  );
}
