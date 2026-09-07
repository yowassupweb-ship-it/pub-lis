"use client";

import {
  Bell,
  CalendarDays,
  Home,
  LogIn,
  LogOut,
  ScrollText,
  Shield,
  User,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { TavernLogo } from "@/components/TavernLogo";
import { UserAvatar } from "@/components/UserAvatar";
import { STAFF_ROLES, apiLogout, apiNotifications, type ApiNotification, type ApiUser } from "@/lib/api";

type NavItem = {
  href: string;
  label: string;
  icon: typeof CalendarDays;
  visible: (u: ApiUser | null) => boolean;
  /** попадает ли в нижний таб-бар телефона: туда влезает ровно пять */
  tab?: boolean;
};

const NAV: NavItem[] = [
  { href: "/", label: "Главная", icon: Home, visible: () => true, tab: true },
  { href: "/games", label: "Игры", icon: CalendarDays, visible: () => true, tab: true },
  { href: "/character", label: "Персонаж", icon: Shield, visible: (u) => !!u, tab: true },
  { href: "/chronicles", label: "Хроники", icon: ScrollText, visible: (u) => !!u, tab: true },
  { href: "/account", label: "Профиль", icon: User, visible: (u) => !!u, tab: true },
  { href: "/quests", label: "Задания", icon: ScrollText, visible: (u) => !!u },
  { href: "/staff", label: "Служебный", icon: Wrench, visible: (u) => !!u && STAFF_ROLES.includes(u.role) },
];

const isActive = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname.startsWith(href);

/**
 * Каркас игровых страниц. На широком экране — сайдбар слева, на телефоне и
 * планшете шапка сверху и таб-бар снизу, как в мобильном приложении Норы.
 */
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
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [bellOpen, setBellOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!user) return; // гость уведомлений не получает; список просто не запрашиваем
    let alive = true;
    apiNotifications().then((list) => {
      if (alive) setNotifications(list);
    });
    return () => {
      alive = false;
    };
  }, [user]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setBellOpen(false);
      setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const logout = () => (onLogout ? onLogout() : apiLogout().then(() => window.location.reload()));
  const items = NAV.filter((i) => i.visible(user));
  const tabs = items.filter((i) => i.tab);
  // то, что не влезло в таб-бар, живёт в меню под аватаркой
  const extraItems = items.filter((i) => !i.tab);
  const unread = notifications.filter((n) => !n.read).length;

  const brand = (
    <Link href="/" className="flex items-center gap-2.5">
      <TavernLogo size={38} />
      <span className="leading-tight">
        <span className="block text-sm font-bold uppercase tracking-[0.16em] text-[#ece3d2]">
          Лисья <span className="tavern-gold">Нора</span>
        </span>
        <span className="block text-[9px] uppercase tracking-[0.22em] text-[#9a8b75]">
          место приключений
        </span>
      </span>
    </Link>
  );

  const bell = (
    <div className="relative">
      <button
        type="button"
        onClick={() => setBellOpen((v) => !v)}
        className="relative grid size-9 place-items-center rounded-full border border-[#33291c] text-[#cfc2ab] hover:border-[#d3a24a]/50 hover:text-[#f0c674]"
        aria-label="Уведомления"
      >
        <Bell className="size-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid size-4 place-items-center rounded-full bg-[#c8912f] text-[9px] font-bold text-[#241704]">
            {unread}
          </span>
        )}
      </button>
      {bellOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setBellOpen(false)}
            aria-label="Закрыть уведомления"
          />
          <div className="parchment absolute right-0 top-11 z-50 w-72 p-3 text-sm">
            <p className="tavern-label">Уведомления</p>
            {notifications.length === 0 ? (
              <p className="text-xs tavern-soft">Пока тихо</p>
            ) : (
              <ul className="space-y-2">
                {notifications.map((n) => (
                  <li key={n.id} className="card-2 p-2">
                    <p className="text-xs leading-snug text-[#ece3d2]">{n.text}</p>
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
          </div>
        </>
      )}
    </div>
  );

  // Телефон и планшет: всё, чего нет в таб-баре — под аватаркой в шапке.
  // Здесь же выход: на узком экране сайдбара с кнопкой «Выйти» просто нет.
  const userMenu = user && (
    <div className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        className="flex items-center rounded-full border border-[#33291c] p-0.5 hover:border-[#d3a24a]/50"
        aria-label="Меню профиля"
        aria-expanded={menuOpen}
      >
        <UserAvatar avatar={user.avatar} name={user.name} className="size-8 text-sm" />
      </button>
      {menuOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setMenuOpen(false)}
            aria-label="Закрыть меню"
          />
          <div className="parchment absolute right-0 top-11 z-50 w-60 p-2">
            <Link
              href="/account"
              onClick={() => setMenuOpen(false)}
              className="mb-1 flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-white/5"
            >
              <UserAvatar avatar={user.avatar} name={user.name} className="size-9 text-base" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-[#ece3d2]">{user.name}</span>
                {user.title && (
                  <span className="block truncate text-[10px] italic tavern-gold">✦ {user.title}</span>
                )}
              </span>
            </Link>

            {extraItems.length > 0 && (
              <div className="border-t border-[#262018] py-1">
                {extraItems.map(({ href, label, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm font-bold text-[#cfc2ab] hover:bg-white/5 hover:text-[#ece3d2]"
                  >
                    <Icon className="size-4 shrink-0" />
                    {label}
                  </Link>
                ))}
              </div>
            )}

            <div className="border-t border-[#262018] pt-2">
              <button type="button" onClick={logout} className="btn-brown w-full text-xs">
                <LogOut className="size-3.5" /> Выйти
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="tavern-bg flex min-h-screen">
      {/* Десктоп: сайдбар */}
      <aside className="tavern-panel sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r px-3 py-4 lg:flex">
        <div className="mb-7 px-1">{brand}</div>

        <nav className="flex flex-col gap-1">
          {items.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm font-bold transition ${
                  active
                    ? "border-[#d3a24a]/45 bg-[#d3a24a]/10 text-[#f0c674]"
                    : "border-transparent text-[#cfc2ab] hover:bg-white/5 hover:text-[#ece3d2]"
                }`}
              >
                <Icon className="size-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        {actions && <div className="mt-4 flex flex-col gap-2">{actions}</div>}

        <div className="mt-auto border-t border-[#33291c] pt-3">
          {user ? (
            <>
              <Link href="/account" className="mb-2 flex items-center gap-2 px-1 text-sm text-[#ece3d2]">
                <UserAvatar avatar={user.avatar} name={user.name} className="size-9 text-base" />
                <span className="min-w-0">
                  <span className="block truncate font-bold">{user.name}</span>
                  {user.title && (
                    <span className="block truncate text-[10px] italic tavern-gold">✦ {user.title}</span>
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

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Телефон и планшет: шапка с колокольчиком */}
        <header className="tavern-panel sticky top-0 z-30 flex items-center justify-between gap-2 border-b px-4 py-2.5 lg:hidden">
          {brand}
          {user
            ? (
                <div className="flex items-center gap-2">
                  {bell}
                  {userMenu}
                </div>
              )
            : authChecked && (
                <Link href="/login" className="btn-gold px-3 py-1.5 text-xs">
                  <LogIn className="size-3.5" /> Войти
                </Link>
              )}
        </header>

        {/* На десктопе колокольчик уезжает в правый верхний угол контента */}
        {user && <div className="hidden justify-end px-6 pt-4 lg:flex">{bell}</div>}

        <div className="pad-tabbar min-w-0 flex-1">{children}</div>
      </div>

      {/* Таб-бар: телефон и планшет */}
      <nav className="tavern-panel fixed inset-x-0 bottom-0 z-30 flex border-t px-1 pb-[env(safe-area-inset-bottom)] lg:hidden">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-bold transition ${
                active ? "text-[#f0c674]" : "text-[#9a8b75]"
              }`}
            >
              <span
                className={`grid size-8 place-items-center rounded-lg border ${
                  active ? "border-[#d3a24a]/45 bg-[#d3a24a]/10" : "border-transparent"
                }`}
              >
                <Icon className="size-4" />
              </span>
              {label}
            </Link>
          );
        })}
        {!user && authChecked && (
          <Link
            href="/login"
            className="flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-bold text-[#9a8b75]"
          >
            <span className="grid size-8 place-items-center rounded-lg">
              <LogIn className="size-4" />
            </span>
            Войти
          </Link>
        )}
      </nav>
    </div>
  );
}
