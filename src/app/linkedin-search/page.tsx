import LinkedInSearch from "./LinkedInSearch";

export const metadata = { title: "LinkedIn Search - TA System" };

// Testing page: a recruiter's filters go to Apify's harvestapi/linkedin-profile-search
// through /api/linkedin-search. Nothing is saved.
export default function Page() {
  return <LinkedInSearch />;
}
