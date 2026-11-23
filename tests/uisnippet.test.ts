/**
 * The new UI's Snippets (R6, 21 Nov): the card of a real opening through the old
 * snippets page's rules, and the old refine run as it is - sign-in first.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { snippetFromOpening } from "../src/lib/snippet";

let n = 0;
const ok = (l: string, f: () => void) => { f(); n++; console.log(`  ok   ${l}`); };
const route = fs.readFileSync("src/app/api/ui/snippet/route.ts", "utf8");

ok("the card comes from the opening and the approved JD's bullets", () => {
  const f = snippetFromOpening({
    title: "Senior Finance Manager", clientIndustry: "Apparel", locations: ["Colombo"], salaryMin: 450000, salaryMax: 550000,
    currency: "LKR", packageNotes: "", jdMarkdown: "## Must have\n- CIMA qualified\n- 8+ years in finance", taEmail: "ta@example.com", taPhone: null,
  });
  assert.equal(f.package, "450K – 550K");
  assert.deepEqual(f.bullets.length, 2);
  assert.equal(f.email, "ta@example.com");
});
ok("route: the old page's rules - seat, approved JD - and the old refine", () => {
  for (const a of ["seatFor(user", "canSeeSourcing", 'jdStatus !== "approved"', "snippetFromOpening(", 'from "@/app/api/snippet/refine/route"']) assert.ok(route.includes(a), a);
  const get = route.slice(route.indexOf("export async function GET"));
  assert.ok(get.indexOf("currentUser()") < get.indexOf("primeStore("));
  assert.ok(route.includes('authorization")?.startsWith("Bearer ")') && route.includes("uiCors("));
});

console.log(`\n${n} passed, 0 failed`);
