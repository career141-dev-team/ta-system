/**
 * One read-only query on the cards table (table.ts). On its own, with no
 * imports, so the query worker (query-worker.mjs) can load it without the rest.
 * The error text goes back as it is, so the agent can correct its own query.
 * Rows are capped: a count is asked with count(*). No time limit here: the
 * worker's caller (query.ts) stops a query that runs too long.
 */
import type { DatabaseSync } from "node:sqlite";

export type QueryAnswer = { ok: true; columns: string[]; rows: unknown[][]; more: boolean } | { ok: false; error: string };

export function runQuery(db: DatabaseSync, sql: string, maxRows = 200): QueryAnswer {
  const q = String(sql ?? "").trim().replace(/;+\s*$/, "");
  if (!/^(select|with)\b/i.test(q) || q.includes(";")) return { ok: false, error: "One SELECT statement only." };
  try {
    const st = db.prepare(q);
    const rows: unknown[][] = [];
    let columns: string[] = [];
    let more = false;
    for (const r of st.iterate() as Iterable<Record<string, unknown>>) {
      if (rows.length >= maxRows) { more = true; break; }
      if (!rows.length) columns = Object.keys(r);
      rows.push(Object.values(r));
    }
    return { ok: true, columns, rows, more };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
