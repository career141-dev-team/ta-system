import { ProjectHeader } from "../ProjectHeader";
import { primeStore } from "@/data/prime";
import { pageUser } from "@/lib/session";
import { requireSourcingSeat } from "../sourcingGate";
import { repo } from "@/data/store";
import { ReferralSearchBox } from "@/components/db/ReferralSearchBox";
import { ReferralResults } from "@/components/db/ReferralResults";
import { Suspense } from "react";

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

/**
 * Referral Search from inside an opening (12 Nov): the same search as
 * /database/referral, with the opening's header and seat check, and an export
 * of the ticked referees. Needs a sourcing seat on the opening and database.read.
 */
export default async function OpeningReferralPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Params> }) {
  const { id } = await params;
  const sp = await searchParams;
  await primeStore({ openingId: id });
  await requireSourcingSeat(id);
  const user = await pageUser("database.read");
  const q = one(sp.q).trim().slice(0, 4000);
  const drop = (Array.isArray(sp.x) ? sp.x : sp.x ? [sp.x] : []).slice(0, 30);
  const asQuestion = one(sp.as) === "search";
  const base = `/openings/${id}/referral`;
  const title = repo.opening(id)?.title ?? "";

  return (
    <>
      <h1 className="text-[21px] font-semibold tracking-tight">Referral Search</h1>
      <ProjectHeader openingId={id} />
      <p className="mb-4 mt-3 text-[13px] text-ink-soft">
        Find the referees named on CVs by title, company or both{title ? ` — for example, who holds the ${title} job at a competitor` : ""}. Tick people to export them to Excel.
      </p>
      <ReferralSearchBox defaultValue={q} autoFocus={!q} action={base} />
      {q && (
        <Suspense key={`${q}|${drop.join("|")}|${asQuestion}`} fallback={<p className="mt-8 text-[13px] text-ink-soft" role="status">Searching…</p>}>
          <ReferralResults q={q} drop={drop} email={user.email} asQuestion={asQuestion} basePath={base} openingId={id} />
        </Suspense>
      )}
    </>
  );
}
