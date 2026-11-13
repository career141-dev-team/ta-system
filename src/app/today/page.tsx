import Today from "./Today";

export const metadata = { title: "Today - TA System" };

// T1 · Today, "Good morning" (owner's design, 12 Nov 2026): the first screen after
// sign-in. One white card under the top bar, the same side margins as the bar.
export default function TodayPage() {
  return (
    <main className="mx-11 max-md:mx-3 mb-[max(2.125rem,14px)] mt-[max(2.125rem,14px)] flex min-h-0 flex-1 flex-col overflow-hidden rounded-[max(2.5rem,24px)] bg-white shadow-[0_6px_18px_-4px_rgba(15,23,31,0.05),0_1px_2px_rgba(15,23,31,0.04)]">
      <Today />
    </main>
  );
}
