// A real opening's job description for the JD screen (20 Nov 2026): the stored markdown
// ("## TITLE", "**Client** · ...", "### About the role", "- a point") read into the same
// sections the screen draws, and "what we match candidates on" read from the opening's
// own requirements - nothing invented, nothing the backend did not send.

import type { Section } from "./jdState";

/** Markdown marks off, spaces tidied. */
const plain = (s: string) => s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1").replace(/`/g, "").replace(/\s+/g, " ").trim();

/** The JD text as the sections the screen draws. The first "#" or "##" heading is the title
 *  (the opening's own title is used instead when it has one); "**Key** · value" lines above
 *  the first "###" become the line of chips under the title. */
export function parseJd(markdown: string | null, fallbackTitle: string | null): { title: string; metaText: string; sections: Section[] } {
  let title = "";
  const meta: string[] = [];
  const sections: Section[] = [];
  let cur: Section | null = null;
  let gap = false;
  for (const raw of (markdown ?? "").replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (!line) {
      gap = true;
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      if (!title && h[1].length <= 2 && !sections.length) title = plain(h[2]);
      else {
        cur = { h: plain(h[2]) };
        sections.push(cur);
      }
      gap = false;
      continue;
    }
    const kv = /^\*\*(.+?)\*\*\s*[·:–-]\s*(.+)$/.exec(line);
    if (!cur && kv) {
      meta.push(plain(kv[2]));
      continue;
    }
    if (!cur) {
      cur = { h: "About the job" };
      sections.push(cur);
    }
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    if (bullet) (cur.list ??= []).push(plain(bullet[1]));
    else {
      const text = plain(line);
      cur.p = cur.p ? cur.p + (gap ? "\n\n" : " ") + text : text;
    }
    gap = false;
  }
  return { title: fallbackTitle?.trim() || title, metaText: meta.join(", "), sections };
}

export type Requirements = {
  niceToHave?: string[];
  requiredSkills?: string[];
  salaryCurrency?: string | null;
  salaryMax?: number | null;
  salaryMin?: number | null;
  seniority?: string | null;
  yearsMax?: number | null;
  yearsMin?: number | null;
};

const money = (n: number) => (n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `${Math.round(n / 1000)}K` : `${n}`);

/** The chips under "What we match candidates on": years, level, the skills it needs,
 *  where, and the pay - only what the opening's requirements and places really hold. */
export function matchChips(r: Requirements | null | undefined, locations: string[] = []): string[] {
  const out: string[] = [];
  if (r?.yearsMin != null) out.push(r.yearsMax != null && r.yearsMax !== r.yearsMin ? `${r.yearsMin}–${r.yearsMax} years` : `${r.yearsMin}+ years`);
  if (r?.seniority) out.push(r.seniority.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()));
  out.push(...(r?.requiredSkills ?? []).slice(0, 8));
  out.push(...locations.map((l) => l.replace(/\b\w/g, (c) => c.toUpperCase())));
  if (r?.salaryMin != null || r?.salaryMax != null) {
    const lo = r.salaryMin ?? r.salaryMax!;
    const hi = r.salaryMax ?? r.salaryMin!;
    out.push(`~${r.salaryCurrency ?? ""} ${money(lo)}${hi !== lo ? `–${money(hi)}` : ""}`.replace("~ ", "~"));
  }
  return [...new Set(out)];
}
