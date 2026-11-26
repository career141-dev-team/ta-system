/**
 * Roles: the occupation, never the level. "Finance Manager", "Chief Accountant"
 * and "Accounts Executive" are all the role `accountant`; the level ladder
 * (levels.ts) says how senior. A profile holds up to two roles (a blended
 * "HR & Admin Executive" is hr + admin), and a search asks for one or more.
 *
 * `titles` are the common ways the role is written on CVs, across countries.
 * They are hints for the rule-based reader and for tests; Haiku reads titles
 * in context and only has to pick an id from this list.
 */

export interface Role {
  id: string;
  label: string;
  family: string;
  /** Ways a TA or a CV names it, lower case. Longest match wins in the reader. */
  titles: string[];
  /** Roles a TA would accept as "near" (same family is already near). */
  near?: string[];
}

export const FAMILIES = [
  "Finance & Accounts", "Audit & Tax", "Banking & Financial Services", "Human Resources", "Sales",
  "Marketing", "Customer Service", "IT & Software", "Data & Analytics", "Engineering", "Construction & QS",
  "Healthcare", "Hospitality", "Administration", "Supply Chain & Logistics", "Apparel & Manufacturing",
  "Trades & Services", "Agriculture & Plantation", "Education", "Legal", "Creative & Media", "General Management",
] as const;

export const ROLES: Role[] = [
  // Finance & Accounts
  { id: "accountant", label: "Accountant / Finance", family: "Finance & Accounts", titles: ["accountant", "accounts executive", "accounts officer", "finance executive", "finance officer", "assistant accountant", "chartered accountant", "chief accountant", "finance manager", "financial controller", "head of finance", "cfo", "chief financial officer", "finance director", "accounts assistant", "accounts clerk", "accounting", "accounts", "finance and accounts", "management accountant", "cost accountant", "general accountant", "senior accountant", "snr. accountant", "sr. accountant", "accounts payable", "accounts receivable", "gl accountant"], near: ["financial_analyst", "payroll", "tax", "internal_auditor", "auditor"] },
  { id: "financial_analyst", label: "Financial Analyst / FP&A", family: "Finance & Accounts", titles: ["financial analyst", "fp&a", "finance analyst", "business finance analyst", "budget analyst"], near: ["accountant", "investment_analyst"] },
  { id: "payroll", label: "Payroll", family: "Finance & Accounts", titles: ["payroll executive", "payroll officer", "payroll specialist", "payroll accountant", "payroll"], near: ["accountant", "hr"] },
  { id: "treasury", label: "Treasury", family: "Finance & Accounts", titles: ["treasury officer", "treasury executive", "treasury manager", "treasury dealer", "treasury"] },
  { id: "investment_analyst", label: "Investment / Equity Analyst", family: "Finance & Accounts", titles: ["investment analyst", "equity analyst", "research analyst equities", "portfolio manager", "fund manager"] },
  // Audit & Tax
  { id: "auditor", label: "External Auditor", family: "Audit & Tax", titles: ["auditor", "audit associate", "audit senior", "audit trainee", "audit executive", "audit manager", "audit and assurance", "assurance associate", "external auditor", "audit semi senior"], near: ["internal_auditor", "accountant"] },
  { id: "internal_auditor", label: "Internal Auditor", family: "Audit & Tax", titles: ["internal auditor", "internal audit executive", "internal audit manager", "head of internal audit", "internal audit", "risk and internal audit"], near: ["auditor", "risk_compliance"] },
  { id: "tax", label: "Tax", family: "Audit & Tax", titles: ["tax consultant", "tax executive", "tax manager", "tax associate", "tax accountant", "vat accountant", "tax"], near: ["accountant", "auditor"] },
  // Banking
  { id: "relationship_manager", label: "Relationship Manager (banking)", family: "Banking & Financial Services", titles: ["relationship manager", "relationship officer", "personal banker", "wealth manager", "priority banker", "corporate banking officer"], near: ["sales", "credit_analyst"] },
  { id: "bank_operations", label: "Banking Operations / Teller", family: "Banking & Financial Services", titles: ["bank teller", "teller", "banking assistant", "customer service officer bank", "banking associate", "trade finance officer", "operations officer bank", "bank officer", "branch operations"], near: ["customer_service"] },
  { id: "credit_analyst", label: "Credit / Loans", family: "Banking & Financial Services", titles: ["credit analyst", "credit officer", "loan officer", "credit executive", "recoveries officer", "leasing officer", "credit manager", "underwriter"], near: ["relationship_manager", "financial_analyst"] },
  { id: "risk_compliance", label: "Risk & Compliance", family: "Banking & Financial Services", titles: ["compliance officer", "compliance executive", "aml officer", "kyc analyst", "risk analyst", "risk officer", "compliance manager", "risk manager"], near: ["internal_auditor", "legal"] },
  { id: "insurance", label: "Insurance", family: "Banking & Financial Services", titles: ["insurance advisor", "insurance agent", "claims officer", "claims executive", "underwriting executive", "life planning advisor"], near: ["sales"] },
  // HR
  { id: "hr", label: "HR Generalist / HR Executive", family: "Human Resources", titles: ["hr executive", "hr officer", "hr assistant", "hr manager", "human resources executive", "human resources officer", "human resource manager", "executive - human resources", "hr & admin executive", "hr generalist", "hrbp", "hr business partner", "head of hr", "people partner", "hr coordinator", "personnel officer", "hr", "human resources", "employee relations"], near: ["recruiter", "payroll", "learning_development"] },
  { id: "recruiter", label: "Recruiter / Talent Acquisition", family: "Human Resources", titles: ["recruiter", "talent acquisition", "recruitment executive", "recruitment consultant", "talent acquisition specialist", "sourcing specialist", "head hunter", "headhunter", "ta executive"], near: ["hr"] },
  { id: "learning_development", label: "Learning & Development", family: "Human Resources", titles: ["training executive", "l&d executive", "learning and development", "training manager", "trainer"], near: ["hr", "teacher"] },
  // Sales
  { id: "sales", label: "Sales / Business Development", family: "Sales", titles: ["sales executive", "sales representative", "sales officer", "sales manager", "business development executive", "business development manager", "bde", "bdm", "area sales manager", "territory sales", "sales engineer", "sales associate", "sales consultant", "international sales manager", "export sales", "sales"], near: ["key_account", "relationship_manager", "marketing"] },
  { id: "key_account", label: "Key Account Management", family: "Sales", titles: ["key account manager", "key account executive", "account manager", "trade marketing executive"], near: ["sales"] },
  { id: "retail_sales", label: "Retail / Shop Sales", family: "Sales", titles: ["sales assistant", "shop assistant", "store sales", "cashier", "retail associate", "showroom sales"], near: ["customer_service", "sales"] },
  // Marketing
  { id: "marketing", label: "Marketing / Brand", family: "Marketing", titles: ["marketing executive", "marketing manager", "brand manager", "brand executive", "marketing officer", "product manager marketing", "marketing coordinator", "head of marketing", "cmo", "marketing"], near: ["digital_marketing", "sales"] },
  { id: "digital_marketing", label: "Digital Marketing", family: "Marketing", titles: ["digital marketing executive", "digital marketing manager", "seo specialist", "social media executive", "social media manager", "performance marketing", "digital marketer", "content marketing"], near: ["marketing", "content_writer"] },
  // Customer service
  { id: "customer_service", label: "Customer Service / Call Centre", family: "Customer Service", titles: ["customer service executive", "customer service representative", "call centre agent", "call center agent", "customer care executive", "csr", "customer support", "contact centre", "customer experience", "client service"], near: ["receptionist", "bank_operations"] },
  // IT
  { id: "software_engineer", label: "Software Engineer / Developer", family: "IT & Software", titles: ["software engineer", "associate software engineer", "senior software engineer", "software developer", "developer", "programmer", "full stack developer", "backend developer", "frontend developer", "web developer", "mobile developer", "java developer", ".net developer", "react developer", "tech lead", "technical lead", "engineering manager", "cto"], near: ["qa_engineer", "devops", "data_engineer"] },
  { id: "qa_engineer", label: "QA / Test Engineer", family: "IT & Software", titles: ["qa engineer", "quality assurance engineer", "software tester", "test engineer", "automation engineer", "sdet", "qa lead"], near: ["software_engineer", "business_analyst"] },
  { id: "devops", label: "DevOps / Cloud", family: "IT & Software", titles: ["devops engineer", "cloud engineer", "site reliability engineer", "sre", "platform engineer", "systems administrator", "system administrator"], near: ["software_engineer", "network_engineer"] },
  { id: "network_engineer", label: "Network / Infrastructure", family: "IT & Software", titles: ["network engineer", "network administrator", "infrastructure engineer", "it infrastructure", "security engineer", "cyber security analyst", "soc analyst"], near: ["devops", "it_support"] },
  { id: "it_manager", label: "IT Manager / Head of IT / IT infrastructure manager / CIO", family: "IT & Software", titles: ["it manager", "head of it", "it head", "ict manager", "information technology manager", "it infrastructure manager", "cio", "chief information officer", "it director", "head of information technology", "systems manager"], near: ["it_support", "network_engineer", "project_manager"] },
  { id: "it_support", label: "IT Support / Helpdesk", family: "IT & Software", titles: ["it support", "it executive", "it officer", "helpdesk", "desktop support", "it technician", "it assistant", "it administrator"], near: ["network_engineer"] },
  { id: "business_analyst", label: "Business Analyst", family: "IT & Software", titles: ["business analyst", "ba", "product owner", "systems analyst", "functional consultant", "sap consultant", "erp consultant", "sap fico consultant"], near: ["project_manager", "data_analyst"] },
  { id: "project_manager", label: "Project Manager (IT / delivery)", family: "IT & Software", titles: ["project manager", "it project manager", "scrum master", "delivery manager", "program manager", "project coordinator", "pmo"], near: ["business_analyst"] },
  { id: "ui_ux", label: "UI/UX Designer", family: "IT & Software", titles: ["ui/ux designer", "ux designer", "ui designer", "product designer"], near: ["graphic_designer"] },
  // Data
  { id: "data_analyst", label: "Data Analyst / BI", family: "Data & Analytics", titles: ["data analyst", "bi analyst", "business intelligence", "reporting analyst", "mis executive", "mis analyst", "power bi developer"], near: ["data_scientist", "data_engineer", "business_analyst", "financial_analyst"] },
  { id: "data_scientist", label: "Data Scientist / ML", family: "Data & Analytics", titles: ["data scientist", "machine learning engineer", "ml engineer", "ai engineer"], near: ["data_analyst", "data_engineer"] },
  { id: "data_engineer", label: "Data Engineer", family: "Data & Analytics", titles: ["data engineer", "etl developer", "big data engineer"], near: ["data_scientist", "software_engineer"] },
  // Engineering
  { id: "civil_engineer", label: "Civil / Site Engineer", family: "Engineering", titles: ["civil engineer", "site engineer", "structural engineer", "project engineer civil", "resident engineer", "highway engineer"], near: ["quantity_surveyor", "construction_manager"] },
  { id: "mechanical_engineer", label: "Mechanical Engineer", family: "Engineering", titles: ["mechanical engineer", "mep engineer", "hvac engineer", "maintenance engineer", "plant engineer", "production engineer"], near: ["electrical_engineer"] },
  { id: "electrical_engineer", label: "Electrical / Electronic Engineer", family: "Engineering", titles: ["electrical engineer", "electronic engineer", "electronics engineer", "instrumentation engineer", "power engineer"], near: ["mechanical_engineer", "electrician"] },
  { id: "hse", label: "HSE / Safety Officer", family: "Engineering", titles: ["hse officer", "safety officer", "hse engineer", "health and safety officer", "hse manager", "nebosh"] },
  // Construction & QS
  { id: "quantity_surveyor", label: "Quantity Surveyor", family: "Construction & QS", titles: ["quantity surveyor", "qs", "senior quantity surveyor", "cost estimator", "estimation engineer", "cost engineer", "quantity surveyor (civil)", "contracts manager"], near: ["civil_engineer"] },
  { id: "architect", label: "Architect", family: "Construction & QS", titles: ["architect", "architectural assistant", "interior designer"], near: ["draughtsman"] },
  { id: "draughtsman", label: "Draughtsman / CAD", family: "Construction & QS", titles: ["draughtsman", "draftsman", "autocad draughtsman", "cad technician", "revit modeller"], near: ["architect", "civil_engineer"] },
  { id: "construction_manager", label: "Construction / Site Manager", family: "Construction & QS", titles: ["construction manager", "site manager", "site supervisor", "foreman", "project manager construction"], near: ["civil_engineer"] },
  // Healthcare
  { id: "nurse", label: "Nurse", family: "Healthcare", titles: ["nurse", "registered nurse", "staff nurse", "nursing officer", "icu nurse", "charge nurse", "head nurse", "nursing sister", "nurse practitioner", "ward sister", "rn"], near: ["caregiver"] },
  { id: "doctor", label: "Doctor / Medical Officer", family: "Healthcare", titles: ["doctor", "medical officer", "general practitioner", "gp", "physician", "consultant physician", "registrar", "house officer", "mbbs"] },
  { id: "pharmacist", label: "Pharmacist", family: "Healthcare", titles: ["pharmacist", "pharmacy assistant", "dispenser", "clinical pharmacist"] },
  { id: "lab_technician", label: "Medical Lab / Radiography", family: "Healthcare", titles: ["medical laboratory technologist", "lab technician", "mlt", "radiographer", "phlebotomist"] },
  { id: "caregiver", label: "Caregiver / Healthcare Assistant", family: "Healthcare", titles: ["caregiver", "care assistant", "healthcare assistant", "nursing assistant", "elder care", "babysitter", "nanny"], near: ["nurse"] },
  // Hospitality
  { id: "chef", label: "Chef / Cook", family: "Hospitality", titles: ["chef", "cook", "commis chef", "sous chef", "chef de partie", "executive chef", "pastry chef", "kitchen helper"] },
  { id: "front_office", label: "Front Office / Guest Relations", family: "Hospitality", titles: ["front office executive", "front office manager", "guest relations", "receptionist hotel", "front desk agent", "concierge", "reservations executive"], near: ["receptionist", "customer_service"] },
  { id: "food_beverage", label: "F&B Service / Steward", family: "Hospitality", titles: ["steward", "waiter", "waitress", "f&b associate", "f&b manager", "restaurant manager", "barista", "bartender", "captain f&b"] },
  { id: "housekeeping", label: "Housekeeping", family: "Hospitality", titles: ["housekeeping", "room attendant", "housekeeper", "executive housekeeper", "laundry attendant", "cleaner"] },
  // Administration
  { id: "admin", label: "Administration / Office", family: "Administration", titles: ["admin executive", "administrative officer", "admin officer", "office administrator", "admin assistant", "administration manager", "office manager", "office assistant", "clerk", "chief clerk", "management assistant", "hr & admin executive"], near: ["personal_assistant", "receptionist", "data_entry"] },
  { id: "personal_assistant", label: "PA / Executive Assistant / Secretary", family: "Administration", titles: ["personal assistant", "pa to ceo", "pa", "executive assistant", "executive assistant to the ceo", "secretary", "secretary to md", "secretary to the director", "executive secretary", "personal secretary"], near: ["admin", "receptionist"] },
  { id: "receptionist", label: "Receptionist", family: "Administration", titles: ["receptionist", "front desk", "telephone operator", "reception"], near: ["admin", "front_office"] },
  { id: "data_entry", label: "Data Entry", family: "Administration", titles: ["data entry operator", "data entry clerk", "data entry", "typist"], near: ["admin"] },
  // Supply chain
  { id: "procurement", label: "Procurement / Purchasing", family: "Supply Chain & Logistics", titles: ["procurement executive", "purchasing officer", "procurement officer", "buyer", "purchasing manager", "procurement manager", "sourcing executive"], near: ["supply_chain"] },
  { id: "supply_chain", label: "Supply Chain / Logistics", family: "Supply Chain & Logistics", titles: ["logistics executive", "logistics coordinator", "supply chain executive", "shipping executive", "freight forwarding", "import export executive", "logistics manager", "supply chain manager", "demand planner", "clearing agent"], near: ["procurement", "warehouse"] },
  { id: "warehouse", label: "Warehouse / Stores", family: "Supply Chain & Logistics", titles: ["storekeeper", "store keeper", "warehouse assistant", "warehouse supervisor", "stores executive", "inventory controller", "warehouse manager", "stores clerk"], near: ["supply_chain"] },
  // Apparel
  { id: "merchandiser", label: "Merchandiser (apparel)", family: "Apparel & Manufacturing", titles: ["merchandiser", "assistant merchandiser", "senior merchandiser", "merchandising executive", "merchandising manager", "fabric merchandiser"], near: ["production_planner"] },
  { id: "production_planner", label: "Production / Factory / Plant management and production planning", family: "Apparel & Manufacturing", titles: ["production planner", "production executive", "production manager", "planning executive", "planning manager", "production supervisor", "factory manager", "plant manager", "manufacturing manager", "production engineer", "head of production", "cutting manager", "finishing manager", "washing manager"], near: ["merchandiser", "quality_control", "industrial_engineer"] },
  { id: "industrial_engineer", label: "Industrial Engineering / Lean / Process improvement", family: "Apparel & Manufacturing", titles: ["industrial engineer", "ie executive", "ie manager", "lean manager", "process improvement", "operational excellence", "work study", "continuous improvement", "lean enterprise"], near: ["production_planner"] },
  { id: "garment_technologist", label: "Garment / Fabric Technologist, Pattern maker, Product development", family: "Apparel & Manufacturing", titles: ["garment technologist", "fabric technologist", "pattern maker", "pattern technologist", "product developer", "product development executive", "sample room", "technical designer"], near: ["merchandiser", "production_planner", "fashion_designer"] },
  { id: "quality_control", label: "Quality Control / Assurance", family: "Apparel & Manufacturing", titles: ["quality controller", "qc executive", "quality assurance executive", "quality inspector", "qa executive", "quality manager"], near: ["production_planner"] },
  // Trades & services
  { id: "driver", label: "Driver", family: "Trades & Services", titles: ["driver", "heavy vehicle driver", "light vehicle driver", "delivery driver", "chauffeur", "bus driver"] },
  { id: "security", label: "Security", family: "Trades & Services", titles: ["security officer", "security guard", "security supervisor", "watchman"] },
  { id: "electrician", label: "Electrician", family: "Trades & Services", titles: ["electrician", "electrical technician", "wireman"], near: ["technician"] },
  { id: "technician", label: "Technician (AC / mechanical)", family: "Trades & Services", titles: ["technician", "ac technician", "hvac technician", "mechanic", "auto mechanic", "maintenance technician", "plumber", "welder", "fitter"], near: ["electrician"] },
  { id: "beautician", label: "Beautician / Salon", family: "Trades & Services", titles: ["beautician", "hairdresser", "salon assistant", "spa therapist", "nail technician"] },
  // Education
  { id: "teacher", label: "Teacher", family: "Education", titles: ["teacher", "classroom teacher", "english teacher", "maths teacher", "primary teacher", "montessori teacher", "teaching assistant", "tutor"], near: ["lecturer", "learning_development"] },
  { id: "lecturer", label: "Lecturer / Academic", family: "Education", titles: ["lecturer", "senior lecturer", "assistant lecturer", "professor", "instructor"], near: ["teacher"] },
  // Legal
  { id: "legal", label: "Lawyer / Legal Officer", family: "Legal", titles: ["lawyer", "attorney", "attorney-at-law", "legal officer", "legal executive", "legal counsel", "advocate", "solicitor", "paralegal", "legal manager"], near: ["company_secretary", "risk_compliance"] },
  { id: "company_secretary", label: "Company Secretary", family: "Legal", titles: ["company secretary", "corporate secretarial executive", "secretarial executive"], near: ["legal"] },
  // Creative
  { id: "graphic_designer", label: "Graphic Designer", family: "Creative & Media", titles: ["graphic designer", "visualiser", "visualizer", "multimedia designer", "video editor", "motion graphics"], near: ["ui_ux", "digital_marketing"] },
  { id: "content_writer", label: "Content Writer / Copywriter", family: "Creative & Media", titles: ["content writer", "copywriter", "journalist", "editor", "technical writer"], near: ["digital_marketing"] },
  // General management
  { id: "operations", label: "Operations manager (runs the day-to-day operations of a business or branch)", family: "General Management", titles: ["operations manager", "operations executive", "branch manager", "business manager", "operations", "coo", "chief operating officer", "head of operations", "operations director"], near: ["executive_leadership"] },
  { id: "executive_leadership", label: "Top leadership: CEO, Managing Director, General Manager, Founder, Country head, Director", family: "General Management", titles: ["ceo", "chief executive officer", "managing director", "general manager", "founder", "co-founder", "country manager", "country head", "director", "president", "vice president", "agm", "dgm"], near: ["operations"] },
  { id: "consultant", label: "Management / Business consultant", family: "General Management", titles: ["management consultant", "business consultant", "consultant", "strategy consultant"] },
  { id: "sustainability", label: "Sustainability / ESG / Social compliance", family: "General Management", titles: ["sustainability manager", "sustainability executive", "esg", "social compliance", "compliance and sustainability"], near: ["hse"] },
  { id: "maintenance_engineer", label: "Maintenance / Facilities / Plant engineering", family: "Engineering", titles: ["maintenance engineer", "maintenance manager", "facilities manager", "facility manager", "engineering manager", "head of engineering", "plant engineer", "utility engineer"], near: ["mechanical_engineer", "electrical_engineer"] },
  { id: "chemist", label: "Chemist / Laboratory / R&D scientist", family: "Engineering", titles: ["chemist", "research and development", "r&d executive", "r&d manager", "laboratory chemist", "food technologist", "research scientist"], near: ["lab_technician", "quality_control"] },
  { id: "fashion_designer", label: "Fashion / Apparel designer", family: "Creative & Media", titles: ["fashion designer", "apparel designer", "print designer", "textile designer"], near: ["garment_technologist", "graphic_designer"] },
  { id: "agriculture", label: "Agriculture / Plantation / Estate", family: "Agriculture & Plantation", titles: ["agriculture", "agronomist", "plantation manager", "estate manager", "assistant superintendent", "field officer agriculture"] },
];

export const ROLE_BY_ID = new Map(ROLES.map((r) => [r.id, r]));

export function familyOf(roleId: string): string | null {
  return ROLE_BY_ID.get(roleId)?.family ?? null;
}

/** Same family, or listed as near either way. */
export function rolesNear(a: string, b: string): boolean {
  if (a === b) return true;
  const ra = ROLE_BY_ID.get(a), rb = ROLE_BY_ID.get(b);
  if (!ra || !rb) return false;
  return ra.family === rb.family || !!ra.near?.includes(b) || !!rb.near?.includes(a);
}
