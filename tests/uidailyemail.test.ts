/**
 * The new UI's Midday / End of day send through the old action (D5 step 3, 19 Nov):
 * only the old form's own fields go in, and the old action's closing redirect is
 * read back into sent / not sent.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { formFields, readSendRedirect, redirectUrl, UI_ORIGINS } from "../src/lib/uiDailyEmail";

let n = 0;
const ok = (l: string, f: () => void) => { f(); n++; console.log(`  ok   ${l}`); };

ok("the old form's fields pass", () => {
  const r = formFields({ openingId: "j1", submissionType: "eod", applicationIds: "a,b", shortlist_a_name: "Kasun", effort_dm: "3", target_dm: "5", refereeCallResults: "[]" });
  assert.equal(r.ok, true);
});
ok("a field the page never had is refused", () => assert.equal(formFields({ openingId: "j1", actorId: "u2" }).ok, false));
ok("no opening is refused", () => assert.equal(formFields({ subject: "x" }).ok, false));
ok("a non-text value is refused", () => assert.equal(formFields({ openingId: "j1", applicationIds: ["a"] }).ok, false));
ok("sent: id and message", () => assert.deepEqual(readSendRedirect("/openings/j1/eod?mail=e1&sent=e1&msg=Sent%20from%20x"), { ok: true, message: "Sent from x", sentId: "e1" }));
ok("not sent: tone error", () => assert.deepEqual(readSendRedirect("/openings/j1/eod?msg=Nothing%20was%20sent&tone=error"), { ok: false, message: "Nothing was sent", sentId: null }));
ok("redirect digest read", () => assert.equal(redirectUrl("NEXT_REDIRECT;replace;/openings/j1/eod?msg=a;b&sent=e1;307;"), "/openings/j1/eod?msg=a;b&sent=e1"));
ok("not a redirect", () => assert.equal(redirectUrl("boom"), null));
ok("only the new UI's own address may call from a browser", () => assert.deepEqual(UI_ORIGINS, ["https://new.career141.com"]));
ok("the route runs the old action, nothing of its own", () => {
  const src = fs.readFileSync("src/app/api/ui/daily-email/route.ts", "utf8");
  assert.ok(src.includes("sendDailyEmail(form)"));
  assert.ok(!/convexMutation|convexAction|ta\/dailyEmails|eodMail/.test(src));
});

console.log(`\n${n} passed, 0 failed`);
