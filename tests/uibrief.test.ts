/**
 * AURA reads a new opening's brief (convex/ui/briefRules.ts, D11 item 1, 20 Nov 2026).
 * The model only fills fields; these rules decide what of its answer reaches the
 * sheet. The fault behind them: a pasted JD's "Colombo, Sri Lanka" became the client
 * Lanka Tiles, and Create would have added it.
 */
import fs from "node:fs";
import { briefTurn, cleanBrief, knownClient, named, type BriefFields } from "../convex/ui/briefRules";

let pass = 0, fail = 0;
const eq = (l: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${l}${ok ? "" : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};

const CLIENTS = ["Lanka Tiles PLC", "Hayleys Fabric", "PGP Glass"];
const TEAM = ["Hasini Fernando", "Chathura Perera"];
const JD = "Job Title: Project Coordinator\nLocation: Colombo, Sri Lanka (Hybrid)\nCompensation: LKR 120,000 – 150,000/month\nMust-Have: 1–3 years of experience";

// ── The client is a desk client the words name, or a new one the words name ──
eq("known by its own name, any case", knownClient("hayleys fabric", CLIENTS), "Hayleys Fabric");
eq("an unknown name is not known", knownClient("Acme", CLIENTS), null);
eq("'Sri Lanka' never names Lanka Tiles", named("Lanka Tiles PLC", JD), false);
eq("'Hayleys' names Hayleys Fabric", named("Hayleys Fabric", "Hayleys need a Finance Manager"), true);

const fault = cleanBrief({ role: "Project Coordinator", client: "Lanka Tiles PLC", locations: [{ city: "Colombo", people: 1 }], musts: "1–3 years · LKR 120,000–150,000" }, CLIENTS, TEAM, JD);
eq("the 20 Nov fault: no client from 'Sri Lanka'", fault && { client: fault.fields.client, known: fault.fields.clientKnown }, { client: "", known: false });
eq("role and musts kept", fault && [fault.fields.role, fault.fields.musts], ["Project Coordinator", "1–3 years · LKR 120,000–150,000"]);
eq("read names what was filled", fault?.read, ["role", "where", "musts"]);

const country = cleanBrief({ client: "Sri Lanka" }, CLIENTS, TEAM, "A role in Sri Lanka");
eq("a country is never a new client", country?.fields.client, "");
const made = cleanBrief({ client: "Acme Holdings" }, CLIENTS, TEAM, "Client: Acme Holdings. Need an accountant.");
eq("a company the words name is a new client", made && [made.fields.client, made.fields.clientKnown], ["Acme Holdings", false]);
const invented = cleanBrief({ client: "Acme Holdings" }, CLIENTS, TEAM, "Need an accountant in Kandy.");
eq("a company the words do not name is dropped", invented?.fields.client, "");
const spelled = cleanBrief({ client: "Hayleys Fabric" }, CLIENTS, TEAM, "hayleys wants a merchandiser");
eq("a desk client the words name is taken, known", spelled && [spelled.fields.client, spelled.fields.clientKnown], ["Hayleys Fabric", true]);

// ── Only the desk's TAs, sane numbers, no country as a city ──
const t = cleanBrief({ team: ["Hasini", "Nobody"], priority: 9, locations: [{ city: "Sri Lanka", people: 3 }, { city: "Kandy", people: 99 }], gender: "Robot" }, CLIENTS, TEAM, "Put Hasini on it");
eq("team = the desk's TAs only", t?.fields.team, ["Hasini Fernando"]);
eq("priority outside 1-5 is not taken", t?.fields.priority, null);
eq("no country as a city; people capped at 50", t?.fields.locations, [{ city: "Kandy", people: 50 }]);
eq("an unknown gender word keeps Any", t?.fields.gender, "Any");
eq("no JSON object = nothing", cleanBrief("nonsense", CLIENTS, TEAM, ""), null);

// ── A correction keeps what it was not asked to change ──
const before: BriefFields = { role: "Project Coordinator", client: "", clientKnown: false, locations: [{ city: "Colombo", people: 1 }], priority: null, team: [], musts: "1–3 years", hiringFor: "Local", gender: "Any" };
const fixed = cleanBrief({ ...before, client: "Hayleys Fabric", priority: 2, reply: "Set the client to Hayleys Fabric and P2." }, CLIENTS, TEAM, `${JD}\nthe client is hayleys fabric, make it P2`, before);
eq("correction: client and priority change", fixed && [fixed.fields.client, fixed.fields.clientKnown, fixed.fields.priority], ["Hayleys Fabric", true, 2]);
eq("correction: the rest kept", fixed && [fixed.fields.role, fixed.fields.musts, fixed.fields.locations], ["Project Coordinator", "1–3 years", [{ city: "Colombo", people: 1 }]]);
eq("correction: read names only the change", fixed?.read, ["client", "priority"]);
eq("correction: the model's sentence is shown", fixed?.reply, "Set the client to Hayleys Fabric and P2.");

// ── What the model is shown ──
const turn = briefTurn({ text: JD, clients: CLIENTS, team: TEAM });
eq("the model sees the desk's clients and TAs", turn.includes("Lanka Tiles PLC | Hayleys Fabric") && turn.includes("Hasini Fernando"), true);
const turn2 = briefTurn({ text: JD, clients: [], team: [], current: before, said: "make it P2" });
eq("a correction shows the fields so far and the sentence", turn2.includes("CURRENT:") && turn2.includes("NEW SENTENCE: make it P2"), true);

// ── The action: signed in first, the allowance, the ledger, a time limit ──
const src = fs.readFileSync("convex/ui/brief.ts", "utf8");
eq("asks ui/me:whoAmI before anything", src.indexOf("api.ui.me.whoAmI") < src.indexOf("getAnthropicClient(TIMEOUT"), true);
eq("stops at the desk's daily AI allowance", src.includes("AI_DAY_LIMIT_USD"), true);
eq("every call is in the ledger as 'brief'", src.includes('feature: "brief"'), true);
eq("has a time limit", /TIMEOUT_MS = 20_000/.test(src), true);
eq("saves nothing (no mutation besides the ledger)", (src.match(/runMutation\(/g) ?? []).length, 1);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
