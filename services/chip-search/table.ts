/**
 * The cards as a table the agent can query (28 Nov 2026, step 1 of the
 * "chat like ChatGPT" plan). The owner's complaint: "Eastern", "Batticaloa",
 * "female", "with email" did not filter, and every fix so far was one more
 * rule in our code, so the next prompt nobody had thought of failed again.
 * The cure is that the AI writes its own query. This file gives it something
 * to query: an in-memory SQLite database built from the cards when the
 * service loads them (Node's own node:sqlite, no new dependency).
 *
 * Read only: `pragma query_only` is set once the rows are in, and `runQuery`
 * (sql.ts) takes one SELECT. The agent's queries run in a worker with a time
 * limit (query.ts), on a file copy opened read-only. No names, emails or phones: the cards never held them;
 * has_email / has_phone are yes/no flags from the nightly export.
 *
 * Used by the query agent (agent2.ts).
 */
import { DatabaseSync } from "node:sqlite";
import { PLACE_BY_ID, COUNTRY_BY_CODE, lineage } from "../../convex/lib/search/lists/places";
import { LEVELS } from "../../convex/lib/search/lists/levels";
import { runQuery } from "./sql";
export { runQuery, type QueryAnswer } from "./sql";

const SCHEMA = `
create table people (
  id text primary key,
  title text,            -- job title now
  role text,             -- role group id, e.g. accountant
  family text,           -- e.g. Finance & Accounting
  level integer,         -- 0 trainee .. 8 c-suite (see levels)
  level_name text,
  years real,            -- years of experience
  age integer,
  gender text,           -- 'female' | 'male' | null = not on file
  town text, district text, province text, country text, country_code text,
  nationality text,
  notice_days integer,
  salary_usd_month real,
  current_company text,
  has_email integer,     -- 1 | 0 | null = not known yet
  has_phone integer,
  cv_date text,          -- YYYY-MM-DD
  search_text text       -- titles, employers, skills, qualifications as words
);
create table jobs (
  person_id text, n integer,   -- n = 0 is the newest job
  title text, company text, country text, level integer,
  start text, "end" text,      -- 'YYYY-MM' | 'YYYY' | 'present' | null
  is_current integer, internship integer
);
create table job_company_types (person_id text, n integer, type text);  -- bank, hotel, hospital ...
create table qualifications (person_id text, qual text, status text);
create table skills (person_id text, skill text);
create table languages (person_id text, language text);
create table levels (level integer primary key, name text);
`;
const INDEXES = `
create index people_place on people (province, district, town);
create index people_role on people (role);
create index jobs_person on jobs (person_id);
create index jct_type on job_company_types (type);
create index jct_person on job_company_types (person_id, n);
create index quals_qual on qualifications (qual);
create index quals_person on qualifications (person_id);
create index skills_person on skills (person_id);
create index languages_person on languages (person_id);
`;

const flag = (v: unknown) => (v === true ? 1 : v === false ? 0 : null);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Town, district, province, country as words, from the card's place id. Other countries' regions go in province. */
export function placeColumns(placeId: string | null | undefined, countryCode?: string | null) {
  const out = { town: null as string | null, district: null as string | null, province: null as string | null, country: null as string | null, country_code: countryCode ?? null };
  for (const id of placeId ? lineage(placeId) : []) {
    const p = PLACE_BY_ID.get(id)!;
    if (p.kind === "city") out.town ??= p.name;
    else if (p.kind === "region") { if (id.startsWith("lk-d-")) out.district ??= p.name.replace(/ District$/, ""); else out.province ??= p.name.replace(/ Province$/, ""); }
    out.country_code ??= p.country ?? null;
  }
  out.country = out.country_code ? COUNTRY_BY_CODE.get(out.country_code)?.name ?? out.country_code : null;
  return out;
}

/**
 * The CV text table (28 Nov 2026), for what no column holds: a language, a
 * tool, a school, "led a team of 20". Full-text indexed (FTS5), so a word
 * search over every CV takes milliseconds. Left out, with the reason logged by
 * the caller, when this Node's SQLite has no FTS5 or no text file exists yet.
 */
const CV_TEXT = `create virtual table cv_text using fts5(person_id unindexed, body, tokenize = 'unicode61 remove_diacritics 2')`;
const CV_TEXT_NOTE = `
Table cv_text (person_id, body): each person's CV as text, with contact details removed. Use it for anything no column holds - a language, a tool, a school, an employer's kind of work, a kind of experience.
  Search: select person_id from cv_text where cv_text match 'tamil'          -- a word
          ... match '"team of 20"'    -- an exact phrase     ... match 'sap OR oracle'     ... match 'audit NEAR/5 bank'
  See why it matched: select person_id, snippet(cv_text, 1, '[', ']', ' ... ', 12) from cv_text where cv_text match '...'
  Join it to the other tables on person_id = people.id. A CV that does not mention something is not proof the person lacks it: say "not mentioned" rather than "no".`;

/** Builds the read-only table from the cards. Merged duplicates and people whose CV file is lost are left out. */
export function buildTable(cards: Iterable<any>, file = ":memory:", cvText?: Iterable<{ id: string; t: string }>): DatabaseSync {
  const db = new DatabaseSync(file);
  // A throwaway copy rebuilt from the cards on every load: no journal, no waiting for the disk.
  db.exec("pragma journal_mode = off");
  db.exec("pragma synchronous = off");
  db.exec(SCHEMA);
  const person = db.prepare("insert or ignore into people values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  const job = db.prepare("insert into jobs values (?,?,?,?,?,?,?,?,?,?)");
  const jct = db.prepare("insert into job_company_types values (?,?,?)");
  const qual = db.prepare("insert into qualifications values (?,?,?)");
  const skill = db.prepare("insert into skills values (?,?)");
  const lang = db.prepare("insert into languages values (?,?)");
  const level = db.prepare("insert into levels values (?,?)");
  db.exec("begin");
  for (const l of LEVELS) level.run(l.rank, l.label);
  const year = Date.now() / (365.25 * 864e5);
  for (const c of cards) {
    if (!c?.id || c.searchable === false) continue;
    const pl = placeColumns(c.place, c.country);
    const jobs: any[] = Array.isArray(c.jobs) ? c.jobs : [];
    const lv = num(c.level) ?? num(jobs[0]?.level);
    const age = c.dob && Number.isFinite(Date.parse(c.dob)) ? Math.floor(year - Date.parse(c.dob) / (365.25 * 864e5)) : null;
    person.run(
      c.id, str(c.title) ?? str(jobs[0]?.title), str(c.roles?.[0]), str(c.family), lv, lv != null ? LEVELS[lv]?.label ?? null : null,
      num(c.years), age, c.gender === "female" || c.gender === "male" ? c.gender : null,
      pl.town, pl.district, pl.province, pl.country, pl.country_code, str(c.nationality),
      num(c.noticeDays), num(c.salary?.usdMonthly), str(jobs[0]?.company),
      flag(c.hasEmail), flag(c.hasPhone), str(c.cvDate), str(c.text),
    );
    jobs.forEach((j, n) => {
      job.run(c.id, n, str(j.title), str(j.company), str(j.country), num(j.level), str(j.start), str(j.end), j.end === "present" ? 1 : 0, j.internship ? 1 : 0);
      for (const t of new Set<string>(j.companyTypes ?? [])) jct.run(c.id, n, String(t));
    });
    for (const q of c.quals ?? []) qual.run(c.id, String(q.id ?? q), str(q.status));
    for (const s of new Set<string>((c.skills ?? []).map((x: unknown) => String(x).toLowerCase().trim()).filter(Boolean))) skill.run(c.id, s);
    for (const g of new Set<string>((c.languages ?? []).map((x: unknown) => String(x).toLowerCase().trim()).filter(Boolean))) lang.run(c.id, g);
  }
  db.exec("commit");
  db.exec(INDEXES);
  if (cvText) {
    db.exec(CV_TEXT);
    const known = db.prepare("select 1 from people where id = ?");
    const put = db.prepare("insert into cv_text (person_id, body) values (?, ?)");
    db.exec("begin");
    for (const r of cvText) if (r?.id && r.t && known.get(r.id)) put.run(r.id, r.t);
    db.exec("commit");
  }
  db.exec("pragma query_only = on");
  return db;
}

/** What the agent is told about the table: the columns, and the values the short columns really hold. */
export function describeTable(db: DatabaseSync): string {
  const list = (sql: string) => {
    const a = runQuery(db, sql, 80);
    return a.ok ? a.rows.map((r) => `${r[0]} (${r[1]})`).join(", ") : "";
  };
  const total = runQuery(db, "select count(*) from people");
  const cv = runQuery(db, "select count(*) from cv_text");
  return [
    `Tables (SQLite, read only), ${total.ok ? total.rows[0][0] : "?"} people:`,
    SCHEMA.trim(),
    ...(cv.ok && Number(cv.rows[0][0]) > 0 ? [`${CV_TEXT_NOTE.trim()}\n  ${cv.rows[0][0]} people have CV text.`] : []),
    "A null means not on file, never 'no'.",
    `Sri Lanka provinces: ${list("select province, count(*) from people where country_code='LK' and province is not null group by 1 order by 2 desc")}`,
    `Sri Lanka districts: ${list("select district, count(*) from people where district is not null group by 1 order by 2 desc")}`,
    `Countries: ${list("select country, count(*) from people where country is not null group by 1 order by 2 desc limit 25")}`,
    `Gender: ${list("select coalesce(gender,'not on file'), count(*) from people group by 1")}`,
    `Employer types: ${list("select type, count(distinct person_id) from job_company_types group by 1 order by 2 desc")}`,
    `Qualifications: ${list("select qual, count(*) from qualifications group by 1 order by 2 desc limit 40")}`,
    `Role groups: ${list("select role, count(*) from people where role is not null group by 1 order by 2 desc limit 80")}`,
  ].join("\n");
}
