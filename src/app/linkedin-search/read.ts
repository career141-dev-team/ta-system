// Reads a TA's plain words into the LinkedIn search fields (owner, 17 Nov 2026: the
// search is a chat with one prompt box, not a form). No model: rules only, so the TA
// sees exactly what was read as chips and can say it again to change it.
// ponytail: rule reader; a model reads better ("someone senior for our SAP team") -
// swap readAsk for a model call when the AI backend is wired, keep the Ask shape.

export type Ask = {
  titles: string[];
  companies: string[];
  locations: string[];
  keywords: string[];
  /** LinkedIn's own experience band (the actor's yearsOfExperienceIds), "" = any. */
  years: string;
  /** The years the TA said ("5 years" = 5); AURA checks the opened profiles against it. */
  minYears: number;
};

export const EMPTY: Ask = { titles: [], companies: [], locations: [], keywords: [], years: "", minYears: 0 };

// Places a TA says without "in" ("only Colombo").
const PLACES = ["sri lanka", "colombo", "kandy", "galle", "jaffna", "negombo", "kurunegala", "matara", "gampaha", "remote"];

const FILLER = /^(?:please\s+)?(?:can you\s+)?(?:find|search(?: for)?|get|show|look for|looking for|we need|i need|need|want|give me)\s+(?:me\s+)?/i;
const REFINE = /^(?:only|also|and|now|but|make it|change (?:it )?to)\b\s*/i;

/** LinkedIn's band for a number of years: 1 under 1, 2 = 1-2, 3 = 3-5, 4 = 6-10, 5 = 10+. */
export const bandOf = (y: number) => (y < 1 ? "1" : y <= 2 ? "2" : y <= 5 ? "3" : y <= 10 ? "4" : "5");

const split = (s: string) =>
  s
    .split(/\s*(?:,|\/|\band\b|\bor\b|&)\s*/i)
    .map((x) => x.trim().replace(/[.!?]+$/, ""))
    .filter((x) => x && !/^(?:experience|exp|skills?)$/i.test(x));

/** "Software Engineers" -> "Software Engineer": LinkedIn titles are singular. */
const single = (t: string) => t.replace(/\b(\w{3,}[^s\W])s$/i, "$1");

export function readAsk(text: string, last: Ask = EMPTY): Ask {
  let s = ` ${text.trim()} `;
  const refine = REFINE.test(text.trim());
  const got: Partial<Ask> = {};

  // "5 years", "5+ years", "3-5 yrs", "5 years of experience"
  const y = s.match(/(\d{1,2})\s*(?:\+|plus)?\s*(?:(?:-|–|to)\s*(\d{1,2}))?\s*(?:years?|yrs?)(?:\s+of)?(?:\s+experience|\s+exp)?/i);
  if (y) {
    got.minYears = Number(y[1]);
    got.years = bandOf(Number(y[1]));
    s = s.replace(y[0], " ");
  }
  // "with Java and Spring", "who knows React", "skills: SQL"
  const k = s.match(/\s(?:with|who knows?|knowing|having|skills?:?)\s+(.+?)\s*$/i);
  if (k) {
    got.keywords = split(k[1]);
    s = s.replace(k[0], " ");
  }
  // "at WSO2", "from Dialog" - up to the next joining word
  const c = s.match(/\s(?:at|from|working at)\s+(.+?)(?=\s(?:in|with|who|based)\s|[,.]|\s*$)/i);
  if (c) {
    got.companies = split(c[1]);
    s = s.replace(c[0], " ");
  }
  // "in Colombo", "based in Kandy"
  const l = s.match(/\s(?:based\s+)?in\s+(.+?)(?=\s(?:at|with|who)\s|[,.]|\s*$)/i);
  if (l) {
    got.locations = split(l[1]);
    s = s.replace(l[0], " ");
  }
  // A known place said on its own ("only Colombo").
  const bare = PLACES.filter((p) => new RegExp(`\\b${p}\\b`, "i").test(s));
  if (bare.length) {
    got.locations = [...(got.locations ?? []), ...bare.map((p) => p.replace(/\b\w/g, (m) => m.toUpperCase()))];
    for (const p of bare) s = s.replace(new RegExp(`\\b${p}\\b`, "i"), " ");
  }

  // What is left is the job title.
  const rest = s
    .trim()
    .replace(REFINE, "")
    .replace(FILLER, "")
    .replace(/^\d+\s+/, "")
    .replace(/\b(?:people|profiles|candidates|persons)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (rest) {
    if (refine) got.keywords = [...(got.keywords ?? []), ...split(rest)];
    else got.titles = split(rest).map(single);
  }

  // A refinement keeps the last search and changes only what was said; a new prompt
  // starts again from what it says.
  const base = refine ? last : EMPTY;
  return {
    titles: got.titles ?? base.titles,
    companies: got.companies ?? base.companies,
    locations: got.locations ?? base.locations,
    keywords: refine && got.keywords ? [...base.keywords, ...got.keywords] : got.keywords ?? base.keywords,
    years: got.years ?? base.years,
    minYears: got.minYears ?? base.minYears,
  };
}

export const isEmpty = (a: Ask) => !a.titles.length && !a.companies.length && !a.locations.length && !a.keywords.length;

/** What was read, as chips. */
export function chipsOf(a: Ask) {
  return [
    ...a.titles.map((t) => `Title: ${t}`),
    ...a.companies.map((c) => `At ${c}`),
    ...a.locations.map((l) => `In ${l}`),
    ...(a.minYears ? [`${a.minYears}+ years`] : []),
    ...a.keywords.map((k) => `Skill: ${k}`),
  ];
}
