import StrategyList from "./StrategyList";
import PlannerOnly from "../PlannerOnly";

export const metadata = { title: "Strategy list - TA System" };

export default function Page() {
  return (
    <PlannerOnly>
      <StrategyList />
    </PlannerOnly>
  );
}
