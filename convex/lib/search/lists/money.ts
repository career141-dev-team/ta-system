/**
 * Salary figures as TAs and CVs write them: "1.5 lakhs", "Rs. 85,000/-",
 * "AED 8.5k", "£42k", "12 LPA". Q11: "1.5 lakhs" was read as 1,500K.
 */

export const CURRENCIES: { code: string; words: string[] }[] = [
  { code: "LKR", words: ["lkr", "rs", "rs.", "rupees", "slr", "sl rs"] },
  { code: "INR", words: ["inr", "₹", "indian rupees"] },
  { code: "AED", words: ["aed", "dhs", "dirham", "dirhams", "dh"] },
  { code: "SAR", words: ["sar", "riyal", "riyals", "sr"] },
  { code: "QAR", words: ["qar", "qr", "qatari riyal"] },
  { code: "KWD", words: ["kwd", "kd", "dinar"] },
  { code: "OMR", words: ["omr", "ro", "omani rial"] },
  { code: "BHD", words: ["bhd", "bd"] },
  { code: "GBP", words: ["gbp", "£", "pounds", "pound"] },
  { code: "USD", words: ["usd", "$", "us$", "dollars"] },
  { code: "EUR", words: ["eur", "€", "euro", "euros"] },
  { code: "SGD", words: ["sgd", "s$"] },
  { code: "MYR", words: ["myr", "rm", "ringgit"] },
  { code: "PKR", words: ["pkr"] },
  { code: "BDT", words: ["bdt", "taka"] },
  { code: "MVR", words: ["mvr", "rufiyaa"] },
  { code: "AUD", words: ["aud", "a$"] },
];

/** Rough rates to USD for comparing across currencies (lab only, Nov 2026 ballpark). */
export const USD_PER: Record<string, number> = {
  LKR: 0.0033, INR: 0.012, AED: 0.272, SAR: 0.267, QAR: 0.275, KWD: 3.25, OMR: 2.6, BHD: 2.65,
  GBP: 1.27, USD: 1, EUR: 1.08, SGD: 0.74, MYR: 0.22, PKR: 0.0036, BDT: 0.0084, MVR: 0.065, AUD: 0.66,
  NPR: 0.0075, PHP: 0.018, CAD: 0.73, NZD: 0.6,
};

/**
 * A money figure out of text. Returns the amount as a plain number in the
 * currency named (or null when none is named) and whether it was yearly.
 * "1.5 lakhs" = 150,000; "12 LPA" = 1,200,000 a year; "85k" = 85,000;
 * "2 crore" = 20,000,000.
 */
export function readMoney(text: string): { amount: number; currency: string | null; period: "month" | "year" | null } | null {
  const t = text.toLowerCase().replace(/,/g, "").replace(/\/-/g, "");
  const m = t.match(/(?:(lkr|rs\.?|inr|₹|aed|dhs|sar|qar|qr|kwd|kd|omr|bhd|gbp|£|usd|us\$|\$|eur|€|sgd|myr|rm|pkr|bdt|mvr|aud)\s*)?(\d+(?:\.\d+)?)\s*(lakhs?|lacs?|lpa|crores?|cr|mn|million|m\b|k\b|thousand)?\s*(lkr|rs|inr|aed|dhs|sar|qar|kwd|omr|bhd|gbp|usd|eur|sgd|myr|pkr|bdt|mvr|aud|rupees|dirhams?|riyals?|pounds?)?/);
  if (!m) return null;
  let amount = Number(m[2]);
  if (!Number.isFinite(amount)) return null;
  const unit = m[3] ?? "";
  let period: "month" | "year" | null = null;
  if (/^lakh|^lac/.test(unit)) amount *= 100_000;
  else if (unit === "lpa") { amount *= 100_000; period = "year"; }
  else if (/^crore|^cr$/.test(unit)) amount *= 10_000_000;
  else if (/^(mn|million|m)$/.test(unit)) amount *= 1_000_000;
  else if (/^(k|thousand)$/.test(unit)) amount *= 1_000;
  const word = (m[1] ?? m[4] ?? "").replace(/\.$/, "");
  const cur = CURRENCIES.find((c) => c.words.includes(word) || c.code.toLowerCase() === word)?.code
    ?? (/rupees/.test(word) ? "LKR" : /dirham/.test(word) ? "AED" : /riyal/.test(word) ? "SAR" : /pound/.test(word) ? "GBP" : null);
  if (/per annum|p\.a\.|a year|annual|yearly|per year|pa\b/.test(t)) period = "year";
  else if (/per month|a month|monthly|p\.m\.|\/month|pm\b/.test(t)) period = period ?? "month";
  return { amount, currency: cur, period };
}

export function toUsdMonthly(amount: number, currency: string, period: "month" | "year" | null): number | null {
  const r = USD_PER[currency];
  if (!r) return null;
  return (period === "year" ? amount / 12 : amount) * r;
}
