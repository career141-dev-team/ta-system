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


// The owner's pasted JD (20 Nov): "Sri Lanka" read as Lanka Tiles, the role came out
// empty, "1–3 years" became "3+ years" and the salary range was missed.
const jd = readBrief(`Project Coordinator:
Job Title: Project Coordinator
Department / Reporting Line: Operations | Reports to: Senior Project Manager
Location & Work Model: Colombo, Sri Lanka (Hybrid – 3 days in office)
Compensation & Benefits: LKR 120,000 – 150,000/month + Health Insurance & Performance Bonus
We are looking for an organized Project Coordinator to help plan, track, and deliver client projects.
• Must-Have: 1–3 years of experience in project coordination or operations; strong organizational skills.`);
assert.equal(jd.client, ""); // no client named: AURA asks, it never guesses one
assert.equal(jd.clientKnown, false);
assert.equal(jd.role, "Project Coordinator");
assert.deepEqual(jd.locations, [{ city: "Colombo", people: 1 }]);
assert.equal(jd.musts, "1–3 years of experience in project coordination or operations · LKR 120,000–150,000");

// Only the desk's real clients count, and only by a name that is theirs.
assert.equal(readBrief("Need a Finance Manager in Colombo, Sri Lanka.", { clients: ["Lanka Tiles"] }).client, "");
assert.equal(readBrief("Hayleys need a Finance Manager.", { clients: ["Hayleys Fabric PLC"] }).client, "Hayleys Fabric PLC");
assert.equal(readBrief("Hayleys need a Finance Manager.", { clients: ["Hayleys Fabric", "Hayleys Solar"] }).client, ""); // two Hayleys: ask
const acme = readBrief("Client: Acme Holdings\nRole: Accountant", { clients: [] });
assert.equal(acme.client, "Acme Holdings");
assert.equal(acme.clientKnown, false); // named outright: offered as a new client
assert.equal(acme.role, "Accountant");
assert.equal(readBrief("Need an Accountant for Galle.", { clients: [] }).client, ""); // "for Galle" is not a client
assert.equal(readBrief("Looking for an organized Project Coordinator to help.").role, "Project Coordinator");
assert.equal(readBrief("Must have 5 years in audit.").musts, "5 years in audit");

assert.equal(readBrief("Need an Accountant, 3 people.").headcount, 3);
assert.equal(readBrief("Need an Accountant, three people.").headcount, 3);
assert.equal(readBrief("Hiring 4 accountants in Kandy.").locations[0].people, 4);
assert.equal(readBrief("Need an Accountant, 5 years experience.").headcount, 1);
assert.equal(readBrief("Need an Accountant.").headcount, 1);
readBrief("Colombo again");
assert.deepEqual(EMPTY.locations, []); // a reading never writes into the empty form
console.log("brief reader: ok");
