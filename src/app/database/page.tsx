import DatabaseView from "./DatabaseView";

export const metadata = { title: "Database - TA System" };

// D1 · Database (owner's design, 14 Nov 2026): search the people we hold by chatting
// with AURA. One white card under the top bar, the same margins as Today.
export default function Page() {
  return (
    <main className="mx-11 mb-[max(2.125rem,14px)] mt-[max(2.25rem,14px)] flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg bg-white shadow-card max-md:mx-3">
      <DatabaseView />
    </main>
  );
}
