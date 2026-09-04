"use client";

import { CalendarDays, Dices, ScrollText, Shield, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useSession } from "@/components/SessionContext";
import { apiGames, apiNews, type ApiGame, type ApiNews } from "@/lib/api";

const FEATURES = [
  { icon: CalendarDays, title: "Бронирование игр", text: "Удобное расписание и бронь мест" },
  { icon: Shield, title: "Создание персонажа", text: "Анкета, характеристики, навыки и снаряжение" },
  { icon: Dices, title: "Проведение игры", text: "Таймеры, заметки, трекер состояний и журнал событий" },
  { icon: ScrollText, title: "Хроники", text: "История приключений и достижения персонажа" },
];

const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const dateLine = (iso: string) =>
  new Date(iso).toLocaleString("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function HomePage() {
  const { user, loaded } = useSession();
  const [games, setGames] = useState<ApiGame[]>([]);
  const [news, setNews] = useState<ApiNews[]>([]);

  useEffect(() => {
    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + 30);
    apiGames(isoDate(from), isoDate(to)).then((list) =>
      setGames(
        (list ?? [])
          .filter((g) => g.status === "approved" && !g.is_cancelled && new Date(g.starts_at) > new Date())
          .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
          .slice(0, 4)
      )
    );
    apiNews().then(setNews);
  }, [loaded]);

  const seatsChip = (game: ApiGame) =>
    game.seats_taken >= game.seats_total ? (
      <span className="chip chip-ghost">Мест нет</span>
    ) : (
      <span className="chip chip-green">Есть места</span>
    );

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 sm:py-8">
      {/* Витрина для гостя: чем вообще занимается Нора */}
      {!user && loaded && (
        <section className="parchment mb-6 overflow-hidden p-5 sm:p-7">
          <div className="grid gap-6 lg:grid-cols-2 lg:items-center">
            <div>
              <h1 className="text-3xl font-bold leading-tight text-[#f0c674] sm:text-4xl">
                Бронируй.
                <br />
                Играй.
                <br />
                Проживай истории.
              </h1>
              <p className="mt-4 max-w-md text-sm leading-relaxed tavern-soft">
                Лисья Нора — место живых ролевых игр по D&amp;D с полным погружением и атмосферой
                фэнтези.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link href="/games" className="btn-gold text-sm">
                  <CalendarDays className="size-4" /> Смотреть расписание
                </Link>
                <Link href="/login" className="btn-brown text-sm">
                  Завести персонажа
                </Link>
              </div>
            </div>

            <ul className="space-y-3">
              {FEATURES.map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-[#33291c] bg-[#16110d] tavern-gold">
                    <Icon className="size-5" />
                  </span>
                  <span>
                    <span className="block text-sm font-bold uppercase tracking-wide text-[#ece3d2]">
                      {title}
                    </span>
                    <span className="block text-xs tavern-soft">{text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {user && (
        <h1 className="mb-5 text-2xl font-bold text-[#ece3d2]">
          Добро пожаловать, <span className="tavern-gold">{user.name}</span>
        </h1>
      )}

      <section className="mb-6">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="section-title">Ближайшие игры</h2>
          <Link href="/games" className="text-xs font-bold tavern-gold hover:underline">
            Смотреть все
          </Link>
        </div>

        {games.length === 0 ? (
          <p className="parchment p-6 text-center text-sm tavern-soft">
            Пока ни одной подтверждённой игры. Загляните в расписание чуть позже.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {games.map((game) => (
              <li key={game.id}>
                <Link
                  href="/games"
                  className="parchment block overflow-hidden transition hover:border-[#d3a24a]/40"
                >
                  <span className="poster flex h-28 items-end p-3 text-3xl sm:h-32">🐉</span>
                  <span className="block p-3">
                    <span className="block truncate text-base font-bold text-[#ece3d2]">{game.title}</span>
                    <span className="mt-0.5 block text-xs tavern-soft">
                      D&amp;D 5e · Мастер: {game.master}
                    </span>
                    <span className="mt-2 flex flex-wrap items-center gap-2 text-xs tavern-soft">
                      <span className="flex items-center gap-1">
                        <Users className="size-3" />
                        {game.seats_taken} / {game.seats_total} игроков
                      </span>
                      <span>· {dateLine(game.starts_at)}</span>
                      <span className="ml-auto">{seatsChip(game)}</span>
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="section-title mb-3">Новости Норы</h2>
        <ul className="space-y-2">
          {news.map((item) => (
            <li key={item.id} className="parchment flex items-start gap-3 p-3">
              <span className="poster grid size-14 shrink-0 place-items-center rounded-lg text-xl">📜</span>
              <span className="min-w-0">
                <span className="block font-bold text-[#ece3d2]">{item.title}</span>
                <span className="block text-xs leading-snug tavern-soft">{item.excerpt}</span>
                <span className="mt-1 block text-[10px] tavern-soft">
                  {new Date(item.published_at).toLocaleDateString("ru-RU", {
                    day: "numeric",
                    month: "long",
                  })}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
