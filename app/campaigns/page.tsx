import Link from "next/link";
import CampaignAssignmentsList from "@/components/CampaignAssignmentsList";
import SyncButton from "@/components/SyncButton";
import { getAllCampaigns, getCompanies } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const [campaigns, companies] = await Promise.all([
    getAllCampaigns(),
    getCompanies(),
  ]);
  const options = companies.map((c) => ({ value: c.$id, label: c.name }));
  const companyNames = Object.fromEntries(companies.map((c) => [c.$id, c.name]));
  const knownParents = [
    ...new Set(
      campaigns.map((c) => c.parentCampaign?.trim()).filter((p): p is string => !!p)
    ),
  ].sort();

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/companies" className="text-sm text-muted hover:text-fg">
            ← All companies
          </Link>
          <h1 className="mt-1 text-3xl font-bold">Campaign assignments</h1>
          <p className="mt-1 max-w-xl text-sm text-muted">
            One ad account can run campaigns for several companies. Assign each
            campaign to the company whose report it belongs in — its data
            (including history) moves with it, and future syncs respect the
            assignment.
          </p>
        </div>
        <SyncButton label="Sync all from Meta" />
      </div>

      <CampaignAssignmentsList
        campaigns={campaigns}
        options={options}
        companyNames={companyNames}
        knownParents={knownParents}
      />
    </div>
  );
}
