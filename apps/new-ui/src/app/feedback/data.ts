// Feedback & support sample data and rules (owner's designs F1 + F2, 14 Nov 2026), on
// the old TA System's flow (FeedbackWidget, FeedbackDesk): anyone tells us something;
// a TA's goes to their lead first, a lead's straight to the builders; the lead passes it
// to the builders, answers it, or says it will not be done; the builders mark it fixed
// or not doing it. Words or a voice note are needed; a screenshot (3 MB) and the page
// it was sent from ride along. The person's bell tells them each time it moves.
// ponytail: one in-memory store for this visit; with the backend, the feedbacks table.

import { useSyncExternalStore } from "react";

export type Kind = "broke" | "idea" | "question";
/** new = the lead has not opened it; review = opened, not decided; builders = passed on
 *  (or sent by a lead); done = fixed, answered, or not doing it. */
export type Status = "new" | "review" | "builders" | "done";
export type Outcome = "fixed" | "answered" | "declined";
export type Item = {
  id: string;
  kind: Kind;
  title: string;
  text: string;
  by: string;
  ago: string;
  blocks?: boolean;
  page?: string;
  href?: string;
  screenshot?: string;
  voice?: string;
  status: Status;
  outcome?: Outcome;
  version?: string;
  answer?: string;
  /** Live: the sender's id (a TA's own list), from the TA System. */
  byId?: string;
};

export const KIND: Record<Kind, { label: string; chip: string; ask: string }> = {
  broke: { label: "Broken", chip: "bg-danger-soft text-danger", ask: "What happened, and what did you expect? Names help." },
  idea: { label: "Idea", chip: "bg-warn-soft text-warn", ask: "What would make your work easier?" },
  question: { label: "Question", chip: "bg-info-soft text-info", ask: "What would you like to know?" },
};
export const COLUMNS: { status: Status; name: string; dot: string }[] = [
  { status: "new", name: "New", dot: "bg-info" },
  { status: "review", name: "Lead review", dot: "bg-violet" },
  { status: "builders", name: "With the builders", dot: "bg-warn" },
  { status: "done", name: "Done", dot: "bg-brand" },
];

/** What the sender sees in "Your recent". */
export const whereIs = (x: Item) =>
  x.status === "builders"
    ? { text: "With the builders", dot: "bg-info" }
    : x.status === "done"
      ? x.outcome === "fixed"
        ? { text: x.version ? `Fixed in ${x.version}` : "Fixed", dot: "bg-success" }
        : x.outcome === "answered"
          ? { text: "Answered", dot: "bg-success" }
          : { text: "Not doing it", dot: "bg-ink-3" }
      : { text: "With your lead", dot: "bg-violet" };

/** The card's second line: who, when, and the one thing worth knowing. */
export const meta = (x: Item) =>
  [x.by, x.status === "done" ? (x.outcome === "fixed" ? (x.version ? `fixed in ${x.version}` : "fixed") : x.outcome === "answered" ? "answered" : "not doing it") : x.ago, (x.status === "new" || x.status === "review") && x.blocks ? "blocks work" : "", x.status === "builders" && x.version ? x.version : ""]
    .filter(Boolean)
    .join(" · ");

/** The title is the first line of the words, cut at 70; a voice note alone is "Voice note". */
export const titleOf = (text: string, voice: boolean) => {
  const first = text.trim().split("\n")[0].trim();
  return first ? (first.length > 70 ? first.slice(0, 67) + "..." : first) : voice ? "Voice note" : "";
};

let items: Item[] = [
  { id: "f1", kind: "broke", blocks: true, title: "“Send to Director Review” spins", text: "“Send to Director Review” keeps spinning on Kasun Perera. Tried twice.", by: "Chathura", ago: "10 min", page: "Pipeline · Senior Manager — SAP", href: "/openings/demo", status: "new" },
  { id: "f2", kind: "idea", title: "Show notice period on cards", text: "Show the notice period on the pipeline cards so I don't have to open each CV.", by: "Kavya", ago: "2 h", page: "Pipeline", href: "/openings/demo", status: "new" },
  { id: "f3", kind: "question", title: "Can I undo a rejection?", text: "Can I undo a rejection? I rejected the wrong candidate on Finance Manager.", by: "Nuwan", ago: "3 h", status: "new" },
  { id: "f4", kind: "broke", title: "EOD lost the Cc list", text: "EOD lost the Cc list after I saved the draft. Had to type them again.", by: "Dilini", ago: "yesterday", page: "Midday & EOD", href: "/openings/demo", status: "review" },
  { id: "f5", kind: "idea", title: "Bulk-move in pipeline", text: "Bulk-move in pipeline: tick several cards and move them together.", by: "Sewwandi", ago: "yesterday", status: "review" },
  { id: "f6", kind: "broke", blocks: true, title: "Scoop upload stuck at 80%", text: "Scoop upload stuck at 80% for a 4 MB PDF. Other files go through.", by: "Dinuka", ago: "2 days", version: "v4.13", page: "Scoops", href: "/openings/demo", status: "builders" },
  { id: "f7", kind: "idea", title: "Dark mode for the CV viewer", text: "Dark mode for the CV viewer - easier on the eyes in the evening.", by: "Chathura", ago: "3 days", status: "builders" },
  { id: "f8", kind: "broke", title: "Bell rang twice", text: "The bell rang twice for the same reply.", by: "Ravindu", ago: "5 days", status: "done", outcome: "fixed", version: "v4.12" },
  { id: "f9", kind: "question", title: "Where is the Bin?", text: "Where is the Bin? I need to bring back an opening.", by: "Kavya", ago: "6 days", status: "done", outcome: "answered", answer: "Your name at the top right, then Bin. Things stay there for 7 days." },
  { id: "f10", kind: "question", title: "How do I restore from the Bin?", text: "How do I restore from the Bin?", by: "Chathura", ago: "1 week", status: "done", outcome: "answered", answer: "Open the Bin and press Bring back on the row." },
];

const listeners = new Set<() => void>();
const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => void listeners.delete(f);
};
export const useItems = () => useSyncExternalStore(subscribe, () => items, () => items);
export function setItems(next: (all: Item[]) => Item[]) {
  items = next(items);
  listeners.forEach((f) => f());
}
export const update = (id: string, p: Partial<Item>) => setItems((all) => all.map((x) => (x.id === id ? { ...x, ...p } : x)));
