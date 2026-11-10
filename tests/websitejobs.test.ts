/**
 * Jobs on career141.com (10 Nov): one switch per job, pressed by an admin or
 * by a TA lead / ops person the admin allowed; the website sees only listed,
 * open jobs with an approved JD, and never the client, salary or team.
 */
import fs from "node:fs";
import {
  DEFAULT_WEBSITE_POSTERS,
  canPostToWebsite,
  parseWebsitePosters,
  publicJd,
  websiteJob,
  websiteRefusal,
} from "@/lib/websiteJobs";

let pass = 0, fail = 0;
const eq = (l: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${l}${ok ? "" : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};

// Who may press it.
eq("default: ops yes, TA lead no", DEFAULT_WEBSITE_POSTERS, { taLead: false, ops: true });
eq("unset setting reads as the default", parseWebsitePosters(""), DEFAULT_WEBSITE_POSTERS);
eq("broken setting reads as the default", parseWebsitePosters("{nope"), DEFAULT_WEBSITE_POSTERS);
eq("saved ticks are kept", parseWebsitePosters('{"taLead":true,"ops":false}'), { taLead: true, ops: false });
const none = { taLead: false, ops: false };
eq("admin always", canPostToWebsite("admin", none), true);
eq("TA lead only when ticked", [canPostToWebsite("ta_lead", none), canPostToWebsite("ta_lead", { taLead: true, ops: false })], [false, true]);
eq("ops only when ticked", [canPostToWebsite("ops", none), canPostToWebsite("ops", DEFAULT_WEBSITE_POSTERS)], [false, true]);
eq("a TA, director or viewer never", ["ta", "ta_support", "director", "viewer", "client"].map((r) => canPostToWebsite(r, { taLead: true, ops: true })), [false, false, false, false, false]);

// When it can go on.
eq("open + approved JD: allowed", websiteRefusal({ status: "open", jdStatus: "approved" }), null);
eq("JD not approved: refused", typeof websiteRefusal({ status: "open", jdStatus: "draft" }), "string");
eq("on hold: refused", typeof websiteRefusal({ status: "on_hold", jdStatus: "approved" }), "string");

// What the website sees.
const job = {
  _id: "j1", title: " Senior Accountant ", status: "active", jdStatus: "approved", websiteListedAt: 1000,
  jobDescription: "The JD", location: "Colombo", requiredSkills: ["IFRS"], experienceMinYears: 5, experienceMaxYears: null,
  clientName: "Secret Client Ltd", salaryMin: 300000, primaryRecruiterId: "u1",
};
const out = websiteJob(job);
eq("a listed open job is shown", out?.title, "Senior Accountant");
eq("its location and JD", [out?.locations, out?.description], [["Colombo"], "The JD"]);
eq("applicants write to cv@ with the title", [out?.applyEmail, out?.applySubject], ["cv@career141.com", "Application: Senior Accountant"]);
eq("never the client, salary or team", /Secret Client|300000|u1/.test(JSON.stringify(out)), false);
eq("draft status counts as open", websiteJob({ ...job, status: "draft" })?.id, "j1");
eq("switch off: not shown", websiteJob({ ...job, websiteListedAt: undefined }), null);
eq("on hold, placed or closed: not shown", ["on_hold", "filled", "cancelled"].map((s) => websiteJob({ ...job, status: s })), [null, null, null]);
eq("JD not approved: not shown", websiteJob({ ...job, jdStatus: "pending_ta_approval" }), null);
eq("in the Bin: not shown", websiteJob({ ...job, binnedAt: 5 } as never), null);

// The JD as the public reads it (10 Nov): the first job listed carried its
// client and its salary in the JD itself. The layout is src/lib/headhunt.ts jdShape.
const desk = [
  "## Assistant Manager - Compliance",
  "**Client** Acme Knits · **Location** Pannala, Sri Lanka · **Package** LKR 180,000 – 200,000 gross per month · ",
  "### About the role",
  "This role sits within Acme Knits, an apparel maker in Pannala.",
  "### Responsibilities",
  "- Run the audits",
  "### Package",
  "- Gross salary: LKR 180,000 – 200,000 per month.",
  "- Transport provided",
  "### Other",
  "Salary: negotiable",
  "Notice period: one month",
].join("\r\n");
const pub = publicJd(desk, "Acme Knits");
eq("no client name anywhere", /acme/i.test(pub), false);
eq("no pay anywhere", /LKR|salary|180,000|Transport provided|Package/i.test(pub), false);
eq("the rest of the JD stays", ["## Assistant Manager - Compliance", "### About the role", "- Run the audits", "### Other", "Notice period: one month"].every((l) => pub.includes(l)), true);
eq("the client named in a sentence reads as our client", pub.includes("This role sits within our client, an apparel maker"), true);
eq("the website gets the public JD", websiteJob({ ...job, jobDescription: desk, clientName: "Acme Knits" })?.description, pub);
eq("a short client name is left alone", publicJd("Work at IT dept", "IT"), "Work at IT dept");

// The wiring.
const read = (p: string) => fs.readFileSync(p, "utf8");
eq("the feed has its own key", read("convex/integrations/websiteHttp.ts").includes("process.env.WEBSITE_API_TOKEN"), true);
eq("the route is registered", read("convex/http.ts").includes('path: "/integrations/v1/website/jobs"'), true);
eq("the feed reads through the index", read("convex/ta/website.ts").includes('withIndex("by_websiteListedAt"'), true);
eq("the backend checks who presses it", read("convex/ta/website.ts").includes("canPostToWebsite("), true);
eq("the index exists", read("convex/schema.ts").includes('.index("by_websiteListedAt", ["websiteListedAt"])'), true);
eq("the switch is on the list and the job bar", read("src/app/openings/page.tsx").includes("<WebsiteSwitch") && read("src/components/ContextBar.tsx").includes("<WebsiteSwitch"), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
