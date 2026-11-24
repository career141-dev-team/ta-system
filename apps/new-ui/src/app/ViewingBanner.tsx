"use client";

// Shown on every screen while an admin views as another person (21 Nov 2026): who, that it
// is read only, and one press to come back.
import { setViewed, useViewed } from "@/lib/viewAs";

export default function ViewingBanner() {
  const v = useViewed();
  if (!v) return null;
  return (
    <div role="status" className="fixed inset-x-0 bottom-0 z-[200] flex items-center justify-center gap-3 bg-ink px-4 py-2 text-small text-white">
      <span>
        Viewing as <strong>{v.name}</strong> ({v.role}) - read only
      </span>
      <button type="button" onClick={() => setViewed(null)} className="rounded-pill bg-white px-3 py-1 text-caption font-medium text-ink">
        Back to me
      </button>
    </div>
  );
}
