import Link from "next/link";
import { notFound } from "next/navigation";
import {
  addCost,
  addDeposit,
  deleteCompany,
  removeCost,
  removeDeposit,
  saveCampaignDetails,
  saveCompany,
  saveInsightRow,
} from "@/app/actions";
import DeleteCompanyButton from "@/components/DeleteCompanyButton";
import MetaLeadSync from "@/components/MetaLeadSync";
import SyncButton from "@/components/SyncButton";
import {
  countFailedMetaLeads,
  getMetaLeadsForCompany,
  mapLeadFields,
} from "@/lib/meta-leads";
import { getCampaigns, getCompany, getCosts, getDeposits, getInsights } from "@/lib/data";
import {
  COST_CATEGORIES,
  COST_CATEGORY_LABELS,
  money,
  OTHER_PARENT,
  rangeToDates,
} from "@/lib/domain";
import { computeCompanyBalance, costGroupKey } from "@/lib/statement";

export const dynamic = "force-dynamic";

const inputCls =
  "w-full rounded-md border border-edge bg-input px-3 py-2 text-sm text-fg focus:border-gold focus:outline-none";
const cellInput =
  "w-24 rounded border border-edge bg-input px-2 py-1 text-right font-mono text-xs focus:border-gold focus:outline-none";

/** meta_leads.fieldData is the provider's raw payload — never trust it to parse. */
function safeFields(fieldData: string) {
  try {
    return mapLeadFields(JSON.parse(fieldData));
  } catch {
    return { extras: {} } as ReturnType<typeof mapLeadFields>;
  }
}

export default async function ManageCompanyPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { companyId } = await params;
  const { range } = await searchParams;
  const company = await getCompany(companyId);
  if (!company) notFound();

  const { since, until } = rangeToDates(range ?? "30d");
  const [rows, campaigns, costs, deposits, balance, metaLeads, failedLeads] =
    await Promise.all([
      getInsights(companyId, since, until),
      getCampaigns(companyId),
      getCosts(companyId), // all dates — costs are managed here regardless of range
      getDeposits(companyId), // all dates
      computeCompanyBalance(companyId),
      company.fbPageId ? getMetaLeadsForCompany(companyId) : [],
      company.fbPageId ? countFailedMetaLeads(companyId) : 0,
    ]);
  const campaignName = new Map(campaigns.map((c) => [c.metaCampaignId, c.name]));
  const sorted = [...rows].sort(
    (a, b) => b.date.localeCompare(a.date) || a.metaCampaignId.localeCompare(b.metaCampaignId)
  );

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/companies" className="text-sm text-muted hover:text-fg">
            ← All companies
          </Link>
          <h1 className="mt-1 text-3xl font-bold">{company.name}</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/companies/${company.$id}/statement`}
            className="rounded-md border border-edge px-3 py-1.5 text-sm text-fg transition hover:border-gold hover:text-amber"
          >
            View report
          </Link>
          <SyncButton companyId={company.$id} />
          <DeleteCompanyButton
            companyId={company.$id}
            companyName={company.name}
            deleteCompany={deleteCompany}
          />
        </div>
      </div>

      {/* ── Company settings ── */}
      <section className="mt-8 rounded-xl border border-edge bg-card p-4 shadow-sm sm:p-6">
        <h2 className="mb-4 text-lg font-semibold">Settings</h2>
        <form action={saveCompany} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <input type="hidden" name="id" value={company.$id} />
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Name</span>
            <input name="name" defaultValue={company.name} className={inputCls} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">PIN</span>
            <input
              name="pin"
              defaultValue={company.pin}
              pattern="\d{4,10}"
              inputMode="numeric"
              className={inputCls}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Meta ad account ID</span>
            <input
              name="metaAdAccountId"
              defaultValue={company.metaAdAccountId ?? ""}
              placeholder="act_1234567890"
              className={inputCls}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Facebook Page ID</span>
            <input
              name="fbPageId"
              defaultValue={company.fbPageId ?? ""}
              placeholder="1234567890"
              className={inputCls}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Account manager</span>
            <input
              name="accountManager"
              defaultValue={company.accountManager ?? ""}
              placeholder="e.g. Abu Wajai"
              className={inputCls}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Currency</span>
            <input name="currency" defaultValue={company.currency} className={inputCls} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Multiplier</span>
            <input
              name="currencyMultiplier"
              type="number"
              step="any"
              min="0"
              defaultValue={company.currencyMultiplier ?? 250}
              className={inputCls}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Notes</span>
            <input name="notes" defaultValue={company.notes ?? ""} className={inputCls} />
          </label>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input
              type="checkbox"
              name="active"
              defaultChecked={company.active}
              className="h-4 w-4 accent-gold"
            />
            <span>Active (PIN login enabled)</span>
          </label>
          <div className="sm:col-span-2 lg:col-span-3">
            <button
              type="submit"
              className="rounded-md bg-gold px-4 py-2 text-sm font-medium text-navy transition hover:bg-amber"
            >
              Save settings
            </button>
          </div>
        </form>
      </section>

      {/* ── Campaigns ── */}
      <section className="mt-8 rounded-xl border border-edge bg-card shadow-sm">
        <h2 className="px-4 pt-5 text-lg font-semibold sm:px-6">Campaigns</h2>
        <p className="px-4 pt-1 text-xs text-muted sm:px-6">
          Parent group controls how campaigns are grouped on the client report
          and survives syncs. Use{" "}
          <Link href="/campaigns" className="text-amber hover:underline">
            Campaign assignments
          </Link>{" "}
          to move a campaign to another company.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-edge text-left text-xs tracking-wide text-muted uppercase">
                {["Campaign", "Parent group", ""].map((h, i) => (
                  <th key={i} className="px-3 py-3 font-medium first:pl-4 sm:first:pl-6">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {campaigns.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-6 py-8 text-center text-muted">
                    No campaigns yet — run a sync.
                  </td>
                </tr>
              )}
              {campaigns.map((c) => (
                <tr key={c.$id} className="border-b border-edge/60 last:border-0">
                  <td className="max-w-56 px-3 py-2 pl-4 sm:pl-6">
                    <p className="truncate font-medium">{c.name}</p>
                    <p className="text-xs text-muted">
                      {[c.objective, c.status].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </td>
                  <td colSpan={2} className="px-0 py-1">
                    <form
                      action={saveCampaignDetails}
                      className="flex flex-wrap items-center gap-2 px-3"
                    >
                      <input type="hidden" name="id" value={c.$id} />
                      <input type="hidden" name="companyId" value={company.$id} />
                      <input
                        name="parentCampaign"
                        defaultValue={c.parentCampaign ?? ""}
                        placeholder="Parent group…"
                        maxLength={256}
                        list="company-parents"
                        className="w-40 rounded border border-edge bg-input px-2 py-1.5 text-sm focus:border-gold focus:outline-none"
                      />
                      <button
                        type="submit"
                        className="rounded border border-edge px-2.5 py-1.5 text-xs text-fg transition hover:border-gold"
                      >
                        Save
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <datalist id="company-parents">
            {[
              ...new Set(
                campaigns
                  .map((c) => c.parentCampaign?.trim())
                  .filter((p): p is string => !!p)
              ),
            ].map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </div>
      </section>

      {/* ── Meta Lead Ads ── */}
      <section className="mt-8 rounded-xl border border-edge bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-5 sm:px-6">
          <h2 className="text-lg font-semibold">Meta Lead Ads</h2>
          {company.fbPageId && <MetaLeadSync companyId={company.$id} label="Sync leads" />}
        </div>
        {!company.fbPageId ? (
          <p className="px-4 pt-1 pb-6 text-xs text-muted sm:px-6">
            Set this company&apos;s Facebook Page ID above to pull the people who
            filled in its lead forms. Each becomes a contact and a pipeline lead.
          </p>
        ) : (
          <>
            <p className="px-4 pt-1 text-xs text-muted sm:px-6">
              Leads from page{" "}
              <span className="font-mono">{company.fbPageId}</span> arrive in real
              time and land in the{" "}
              <Link href="/pipeline" className="text-amber hover:underline">
                pipeline
              </Link>
              .{" "}
              {failedLeads > 0 && (
                <span className="text-red-600">
                  {failedLeads} lead{failedLeads === 1 ? "" : "s"} failed to import
                  — the next sync retries them.
                </span>
              )}
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-edge text-left text-xs tracking-wide text-muted uppercase">
                    {["Received", "Name", "Phone", "Form", "Status"].map((h, i) => (
                      <th key={i} className="px-3 py-3 font-medium first:pl-4 sm:first:pl-6">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {metaLeads.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-muted">
                        No leads yet. Run a sync to backfill recent submissions.
                      </td>
                    </tr>
                  )}
                  {metaLeads.map((ml) => {
                    const f = safeFields(ml.fieldData);
                    const name =
                      [f.firstName, f.lastName].filter(Boolean).join(" ") ||
                      f.fullName ||
                      "—";
                    return (
                      <tr key={ml.$id} className="border-b border-edge/60 last:border-0">
                        <td className="px-3 py-2 pl-4 font-mono text-xs sm:pl-6">
                          {ml.createdTimeMeta.slice(0, 16).replace("T", " ")}
                        </td>
                        <td className="max-w-48 truncate px-3 py-2">
                          {ml.leadId ? (
                            <Link
                              href={`/leads/${ml.leadId}`}
                              className="text-amber hover:underline"
                            >
                              {name}
                            </Link>
                          ) : (
                            name
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{f.phone || "—"}</td>
                        <td className="max-w-40 truncate px-3 py-2 text-muted">
                          {ml.formName || "—"}
                        </td>
                        <td className="px-3 py-2">
                          {ml.state === "failed" ? (
                            <span
                              title={ml.error}
                              className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] text-red-600"
                            >
                              failed
                            </span>
                          ) : (
                            <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[10px] text-amber">
                              {ml.deliveredBy}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* ── Additional costs ── */}
      <section className="mt-8 rounded-xl border border-edge bg-card p-4 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold">Additional costs</h2>
        <p className="mt-1 text-xs text-muted">
          Creative production, strategy overhead, consultation… recorded per
          parent-campaign group in {company.currency} (the currency
          multiplier does not apply). Shown on the client report as
          additional investment, and settled per group in the balance above.
        </p>

        <form
          action={addCost}
          className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6"
        >
          <input type="hidden" name="companyId" value={company.$id} />
          <label className="block text-sm lg:col-span-2">
            <span className="mb-1 block text-muted">Parent group</span>
            <input
              name="parentCampaign"
              placeholder="Leave blank for Other campaigns"
              maxLength={256}
              list="company-parents"
              className={inputCls}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Category</span>
            <select name="category" required className={inputCls}>
              {COST_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {COST_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">
              Amount ({company.currency})
            </span>
            <input
              name="amount"
              type="number"
              step="any"
              min="0"
              required
              className={inputCls}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Date</span>
            <input name="date" type="date" required className={inputCls} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Description</span>
            <input
              name="description"
              maxLength={512}
              placeholder="optional"
              className={inputCls}
            />
          </label>
          <div className="sm:col-span-2 lg:col-span-6">
            <button
              type="submit"
              className="rounded-md bg-gold px-4 py-2 text-sm font-medium text-navy transition hover:bg-amber"
            >
              Add cost
            </button>
          </div>
        </form>

        {costs.length > 0 && (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-edge text-left text-xs tracking-wide text-muted uppercase">
                  {["Date", "Group", "Category", "Description", "Amount", ""].map(
                    (h, i) => (
                      <th key={i} className="px-3 py-2 font-medium">
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {costs.map((cost) => {
                  const groupKey = costGroupKey(cost, campaigns);
                  return (
                  <tr key={cost.$id} className="border-b border-edge/60 last:border-0">
                    <td className="px-3 py-2 font-mono text-xs">{cost.date}</td>
                    <td className="max-w-48 truncate px-3 py-2">
                      {groupKey === OTHER_PARENT ? "Other campaigns" : groupKey}
                    </td>
                    <td className="px-3 py-2">
                      {COST_CATEGORY_LABELS[cost.category]}
                    </td>
                    <td className="max-w-56 truncate px-3 py-2 text-muted">
                      {cost.description || "—"}
                    </td>
                    <td className="px-3 py-2">{money(cost.amount, company.currency)}</td>
                    <td className="px-3 py-2 text-right">
                      <form action={removeCost}>
                        <input type="hidden" name="id" value={cost.$id} />
                        <input type="hidden" name="companyId" value={company.$id} />
                        <button
                          type="submit"
                          aria-label="Delete cost"
                          className="rounded border border-edge px-2 py-1 text-xs text-muted transition hover:border-red-400 hover:text-red-600"
                        >
                          ✕
                        </button>
                      </form>
                    </td>
                  </tr>
                  );
                })}
                <tr>
                  <td colSpan={4} className="px-3 py-2 text-right text-xs font-semibold tracking-wide text-muted uppercase">
                    Total
                  </td>
                  <td className="px-3 py-2 font-semibold">
                    {money(
                      costs.reduce((n, c) => n + c.amount, 0),
                      company.currency
                    )}
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Deposits & account balance ── */}
      <section className="mt-8 rounded-xl border border-edge bg-card p-4 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold">Account balance</h2>
        <p className="mt-1 text-xs text-muted">
          Per parent-campaign group: deposits − lifetime ad spend − additional
          costs. Same grouping as Campaigns above and the campaign statement.
        </p>

        {balance.byGroup.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-edge text-left text-xs tracking-wide text-muted uppercase">
                  {["Group", "Deposits", "Ad spend", "Costs", "Balance"].map((h) => (
                    <th key={h} className="px-3 py-2 font-medium first:pl-0">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {balance.byGroup.map((g) => (
                  <tr key={g.parentKey} className="border-b border-edge/60 last:border-0">
                    <td className="px-3 py-2 pl-0 font-medium">{g.parentLabel}</td>
                    <td className="px-3 py-2">{money(g.deposits, company.currency)}</td>
                    <td className="px-3 py-2">{money(g.adSpend, company.currency)}</td>
                    <td className="px-3 py-2">{money(g.costs, company.currency)}</td>
                    <td
                      className={`px-3 py-2 font-semibold ${
                        g.balance >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {money(g.balance, company.currency)}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="px-3 py-2 pl-0 text-xs font-semibold tracking-wide text-muted uppercase">
                    Total
                  </td>
                  <td className="px-3 py-2" colSpan={3} />
                  <td
                    className={`px-3 py-2 font-semibold ${
                      balance.total >= 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {money(balance.total, company.currency)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <h3 className="mt-6 text-sm font-semibold">Log a deposit</h3>
        <form action={addDeposit} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <input type="hidden" name="companyId" value={company.$id} />
          <label className="block text-sm lg:col-span-2">
            <span className="mb-1 block text-muted">Parent group</span>
            <input
              name="parentCampaign"
              placeholder="Leave blank for Other campaigns"
              maxLength={256}
              list="company-parents"
              className={inputCls}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">
              Amount ({company.currency})
            </span>
            <input
              name="amount"
              type="number"
              step="any"
              min="0"
              required
              className={inputCls}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Date</span>
            <input name="date" type="date" required className={inputCls} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Note</span>
            <input
              name="note"
              maxLength={512}
              placeholder="optional"
              className={inputCls}
            />
          </label>
          <div className="sm:col-span-2 lg:col-span-5">
            <button
              type="submit"
              className="rounded-md bg-gold px-4 py-2 text-sm font-medium text-navy transition hover:bg-amber"
            >
              Add deposit
            </button>
          </div>
        </form>

        {deposits.length > 0 && (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-edge text-left text-xs tracking-wide text-muted uppercase">
                  {["Date", "Group", "Note", "Amount", ""].map((h, i) => (
                    <th key={i} className="px-3 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {deposits.map((d) => (
                  <tr key={d.$id} className="border-b border-edge/60 last:border-0">
                    <td className="px-3 py-2 font-mono text-xs">{d.date}</td>
                    <td className="px-3 py-2">
                      {d.parentCampaign?.trim() || "Other campaigns"}
                    </td>
                    <td className="max-w-56 truncate px-3 py-2 text-muted">
                      {d.note || "—"}
                    </td>
                    <td className="px-3 py-2">{money(d.amount, company.currency)}</td>
                    <td className="px-3 py-2 text-right">
                      <form action={removeDeposit}>
                        <input type="hidden" name="id" value={d.$id} />
                        <input type="hidden" name="companyId" value={company.$id} />
                        <button
                          type="submit"
                          aria-label="Delete deposit"
                          className="rounded border border-edge px-2 py-1 text-xs text-muted transition hover:border-red-400 hover:text-red-600"
                        >
                          ✕
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={3} className="px-3 py-2 text-right text-xs font-semibold tracking-wide text-muted uppercase">
                    Total
                  </td>
                  <td className="px-3 py-2 font-semibold">
                    {money(
                      deposits.reduce((n, d) => n + d.amount, 0),
                      company.currency
                    )}
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Editable insight rows ── */}
      <section className="mt-8 rounded-xl border border-edge bg-card shadow-sm">
        <div className="flex items-center justify-between px-4 pt-5 sm:px-6">
          <h2 className="text-lg font-semibold">
            Daily data <span className="text-sm font-normal text-muted">({since} → {until})</span>
          </h2>
        </div>
        <p className="px-4 pt-1 text-xs text-muted sm:px-6">
          Saving a row marks it as edited — Meta syncs will no longer overwrite it.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-edge text-left text-xs tracking-wide text-muted uppercase">
                {["Date", "Campaign", "Spend", "Impr.", "Reach", "Clicks", "Leads", "Calls", "Results", "", ""].map(
                  (h, i) => (
                    <th key={i} className="px-3 py-3 font-medium first:pl-4 sm:first:pl-6">
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-10 text-center text-muted">
                    No data in this period. Run a sync, or widen the range with
                    ?range=90d.
                  </td>
                </tr>
              )}
              {sorted.map((r) => (
                <tr key={r.$id} className="border-b border-edge/60 last:border-0">
                  <td className="px-3 py-2 pl-4 font-mono text-xs sm:pl-6">{r.date}</td>
                  <td className="max-w-48 truncate px-3 py-2">
                    {campaignName.get(r.metaCampaignId) ?? r.metaCampaignId}
                  </td>
                  <td colSpan={6} className="px-0 py-1">
                    <form action={saveInsightRow} className="flex items-center gap-2 px-3">
                      <input type="hidden" name="id" value={r.$id} />
                      <input type="hidden" name="companyId" value={company.$id} />
                      <input name="spend" defaultValue={r.spend} className={cellInput} />
                      <input name="impressions" defaultValue={r.impressions} className={cellInput} />
                      <input name="reach" defaultValue={r.reach} className={cellInput} />
                      <input name="clicks" defaultValue={r.clicks} className={cellInput} />
                      <input name="leads" defaultValue={r.leads} className={cellInput} />
                      <input name="calls" defaultValue={r.calls ?? 0} className={cellInput} />
                      <input
                        name="results"
                        defaultValue={r.results ?? (r.leads + (r.calls ?? 0))}
                        className={cellInput}
                      />
                      <button
                        type="submit"
                        className="rounded border border-edge px-2 py-1 text-xs text-fg transition hover:border-gold"
                      >
                        Save
                      </button>
                      {r.edited && (
                        <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[10px] text-amber">
                          edited
                        </span>
                      )}
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
