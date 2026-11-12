import Link from "next/link";
import { Suspense } from "react";
import { colomboGreeting } from "@/lib/calendar";
import { pageUser } from "@/lib/session";
import { primeStore } from "@/data/prime";
import { DbTabs } from "@/components/db/DbTabs";
import { ReferralSearchBox } from "@/components/db/ReferralSearchBox";
import { ReferralResults } from "@/components/db/ReferralResults";

type Params = Record<string, string | string[] | undefined>;

const EXAMPLES = [
  "HR Managers at Dialog",
  "General Managers in retail companies",
  "Contact details of referees from FMCG companies",
  "Finance Directors at Hemas",
  "References from Cargills",
];

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
const many = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);

/**
 * Referral Search — the referees named on the CVs in the database (8 Oct).
 *
 * Recruiters use these for two things: a way into a company ("who are the HR
 * managers at Dialog?") and a number for someone they are checking. The box
 * takes a sentence; what Claude understood by it is shown as chips above the
 * list, and any title or company can be taken off without asking again.
 */
export default async function ReferralSearchPage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  await primeStore();
  const user = await pageUser("database.read");
  // Up to 4,000 characters: a pasted list of names is long. A question is still
  // cut to 500 before a model reads it (see Results).
  const q = one(sp.q).trim().slice(0, 4000);
  const drop = many(sp.x).slice(0, 30);
  // "Not names — search it as a question": for a company list that reads as names.
  const asQuestion = one(sp.as) === "search";

  return (
    <main className="mx-auto max-w-[760px] px-4 pb-24 pt-8 sm:px-6">
      <DbTabs active="referral" />
      <h1 className="text-center text-[26px] font-semibold tracking-tight">
        {colomboGreeting()}, {user.name}
      </h1>
      <p className="mb-6 mt-1.5 text-center text-[13px] text-ink-soft">
        Find the referees named on CVs — by title, by company, or both. Ask the way you would ask a colleague.
      </p>

      <ReferralSearchBox defaultValue={q} autoFocus={!q} />

      {!q && (
        <ul className="mt-4 flex flex-wrap justify-center gap-1.5">
          {EXAMPLES.map((e) => (
            <li key={e}>
              <Link
                href={`/database/referral?q=${encodeURIComponent(e)}`}
                className="inline-block rounded-full border border-rule bg-surface px-3 py-1.5 text-[12px] text-ink-soft transition-colors hover:border-brand-line hover:text-brand"
              >
                {e}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {q && (
        <Suspense
          key={`${q}|${drop.join("|")}|${asQuestion}`}
          fallback={
            <div className="mt-8 rounded-xl border border-rule bg-surface px-8 py-14 text-center" role="status" aria-live="polite">
              <p className="text-[14px] font-medium">Searching for “{q.replace(/\s+/g, " ").slice(0, 80)}”</p>
              <p className="mt-1.5 text-[12px] text-ink-faint">A new search can take several seconds; the same search again is instant.</p>
            </div>
          }
        >
          <ReferralResults q={q} drop={drop} email={user.email} asQuestion={asQuestion} basePath="/database/referral" />
        </Suspense>
      )}
    </main>
  );
}
