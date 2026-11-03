import type { TargetRow } from "@/data/convex/backend";
import { setTargets } from "@/app/actions";
import { progressPct } from "../../convex/lib/targetsAccess";

/**
 * Daily targets with today's progress (3 Nov). `canEdit` is for a lead or admin,
 * who type the numbers; a TA only reads theirs. `showTa` names the TA on each
 * row (the lead's views); `showJob` names the opening (every view but one opening's).
 */
export function TargetsTable({ rows, canEdit, showTa, showJob, empty }: {
  rows: TargetRow[]; canEdit: boolean; showTa: boolean; showJob: boolean; empty: string;
}) {
  if (rows.length === 0) {
    return <p className="rounded-xl border border-rule bg-surface px-5 py-6 text-[13px] text-ink-soft">{empty}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-rule bg-surface">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-rule text-left text-[11.5px] uppercase tracking-wide text-ink-faint">
            {showTa && <th className="px-5 py-2.5 font-medium">TA</th>}
            {showJob && <th className="px-5 py-2.5 font-medium">Opening</th>}
            <th className="px-5 py-2.5 font-medium">CVs today</th>
            <th className="px-5 py-2.5 font-medium">LinkedIn links today</th>
            {canEdit && <th className="px-5 py-2.5" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.jobId}:${r.userId}`} className="border-b border-rule last:border-0">
              {showTa && <td className="px-5 py-3 font-medium">{r.userName}</td>}
              {showJob && (
                <td className="px-5 py-3">
                  {r.jobTitle}
                  <span className="block text-[11.5px] text-ink-faint">{r.clientName}</span>
                </td>
              )}
              {canEdit ? (
                <>
                  <td className="px-5 py-3"><Cell done={r.cvsToday} target={r.cvsPerDay} /></td>
                  <td className="px-5 py-3"><Cell done={r.linksToday} target={r.linksPerDay} /></td>
                  <td className="px-5 py-3">
                    <form action={setTargets} className="flex items-center gap-2">
                      <input type="hidden" name="jobId" value={r.jobId} />
                      <input type="hidden" name="userId" value={r.userId} />
                      <input name="cvsPerDay" type="number" min={0} max={1000} step={1} required defaultValue={r.cvsPerDay ?? ""} aria-label="CVs per day" placeholder="CVs" className="tabular w-16 rounded-lg border border-rule bg-paper px-2 py-1.5 text-[13px]" />
                      <input name="linksPerDay" type="number" min={0} max={1000} step={1} required defaultValue={r.linksPerDay ?? ""} aria-label="LinkedIn links per day" placeholder="Links" className="tabular w-16 rounded-lg border border-rule bg-paper px-2 py-1.5 text-[13px]" />
                      <button className="rounded-lg bg-brand px-3 py-1.5 text-[12.5px] font-medium text-white">Save</button>
                    </form>
                  </td>
                </>
              ) : (
                <>
                  <td className="px-5 py-3"><Cell done={r.cvsToday} target={r.cvsPerDay} /></td>
                  <td className="px-5 py-3"><Cell done={r.linksToday} target={r.linksPerDay} /></td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cell({ done, target }: { done: number; target: number | null }) {
  if (target === null) return <span className="text-ink-faint">{done} · no target set</span>;
  return (
    <div className="min-w-[110px]">
      <span className="tabular font-semibold">{done}</span>
      <span className="tabular text-ink-faint"> / {target}</span>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-paper">
        <div className="h-full rounded-full bg-brand" style={{ width: `${progressPct(done, target)}%` }} />
      </div>
    </div>
  );
}
