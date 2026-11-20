import OpeningCards from "./OpeningCards";
import LiveName from "./LiveName";
import { StagePill, StatusPill } from "./LivePills";
import { TeamPill } from "./TeamPill";
import { PlacedChip } from "./PlacedChip";
import RowLink from "./RowLink";
import { type MenuOption } from "./PillMenu";
import Notch from "./Notch";
import OpeningView from "./OpeningView";
import { ATS_ROWS, HH_ROWS } from "./rows";
import type { WorkView } from "./view";
import { CAN_SOURCE } from "@/lib/user";
import RefereeBadge from "./RefereeBadge";

// Placeholder: the opening shown in the design. Replaced by the backend read
// when the owner wires this screen.
const OPENING = {
  title: "Senior Manager - Manufacturing Business Transformation (SAP based)",
  client: "PGP",
  status: "Active",
  stage: "100%",
};
// Every row opens its work view in place (OpeningView), ATS and Headhunting alike.
const ATS = ATS_ROWS;

const HEADHUNTING = HH_ROWS;

// Sizes are on Tailwind's rem scale (2.125rem = 34px at 1920) so they follow
// the window width; see globals.css. The px floors keep them usable on a laptop.
const PILL =
  "flex h-[max(2.125rem,26px)] items-center gap-1.5 rounded-full border-[1.5px] border-brand bg-white px-3.75 text-pill";

// The two menus on the title row (same options as the TA System).
const STATUS: MenuOption[] = [
  { value: "Active", label: "Active", dot: "var(--color-brand)" },
  { value: "On hold", label: "On hold", dot: "var(--color-warn)" },
  { value: "Placed", label: "Placed", dot: "var(--color-ink-3)" },
  { value: "Closed / Lost", label: "Closed / Lost", dot: "var(--color-border-strong)" },
];
const STAGE: MenuOption[] = [
  { value: "100%", label: "100%", hint: "Full hunt", dot: "var(--color-brand)" },
  { value: "Follow-up", label: "Follow-up", hint: "Chasing follow-up", dot: "var(--color-warn)" },
  { value: "Add-on", label: "Add-on", hint: "Additional sourcing", dot: "var(--color-info)" },
];

function Divider() {
  return <span aria-hidden="true" className="hidden h-6.5 w-px bg-ink sm:block" />;
}

/** One column of the card: its name in a notch cut from the top edge, then its links. */
function Column({
  name,
  items,
  base,
  first,
  inPlace,
}: {
  name: string;
  items: readonly (readonly [string, string])[];
  base: string;
  first?: boolean;
  /** ATS rows open a work view in place instead of following their link. */
  inPlace?: boolean;
}) {
  return (
    <section
      className={
        "relative flex min-h-0 flex-col pt-12.25 " +
        (first ? "pb-6 pl-7 pr-4.75 md:pb-16.75" : "pb-16.75 pl-6.25 pr-5.5")
      }
    >
      <Notch label={name} />
      {/* Eight equal rows in both columns, sharing whatever height the card
          has, so the screen fits the window instead of scrolling. On a phone
          the columns stack and the rows keep the design's height. */}
      <ul className="md:grid md:min-h-0 md:flex-1 md:grid-rows-8">
        {items.map(([label, path]) => (
          // The line under each row: a real 1px border (snaps to whole pixels, so every
          // line is the same weight; a drawn line at a fractional height blurred and looked
          // different row to row) with one colour, fading out to the right.
          <li
            key={path}
            className="border-b border-solid [border-image:linear-gradient(to_right,var(--color-border),transparent)_1] md:min-h-0"
          >
            <RowLink href={`${base}/${path}`} view={inPlace ? (path as WorkView) : undefined}>
              {label}
            </RowLink>
          </li>
        ))}
      </ul>
    </section>
  );
}

// The sample opening, so the static dev build (Cloudflare Pages) has a page to
// write. Real ids come when the screen reads the backend.
export function generateStaticParams() {
  return [{ id: "demo" }];
}

export default async function OpeningPage({ params }: PageProps<"/openings/[id]">) {
  const { id } = await params;
  const base = `/openings/${id}`;

  return (
    <OpeningView
      overview={
        <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <h1 className="text-title font-semibold"><LiveName field="title" sample={OPENING.title} /></h1>
        <Divider />
        <span className="text-title font-semibold"><LiveName field="client" sample={OPENING.client} /></span>
        <RefereeBadge />
        <Divider />
        <StatusPill options={STATUS} sample={OPENING.status} pillClass={PILL} />
        <Divider />
        <StagePill options={STAGE} sample={OPENING.stage} pillClass={PILL} />
        <TeamPill pillClass={PILL} />
        <PlacedChip pillClass={PILL} />
      </div>

      {/* The lists keep their size and the page scrolls to the cards under them (owner,
          18 Nov 2026: "add these after, the user scrolls to see them, do not change the
          tab"). Not positioned, so the Status / Stage menus above open over it. 
          20 Nov 2026: the lists card now takes the whole height on screen (it used to stop
          5.75rem short, so the cards under it peeked in cut off) and is a little taller
          (rows a little roomier); the cards below are reached by scrolling. */}
      {/* pt-6 + the mask: cards scrolling up fade out under the title row instead of being cut sharp. */}
      <div className="mt-6.5 flex flex-col md:min-h-0 md:flex-1 md:overflow-y-auto md:overscroll-contain md:pt-6 md:[mask-image:linear-gradient(to_bottom,transparent,black_1.5rem)] md:[scrollbar-width:none] md:[&::-webkit-scrollbar]:hidden">
      <div className="relative grid rounded-lg bg-white max-md:flex-none md:h-full md:max-h-[52rem] md:min-h-[36rem] md:flex-none md:grid-cols-2">
        <Column name="ATS" items={ATS} base={base} first inPlace />
        {CAN_SOURCE && <Column name="Headhunting" items={HEADHUNTING} base={base} inPlace />}
        {CAN_SOURCE && (
          <span
            aria-hidden="true"
            className="absolute bottom-11.25 left-1/2 top-6.5 hidden w-px bg-border md:block"
          />
        )}
      </div>
      <OpeningCards />
      </div>
        </>
      }
    />
  );
}
