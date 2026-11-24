import Submissions from "./Submissions";
import PlannerOnly from "../PlannerOnly";

export const metadata = { title: "New submissions - Strategy Planner - TA System" };

export default function Page() {
  return (
    <PlannerOnly>
      <Submissions />
    </PlannerOnly>
  );
}
