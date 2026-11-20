// Run: node src/lib/petDay.check.ts
import { petGreeting } from "./petDay.ts";
const eq = (l: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { console.error("FAIL", l, a, b); process.exit(1); } };
const at = (h: number, m = 0) => new Date(2026, 10, 20, h, m);
eq("still reading", petGreeting(undefined, at(9)), undefined);
eq("no plan yet", petGreeting(null, at(9)), "Your day has started. Tell me what's on and I'll plan it with you.");
eq("draft", petGreeting({ state: "draft", tasks: [] }, at(9)), "Your plan is ready. Approve it and I'll keep you on time.");
eq("closed says nothing", petGreeting({ state: "closed", tasks: [] }, at(9)), null);
const tasks = [
  { title: "Review SAP", startMin: 540, state: "done" },
  { title: "Chase Finance", startMin: 600, state: "planned" },
  { title: "Midday email", startMin: 750, state: "planned" },
];
eq("next task", petGreeting({ state: "approved", tasks }, at(9, 30)), "Next: Chase Finance at 10:00.");
eq("doing wins", petGreeting({ state: "approved", tasks: [...tasks, { title: "LinkedIn", startMin: 560, state: "doing" }] }, at(9, 40)), "Now: LinkedIn.");
eq("two late", petGreeting({ state: "approved", tasks }, at(13)), "2 tasks are waiting. Next: Chase Finance.");
eq("all done", petGreeting({ state: "approved", tasks: [tasks[0]] }, at(13)), "Everything on today's plan is done.");
console.log("petDay: all checks pass");
