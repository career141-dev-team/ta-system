// node src/app/openings/createRules.check.ts
import assert from "node:assert/strict";
import { clientOf, createFields, teamIds } from "./createRules.ts";

const clients = [{ id: "c1", name: "PGP Glass" }, { id: "c2", name: "Hemas" }];
const tas = [{ id: "t1", name: "Hasini Fernando" }, { id: "t2", name: "Nipuna Silva" }];
assert.equal(clientOf("pgp glass ", clients)?.id, "c1");
assert.equal(clientOf("New Co", clients), null);
assert.deepEqual(teamIds(["Hasini", "Nipuna Silva", "Nobody", "hasini"], tas), ["t1", "t2"]);

const f = createFields(
  { role: " SAP Lead ", client: "PGP Glass", locations: [{ city: "Colombo", people: 2 }, { city: "Kandy", people: 1 }], team: ["Hasini"], musts: "S/4", hiringFor: "Expat", gender: "Any", autoFollowUp: true },
  "We need an SAP lead.", "c1", tas,
);
assert.equal(f.title, "SAP Lead");
assert.equal(f.hiringFor, "local");
assert.equal(f.targetGender, "");
assert.equal(f.autoFollowUp, "on");
assert.ok(f.notes.includes("Must have: S/4") && f.notes.includes("expat"));
assert.deepEqual(JSON.parse(f.workLocations!), [{ id: "loc-1", name: "Colombo", vacancies: 2 }, { id: "loc-2", name: "Kandy", vacancies: 1 }]);
assert.deepEqual(f.assignedTaIds, ["t1"]);
const g = createFields({ role: "X", client: "", locations: [], team: [], musts: "", hiringFor: "Local", gender: "Female", autoFollowUp: false }, "", "c2", tas);
assert.equal(g.targetGender, "Female");
assert.equal("workLocations" in g, false);
assert.equal("autoFollowUp" in g, false);
// 28 Nov 2026: nice-to-haves, the salary and the opening's own details go into the notes.
const h = createFields({ role: "X", client: "", locations: [], team: [], musts: "", hiringFor: "Local", gender: "Any", autoFollowUp: false, nice: "SAP", salary: "LKR 300k", extra: [{ label: "Reports to", value: "CFO" }, { label: "Empty", value: " " }] }, "", "c2", tas);
assert.ok(h.notes.includes("Nice to have: SAP") && h.notes.includes("Salary / package: LKR 300k") && h.notes.includes("Reports to: CFO") && !h.notes.includes("Empty"));
console.log("createRules: all checks passed");
