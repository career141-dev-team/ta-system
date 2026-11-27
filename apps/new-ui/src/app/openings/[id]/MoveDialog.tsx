"use client";

import { useEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { door, useDoorQuery, type Answer, type DoorOpenings } from "@/lib/backend";
import { DUR, EASE, gsap, useGSAP } from "@/lib/gsap";

type PostChoice = { id: string; title: string };
type PostsAnswer = Answer<{ posts: (PostChoice & { status: string })[] }>;

// Placeholders for the sample screens (no backend).
const SAMPLE = [
  { id: "s1", client: "Hemas", title: "Finance Manager", posts: [{ id: "s1a", title: "Finance Manager" }] },
  { id: "s2", client: "Brandix", title: "ERP Lead", posts: [{ id: "s2a", title: "ERP Lead" }, { id: "s2b", title: "SAP Functional Lead" }] },
];

const ROW = "flex w-full items-center gap-2.5 rounded-sm px-3 py-2.5 text-left text-body text-ink hover:bg-surface-2 aria-pressed:bg-brand-soft aria-pressed:text-brand";

/** Where the ticked CVs go: a live post of this opening, or another active opening and
 *  then one of its live posts (asked only when it has more than one). */
export default function MoveDialog({ ref: root, count, openingId, posts, onClose, onMove }: {
  ref: RefObject<HTMLDivElement | null>;
  count: number;
  /** The opening being worked on (null on the sample screens). */
  openingId: string | null;
  /** This opening's other live posts; absent = choose another opening first. */
  posts?: PostChoice[];
  onClose: () => void;
  onMove: (toPostId: string, label: string) => void;
}) {
  const [opening, setOpening] = useState<{ id: string; title: string; client: string } | null>(null);
  const [postId, setPostId] = useState("");
  const [q, setQ] = useState("");
  const list = useDoorQuery(door.openings, openingId && !posts ? {} : "skip") as DoorOpenings | undefined;
  const theirs = useDoorQuery(door.postsList, openingId && opening ? { openingId: opening.id } : "skip") as PostsAnswer | undefined;
  useGSAP(
    () => {
      gsap.from("[data-veil]", { opacity: 0, duration: DUR.fast });
      gsap.from("[data-box]", { opacity: 0, y: 14, scale: 0.94, duration: DUR.base, ease: EASE.pop });
    },
    { scope: root },
  );
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  const openings = !openingId ? SAMPLE : list?.ok ? list.openings.filter((o) => o.status === "active" && o.id !== openingId) : undefined;
  const found = openings?.filter((o) => `${o.title} ${o.client}`.toLowerCase().includes(q.trim().toLowerCase()));
  const choices: PostChoice[] | undefined =
    posts ??
    (!opening ? undefined : !openingId ? SAMPLE.find((o) => o.id === opening.id)?.posts : theirs?.ok ? theirs.posts.filter((p) => p.status === "live") : undefined);
  // One live post needs no question.
  const target = choices?.length === 1 && !posts ? choices[0] : choices?.find((p) => p.id === postId);
  const refusal = [list, theirs].map((a) => (a && !a.ok ? a.message : "")).find(Boolean);
  const cvs = `${count} CV${count === 1 ? "" : "s"}`;

  return createPortal(
    <div ref={root} className="fixed inset-0 z-[80] flex items-center justify-center">
      <div data-veil className="absolute inset-0 bg-surface/20 backdrop-blur-[6px]" onClick={onClose} />
      <div data-box role="dialog" aria-modal="true" aria-labelledby="move-title" className="relative flex max-h-[calc(100dvh-32px)] w-[max(32rem,340px)] max-w-[calc(100vw-32px)] flex-col gap-3.5 rounded-lg bg-surface p-[max(2rem,20px)] shadow-float">
        <h2 id="move-title" className="text-h3 font-medium text-ink">
          Move {cvs} to {posts ? "another post" : "another opening"}
        </h2>
        {refusal && <p className="text-small text-danger">{refusal}</p>}
        {!posts && !opening && (
          <>
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search openings by title or client" aria-label="Search openings" className="h-[max(2.375rem,40px)] w-full shrink-0 rounded-full border border-brand/50 bg-surface px-[max(1.375rem,14px)] text-body text-ink outline-none placeholder:text-ink-3 focus:border-brand focus:ring-2 focus:ring-brand/15" />
            <ul className="min-h-0 flex-1 overflow-y-auto">
              {found?.map((o) => (
                <li key={o.id}>
                  <button type="button" onClick={() => setOpening(o)} className={ROW}>
                    <span className="min-w-0 truncate">{o.title}</span>
                    <span className="ml-auto shrink-0 text-small text-ink-3">{o.client}</span>
                  </button>
                </li>
              ))}
              {!found && !refusal && <li className="px-3 py-2 text-small text-ink-3">Reading your openings…</li>}
              {found?.length === 0 && <li className="px-3 py-2 text-small text-ink-3">No other active opening{q ? " matches" : ""}.</li>}
            </ul>
          </>
        )}
        {opening && (
          <p className="flex items-center gap-2 text-small text-ink-2">
            <span className="min-w-0 truncate">
              {opening.title} · {opening.client}
            </span>
            <button type="button" onClick={() => (setOpening(null), setPostId(""))} className="ml-auto shrink-0 font-medium text-brand">
              Change opening
            </button>
          </p>
        )}
        {(posts || opening) && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {!choices && !refusal && <p className="px-3 py-2 text-small text-ink-3">Reading its posts…</p>}
            {choices?.length === 0 && <p className="px-3 py-2 text-small text-warn">This opening has no live post. Set one live there first.</p>}
            {!!choices?.length && (
              <>
                <p className="px-3 pb-1 text-caption font-medium text-ink-3">{choices.length > 1 || posts ? "Which post?" : "Post"}</p>
                {choices.map((p) => (
                  <button key={p.id} type="button" aria-pressed={target?.id === p.id} onClick={() => setPostId(p.id)} className={ROW}>
                    {p.title}
                  </button>
                ))}
              </>
            )}
          </div>
        )}
        {!posts && <p className="text-caption text-ink-3">They arrive as New applicants, marked with the post they came from.</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-small text-ink-2 hover:bg-surface-2 hover:text-ink">
            Cancel
          </button>
          <button
            type="button"
            disabled={!target || !count}
            onClick={() => target && onMove(target.id, opening ? `${target.title} on ${opening.title}` : target.title)}
            className="rounded-full bg-brand px-5 py-2 text-small font-medium text-white hover:bg-brand-strong disabled:opacity-40"
          >
            Move {cvs}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
