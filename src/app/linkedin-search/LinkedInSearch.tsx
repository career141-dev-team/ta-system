"use client";

import { useState } from "react";

// LinkedIn's own experience bands (the actor's yearsOfExperienceIds).
const YEARS = [
  ["", "Any"],
  ["1", "Under 1 year"],
  ["2", "1–2 years"],
  ["3", "3–5 years"],
  ["4", "6–10 years"],
  ["5", "More than 10 years"],
];

// The actor's output shape is only partly known: read every field defensively.
type Item = {
  firstName?: string;
  lastName?: string;
  headline?: string;
  linkedinUrl?: string;
  location?: { linkedinText?: string } | string;
  currentPosition?: { companyName?: string; position?: string }[];
  experience?: { position?: string; companyName?: string }[];
  skills?: ({ name?: string } | string)[];
};

const field =
  "h-10 w-full rounded-sm border border-border bg-surface px-3 text-small outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";
const label = "mb-1 block text-caption font-medium text-ink-2";

export default function LinkedInSearch() {
  const [f, setF] = useState({ designation: "", skills: "", years: "", company: "", location: "", maxItems: "10" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [items, setItems] = useState<Item[] | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/linkedin-search", { method: "POST", body: JSON.stringify(f) });
      // The dev link is a static site with no server, so the search route is not there.
      const data = await res.json().catch(() => {
        throw new Error("LinkedIn search needs the server. It runs on a local copy with APIFY_TOKEN set, not on the dev link yet.");
      });
      if (!res.ok) throw new Error(data.error ?? "Search failed");
      setItems(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-8 max-md:p-4">
      <form onSubmit={search} className="grid grid-cols-3 gap-4 max-lg:grid-cols-2 max-md:grid-cols-1">
        <label>
          <span className={label}>DESIGNATION</span>
          <input className={field} value={f.designation} onChange={set("designation")} placeholder="Software Engineer, Tech Lead" />
        </label>
        <label>
          <span className={label}>SKILLS</span>
          <input className={field} value={f.skills} onChange={set("skills")} placeholder="React, Node.js" />
        </label>
        <label>
          <span className={label}>YEARS OF EXPERIENCE</span>
          <select className={field} value={f.years} onChange={set("years")}>
            {YEARS.map(([v, t]) => (
              <option key={v} value={v}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          <span className={label}>CURRENT COMPANY</span>
          <input className={field} value={f.company} onChange={set("company")} placeholder="WSO2 or a LinkedIn company URL" />
        </label>
        <label>
          <span className={label}>LOCATION</span>
          <input className={field} value={f.location} onChange={set("location")} placeholder="Colombo, Sri Lanka" />
        </label>
        <label>
          <span className={label}>HOW MANY (MAX 50)</span>
          <input className={field} type="number" min={1} max={50} value={f.maxItems} onChange={set("maxItems")} />
        </label>
        <div className="col-span-full flex items-center gap-4">
          <button disabled={busy} className="h-10 rounded-full bg-brand px-6 text-small font-medium text-white hover:bg-brand-strong disabled:opacity-60">
            {busy ? "Searching…" : "Search LinkedIn"}
          </button>
          <span className="text-small text-ink-3">Separate several values with commas. Each profile costs about $0.008.</span>
        </div>
      </form>

      {error && <p className="rounded-sm bg-danger-soft px-4 py-3 text-small text-danger">{error}</p>}
      {items && !items.length && !error && <p className="text-small text-ink-2">No profiles found.</p>}

      <ul className="flex flex-col gap-3">
        {items?.map((p, i) => {
          const loc = typeof p.location === "string" ? p.location : p.location?.linkedinText;
          const now = p.currentPosition?.[0] ?? p.experience?.[0];
          const skills = (p.skills ?? []).map((s) => (typeof s === "string" ? s : s.name)).filter(Boolean).slice(0, 8);
          return (
            <li key={p.linkedinUrl ?? i} className="rounded-md bg-surface p-4 shadow-card">
              <div className="flex items-baseline justify-between gap-4">
                <p className="text-body font-medium">{[p.firstName, p.lastName].filter(Boolean).join(" ") || "Unnamed"}</p>
                {p.linkedinUrl && (
                  <a href={p.linkedinUrl} target="_blank" rel="noreferrer" className="text-small text-brand hover:underline">
                    Open on LinkedIn
                  </a>
                )}
              </div>
              <p className="text-small text-ink-2">{p.headline}</p>
              <p className="text-small text-ink-3">{[now?.position, now?.companyName, loc].filter(Boolean).join(" · ")}</p>
              {skills.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {skills.map((s) => (
                    <span key={s} className="rounded-full bg-surface-2 px-2.5 py-0.5 text-caption text-ink-2">{s}</span>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
