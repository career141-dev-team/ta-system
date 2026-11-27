/**
 * Unit tests for the tool-calling Chip-Search Agent (services/chip-search/agent.ts)
 * and limitAsked / currentIds wiring (27 Nov 2026).
 */
import assert from "node:assert/strict";
import { createAgent, type AgentModelCaller } from "../services/chip-search/agent";
import { createSearch } from "../convex/lib/search/chipSearch";
import { genderByName, limitAsked } from "../src/lib/chipSearchClient";
import { readSearchBody } from "../src/lib/uiDatabase";

let pass = 0;
const ok = async (label: string, fn: () => void | Promise<void>) => {
  await fn();
  pass++;
  console.log(`  ok   ${label}`);
};

const cards = [
  {
    id: "f_hosp",
    title: "Head of Finance",
    level: 6,
    years: 14,
    place: "colombo",
    gender: "female",
    quals: [{ id: "ca_sl" }],
    jobs: [{ title: "Head of Finance", company: "Asiri Hospital", companyTypes: ["hospital"], start: "2020", end: "present" }],
    skills: ["IFRS", "Hospital Finance"],
    text: "Head of Finance at Asiri Hospital, CA Sri Lanka, SAP S/4HANA rollout.",
    roles: ["finance"],
  },
  {
    id: "f_hotel",
    title: "Head of Finance",
    level: 6,
    years: 15,
    place: "colombo",
    gender: "female",
    quals: [{ id: "acca" }],
    jobs: [{ title: "Head of Finance", company: "Cinnamon Hotels", companyTypes: ["hotel"], start: "2019", end: "present" }],
    skills: ["Hospitality Finance", "ACCA"],
    text: "Head of Finance at Cinnamon Hotels, ACCA qualified.",
    roles: ["finance"],
  },
  {
    id: "u_hosp",
    title: "Head of Finance",
    level: 6,
    years: 16,
    place: "colombo",
    gender: null,
    quals: [{ id: "cima" }],
    jobs: [{ title: "Head of Finance", company: "Nawaloka Hospital", companyTypes: ["hospital"], start: "2018", end: "present" }],
    skills: ["CIMA"],
    text: "Head of Finance at Nawaloka Hospital, CIMA qualified.",
    roles: ["finance"],
  },
  {
    id: "m_hosp",
    title: "Head of Finance",
    level: 6,
    years: 18,
    place: "colombo",
    gender: "male",
    quals: [{ id: "ca_sl" }],
    jobs: [{ title: "Head of Finance", company: "Lanka Hospitals", companyTypes: ["hospital"], start: "2017", end: "present" }],
    skills: ["CA SL"],
    text: "Head of Finance at Lanka Hospitals, CA Sri Lanka.",
    roles: ["finance"],
  },
  {
    id: "f_coffee",
    title: "Head of Finance",
    level: 6,
    years: 12,
    place: "colombo",
    gender: "female",
    quals: [{ id: "ca_sl" }],
    jobs: [{ title: "Head of Finance", company: "Colombo Coffee Company", companyTypes: [], start: "2021", end: "present" }],
    skills: ["FMCG"],
    text: "Head of Finance at Colombo Coffee Company, CA Sri Lanka.",
    roles: ["finance"],
  },
];

// Minimal search stub backed by the same card array.
const stubSearch = Object.assign(
  async (turns: string[]) => {
    const q = turns.join(" ").toLowerCase();
    const hits = cards
      .filter((c) => {
        if (q.includes("hotel") || q.includes("hospitality")) return c.jobs[0].companyTypes.includes("hotel");
        if (q.includes("hospital") || q.includes("healthcare")) return c.jobs[0].companyTypes.includes("hospital");
        return true;
      })
      .map((card, i) => ({ card, score: 300 - i * 10, why: ["exact job title now"] }));
    return { hits, all: hits, removed: [], checked: 0, dups: 0, ms: 1, ai: true, holders: hits.length, missing: [], job: ["Head of Finance"], not: [], industry: [], level: 6, mustQuals: [], years: null, chips: [], roles: [] };
  },
  { checkAll: async (_req: string, hits: any[]) => ({ final: hits, removed: [], checked: hits.length }) },
) as unknown as ReturnType<typeof createSearch>;

await ok("limitAsked parses top-N requests accurately", () => {
  assert.equal(limitAsked("we are looking for a Head of Finance... run this promt and show top 10"), 10);
  assert.equal(limitAsked("give me the first 5 candidates"), 5);
  assert.equal(limitAsked("top 3 female finance heads"), 3);
  assert.equal(limitAsked("show 15 people in Colombo"), 15);
  assert.equal(limitAsked("Head of Finance in Colombo, 10+ years"), null);
  assert.equal(limitAsked("show top 99", 60), 60);
});

await ok("readSearchBody keeps optional currentIds clean", () => {
  const plain = readSearchBody({ q: "Head of Finance" });
  assert.ok(plain.ok && !("currentIds" in plain.body));
  const withIds = readSearchBody({ q: "compare #1 and #2", currentIds: ["f_hosp", "f_hotel", ""] });
  assert.ok(withIds.ok && JSON.stringify(withIds.body.currentIds) === JSON.stringify(["f_hosp", "f_hotel"]));
});

await ok("agent runs multi-industry tools, strips hallucinations & wrong gender, sorts confirmed first, enforces limit", async () => {
  let step = 0;
  const mockModel: AgentModelCaller = async ({ messages }) => {
    step++;
    if (step === 1) {
      return {
        content: [
          { type: "tool_use", id: "t1", name: "run_chip_search", input: { query: "Head of Finance hospital healthcare" } },
          { type: "tool_use", id: "t2", name: "run_chip_search", input: { query: "Head of Finance hotel hospitality" } },
        ],
      };
    }
    if (step === 2) {
      // Verify tool_results came back with real cards and excluded m_hosp (male).
      const last = messages[messages.length - 1];
      const str = JSON.stringify(last);
      assert.ok(str.includes("f_hosp") && str.includes("f_hotel"), "both healthcare and hospitality returned");
      assert.ok(!str.includes("m_hosp"), "confirmed male excluded from female-only tool results");
      return {
        content: [{ type: "tool_use", id: "t3", name: "inspect_cards", input: { ids: ["f_hosp", "f_hotel", "u_hosp"] } }],
      };
    }
    return {
      content: [
        {
          type: "tool_use",
          id: "t4",
          name: "finish_answer",
          input: {
            reply: "Found 2 confirmed female Heads of Finance in Healthcare & Hospitality, plus 1 with gender not on file.",
            read: "Head of Finance · ACA/CIMA/ACCA · Healthcare or Hospitality · Female · top 2",
            candidates: [
              // Put unconfirmed higher fit AND include a hallucinated ID + wrong gender to prove guardrails work.
              { id: "u_hosp", tier: "confirmed", fit: 99, reason: "Nawaloka Hospital, CIMA, gender not on file" },
              { id: "fake_id_999", tier: "confirmed", fit: 98, reason: "Hallucinated" },
              { id: "m_hosp", tier: "confirmed", fit: 97, reason: "Male at Lanka Hospitals" },
              { id: "f_hotel", tier: "confirmed", fit: 92, reason: "Cinnamon Hotels, ACCA, confirmed female" },
              { id: "f_hosp", tier: "confirmed", fit: 95, reason: "Asiri Hospital, CA SL, confirmed female" },
            ],
          },
        },
      ],
    };
  };

  const agent = createAgent(cards, stubSearch, mockModel);
  const res = await agent({
    turns: ["Head of Finance, Healthcare or Hospitality only, Female only, show top 2"],
    wantGender: "female",
    limit: 2,
  });

  assert.ok(res && res.ok);
  assert.equal(res.candidates.length, 2, "honors exact top 2 limit");
  assert.equal(res.total, 3, "reports total verified matches before top-2 cap");
  // Confirmed female candidates MUST rank ahead of u_hosp (gender unknown) despite u_hosp having fit 99.
  assert.deepEqual(
    res.candidates.map((c) => c.id),
    ["f_hosp", "f_hotel"],
    "confirmed women first by fit; hallucinated & male stripped; limit applied",
  );
});

await ok("search_cv_text tool finds niche terms like SAP S/4HANA", async () => {
  let step = 0;
  let foundInTool = "";
  const mockModel: AgentModelCaller = async ({ messages }) => {
    step++;
    if (step === 1) {
      return {
        content: [{ type: "tool_use", id: "s1", name: "search_cv_text", input: { mustWords: ["sap s/4hana"] } }],
      };
    }
    foundInTool = JSON.stringify(messages[messages.length - 1]);
    return {
      content: [
        {
          type: "tool_use",
          id: "s2",
          name: "finish_answer",
          input: {
            reply: "1 candidate mentions SAP S/4HANA.",
            read: "SAP S/4HANA",
            candidates: [{ id: "f_hosp", tier: "confirmed", fit: 95, reason: "SAP S/4HANA rollout at Asiri Hospital" }],
          },
        },
      ],
    };
  };

  const agent = createAgent(cards, stubSearch, mockModel);
  const res = await agent({ turns: ["who has SAP S/4HANA experience?"] });
  assert.ok(foundInTool.includes("f_hosp") && !foundInTool.includes("f_coffee"));
  assert.ok(res && res.candidates.length === 1 && res.candidates[0].id === "f_hosp");
});

await ok("follow-up turn receives currentIds and can answer directly", async () => {
  let firstPrompt = "";
  const mockModel: AgentModelCaller = async ({ messages }) => {
    firstPrompt = String(messages[0].content);
    return {
      content: [
        {
          type: "tool_use",
          id: "c1",
          name: "finish_answer",
          input: {
            reply: "#1 (Asiri Hospital, CA SL) has direct hospital experience; #2 (Cinnamon Hotels, ACCA) brings hospitality leadership.",
            read: "Comparison of #1 and #2",
            candidates: [
              { id: "f_hosp", tier: "confirmed", fit: 95, reason: "Direct hospital finance head" },
              { id: "f_hotel", tier: "confirmed", fit: 92, reason: "Hospitality finance head" },
            ],
          },
        },
      ],
    };
  };

  const agent = createAgent(cards, stubSearch, mockModel);
  const res = await agent({
    turns: ["Head of Finance", "compare #1 and #2"],
    currentIds: ["f_hosp", "f_hotel"],
  });
  assert.ok(firstPrompt.includes("CURRENT_CANDIDATES ON SCREEN") && firstPrompt.includes("f_hosp") && firstPrompt.includes("f_hotel"));
  assert.ok(res && res.reply.includes("Asiri Hospital") && res.candidates.length === 2);
});

await ok("agent returns null cleanly on model failure (triggers fallback)", async () => {
  const agent = createAgent(cards, stubSearch, async () => null);
  const res = await agent({ turns: ["Head of Finance"] });
  assert.equal(res, null);
});

await ok("genderByName falls back to OpenRouter DeepSeek when Anthropic fails", async () => {
  const origFetch = globalThis.fetch;
  const origAnt = process.env.ANTHROPIC_API_KEY;
  const origOr = process.env.OPENROUTER_API_KEY;
  const hosts: string[] = [];
  process.env.ANTHROPIC_API_KEY = "ant-test-key-0123456789";
  process.env.OPENROUTER_API_KEY = "or-test-key-0123456789";
  globalThis.fetch = (async (url: string) => {
    hosts.push(new URL(String(url)).host);
    if (String(url).includes("api.anthropic.com")) return new Response("out of credits", { status: 400 });
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"1":"f","2":"m"}' } }] }), { status: 200 });
  }) as typeof fetch;
  try {
    const res = await genderByName(["Nimali Perera", "Aruna Dharshana"]);
    assert.deepEqual(res, ["f", "m"]);
    assert.deepEqual(hosts, ["api.anthropic.com", "openrouter.ai"]);
  } finally {
    globalThis.fetch = origFetch;
    if (origAnt === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = origAnt;
    if (origOr === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = origOr;
  }
});

console.log(`\n${pass} passed, 0 failed`);
