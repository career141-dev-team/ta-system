import OpeningsView from "./OpeningsView";

export const metadata = { title: "Openings - TA System" };

// O1 · Openings by category (owner's design, 14 Nov 2026). The board and its tab
// are the app's (src/app/Board.tsx); the space above and inside the board follows
// the window's height there.
export default function Page() {
  return <OpeningsView />;
}
