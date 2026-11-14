// Run: node src/app/openings/data.check.ts - fails loudly if the brief reader breaks.
import assert from "node:assert/strict";
import { EMPTY, readBrief } from "./data.ts";

const a = readBrief(
  "PGP want a Senior Manager for their SAP S/4HANA move — Colombo, 10+ years, must have led a manufacturing rollout. Budget around 1.2M. They need someone in 2 weeks, so treat it as P1. Put Chathura and Dinuka on it.",
);
assert.equal(a.client, "PGP Glass");
assert.equal(a.clientKnown, true);
assert.equal(a.role, "Senior Manager — SAP S/4HANA");
assert.deepEqual(a.locations, [{ city: "Colombo", people: 1 }]); // "10+ years" is not a headcount
assert.equal(a.priority, 1);
assert.deepEqual(a.team, ["Chathura", "Dinuka"]);
assert.equal(a.musts, "10+ years · led a manufacturing rollout · ~LKR 1.2M");

const b = readBrief("Hayleys need a Finance Manager - 2 in Colombo and Kandy 1.");
assert.deepEqual(b.locations, [{ city: "Colombo", people: 2 }, { city: "Kandy", people: 1 }]);
assert.equal(b.priority, 3); // nothing said: the old default

assert.equal(readBrief("Need a Finance Manager, 2 in Colombo.").role, "Finance Manager");

const c = readBrief("Need 3 people for Galle, a Store Manager.");
assert.deepEqual(c.locations, [{ city: "Galle", people: 3 }]);

readBrief("Colombo again");
assert.deepEqual(EMPTY.locations, []); // a reading never writes into the empty form
console.log("brief reader: ok");
