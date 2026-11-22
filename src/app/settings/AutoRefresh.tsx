"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/** Re-reads the page every few seconds while it is visible, so progress shows without reloading. */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  const [at, setAt] = useState(() => Date.now());
  const [pending, startTransition] = useTransition();
  // Read inside the interval so it is not re-created on every refresh.
  const busy = useRef(false);
  busy.current = pending;

  useEffect(() => {
    // Skip a tick while the last refresh is still running, and stop after 100
    // refreshes (23 Nov): a status that never settles used to refresh for ever.
    let count = 0;
    const t = setInterval(() => {
      if (document.visibilityState !== "visible" || busy.current) return;
      startTransition(() => router.refresh());
      setAt(Date.now());
      if (++count >= 100) clearInterval(t);
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);

  return (
    <span className="text-[11.5px] text-ink-faint" suppressHydrationWarning>
      Updates every {seconds}s · last {new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
    </span>
  );
}
