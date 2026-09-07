"use client";

import { CalendarDays, LogIn, Users } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { TavernLogo } from "@/components/TavernLogo";
import {
  apiBookSeat,
  apiCancelBooking,
  apiGame,
  apiMe,
  apiRegister,
  type ApiGame,
  type ApiUser,
} from "@/lib/api";

export default function GameLandingPage() {
  const params = useParams<{ id: string }>();
  const [game, setGame] = useState<ApiGame | null>(null);
  const [user, setUser] = useState<ApiUser | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState({ name: "", telegram: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!params?.id) return;
    Promise.all([apiGame(params.id), apiMe()]).then(([g, u]) => {
      setGame(g);
      setUser(u);
      setLoaded(true);
    });
  }, [params?.id]);

  // регистрация и заявка одним махом
  const registerAndBook = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (form.password.length < 6) {
      setError("Пароль — минимум 6 символов");
      return;
    }
    setPending(true);
    const result = await apiRegister(form.name.trim(), form.telegram.trim(), form.password);
    if (result.error) {
      setPending(false);
      setError(result.error);
      return;
    }
    setUser(result.user);
    if (game) {
      const { data: updated, error: bookError } = await apiBookSeat(game.id);
      if (updated) setGame(updated);
      else if (bookError) setError(bookError);
    }
    setPending(false);
  };

  const full = game ? game.seats_taken >= game.seats_total : false;
  const started = game ? new Date(game.starts_at) < new Date() : false;
  const loginHref = `/login?next=${encodeURIComponent(`/g/${params?.id ?? ""}`)}`;

  return (
    <main className="tavern-bg flex min-h-screen items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-4 flex items-center justify-center gap-2 text-sm text-[#9a8b75] hover:text-[#ece3d2]">
          <TavernLogo size={28} /> Лисья Нора · D&amp;D
        </Link>

        {!loaded && <p className="text-center text-[#9a8b75]">Загрузка…</p>}

        {loaded && !game && (
          <p className="text-center text-[#cfc2ab]">
            Игра не найдена или ещё не подтверждена.{" "}
            <a href="/games" className="text-[#e3a83e] underline">К расписанию</a>
          </p>
        )}

        {game && (
          <div className="parchment p-5">
            <h1 className="text-xl font-bold tavern-ink">{game.title}</h1>
            <p className="mt-2 flex items-center gap-1.5 text-sm tavern-soft">
              <CalendarDays className="size-4" />
              {new Date(game.starts_at).toLocaleString("ru-RU", {
                weekday: "long",
                day: "numeric",
                month: "long",
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              · {game.duration_hours} ч
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-sm tavern-soft">
              <Users className="size-4" />
              ГМ: {game.master} · мест занято {game.seats_taken}/{game.seats_total}
            </p>
            {game.description && <p className="mt-3 text-sm tavern-ink">{game.description}</p>}

            <div className="mt-5 border-t-2 border-[#262018] pt-4">
              {started && <p className="text-sm tavern-soft">Игра уже началась</p>}

              {!started && user && (
                <>
                  {game.my_booking_status === null &&
                    (full ? (
                      <p className="text-sm tavern-soft">Мест не осталось</p>
                    ) : (
                      <button
                        type="button"
                        onClick={async () => {
                          const { data: updated, error: bookError } = await apiBookSeat(game.id);
                          if (updated) setGame(updated);
                          else setError(bookError ?? "Не удалось подать заявку");
                        }}
                        className="btn-gold w-full"
                      >
                        Подать заявку на место
                      </button>
                    ))}
                  {game.my_booking_status === "pending" && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="chip chip-blue">Заявка у ГМа</span>
                      <button
                        type="button"
                        onClick={async () => {
                          const updated = await apiCancelBooking(game.id);
                          if (updated) setGame(updated);
                        }}
                        className="btn-brown text-xs"
                      >
                        Отозвать
                      </button>
                    </div>
                  )}
                  {game.my_booking_status === "approved" && (
                    <span className="chip chip-green">Вы записаны — ждём за столом!</span>
                  )}
                  {game.my_booking_status === "rejected" && (
                    <span className="chip chip-red">Заявку отклонил гейм-мастер</span>
                  )}
                </>
              )}

              {!started && !user && (
                <>
                  <p className="mb-3 text-sm tavern-soft">Чтобы записаться, заполните короткую анкету:</p>
                  <form onSubmit={registerAndBook} className="space-y-2.5">
                    <input
                      required
                      placeholder="Имя (как к вам обращаться)"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="tavern-input"
                    />
                    <input
                      required
                      placeholder="Телеграм (@username) — это ваш логин"
                      value={form.telegram}
                      onChange={(e) => setForm({ ...form, telegram: e.target.value })}
                      className="tavern-input"
                    />
                    <input
                      required
                      type="password"
                      placeholder="Придумайте пароль (мин. 6 символов)"
                      autoComplete="new-password"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      className="tavern-input"
                    />
                    <button type="submit" disabled={pending || full} className="btn-gold w-full">
                      {full ? "Мест не осталось" : pending ? "Секунду…" : "Зарегистрироваться и записаться"}
                    </button>
                  </form>
                  <a href={loginHref} className="btn-brown mt-3 w-full">
                    <LogIn className="size-4" /> У меня уже есть аккаунт — войти
                  </a>
                </>
              )}

              {error && <p className="mt-3 text-sm font-bold text-[#e79b8f]">{error}</p>}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
