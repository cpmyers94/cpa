"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Loads data asynchronously and exposes a `refresh()` to re-run the load
 * (e.g. after a mutation). Pass `null` while prerequisites (like the signed-in
 * user) aren't ready yet.
 *
 * A failed load surfaces as `error` rather than leaving `data` null forever —
 * otherwise an unreachable backend (a paused database, an offline phone) shows
 * an endless "Loading…" with no way to tell what went wrong.
 */
export function useAsyncData<T>(load: (() => Promise<T>) | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!load) return;
    let cancelled = false;
    load().then(
      (result) => {
        if (cancelled) return;
        setError(null);
        setData(result);
      },
      (cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause : new Error(String(cause)));
      }
    );
    return () => {
      cancelled = true;
    };
  }, [load, version]);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  return { data, error, refresh };
}
