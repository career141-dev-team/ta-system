// AURA on the CV (owner, 16 Nov 2026: "not only chat - an agent: whatever the user
// wants done on the CV, it does, e.g. add the green box and put these details").
// The green box is the TA System's CAREER141 box on the Prepared CV
// (src/lib/preparedCv.ts + career141Box.ts there): a green-bordered box on page 1
// headed "CAREER141 CANDIDATE", then designation, company, current and expected
// salary, notice period and a "NOTE:-" list, empty lines left out; the TA drags it
// into place and sets its width (180 to 380 points on a 595-point page).
// Until the backend model is wired the agent reads plain commands; anything that is
// not a command is a question, answered off the CV's own text (cvAsk).
// Check: node "src/app/openings/[id]/cvAgent.check.ts"

export type BoxContent = {
  designation?: string;
  company?: string;
  currentSalary?: string;
  expectedSalary?: string;
  notice?: string;
  notes: string[];
};
/** Where the box sits on page 1, in % of the page: left, top, width. */
export type Box = { x: number; y: number; w: number; content: BoxContent };

const PAGE = 595; // an A4 page in points, as the TA System lays the box out
export const MIN_W = (180 / PAGE) * 100;
export const MAX_W = (380 / PAGE) * 100;
const START_W = (260 / PAGE) * 100;
const clampW = (w: number) => Math.min(MAX_W, Math.max(MIN_W, w));
const clampXY = (b: Box): Box => ({ ...b, x: Math.min(Math.max(2, b.x), 98 - b.w), y: Math.min(Math.max(1.5, b.y), 85) });

/** The box's lines, as the TA System writes them. */
export function boxLines(c: BoxContent): string[] {
  const l = ["CAREER141 CANDIDATE"];
  if (c.designation) l.push(`CURRENT DESIGNATION - ${c.designation}`);
  if (c.company) l.push(`CURRENT COMPANY - ${c.company}`);
  if (c.currentSalary) l.push(`CURRENT SALARY - ${c.currentSalary}`);
  if (c.expectedSalary) l.push(`EXPECTED SALARY - ${c.expectedSalary}`);
  if (c.notice) l.push(`NOTICE PERIOD - ${c.notice}`);
  if (c.notes.length) l.push("NOTE:-", ...c.notes.map((n) => `- ${n}`));
  return l;
}

// The details a TA names in a sentence: "expected salary 600k, notice 1 month".
const FIELDS: [keyof Omit<BoxContent, "notes">, RegExp][] = [
  ["currentSalary", /current\s+(?:salary|pay|package)/],
  ["expectedSalary", /expect(?:ed|ing)?\s+(?:salary|pay|package)|expected/],
  ["notice", /notice(?:\s+period)?/],
  ["designation", /designation|title|position|role/],
  ["company", /company|employer|works?\s+at/],
];
const LABEL: Record<string, string> = {
  currentSalary: "current salary",
  expectedSalary: "expected salary",
  notice: "notice period",
  designation: "designation",
  company: "company",
};

function readDetails(text: string): Partial<BoxContent> {
  const out: Partial<BoxContent> = {};
  for (const part of text.split(/,|;|\band\b(?=\s+(?:current|expected|notice|designation|company|title|note))/i)) {
    const p = part.trim();
    const low = p.toLowerCase();
    const note = low.match(/\bnote[s]?\s*(?:[:=-]|to say|that|is)?\s*(.+)/i);
    if (note) {
      out.notes = [...(out.notes ?? []), p.slice(p.length - note[1].length).trim()];
      continue;
    }
    for (const [key, re] of FIELDS) {
      const m = low.match(re);
      if (!m) continue;
      const v = p
        .slice((m.index ?? 0) + m[0].length)
        .replace(/^\s*(?:is|=|:|-|to|as|of|at)\s*/i, "")
        .trim();
      if (v) (out as Record<string, string>)[key] = v;
      break;
    }
  }
  return out;
}

export type AgentResult = { box: Box | null; reply: string };

export function runAgent(input: string, box: Box | null, start: BoxContent, cvText: string): AgentResult {
  const say = input.trim();
  const q = say.toLowerCase();
  const isBox = /\b(green\s+)?box\b|career141/.test(q);
  const nudge = /\bbit|little|slightly\b/.test(q) ? 3 : 0;

  // Take it off.
  if (isBox && /\b(remove|delete|take (?:it )?off|clear|hide)\b/.test(q) && !/note/.test(q)) {
    return box ? { box: null, reply: "Took the green box off the CV." } : { box: null, reply: "There is no green box on this CV yet." };
  }

  // Put it on, with what the desk holds plus anything said.
  if (/\b(add|put|place|create|insert|make|show)\b/.test(q) && isBox && !box) {
    const said = readDetails(say.replace(/^.*?\bbox\b\s*(?:with|and put|showing|having|:)?/i, ""));
    const content: BoxContent = { ...start, ...said, notes: [...start.notes, ...(said.notes ?? [])] };
    const next: Box = { x: 98 - START_W - 2, y: 3, w: START_W, content };
    const lines = boxLines(content).filter((l, i) => i > 0 && l !== "NOTE:-").length;
    return {
      box: next,
      reply: lines
        ? `Added the green box at the top right of page 1 with ${lines} detail${lines === 1 ? "" : "s"}. Drag it to move it, or tell me where.`
        : "Added the green box, but nothing is on record for it yet. Tell me the details - e.g. “expected salary 550k, notice 1 month”.",
    };
  }

  if (!box && (isBox || /\b(move|wider|narrower|bigger|smaller|note)\b/.test(q)))
    return { box: null, reply: "There is no green box yet. Say “add the green box” first." };

  if (box) {
    // Where it goes.
    const place: [RegExp, Partial<Box>][] = [
      [/top\s*right|right\s*top/, { x: 98 - box.w, y: 3 }],
      [/top\s*left|left\s*top/, { x: 2, y: 3 }],
      [/bottom\s*right/, { x: 98 - box.w, y: 80 }],
      [/bottom\s*left/, { x: 2, y: 80 }],
      [/\b(middle|cent(?:er|re))\b/, { x: 50 - box.w / 2, y: 40 }],
    ];
    if (/\b(move|put|place|drag|shift|send)\b/.test(q) || /^(up|down|left|right)\b/.test(q)) {
      for (const [re, at] of place) if (re.test(q)) return { box: clampXY({ ...box, ...at }), reply: "Moved the green box." };
      const step = nudge || 8;
      const d: Partial<Box> = /\bup\b/.test(q)
        ? { y: box.y - step }
        : /\bdown\b|bottom/.test(q)
          ? { y: /bottom/.test(q) && !nudge ? 80 : box.y + step }
          : /\bleft\b/.test(q)
            ? { x: /\bleft\b/.test(q) && !nudge && /\bto the left|left side|left edge\b/.test(q) ? 2 : box.x - step }
            : /\bright\b/.test(q)
              ? { x: /\bto the right|right side|right edge\b/.test(q) && !nudge ? 98 - box.w : box.x + step }
              : /\btop\b/.test(q)
                ? { y: 3 }
                : {};
      if (Object.keys(d).length) return { box: clampXY({ ...box, ...d }), reply: "Moved the green box." };
    }
    // How wide.
    if (/\b(wider|bigger|larger|widen)\b/.test(q)) {
      const w = clampW(box.w + (nudge || 6));
      return { box: clampXY({ ...box, w }), reply: w === box.w ? "It is already as wide as it goes (380 points)." : "Made the green box wider." };
    }
    if (/\b(narrower|smaller|thinner)\b/.test(q)) {
      const w = clampW(box.w - (nudge || 6));
      return { box: clampXY({ ...box, w }), reply: w === box.w ? "It is already as narrow as it goes (180 points)." : "Made the green box narrower." };
    }
    // Notes.
    if (/\b(clear|remove|delete)\b.*\bnotes?\b/.test(q)) {
      return { box: { ...box, content: { ...box.content, notes: [] } }, reply: "Took the notes out of the box." };
    }
    // A detail named: change it, or add it.
    if (/\b(set|change|update|make|put|add|write|replace|edit)\b/.test(q) || /\bnote\b/.test(q)) {
      const said = readDetails(say.replace(/^.*?\b(set|change|update|make|put|add|write|replace|edit)\b\s*(?:the\s+)?/i, ""));
      const keys = Object.keys(said).filter((k) => k !== "notes");
      if (keys.length || said.notes?.length) {
        const content = { ...box.content, ...said, notes: [...box.content.notes, ...(said.notes ?? [])] };
        const what = [...keys.map((k) => LABEL[k]), ...(said.notes?.length ? ["a note"] : [])].join(", ");
        return { box: { ...box, content }, reply: `Put ${what} in the green box.` };
      }
    }
    if (/\b(remove|delete|take out|clear)\b/.test(q)) {
      for (const [key, re] of FIELDS)
        if (re.test(q)) {
          const content = { ...box.content };
          delete content[key];
          return { box: { ...box, content }, reply: `Took ${LABEL[key]} out of the green box.` };
        }
    }
  }

  return { box, reply: askCv(cvText, say) };
}

// "Ask about this CV" (owner, 16 Nov 2026: no separate candidate page - the card
// shows the details, and in the CV a TA can ask what they want). Until the backend
// model is wired, the answer is read straight off the CV's own text: an email,
// a phone number, the years, or the lines that share the most words with the
// question. It never makes anything up: nothing found says so.

const STOP = new Set(
  "a an the is are was were do does did has have had what which who whom how when where why tell me about this cv candidate they them their he she his her of in on at to for with and or any please give show list does".split(" "),
);

const words = (s: string) => s.toLowerCase().match(/[a-z0-9+#/.]+/g)?.map((w) => w.replace(/\.$/, "")).filter((w) => w.length > 1 && !STOP.has(w)) ?? [];

// A few everyday words a TA asks with, and the words a CV uses for them.
const ALSO: Record<string, string[]> = {
  degree: ["education", "bsc", "msc", "mba", "university", "diploma", "degree"],
  study: ["education", "university", "degree"],
  qualification: ["education", "degree", "certificate", "diploma"],
  job: ["experience", "role", "present", "current"],
  work: ["experience", "role", "present"],
  salary: ["salary", "lkr", "package", "remuneration"],
  notice: ["notice"],
  language: ["english", "sinhala", "tamil", "language"],
};

/** A word and its plain stem, so "skills" finds "skill" and "designing" finds "design". */
const stem = (w: string) => w.replace(/(ing|ed|es|s)$/, "");

export function askCv(text: string, question: string): string {
  const q = question.toLowerCase();
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return "I could not read any text in this CV. It may be a scanned picture.";

  if (/e-?mail/.test(q)) {
    const m = flat.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
    return m ? `Email on the CV: ${m[0]}` : "There is no email on this CV.";
  }
  if (/phone|number|mobile|contact/.test(q)) {
    const m = flat.match(/\+?\d[\d ()-]{7,}\d/);
    return m ? `Phone on the CV: ${m[0].trim()}` : "There is no phone number on this CV.";
  }
  if (/how (many|long)|years|experience/.test(q)) {
    const m = flat.match(/\d+\+?\s*(?:years?|yrs)[^.]{0,60}/i);
    if (m) return `The CV says: “${m[0].trim()}”`;
  }

  const want = words(question).flatMap((w) => [w, ...(ALSO[w] ?? ALSO[stem(w)] ?? [])]).map(stem);
  if (!want.length) return "Ask about something in the CV - for example their skills, last job, education or notice period.";
  const lines = flat.split(/(?<=[.!?•])\s+|\s{2,}|\s•\s/).map((l) => l.trim()).filter((l) => l.length > 3);
  const scored = lines
    .map((l, i) => ({ l, i, n: new Set(words(l).map(stem).filter((w) => want.includes(w))).size }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .slice(0, 3)
    .sort((a, b) => a.i - b.i);
  if (!scored.length) return "I could not find that in this CV.";
  return "From the CV:\n" + scored.map((x) => "• " + (x.l.length > 220 ? x.l.slice(0, 217) + "…" : x.l)).join("\n");
}
