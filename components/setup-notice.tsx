export function SetupNotice() {
  return (
    <div className="rounded-lg border border-dashed border-amber-400/60 bg-amber-50 p-6 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-200">
      <p className="font-medium">Supabase isn&apos;t connected yet.</p>
      <p className="mt-1 text-amber-800/80 dark:text-amber-300/80">
        Create a Supabase project, run the migration in{" "}
        <code className="rounded bg-black/5 px-1 py-0.5 dark:bg-white/10">
          supabase/migrations/0001_init.sql
        </code>
        , then copy your project URL and anon key into{" "}
        <code className="rounded bg-black/5 px-1 py-0.5 dark:bg-white/10">.env.local</code>{" "}
        (see <code className="rounded bg-black/5 px-1 py-0.5 dark:bg-white/10">.env.example</code>).
      </p>
    </div>
  );
}
