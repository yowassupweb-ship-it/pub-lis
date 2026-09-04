"use client";

import { LogIn, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { apiLogin, apiRegister } from "@/lib/api";

type Mode = "login" | "register";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [telegram, setTelegram] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (mode === "register" && password.length < 6) {
      setError("Пароль — минимум 6 символов");
      return;
    }
    setPending(true);
    const result =
      mode === "login"
        ? await apiLogin(email.trim(), password)
        : await apiRegister(name.trim(), telegram.trim(), password, email.trim() || undefined);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    // ?next= — только свои пути, чужие домены не пускаем
    const next = new URLSearchParams(window.location.search).get("next");
    router.push(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
  };

  return (
    <main className="tavern-bg flex min-h-screen items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-sm">
        <div className="mb-5 flex flex-col items-center gap-1 text-center">
          <span className="text-5xl drop-shadow">🦊</span>
          <h1 className="text-2xl font-bold text-[#ece3d2]">
            Таверна «Хитрый <span className="text-[#e3a83e]">Лис</span>»
          </h1>
          <p className="text-sm text-[#9a8b75]">Бронирование игр Dungeons &amp; Dragons</p>
        </div>

        <div className="parchment p-5">
          <div className="mb-5 flex gap-2">
            {(
              [
                ["login", "Вход"],
                ["register", "Регистрация"],
              ] as Array<[Mode, string]>
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => switchMode(id)}
                className={`flex-1 ${mode === id ? "btn-gold" : "btn-brown"}`}
              >
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-3">
            {mode === "register" && (
              <>
                <label className="block">
                  <span className="tavern-label">Имя</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    autoComplete="name"
                    className="tavern-input"
                    placeholder="Как к вам обращаться за столом"
                  />
                </label>
                <label className="block">
                  <span className="tavern-label">Телеграм (это ваш логин)</span>
                  <input
                    value={telegram}
                    onChange={(e) => setTelegram(e.target.value)}
                    required
                    className="tavern-input"
                    placeholder="@username"
                  />
                </label>
              </>
            )}
            <label className="block">
              <span className="tavern-label">
                {mode === "login" ? "Телеграм или email" : "Email (необязательно)"}
              </span>
              <input
                type={mode === "login" ? "text" : "email"}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required={mode === "login"}
                autoComplete={mode === "login" ? "username" : "email"}
                className="tavern-input"
                placeholder={mode === "login" ? "@username или почта" : "you@example.com"}
              />
            </label>
            <label className="block">
              <span className="tavern-label">Пароль</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                className="tavern-input"
                placeholder={mode === "register" ? "Минимум 6 символов" : "••••••••"}
              />
            </label>

            {error && (
              <p className="rounded-md border-2 border-[#e79b8f] bg-[#b23b2e]/15 px-3 py-2 text-sm font-bold text-[#e79b8f]">
                {error}
              </p>
            )}

            <button type="submit" disabled={pending} className="btn-gold w-full">
              {mode === "login" ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
              {pending ? "Секунду…" : mode === "login" ? "Войти" : "Создать аккаунт"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
