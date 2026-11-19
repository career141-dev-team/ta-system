"use client";

import { useCallback, useEffect, useState } from "react";

// One way every screen keeps its filters (owner, 19 Nov 2026): the values live in
// sessionStorage per screen, so going to another page and coming Back - or a reload
// - finds the same search and filters, and "Reset" puts every one back to its default.
// A filter that is not in `defaults` is not a filter. Server and first paint use the
// defaults, the saved values arrive right after (no hydration mismatch).
// ponytail: sessionStorage, not the address, because views inside an opening rewrite
// the address themselves; a shareable link can come when a screen asks for one.

type Value = string | number | boolean | string[];

export function useFilters<T extends Record<string, Value>>(
  scope: string,
  defaults: T,
  /** Keys that change the view but are not filters (sort, board/list): kept, not counted. */
  quiet: (keyof T)[] = [],
) {
  const key = "ta-ui:filters:" + scope;
  const [base] = useState(defaults); // the first defaults stay the defaults
  const [f, setF] = useState<T>(base);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<T>;
        // Only keys this screen still has, and only values of the same kind.
        const ok: Partial<T> = {};
        for (const k of Object.keys(base) as (keyof T)[]) if (k in saved && typeof saved[k] === typeof base[k]) ok[k] = saved[k];
        // eslint-disable-next-line react-hooks/set-state-in-effect -- saved values arrive after the first paint on purpose (no hydration mismatch)
        setF((cur) => ({ ...cur, ...ok }));
      }
    } catch {}
    setLoaded(true);
  }, [key, base]);

  useEffect(() => {
    if (!loaded) return;
    try {
      sessionStorage.setItem(key, JSON.stringify(f));
    } catch {}
  }, [key, f, loaded]);

  const set = useCallback((patch: Partial<T>) => setF((cur) => ({ ...cur, ...patch })), []);
  /** Back to the defaults, except the quiet keys (the sort stays as chosen). */
  const reset = useCallback(
    () => setF((cur) => ({ ...base, ...Object.fromEntries(quiet.map((k) => [k, cur[k]])) }) as T),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base],
  );
  const active = (Object.keys(base) as (keyof T)[]).filter(
    (k) => !quiet.includes(k) && JSON.stringify(f[k]) !== JSON.stringify(base[k]),
  ).length;
  return { f, set, reset, active };
}

/** Every word of `q` must appear in one of the texts ("nippon finance" is not everything at Nippon). */
export const matchesAll = (q: string, ...texts: (string | undefined)[]) => {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = texts.join(" ").toLowerCase();
  return words.every((w) => hay.includes(w));
};
