/** Apify's profile item -> our capture (src/lib/apifyProfile.ts). The person is made up. */
import { captureFromApify } from "../src/lib/apifyProfile";

let pass = 0, fail = 0;
const eq = (l: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${l}${ok ? "" : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};

const c = captureFromApify(
  {
    firstName: "Jane", lastName: "Doe", headline: "Head of Procurement", about: "Ten years buying things.",
    location: { linkedinText: "Colombo, Sri Lanka" },
    experience: [
      { position: "Head of Procurement", companyName: "Acme", startDate: { text: "Jan 2020" }, endDate: { text: "Present" } },
      { position: "Buyer", companyName: "Beta", duration: "3 yrs" },
    ],
    education: [{ schoolName: "University of Colombo", degree: "BSc", fieldOfStudy: "Logistics" }],
    skills: [{ name: "Sourcing" }, { name: "Negotiation" }],
    currentPosition: [{ companyName: "Acme" }],
  },
  "https://www.linkedin.com/in/jane-doe",
  "u1",
)!;
eq("name", c.fullName, "Jane Doe");
eq("current title and company", [c.currentTitle, c.currentCompany], ["Head of Procurement", "Acme"]);
eq("location", c.location, "Colombo, Sri Lanka");
eq("dates, or the duration when there are none", c.experience.map((x) => x.dates), ["Jan 2020 - Present", "3 yrs"]);
eq("education", c.education, [{ school: "University of Colombo", detail: "BSc, Logistics" }]);
eq("skills", c.skills, ["Sourcing", "Negotiation"]);
eq("not a LinkedIn address is refused", captureFromApify({ firstName: "x" }, "https://example.com", "u1"), null);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
