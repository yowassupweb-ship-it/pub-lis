"use client";

import { createContext, useContext, useEffect, useState } from "react";

import { apiLogout, apiMe, type ApiUser } from "@/lib/api";

type Session = {
  user: ApiUser | null;
  loaded: boolean;
  setUser: (u: ApiUser | null) => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const Ctx = createContext<Session>({
  user: null,
  loaded: false,
  setUser: () => {},
  refresh: async () => {},
  logout: async () => {},
});

/** Сессия живёт в layout — при переходах между разделами не перезапрашивается. */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = async () => {
    const me = await apiMe();
    setUser(me);
    setLoaded(true);
  };

  useEffect(() => {
    let alive = true;
    apiMe().then((me) => {
      if (!alive) return;
      setUser(me);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [])

  const logout = async () => {
    await apiLogout();
    setUser(null);
  };

  return <Ctx.Provider value={{ user, loaded, setUser, refresh, logout }}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);
