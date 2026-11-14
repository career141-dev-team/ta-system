import DatabaseView from "./DatabaseView";

export const metadata = { title: "Database - TA System" };

// D1 · Database - search by chatting with AURA (owner's design, 14 Nov 2026). The
// board and its tab are the app's (src/app/Board.tsx).
export default function Page() {
  return <DatabaseView />;
}
