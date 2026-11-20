// node "src/app/openings/[id]/hhRules.check.ts"
import assert from "node:assert/strict";
import { answersOf, editedOf, editOf, ranOn } from "./hhRules.ts";

const a = answersOf({ similarDesignation: "Head of SAP", competitors: ["Rocell", "Lanka Tiles"], servicesProvider: ["Glass", "Pharma"], websiteLink: "x.com" }, ["titles", "rivals"]);
assert.equal(a.rivals, "Rocell, Lanka Tiles");
assert.equal(a.services, "Glass; Pharma");
assert.equal(a.titles, "Head of SAP");
assert.equal(a.country, "");
assert.deepEqual(editOf("rivals", "Rocell, Lanka Tiles ,"), { field: "competitors", value: "Rocell; Lanka Tiles" });
assert.deepEqual(editOf("services", "Glass; Pharma"), { field: "servicesProvider", value: "Glass; Pharma" });
assert.deepEqual(editOf("overview", "a, b"), { field: "companyOverview", value: "a, b" });
assert.deepEqual(editedOf(["competitors", "websiteLink", "nope"]), ["rivals", "website"]);
assert.equal(ranOn(Date.now()), "today");
assert.equal(ranOn(Date.UTC(2026, 10, 12, 6), Date.UTC(2026, 10, 20)), "12 Nov");
console.log("hhRules: all checks passed");
