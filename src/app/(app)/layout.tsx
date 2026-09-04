"use client";

import { SessionProvider, useSession } from "@/components/SessionContext";
import { TavernShell } from "@/components/TavernShell";

function Shell({ children }: { children: React.ReactNode }) {
  const { user, loaded, logout } = useSession();
  return (
    <TavernShell user={user} authChecked={loaded} onLogout={logout}>
      {children}
    </TavernShell>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <Shell>{children}</Shell>
    </SessionProvider>
  );
}
