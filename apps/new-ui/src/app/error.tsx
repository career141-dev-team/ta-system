"use client";
// A page that broke. One case is ours to mend by itself (20 Nov 2026, seen live):
// every publish replaces the site's code files, so a tab opened before it asks for a
// piece of code that is gone ("Failed to load chunk") and the page falls over -
// pressing New opening on an open Openings page did. Reloading once loads the new
// code; a second failure within a minute shows this page, so it never loops.
import { useEffect } from "react";

const CHUNK = /ChunkLoadError|Failed to load chunk|Loading chunk [\w-]+ failed|Failed to fetch dynamically imported module/i;
const KEY = "ta-ui:chunk-reload";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const stale = CHUNK.test(`${error?.name} ${error?.message}`);
  useEffect(() => {
    if (!stale) return;
    try {
      const last = Number(sessionStorage.getItem(KEY) ?? 0);
      if (Date.now() - last < 60_000) return;
      sessionStorage.setItem(KEY, String(Date.now()));
    } catch {
      // No storage (private window): reload anyway; a loop would need the new code missing too.
    }
    location.reload();
  }, [stale]);
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-h3 text-ink">{stale ? "AURA was updated - loading the new version…" : "This page couldn’t load"}</p>
      {!stale && <p className="text-small text-ink-2">Reload to try again, or go back.</p>}
      <div className="flex gap-2">
        <button type="button" onClick={() => location.reload()} className="rounded-full bg-ink px-4 py-2 text-small font-medium text-white hover:bg-black">
          Reload
        </button>
        {!stale && (
          <button type="button" onClick={() => (history.length > 1 ? history.back() : reset())} className="rounded-full border border-border-strong px-4 py-2 text-small font-medium text-ink hover:bg-surface-2">
            Back
          </button>
        )}
      </div>
    </main>
  );
}
