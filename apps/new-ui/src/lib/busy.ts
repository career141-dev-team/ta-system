// Screens waiting on the backend (owner, 19 Nov 2026: "the top notch loading animation
// needs to run until the page properly loads"). A screen calls useBusy(answer ===
// undefined) for each read it waits on; the tab's loading bar (src/app/LoadingBar.tsx)
// runs while any screen is still waiting.

import { useEffect, useSyncExternalStore } from "react";

let waiting = 0;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

/** Mark this screen as waiting while `on` is true. */
export function useBusy(on: boolean) {
  useEffect(() => {
    if (!on) return;
    waiting++;
    emit();
    return () => {
      waiting--;
      emit();
    };
  }, [on]);
}

/** True while any screen waits on the backend. */
export const useAnyBusy = () =>
  useSyncExternalStore(
    (f) => (subs.add(f), () => void subs.delete(f)),
    () => waiting > 0,
    () => false,
  );
