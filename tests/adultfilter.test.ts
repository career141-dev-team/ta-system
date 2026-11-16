/**
 * Adult pages never reach the desk (lib/adultFilter, 12 Nov): the sites from
 * the owner's screenshot are dropped, ordinary recruitment pages are kept.
 */
import assert from "node:assert/strict";
import { adultHit } from "@/lib/adultFilter";
import { searxngHits } from "@/lib/serper";

const hit = (url: string, title = "", snippet = "") => ({ url, title, snippet });

// What the Research tab listed.
for (const h of [
  hit("https://www.qorno.com/", "QORNO.COM - Sex Videos"),
  hit("https://xhamster.com/x", "Indian Porn Videos: Hot Sex with Amateurs | xHamster"),
  hit("https://example.in/v", "मुफ्त सेक्स वीडियो और XXX फिल्में"),
  hit("https://example.org/a", "A page", "millions of porn movies aggregated"),
]) assert.equal(adultHit(h), true, h.title);

// What a recruiter's search really returns.
for (const h of [
  hit("https://www.speedtest.net/", "Speedtest by Ookla"),
  hit("https://www.essex.ac.uk/jobs", "Jobs at the University of Essex"),
  hit("https://lk.linkedin.com/in/someone", "Head of Manufacturing - Middlesex"),
  hit("https://example.com/policy", "Sexual harassment policy for employers"),
  hit("https://example.com/x", "XXXL garment sizing in apparel manufacturing"),
]) assert.equal(adultHit(h), false, h.title);

// The quote a stored source carries is read too.
assert.equal(adultHit({ url: "https://example.com", title: "Home", quote: "free sex videos" }), true);

// searxngHits itself is untouched: the filter sits in search(), where every caller passes.
assert.equal(searxngHits({ results: [{ url: "https://xhamster.com/x", title: "t", content: "" }] }, "test", 10).length, 1);

console.log("  ok  adult pages are dropped, recruitment pages are kept");
