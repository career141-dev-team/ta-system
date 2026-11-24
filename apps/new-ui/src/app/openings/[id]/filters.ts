import type { MenuOption } from "./PillMenu";

// The TA System's list filters, shared by every candidate list in an opening
// (Scoops, LinkedIn Job applicants), so the same words filter the same way.

export const EXPERIENCE: MenuOption[] = [
  { value: "", label: "Any experience" },
  { value: "0-2", label: "0 to 2 years" },
  { value: "3-5", label: "3 to 5 years" },
  { value: "6-9", label: "6 to 9 years" },
  { value: "10-99", label: "10 years or more" },
];

export const NOTICE: MenuOption[] = [
  { value: "", label: "Any notice" },
  { value: "0-0", label: "Can start now" },
  { value: "1-30", label: "Up to 1 month" },
  { value: "31-90", label: "1 to 3 months" },
  { value: "91-999", label: "Over 3 months" },
];

/** A "lo-hi" range from the menus above; empty means any. */
export const inRange = (n: number, r: string) => {
  if (!r) return true;
  const [lo, hi] = r.split("-").map(Number);
  return n >= lo && n <= hi;
};

/** The filter pill's look (search box and the menus), on the design tokens. */
export const FIELD_PILL =
  "flex h-[max(2.6rem,34px)] items-center gap-2 whitespace-nowrap rounded-full border border-border bg-surface px-[max(1.1rem,12px)] text-small";
