// Referee Calls on real data (D8c, 20 Nov 2026; ta-system #38) - the pure half.
// The old sheet saves once with { add, update, remove } (saveRefereeCalls); this
// screen saves by itself a moment after typing stops, so it works out that change
// from what the TA System last said it holds. No imports: `node refereeRules.check.ts`.

export type Cells = [string, string, string, string];
export type LiveCall = {
  id: string; company: string; referral: string; contactNumber: string; feedback: string;
  result: "positive" | "negative" | null; addedBy: string; by: string; createdAt: number;
};
export type LiveReferees = {
  me: string; day: string; today: string; days: string[]; workLocationId: string | null;
  locations: { id: string; name: string }[]; calls: LiveCall[]; canEdit: boolean; showTa: boolean;
};

export const cellsOf = (c: LiveCall): Cells => [c.company, c.referral, c.contactNumber, c.feedback];
const blank = (x: Cells) => !x.some((v) => v.trim());
const row = (x: Cells) => ({ company: x[0].trim(), referral: x[1].trim(), contactNumber: x[2].trim(), feedback: x[3].trim() });

/** What to send: new rows with something in them, kept rows that changed, kept rows
 *  that were deleted or emptied. Rows marked mine: false (another TA's) are never sent. */
export function changesOf(saved: Map<string, Cells>, rows: { id?: string; mine?: boolean; cells: Cells }[]) {
  const add = rows.filter((r) => !r.id && r.mine !== false && !blank(r.cells)).map((r) => row(r.cells));
  const update: (ReturnType<typeof row> & { id: string })[] = [];
  const keep = new Set<string>();
  for (const r of rows) {
    if (!r.id || r.mine === false || blank(r.cells)) continue;
    keep.add(r.id);
    const was = saved.get(r.id);
    if (was && was.some((v, i) => v.trim() !== r.cells[i].trim())) update.push({ id: r.id, ...row(r.cells) });
  }
  const remove = [...saved.keys()].filter((id) => !keep.has(id));
  return { add, update, remove, any: add.length + update.length + remove.length > 0 };
}

/** After a save: give each new row the id the TA System made for it (matched on its
 *  words), so what was typed while the save ran is kept and saved next. */
export function withIds<R extends { id?: string; mine?: boolean; cells: Cells }>(rows: R[], mineNow: LiveCall[], before: Set<string>): R[] {
  const fresh = mineNow.filter((c) => !before.has(c.id));
  return rows.map((r) => {
    if (r.id || r.mine === false) return r;
    const i = fresh.findIndex((c) => cellsOf(c).every((v, k) => v === r.cells[k].trim()));
    return i < 0 ? r : { ...r, id: fresh.splice(i, 1)[0].id };
  });
}

/** "Today · Thu 20 Nov" or "Wed 19 Nov", from a work day "2026-11-20". */
export function dayLabel(day: string, today: string): string {
  const d = new Date(`${day}T12:00:00`);
  const words = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).replace(",", "");
  return day === today ? `Today · ${words}` : words;
}
