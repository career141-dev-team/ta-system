/**
 * The agent's queries, with a time limit (28 Nov 2026). SQLite in Node is
 * synchronous: one careless cross join on the main thread would hold every
 * search. So queries run in a child process on a read-only copy of the table,
 * one at a time, and a query still running after `limitMs` kills that process;
 * the next query starts a fresh one (opening the file is instant).
 *
 * A process, not a worker thread: a thread stuck inside one SQLite step cannot
 * be stopped (terminate() waits for it to come back to JavaScript, and a
 * runaway query never does - the first test of this hung for good). A process
 * can always be killed.
 */
import { fork, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { QueryAnswer } from "./sql";

export type Query = (sql: string, maxRows?: number) => Promise<QueryAnswer>;

export function createQuerier(file: string, limitMs = 2000): { query: Query; close: () => void } {
  let child: ChildProcess | null = null;
  let n = 0;
  let line: Promise<unknown> = Promise.resolve();
  const start = () => (child ??= fork(fileURLToPath(new URL("./query-worker.mjs", import.meta.url)), [file], { stdio: ["ignore", "inherit", "inherit", "ipc"] }));
  const stop = () => { child?.kill("SIGKILL"); child = null; };
  const one = (sql: string, maxRows: number) => new Promise<QueryAnswer>((done) => {
    const c = start();
    const id = ++n;
    const end = (a: QueryAnswer) => { clearTimeout(timer); c.off("message", onMessage); c.off("error", onGone); c.off("exit", onGone); done(a); };
    const onMessage = (m: unknown) => { const r = m as { n: number; a: QueryAnswer }; if (r.n === id) end(r.a); };
    const onGone = () => { if (child === c) child = null; end({ ok: false, error: "The query could not run. Try it again." }); };
    const timer = setTimeout(() => { c.off("exit", onGone); stop(); end({ ok: false, error: `The query ran longer than ${limitMs / 1000} seconds and was stopped. Make it narrower.` }); }, limitMs);
    c.on("message", onMessage);
    c.on("error", onGone);
    c.on("exit", onGone);
    c.send({ n: id, sql, maxRows });
  });
  return {
    query: (sql, maxRows = 200) => { const r = line.then(() => one(sql, maxRows)); line = r.catch(() => undefined); return r; },
    close: stop,
  };
}
