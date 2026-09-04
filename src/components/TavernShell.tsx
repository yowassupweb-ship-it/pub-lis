"use client";

import { CalendarDays, LogIn, LogOut, Menu, ScrollText, User, Wrench, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { STAFF_ROLES, apiLogout, type ApiUser } from "@/lib/api";

type NavItem = { href: string; label: string; icon: typeof CalendarDays; visible: (u: ApiUser | null) => boolean };

const NAV: NavItem[] = [
  { href: "/", label: "Расписание", icon: CalendarDays, visible: () => true },
  { href: "/quests", label: "Задания", icon: ScrollText, visible: (u) => !!u },
  { href: "/account", label: "Кабинет", icon: User, visible: (u) => !!u },
  { href: "/staff", label: "Служебный", icon: Wrench, visible: (u) => !!u && STAFF_ROLES.includes(u.role) },
];

/** Каркас игровых страниц: сайдбар слева, контент справа. */
export function TavernShell({
  user,
  authChecked = true,
  onLogout,
  actions,
  children,
}: {
  user: ApiUser | null;
  authChecked?: boolean;
  onLogout?: () => void;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const logout = () => (onLogout ? onLogout() : apiLogout().then(() => window.location.reload()));
  const items = NAV.filter((i) => i.visible(user));

  const aside = (
    <aside className="tavern-panel flex h-full w-60 shrink-0 flex-col border-r-4 border-black/40 px-3 py-4 shadow-2xl">
      <Link href="/" onClick={() => setOpen(false)} className="mb-6 flex items-center gap-2 px-2">
        <span className="text-3xl leading-none drop-shadow">🦊</span>
        <span>
          <span className="block text-base font-bold leading-tight text-[#f2e7cb]">
            Хитрый <span className="text-[#e3a83e]">Лис</span>
          </span>
          <span className="block text-[10px] text-[#b09a72]">таверна · D&amp;D 5e</span>
        </span>
      </Link>

      <nav className="flex flex-col gap-1">
        {items.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-2.5 rounded-md border-2 px-3 py-2 text-sm font-bold transition ${
                active
                  ? "border-[#7a5716] bg-gradient-to-b from-[#f2bd5e] to-[#d99a2b] text-[#3a2708]"
                  : "border-transparent text-[#d9c9a3] hover:border-white/10 hover:bg-white/5 hover:text-[#f2e7cb]"
              }`}
            >
              <Icon className="size-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {actions && <div className="mt-4 flex flex-col gap-2">{actions}</div>}

      <div className="mt-auto border-t border-white/10 pt-3">
        {user ? (
          <>
            <Link href="/account" onClick={() => setOpen(false)} className="mb-2 flex items-center gap-2 px-1 text-sm text-[#f2e7cb]">
              <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-md border-2 border-[#4a3421] bg-[#2c1d0e] text-base">
                {user.avatar?.startsWith("/") ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={user.avatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  user.avatar ?? "🧙"
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-bold">{user.name}</span>
                {user.title && (
                  <span className="block truncate text-[10px] italic text-[#e3a83e]">✦ {user.title}</span>
                )}
              </span>
            </Link>
            <button type="button" onClick={logout} className="btn-brown w-full text-xs">
              <LogOut className="size-3.5" /> Выйти
            </button>
          </>
        ) : (
          authChecked && (
            <Link href="/login" className="btn-gold w-full text-xs">
              <LogIn className="size-3.5" /> Войти
            </Link>
          )
        )}
      </div>
    </aside>
  );

  return (
    <div className="tavern-bg flex min-h-screen">
      <div className="hidden lg:flex">{aside}</div>

      {/* мобильная шапка + выдвижной сайдбар */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="tavern-panel flex items-center gap-2 border-b-4 border-black/40 px-3 py-2 lg:hidden">
          <button type="button" onClick={() => setOpen(true)} className="btn-brown px-2 py-1.5" aria-label="Меню">
            <Menu className="size-4" />
          </button>
          <span className="text-lg">🦊</span>
          <span className="text-sm font-bold text-[#f2e7cb]">
            Хитрый <span className="text-[#e3a83e]">Лис</span>
          </span>
        </header>
        <div className="min-w-0 flex-1">{children}</div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex lg:hidden" onClick={() => setOpen(false)}>
          <div className="h-full" onClick={(e) => e.stopPropagation()}>
            {aside}
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex-1 bg-black/60 text-transparent"
            aria-label="Закрыть меню"
          >
            <X className="m-3 size-5 text-white/70" />
          </button>
        </div>
      )}
    </div>
  );
}
