/**
 * A fake Crustdata server for tests (no spend). Implements the HTTP behaviour seen in the real API:
 * rate limits per minute with x-ratelimit-reset, idempotency keys, charge header on the first finished read,
 * 402 / 403 / 429 errors, failed and never-ending Agent Searches, and /person/search with filters.
 */
import type { Clock, HttpFetch, HttpResponse } from "../convex/linkedinSearch/crustdata";

export function fakeClock(start = Date.parse("2026-11-26T09:00:00Z")): Clock & { t: number } {
  const c = {
    t: start,
    now: () => c.t,
    sleep: async (ms: number) => {
      c.t += ms;
    },
  };
  return c;
}

export type FakePerson = {
  id: number;
  name: string;
  title: string;
  company: string;
  city: string | null;
  country: string;
  headline: string;
  years: number;
  url: string;
};

export function makePeople(n: number, over: Partial<FakePerson> = {}, start = 1000): FakePerson[] {
  return Array.from({ length: n }, (_, i) => ({
    id: start + i,
    name: `Person ${start + i}`,
    title: "Quantity Surveyor",
    company: `Company ${(i % 7) + 1}`,
    city: "Colombo",
    country: "Sri Lanka",
    headline: "Quantity Surveyor at a building firm",
    years: 6 + (i % 5),
    url: `https://www.linkedin.com/in/person-${start + i}`,
    ...over,
  }));
}

type AgentState = { owner: string; id: string; query: string; reads: number; doneAfter: number; outcome: "succeeded" | "failed" | "never"; cancelled: boolean; charged: boolean; people: FakePerson[]; credits: number };

export type FakeOptions = {
  people?: FakePerson[];
  /** People the Agent Search returns (defaults to `people`). */
  agentPeople?: FakePerson[];
  agentOutcome?: "succeeded" | "failed" | "never";
  agentReadsUntilDone?: number;
  agentCredits?: number;
  /** Column naming style for Agent output. */
  columnStyle?: "standard" | "variant" | "swapped" | "blanks";
  balance?: number;
  /** Separate Crustdata accounts by key (two keys = two balances). Keys not listed use the single balance. */
  keyBalances?: Record<string, number>;
  lockedFields?: string[];
  /** Force the next N calls of a path prefix to 429 (counts as calls). */
  force429?: { path: string; times: number; reset: number };
  limits?: { agent: number; person: number };
  sendCreditHeader?: boolean;
};

export function fakeCrustdata(clock: Clock, opts: FakeOptions = {}) {
  const people = opts.people ?? makePeople(60);
  const agentPeople = opts.agentPeople ?? people;
  const searches = new Map<string, AgentState>();
  const idem = new Map<string, string>();
  const calls: { method: string; path: string; status: number; at: number; body?: unknown; headers: Record<string, string> }[] = [];
  const hits: Record<string, number[]> = { agent: [], person: [] };
  const limits = { agent: opts.limits?.agent ?? 6, person: opts.limits?.person ?? 5 };
  let balance = opts.balance ?? 1000;
  const keyBal: Record<string, number> = { ...(opts.keyBalances ?? {}) };
  let who = ""; // the API key of the request being served
  const bal = () => (who in keyBal ? keyBal[who] : balance);
  const spend = (c: number) => {
    if (who in keyBal) keyBal[who] -= c;
    else balance -= c;
  };
  let force = opts.force429 ? { ...opts.force429 } : null;
  let seq = 0;
  const sendHeader = opts.sendCreditHeader ?? true;

  const respond = (status: number, body: unknown, headers: Record<string, string> = {}): HttpResponse => {
    const h = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
    return { status, headers: { get: (n) => h.get(n.toLowerCase()) ?? null }, text: async () => JSON.stringify(body) };
  };

  const limited = (bucket: "agent" | "person"): HttpResponse | null => {
    const now = clock.now();
    hits[bucket] = hits[bucket].filter((t) => now - t < 60_000);
    hits[bucket].push(now); // refused calls count too
    if (hits[bucket].length > limits[bucket]) {
      const reset = Math.ceil((60_000 - (now - hits[bucket][0])) / 1000);
      return respond(429, { error: { type: "rate_limit_error", message: "Rate limit exceeded for this endpoint.", metadata: [] } }, { "x-ratelimit-reset": String(reset) });
    }
    return null;
  };

  function agentOutput(s: AgentState) {
    const style = opts.columnStyle ?? "standard";
    const cols =
      style === "variant"
        ? [
            { key: "full_name", label: "Full name", field: "basic_profile.name" },
            { key: "linkedin", label: "LinkedIn", field: "social_handles.professional_network_identifier.profile_url" },
            { key: "role", label: "Current role", field: null },
            { key: "employer", label: "Employer", field: null },
            { key: "based_in", label: "Based in", field: null },
            { key: "total_exp", label: "Total experience", field: null },
          ]
        : [
            { key: "name", label: "Name", field: "basic_profile.name" },
            { key: "profile_url", label: "Profile URL", field: "social_handles.professional_network_identifier.profile_url" },
            { key: "current_title", label: "Current title", field: null },
            { key: "current_company", label: "Current company", field: null },
            { key: "location", label: "Location", field: null },
            { key: "experience", label: "Years of experience", field: null },
            { key: "basic_profile_headline", label: "Headline", field: "basic_profile.headline" },
          ];
    const rows = s.people.map((p, i) => {
      let values: Record<string, unknown>;
      if (style === "variant") {
        values = { full_name: p.name, linkedin: p.url, role: p.title, employer: p.company, based_in: [p.city, p.country].filter(Boolean).join(", "), total_exp: i % 3 === 0 ? `More than ${p.years}` : `${p.years} years` };
      } else {
        values = {
          name: p.name, profile_url: p.url, current_title: p.title, current_company: p.company,
          location: [p.city, p.country].filter(Boolean).join(", "), experience: String(p.years), basic_profile_headline: p.headline,
        };
        if (style === "swapped" && i % 2 === 0) {
          values.current_title = `${p.title} at ${p.company} | Building projects | MRICS`;
          values.basic_profile_headline = p.title;
        }
        if (style === "blanks" && i % 4 === 0) {
          values.current_title = "";
          values.current_company = "Not listed";
          values.location = null;
          values.experience = "Not listed";
        }
      }
      return {
        id: p.id,
        values,
        constraints: [
          { constraint_id: "c1", assessment: "satisfied", evidence: `Lives in ${p.country}.` },
          { constraint_id: "c2", assessment: i % 5 === 0 ? "violated" : "satisfied", evidence: `Title is ${p.title}.` },
        ],
      };
    });
    return {
      note: "Found people matching the requirements.",
      reason: null,
      person: {
        constraints: [
          { id: "c1", text: "The person is currently based in Sri Lanka.", importance: "core" },
          { id: "c2", text: "The person's current title is like Quantity Surveyor.", importance: "core" },
        ],
        columns: cols,
        rows,
      },
    };
  }

  const fetch: HttpFetch = async (url, init) => {
    const path = url.replace(/^https?:\/\/[^/]+/, "");
    const body = init.body ? JSON.parse(init.body) : undefined;
    const log = (r: HttpResponse) => {
      calls.push({ method: init.method, path, status: r.status, at: clock.now(), body, headers: init.headers });
      return r;
    };
    if (!/^Bearer .+/.test(init.headers.authorization ?? "")) return log(respond(401, { error: { type: "unauthorized", message: "bad key" } }));
    who = init.headers.authorization.slice(7);
    if (init.headers["x-api-version"] !== "2025-11-01") return log(respond(400, { error: { type: "invalid_request", message: "version" } }));
    if (force && path.startsWith(force.path) && force.times > 0) {
      force.times--;
      return log(respond(429, { error: { type: "rate_limit_error", message: "Rate limit exceeded", metadata: [] } }, { "x-ratelimit-reset": String(force.reset) }));
    }
    if (path === "/account/credits") return log(respond(200, { account: { credits: bal() } }));

    if (path === "/agent/searches" && init.method === "POST") {
      const lim = limited("agent");
      if (lim) return log(lim);
      if (bal() <= 0) return log(respond(402, { error: { type: "insufficient_credits", message: "Insufficient credits." } }));
      const key = init.headers["Idempotency-Key"];
      if (key && idem.has(key)) {
        const id = idem.get(key)!;
        return log(respond(202, { search_id: id, state: searches.get(id)!.reads >= searches.get(id)!.doneAfter ? "succeeded" : "running" }));
      }
      const m = String(body.query).match(/Find (\d+) people/);
      const n = m ? +m[1] : 30;
      const id = `41690-${(++seq).toString().padStart(4, "0")}`;
      searches.set(id, {
        owner: who,
        id, query: body.query, reads: 0, doneAfter: opts.agentReadsUntilDone ?? 3, outcome: opts.agentOutcome ?? "succeeded",
        cancelled: false, charged: false, people: agentPeople.slice(0, n), credits: opts.agentCredits ?? 2.5,
      });
      if (key) idem.set(key, id);
      return log(respond(202, { search_id: id, state: "running" }));
    }
    const read = path.match(/^\/agent\/searches\/([^/]+)$/);
    if (read && init.method === "GET") {
      const s = searches.get(decodeURIComponent(read[1]));
      if (!s || (who in keyBal && s.owner !== who)) return log(respond(404, { error: { type: "not_found", message: "no search" } }));
      s.reads++;
      if (s.cancelled) return log(respond(200, { search_id: s.id, state: "cancelled", output: null, credits_used: { total_cost: 0 }, error: null }));
      if (s.outcome === "never" || s.reads < s.doneAfter) return log(respond(200, { search_id: s.id, state: "running", output: null, credits_used: null, error: null }));
      if (s.outcome === "failed") return log(respond(200, { search_id: s.id, state: "failed", output: null, credits_used: { total_cost: 0 }, error: { type: "internal", message: "boom", metadata: [{ retryable: true }] } }));
      const first = !s.charged;
      if (first) {
        s.charged = true;
        spend(s.credits);
      }
      const headers: Record<string, string> = sendHeader ? { "x-credits-used": first ? String(s.credits) : "0" } : {};
      return log(respond(200, { search_id: s.id, query: s.query, state: "succeeded", created_at: "2026-11-26T09:00:00Z", output: agentOutput(s), credits_used: { agent_cost: s.credits * 0.7, search_cost: s.credits * 0.3, enrich_cost: 0, contact_cost: 0, total_cost: s.credits }, error: null }, headers));
    }
    const cancel = path.match(/^\/agent\/searches\/([^/]+)\/cancel$/);
    if (cancel) {
      const s = searches.get(decodeURIComponent(cancel[1]));
      if (s) s.cancelled = true;
      return log(respond(202, { search_id: cancel[1], state: "cancelled" }));
    }

    if (path === "/person/search") {
      const lim = limited("person");
      if (lim) return log(lim);
      if (bal() <= 0) return log(respond(402, { error: { type: "insufficient_credits", message: "Insufficient credits." } }));
      const fields: string[] = body.fields ?? [];
      const locked = (opts.lockedFields ?? []).filter((l) => fields.some((f) => f === l || f.startsWith(l + ".")));
      if (locked.length) {
        return log(respond(403, { error: { type: "permission_error", message: `Access denied to fields: ${locked.join(", ")}.`, metadata: [{ denied_fields: locked, permitted_fields: ["basic_profile"] }] } }));
      }
      const conds: { field: string; type: string; value: unknown }[] = body.filters?.conditions ?? (body.filters ? [body.filters] : []);
      let list = people.slice();
      for (const c of conds) {
        if (c.field === "basic_profile.location.country" && c.type === "=") list = list.filter((p) => p.country.toLowerCase() === String(c.value).toLowerCase());
        if (c.field === "crustdata_person_id" && c.type === "not_in") list = list.filter((p) => !(c.value as number[]).includes(p.id));
        if (c.field === "crustdata_person_id" && c.type === "in") list = list.filter((p) => (c.value as number[]).includes(p.id));
        if (c.field === "basic_profile.name" && c.type === "(.)") list = list.filter((p) => p.name.toLowerCase().includes(String(c.value).toLowerCase()));
        if (c.field === "social_handles.professional_network_identifier.profile_url") list = list.filter((p) => p.url === c.value);
      }
      const page = list.slice(0, body.limit ?? 20);
      const credits = Math.round(page.length * 0.03 * 1000) / 1000;
      spend(credits);
      const withCompany = fields.includes("experience.employment_details.current");
      const profiles = page.map((p) => ({
        crustdata_person_id: p.id,
        basic_profile: { name: p.name, headline: p.headline, current_title: p.title, location: { city: p.city, country: p.country, raw: [p.city, p.country].filter(Boolean).join(", ") }, last_updated: "2026-10-01" },
        social_handles: { professional_network_identifier: { profile_url: p.url } },
        ...(withCompany ? { experience: { employment_details: { current: [{ name: p.company, title: p.title, is_default: true }] } } } : {}),
        fit: "possible",
      }));
      return log(respond(200, { profiles, next_cursor: null, total_count: list.length, total_count_relation: "eq", remarks: [] }, sendHeader ? { "x-credits-used": String(credits) } : {}));
    }
    return log(respond(404, { error: { type: "not_found", message: path } }));
  };

  return {
    fetch,
    calls,
    searches,
    get balance() {
      return balance;
    },
    set balance(v: number) {
      balance = v;
    },
  };
}
