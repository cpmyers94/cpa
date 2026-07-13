import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";
import { Nav } from "./nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let email: string | null = null;
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    email = user?.email ?? null;
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Nav />
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-neutral-200 px-6 py-4 dark:border-neutral-800">
          <h1 className="text-lg font-semibold tracking-tight">Paycheck Planner</h1>
          {email && (
            <form action={signOut} className="flex items-center gap-3 text-sm text-neutral-500">
              <span>{email}</span>
              <button type="submit" className="underline underline-offset-2">
                Sign out
              </button>
            </form>
          )}
        </header>
        <main className="flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
