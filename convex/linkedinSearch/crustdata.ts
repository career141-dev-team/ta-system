/**
 * crustdata.ts — the only Crustdata caller (Full Plan v1.2, sections 6 and 9).
 *
 * - Agent Search: start / poll / read / cancel; timeout → cancel (free) → the engine falls back.
 * - Normal search (/person/search): show more, find one person, gap fill, fallback, count.
 * - One team queue: 6 Agent starts a minute, 5 normal searches a minute (refused calls count too).
 * - 429 → wait for the reset, retry. 402 → stop and report. 403 locked fields → drop them, retry once.
 * - Every charge logged once (`onSpend`); every raw response can be kept 30 days (`onRaw`).
 *
 * Everything outside (HTTP, clock, rate gate, logs) is passed in, so tests run with a fake server
 * and the TA System wires Convex (a table-backed RateGate, liSpend, a raw-response table).
 */
import type { SpendKind } from "./types";

export const API_VERSION = "2025-11-01";
export const DEFAULT_BASE_URL = "https://api.crustdata.com";

export type HttpResponse = {
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
};
export type HttpFetch = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<HttpResponse>;
export type Clock = { now(): number; sleep(ms: number): Promise<void> };

export const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

/** Rate limits per minute for one account. Wire a Convex-table version for many workers. */
export type RateGate = { acquire(bucket: Bucket): Promise<void> };
export type Bucket = "agent_start" | "person_search" | "read";
export const LIMITS: Record<Bucket, number> = { agent_start: 6, person_search: 5, read: 300 };

/** In-process sliding-window gate. Extra calls wait (the page shows "waiting in the team queue"). */
export function memoryRateGate(clock: Clock, limits: Record<Bucket, number> = LIMITS, onWait?: (b: Bucket, ms: number) => void): RateGate {
  const sent: Record<Bucket, number[]> = { agent_start: [], person_search: [], read: [] };
  return {
    async acquire(b) {
      for (;;) {
        const now = clock.now();
        sent[b] = sent[b].filter((t) => now - t < 60_000);
        if (sent[b].length < limits[b]) {
          sent[b].push(now);
          return;
        }
        const wait = 60_000 - (now - sent[b][0]) + 50;
        onWait?.(b, wait);
        await clock.sleep(wait);
      }
    },
  };
}

export type SpendEvent = { kind: SpendKind; credits: number; usd: number; crustdataRef: string; estimated: boolean; meta?: Record<string, unknown> };
export type RawEvent = { at: number; method: string; path: string; status: number; requestBody?: unknown; body: string };

export type CrustdataErrorCode = "low_balance" | "forbidden" | "rate_limited" | "bad_request" | "server" | "unauthorized" | "reserve";
export class CrustdataError extends Error {
  code: CrustdataErrorCode;
  status: number;
  body: unknown;
  constructor(code: CrustdataErrorCode, status: number, message: string, body?: unknown) {
    super(message);
    this.name = "CrustdataError";
    this.code = code;
    this.status = status;
    this.body = body;
  }
}

// ---- Agent Search output (only the `person` part is read) ----------------------------------
export type AgentConstraint = { id: string; text: string; importance?: string };
export type AgentColumn = { key: string; label?: string; field?: string | null };
export type AgentRow = {
  id: number | string;
  values: Record<string, unknown>;
  constraints?: { constraint_id: string; assessment: string; evidence?: string; fields?: string[] }[];
};
export type AgentPerson = { constraints: AgentConstraint[]; columns: AgentColumn[]; rows: AgentRow[] };
export type AgentRead = {
  searchId: string;
  state: "queued" | "running" | "succeeded" | "failed" | "cancelled" | string;
  note: string | null;
  reason: string | null;
  person: AgentPerson | null;
  creditsBody: number | null;
  creditsHeader: number | null;
  error: unknown;
  createdAt: string | null;
};
export type AgentRun = {
  status: "succeeded" | "empty" | "failed" | "timeout" | "cancelled";
  read: AgentRead | null;
  searchId: string | null;
  seconds: number;
  credits: number;
};

export type PersonProfile = Record<string, unknown>;
export type PersonSearchResult = {
  profiles: PersonProfile[];
  totalCount: number | null;
  nextCursor: string | null;
  remarks: unknown[];
  credits: number;
  skippedFields: string[];
};

export type CrustdataDeps = {
  apiKey: string;
  fetch: HttpFetch;
  clock?: Clock;
  baseUrl?: string;
  gate?: RateGate;
  creditPriceUSD?: number;
  /** Stop before a paid call that could take the balance below this many credits. 0 = off. */
  reserveCredits?: number;
  maxRetries?: number;
  onSpend?: (e: SpendEvent) => void | Promise<void>;
  onRaw?: (e: RawEvent) => void;
  onWait?: (bucket: Bucket, ms: number) => void;
};

/** Typical credits per Agent Search of 30 (tests: 0.7–6.2), used only for the reserve check. */
const AGENT_ESTIMATE_CREDITS = 3;
const NORMAL_CREDITS_PER_PERSON = 0.03;

export function createCrustdataClient(deps: CrustdataDeps) {
  const clock = deps.clock ?? realClock;
  const base = deps.baseUrl ?? DEFAULT_BASE_URL;
  const gate = deps.gate ?? memoryRateGate(clock, LIMITS, deps.onWait);
  const price = deps.creditPriceUSD ?? 0.3;
  const maxRetries = deps.maxRetries ?? 4;
  const charged = new Set<string>();

  async function raw(method: string, path: string, bucket: Bucket, body?: unknown, extra?: Record<string, string>) {
    let attempt = 0;
    let sendBody = body as Record<string, unknown> | undefined;
    const skipped: string[] = [];
    for (;;) {
      await gate.acquire(bucket);
      const headers: Record<string, string> = {
        authorization: `Bearer ${deps.apiKey}`,
        "content-type": "application/json",
        "x-api-version": API_VERSION,
        ...(extra ?? {}),
      };
      let res: HttpResponse;
      try {
        res = await deps.fetch(base + path, { method, headers, body: sendBody !== undefined ? JSON.stringify(sendBody) : undefined });
      } catch (e) {
        if (attempt++ >= maxRetries) throw new CrustdataError("server", 0, `Network error: ${(e as Error).message}`);
        await clock.sleep(2000 * attempt);
        continue;
      }
      const text = await res.text();
      deps.onRaw?.({ at: clock.now(), method, path, status: res.status, requestBody: sendBody, body: text });
      let json: Record<string, unknown> = {};
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        json = { raw: text };
      }
      if (res.status >= 200 && res.status < 300) return { json, res, skipped };
      const err = (json.error ?? {}) as { type?: string; message?: string; metadata?: { denied_fields?: string[] }[] };
      const msg = err.message ?? text.slice(0, 200);
      if (res.status === 429 || (res.status === 503 && res.headers.get("retry-after"))) {
        if (attempt++ >= maxRetries) throw new CrustdataError("rate_limited", res.status, `Rate limit: ${msg}`, json);
        const reset = Number(res.headers.get("x-ratelimit-reset") ?? res.headers.get("retry-after") ?? "60");
        await clock.sleep(Math.max(1, Number.isFinite(reset) ? reset : 60) * 1000 + 250 * attempt);
        continue;
      }
      if (res.status === 402) throw new CrustdataError("low_balance", 402, `Crustdata balance too low: ${msg}`, json);
      if (res.status === 401) throw new CrustdataError("unauthorized", 401, "Crustdata key refused.", json);
      if (res.status === 403) {
        const denied = err.metadata?.flatMap((m) => m.denied_fields ?? []) ?? [];
        const fields = sendBody && Array.isArray(sendBody.fields) ? (sendBody.fields as string[]) : null;
        if (denied.length && fields && skipped.length === 0) {
          const keep = fields.filter((f) => !denied.some((d) => f === d || f.startsWith(d + ".")));
          if (keep.length && keep.length < fields.length) {
            skipped.push(...fields.filter((f) => !keep.includes(f)));
            sendBody = { ...sendBody, fields: keep };
            continue;
          }
        }
        throw new CrustdataError("forbidden", 403, `Not allowed: ${msg}`, json);
      }
      if (res.status >= 500) {
        if (attempt++ >= Math.min(2, maxRetries)) throw new CrustdataError("server", res.status, `Crustdata error ${res.status}: ${msg}`, json);
        await clock.sleep(2000 * attempt);
        continue;
      }
      throw new CrustdataError("bad_request", res.status, `Crustdata refused the request (${res.status}): ${msg}`, json);
    }
  }

  function headerCredits(res: HttpResponse): number | null {
    const h = res.headers.get("x-credits-used");
    if (h == null || h === "") return null;
    const n = Number(h);
    return Number.isFinite(n) ? n : null;
  }

  async function logOnce(kind: SpendKind, ref: string, credits: number, estimated: boolean, meta?: Record<string, unknown>) {
    if (charged.has(ref)) return;
    charged.add(ref);
    await deps.onSpend?.({ kind, credits, usd: Math.round(credits * price * 10000) / 10000, crustdataRef: ref, estimated, meta });
  }

  async function balance(): Promise<number | null> {
    const { json } = await raw("GET", "/account/credits", "read");
    const acct = (json.account ?? json) as { credits?: number };
    return typeof acct.credits === "number" ? acct.credits : null;
  }

  async function guardReserve(estimate: number) {
    if (!deps.reserveCredits) return;
    const left = await balance();
    if (left != null && left - estimate < deps.reserveCredits) {
      throw new CrustdataError(
        "reserve",
        0,
        `Stopped before a paid call: ${left.toFixed(1)} credits left, ${deps.reserveCredits} are kept in reserve.`,
      );
    }
  }

  function parseRead(json: Record<string, unknown>, res: HttpResponse): AgentRead {
    const out = (json.output ?? null) as { note?: string; reason?: string; person?: AgentPerson } | null;
    const cu = (json.credits_used ?? null) as { total_cost?: number } | null;
    return {
      searchId: String(json.search_id ?? ""),
      state: String(json.state ?? "unknown"),
      note: out?.note ?? null,
      reason: out?.reason ?? null,
      person: out?.person ?? null,
      creditsBody: typeof cu?.total_cost === "number" ? cu.total_cost : null,
      creditsHeader: headerCredits(res),
      error: json.error ?? null,
      createdAt: (json.created_at as string) ?? null,
    };
  }

  const TERMINAL = new Set(["succeeded", "failed", "cancelled"]);

  const client = {
    balance,

    async startAgent(query: string, idempotencyKey: string): Promise<{ searchId: string; state: string }> {
      if (query.length < 1 || query.length > 10_000) throw new CrustdataError("bad_request", 0, "Agent query must be 1–10,000 characters.");
      await guardReserve(AGENT_ESTIMATE_CREDITS);
      const { json } = await raw("POST", "/agent/searches", "agent_start", { query }, { "Idempotency-Key": idempotencyKey });
      return { searchId: String(json.search_id), state: String(json.state ?? "running") };
    },

    async readAgent(searchId: string): Promise<AgentRead> {
      const { json, res } = await raw("GET", `/agent/searches/${encodeURIComponent(searchId)}`, "read");
      return parseRead(json, res);
    },

    async cancelAgent(searchId: string): Promise<void> {
      await raw("POST", `/agent/searches/${encodeURIComponent(searchId)}/cancel`, "read", {});
    },

    /** Start, wait, read. Charges are logged once per search id (repeats with the same key cost $0). */
    async runAgent(
      query: string,
      idempotencyKey: string,
      opts: { timeoutSeconds?: number; pollSeconds?: number; isCancelled?: () => boolean | Promise<boolean>; onStarted?: (searchId: string) => void; meta?: Record<string, unknown> } = {},
    ): Promise<AgentRun> {
      const t0 = clock.now();
      const timeoutMs = (opts.timeoutSeconds ?? 300) * 1000;
      const poll = (opts.pollSeconds ?? 10) * 1000;
      const started = await client.startAgent(query, idempotencyKey);
      opts.onStarted?.(started.searchId);
      let read: AgentRead | null = null;
      // A repeat with the same idempotency key may already be finished: read at once.
      for (let first = true; ; first = false) {
        if (!first) {
          if (await opts.isCancelled?.()) {
            await client.cancelAgent(started.searchId);
            return { status: "cancelled", read, searchId: started.searchId, seconds: (clock.now() - t0) / 1000, credits: 0 };
          }
          if (clock.now() - t0 > timeoutMs) {
            await client.cancelAgent(started.searchId);
            return { status: "timeout", read, searchId: started.searchId, seconds: (clock.now() - t0) / 1000, credits: 0 };
          }
          await clock.sleep(poll);
        }
        read = await client.readAgent(started.searchId);
        if (TERMINAL.has(read.state)) break;
      }
      const seconds = (clock.now() - t0) / 1000;
      // Charged once, on the first read that sees the end. Prefer the header (0 on later reads).
      const credits = read.creditsHeader ?? read.creditsBody ?? 0;
      if (read.state === "succeeded") await logOnce("agent", started.searchId, credits, read.creditsHeader == null, opts.meta);
      const status: AgentRun["status"] =
        read.state === "succeeded" ? ((read.person?.rows.length ?? 0) === 0 ? "empty" : "succeeded") : read.state === "cancelled" ? "cancelled" : "failed";
      return { status, read, searchId: started.searchId, seconds, credits: read.state === "succeeded" ? credits : 0 };
    },

    /** Normal search. `kind` decides the spend-log line. */
    async personSearch(body: Record<string, unknown>, kind: SpendKind, meta?: Record<string, unknown>): Promise<PersonSearchResult> {
      const limit = Number(body.limit ?? 20);
      await guardReserve(limit * NORMAL_CREDITS_PER_PERSON);
      const { json, res, skipped } = await raw("POST", "/person/search", "person_search", body);
      const profiles = (json.profiles ?? json.data ?? json.results ?? []) as PersonProfile[];
      const header = headerCredits(res);
      const credits = header ?? profiles.length * NORMAL_CREDITS_PER_PERSON;
      const ref = `ps-${clock.now()}-${Math.random().toString(36).slice(2, 8)}`;
      if (credits > 0) await logOnce(kind, ref, credits, header == null, meta);
      return {
        profiles,
        totalCount: typeof json.total_count === "number" ? json.total_count : null,
        nextCursor: (json.next_cursor as string) ?? null,
        remarks: (json.remarks as unknown[]) ?? [],
        credits,
        skippedFields: skipped,
      };
    },

    /** Market size: a limit-1 search; reads total_count (≈ 0.03 credits). */
    async count(body: Record<string, unknown>, meta?: Record<string, unknown>): Promise<number | null> {
      const r = await client.personSearch({ ...body, limit: 1, fields: ["crustdata_person_id"] }, "count", meta);
      return r.totalCount;
    },
  };
  return client;
}

export type CrustdataClient = ReturnType<typeof createCrustdataClient>;

/** Adapter for the global fetch (Node 18+, Convex actions). */
export const globalFetch: HttpFetch = async (url, init) => {
  const r = await fetch(url, init);
  return { status: r.status, headers: r.headers, text: () => r.text() };
};
