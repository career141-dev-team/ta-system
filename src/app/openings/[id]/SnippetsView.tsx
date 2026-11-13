"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
// Poppins 700 for the card's bold line; the layout loads 300 to 600.
import "@fontsource/poppins/700.css";
// shortcut: the font picker also offers Outfit, Montserrat and Jost, which the app does not
// load yet. Run `npm i @fontsource/outfit @fontsource/montserrat @fontsource/jost` and import
// their 300, 400, 500, 600 and 700 css here; until then those three draw in Poppins.
import { BackButton } from "./PipelineBoard";
import Toast from "./Toast";

// The Snippets view (Figma 713:1721): the role as a 1080 x 1080 social card - made
// here, live, so the colour, font, size and underline change it - with the buttons to
// download it as a PNG or copy its LinkedIn caption, and AURA's chat under them to ask
// for changes in words. Placeholder data: the role is the design's sample. With the
// backend the role, its details and the TA's contact are the opening's own.

type Snip = { colour: number; font: string; body: number; underline: boolean; ink: number; version: number; line1: string; line2: string };

const COLOURS = [
  { name: "mint", words: ["mint", "green"], hex: "#01fea3" },
  { name: "yellow", words: ["yellow", "lemon"], hex: "#e9ee57" },
  { name: "peach", words: ["peach", "cream", "beige"], hex: "#fed790" },
  { name: "cyan", words: ["cyan", "blue", "aqua", "turquoise", "teal"], hex: "#41f4e3" },
  { name: "orange", words: ["orange"], hex: "#ffaa5b" },
];
const FONTS = ["Poppins", "Outfit", "Montserrat", "Jost"];
// The heading in the three versions "Make it punchier with AURA" cycles through; the first is the role as posted.
const VERSIONS: [string, string][] = [
  ["Executive / Senior Executive", "ACQUISITION"],
  ["Lead finance.", "SHAPE THE NUMBERS"],
  ["Own the numbers.", "FINANCE EXECUTIVE"],
];
const INKS = ["#000000", "#165b42", "#ffffff"];
const START: Snip = { colour: 0, font: "Poppins", body: 24.5, underline: false, ink: 0, version: 0, line1: VERSIONS[0][0], line2: VERSIONS[0][1] };

const ROLE = {
  level: "LEVEL - EXECUTIVE",
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
  ta: "Chirani",
  email: "Chirani@career141.com",
  phone: "+94 76 426 3120",
};

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

function drawCard(ctx: CanvasRenderingContext2D, s: Snip, logo: HTMLImageElement | null) {
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
  ctx.fillText(ROLE.level, 519.5, 41);
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
  ctx.fillText(ROLE.sector, 55, 171);

  // Heading: the light line, then the bold one. Sized to the design's widths (its own
  // face is narrower than Poppins), baselines as measured.
  ctx.fillStyle = INKS[s.ink];
  ctx.font = f(300, 42);
  ctx.fillText(s.line1, 57, 252);
  ctx.font = f(700, 52.7);
  ctx.fillText(s.line2, 57, 307);
  if (s.underline) {
    ctx.font = f(300, 42);
    ctx.fillRect(57, 258, ctx.measureText(s.line1).width, 2.5);
    ctx.font = f(700, 52.7);
    ctx.fillRect(57, 313, ctx.measureText(s.line2).width, 2.5);
  }

  // The four facts, white pills.
  ROLE.facts.forEach(([label, value], i) => {
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
    ctx.font = f(700, 11);
    ctx.fillText(value, x + at, y + 20.5);
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
    lines = ROLE.bullets.map((b) => wrap(ctx, b, 500));
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
  const parts: [string, number, number][] = [["TA :", 700, 11], [`E : ${ROLE.email}`, 500, 7], ["|", 500, 14], [`M : ${ROLE.phone}`, 500, 0]];
  const span = (sz: number) =>
    parts.reduce((w, [t, wt, gap]) => {
      ctx.font = f(wt, sz);
      return w + ctx.measureText(t).width + gap * (sz / 15);
    }, 0);
  let ft = foot;
  while (ft > 8 && 55 + span(ft) > 640) ft -= 0.25;
  let fx = 55;
  for (const [t, wt, gap] of parts) {
    ctx.font = f(wt, ft);
    ctx.fillText(t, fx, 641.5);
    fx += ctx.measureText(t).width + gap * (ft / 15);
  }
  ctx.restore();
}

// ---- The chat. A small stand-in for AURA: it understands a few kinds of request and
// says what it did. shortcut: no model behind it yet; with the backend the message goes
// to AURA, which returns the same kind of patch.
type Msg = { who: "you" | "aura"; text: string };
const HELP = "I can change the colour, the font, the text size, underline the title, or reword it. Try “make it orange”, “use Montserrat”, “bigger text” or “title to Senior Finance Manager”.";
const SUGGESTIONS = ["Make it orange", "Use Montserrat", "Bigger text", "Underline the title"];

// "Bigger" and "smaller" have no number of their own: they are a step from where the text is
// now, which only the view knows, so `send` turns these two markers into one.
const BIGGER = 9999;
const SMALLER = -9999;

function ask(text: string): { patch: Partial<Snip>; reply: string } {
  const t = text.toLowerCase();
  const patch: Partial<Snip> = {};
  const done: string[] = [];
  const did = (what: string, p: Partial<Snip>) => {
    Object.assign(patch, p);
    done.push(what);
  };
  COLOURS.forEach((c, colour) => {
    if (c.words.some((w) => new RegExp(`\\b${w}\\b`).test(t))) did(`the colour to ${c.name}`, { colour });
  });
  FONTS.forEach((font) => {
    if (t.includes(font.toLowerCase())) did(`the font to ${font}`, { font });
  });
  const size = t.match(/(?:size|text)\D{0,12}(\d{2}(?:\.\d)?)\b/);
  if (size) {
    const body = Math.min(40, Math.max(16, Number(size[1])));
    did(`the text size to ${body}`, { body });
  } else if (/\b(bigger|larger|increase|grow)\b/.test(t)) did("the text bigger", { body: BIGGER });
  else if (/\b(smaller|reduce|decrease|shrink)\b/.test(t)) did("the text smaller", { body: SMALLER });
  if (/(remove|no|without|drop) underline/.test(t)) did("the underline off", { underline: false });
  else if (/underline/.test(t)) did("the title underlined", { underline: true });
  if (/white (text|title|heading)/.test(t)) did("the title white", { ink: 2 });
  else if (/(black|dark) (text|title|heading)/.test(t)) did("the title black", { ink: 0 });
  else if (/green (text|title|heading)/.test(t)) did("the title green", { ink: 1 });
  const title = text.match(/(?:title|heading|headline)\s+(?:to|as)\s+["“']?(.+?)["”']?\s*$/i);
  if (title) did("the title", { line1: title[1] });
  return { patch, reply: done.length ? `Done — ${done.join(", ")}.` : HELP };
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
  const [s, setS] = useState(START);
  const [msgs, setMsgs] = useState<Msg[]>([{ who: "aura", text: "Tell me what to change on the card — colour, font, text size, underline or the title." }]);
  const [toast, setToast] = useState<{ key: number; bold?: string; rest: string; warn?: boolean } | null>(null);
  const toasts = useRef(0);
  const canvas = useRef<HTMLCanvasElement>(null);
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
    Promise.all([300, 400, 500, 700].map((w) => document.fonts.load(`${w} 16px "${s.font}"`))).finally(() => !off && drawCard(ctx, s, logo));
    return () => {
      off = true;
    };
  }, [s, logo]);

  useEffect(() => {
    thread.current?.scrollTo({ top: thread.current.scrollHeight });
  }, [msgs]);

  const say = (rest: string, bold?: string, warn?: boolean) => setToast({ key: ++toasts.current, bold, rest, warn });
  const caption = `${s.line1} ${s.line2.toLowerCase()} — ${ROLE.sector}, ${ROLE.facts[0][1]}. Package ${ROLE.facts[2][1]}. Apply: ${ROLE.email} · ${ROLE.phone}`;

  const download = () =>
    canvas.current?.toBlob((b) => {
      if (!b) return say("The picture could not be made.", undefined, true);
      const url = URL.createObjectURL(b);
      const a = Object.assign(document.createElement("a"), { href: url, download: "snippet-1080x1080.png" });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      say(" downloaded", "snippet-1080x1080.png");
    }, "image/png");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(caption);
      say(" copied for LinkedIn", "Caption");
    } catch {
      say("Copying was blocked by the browser.", undefined, true);
    }
  };

  const send = (text: string) => {
    const { patch, reply } = ask(text);
    if (patch.body === BIGGER || patch.body === SMALLER) patch.body = Math.min(40, Math.max(16, s.body + (patch.body === BIGGER ? 2 : -2)));
    setS((x) => ({ ...x, ...patch }));
    setMsgs((m) => [...m, { who: "you", text }, { who: "aura", text: reply }]);
  };

  const step = (d: number) => setS((x) => ({ ...x, body: Math.min(40, Math.max(16, x.body + d)) }));
  const nextVersion = () =>
    setS((x) => {
      const v = (x.version + 1) % VERSIONS.length;
      return { ...x, version: v, line1: VERSIONS[v][0], line2: VERSIONS[v][1] };
    });

  return (
    <div className="relative flex min-h-0 flex-1 flex-col pb-[max(3.5rem,14px)] pl-[max(7.1875rem,14px)] pr-[max(2.3rem,14px)] pt-[max(4.4375rem,52px)] max-md:overflow-y-auto max-md:pt-11">
      <div className="absolute left-[max(2.3rem,14px)] top-[max(2.8rem,40px)] max-md:static max-md:mb-4">
        <BackButton />
      </div>

      {/* The row is as tall as the card (41.25rem), so the chat fills what is left under the
          controls and scrolls inside itself instead of growing with the messages. */}
      <div className="flex items-start gap-[max(3.75rem,14px)] md:h-[41.25rem] max-md:flex-col max-md:gap-6">
        <div className="aspect-square w-full overflow-hidden rounded-[1.75rem] bg-surface md:flex-[0_1_41.25rem]">
          <canvas ref={canvas} width={1080} height={1080} role="img" aria-label={`Social card: ${s.line1} ${s.line2}, ${ROLE.sector}`} className="size-full" />
        </div>

        <div className="flex min-w-0 flex-col gap-6 self-stretch md:max-w-[52.375rem] md:flex-1">
          <button type="button" onClick={nextVersion} className="flex items-center gap-2.5 rounded-[1.125rem] bg-violet-soft px-4 py-3 text-left transition-colors hover:bg-violet-soft/70">
            <svg viewBox="0 0 24 24" fill="currentColor" className="size-[max(1rem,14px)] shrink-0 text-violet" aria-hidden="true">
              <path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z" />
            </svg>
            <span className="text-small font-medium text-violet">Make it punchier with AURA</span>
            <span className={CAPTION + " ml-auto"}>{s.version ? `Version ${s.version + 1} of ${VERSIONS.length}` : `${VERSIONS.length} versions`}</span>
          </button>

          <div className="flex items-start gap-2.5">
            <span className={CAPTION + " uppercase"}>Colour</span>
            <div className="flex gap-3" role="radiogroup" aria-label="Colour">
              {COLOURS.map((c, i) => (
                <button
                  key={c.name}
                  type="button"
                  role="radio"
                  aria-checked={s.colour === i}
                  aria-label={c.name}
                  onClick={() => setS((x) => ({ ...x, colour: i }))}
                  style={{ background: c.hex }}
                  className={"size-10 rounded-full border " + (s.colour === i ? "border-ink" : "border-transparent")}
                />
              ))}
            </div>
          </div>

          {/* Font row: placed as drawn, so the toolbar keeps the design's gaps. */}
          <div className="relative h-[2.6875rem] w-full">
            <span className={CAPTION + " absolute left-0 top-0"}>Font</span>
            <div role="radiogroup" aria-label="Font" className="absolute left-[2.3125rem] top-0 flex gap-0.5 rounded-[1.375rem] bg-surface-2 p-1">
              {FONTS.map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={s.font === n}
                  onClick={() => setS((x) => ({ ...x, font: n }))}
                  className={"rounded-[1.125rem] px-3.5 py-[0.4375rem] text-small font-medium " + (s.font === n ? "bg-surface text-ink shadow-card" : "text-ink-3 hover:text-ink")}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="absolute left-[24.4375rem] top-0 flex h-full w-[5.875rem] items-center justify-center gap-0.5 rounded-[1.25rem] border border-black/20 bg-surface px-[1.0625rem] text-[max(1rem,13px)] font-medium text-black/20">
              <button type="button" aria-label="Smaller text" onClick={() => step(-0.5)} className="w-[0.5625rem] hover:text-ink">
                -
              </button>
              <span className="w-[2.375rem] text-center" aria-label="Text size">
                {s.body}
              </span>
              <button type="button" aria-label="Bigger text" onClick={() => step(0.5)} className="w-[0.5625rem] hover:text-ink">
                +
              </button>
            </div>
            <button
              type="button"
              aria-label="Title colour"
              onClick={() => setS((x) => ({ ...x, ink: (x.ink + 1) % INKS.length }))}
              className="absolute left-[31.8125rem] top-1/2 flex size-[1.25rem] -translate-y-1/2 items-center justify-center text-ink"
            >
              <span className="relative text-[max(1.0625rem,13px)] font-medium leading-none">
                A<span style={{ background: INKS[s.ink] }} className="absolute -bottom-0.5 -right-1 size-1.5 rounded-full ring-1 ring-surface" />
              </span>
            </button>
            <button
              type="button"
              aria-label="Underline the title"
              aria-pressed={s.underline}
              onClick={() => setS((x) => ({ ...x, underline: !x.underline }))}
              className={"absolute left-[34.5625rem] top-1/2 size-6 -translate-y-1/2 " + (s.underline ? "text-brand" : "text-ink")}
            >
              <Icon d="M7 4v7a5 5 0 0 0 10 0V4M5 20h14" className="size-full" />
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

          {/* The empty space under the controls: ask AURA to change the card in words. */}
          <div className="flex min-h-0 flex-1 flex-col gap-3.5 rounded-lg bg-canvas px-5 pb-4 pt-[1.125rem] max-md:h-[28rem] max-md:flex-none">
            <div className="flex items-center gap-2.5">
              <span className="flex size-[max(1.75rem,22px)] shrink-0 items-center justify-center overflow-hidden rounded-full bg-black">
                <Image src="/aura-mark.png" alt="" width={28} height={28} className="size-full" />
              </span>
              <p className="text-body font-medium text-ink">Change the snippet by chatting</p>
            </div>
            <div ref={thread} className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto [scrollbar-width:none]">
              {msgs.map((m, i) =>
                m.who === "you" ? (
                  <p key={i} className="max-w-[85%] self-end rounded-[1.125rem] bg-surface px-4 py-2.5 text-small text-ink">
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
            <form
              className="flex items-center gap-2.5 rounded-[1.375rem] bg-surface py-1.5 pl-4 pr-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                const el = e.currentTarget.elements.namedItem("ask") as HTMLInputElement;
                if (el.value.trim()) send(el.value.trim());
                e.currentTarget.reset();
              }}
            >
              <input name="ask" aria-label="Ask for a change" placeholder="Ask for a change…" className="min-w-0 flex-1 bg-transparent text-small text-ink outline-none placeholder:text-ink-3" />
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
