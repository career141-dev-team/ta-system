import Planner from "./Planner";
import PlannerOnly from "./PlannerOnly";

export const metadata = { title: "Strategy Planner - TA System" };

export default function Page() {
  return (
    <PlannerOnly>
      <Planner />
    </PlannerOnly>
  );
}
