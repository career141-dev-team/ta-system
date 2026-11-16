import PlanJob from "./PlanJob";
import PlannerOnly from "../PlannerOnly";

export const metadata = { title: "Plan a job - Strategy Planner - TA System" };

export default function Page() {
  return (
    <PlannerOnly>
      <PlanJob />
    </PlannerOnly>
  );
}
