"use client";

import { useRouter } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SetupNotice } from "@/components/setup-notice";
import { AuthProvider, RequireAuth, useAuth } from "@/components/auth";
import { Nav } from "./nav";

function Header() {
  const { supabase, user } = useAuth();
  const router = useRouter();

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <header className="flex items-center justify-between border-b border-neutral-200 px-6 py-4 dark:border-neutral-800">
      <h1 className="text-lg font-semibold tracking-tight">Paycheck Planner</h1>
      {user?.email && (
        <div className="flex items-center gap-3 text-sm text-neutral-500">
          <span>{user.email}</span>
          <button onClick={signOut} className="underline underline-offset-2">
            Sign out
          </button>
        </div>
      )}
    </header>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-12">
        <SetupNotice />
      </div>
    );
  }

  return (
    <AuthProvider>
      <div className="flex min-h-screen flex-col md:flex-row">
        <Nav />
        <div className="flex flex-1 flex-col">
          <Header />
          <main className="flex flex-1 flex-col px-6 py-6">
            <RequireAuth>{children}</RequireAuth>
          </main>
        </div>
      </div>
    </AuthProvider>
  );
}
