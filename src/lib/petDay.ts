// What the pet says when a TA's workday starts (owner 20 Nov 2026): one line read off
// the real day plan (ui/plan:today), so it never invents work. Pure, so it is checked
// by petDay.check.ts. `undefined` = the plan is still being read: say nothing yet.

export type GreetPlan = {
  state: "draft" | "approved" | "closed";
  tasks: { title: string; startMin: number; state: string }[];
};

const hm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;

export function petGreeting(plan: GreetPlan | null | undefined, now: Date): string | null | undefined {
  if (plan === undefined) return undefined;
  if (!plan) return "Your day has started. Tell me what's on and I'll plan it with you.";
  if (plan.state === "draft") return "Your plan is ready. Approve it and I'll keep you on time.";
  if (plan.state === "closed") return null;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const open = plan.tasks.filter((t) => t.state === "planned" || t.state === "doing").sort((a, b) => a.startMin - b.startMin);
  if (!open.length) return "Everything on today's plan is done.";
  const late = open.filter((t) => t.startMin < nowMin && t.state === "planned");
  const next = open.find((t) => t.state === "doing") ?? open[0];
  if (next.state === "doing") return `Now: ${next.title}.`;
  return late.length > 1 ? `${late.length} tasks are waiting. Next: ${next.title}.` : `Next: ${next.title} at ${hm(next.startMin)}.`;
}
