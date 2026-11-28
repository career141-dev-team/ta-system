/**
 * Builds the table file in a process of its own (28 Nov 2026). With the CV
 * text and its full-text index the build takes many seconds of synchronous
 * SQLite work; done inside the service it would hold every search for that
 * long on each restart and each night's reload. Here it holds nothing: the
 * service starts this, carries on answering, and switches to the new file when
 * it is ready.
 *
 *   node table-build.ts <cards.jsonl> <cvtext.jsonl or -> <out.db>
 *
 * Reads both files a line at a time, writes the table file, and sends
 * { rows, cvRows, tables, ms } to the service (or prints it when run by hand).
 */
import fs from "node:fs";
import { StringDecoder } from "node:string_decoder";
import { buildTable, describeTable, runQuery } from "./table";

/** A file's lines, read in step with the caller, so a 400 MB file is never held whole. */
function* linesOf(file: string): Generator<any> {
  const fd = fs.openSync(file, "r");
  const buf = Buffer.alloc(1 << 20);
  const dec = new StringDecoder("utf8");
  let rest = "";
  const parsed = function* (ls: string[]) {
    for (const l of ls) {
      if (!l) continue;
      try { yield JSON.parse(l); } catch { /* a broken line is skipped, never the whole file */ }
    }
  };
  try {
    for (let n; (n = fs.readSync(fd, buf, 0, buf.length, null)) > 0; ) {
      const parts = (rest + dec.write(buf.subarray(0, n))).split("\n");
      rest = parts.pop() ?? "";
      yield* parsed(parts);
    }
    yield* parsed([rest + dec.end()]);
  } finally {
    fs.closeSync(fd);
  }
}

const [cardsFile, cvFile, out] = process.argv.slice(2);
const t0 = Date.now();
const count = (db: ReturnType<typeof buildTable>, sql: string) => { const a = runQuery(db, sql); return a.ok ? Number(a.rows[0][0]) : 0; };
const build = (withCv: boolean) => {
  fs.rmSync(out, { force: true });
  return buildTable(linesOf(cardsFile), out, withCv ? linesOf(cvFile) : undefined);
};
const hasCv = !!cvFile && cvFile !== "-" && fs.existsSync(cvFile);
let db: ReturnType<typeof buildTable>;
let note = hasCv ? "" : "no CV text file yet";
try {
  db = build(hasCv);
} catch (e) {
  // The CV text must never cost us the table: without it (no FTS5 in this Node, a bad file) the columns still work.
  if (!hasCv) throw e;
  note = `CV text left out: ${e instanceof Error ? e.message : String(e)}`;
  db = build(false);
}
const answer = { rows: count(db, "select count(*) from people"), cvRows: hasCv && !note ? count(db, "select count(*) from cv_text") : 0, tables: describeTable(db), note, ms: Date.now() - t0 };
db.close();
if (process.send) process.send(answer, () => process.exit(0));
else console.log(JSON.stringify({ ...answer, tables: `${answer.tables.length} characters` }));
