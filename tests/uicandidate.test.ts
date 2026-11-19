/**
 * The new UI's candidate and JD buttons on the old server (D7, 19 Nov): each runs
 * the old action or the shared writer the phone uses, only with the old form's own
 * fields, only for new.career141.com, and asks who is signed in before loading.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { FORM_ACTIONS, readBody } from "../src/lib/uiCandidate";

let n = 0;
const ok = (l: string, f: () => void) => { f(); n++; console.log(`  ok   ${l}`); };
const read = (p: string) => fs.readFileSync(p, "utf8");
const route = read("src/app/api/ui/candidate/route.ts");

ok("a form button carries only its old form's fields", () => {
  const r = readBody({ do: "addon", appId: "a", openingId: "o", on: "1" });
  assert.ok(r.ok && r.value.kind === "form" && r.value.fields.length === 3);
  const bad = readBody({ do: "addon", appId: "a", openingId: "o", ownerTaId: "x" });
  assert.ok(!bad.ok && /should not: ownerTaId/.test(bad.message));
});
ok("an opening is always named; unknown buttons are refused", () => {
  assert.equal(readBody({ do: "rereadJd" }).ok, false);
  assert.equal(readBody({ do: "deleteEverything", openingId: "o" }).ok, false);
  assert.equal(readBody(null).ok, false);
  assert.equal(readBody({ do: "addon", openingId: "o", on: 1 }).ok, false); // not a string
});
ok("interview and closing name the candidate and carry the phone's body", () => {
  const r = readBody({ do: "closing", openingId: "o", appId: "a", body: { action: "offer" } });
  assert.ok(r.ok && r.value.kind === "writer" && r.value.action === "closing");
  assert.equal(readBody({ do: "interview", openingId: "o" }).ok, false);
});
ok("every form button runs the old action; interview and closing the shared writers", () => {
  for (const name of ["toggleAddOn", "toggleBackup", "addCandidateToJob", "addToOpening", "approveJd", "reextractJobDetails"]) assert.ok(route.includes(name), name);
  assert.equal(Object.keys(FORM_ACTIONS).length, 6);
  assert.ok(route.includes("writeCandidateInterview(") && route.includes("writeCandidateClosing("));
  assert.ok(route.includes("candidateInterviewBody") && route.includes("candidateClosingBody"));
});
ok("a placement's letter is stored before the record is written", () => {
  assert.ok(route.indexOf("storeOfferLetter(letter)") < route.indexOf("writeCandidateClosing("));
  assert.ok(read("src/app/actions.ts").includes('from "@/lib/candidates/offerLetter"'));
  // A placement with no file is refused; the browser cannot name a letter id itself.
  assert.ok(route.includes('if (!letter) return answer(req, { ok: false, message: "A placement needs the signed offer letter." }, 400)'));
});
ok("who is asking comes first; CORS only for the new UI", () => {
  const get = route.slice(route.indexOf("export async function GET"));
  assert.ok(get.indexOf("currentUser()") < get.indexOf("primeStore("));
  assert.ok(route.includes('authorization")?.startsWith("Bearer ")'));
  assert.ok(route.includes("uiCors("));
});

console.log(`\n${n} passed, 0 failed`);
