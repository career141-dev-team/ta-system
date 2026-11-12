/**
 * Adult pages never reach the desk (12 Nov).
 *
 * A test opening with no real job description sent a near-empty query to the
 * web search, and the Research tab listed porn sites under Sources: safe
 * search was switched off in the request and on our own search service, and
 * nothing looked at what came back. Safe search is strict now (serper.ts),
 * but an engine's own filter is not ours to trust, so every result is also
 * read here - once on the way in (`search`), and once where stored sources
 * are shown, because the ones saved before this are still in the database.
 *
 * Deliberately narrow: "sex" alone is not a signal on a recruitment desk
 * (Essex, Middlesex, a sexual-harassment policy), so only words that mean an
 * adult site are matched.
 * ponytail: a word list, not a classifier; add a hosted category list if one slips through.
 */
const HOST = /porn|xxx|xvideos|xnxx|xhamster|redtube|youporn|hentai|sexvideo|sextube|brazzers|onlyfans|chaturbate|qorno/i;
const TEXT = /\bporn|\bxxx\b|\bhentai\b|\bnsfw\b|\bsex(?:\s|-)?(?:videos?|movies?|films?|tube|cams?|chat)\b|\bnude\s+(?:videos?|pics|photos)\b|सेक्स|सेक्सी|पोर्न/i;

export function adultHit(hit: { url: string; title?: string; snippet?: string; quote?: string }): boolean {
  let host = hit.url;
  try {
    host = new URL(hit.url).hostname;
  } catch {
    // Not an address: the text below still decides.
  }
  return HOST.test(host) || TEXT.test(`${hit.title ?? ""} ${hit.snippet ?? ""} ${hit.quote ?? ""}`);
}
