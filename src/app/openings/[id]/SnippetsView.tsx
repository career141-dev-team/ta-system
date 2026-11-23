"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
// The card's six faces, as the old Snippets offered them (owner, 14 Nov: "install
// properly"). Poppins 700 for the bold line - the layout loads 300 to 600. They come
// with this view's own download, not the first one.
import "@fontsource/poppins/700.css";
import "@fontsource/outfit/300.css";
import "@fontsource/outfit/400.css";
import "@fontsource/outfit/500.css";
import "@fontsource/outfit/700.css";
import "@fontsource/montserrat/300.css";
import "@fontsource/montserrat/400.css";
import "@fontsource/montserrat/500.css";
import "@fontsource/montserrat/700.css";
import "@fontsource/jost/300.css";
import "@fontsource/jost/400.css";
import "@fontsource/jost/500.css";
import "@fontsource/jost/700.css";
import "@fontsource/quicksand/300.css";
import "@fontsource/quicksand/400.css";
import "@fontsource/quicksand/500.css";
import "@fontsource/quicksand/700.css";
import "@fontsource/figtree/300.css";
import "@fontsource/figtree/400.css";
import "@fontsource/figtree/500.css";
import "@fontsource/figtree/700.css";
import { CAN_SOURCE } from "@/lib/user";
import { useMe } from "@/lib/role";
import { useJdApproved } from "./jdState";
import { BackButton } from "./PipelineBoard";
import Toast from "./Toast";
import { useOpeningView } from "./view";
import { jobFromAddress, useLive } from "@/lib/backend";
import { refineSnippet, useSnippet, type SnipFields } from "./snippetLive";

// The Snippets view (Figma 713:1721): the role as a 1080 x 1080 social card - made
// here, live, so the colour, font, size and underline change it - with the buttons to
// download it as a PNG or copy its LinkedIn caption, and AURA's chat under them to ask
// for changes in words. Placeholder data: the role is the design's sample. With the
// backend the role and its details are the opening's own; the contact is the signed-in
// person's (their name, with a placeholder email and phone until the backend sends theirs).
// Reviewed and merged 14 Nov 2026: as in the old Snippets tab (openings skill §10) the
// card is made only from an approved JD and only by someone with a sourcing seat; the
// PNG is named after the title and waits for the fonts; the controls are on DESIGN.md
// tokens. The card's own colours (COLOURS, INKS) are artwork, like the LinkedIn mark,
// so they stay hex.

/** Placeholder: the opening's JD is approved (same as LinkedIn Job's). */

type Snip = { level: number; colour: number; font: string; body: number; underline: boolean; bold: boolean; ink: number; version: number; line1: string; line2: string; sector: string; facts: string[]; bullets: string[]; email?: string; phone?: string };

const COLOURS = [
  { name: "mint", words: ["mint", "green"], hex: "#01fea3" },
  { name: "yellow", words: ["yellow", "lemon"], hex: "#e9ee57" },
  { name: "peach", words: ["peach", "cream", "beige"], hex: "#fed790" },
  { name: "cyan", words: ["cyan", "blue", "aqua", "turquoise", "teal"], hex: "#41f4e3" },
  { name: "orange", words: ["orange"], hex: "#ffaa5b" },
];
// The job's level sets the card's colour and its badge, as in the old system (owner,
// 14 Nov: keep that and the free colour, without a busier screen). `colour` is an index
// into COLOURS; the badge words are the old ones ("level - Executive" read as a typo).
const LEVELS = [
  { pill: "Junior Level", short: "Junior", colour: 1 },
  { pill: "Executive Level", short: "Executive", colour: 0 },
  { pill: "Mid Level", short: "Mid", colour: 2 },
  { pill: "Senior Level", short: "Senior", colour: 3 },
  { pill: "C-Level", short: "C-Level", colour: 4 },
];
/** The level read off the title, the old system's levelFromTitle. */
function levelOf(title: string) {
  const t = title.toLowerCase();
  if (/\b(chief|cxo|c-suite|cfo|ceo|coo|chro|cso|cto)\b/.test(t)) return 4;
  if (/\b(director|head of|group head|general manager|gm)\b/.test(t)) return 3;
  if (/\b(manager|lead)\b/.test(t)) return 2;
  if (/\b(intern|trainee|junior|assistant)\b/.test(t)) return 0;
  return 1;
}
const FONTS = ["Poppins", "Outfit", "Montserrat", "Jost", "Quicksand", "Figtree"];
// The heading in the three versions "Make it punchier with AURA" cycles through; the first is the role as posted.
const VERSIONS: [string, string][] = [
  ["Executive / Senior Executive", "ACQUISITION"],
  ["Lead finance.", "SHAPE THE NUMBERS"],
  ["Own the numbers.", "FINANCE EXECUTIVE"],
];
const INKS = ["#000000", "#165b42", "#ffffff"];
const ROLE = {
  sector: "Apparel",
  facts: [
    ["Location", "Seethawaka, Sri Lanka"],
    ["Company", "Apparel Manufacturing"],
    ["Package", "100K – 175K"],
    ["Gender", "Open"],
  ],
  bullets: [
    "Bachelor’s Degree in Finance, Accounting; a Master’s Degree or professional qualification (CA, CIMA, ACCA, CPA) is preferred.",
    "Minimum 10–12 years of progressive experience in finance, with at least 5 years in a senior leadership role.",
    "Proven experience managing procurement, accounts receivable, and finance operations.",
  ],
};

const START_LEVEL = levelOf(VERSIONS[0][0]);
const START: Snip = {
  level: START_LEVEL,
  colour: LEVELS[START_LEVEL].colour,
  font: "Poppins",
  body: 24.5,
  underline: false,
  bold: false,
  ink: 0,
  version: 0,
  line1: VERSIONS[0][0],
  line2: VERSIONS[0][1],
  sector: ROLE.sector,
  facts: ROLE.facts.map(([, v]) => v),
  bullets: ROLE.bullets,
};

type Contact = { ta: string; email: string; phone: string };

/** A real opening's card fields (R6) as the drawn card's parts. */
function snipOf(f: Omit<SnipFields, "email" | "mobile" | "jobTitle">, cur: Snip): Partial<Snip> {
  return {
    line1: (f.titleLead ?? "").slice(0, 60),
    line2: (f.titleMain ?? "").toUpperCase().slice(0, 40),
    sector: (f.industry || f.company || "").slice(0, 30),
    facts: [f.location, f.company || f.industry, f.package, f.gender || "Open"].map((x, i) => (x || cur.facts[i] || "").slice(0, 40)),
    bullets: f.bullets.length ? f.bullets.slice(0, 4) : cur.bullets,
  };
}

// ---- Drawing. One function paints the card, on screen and for the PNG, so what is
// seen is what is downloaded. Laid out in the design's 660-wide space (the preview's
// size, measured from the Figma image) and scaled up to 1080.
const hexRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function hexHsl(h: string) {
  const [r, g, b] = hexRgb(h).map((v) => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l * 100];
  const s = d / (1 - Math.abs(2 * l - 1));
  const hue = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(hue * 60 + 360) % 360, s * 100, l * 100];
}
const hslRgb = (h: number, s: number, l: number) => {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l / 100 - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255));
};
/** The colour's own hue, turned `shift` degrees and set to a darker lightness: the
 *  card's deep greens, which for mint are measured from the design. */
const deep = (hex: string, light: number, sat: number, shift: number) => {
  const [h, s] = hexHsl(hex);
  return hslRgb(h - shift, s * sat, light);
};
const mix = (a: number[], b: number[], t: number) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(" ")})`;
const rgb = (c: number[]) => `rgb(${c.join(" ")})`;

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  return [...lines, line];
}

type Where = { email?: [number, number]; phone?: [number, number] };
function drawCard(ctx: CanvasRenderingContext2D, s: Snip, logo: HTMLImageElement | null, who: Contact, where: Where = {}) {
  const k = 1080 / 660;
  const hex = COLOURS[s.colour].hex;
  const f = (w: number, px: number) => `${w} ${px}px "${s.font}", "Poppins", sans-serif`;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.clearRect(0, 0, 660, 660);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(0, 0, 660, 660, 28);
  ctx.clip();
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, 660, 660);
  ctx.textBaseline = "alphabetic";

  // Level badge, top right: darker at the top, lighter at the foot.
  let g = ctx.createLinearGradient(0, 0, 0, 71);
  g.addColorStop(0, rgb(deep(hex, 23.7, 0.65, 14)));
  g.addColorStop(1, rgb(deep(hex, 43.7, 0.51, 18)));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(401, -30, 241, 101, 24);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = f(500, 18);
  ctx.letterSpacing = "1.7px";
  ctx.textAlign = "center";
  ctx.fillText(LEVELS[s.level].pill.toUpperCase(), 519.5, 41);
  ctx.textAlign = "left";
  ctx.letterSpacing = "0px";

  // Logo.
  if (logo) ctx.drawImage(logo, 57, 22, 295, 93);

  // Sector band: deep at the left, easing out into the colour.
  // The stops are the design's measured easing (fast at first, flattening out).
  g = ctx.createLinearGradient(0, 0, 660, 0);
  const band = deep(hex, 21.6, 0.94, 5);
  const full = hexRgb(hex);
  [[0, 0], [0.0909, 0.176], [0.1818, 0.345], [0.303, 0.534], [0.4545, 0.723], [0.606, 0.865], [0.757, 0.959], [0.909, 1]].forEach(([at, t]) => g.addColorStop(at, mix(band, full, t)));
  ctx.fillStyle = g;
  ctx.fillRect(0, 133, 660, 62);
  ctx.fillStyle = "#fff";
  ctx.font = f(500, 24);
  ctx.fillText(s.sector, 55, 171);

  // Heading: the light line, then the bold one. Sized to the design's widths (its own
  // face is narrower than Poppins), baselines as measured.
  // A long title shrinks to stay inside the card (it ran off the edge on a real
  // "Business Development Manager", 23 Nov).
  const fit = (t: string, wt: number, sz: number) => {
    ctx.font = f(wt, sz);
    while (sz > 20 && ctx.measureText(t).width > 560) ctx.font = f(wt, (sz -= 0.5));
  };
  ctx.fillStyle = INKS[s.ink];
  fit(s.line1, s.bold ? 700 : 300, 42);
  ctx.fillText(s.line1, 57, 252);
  if (s.underline) ctx.fillRect(57, 258, ctx.measureText(s.line1).width, 2.5);
  fit(s.line2, 700, 52.7);
  ctx.fillText(s.line2, 57, 307);
  if (s.underline) ctx.fillRect(57, 313, ctx.measureText(s.line2).width, 2.5);

  // The four facts, white pills.
  ROLE.facts.forEach(([label], i) => {
    const x = i % 2 ? 316 : 57;
    const y = i < 2 ? 337 : 381;
    const at = i % 2 ? 83 : 76;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.roundRect(x, y, 249, 35, 17.5);
    ctx.fill();
    ctx.fillStyle = "#000";
    ctx.font = f(400, 11);
    ctx.fillText(label, x + 15, y + 20.5);
    ctx.fillText(":", x + at - 11, y + 20.5);
    // A longer value shrinks to stay inside its pill.
    const room = 249 - at - 14;
    let fs = 11;
    ctx.font = f(700, fs);
    while (fs > 7 && ctx.measureText(s.facts[i]).width > room) ctx.font = f(700, (fs -= 0.25));
    ctx.fillText(s.facts[i], x + at, y + 20.5);
  });

  // The requirements panel: deep at the left, the colour at the right.
  g = ctx.createLinearGradient(0, 0, 660, 0);
  g.addColorStop(0, rgb(deep(hex, 16.9, 0.94, 7.4)));
  g.addColorStop(1, rgb(deep(hex, hexHsl(hex)[2] * 0.86, 1, 2)));
  ctx.fillStyle = g;
  ctx.fillRect(0, 434, 660, 180);
  ctx.fillStyle = "#fff";
  // The size in the toolbar (24.5 in the design) is the foot line's, in 1080 pixels; the
  // requirements are set a little smaller than it, in the same proportion.
  const foot = (s.body * 660) / 1080;
  // They shrink, if need be, until every line stays inside the panel (its foot is y 604).
  let size = foot * 0.82;
  let lines: string[][] = [];
  for (; size > 8; size -= 0.25) {
    ctx.font = f(400, size);
    lines = s.bullets.map((b) => wrap(ctx, b, 500));
    if (465 + (lines.flat().length - 1) * 25.7 * (size / (15 * 0.82)) <= 600) break;
  }
  ctx.font = f(400, size);
  let y = 465;
  for (const item of lines) {
    item.forEach((l, n) => {
      if (!n) ctx.fillText("•", 61, y);
      ctx.fillText(l, 78, y);
      y += 25.7 * (size / (15 * 0.82));
    });
  }

  // The TA, at the foot.
  // Laid end to end by their widths (the gaps are the design's at the design's size), and
  // shrunk, if need be, to stay inside the card.
  ctx.fillStyle = "#000";
  const parts: [string, number, number][] = [["TA :", 700, 11], [`E : ${who.email}`, 500, 7], ...(who.phone ? ([["|", 500, 14], [`M : ${who.phone}`, 500, 0]] as [string, number, number][]) : [])];
  const span = (sz: number) =>
    parts.reduce((w, [t, wt, gap]) => {
      ctx.font = f(wt, sz);
      return w + ctx.measureText(t).width + gap * (sz / 15);
    }, 0);
  let ft = foot;
  while (ft > 8 && 55 + span(ft) > 640) ft -= 0.25;
  let fx = 55;
  parts.forEach(([t, wt, gap], n) => {
    ctx.font = f(wt, ft);
    ctx.fillText(t, fx, 641.5);
    const w = ctx.measureText(t).width;
    // Where the email and the phone really landed, for their edit boxes.
    if (n === 1) where.email = [fx, w];
    if (n === 3) where.phone = [fx, w];
    fx += w + gap * (ft / 15);
  });
  ctx.restore();
}

// ---- The parts of the card. Click one and it becomes a tag in the chat (/title, /salary...);
// what you ask next is about those parts only, and the tag's x lets go of it (owner, 20 Nov
// 2026). Each part's box is in the card's own 660-wide space, as drawn in drawCard.
type Part = "level" | "sector" | "title" | "location" | "company" | "salary" | "gender" | "requirements" | "email" | "phone";
const PARTS: { key: Part; name: string; box: [number, number, number, number]; can: string }[] = [
  { key: "level", name: "the level badge", box: [401, 0, 241, 71], can: "change the level (“make it senior”) and so the card’s colour" },
  { key: "sector", name: "the sector band", box: [0, 133, 660, 62], can: "reword it (“to Garments”) or change the card’s colour" },
  { key: "title", name: "the title", box: [48, 214, 600, 108], can: "reword it (“to Senior Finance Manager”), make it bold or underlined, or turn it white, green or black" },
  { key: "location", name: "the location", box: [57, 337, 249, 35], can: "reword it (“to Colombo”)" },
  { key: "company", name: "the company", box: [316, 337, 249, 35], can: "reword it (“to ABC Apparel”)" },
  { key: "salary", name: "the package", box: [57, 381, 249, 35], can: "reword it (“to 120K – 200K”)" },
  { key: "gender", name: "the gender line", box: [316, 381, 249, 35], can: "reword it (“to Female”)" },
  { key: "requirements", name: "the requirements", box: [0, 434, 660, 180], can: "“add …”, “remove the last one”, or “to …” (points separated by ;)" },
  { key: "email", name: "the email", box: [101, 620, 168, 30], can: "reword it (“to name@career141.com”)" },
  { key: "phone", name: "the phone number", box: [290, 620, 142, 30], can: "reword it (“to +94 77 123 4567”)" },
];
const FACT_AT: Partial<Record<Part, number>> = { location: 0, company: 1, salary: 2, gender: 3 };

type Msg = { who: "you" | "aura"; text: string; tags?: Part[] };
const HELP = "I can change the level, the colour, the font, the text size, underline the title, or reword it. Try “make it senior”, “make it orange”, “use Montserrat”, “bigger text” or “title to Senior Finance Manager”. You can also click a part of the card to pick it.";
const FIRST = "Click a part of the card - the title, the package, the requirements - and tell me what to change on it. Or just tell me: colour, font, text size, underline, or reword the title.";
const SUGGESTIONS = ["Make it orange", "Make it bold", "Bigger text", "Underline the title"];

// "Bigger" and "smaller" have no number of their own: they are a step from where the text is
// now, which only the view knows, so `send` turns these two markers into one.
const BIGGER = 9999;
const SMALLER = -9999;

// shortcut: no model behind this yet; with the backend the message and the tags go to AURA,
// which returns the same kind of patch. Until then these plain rules answer, and say so when
// they cannot.
function ask(text: string, cur: Snip, parts: Part[]): { patch: Partial<Snip>; reply: string } {
  const t = text.toLowerCase();
  const patch: Partial<Snip> = {};
  const done: string[] = [];
  const did = (what: string, p: Partial<Snip>) => {
    Object.assign(patch, p);
    done.push(what);
  };
  const on = (...keys: Part[]) => !parts.length || keys.some((k) => parts.includes(k));
  // The new title's own words are not instructions ("title to Orange County Lead").
  const title = text.match(/(?:title|heading|headline)\s+(?:to|as)\s+["“']?(.+?)["”']?\s*$/i);
  // With parts picked, "to <words>" / "say <words>" is the new text for the first one that has text.
  const words = parts.length ? text.match(/(?:^|\s)(?:to|as|say|says|reads?)\s+["“']?(.+?)["”']?\s*$/i) : null;
  const rest = title ? t.slice(0, title.index) : words ? t.slice(0, words.index) : t;
  const lvl = rest.match(/\b(junior|executive|mid|senior|c-?\s?level)\b/);
  if (lvl && on("level")) {
    const level = LEVELS.findIndex((l) => l.short.toLowerCase().replace(/\W/g, "") === lvl[1].replace(/\W/g, ""));
    if (level >= 0) did(`the level to ${LEVELS[level].pill}`, { level, colour: LEVELS[level].colour });
  }
  if (on("level", "sector")) {
    COLOURS.forEach((c, colour) => {
      // "green title" is the title's colour, not the card's.
      if (c.words.some((w) => new RegExp(`\\b${w}\\b(?!\\s+(?:text|title|heading))`).test(rest))) did(`the colour to ${c.name}`, { colour });
    });
  }
  FONTS.forEach((font) => {
    if (t.includes(font.toLowerCase())) did(`the font to ${font}`, { font });
  });
  const size = t.match(/(?:size|text)\D{0,12}(\d{2}(?:\.\d)?)\b/);
  if (size) {
    const body = Math.min(40, Math.max(16, Number(size[1])));
    did(`the text size to ${body}`, { body });
  } else if (/\b(bigger|larger|increase|grow)\b/.test(t)) did("the text bigger", { body: BIGGER });
  else if (/\b(smaller|reduce|decrease|shrink)\b/.test(t)) did("the text smaller", { body: SMALLER });
  if (on("title")) {
    if (/(remove|no|without|drop|un) ?bold/.test(t)) did("the bold off", { bold: false });
    else if (/\bbold(er)?\b/.test(t)) did("the title bold", { bold: true });
    if (/(remove|no|without|drop) underline/.test(t)) did("the underline off", { underline: false });
    else if (/underline/.test(t)) did("the title underlined", { underline: true });
    if (/white (text|title|heading)/.test(t)) did("the title white", { ink: 2 });
    else if (/(black|dark) (text|title|heading)/.test(t)) did("the title black", { ink: 0 });
    else if (/green (text|title|heading)/.test(t)) did("the title green", { ink: 1 });
    if (title) did("the title", { line1: title[1].slice(0, 60) }); // the bold second line stays, as the old system edits them apart
  }
  // New words for a picked part.
  if (parts.length && words && !title) {
    const value = words[1].trim();
    const texty = parts.filter((k) => k === "title" || k === "sector" || k === "requirements" || FACT_AT[k] !== undefined || k === "email" || k === "phone");
    // New words need one place to go.
    if (texty.length > 1) return { patch, reply: `Which one should read “${value}”? Let go of all but one of ${texty.map((k) => "/" + k).join(" ")} (the x on a tag) and say it again.` };
    const first = texty[0];
    if (first === "title") did("the title", { line1: value.slice(0, 60) });
    else if (first === "sector") did("the sector", { sector: value.slice(0, 30) });
    else if (first === "email" || first === "phone") did(PARTS.find((p) => p.key === first)!.name, { [first]: value.slice(0, 40) });
    else if (first === "requirements") did("the requirements", { bullets: value.split(/;|\n/).map((b) => b.trim().slice(0, 160)).filter(Boolean) });
    else if (first && FACT_AT[first] !== undefined) {
      const facts = [...cur.facts];
      facts[FACT_AT[first]!] = value.slice(0, 40);
      did(PARTS.find((p) => p.key === first)!.name, { facts });
    }
  }
  if (parts.includes("requirements")) {
    const add = text.match(/^\s*add\s*[:\-]?\s+(.+)$/i);
    if (add) did("a new point", { bullets: [...(patch.bullets ?? cur.bullets), add[1].trim().slice(0, 160)] });
    else if (/remove\s+(the\s+)?last/.test(t)) did("the last point removed", { bullets: (patch.bullets ?? cur.bullets).slice(0, -1) });
    else if (/remove\s+(the\s+)?first/.test(t)) did("the first point removed", { bullets: (patch.bullets ?? cur.bullets).slice(1) });
  }
  if (done.length) return { patch, reply: `Done — ${done.join(", ")}.` };
  if (parts.length) {
    const help = parts.map((k) => PARTS.find((p) => p.key === k)!).map((p) => `For ${p.name} I can ${p.can}.`);
    return { patch, reply: `I could not do that to ${parts.map((k) => "/" + k).join(" ")}. ${help.join(" ")}` };
  }
  return { patch, reply: HELP };
}

// Sizes are the frame's px / 16 on the app's rem scale (a floor for small windows);
// colours, the type scale and the shadow are DESIGN.md's tokens.
const BTN =
  "flex items-center gap-2 whitespace-nowrap rounded-full py-[max(0.625rem,7px)] pl-[max(1.25rem,14px)] pr-[max(1.375rem,15px)] text-small font-medium transition-colors";
const GHOST = BTN + " border border-border-strong bg-surface text-ink hover:bg-surface-2";
const CAPTION = "text-caption font-medium text-ink-3";

const Icon = ({ d, className }: { d: string; className: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d={d} />
  </svg>
);

/** The Snippets view: the card, its controls, and the chat that changes it. */
export default function SnippetsView() {
  // The card is made from the approved JD: the opening's one flag (jdState).
  const sampleApproved = useJdApproved();
  const [s, setS] = useState(START);
  // Signed in (R6, 21 Nov): the opening's own card from the TA System; the refine is real.
  const live = useLive();
  const job = live ? jobFromAddress() : null;
  const real = useSnippet(live, job);
  const [busy, setBusy] = useState(false);
  const [filled, setFilled] = useState<string | null>(null);
  if (live && real?.ok && real.fields && filled !== job) {
    const f = real.fields;
    const level = levelOf(f.jobTitle);
    setFilled(job);
    setS((x) => ({ ...x, ...snipOf(f, x), level, colour: LEVELS[level].colour, email: f.email || undefined, phone: f.mobile || undefined }));
  }
  const JD_APPROVED = live ? !!(real?.ok && real.approved) : sampleApproved;
  const canSource = live ? !(real && !real.ok) : CAN_SOURCE;
  const me = useMe();
  // The signed-in person's own contact; placeholder email and phone only on the sample.
  // Signed in with no mobile on record, the phone is left off, as the old card does (23 Nov).
  const who: Contact = { ta: me.first, email: s.email ?? `${me.first.toLowerCase()}@career141.com`, phone: s.phone ?? (live ? "" : "+94 77 000 0000") };
  const { go } = useOpeningView();
  const [msgs, setMsgs] = useState<Msg[]>([{ who: "aura", text: FIRST }]);
  // The parts of the card picked to talk about (tags in the chat).
  const [sel, setSel] = useState<Part[]>([]);
  const toggle = (k: Part) => setSel((x) => (x.includes(k) ? x.filter((v) => v !== k) : [...x, k]));
  const [toast, setToast] = useState<{ key: number; bold?: string; rest: string; warn?: boolean } | null>(null);
  const toasts = useRef(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [foot, setFoot] = useState<Where>({});
  const [logo, setLogo] = useState<HTMLImageElement | null>(null);
  const thread = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const img = new window.Image();
    img.onload = () => setLogo(img);
    img.src = "/career141-lockup.png";
  }, []);

  // Paint the card when anything changes, once the font is ready (the first paint
  // with a font not yet loaded would use a stand-in).
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    let off = false;
    Promise.all([300, 400, 500, 700].map((w) => document.fonts.load(`${w} 16px "${s.font}"`))).finally(() => {
      if (off) return;
      const w: Where = {};
      drawCard(ctx, s, logo, who, w);
      setFoot(w);
    });
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- who changes only with the person
  }, [s, logo, me.first]);

  useEffect(() => {
    thread.current?.scrollTo({ top: thread.current.scrollHeight });
  }, [msgs]);

  const say = (rest: string, bold?: string, warn?: boolean) => setToast({ key: ++toasts.current, bold, rest, warn });
  const caption = `${s.line1} ${s.line2.toLowerCase()} — ${s.sector}, ${s.facts[0]}. Package ${s.facts[2]}. Apply: ${who.email} · ${who.phone}`;

  // Named after the title, as the old system does, and drawn only once the fonts are in.
  const name = `${[s.line1, s.line2].join(" ").trim().replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "job"}-snippet.png`;
  const download = async () => {
    await document.fonts.ready;
    canvas.current?.toBlob((b) => {
      if (!b) return say("The picture could not be made.", undefined, true);
      const url = URL.createObjectURL(b);
      const a = Object.assign(document.createElement("a"), { href: url, download: name });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      say(" downloaded", name);
    }, "image/png");
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(caption);
      say(" copied for LinkedIn", "Caption");
    } catch {
      say("Copying was blocked by the browser.", undefined, true);
    }
  };

  /** The real refine: every label polished, requirements made short (old /api/snippet/refine). */
  const polish = async (said?: string) => {
    if (busy) return;
    setBusy(true);
    if (said) setMsgs((m) => [...m, { who: "you", text: said, tags: sel.length ? sel : undefined }]);
    const r = await refineSnippet({
      titleLead: s.line1, titleMain: s.line2, industry: s.sector, location: s.facts[0], company: s.facts[1], package: s.facts[2],
      gender: s.facts[3], bullets: s.bullets, level: LEVELS[s.level].short,
    });
    setBusy(false);
    if (!r.ok) {
      setMsgs((m) => [...m, { who: "aura", text: r.message }]);
      return;
    }
    setS((x) => ({ ...x, ...snipOf(r.data, x) }));
    setMsgs((m) => [...m, { who: "aura", text: "Polished the wording - title, facts and requirements. Say what to change if any of it is not right." }]);
  };

  const send = (text: string) => {
    // Rewording in general goes to the real refine; colour, font, size and picked-part edits stay instant.
    if (live && /\b(polish|refine|punch(y|ier)?|improve|reword|rewrite|better wording|fix (the )?(spelling|wording|typos?))\b/i.test(text)) return void polish(text);
    const { patch, reply } = ask(text, s, sel);
    if (patch.body === BIGGER || patch.body === SMALLER) patch.body = Math.min(40, Math.max(16, s.body + (patch.body === BIGGER ? 2 : -2)));
    setS((x) => ({ ...x, ...patch }));
    setMsgs((m) => [...m, { who: "you", text, tags: sel.length ? sel : undefined }, { who: "aura", text: reply }]);
  };

  const step = (d: number) => setS((x) => ({ ...x, body: Math.min(40, Math.max(16, x.body + d)) }));
  if (live && !real)
    return (
      <div className="flex flex-1 flex-col px-[max(1.5rem,14px)] pt-[max(1.4rem,14px)] max-md:pt-11">
        <BackButton />
        <p className="m-auto text-body text-ink-3">Reading the opening…</p>
      </div>
    );
  if (!canSource || !JD_APPROVED)
    return (
      <div className="flex flex-1 flex-col px-[max(1.5rem,14px)] pt-[max(1.4rem,14px)] max-md:pt-11">
        <BackButton />
        <div className="m-auto flex flex-col items-center gap-3 text-center">
          <p className="text-body text-ink-2">
            {!canSource ? (real && !real.ok ? real.message : "Snippets are made by the TAs who source for this job.") : "The JD has not been approved yet. The card is made from it."}
          </p>
          {canSource && (
            <button type="button" onClick={() => go("jd")} className="text-small font-medium text-brand hover:underline">
              Write the JD
            </button>
          )}
        </div>
      </div>
    );

  const nextVersion = () =>
    setS((x) => {
      const v = (x.version + 1) % VERSIONS.length;
      return { ...x, version: v, line1: VERSIONS[v][0], line2: VERSIONS[v][1] };
    });

  return (
    // The notch hangs into this box, so the top padding is the notch plus a gap and the foot
    // gets about the same gap; the card takes the height that is left (owner, 20 Nov 2026: it
    // touched the notch and left all the space below).
    <div className="relative flex min-h-0 flex-1 flex-col justify-center pb-[max(2.4rem,26px)] pt-[max(4.4375rem,52px)] short:pt-[max(3.6rem,52px)] pl-[max(7.1875rem,14px)] pr-[max(2.3rem,14px)] max-md:justify-start max-md:overflow-y-auto max-md:pt-11">
      <div className="absolute left-[max(1.5rem,14px)] top-[max(1.4rem,14px)] max-md:static max-md:mb-4">
        <BackButton />
      </div>

      {/* The row is as tall as the card (41.25rem), so the chat fills what is left under the
          controls and scrolls inside itself instead of growing with the messages. */}
      <div className="flex items-start gap-[max(3.75rem,14px)] md:h-full md:max-h-[41.25rem] max-md:flex-col max-md:gap-6">
        <div className="relative aspect-square w-full rounded-lg bg-surface md:h-full md:w-auto md:flex-none">
          <canvas ref={canvas} width={1080} height={1080} role="img" aria-label={`Social card: ${s.line1} ${s.line2}, ${s.sector}`} className="size-full rounded-lg" />
          {/* Click a part to talk about it: it shows as a tag in the chat. Not in the PNG. */}
          {PARTS.filter((p) => p.key !== "level").map((p) => (
            <button
              key={p.key}
              type="button"
              aria-pressed={sel.includes(p.key)}
              aria-label={`${sel.includes(p.key) ? "Let go of" : "Pick"} ${p.name} to change it`}
              title={`/${p.key} - click to change ${p.name} with AURA`}
              onClick={() => toggle(p.key)}
              style={(() => {
                // The email and phone boxes follow the text as it was drawn.
                const at = p.key === "email" ? foot.email : p.key === "phone" ? foot.phone : undefined;
                const b = at ? [at[0] - 6, p.box[1], at[1] + 12, p.box[3]] : p.box;
                return { left: `${(b[0] / 660) * 100}%`, top: `${(b[1] / 660) * 100}%`, width: `${(b[2] / 660) * 100}%`, height: `${(b[3] / 660) * 100}%` };
              })()}
              className={
                // No hard outline: a soft green wash and a small sparkle tag say "you can change this".
                "group absolute rounded-md outline-none transition-[background-color,box-shadow] hover:bg-brand/10 hover:ring-1 hover:ring-brand/25 focus-visible:bg-brand/10 focus-visible:ring-2 focus-visible:ring-brand/40 " +
                (sel.includes(p.key) ? "bg-brand/10 ring-2 ring-brand/30" : "")
              }
            >
              <span
                aria-hidden="true"
                className={
                  "pointer-events-none absolute -right-2 -top-2 grid size-6 place-items-center rounded-full bg-brand text-white shadow-card transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 " +
                  (sel.includes(p.key) ? "opacity-100" : "opacity-0")
                }
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="size-3.5">
                  <path d="M12 1.5c.7 5.6 4.9 9.8 10.5 10.5-5.6.7-9.8 4.9-10.5 10.5C11.3 16.9 7.1 12.7 1.5 12 7.1 11.3 11.3 7.1 12 1.5z" />
                </svg>
              </span>
            </button>
          ))}
        </div>

        <div className="flex min-w-0 flex-col gap-6 self-stretch md:max-w-[52.375rem] md:flex-1">
          <button type="button" onClick={() => (live ? void polish() : nextVersion())} disabled={busy} className="flex items-center gap-2.5 rounded-md bg-violet-soft px-4 py-3 text-left transition-colors hover:bg-surface-3">
            <svg viewBox="0 0 24 24" fill="currentColor" className="size-[max(1rem,14px)] shrink-0 text-violet" aria-hidden="true">
              <path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z" />
            </svg>
            <span className="text-small font-medium text-violet">{busy ? "AURA is polishing…" : "Make it punchier with AURA"}</span>
            <span className={CAPTION + " ml-auto"}>{s.version ? `Version ${s.version + 1} of ${VERSIONS.length}` : `${VERSIONS.length} versions`}</span>
          </button>

          {/* Level: sets the badge and the colour. */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <span className={CAPTION}>Level</span>
            <div role="radiogroup" aria-label="Level" className="flex flex-wrap gap-0.5 rounded-full bg-surface-2 p-1">
              {LEVELS.map((l, i) => (
                <button
                  key={l.pill}
                  type="button"
                  role="radio"
                  aria-checked={s.level === i}
                  onClick={() => setS((x) => ({ ...x, level: i, colour: l.colour }))}
                  className={
                    "flex items-center gap-1.5 rounded-full px-3 py-[0.4375rem] text-small font-medium " +
                    (s.level === i ? "bg-surface text-ink shadow-card" : "text-ink-3 hover:text-ink")
                  }
                >
                  <span aria-hidden="true" style={{ background: COLOURS[l.colour].hex }} className="size-2.5 rounded-full" />
                  {l.short}
                </button>
              ))}
            </div>
          </div>

          {/* Text row: size, title colour, bold, underline. Wraps on a narrow window instead of overlapping. */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <span className={CAPTION}>Text</span>
            <div className="flex h-[max(2.6875rem,34px)] items-center justify-center gap-1 rounded-full border border-border-strong bg-surface px-3 text-body font-medium text-ink-2">
              <button type="button" aria-label="Smaller text" onClick={() => step(-0.5)} className="w-4 hover:text-ink">
                -
              </button>
              <span className="w-[2.375rem] text-center" aria-label="Text size">
                {s.body}
              </span>
              <button type="button" aria-label="Bigger text" onClick={() => step(0.5)} className="w-4 hover:text-ink">
                +
              </button>
            </div>
            <button
              type="button"
              aria-label="Title colour"
              onClick={() => setS((x) => ({ ...x, ink: (x.ink + 1) % INKS.length }))}
              title="Title colour"
              className="flex size-8 items-center justify-center rounded-full text-ink hover:bg-surface-2"
            >
              <span className="relative text-body font-medium leading-none">
                A<span style={{ background: INKS[s.ink] }} className="absolute -bottom-0.5 -right-1 size-1.5 rounded-full ring-1 ring-surface" />
              </span>
            </button>
            <button
              type="button"
              aria-label="Bold the title"
              aria-pressed={s.bold}
              onClick={() => setS((x) => ({ ...x, bold: !x.bold }))}
              title="Bold the title"
              className={"flex size-8 items-center justify-center rounded-full text-body font-bold hover:bg-surface-2 " + (s.bold ? "bg-brand-soft text-brand" : "text-ink")}
            >
              B
            </button>
            <button
              type="button"
              aria-label="Underline the title"
              aria-pressed={s.underline}
              onClick={() => setS((x) => ({ ...x, underline: !x.underline }))}
              title="Underline the title"
              className={"flex size-8 items-center justify-center rounded-full hover:bg-surface-2 " + (s.underline ? "bg-brand-soft text-brand" : "text-ink")}
            >
              <Icon d="M7 4v7a5 5 0 0 0 10 0V4M5 20h14" className="size-5" />
            </button>
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={download} className={BTN + " bg-brand text-white hover:bg-brand-strong"}>
              <Icon d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" className="size-[max(1rem,14px)]" />
              Download PNG
            </button>
            <button type="button" onClick={copy} className={GHOST}>
              <Icon d="M9 9h10v10H9zM5 15V5h10" className="size-[max(1rem,14px)]" />
              Copy caption for LinkedIn
            </button>
          </div>
          <div className="-mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-caption text-ink-3">Square PNG, 1080 × 1080, for WhatsApp, Facebook and LinkedIn</p>
            <button
              type="button"
              onClick={() => {
                setS(START);
                say("The card is back on the design.");
              }}
              className="text-caption font-medium text-brand hover:underline"
            >
              Put everything back on the design
            </button>
          </div>

          {/* The empty space under the controls: ask AURA to change the card in words. */}
          <div className="flex min-h-0 flex-1 flex-col gap-3.5 rounded-lg bg-canvas px-5 pb-4 pt-[1.125rem] max-md:h-[28rem] max-md:flex-none">
            <div className="flex items-center gap-2.5">
              <Image src="/aura-mark.png" alt="" width={28} height={28} className="size-[max(1.75rem,22px)] shrink-0 rounded-full" />
              <p className="text-body font-medium text-ink">Change the snippet by chatting</p>
            </div>
            <div ref={thread} className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto [scrollbar-width:none]">
              {msgs.map((m, i) =>
                m.who === "you" ? (
                  <p key={i} className="max-w-[85%] self-end rounded-md bg-surface px-4 py-2.5 text-small text-ink">
                    {m.tags?.map((k) => (
                      <span key={k} className="mr-1.5 rounded-full bg-brand-soft px-2 py-0.5 text-caption font-medium text-brand-strong">
                        /{k}
                      </span>
                    ))}
                    {m.text}
                  </p>
                ) : (
                  <p key={i} className="max-w-[37.5rem] text-small text-ink-2">
                    {m.text}
                  </p>
                ),
              )}
              {msgs.length === 1 && (
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((q) => (
                    <button key={q} type="button" onClick={() => send(q)} className="rounded-full bg-surface px-3 py-1 text-caption font-medium text-ink-2 hover:text-ink">
                      {q}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {sel.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5" aria-label="Parts of the card you are changing">
                <span className="text-caption text-ink-3">Changing</span>
                {sel.map((k) => (
                  <span key={k} className="flex items-center gap-1 rounded-full bg-brand-soft py-0.5 pl-2.5 pr-1 text-caption font-medium text-brand-strong">
                    /{k}
                    <button type="button" aria-label={`Let go of /${k}`} onClick={() => toggle(k)} className="flex size-4 items-center justify-center rounded-full hover:bg-brand/15">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" className="size-2.5" aria-hidden="true">
                        <path d="M6 6l12 12M18 6 6 18" />
                      </svg>
                    </button>
                  </span>
                ))}
                {sel.length > 1 && (
                  <button type="button" onClick={() => setSel([])} className="text-caption text-ink-3 hover:text-ink">
                    Clear
                  </button>
                )}
              </div>
            )}
            <form
              className="flex items-center gap-2.5 rounded-full bg-surface py-1.5 pl-4 pr-1.5 focus-within:ring-2 focus-within:ring-brand/30"
              onSubmit={(e) => {
                e.preventDefault();
                const el = e.currentTarget.elements.namedItem("ask") as HTMLInputElement;
                if (el.value.trim()) send(el.value.trim());
                e.currentTarget.reset();
              }}
            >
              <input name="ask" aria-label="Ask for a change" placeholder={sel.length ? `Change ${sel.map((k) => "/" + k).join(" ")} - for example “to …”` : "Ask for a change…"} className="min-w-0 flex-1 bg-transparent text-small text-ink outline-none placeholder:text-ink-3" />
              <button type="submit" aria-label="Send" className="flex size-[max(2.125rem,28px)] shrink-0 items-center justify-center rounded-full bg-brand text-white transition-colors hover:bg-brand-strong">
                <Icon d="M12 19V5M5 12l7-7 7 7" className="size-[max(0.9375rem,13px)]" />
              </button>
            </form>
          </div>
        </div>
      </div>
      {toast && <Toast key={toast.key} bold={toast.bold} rest={toast.rest} warn={toast.warn} />}
    </div>
  );
}

