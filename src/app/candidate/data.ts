// Sample data for the candidate page (the TA System's candidate/[appId] page,
// read 16 Nov 2026). Made-up people and fake contacts. With the backend each part
// is its own small read for one application: the candidate, the CV file, the
// history page, calls, messages, referees, colleagues at the same company.

export type Call = { at: string; which: string; outcome: string; said: string; by: string };
export type Msg = { at: string; from: "us" | "them" | "assistant"; text: string };
export type Referee = { name: string; title?: string; company: string; relation: string; phone?: string; email?: string };
export type Colleague = { name: string; title?: string; badge: string; phone?: string; email?: string };
export type Interview = { name: string; when: string; how: string; where: string; minutes: number; who: string; status: string; confirmed: boolean };
export type Note = { by: string; role: string; at: string; text: string };

export const CANDIDATE = {
  name: "Rashini Kaweesha",
  title: "UI/UX Designer",
  company: "MAS Bodyline (Pvt) Ltd",
  school: "University of Colombo",
  location: "Colombo",
  email: "rashini@example.com",
  phone: "+94 77 000 0000",
  linkedin: "https://www.linkedin.com/in/example",
  channel: "L",
  set: 3,
  cv: "/cvs/s1.pdf",
  details: { current: "LKR 420,000", expected: "LKR 550,000", notice: "", designation: "UI/UX Designer", company: "MAS Bodyline (Pvt) Ltd" },
};

export const OPENINGS = [
  { title: "Senior Manager - Manufacturing Business Transformation", client: "PGP Glass", stage: "TA Follow-Up", current: true },
  { title: "Product Designer", client: "Dialog", stage: "Rejected", current: false },
];

export const HISTORY = [
  { at: "Today 9:42", text: "Moved to TA Follow-Up by Chathura (shortlisted, set 3)" },
  { at: "Today 9:40", text: "CV read: 5 years, Colombo, 2 referees" },
  { at: "Yesterday 16:05", text: "Applied through the LinkedIn post \"Senior Manager - SAP\"" },
];

export const CALLS: Call[] = [
  { at: "Today 10:15", which: "Other", outcome: "No answer", said: "Rang twice, left a WhatsApp.", by: "Chathura" },
];

export const MESSAGES: Msg[] = [
  { at: "9:43", from: "assistant", text: "Hi Rashini, thanks for applying to PGP Glass. What is your current salary?" },
  { at: "10:02", from: "them", text: "Hi, it is 420k. Expecting around 550k." },
  { at: "10:03", from: "assistant", text: "Thank you. What is your notice period?" },
];

export const REFEREES: Referee[] = [
  { name: "Dilan Perera", title: "Design Manager", company: "MAS Bodyline", relation: "Line manager", phone: "+94 77 000 0001", email: "dilan@example.com" },
  { name: "Sachini Fernando", company: "WSO2", relation: "Former colleague" },
];

export const COLLEAGUES: Colleague[] = [
  { name: "Kasun Silva", title: "Senior Designer", badge: "Database Candidate", phone: "+94 77 000 0002" },
  { name: "Dilan Perera", title: "Design Manager", badge: "CV Referee", phone: "+94 77 000 0001" },
  { name: "Ama Jayasinghe", badge: "Director Review", email: "ama@example.com" },
];

export const INTERVIEWS: Interview[] = [];
export const NOTES: Note[] = [{ by: "Rashmi", role: "TA Lead", at: "Yesterday", text: "Strong portfolio. Check the notice period." }];

export const CALL_WHICH = ["Pre-interview — confirming attendance", "Post-interview — how it went", "Post-offer — accepted, negotiating, joining date", "Other"];
export const CALL_OUTCOME = ["Reached them", "No answer", "Rescheduled", "Declined"];
export const MAX_FOLLOW_UPS = 3;

/** What is still needed before Director Review (the old "Still needed" line). */
export function stillNeeded(d: { expected: string; notice: string }, hasCv: boolean) {
  return [...(hasCv ? [] : ["CV"]), ...(d.expected.trim() ? [] : ["expected salary"]), ...(d.notice.trim() ? [] : ["notice period"])];
}
