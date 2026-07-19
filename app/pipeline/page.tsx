import { LEAD_SERVICES } from "@/lib/domain";
import { getContacts, getLeads } from "@/lib/data";
import { createLead } from "@/app/actions";
import PipelineBoard from "@/components/PipelineBoard";
import NewLeadForm from "@/components/NewLeadForm";

export const dynamic = "force-dynamic";

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ newLeadFor?: string }>;
}) {
  const [{ newLeadFor }, leads, contacts] = await Promise.all([
    searchParams,
    getLeads(),
    getContacts(),
  ]);

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs tracking-[0.18em] text-amber uppercase">
            Pipeline
          </p>
          <h1 className="mt-1 text-2xl font-bold md:text-3xl">Lead sequence</h1>
        </div>
        <NewLeadForm
          contacts={contacts.map((c) => ({
            id: c.$id,
            label: `${[c.firstName, c.lastName].filter(Boolean).join(" ")}${c.company ? ` — ${c.company}` : ""}`,
          }))}
          services={[...LEAD_SERVICES]}
          createLead={createLead}
          defaultContactId={newLeadFor}
        />
      </div>

      <PipelineBoard leads={leads} />
    </div>
  );
}
