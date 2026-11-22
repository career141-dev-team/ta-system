/**
 * Keeping the working set warm: the pure parts.
 *
 * No I/O here, so the rules are tested on their own (tests/warmcache.test.ts).
 * prime.ts does the fetching and calls these.
 *
 * Why this exists (9 Nov): a reload of the desk took 10-28 s on the live
 * server, every request waited for it in one queue, and a save landing during
 * the fetch made the loader THROW THE FETCH AWAY and leave the tables marked
 * stale - so on a busy desk no reload ever settled and every request paid the
 * full price. The fix is to keep what was fetched and re-apply this process's
 * own saves on top (`overlayWrites`), and to fetch the biggest table in
 * parallel ranges (`splitRanges`) rather than one cursor chain.
 */

import { keyOf, type CommitOp } from "./unitOfWork";

type Row = Record<string, unknown>;

/** One row this process committed, and when. `after` is the live row object. */
export interface RecentWrite {
  table: string;
  kind: CommitOp["kind"];
  key: string;
  after?: Row;
  at: number;
}

/** How long a committed write is remembered for overlaying. Longer than any fetch. */
export const RECENT_WRITES_MS = 120_000;

export function rememberWrites(held: RecentWrite[], ops: CommitOp[], at: number): RecentWrite[] {
  const keep = held.filter((w) => at - w.at < RECENT_WRITES_MS);
  for (const op of ops) keep.push({ table: op.table, kind: op.kind, key: op.key, after: op.after, at });
  return keep;
}

/**
 * Rows as fetched, with this process's saves since `since` applied on top.
 *
 * An insert adds (or replaces) the row; an update replaces a row the fetch
 * returned and is skipped for one it did not (a scoped fetch of another
 * opening's rows, say); a delete removes it. A row's key is read from the live
 * `after` object, which `renameIds` has already given its real id - the op's
 * own `key` may still be the temporary one for an insert.
 *
 * `within` narrows which writes belong to this fetch (an opening's rows only).
 */
export function overlayWrites<T>(
  table: string,
  rows: T[],
  writes: RecentWrite[],
  since: number,
  within: (row: Row) => boolean = () => true,
): T[] {
  const mine = writes.filter((w) => w.table === table && w.at >= since);
  if (mine.length === 0) return rows;
  const byKey = new Map(rows.map((r) => [keyOf(table, r as unknown as Row), r]));
  for (const w of mine) {
    if (w.kind === "delete") {
      byKey.delete(w.key);
      continue;
    }
    const row = w.after;
    if (!row || !within(row)) continue;
    const key = keyOf(table, row);
    if (w.kind === "insert" || byKey.has(key)) byKey.set(key, row as unknown as T);
  }
  return [...byKey.values()];
}

/**
 * `parts` half-open ranges [from, to) covering [min, max]. Equal in time, not
 * in count - a slow month and a busy one differ - which is fine: each range
 * still pages on its own cursor, so a heavy range costs more pages, never a
 * failure.
 */
export function splitRanges(min: number, max: number, parts: number): [number, number][] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) return [];
  const n = Math.max(1, Math.floor(parts));
  const span = max + 1 - min;
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const from = min + Math.floor((span * i) / n);
    const to = i === n - 1 ? max + 1 : min + Math.floor((span * (i + 1)) / n);
    if (to > from) out.push([from, to]);
  }
  return out;
}

/**
 * Whether a caller has to wait for rows or may render from what is held.
 *
 * Wait when nothing is held, when the rows were never loaded, or when a direct
 * backend write marked them stale (`at === 0`) - that is the read-your-write
 * case. Merely older than the lifetime means "refresh in the background".
 */
export function mustWait(at: number | undefined, ttlMs: number, now: number): "wait" | "refresh" | "fresh" {
  if (!at) return "wait";
  return now - at > ttlMs ? "refresh" : "fresh";
}

/**
 * Forget the dirty openings a fetch begun at `fetchStart` has covered (23 Nov).
 * An opening marked at or before the fetch began was written before it, so the
 * fetch holds the write; one marked after it stays dirty for the next read.
 */
export function settleOpenings(dirty: Map<string, number>, fetchStart: number, ids: Iterable<string> = [...dirty.keys()]): void {
  for (const id of ids) {
    const at = dirty.get(id);
    if (at !== undefined && at <= fetchStart) dirty.delete(id);
  }
}
