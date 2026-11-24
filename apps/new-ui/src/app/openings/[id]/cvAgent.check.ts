// node "src/app/openings/[id]/cvAgent.check.ts"
import assert from "node:assert/strict";
import { boxLines, runAgent, MAX_W, type BoxContent } from "./cvAgent.ts";

const start: BoxContent = { designation: "UI/UX Designer", company: "MAS Bodyline", notice: "30 Days", notes: [] };
const cv = "Rashini. 5 years of experience. Skills: Figma, Prototyping.";

let r = runAgent("move it up", null, start, cv);
assert.equal(r.box, null);
assert.match(r.reply, /add the green box/);

r = runAgent("Add a green box and put expected salary 550k, note available for interviews after 5pm", null, start, cv);
assert.ok(r.box);
const lines = boxLines(r.box!.content);
assert.equal(lines[0], "CAREER141 CANDIDATE");
assert.ok(lines.includes("CURRENT DESIGNATION - UI/UX Designer"));
assert.ok(lines.includes("EXPECTED SALARY - 550k"), lines.join("|"));
assert.ok(lines.includes("NOTE:-") && lines.some((l) => /after 5pm/.test(l)), lines.join("|"));

let b = r.box!;
r = runAgent("set notice period to 1 month", b, start, cv);
assert.ok(boxLines(r.box!.content).includes("NOTICE PERIOD - 1 month"));
b = r.box!;

r = runAgent("move the box to the bottom left", b, start, cv);
assert.equal(r.box!.x, 2);
assert.equal(r.box!.y, 80);

for (let i = 0; i < 10; i++) b = runAgent("make the box wider", b, start, cv).box!;
assert.equal(b.w, MAX_W);

r = runAgent("remove the current company", b, start, cv);
assert.ok(!boxLines(r.box!.content).some((l) => l.startsWith("CURRENT COMPANY")));

r = runAgent("does she know Figma?", b, start, cv);
assert.equal(r.box, b);
assert.match(r.reply, /Figma/);

r = runAgent("remove the green box", b, start, cv);
assert.equal(r.box, null);
console.log("cv agent: ok");
