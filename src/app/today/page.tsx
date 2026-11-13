import TodayScreen from "./TodayScreen";

export const metadata = { title: "Today - TA System" };

// T1 · Today, "Good morning" (owner's design, 12 Nov 2026): the first screen after
// sign-in, and T2 after Start workday (TodayScreen picks which). One white card
// under the top bar, the same side margins as the bar.
export default function TodayPage() {
  return (
    <main className="mx-11 max-md:mx-3 mb-[max(2.125rem,14px)] mt-[max(2.125rem,14px)] flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg bg-white shadow-card">
      <TodayScreen />
    </main>
  );
}
