// Referral Search inside the Database chat (owner 14 Nov 2026: "the same chat UI...
// they change the mode in the search bar"). The referees named on the CVs we hold:
// a way into a company ("HR Managers at Dialog") and a number for someone being
// checked. Old system's rules (ReferralResults / ReferralCard): a sentence is read into
// titles and companies, shown as chips that can be taken off; each referee shows the
// title and company the CV gave (old, so said as "from a CV"), phone and email, who
// named them, and a CV we may hold under the same name; ticked ones export to Excel.
// A pasted list of names is answered by the people check (aura.ts).
// ponytail: sample referees and word rules; with the backend, the referee table and
// one model call that reads the sentence.

import type { Chip, Reply } from "./aura";

export type Referee = {
  id: string;
  name: string;
  title?: string;
  company?: string;
  industry: string;
  phone?: string;
  email?: string;
  namedBy: string[];
  read: string;
};

const R = (id: string, name: string, title: string | undefined, company: string, industry: string, phone: string | undefined, email: string | undefined, namedBy: string[], read: string): Referee => ({
  id,
  name,
  title,
  company,
  industry,
  phone,
  email,
  namedBy,
  read,
});

export const REFEREES: Referee[] = [
  R("r1", "Shalini Gunawardena", "HR Manager", "Dialog", "Telecom", "+94 77 410 2231", "shalini.g@example.com", ["Ishara Silva", "Ruwan Jayasinghe"], "Mar 2025"),
  R("r2", "Mahesh Rodrigo", "Head of HR", "Dialog", "Telecom", "+94 71 220 9184", undefined, ["Hiruni Fernando"], "Jan 2026"),
  R("r3", "Anjali Wijeratne", "HR Manager", "Hemas", "Healthcare", undefined, "anjali.w@example.com", ["Tharushi Bandara"], "Aug 2024"),
  R("r4", "Roshan Dias", "Finance Director", "Hemas", "Healthcare", "+94 76 885 0412", "roshan.d@example.com", ["Nimali Fernando", "Kasun Perera", "Sachini Perera"], "Oct 2025"),
  R("r5", "Dilan Abeywickrama", "General Manager", "Cargills", "Retail", "+94 77 993 1102", undefined, ["Chamara Silva"], "Jun 2025"),
  R("r6", "Priyanka Senaratne", "General Manager", "Keells Super", "Retail", "+94 71 554 3390", "priyanka.s@example.com", ["Pasindu Silva"], "Feb 2026"),
  R("r7", "Nuwan Karunaratne", "Plant Manager", "Lanka Tiles", "Manufacturing", "+94 75 301 7765", undefined, ["Pasindu Silva", "Sahan Wickramasinghe"], "Sep 2025"),
  R("r8", "Kasun Perera", "SAP Lead", "Virtusa", "Technology", "+94 77 000 0000", "kasun.p@example.com", ["Dilini Ranasinghe"], "Nov 2025"),
  R("r9", "Thilini Jayawardena", "Finance Manager", "Unilever", "FMCG", "+94 77 640 2208", "thilini.j@example.com", ["Nadeesha Perera"], "Jul 2025"),
  R("r10", "Asanka Peiris", "Sales Director", "Nestlé", "FMCG", undefined, undefined, ["Ruwan Jayasinghe"], "Apr 2024"),
  R("r11", "Gayani Herath", undefined, "Cargills", "Retail", "+94 71 118 4402", undefined, ["Hiruni Fernando"], "Dec 2025"),
  R("r12", "Chathura Fonseka", "HR Business Partner", "John Keells", "Conglomerate", "+94 77 802 1199", "chathura.f@example.com", ["Tharushi Bandara"], "May 2025"),
];

const TITLES = ["head of hr", "hr business partner", "hr manager", "general manager", "finance director", "finance manager", "sales director", "plant manager", "sap lead"];
const COMPANIES = [...new Set(REFEREES.map((r) => r.company!))];
const INDUSTRIES = [...new Set(REFEREES.map((r) => r.industry))];
const cap = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bHr\b/, "HR").replace(/\bSap\b/, "SAP");

/** Titles, companies and industries in a sentence, as chips (plurals and "HR" read). */
export function readAsk(text: string): Chip[] {
  const t = " " + text.toLowerCase().replace(/managers/g, "manager").replace(/directors/g, "director").replace(/partners/g, "partner").replace(/leads/g, "lead") + " ";
  const chips: Chip[] = [];
  for (const ti of TITLES) if (t.includes(ti) && !chips.some((c) => c.test.includes(ti))) chips.push({ label: cap(ti), added: false, test: "title:" + ti });
  if (!chips.length && /\bhr\b/.test(t)) chips.push({ label: "HR", added: false, test: "title:hr" });
  for (const c of COMPANIES) if (t.includes(" " + c.toLowerCase())) chips.push({ label: c, added: false, test: "company:" + c.toLowerCase() });
  for (const i of INDUSTRIES) if (t.includes(i.toLowerCase())) chips.push({ label: i, added: false, test: "industry:" + i.toLowerCase() });
  return chips;
}

const keep = (r: Referee, chips: Chip[]) => {
  const titles = chips.filter((c) => c.test.startsWith("title:")).map((c) => c.test.slice(6));
  const firms = chips.filter((c) => c.test.startsWith("company:")).map((c) => c.test.slice(8));
  const inds = chips.filter((c) => c.test.startsWith("industry:")).map((c) => c.test.slice(9));
  const title = (r.title ?? "").toLowerCase();
  return (
    (!titles.length || titles.some((x) => (x === "hr" ? /\bhr\b/.test(title) : title.includes(x)))) &&
    (!firms.length || firms.includes((r.company ?? "").toLowerCase())) &&
    (!inds.length || inds.includes(r.industry.toLowerCase()))
  );
};

/** AURA's answer in Referees mode. `before` is the last answer's chips (a refinement). */
export function refereeReply(text: string, before: Chip[]): Reply {
  const rm = text.match(/^remove\s+(.+)$/i);
  let chips: Chip[];
  if (rm) chips = before.filter((c) => c.label.toLowerCase() !== rm[1].trim().toLowerCase());
  else {
    const fresh = readAsk(text);
    if (!fresh.length) return { text: "Say a title, a company, or both — for example “HR Managers at Dialog” or “General Managers in retail”. Or paste names to check.", warn: true };
    // Same kind replaces, a new kind adds: "at Hemas" after "HR Managers at Dialog".
    const kinds = new Set(fresh.map((c) => c.test.split(":")[0]));
    chips = [...before.filter((c) => !kinds.has(c.test.split(":")[0])), ...fresh.map((c) => ({ ...c, added: before.length > 0 }))];
  }
  const found = REFEREES.filter((r) => keep(r, chips));
  const said = chips.map((c) => c.label).join(" · ") || "everyone";
  if (!found.length)
    return { text: `No referee on our CVs matches ${said}. Take a filter off, or try another company.`, chips, warn: true, referees: [] };
  return {
    text: `${found.length} ${found.length === 1 ? "referee" : "referees"} named on our CVs — ${said}. Titles and companies are what each CV said, so check before you call.`,
    chips,
    referees: found,
  };
}

/** Ticked referees as an Excel-ready CSV (formula cells defused, as the old export). */
export function toCsv(list: Referee[]) {
  const cell = (v: unknown) => `"${String(v ?? "").replace(/^[=+@\-\t\r]/, "'$&").replaceAll('"', '""')}"`;
  const head = ["Name", "Title (from the CV)", "Company (from the CV)", "Phone", "Email", "Named by", "CV read"];
  const rows = list.map((r) => [r.name, r.title, r.company, r.phone, r.email, r.namedBy.join("; "), r.read].map(cell).join(","));
  return "﻿" + [head.join(","), ...rows].join("\r\n");
}
