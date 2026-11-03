import { primeStore } from "@/data/prime";
import { isConvex } from "@/data/mode";
import { targetsBoard } from "@/data/convex/backend";
import { getCurrentUser } from "@/lib/session";
import { ProblemState } from "@/components/ProblemState";
import { TargetsTable } from "@/components/TargetsTable";

/**
 * Targets (3 Nov): a TA lead or admin sets, for each TA on each opening, how many
 * CVs and how many LinkedIn links (Excel sheet) they should reach per day. The TA
 * sees theirs inside the opening and on their dashboard.
 */
export default async function TargetsPage() {
  await primeStore();
  const user = await getCurrentUser();
  // Hiding the nav link is not the check; the backend refuses anyone else too.
  if (user.role !== "admin" && user.role !== "ta_lead") {
    return (
      <ProblemState
        title="You cannot open Targets"
        message="Targets are set by TA leads and admins. Your own targets are on your dashboard and inside each opening."
      />
    );
  }
  const rows = isConvex() ? await targetsBoard({ id: user.id }) : [];
  const byTa = new Map<string, typeof rows>();
  for (const r of rows) byTa.set(r.userName, [...(byTa.get(r.userName) ?? []), r]);

  return (
    <main className="mx-auto max-w-[1180px] px-4 sm:px-8 py-6 sm:py-9">
      <div className="mb-8">
        <h1 className="text-[24px] font-semibold tracking-tight">Targets</h1>
        <p className="mt-1.5 text-[13px] text-ink-soft">
          Daily targets for each TA on each opening: CVs shortlisted and LinkedIn links added to the Excel sheet.
          The same numbers apply every day until you change them. Progress is today, Colombo time.
        </p>
      </div>
      {[...byTa.entries()].map(([name, list]) => (
        <section key={name} className="mb-10">
          <h2 className="mb-3 text-[14px] font-semibold">
            {name} <span className="font-normal text-ink-faint">{list.length} {list.length === 1 ? "opening" : "openings"}</span>
          </h2>
          <TargetsTable rows={list} canEdit showTa={false} showJob empty="" />
        </section>
      ))}
      {rows.length === 0 && (
        <TargetsTable rows={[]} canEdit showTa={false} showJob empty="No TAs are assigned to openings yet." />
      )}
    </main>
  );
}
