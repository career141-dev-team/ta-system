/**
 * The new UI's CV routes on the old server (D6, 19 Nov): the CV file, the Prepared
 * CV and the box position. Each runs the old route or action itself, so access,
 * Word -> PDF, stamping and the position checks stay in one place; only the new
 * UI's own address may call them from a browser.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { uiCors, withCors } from "../src/lib/uiCors";

let n = 0;
const ok = (l: string, f: () => void) => { f(); n++; console.log(`  ok   ${l}`); };
const read = (p: string) => fs.readFileSync(p, "utf8");

ok("CORS only for new.career141.com", () => {
  assert.equal(uiCors("https://new.career141.com")["access-control-allow-origin"], "https://new.career141.com");
  assert.deepEqual(uiCors("https://evil.example"), {});
  assert.deepEqual(uiCors(null), {});
});
ok("withCors adds the header to a response", () => {
  const r = withCors(new Response("x"), "https://new.career141.com");
  assert.equal(r.headers.get("access-control-allow-origin"), "https://new.career141.com");
});
ok("CV file runs the old CV route as a PDF", () => {
  const s = read("src/app/api/ui/cv/route.ts");
  assert.ok(s.includes('from "@/app/api/cv/[candidateId]/route"') && s.includes('set("view", "pdf")'));
  assert.ok(!/cvBytes|mayOpenCv/.test(s), "access stays in the old route");
});
ok("Prepared CV runs the old prepared-cv route", () => {
  assert.ok(read("src/app/api/ui/prepared-cv/route.ts").includes('from "@/app/api/prepared-cv/[appId]/route"'));
});
ok("box position runs the old action, only its own fields", () => {
  const s = read("src/app/api/ui/prepared-cv-box/route.ts");
  assert.ok(s.includes("savePreparedCvBox(form)") && s.includes('["appId", "openingId", "x", "y", "width", "reset"]'));
  assert.ok(!/repo\.setPreparedCvBox/.test(s));
});

console.log(`\n${n} passed, 0 failed`);
