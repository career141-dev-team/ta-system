/**
 * The Anthropic API web search (src/lib/apiSearch). The rule under test: an
 * address is kept only when the API's web_search tool returned it, and the
 * day's cap stops searches past it.
 */
import { parseApiSearch, takeSearch } from "@/lib/apiSearch";

let pass = 0, fail = 0;
const eq = (l: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${l}${ok ? "" : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};

const answer = (results: unknown, text: string) => ({
  content: [
    { type: "server_tool_use", name: "web_search" },
    { type: "web_search_tool_result", content: results },
    { type: "text", text },
  ],
});

console.log("\nAPI search: only addresses its search returned");
{
  const r = parseApiSearch(
    answer(
      [
        { type: "web_search_result", url: "https://www.linkedin.com/in/a-person/", title: "A Person - Senior Accountant" },
        { type: "web_search_result", url: "https://www.hayleys.com/", title: "Hayleys" },
      ],
      '[{"url":"https://www.linkedin.com/in/a-person/","snippet":"CIMA, Colombo."},{"url":"https://made-up.example/x","snippet":"invented"}]',
    ),
    "senior accountant",
    10,
  );
  eq("both returned addresses kept, in order", r.hits.map((h) => h.url), ["https://www.linkedin.com/in/a-person/", "https://www.hayleys.com/"]);
  eq("the title is the search's", r.hits[0].title, "A Person - Senior Accountant");
  eq("the reply lends a snippet", r.hits[0].snippet, "CIMA, Colombo.");
  eq("an address only the reply named is dropped and counted", r.ungrounded, 1);
  eq("no error", r.error, undefined);
}

console.log("\nAPI search: operators still apply");
{
  const r = parseApiSearch(
    answer(
      [
        { type: "web_search_result", url: "https://www.linkedin.com/in/a-person/", title: "A" },
        { type: "web_search_result", url: "https://www.hayleys.com/", title: "Hayleys" },
      ],
      "[]",
    ),
    "site:linkedin.com/in senior accountant",
    10,
  );
  eq("site: keeps only LinkedIn", r.hits.map((h) => h.url), ["https://www.linkedin.com/in/a-person/"]);
}

console.log("\nAPI search: refusals and empties");
{
  eq("an API error is an error", parseApiSearch({ error: { message: "overloaded" } }, "q", 10).error, "anthropic: overloaded");
  eq("a search refusal is an error", parseApiSearch(answer({ type: "web_search_tool_result_error", error_code: "max_uses_exceeded" }, ""), "q", 10).error, "anthropic: max_uses_exceeded");
  const empty = parseApiSearch(answer([], "[]"), "q", 10);
  eq("an empty search is not an error", [empty.hits.length, empty.error], [0, undefined]);
}

console.log("\nAPI search: the day's cap");
{
  process.env.C141_API_SEARCH_DAILY = "2";
  const t = Date.UTC(2026, 10, 24, 12);
  eq("two allowed, the third refused", [takeSearch(t), takeSearch(t), takeSearch(t)], [true, true, false]);
  eq("a new Colombo day starts again", takeSearch(t + 24 * 3_600_000), true);
  process.env.C141_API_SEARCH_DAILY = "0";
  eq("a cap of 0 stops every search", takeSearch(t + 48 * 3_600_000), false);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
