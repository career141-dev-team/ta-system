// node "src/app/openings/[id]/cvAsk.check.ts (askCv lives in cvAgent.ts)"
import assert from "node:assert/strict";
import { askCv } from "./cvAgent.ts";

const cv =
  "Rashini Kaweesha. UI/UX Designer with 5+ years of experience in SaaS. rashini@example.com +94 77 000 0000. " +
  "Skills: Figma, Prototyping, UX research. Education: BSc (Hons) in Interactive Media, University of Colombo. " +
  "Notice period: one month.";

assert.match(askCv(cv, "What is her email?"), /rashini@example\.com/);
assert.match(askCv(cv, "phone number?"), /\+94 77 000 0000/);
assert.match(askCv(cv, "How many years of experience?"), /5\+ years/);
assert.match(askCv(cv, "Does she know Figma?"), /Figma/);
assert.match(askCv(cv, "what degree"), /BSc|Education/);
assert.match(askCv(cv, "notice period"), /one month/);
assert.equal(askCv(cv, "Does she speak Japanese?"), "I could not find that in this CV.");
assert.match(askCv("", "anything"), /could not read/);
console.log("cv ask: ok");
