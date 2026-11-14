import TodayScreen from "./TodayScreen";

export const metadata = { title: "Today - TA System" };

// The board itself is the app's (src/app/Board.tsx); Today fills it.
export default function TodayPage() {
  return <TodayScreen />;
}
