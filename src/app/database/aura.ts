// What AURA does with each message on the Database screen (owner, 14 Nov 2026:
// "everything comes to the chat... behave like ChatGPT"). One box, no modes and no
// buttons to learn: the words themselves say what kind of search it is -
//   a Boolean string (AND / OR / NOT / "quotes")  -> run as Boolean
//   "do we have ...", or a list of names          -> Referral Search
//   "people like <name>"                          -> lookalikes
//   "add ... to <job>" / "add ... to a job"        -> into a job's pipeline
//   "download their CVs"                          -> the CV files
//   "remove <filter>" (also the x on a chip)      -> drop a filter
//   anything else                                 -> plain words, read into
//      filters added to the ones before; with nothing to read, closest by meaning.
// Every answer ends with one-tap suggestions, so a TA rarely types a prompt.
// Sample people and a stand-in for the real reading: nothing reads the database
// yet, and AURA says so rather than inventing anyone.

export type Person = {
  id: string;
  name: string;
  title: string;
  company: string;
  city: string;
  years: number;
  notice: number;
  tags: string[];
  score: number;
  cv?: string;
  /** Roles, newest first, for the Database CVs rows (sample; the backend gives the real ones). */
  career?: { period: string; title: string; company: string }[];
};

export const POOL: Person[] = [
  {
    id: "p1",
    name: "Kasun Perera",
    title: "SAP S/4HANA Lead",
    company: "Virtusa",
    city: "Colombo",
    years: 11,
    notice: 1,
    tags: ["sap", "manufacturing", "led"],
    score: 92,
    cv: "/cvs/s2.pdf",
    career: [{"period":"2020 – Now","title":"SAP S/4HANA Lead","company":"Virtusa"},{"period":"2016 – 2020","title":"Senior SAP Consultant","company":"IFS"},{"period":"2015 – 2016","title":"SAP Consultant","company":"Hayleys"}],
  },
  {
    id: "p2",
    name: "Ishara Silva",
    title: "Solution Architect",
    company: "Virtusa",
    city: "Colombo",
    years: 10,
    notice: 1,
    tags: ["sap", "manufacturing", "led"],
    score: 88,
    cv: "/cvs/s3.pdf",
    career: [{"period":"2019 – Now","title":"SAP Solution Architect","company":"Virtusa"},{"period":"2016 – 2019","title":"SAP PP Consultant","company":"Brandix"}],
  },
  {
    id: "p3",
    name: "Chamara Weerasinghe",
    title: "ERP Programme Director",
    company: "Hayleys",
    city: "Colombo",
    years: 14,
    notice: 1,
    tags: ["sap", "manufacturing", "led"],
    score: 85,
    cv: "/cvs/s4.pdf",
    career: [{"period":"2021 – Now","title":"ERP Programme Director","company":"Hayleys"},{"period":"2016 – 2021","title":"SAP Delivery Manager","company":"MAS Holdings"},{"period":"2012 – 2016","title":"SAP MM Consultant","company":"John Keells IT"}],
  },
  {
    id: "p4",
    name: "Nimali Abeysekara",
    title: "SAP MM Lead",
    company: "IFS",
    city: "Colombo",
    years: 9,
    notice: 0,
    tags: ["sap", "manufacturing", "led"],
    score: 81,
    cv: "/cvs/s6.pdf",
    career: [{"period":"2022 – Now","title":"SAP MM Lead","company":"IFS"},{"period":"2018 – 2022","title":"SAP MM Consultant","company":"Dialog Axiata"},{"period":"2016 – 2018","title":"Associate Consultant","company":"Attune"}],
  },
  {
    id: "p5",
    name: "Priya Nair",
    title: "SAP Delivery Lead",
    company: "Accenture",
    city: "Colombo",
    years: 12,
    notice: 3,
    tags: ["sap", "manufacturing"],
    score: 79,
    cv: "/cvs/p1.pdf",
  },
  {
    id: "p6",
    name: "Tharindu Jay",
    title: "SAP FICO Manager",
    company: "Brandix",
    city: "Colombo",
    years: 9,
    notice: 2,
    tags: ["sap", "manufacturing", "finance"],
    score: 77,
    cv: "/cvs/p2.pdf",
    career: [{"period":"2020 – Now","title":"SAP FICO Manager","company":"Brandix"},{"period":"2016 – 2020","title":"SAP FICO Consultant","company":"Hirdaramani"},{"period":"2013 – 2015","title":"Accounts Executive","company":"Hemas"}],
  },
  {
    id: "p7",
    name: "Amal Gunasekara",
    title: "SAP PM",
    company: "Hemas",
    city: "Colombo",
    years: 8,
    notice: 2,
    tags: ["sap", "manufacturing"],
    score: 74,
    cv: "/cvs/s1.pdf",
  },
  {
    id: "p8",
    name: "Shehan Dias",
    title: "Head of ERP",
    company: "Cargills",
    city: "Colombo",
    years: 15,
    notice: 3,
    tags: ["sap", "manufacturing"],
    score: 72,
    cv: "/cvs/s5.pdf",
  },
  {
    id: "p9",
    name: "Dilani Fernando",
    title: "SAP Consultant",
    company: "Dialog",
    city: "Kandy",
    years: 8,
    notice: 1,
    tags: ["sap"],
    score: 70,
  },
  {
    id: "p10",
    name: "Ruwan Silva",
    title: "Plant Engineer",
    company: "Lanka Tiles",
    city: "Horana",
    years: 7,
    notice: 1,
    tags: ["engineer", "manufacturing"],
    score: 76,
  },
  {
    id: "p11",
    name: "Sachini Herath",
    title: "Finance Manager",
    company: "MAS",
    city: "Colombo",
    years: 9,
    notice: 2,
    tags: ["finance", "cima"],
    score: 83,
  },
  {
    id: "p12",
    name: "Nadeeka Dilshan",
    title: "Finance Manager",
    company: "Hemas",
    city: "Colombo",
    years: 10,
    notice: 1,
    tags: ["finance", "cima"],
    score: 80,
  },
];

/** The jobs a TA can add people to (their openings). Sample. */
export const JOBS = [
  "Head of SAP · PGP Glass",
  "ERP Programme Manager · Rocell",
  "Finance Manager · MAS",
];

/** People another TA already works (sample): the old collision lock. */
export const CLAIMED: Record<string, string> = { p3: "Hasini" };

const TAG_WORDS: Record<string, string> = {
  sap: "SAP",
  manufacturing: "manufacturing",
  led: "led a rollout",
  finance: "finance",
  cima: "CIMA",
  engineer: "plant engineering",
};

/** Why this person came up, in a few plain words read off their record. */
export const reasonOf = (p: Person) =>
  [
    ...p.tags
      .map((t) => TAG_WORDS[t])
      .filter(Boolean)
      .slice(0, 2),
    `${p.years} yrs`,
    p.notice === 0 ? "can start now" : `notice ${p.notice} mo`,
  ].join(" · ");

/** The fit label beside the number, as the old results show it (FIT_BANDS). */
export const fitOf = (score: number) =>
  score >= 75 ? "Strong" : score >= 60 ? "Worth a look" : "Loose";

export type Chip = { label: string; added: boolean; test: string };
export type Action = { label: string; prompt: string };
export type Ref = { asked: string; found?: Person };
export type Reply = {
  text: string;
  chips?: Chip[];
  people?: Person[];
  refs?: Ref[];
  actions?: Action[];
  /** A Boolean string as run, shown under the line. */
  boolean?: string;
  /** Files to hand to the browser to download. */
  files?: { name: string; url: string }[];
  /** Something was refused or not found. */
  warn?: boolean;
  /** Referees named on our CVs (Referees mode, ./referees.ts). */
  referees?: import("./referees").Referee[];
};

/** Plain-word filters. `test` is kept as text so a chip can be rebuilt later. */
const FILTERS: {
  label: string;
  re: RegExp;
  keep: (p: Person, n?: number) => boolean;
}[] = [
  {
    label: "SAP S/4HANA",
    re: /\bsap\b|s\/?4/i,
    keep: (p) => p.tags.includes("sap"),
  },
  {
    label: "Manufacturing",
    re: /manufactur|plant/i,
    keep: (p) => p.tags.includes("manufacturing"),
  },
  { label: "Finance", re: /finance/i, keep: (p) => p.tags.includes("finance") },
  { label: "CIMA", re: /\bcima\b/i, keep: (p) => p.tags.includes("cima") },
  {
    label: "Engineer",
    re: /engineer/i,
    keep: (p) => p.tags.includes("engineer"),
  },
  { label: "Colombo", re: /colombo/i, keep: (p) => p.city === "Colombo" },
  { label: "Kandy", re: /kandy/i, keep: (p) => p.city === "Kandy" },
  { label: "Horana", re: /horana/i, keep: (p) => p.city === "Horana" },
  {
    label: "years",
    re: /(\d+)\s*\+?\s*(?:years|yrs)/i,
    keep: (p, n = 0) => p.years >= n,
  },
  {
    label: "Led a rollout",
    re: /\bled\b/i,
    keep: (p) => p.tags.includes("led"),
  },
  {
    label: "Notice ≤ 1 month",
    re: /notice[^.]*(?:one|1)\s*month|can start (?:soon|now)/i,
    keep: (p) => p.notice <= 1,
  },
];

const keepOf = (c: Chip) => {
  const f = FILTERS.find((x) =>
    x.label === "years" ? /\+ years$/.test(c.label) : x.label === c.label,
  );
  const n = Number(c.label.match(/^(\d+)\+/)?.[1] ?? 0);
  return (p: Person) => (f ? f.keep(p, n) : true);
};
const sift = (chips: Chip[]) =>
  POOL.filter((p) => chips.every((c) => keepOf(c)(p))).sort(
    (a, b) => b.score - a.score,
  );
const hay = (p: Person) =>
  `${p.name} ${p.title} ${p.company} ${p.city} ${p.tags.join(" ")} ${p.years} years`.toLowerCase();
const byName = (s: string) => {
  const w = s
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  return w.length
    ? POOL.find((p) => w.every((x) => p.name.toLowerCase().includes(x)))
    : undefined;
};

/** A small Boolean reader: AND (or a space), OR, NOT, brackets and "phrases". */
function booleanMatch(q: string): ((p: Person) => boolean) | null {
  const tokens = q.match(/"[^"]+"|\(|\)|[^\s()"]+/g) ?? [];
  let i = 0;
  const peek = () => tokens[i];
  const factor = (): ((s: string) => boolean) | null => {
    const t = tokens[i++];
    if (t === undefined) return null;
    if (t.toUpperCase() === "NOT") {
      const f = factor();
      return f && ((s) => !f(s));
    }
    if (t === "(") {
      const e = expr();
      if (tokens[i++] !== ")") return null;
      return e;
    }
    const word = t.replace(/^"|"$/g, "").toLowerCase();
    return (s) => s.includes(word);
  };
  const term = () => {
    let left = factor();
    while (left && peek() && peek() !== ")" && peek().toUpperCase() !== "OR") {
      if (peek().toUpperCase() === "AND") i++;
      const right = factor();
      if (!right) return null;
      const l = left;
      left = (s) => l(s) && right(s);
    }
    return left;
  };
  const expr = (): ((s: string) => boolean) | null => {
    let left = term();
    while (left && peek()?.toUpperCase() === "OR") {
      i++;
      const right = term();
      if (!right) return null;
      const l = left;
      left = (s) => l(s) || right(s);
    }
    return left;
  };
  const e = expr();
  return e && i === tokens.length ? (p) => e(hay(p)) : null;
}

/** The one-tap suggestions under a list of people. */
function next(people: Person[], chips: Chip[]): Action[] {
  if (!people.length) return [{ label: "Start over", prompt: "Start over" }];
  const top = people[0];
  const out: Action[] = [
    {
      label: `People like ${top.name.split(" ")[0]}`,
      prompt: `Find people like ${top.name}`,
    },
    {
      label:
        people.length > 1
          ? `Add the top ${Math.min(3, people.length)} to a job`
          : `Add ${top.name.split(" ")[0]} to a job`,
      prompt:
        people.length > 1
          ? `Add the top ${Math.min(3, people.length)} to a job`
          : `Add ${top.name} to a job`,
    },
    { label: "Download their CVs", prompt: "Download their CVs" },
  ];
  if (!chips.some((c) => c.label.startsWith("Notice")))
    out.push({
      label: "Notice ≤ 1 month",
      prompt: "Only notice one month or less",
    });
  return out;
}

/** Who "them / the top 3 / Kasun" means, from the last list shown. */
function whoOf(text: string, last: Person[]): Person[] {
  const named = POOL.filter(
    (p) =>
      text.toLowerCase().includes(p.name.toLowerCase()) ||
      text.toLowerCase().includes(p.name.split(" ")[0].toLowerCase() + " "),
  );
  if (named.length) return named;
  const n = Number(text.match(/top\s+(\d+)/i)?.[1] ?? 0);
  if (n) return last.slice(0, n);
  return last.slice(0, 10);
}

export type Context = {
  chips: Chip[];
  last: Person[];
  cvsOnly: boolean;
  locked: string;
};

/** AURA's answer to one message. */
export function reply(raw: string, ctx: Context): Reply {
  const text = raw.trim();
  const { chips: before, last } = ctx;

  // Shortlist from the person panel (D2): into the job AND claimed by this TA, as
  // the old Shortlist does (claimForTa) - or refused when another TA holds them.
  const sl = text.match(/^shortlist\s+(.+?)\s+for\s+(.+)$/i);
  if (sl) {
    const who = whoOf(sl[1], last)[0];
    const job = JOBS.find((j) => sl[2].trim() === j) ?? JOBS[0];
    if (!who) return { text: "Who should be shortlisted? Name them.", warn: true };
    if (ctx.locked)
      return { text: `${ctx.locked} Shortlisting waits until then.`, warn: true };
    if (CLAIMED[who.id])
      return {
        text: `${CLAIMED[who.id]} already claimed ${who.name} for ${job}. Nothing changed.`,
        warn: true,
      };
    return {
      text: `${who.name} is shortlisted for ${job} and yours to work, at TA Follow-up.`,
      people: [who],
      actions: [
        { label: "Undo", prompt: `Take ${who.name} out of ${job}` },
        { label: `People like ${who.name.split(" ")[0]}`, prompt: `Find people like ${who.name}` },
      ],
    };
  }

  // Into a job: name the job, or be asked which.
  const add = text.match(/^add\s+(.+?)\s+to\s+(.+)$/i);
  if (add) {
    const who = whoOf(add[1], last);
    const job = JOBS.find(
      (j) =>
        j.toLowerCase().startsWith(
          add[2]
            .toLowerCase()
            .replace(/^the\s+/, "")
            .slice(0, 8),
        ) || add[2].toLowerCase().includes(j.split(" · ")[0].toLowerCase()),
    );
    if (!who.length)
      return {
        text: "Who should go in? Search first, or name them.",
        warn: true,
      };
    if (ctx.locked)
      return {
        text: `${ctx.locked} Adding people to a job waits until then.`,
        warn: true,
      };
    if (!job)
      return {
        text: `Which job should ${who.length === 1 ? who[0].name : `these ${who.length}`} go into?`,
        actions: JOBS.map((j) => ({
          label: j,
          prompt: `Add ${who.map((p) => p.name).join(", ")} to ${j}`,
        })),
      };
    // Adding claims: they are this TA's to work, in the open set, and someone
    // another TA already claimed is left alone (the TA System's collision lock).
    const taken = who.filter((p) => CLAIMED[p.id]);
    const free = who.filter((p) => !CLAIMED[p.id]);
    const heldLine = taken.map((p) => `${CLAIMED[p.id]} already claimed ${p.name}`).join(". ");
    if (!free.length) return { text: `${heldLine}. Nothing changed.`, warn: true };
    return {
      text:
        `${free.map((p) => p.name).join(", ")} ${free.length === 1 ? "is" : "are"} now in ${job}, at TA Follow-up, and yours to work.` +
        (heldLine ? ` ${heldLine} - left as ${taken.length === 1 ? "they were" : "they were"}.` : ""),
      people: free,
      actions: [
        {
          label: "Undo",
          prompt: `Take ${free.map((p) => p.name).join(", ")} out of ${job}`,
        },
      ],
    };
  }
  const out = text.match(/^take\s+(.+?)\s+out of\s+(.+)$/i);
  if (out) return { text: `Taken out of ${out[2]}. Nothing else changed.` };

  // The CV files of the people on screen.
  if (/download/i.test(text)) {
    const who = whoOf(text, last);
    const files = who
      .filter((p) => p.cv)
      .map((p) => ({ name: `${p.name} - CV.pdf`, url: p.cv! }));
    const none = who.length - files.length;
    if (!who.length)
      return {
        text: "There is nobody on screen yet. Search first.",
        warn: true,
      };
    return {
      text: files.length
        ? `Downloading ${files.length} CV${files.length === 1 ? "" : "s"}.${none ? ` ${none} ${none === 1 ? "has" : "have"} no CV file on record.` : ""}`
        : "None of them has a CV file on record.",
      files,
      warn: !files.length,
    };
  }

  // Lookalikes: same kind of work, near in years, the person themself left out.
  const like = text.match(
    /(?:people|someone|others|more)\s+like\s+(.+?)[.?]?$|similar to\s+(.+?)[.?]?$/i,
  );
  if (like) {
    const who = byName(like[1] ?? like[2] ?? "");
    if (!who)
      return {
        text: `I could not find "${(like[1] ?? like[2]).trim()}" among the people here.`,
        warn: true,
      };
    const people = POOL.filter(
      (p) =>
        p.id !== who.id &&
        p.tags.filter((t) => who.tags.includes(t)).length >=
          Math.min(2, who.tags.length) &&
        Math.abs(p.years - who.years) <= 5,
    ).sort((a, b) => b.score - a.score);
    return {
      text: people.length
        ? `${people.length} people like ${who.name} - same kind of work, similar years.`
        : `Nobody close enough to ${who.name} here.`,
      people,
      actions: next(people, []),
      warn: !people.length,
    };
  }

  // Drop a filter (also what the x on a chip sends).
  const drop = text.match(/^(?:remove|drop|without|no longer)\s+(.+)$/i);
  if (drop && before.length) {
    const word = drop[1]
      .toLowerCase()
      .replace(/[^a-z0-9+≤ ]/g, "")
      .trim();
    const chips = before
      .filter(
        (c) =>
          !c.label.toLowerCase().includes(word) &&
          !word.includes(c.label.toLowerCase()),
      )
      .map((c) => ({ ...c, added: false }));
    if (chips.length === before.length)
      return {
        text: `"${drop[1]}" is not one of the filters.`,
        chips: before,
        warn: true,
      };
    const people = sift(chips);
    return {
      text: `Without that: ${people.length} ${people.length === 1 ? "person" : "people"}.`,
      chips,
      people,
      actions: next(people, chips),
    };
  }
  if (/^start over$/i.test(text))
    return { text: "Cleared. Who are you looking for?", chips: [] };

  // Referral Search: "do we have ...", or a list of names.
  const lines = text
    .split(/\n|,|;|\band\b/)
    .map((s) =>
      s
        .replace(
          /\b(?:do we have|referral:?|is|are)\b|in (?:our|the) database|\?|"|“|”/gi,
          "",
        )
        .trim(),
    )
    .filter(Boolean);
  const nameLike = (s: string) =>
    /^[A-Z][a-z]+(?:\s+[A-Z][a-z.]+){1,3}$/.test(s);
  if (
    /do we have|referral|in (?:our|the) database/i.test(text) ||
    (lines.length >= 2 && lines.every(nameLike))
  ) {
    const asked = lines.filter(nameLike);
    if (!asked.length)
      return { text: "Which names? Paste them one per line.", warn: true };
    const refs = asked.map((a) => ({ asked: a, found: byName(a) }));
    const n = refs.filter((r) => r.found).length;
    return {
      text:
        n === refs.length
          ? n === 1
            ? "Yes - we have them."
            : `We have all ${n}.`
          : n
            ? `We have ${n} of ${refs.length}.`
            : refs.length === 1
              ? "No - not in our database."
              : "None of them is in our database.",
      refs,
      actions: n
        ? [
            {
              label: n === 1 ? "Add to a job" : `Add the ${n} to a job`,
              prompt: `Add ${refs
                .filter((r) => r.found)
                .map((r) => r.found!.name)
                .join(", ")} to a job`,
            },
          ]
        : undefined,
    };
  }

  // Boolean, run as written.
  if (/\b(AND|OR|NOT)\b|"[^"]+"/.test(text)) {
    const keep = booleanMatch(text);
    if (!keep)
      return {
        text: "That Boolean does not read - check the brackets and quotes.",
        warn: true,
      };
    const people = POOL.filter(keep).sort((a, b) => b.score - a.score);
    return {
      text: people.length
        ? `${people.length} ${people.length === 1 ? "person matches" : "people match"} it.`
        : "Nobody matches that Boolean.",
      boolean: text,
      people,
      actions: next(people, []),
      warn: !people.length,
    };
  }

  // Plain words: new filters on top of the old ones.
  const chips = before.map((c) => ({ ...c, added: false }));
  for (const f of FILTERS) {
    const m = text.match(f.re);
    if (!m) continue;
    const label = f.label === "years" ? `${m[1]}+ years` : f.label;
    if (f.label === "years")
      for (let k = chips.length - 1; k >= 0; k--)
        if (/\+ years$/.test(chips[k].label)) chips.splice(k, 1);
    if (!chips.some((c) => c.label === label))
      chips.push({ label, added: before.length > 0, test: f.re.source });
  }
  if (chips.length === before.length) {
    // Nothing to read as a filter: closest by meaning (words in common).
    const words = text
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 2);
    const people = POOL.map((p) => ({
      p,
      n: words.filter((w) => hay(p).includes(w)).length,
    }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n || b.p.score - a.p.score)
      .map((x) => x.p);
    if (!people.length)
      return {
        text: "Nobody here matches that. This screen is not reading the database yet, so try other words.",
        chips: before,
        warn: true,
        actions: before.length
          ? [{ label: "Start over", prompt: "Start over" }]
          : undefined,
      };
    return {
      text: `${people.length} ${people.length === 1 ? "person comes" : "people come"} closest by meaning.`,
      chips: before,
      people,
      actions: next(people, before),
    };
  }
  const people = sift(chips);
  return {
    text: !people.length
      ? "Nobody matches all of that. Remove a filter, or try other words."
      : before.length === 0
        ? `${people.length} ${people.length === 1 ? "person" : "people"}${ctx.cvsOnly ? " whose CVs say that" : ""}. Here are the closest.`
        : `Down to ${people.length}. ${people[0].name.split(" ")[0]} is the closest.`,
    chips,
    people,
    actions: next(people, chips),
    warn: !people.length,
  };
}

/** The words a chat is named by, from its first message. */
export const titleOf = (text: string) =>
  text.split(/\s+/).slice(0, 6).join(" ");
