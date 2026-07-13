"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Loads data asynchronously and exposes a `refresh()` to re-run the load
 * (e.g. after a mutation). Pass `null` while prerequisites (like the signed-in
 * user) aren't ready yet.
 */
export function useAsyncData<T>(load: (() => Promise<T>) | null) {
  const [data, setData] = useState<T | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!load) return;
    let cancelled = false;
    load().then((result) => {
      if (!cancelled) setData(result);
    });
    return () => {
      cancelled = true;
    };
  }, [load, version]);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  return { data, refresh };
}
