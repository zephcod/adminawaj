import Link from "next/link";
import NewCompanyDialog from "@/components/NewCompanyDialog";
import SyncButton from "@/components/SyncButton";
import { getCompanies } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function CompaniesPage() {
  const companies = await getCompanies();

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs tracking-[0.18em] text-amber uppercase">
            Companies
          </p>
          <h1 className="mt-1 text-2xl font-bold md:text-3xl">All companies</h1>
        </div>
        <div className="flex items-center gap-3">
          <NewCompanyDialog />
        </div>
      </div>

      <div className="mt-8 overflow-x-auto rounded-xl border border-edge bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-edge text-left text-xs tracking-wide text-muted uppercase">
              {["Company", "PIN", "Meta ad account", "Status", ""].map((h) => (
                <th key={h} className="px-4 py-3 font-medium sm:px-6">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {companies.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-muted">
                  No companies yet. Create one, or run{" "}
                  <code className="font-mono text-xs">
                    npm run db:setup-companies -- --seed-from-contacts
                  </code>{" "}
                  to seed from your contacts.
                </td>
              </tr>
            )}
            {companies.map((c) => (
              <tr key={c.$id} className="border-b border-edge/60 last:border-0">
                <td className="px-4 py-3 font-medium sm:px-6">{c.name}</td>
                <td className="px-4 py-3 font-mono sm:px-6">{c.pin}</td>
                <td className="px-4 py-3 font-mono text-xs sm:px-6">
                  {c.metaAdAccountId || "—"}
                </td>
                <td className="px-4 py-3 sm:px-6">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      c.active ? "bg-gold/15 text-amber" : "bg-fg/10 text-muted"
                    }`}
                  >
                    {c.active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right sm:px-6">
                  <span className="inline-flex items-center justify-end gap-1.5">
                    {c.metaAdAccountId ? (
                      <SyncButton companyId={c.$id} label="Sync" compact />
                    ) : (
                      <span
                        title="Set a Meta ad account ID in Manage to enable sync"
                        className="cursor-help text-xs text-muted/60"
                      >
                        No ad account
                      </span>
                    )}
                    <Link
                      href={`/companies/${c.$id}`}
                      title="Manage company settings"
                      className="rounded-md bg-navy px-2.5 py-1 text-xs font-medium text-white transition hover:bg-charcoal"
                    >
                      Manage
                    </Link>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
