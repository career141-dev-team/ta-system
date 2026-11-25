/**
 * The world list: groupings, countries, regions (provinces, districts,
 * emirates, states) and cities, each pointing up to its parent, so "Colombo"
 * holds Nugegoda and "GCC" holds Doha. A profile stores the most specific id
 * it can resolve; a search asks for any id, and `within` answers.
 *
 * Built by hand for the lab from common knowledge of the places our CVs come
 * from. Stage 2 replaces the Sri Lanka part with the GeoNames table the plan
 * names; the shape stays.
 */

export interface Place {
  id: string;
  name: string;
  kind: "group" | "country" | "region" | "city";
  /** ISO country code for countries, regions and cities. */
  country?: string;
  parent?: string;
  aliases?: string[];
}

export interface Country {
  code: string;
  name: string;
  /** How a nationality is written: "Sri Lankan", "Indian". */
  demonyms: string[];
  aliases?: string[];
  currency: string;
}

export const COUNTRIES: Country[] = [
  { code: "LK", name: "Sri Lanka", demonyms: ["sri lankan", "srilankan", "ceylonese"], aliases: ["srilanka", "ceylon"], currency: "LKR" },
  { code: "IN", name: "India", demonyms: ["indian"], currency: "INR" },
  { code: "PK", name: "Pakistan", demonyms: ["pakistani"], currency: "PKR" },
  { code: "BD", name: "Bangladesh", demonyms: ["bangladeshi"], currency: "BDT" },
  { code: "NP", name: "Nepal", demonyms: ["nepali", "nepalese"], currency: "NPR" },
  { code: "MV", name: "Maldives", demonyms: ["maldivian"], currency: "MVR" },
  { code: "AE", name: "United Arab Emirates", demonyms: ["emirati"], aliases: ["uae", "u.a.e", "emirates"], currency: "AED" },
  { code: "QA", name: "Qatar", demonyms: ["qatari"], currency: "QAR" },
  { code: "SA", name: "Saudi Arabia", demonyms: ["saudi"], aliases: ["ksa", "saudi", "kingdom of saudi arabia"], currency: "SAR" },
  { code: "KW", name: "Kuwait", demonyms: ["kuwaiti"], currency: "KWD" },
  { code: "OM", name: "Oman", demonyms: ["omani"], currency: "OMR" },
  { code: "BH", name: "Bahrain", demonyms: ["bahraini"], currency: "BHD" },
  { code: "JO", name: "Jordan", demonyms: ["jordanian"], currency: "JOD" },
  { code: "LB", name: "Lebanon", demonyms: ["lebanese"], currency: "LBP" },
  { code: "EG", name: "Egypt", demonyms: ["egyptian"], currency: "EGP" },
  { code: "GB", name: "United Kingdom", demonyms: ["british", "english", "scottish", "welsh"], aliases: ["uk", "u.k", "england", "britain", "great britain", "scotland", "wales"], currency: "GBP" },
  { code: "IE", name: "Ireland", demonyms: ["irish"], currency: "EUR" },
  { code: "US", name: "United States", demonyms: ["american"], aliases: ["usa", "u.s.a", "united states of america", "us"], currency: "USD" },
  { code: "CA", name: "Canada", demonyms: ["canadian"], currency: "CAD" },
  { code: "AU", name: "Australia", demonyms: ["australian"], currency: "AUD" },
  { code: "NZ", name: "New Zealand", demonyms: ["new zealander", "kiwi"], aliases: ["nz"], currency: "NZD" },
  { code: "SG", name: "Singapore", demonyms: ["singaporean"], currency: "SGD" },
  { code: "MY", name: "Malaysia", demonyms: ["malaysian"], currency: "MYR" },
  { code: "PH", name: "Philippines", demonyms: ["filipino", "filipina", "philippine"], currency: "PHP" },
  { code: "TH", name: "Thailand", demonyms: ["thai"], currency: "THB" },
  { code: "ID", name: "Indonesia", demonyms: ["indonesian"], currency: "IDR" },
  { code: "VN", name: "Vietnam", demonyms: ["vietnamese"], currency: "VND" },
  { code: "CN", name: "China", demonyms: ["chinese"], currency: "CNY" },
  { code: "JP", name: "Japan", demonyms: ["japanese"], currency: "JPY" },
  { code: "DE", name: "Germany", demonyms: ["german"], currency: "EUR" },
  { code: "FR", name: "France", demonyms: ["french"], currency: "EUR" },
  { code: "NL", name: "Netherlands", demonyms: ["dutch"], currency: "EUR" },
  { code: "IT", name: "Italy", demonyms: ["italian"], currency: "EUR" },
  { code: "CY", name: "Cyprus", demonyms: ["cypriot"], currency: "EUR" },
  { code: "ZA", name: "South Africa", demonyms: ["south african"], currency: "ZAR" },
  { code: "KE", name: "Kenya", demonyms: ["kenyan"], currency: "KES" },
  { code: "NG", name: "Nigeria", demonyms: ["nigerian"], currency: "NGN" },
  { code: "SC", name: "Seychelles", demonyms: ["seychellois"], currency: "SCR" },
];

export const COUNTRY_BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

export const GROUPS: { id: string; name: string; countries: string[]; aliases: string[] }[] = [
  { id: "g-gcc", name: "GCC", countries: ["AE", "QA", "SA", "KW", "OM", "BH"], aliases: ["gcc", "gulf", "the gulf", "gulf countries", "gulf region", "middle east gulf"] },
  { id: "g-me", name: "Middle East", countries: ["AE", "QA", "SA", "KW", "OM", "BH", "JO", "LB", "EG"], aliases: ["middle east", "mena", "me region"] },
  { id: "g-south-asia", name: "South Asia", countries: ["LK", "IN", "PK", "BD", "NP", "MV"], aliases: ["south asia", "subcontinent", "saarc"] },
  { id: "g-sea", name: "Southeast Asia", countries: ["SG", "MY", "PH", "TH", "ID", "VN"], aliases: ["southeast asia", "south east asia", "asean"] },
  { id: "g-europe", name: "Europe", countries: ["GB", "IE", "DE", "FR", "NL", "IT", "CY"], aliases: ["europe", "eu"] },
  { id: "g-anz", name: "Australia & New Zealand", countries: ["AU", "NZ"], aliases: ["anz", "australasia"] },
  { id: "g-overseas", name: "Outside Sri Lanka", countries: [], aliases: ["overseas", "abroad", "foreign"] },
];

const P: Place[] = [];
const city = (id: string, name: string, country: string, parent?: string, aliases: string[] = []) =>
  P.push({ id, name, kind: "city", country, parent: parent ?? `c-${country}`, aliases });
const region = (id: string, name: string, country: string, parent?: string, aliases: string[] = []) =>
  P.push({ id, name, kind: "region", country, parent: parent ?? `c-${country}`, aliases });

// ── Sri Lanka: provinces, districts, towns. Colombo 01-15 are the city. ──
const LK_PROV: [string, string][] = [["western", "Western Province"], ["central", "Central Province"], ["southern", "Southern Province"], ["northern", "Northern Province"], ["eastern", "Eastern Province"], ["north-western", "North Western Province"], ["north-central", "North Central Province"], ["uva", "Uva Province"], ["sabaragamuwa", "Sabaragamuwa Province"]];
for (const [id, name] of LK_PROV) region(`lk-p-${id}`, name, "LK", "c-LK", [name.toLowerCase().replace(" province", "")]);
const LK_DIST: [string, string, string][] = [
  ["colombo", "Colombo District", "western"], ["gampaha", "Gampaha District", "western"], ["kalutara", "Kalutara District", "western"],
  ["kandy", "Kandy District", "central"], ["matale", "Matale District", "central"], ["nuwara-eliya", "Nuwara Eliya District", "central"],
  ["galle", "Galle District", "southern"], ["matara", "Matara District", "southern"], ["hambantota", "Hambantota District", "southern"],
  ["jaffna", "Jaffna District", "northern"], ["kilinochchi", "Kilinochchi District", "northern"], ["mannar", "Mannar District", "northern"], ["vavuniya", "Vavuniya District", "northern"], ["mullaitivu", "Mullaitivu District", "northern"],
  ["batticaloa", "Batticaloa District", "eastern"], ["ampara", "Ampara District", "eastern"], ["trincomalee", "Trincomalee District", "eastern"],
  ["kurunegala", "Kurunegala District", "north-western"], ["puttalam", "Puttalam District", "north-western"],
  ["anuradhapura", "Anuradhapura District", "north-central"], ["polonnaruwa", "Polonnaruwa District", "north-central"],
  ["badulla", "Badulla District", "uva"], ["monaragala", "Monaragala District", "uva"],
  ["ratnapura", "Ratnapura District", "sabaragamuwa"], ["kegalle", "Kegalle District", "sabaragamuwa"],
];
for (const [id, name, prov] of LK_DIST) region(`lk-d-${id}`, name, "LK", `lk-p-${prov}`, [`${id.replace("-", " ")} district`]);
city("lk-colombo", "Colombo", "LK", "lk-d-colombo", ["colombo city", "cmb", ...Array.from({ length: 15 }, (_, i) => `colombo ${String(i + 1).padStart(2, "0")}`), ...Array.from({ length: 15 }, (_, i) => `colombo ${i + 1}`), "fort", "pettah", "kollupitiya", "bambalapitiya", "wellawatte", "wellawatta", "borella", "kirulapone", "narahenpita", "havelock town", "cinnamon gardens", "slave island", "grandpass", "kotahena", "mattakkuliya", "dematagoda", "maradana", "thimbirigasyaya"]);
for (const [n, al] of [["Nugegoda", []], ["Dehiwala", ["dehiwala-mount lavinia"]], ["Mount Lavinia", ["mt lavinia", "mt. lavinia"]], ["Rajagiriya", []], ["Maharagama", []], ["Sri Jayawardenepura Kotte", ["kotte", "sri jayawardenapura kotte", "ethul kotte"]], ["Battaramulla", []], ["Kottawa", []], ["Moratuwa", []], ["Ratmalana", []], ["Homagama", []], ["Malabe", []], ["Kaduwela", []], ["Piliyandala", []], ["Boralesgamuwa", []], ["Pannipitiya", []], ["Kolonnawa", []], ["Wellampitiya", []], ["Angoda", []], ["Avissawella", []], ["Padukka", []], ["Athurugiriya", []], ["Kesbewa", []], ["Pita Kotte", []], ["Nawala", []], ["Thalawathugoda", []]] as [string, string[]][])
  city(`lk-${n.toLowerCase().replace(/\s+/g, "-")}`, n, "LK", "lk-d-colombo", al);
for (const n of ["Gampaha", "Negombo", "Wattala", "Kadawatha", "Ja-Ela", "Kelaniya", "Kiribathgoda", "Ragama", "Minuwangoda", "Katunayake", "Seeduwa", "Kandana", "Nittambuwa", "Veyangoda", "Divulapitiya", "Mirigama", "Biyagama", "Kadana", "Delgoda"])
  city(`lk-${n.toLowerCase()}`, n, "LK", "lk-d-gampaha", n === "Ja-Ela" ? ["ja ela", "jaela"] : []);
for (const n of ["Kalutara", "Panadura", "Horana", "Beruwala", "Wadduwa", "Bandaragama", "Matugama", "Aluthgama"]) city(`lk-${n.toLowerCase()}`, n, "LK", "lk-d-kalutara");
for (const n of ["Kandy", "Peradeniya", "Katugastota", "Gampola", "Kundasale", "Digana", "Akurana", "Nawalapitiya"]) city(`lk-${n.toLowerCase()}`, n, "LK", "lk-d-kandy", n === "Kandy" ? ["kandy city", "maha nuwara"] : []);
city("lk-matale", "Matale", "LK", "lk-d-matale"); city("lk-dambulla", "Dambulla", "LK", "lk-d-matale");
city("lk-nuwara-eliya", "Nuwara Eliya", "LK", "lk-d-nuwara-eliya", ["nuwaraeliya"]); city("lk-hatton", "Hatton", "LK", "lk-d-nuwara-eliya");
for (const n of ["Galle", "Hikkaduwa", "Ambalangoda", "Karapitiya", "Elpitiya"]) city(`lk-${n.toLowerCase()}`, n, "LK", "lk-d-galle");
for (const n of ["Matara", "Weligama", "Akuressa"]) city(`lk-${n.toLowerCase()}`, n, "LK", "lk-d-matara");
for (const n of ["Hambantota", "Tangalle", "Tissamaharama", "Ambalantota"]) city(`lk-${n.toLowerCase()}`, n, "LK", "lk-d-hambantota");
for (const n of ["Jaffna", "Chavakachcheri", "Point Pedro", "Nallur"]) city(`lk-${n.toLowerCase().replace(/\s+/g, "-")}`, n, "LK", "lk-d-jaffna");
city("lk-kilinochchi", "Kilinochchi", "LK", "lk-d-kilinochchi"); city("lk-mannar", "Mannar", "LK", "lk-d-mannar"); city("lk-vavuniya", "Vavuniya", "LK", "lk-d-vavuniya"); city("lk-mullaitivu", "Mullaitivu", "LK", "lk-d-mullaitivu");
for (const n of ["Batticaloa", "Kattankudy", "Eravur"]) city(`lk-${n.toLowerCase()}`, n, "LK", "lk-d-batticaloa");
for (const n of ["Ampara", "Kalmunai", "Akkaraipattu", "Sainthamaruthu"]) city(`lk-${n.toLowerCase()}`, n, "LK", "lk-d-ampara");
city("lk-trincomalee", "Trincomalee", "LK", "lk-d-trincomalee", ["trinco"]); city("lk-kinniya", "Kinniya", "LK", "lk-d-trincomalee");
for (const n of ["Kurunegala", "Kuliyapitiya", "Narammala", "Pannala", "Wariyapola"]) city(`lk-${n.toLowerCase()}`, n, "LK", "lk-d-kurunegala");
for (const n of ["Puttalam", "Chilaw", "Wennappuwa", "Marawila", "Nattandiya"]) city(`lk-${n.toLowerCase()}`, n, "LK", "lk-d-puttalam");
city("lk-anuradhapura", "Anuradhapura", "LK", "lk-d-anuradhapura"); city("lk-polonnaruwa", "Polonnaruwa", "LK", "lk-d-polonnaruwa");
for (const n of ["Badulla", "Bandarawela", "Haputale", "Welimada"]) city(`lk-${n.toLowerCase()}`, n, "LK", "lk-d-badulla");
city("lk-monaragala", "Monaragala", "LK", "lk-d-monaragala", ["moneragala"]); city("lk-wellawaya", "Wellawaya", "LK", "lk-d-monaragala");
for (const n of ["Ratnapura", "Embilipitiya", "Balangoda", "Pelmadulla"]) city(`lk-${n.toLowerCase()}`, n, "LK", "lk-d-ratnapura");
for (const n of ["Kegalle", "Mawanella", "Warakapola", "Rambukkana"]) city(`lk-${n.toLowerCase()}`, n, "LK", "lk-d-kegalle");

// ── India ──
const IN_STATES: [string, string, string[]][] = [["maharashtra", "Maharashtra", ["Mumbai", "Pune", "Nagpur", "Thane", "Navi Mumbai"]], ["karnataka", "Karnataka", ["Bengaluru", "Mysuru", "Mangaluru"]], ["tamil-nadu", "Tamil Nadu", ["Chennai", "Coimbatore", "Madurai", "Tiruchirappalli"]], ["kerala", "Kerala", ["Kochi", "Thiruvananthapuram", "Kozhikode", "Thrissur"]], ["telangana", "Telangana", ["Hyderabad", "Secunderabad"]], ["delhi", "Delhi NCR", ["New Delhi", "Gurugram", "Noida", "Faridabad", "Ghaziabad"]], ["west-bengal", "West Bengal", ["Kolkata"]], ["gujarat", "Gujarat", ["Ahmedabad", "Surat", "Vadodara"]], ["andhra-pradesh", "Andhra Pradesh", ["Visakhapatnam", "Vijayawada"]], ["punjab", "Punjab", ["Chandigarh", "Ludhiana"]], ["rajasthan", "Rajasthan", ["Jaipur"]], ["uttar-pradesh", "Uttar Pradesh", ["Lucknow"]]];
const IN_ALIASES: Record<string, string[]> = { Bengaluru: ["bangalore", "blr"], Mumbai: ["bombay"], Chennai: ["madras"], Kolkata: ["calcutta"], Kochi: ["cochin", "ernakulam"], Thiruvananthapuram: ["trivandrum"], Gurugram: ["gurgaon"], "New Delhi": ["delhi"], Mysuru: ["mysore"], Mangaluru: ["mangalore"], Kozhikode: ["calicut"], Visakhapatnam: ["vizag"] };
for (const [id, name, cities] of IN_STATES) {
  region(`in-s-${id}`, name, "IN", "c-IN", id === "delhi" ? ["ncr", "delhi ncr"] : []);
  for (const c of cities) city(`in-${c.toLowerCase().replace(/\s+/g, "-")}`, c, "IN", `in-s-${id}`, IN_ALIASES[c] ?? []);
}

// ── Gulf ──
for (const [id, name, cities] of [["dubai", "Dubai", ["Dubai", "Jebel Ali"]], ["abu-dhabi", "Abu Dhabi", ["Abu Dhabi", "Al Ain", "Ruwais"]], ["sharjah", "Sharjah", ["Sharjah"]], ["ajman", "Ajman", ["Ajman"]], ["rak", "Ras Al Khaimah", ["Ras Al Khaimah"]], ["fujairah", "Fujairah", ["Fujairah"]], ["uaq", "Umm Al Quwain", ["Umm Al Quwain"]]] as [string, string, string[]][]) {
  region(`ae-e-${id}`, `${name} Emirate`, "AE", "c-AE", [`emirate of ${name.toLowerCase()}`]);
  for (const c of cities) city(`ae-${c.toLowerCase().replace(/\s+/g, "-")}`, c, "AE", `ae-e-${id}`, c === "Ras Al Khaimah" ? ["rak"] : c === "Abu Dhabi" ? ["auh"] : c === "Dubai" ? ["dxb"] : []);
}
for (const c of ["Doha", "Al Wakrah", "Al Rayyan", "Lusail", "Mesaieed", "Ras Laffan"]) city(`qa-${c.toLowerCase().replace(/\s+/g, "-")}`, c, "QA");
region("sa-r-riyadh", "Riyadh Region", "SA"); region("sa-r-eastern", "Eastern Province (Saudi)", "SA", "c-SA", ["eastern province saudi", "sharqiya"]); region("sa-r-makkah", "Makkah Region", "SA");
city("sa-riyadh", "Riyadh", "SA", "sa-r-riyadh"); for (const c of ["Dammam", "Al Khobar", "Jubail", "Dhahran"]) city(`sa-${c.toLowerCase().replace(/\s+/g, "-")}`, c, "SA", "sa-r-eastern", c === "Al Khobar" ? ["khobar"] : []);
for (const c of ["Jeddah", "Makkah", "Taif"]) city(`sa-${c.toLowerCase()}`, c, "SA", "sa-r-makkah", c === "Makkah" ? ["mecca"] : c === "Jeddah" ? ["jiddah"] : []);
city("sa-madinah", "Madinah", "SA", undefined, ["medina"]); city("sa-neom", "NEOM", "SA");
for (const c of ["Kuwait City", "Salmiya", "Farwaniya", "Ahmadi"]) city(`kw-${c.toLowerCase().replace(/\s+/g, "-")}`, c, "KW");
for (const c of ["Muscat", "Sohar", "Salalah", "Nizwa"]) city(`om-${c.toLowerCase()}`, c, "OM");
for (const c of ["Manama", "Muharraq", "Riffa"]) city(`bh-${c.toLowerCase()}`, c, "BH");
city("jo-amman", "Amman", "JO"); city("lb-beirut", "Beirut", "LB"); city("eg-cairo", "Cairo", "EG");

// ── UK and Ireland ──
region("gb-r-england", "England", "GB"); region("gb-r-scotland", "Scotland", "GB"); region("gb-r-wales", "Wales", "GB");
region("gb-r-london", "Greater London", "GB", "gb-r-england", ["greater london"]);
city("gb-london", "London", "GB", "gb-r-london", ["central london", "city of london"]);
for (const c of ["Croydon", "Harrow", "Wembley", "Ilford", "Hounslow", "Southall", "Stratford", "Canary Wharf"]) city(`gb-${c.toLowerCase().replace(/\s+/g, "-")}`, c, "GB", "gb-r-london");
for (const c of ["Manchester", "Birmingham", "Leeds", "Bristol", "Leicester", "Liverpool", "Sheffield", "Nottingham", "Reading", "Milton Keynes", "Slough", "Luton", "Cambridge", "Oxford", "Coventry", "Bradford"]) city(`gb-${c.toLowerCase().replace(/\s+/g, "-")}`, c, "GB", "gb-r-england");
for (const c of ["Glasgow", "Edinburgh", "Aberdeen"]) city(`gb-${c.toLowerCase()}`, c, "GB", "gb-r-scotland");
city("gb-cardiff", "Cardiff", "GB", "gb-r-wales"); city("ie-dublin", "Dublin", "IE");

// ── Elsewhere ──
city("mv-male", "Malé", "MV", undefined, ["male city", "male'", "malé city"]); city("mv-hulhumale", "Hulhumalé", "MV", undefined, ["hulhumale"]); city("mv-addu", "Addu City", "MV", undefined, ["addu"]);
city("sg-singapore", "Singapore", "SG"); city("my-kuala-lumpur", "Kuala Lumpur", "MY", undefined, ["kl"]); city("my-penang", "Penang", "MY"); city("my-cyberjaya", "Cyberjaya", "MY");
city("bd-dhaka", "Dhaka", "BD"); city("bd-chittagong", "Chittagong", "BD", undefined, ["chattogram"]);
city("pk-karachi", "Karachi", "PK"); city("pk-lahore", "Lahore", "PK"); city("pk-islamabad", "Islamabad", "PK");
city("np-kathmandu", "Kathmandu", "NP"); city("ph-manila", "Manila", "PH", undefined, ["metro manila", "makati", "quezon city"]); city("ph-cebu", "Cebu", "PH");
region("au-r-nsw", "New South Wales", "AU", "c-AU", ["nsw"]); region("au-r-vic", "Victoria", "AU", "c-AU", ["vic"]);
city("au-sydney", "Sydney", "AU", "au-r-nsw"); city("au-melbourne", "Melbourne", "AU", "au-r-vic"); city("au-perth", "Perth", "AU"); city("au-brisbane", "Brisbane", "AU");
city("nz-auckland", "Auckland", "NZ"); city("ca-toronto", "Toronto", "CA"); city("ca-vancouver", "Vancouver", "CA");
city("us-new-york", "New York", "US", undefined, ["nyc"]); city("us-san-francisco", "San Francisco", "US"); city("us-houston", "Houston", "US");
city("de-berlin", "Berlin", "DE"); city("de-frankfurt", "Frankfurt", "DE"); city("fr-paris", "Paris", "FR"); city("nl-amsterdam", "Amsterdam", "NL"); city("it-milan", "Milan", "IT");
city("cy-limassol", "Limassol", "CY"); city("cy-nicosia", "Nicosia", "CY");
city("my-johor", "Johor Bahru", "MY"); city("th-bangkok", "Bangkok", "TH"); city("id-jakarta", "Jakarta", "ID"); city("vn-ho-chi-minh", "Ho Chi Minh City", "VN", undefined, ["saigon"]);
city("ke-nairobi", "Nairobi", "KE"); city("za-johannesburg", "Johannesburg", "ZA"); city("sc-victoria", "Victoria (Seychelles)", "SC", undefined, ["mahe"]);

export const PLACES: Place[] = [
  ...GROUPS.map((g) => ({ id: g.id, name: g.name, kind: "group" as const, aliases: g.aliases })),
  ...COUNTRIES.map((c) => ({ id: `c-${c.code}`, name: c.name, kind: "country" as const, country: c.code, aliases: c.aliases ?? [] })),
  ...P,
];
export const PLACE_BY_ID = new Map(PLACES.map((p) => [p.id, p]));

/** Every id from this place up to its country (not groups). */
export function lineage(id: string): string[] {
  const out: string[] = [];
  let at = PLACE_BY_ID.get(id);
  while (at) {
    out.push(at.id);
    at = at.parent ? PLACE_BY_ID.get(at.parent) : undefined;
  }
  return out;
}

const withinCache = new Map<string, boolean>();
/** Is the profile's place inside the place asked for? */
export function within(profilePlace: string | null | undefined, asked: string): boolean {
  if (!profilePlace) return false;
  const k = `${profilePlace}>${asked}`;
  const hit = withinCache.get(k);
  if (hit !== undefined) return hit;
  const r = withinRaw(profilePlace, asked);
  withinCache.set(k, r);
  return r;
}
function withinRaw(profilePlace: string, asked: string): boolean {
  const g = GROUPS.find((x) => x.id === asked);
  const p = PLACE_BY_ID.get(profilePlace);
  if (!p) return false;
  if (g) {
    if (g.id === "g-overseas") return p.country !== "LK";
    return !!p.country && g.countries.includes(p.country);
  }
  return lineage(profilePlace).includes(asked);
}

/** How close two places are, for ranking a place preference: 1 same city … 0 elsewhere. */
export function closeness(profilePlace: string | null | undefined, asked: string): number {
  if (!profilePlace) return 0;
  if (within(profilePlace, asked)) return 1;
  const a = lineage(asked), p = lineage(profilePlace);
  // Same district, same province, same country.
  for (const [i, w] of [[1, 0.7], [2, 0.5], [3, 0.3]] as [number, number][]) {
    if (a[i] && p.includes(a[i]) && PLACE_BY_ID.get(a[i])?.kind !== "country") return w;
  }
  const ac = PLACE_BY_ID.get(asked)?.country;
  if (ac && PLACE_BY_ID.get(profilePlace)?.country === ac) return 0.3;
  return 0;
}

export const countryOf = (id: string | null | undefined): string | null => (id ? PLACE_BY_ID.get(id)?.country ?? null : null);

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();

/** Name and alias → place id. Ambiguous names prefer the more specific place. */
export const PLACE_NAMES: Map<string, string> = (() => {
  const m = new Map<string, string>();
  const rank = { group: 0, country: 1, region: 2, city: 3 };
  const add = (name: string, id: string) => {
    const k = norm(name);
    if (!k) return;
    const had = m.get(k);
    // "Kandy" the town beats "Kandy District"; a country never loses its own name.
    if (!had || rank[PLACE_BY_ID.get(id)!.kind] > rank[PLACE_BY_ID.get(had)!.kind] && PLACE_BY_ID.get(had)!.kind !== "country") m.set(k, id);
  };
  for (const p of PLACES) {
    add(p.name, p.id);
    for (const a of p.aliases ?? []) add(a, p.id);
  }
  return m;
})();

/**
 * Resolve a free-text place a profile builder returned ("Colombo 05", "Dubai,
 * UAE", "Kadawatha") to the most specific id. Street names are not places:
 * "Kandy Road, Kadawatha" is Kadawatha (D4), so the last recognised part that
 * is not followed by "road"/"rd"/"street" wins.
 */
export function resolvePlace(text: string | null | undefined): string | null {
  if (!text) return null;
  const parts = text.split(/[,\n;/|]+/).map((p) => norm(p)).filter(Boolean);
  let best: string | null = null;
  let bestKind = -1;
  const rank = { group: -1, country: 0, region: 1, city: 2 };
  for (const part of parts) {
    if (/\b(road|rd|street|st|mawatha|lane|avenue|ave|place|gardens? road)\b/.test(part) && !/^colombo \d/.test(part)) continue;
    const cands = [part, part.replace(/^(no\.? ?[\d/a-z-]+ )/, ""), part.replace(/ (district|city|province)$/, "")];
    for (const c of cands) {
      const id = PLACE_NAMES.get(c);
      if (id) {
        const k = rank[PLACE_BY_ID.get(id)!.kind];
        if (k >= bestKind) { best = id; bestKind = k; }
        break;
      }
    }
  }
  return best;
}

/** Nationality word → ISO code. */
export function resolveNationality(text: string | null | undefined): string | null {
  if (!text) return null;
  const t = norm(text);
  for (const c of COUNTRIES) {
    if (c.demonyms.includes(t) || norm(c.name) === t || (c.aliases ?? []).includes(t)) return c.code;
  }
  return null;
}

/** A Sri Lankan town that names a district means the district: "in Kandy" includes Peradeniya. */
export function widenLk(id: string): string {
  const p = PLACE_BY_ID.get(id);
  if (p?.kind === "city" && p.country === "LK") {
    const d = `lk-d-${id.slice(3)}`;
    if (PLACE_BY_ID.has(d)) return d;
  }
  return id;
}
