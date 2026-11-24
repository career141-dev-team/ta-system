# AURA design guidelines

**Every screen in this repository follows this page.** It is the owner's Figma page
"Whiteboard — a calm workspace for recruiters" (file *AURA Logo and Ui design (system)*,
node 521-193), written down so a person or an AI chat can follow it without opening
Figma. The values live in code in one place: the `@theme` block of
[`src/app/globals.css`](src/app/globals.css). Use the token names below; never type a
colour, corner or shadow by hand in a component.

If this page and a screen design disagree, ask the owner; until he answers, the
guidelines win.

## 1. The four rules

1. **One board, one job.** Each section opens on its main purpose. Openings → find a
   job. Database → find a person. Strategy → decide who does what. The main task is
   always the biggest thing on the screen.
2. **Hide, don't remove.** Secondary tools live in a right drawer, a "⋯" menu or
   AURA. Nothing the TA uses today is lost — it is just quieter.
3. **Talk to it.** AURA is on every board. Ask, plan, filter or jump ("open the SAP
   role"). Chat is a shortcut, never the only way.
4. **Show the decision.** Data is drawn as the answer: who is overloaded, what is
   late, what to do next — not as raw tables.

The look: a dotted canvas, Poppins, Career141 green, a floating pill nav, notch-tab
boards and the AURA chat bar.

## 2. Colour

Neutral, near-white boards so the data and the green actions stand out. A status
colour is always paired with its soft tint. **The AURA colours are for AI only.**

| Group | Token (Tailwind class part) | Hex | Use |
|---|---|---|---|
| Canvas & surfaces | `canvas` | #F6F7F9 | the page behind every board (with dots) |
| | `surface` | #FFFFFF | boards and cards |
| | `surface-2` | #F3F4F6 | quiet fills: pills, chips, toolbars |
| | `surface-3` | #ECEEF1 | pressed / selected fills |
| | `border` | #E7E9ED | hairlines (`border-border`) |
| | `border-strong` | #D3D7DD | a line that must be seen |
| Ink | `ink` | #16191D | main text |
| | `ink-2` | #4E5862 | secondary text |
| | `ink-3` | #8A939C | hints, placeholders, disabled |
| | `marker` | #1F2A37 | the "pen" colour for hand-drawn marks |
| Brand | `brand` | #165B42 | actions: primary buttons, links, selected |
| | `brand-strong` | #0B3F2C | hover / pressed of a brand action |
| | `brand-soft` | #E6F2EC | success-ish tint behind brand text |
| | `brand-tint` | #F2F8F5 | the faintest green wash |
| | `brand-leaf` | #3FA34D | the logo's leaf, small accents |
| Status | `info` / `info-soft` | #167CA9 / #EAF7FE | information |
| | `warn` / `warn-soft` | #A8791B / #FCF5E3 | waiting, needs attention |
| | `danger` / `danger-soft` | #D93A31 / #FDECEB | refused, failed, late |
| | `success` / `success-soft` | #1E8A4C / #E5F5EC | done |
| | `violet` / `violet-soft` | #6E4FE8 / #F0ECFE | a person or source label |
| Sticky notes | `sticky-yellow` `sticky-mint` `sticky-sky` `sticky-pink` `sticky-lilac` | #FFF3B0 #D9F4E3 #DCEEFB #FDE1E3 #ECE5FE | notes on the board |
| AURA (AI only) | `aura-1` `aura-2` `aura-3` `aura-4` | #8B5CFF #3D6BFF #22D3C5 #8CF55A | the AURA gradient and glow |

Examples: `bg-surface`, `text-ink-2`, `border-border`, `bg-warn-soft text-warn`,
`bg-brand hover:bg-brand-strong text-white`. With opacity: `ring-brand/30`.
In data (a status dot), write `"var(--color-warn)"`, not a hex.

Kept on purpose, not tokens: other companies' marks (LinkedIn blue, Word blue) and the
pipeline stages' dot colours from the owner's board design (`pipelineRules.ts`).

Older class names still work and mean the same as the new ones: `muted` = `ink-2`,
`pill-line` = `brand`, `line` = `border`, `soft` = `surface-2`. Do not use them in new
code.

## 3. Typography

Poppins for the product. **Caveat is the "marker pen" — only for greetings, sticky
notes and AURA hints, never for data.** JetBrains Mono for ids, times and codes.

| Class | Figma style | Size / line (px at 1920) | Weight | Example |
|---|---|---|---|---|
| `text-display font-light` | WB/Display | 56 / 66, −1.5 | Light 300 | Good morning, Chathura |
| `text-h1 font-light` | WB/H1 | 40 / 50, −1 | Light 300 | Senior Manager — SAP Transformation |
| `text-h2` | WB/H2 | 26 / 34, −0.4 | Regular 400 | Today's board |
| `text-h3 font-medium` | WB/H3 | 18 / 26, −0.1 | Medium 500 | Director shortlist |
| `text-body` | WB/Body | 16 / 26 | Regular 400 | Five CVs make a set. |
| `text-body font-medium` | WB/Body Strong | 16 / 26 | Medium 500 | Nipuna Abeysekara · Assistant Manager |
| `text-small` | WB/Small | 14 / 21 | Regular 400 | Colombo · 9 yrs · Notice 1 month |
| `text-small font-medium` | WB/Small Strong | 14 / 21 | Medium 500 | |
| `text-caption font-medium` | WB/Caption | 12 / 16, +0.3 | Medium 500 | STATUS · ACTIVE |
| `font-hand text-hand-l font-bold` | WB/Hand L | 34 / 38 | Caveat Bold | Start with the SAP role |
| `font-hand text-hand-m` | WB/Hand M | 24 / 28 | Caveat Regular | 3 CVs to chase before lunch |
| `font-mono text-mono` | WB/Mono | 13 / 18 | JetBrains Mono | 12:04 · 76 128 active |

(The labels on the Figma page say Display 44/52 and H1 SemiBold 28/36; the text styles
the page actually uses are the ones above. The styles are followed.)

Each size has a floor (`max(rem, px)`) so a laptop window stays readable. Screens built
before 13 Nov keep a few sizes of their own from their screen designs (`text-nav`,
`text-row`, `text-card-name` ...); new screens use the scale above.

## 4. Shape, depth and motion

Soft, rounded and light. Boards float on the dotted canvas; nothing has a heavy border.

**Corners** — `rounded-xs` 6 · `rounded-sm` 10 · `rounded-md` 16 · `rounded-lg` 24 ·
`rounded-xl` 32 · `rounded-full` (pill, 999). A board (the big white card) is
`rounded-lg`; a card or panel inside it `rounded-md`; a chip or small box `rounded-sm`.

**Shadows** — `shadow-card` (a board or card at rest) · `shadow-float` (menus,
popovers, anything lifted) · `shadow-sticky` (sticky notes) · `shadow-aura` (the AURA
glow; AI only).

**Motion** (GSAP only, through [`src/lib/gsap.ts`](src/lib/gsap.ts); durations and
eases come from `DUR`, `EASE` and `MOTION`, never typed in):

**One switch, everywhere (owner, 13 Nov 2026).** Whenever what is shown in a place
changes — opening a view, a tab, Midday ↔ End of day, a list ↔ its reading view, one CV
to the next — the new content fades up 6px, once, in 280 ms: `swapIn(el)` or
`useSwap(ref, key)` from `src/lib/gsap.ts`. Never a staggered "loading" sequence, never a
rotation, never a different move for a different screen. Besides the switch there are
only two other motions: **lift** (a menu, popover or dialog opening over the page) and
**settle** (a card you just moved landing in its new place — pin & settle). Nothing
animates on a plain redraw.

| Name | What it is | In code |
|---|---|---|
| Switch | the one transition for changed content, see above | `swapIn` / `useSwap` |
| Draw-in | lines and charts "draw" left→right, 400 ms ease-out, like a marker on a whiteboard | `MOTION.drawIn` |
| Pin & settle | a card you moved lands with a 6px rise + 2° settle (staggered 40 ms when several land) — only on a move, never on a switch | `gsap.from(card, PIN_IN)` |
| Board slide | moving into a job zooms the card into the full board (shared element, 320 ms) | `MOTION.boardSlide` |
| AURA breathe | the AURA orb pulses its gradient slowly while thinking; never spins | `motionOK()` loops only |
| Respect calm | `prefers-reduced-motion` → fades only | handled once in `gsap.ts` |
| Arrive | a page you open flows in: its on-screen blocks rise 12px and fade in, 35 ms apart (first 24); only when you move to another page (never the first load - styling server HTML before React takes it over breaks hydration), never on a redraw or a view switch; always fully shown 1.5 s later | automatic — `src/app/Motion.tsx` |
| Press | anything you can press gives (0.96) under the pointer and springs back | automatic — `Motion.tsx` |
| Hover lift | a card you can open rises 3px while pointed at | automatic for `main a.rounded-lg`, `[data-card]`; opt in with `data-lift` |
| Nudge | an arrow in a link moves 3px towards where it goes on hover | put `data-nudge` on the arrow's `<svg>` |
| Count up | a number counts to its value when it shows or changes | `<Count n={…} />` from `src/app/Count.tsx` |

**Views inside an opening turn like pages (owner, 14 Nov 2026: "inside the pipeline it
just appears").** View to view, the old view slides out as the new one slides in, in the
bottom bar's order, with the opening page (the Job button) as the first stop, so the ATS
moves exactly like Headhunting; then the view's parts flow in (Pipeline columns, rows, cards -
never the cards inside a column). In `OpeningView.tsx`. Two rules learned the hard way:
run this in a plain effect, not useGSAP (a view still downloading suspends React, which
reverts a useGSAP context), and find elements by ref or on-screen only - Next keeps
earlier visits of a page in the document, hidden.

**Loading, the premium way (owner, 14 Nov 2026).** The first load: the top bar drops in
and the board rises in (`.enter-nav`, `.enter-board` - pure CSS, fill mode backwards, so
no hydration mismatch and nothing held after). Moving between pages: the rounded loading
bar under the tab rises, a glowing pill in AURA's colours glides along it, and it fills
green and sinks when the page arrives (Board.tsx). While a screen or a view's code is
still coming, a shimmer placeholder shaped like it (`src/app/Skeleton.tsx`,
`.shimmer`) - never a blank area. Less motion asked for: the pill holds still and the
shimmer stops.

**One board for the whole app (owner, 14 Nov 2026: "one common tab... only the tab
changes").** Today, Openings, Strategy Planner, Database, TA Track (and Alerts, Search,
People) sit on one white board with one middle tab, drawn once in `src/app/Board.tsx`
and kept across pages. A page renders only its content - never its own `<main>` or tab.
Moving between them: the tab's name slides in and the content slides in from the side
you moved towards (top-bar order), 280-450 ms. An opening (`/openings/<id>`) keeps its
own layout. A new top-level page: add it to `PAGES` in Board.tsx.

| Tab glide | the highlight behind a row of tabs glides to the chosen tab with a small overshoot | `useTabGlide(rowRef, key)` + one `[data-tab-glide]` span |
| Icon pop | a button's icon swells a touch on hover and settles | automatic — `Motion.tsx` |

**Every screen gets Arrive, Press and Hover lift without any code (owner, 14 Nov 2026:
"GSAP for everything, every button… like a modern dashboard").** One motion per kind
of thing, so the app still moves as one. Opt out with `data-still` on anything GSAP
already moves (a dragged card: `data-card-id` is skipped already). New numbers on a
dashboard use `<Count>`; new arrows get `data-nudge`.

## 5. Sizing

The screen designs are drawn 1920 wide. `1rem` is 1/120 of the window (16px at 1920,
never under 9px), so write sizes on Tailwind's rem scale (`h-8.5`, not `h-[34px]`), with
a px floor for small text (`text-[max(0.9rem,12px)]`). Check every screen at
**1920×950**, at the owner's laptop **1267×587** (one view, no page scroll) and at a
phone **375×812**.

## 6. Before you finish a screen

- [ ] No hex, rgb or hand-made shadow in the component — tokens only.
- [ ] Text uses the type scale; Caveat only for greetings, notes and AURA hints.
- [ ] Corners and shadows from the lists above.
- [ ] Motion through `src/lib/gsap.ts`: content that changes uses the one switch (`swapIn` / `useSwap`); no screen-specific entrance.
- [ ] AURA colours only on AI things.
- [ ] Checked at 1920×950, 1267×587 and 375×812.
- [ ] **Used it like a TA, not just looked at it** (owner, 13 Nov 2026: "check every user experience without compromise"):
  - Pointer: every hover, click and drag; where the pointer ends up after the screen moves or resizes; nothing left open for good.
  - Keyboard: Tab reaches every control with a visible ring; Enter/Escape/arrows do what the screen suggests.
  - Touch: no hover-only action; targets big enough; the whole card is clickable when it looks like one.
  - States: empty, one, many, very long text, locked/no access, lead vs TA wording, error and waiting.
  - Nothing jumps, shifts off-centre or overlaps when the content changes.
  - Every gap found is fixed or written down for the owner - never left silent.
