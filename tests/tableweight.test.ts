/**
 * Heavy fields kept out of the whole-table reload (23 Nov), pinned so they are not
 * re-added silently. Kept on purpose, because the app reads them from memory:
 * intakeItems.rawText/parsed/match, taOutreach.body, eodEmailCopies.rows/effort.
 */
import fs from "node:fs";
import path from "node:path";
import { TABLES } from "../convex/ta/model/tables";

let pass = 0, fail = 0;
const eq = (l: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${l}${ok ? "" : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

console.log("\naiCalls: the transcript is not shipped in the reload");
const doc = { _id: "c1", _creationTime: 1, transcript: "x".repeat(50_000), status: "completed", answers: [] };
const row = TABLES.aiCalls.fromDoc(doc as never) as Record<string, unknown>;
eq("transcript is null in the app copy", row.transcript, null);
eq("other fields still come through", [row.id, row.status], ["c1", "completed"]);
eq("a missing transcript is null too", (TABLES.aiCalls.fromDoc({ _id: "c2", _creationTime: 1 } as never) as Record<string, unknown>).transcript, null);

console.log("\nnothing reads AiCall.transcript from memory");
const readers = ["src/components/ScreeningPanel.tsx", "src/lib/voice.ts", "src/app/openings/[id]/candidate/[appId]/page.tsx"];
for (const f of readers) eq(`${f} does not read call.transcript`, /\b(call|c|live|calls?\[\d\])\.transcript\b/.test(read(f).replace(/\bb\.transcript\b/g, "")), false);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
