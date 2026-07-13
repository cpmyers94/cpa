import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SetupNotice } from "@/components/setup-notice";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 px-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Paycheck Planner</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Sign in to plan your paychecks, bills, goals and debts.
        </p>
      </div>
      {isSupabaseConfigured() ? <LoginForm /> : <SetupNotice />}
    </div>
  );
}
