/**
 * The other names a job goes by, as Research wrote them (18 Nov, the owner's
 * "Similar designation" item). Research has filled `similarDesignation` since
 * September — "Head of Finance; Finance Controller" for a Finance Manager — but
 * nothing read it: Suggestions asked the model for its own titles and the
 * database search sent the job title alone, so people holding the same job
 * under another name were missed. A TA's hand correction of the field is the
 * stored value, so it wins here with no extra step.
 */

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** The Research line as a clean list: split, trimmed, no repeats, not the job's own title. */
export function similarTitles(line: string | null | undefined, jobTitle: string, max = 6): string[] {
  const own = norm(jobTitle);
  const seen = new Set<string>([own]);
  const out: string[] = [];
  for (const raw of (line ?? "").split(/[;\n]/)) {
    const t = raw.replace(/^[\s\-•*"']+|[\s"'.]+$/g, "").replace(/\s+/g, " ");
    const k = norm(t);
    if (t.length < 2 || t.length > 80 || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

/** Lists joined in order, the first spelling of a title kept. */
export function joinTitles(...lists: (string[] | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of lists.flat()) {
    const k = t ? norm(t) : "";
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(t!);
  }
  return out;
}
