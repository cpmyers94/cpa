"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const [supabase] = useState(() => createClient());
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();

  // Already signed in? Go straight to the dashboard.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace("/");
    });
  }, [supabase, router]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setPending(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    try {
      if (mode === "sign-in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setError(error.message);
          return;
        }
        router.replace("/");
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) {
          setError(error.message);
          return;
        }
        if (data.session) {
          router.replace("/");
        } else {
          // Email confirmation is enabled on the Supabase project.
          setNotice(
            "Check your email for a confirmation link, then come back and sign in."
          );
        }
      }
    } catch {
      setError("Network error — check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        Email
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Password
        <input
          name="password"
          type="password"
          required
          minLength={6}
          autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
          className="rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <p className="text-sm text-emerald-600">{notice}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-white dark:text-neutral-900"
      >
        {pending ? "Please wait…" : mode === "sign-in" ? "Sign in" : "Create account"}
      </button>
      <button
        type="button"
        onClick={() => {
          setMode(mode === "sign-in" ? "sign-up" : "sign-in");
          setError(null);
          setNotice(null);
        }}
        className="text-sm text-neutral-500 underline underline-offset-2"
      >
        {mode === "sign-in" ? "Need an account? Sign up" : "Have an account? Sign in"}
      </button>
    </form>
  );
}
