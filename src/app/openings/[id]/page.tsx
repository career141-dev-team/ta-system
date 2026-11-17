import RowLink from "./RowLink";
import PillMenu, { type MenuOption } from "./PillMenu";
import Notch from "./Notch";
import OpeningView from "./OpeningView";
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
  targetLinkedIn: 15,
  targetCvs: 20,
};
// Every row opens its work view in place (OpeningView), ATS and Headhunting alike.
const ATS: readonly (readonly [string, WorkView])[] = [
  ["Pipeline", "pipeline"],
  ["LinkedIn Job", "linkedin-job"],
  ["Database CVs", "database"],
  ["Strategies", "strategies"],
  ["Scoops", "scoops"],
  ["Job Description", "jd"],
  ["Snippets", "snippets"],
  ["Midday Email", "midday"],
];

const HEADHUNTING: readonly (readonly [string, WorkView])[] = [
  ["Research", "hh-research"],
  ["Suggestions", "hh-suggestions"],
  ["Excel Tables", "hh-tables"],
  ["Referee Calls", "hh-referees"],
];

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
        <h1 className="text-title font-semibold">{OPENING.title}</h1>
        <Divider />
        <span className="text-title font-semibold">{OPENING.client}</span>
        <RefereeBadge />
        <Divider />
        <PillMenu options={STATUS} initial={OPENING.status} pillClass={PILL} />
        <Divider />
        <PillMenu
          options={STAGE}
          initial={OPENING.stage}
          prefix="Stage:"
          title="Working Stage"
          pillClass={PILL}
        />

        <div className="flex items-center gap-2.25 sm:ml-auto">
          <span className="text-title font-medium">Target :</span>
          <span className={PILL + " px-4.5"}>
            LinkedIn:&nbsp;<b className="font-semibold">{OPENING.targetLinkedIn}</b>
          </span>
          <span className={PILL + " px-4.5"}>
            CVs:&nbsp;<b className="font-semibold">{OPENING.targetCvs}</b>
          </span>
        </div>
      </div>

      {/* The lists fill the card again (owner, 18 Nov 2026: the numbers cards under
          them removed). */}
      <div className="relative mt-12.5 grid min-h-0 flex-1 rounded-lg bg-white max-md:flex-none md:max-h-[44.125rem] md:grid-cols-2">
        <Column name="ATS" items={ATS} base={base} first inPlace />
        {CAN_SOURCE && <Column name="Headhunting" items={HEADHUNTING} base={base} inPlace />}
        {CAN_SOURCE && (
          <span
            aria-hidden="true"
            className="absolute bottom-11.25 left-1/2 top-6.5 hidden w-px bg-border md:block"
          />
        )}
      </div>
        </>
      }
    />
  );
}
