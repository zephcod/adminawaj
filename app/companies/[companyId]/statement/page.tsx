import Link from "next/link";
import { notFound } from "next/navigation";
import { AwajMark } from "@/components/icons/AwajMark";
import PrintButton from "@/components/PrintButton";
import SendStatementButton from "@/components/SendStatementButton";
import StatementParentSelect from "@/components/StatementParentSelect";
import { getCampaigns, getCompany, getCosts, getInsights } from "@/lib/data";
import {
  computeTotals,
  COST_CATEGORY_LABELS,
  DEFAULT_CURRENCY_MULTIPLIER,
  money,
  num,
  OTHER_PARENT as OTHER,
  rangeToDates,
  VAT_RATE,
  WHT_RATE,
  WHT_THRESHOLD,
  type InsightDaily,
} from "@/lib/domain";
import { costGroupKey } from "@/lib/statement";

export const dynamic = "force-dynamic";

export default async function StatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ range?: string; parent?: string }>;
}) {
  const { companyId } = await params;
  const { range, parent: parentParam } = await searchParams;

  const company = await getCompany(companyId);
  if (!company) notFound();

  const { since, until } = rangeToDates(range ?? "30d");
  const [rawRows, campaigns, allCosts] = await Promise.all([
    getInsights(companyId, since, until),
    getCampaigns(companyId),
    getCosts(companyId, since, until),
  ]);

  const multiplier = company.currencyMultiplier ?? DEFAULT_CURRENCY_MULTIPLIER;
  const allRows = rawRows.map((r) => ({ ...r, spend: r.spend * multiplier }));
  const cur = company.currency || "ETB";
  const campaignName = new Map(campaigns.map((c) => [c.metaCampaignId, c.name]));

  // ── Parent groups (one statement per group) ──
  const groupKeys = [
    ...new Set([
      ...campaigns.map((c) => c.parentCampaign?.trim() || OTHER),
      ...allCosts.map((c) => costGroupKey(c, campaigns)),
    ]),
  ].sort((a, b) => {
    if (a === OTHER) return 1;
    if (b === OTHER) return -1;
    return a.localeCompare(b);
  });
  if (groupKeys.length === 0) groupKeys.push(OTHER);

  const selectedKey = groupKeys.includes(parentParam ?? "")
    ? (parentParam as string)
    : groupKeys[0];
  const selectedLabel = selectedKey === OTHER ? "Other campaigns" : selectedKey;

  // ── Data scoped to the selected group ──
  const groupCampaignIds = new Set(
    campaigns
      .filter((c) => (c.parentCampaign?.trim() || OTHER) === selectedKey)
      .map((c) => c.metaCampaignId)
  );
  const rows = allRows.filter((r) => groupCampaignIds.has(r.metaCampaignId));
  const costs = allCosts.filter((c) => costGroupKey(c, campaigns) === selectedKey);

  const byCampaign = new Map<string, InsightDaily[]>();
  for (const r of rows) {
    const list = byCampaign.get(r.metaCampaignId) ?? [];
    list.push(r);
    byCampaign.set(r.metaCampaignId, list);
  }
  const adCountOf = new Map(
    campaigns.map((c) => [c.metaCampaignId, c.adCount ?? 0])
  );
  const campaignRows = [...byCampaign.entries()]
    .map(([id, list]) => ({
      id,
      name: campaignName.get(id) ?? id,
      ads: adCountOf.get(id) ?? 0,
      totals: computeTotals(list),
    }))
    .sort((a, b) => b.totals.spend - a.totals.spend);
  const adsTotal = campaignRows.reduce((n, c) => n + c.ads, 0);

  const totals = computeTotals(rows);
  const costTotal = costs.reduce((n, c) => n + c.amount, 0);

  // ── Taxes: 15% VAT on the subtotal; 3% WHT withheld on payments > 10,000 ETB ──
  const subtotal = totals.spend + costTotal;
  const vat = subtotal * VAT_RATE;
  const wht = subtotal > WHT_THRESHOLD ? subtotal * WHT_RATE : 0;
  const totalPayable = subtotal + vat - wht;
  const generated = new Date().toISOString().slice(0, 10);

  const parentOptions = groupKeys.map((k) => ({
    value: k,
    label: k === OTHER ? "Other campaigns" : k,
  }));

  const cellR = "py-1.5 pl-2 text-right tabular-nums";

  return (
    <div className="mx-auto max-w-[210mm]">
      {/* Screen-only toolbar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href={`/companies/${companyId}`}
          className="text-sm text-warmgray hover:text-charcoal"
        >
          ← Back to company
        </Link>
        <div className="flex items-center gap-3">
          {parentOptions.length > 1 && (
            <StatementParentSelect options={parentOptions} current={selectedKey} />
          )}
          <SendStatementButton
            companyId={companyId}
            range={range}
            parent={selectedKey}
          />
          <PrintButton />
        </div>
      </div>

      {/* A4 sheet */}
      <div className="rounded-xl border border-line bg-white p-8 text-[11px] leading-snug text-charcoal shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
        {/* Letterhead */}
        <header className="flex items-start justify-between border-b-2 border-navy pb-4">
          <div className="flex items-center gap-3">
            <AwajMark className="h-14 w-14 shrink-0" aria-hidden />
            <div>
              <p className="font-display text-2xl font-bold tracking-tight text-navy">
                Awaj<span className="text-gold"> ET</span>
              </p>
              <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-warmgray">
                Marketing solutions
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-display text-base font-bold uppercase tracking-wide">
              Campaign Statement
            </p>
            <p className="mt-0.5 font-semibold text-amber">{selectedLabel}</p>
            <p className="text-warmgray">
              Period: {since} → {until}
            </p>
            <p className="text-warmgray">Issued: {generated}</p>
          </div>
        </header>

        {/* Client + summary strip */}
        <div className="mt-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-wider text-warmgray">
              Prepared for
            </p>
            <p className="font-display text-base font-bold">{company.name}</p>
          </div>
          <div className="flex flex-wrap justify-end gap-x-5 gap-y-2 text-right">
            {[
              ["Impressions", num(totals.impressions)],
              ["Reach", num(totals.reach)],
              ["Clicks", num(totals.clicks)],
              ["Leads", num(totals.leads)],
              ["Cost / lead", totals.leads ? money(totals.cpl, cur) : "—"],
              ["Calls placed", num(totals.calls)],
              ["Cost / call", totals.calls ? money(totals.costPerCall, cur) : "—"],
              ["Cost / result", totals.results ? money(totals.cpr, cur) : "—"],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-[9px] uppercase tracking-wider text-warmgray">{label}</p>
                <p className="font-display text-sm font-bold tabular-nums">{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Campaigns in this parent group */}
        <table className="mt-5 w-full border-collapse">
          <thead>
            <tr className="border-b border-navy/60 text-[9px] uppercase tracking-wider text-warmgray">
              <th className="py-1.5 pr-2 text-left font-semibold">
                {selectedLabel} — campaigns
              </th>
              <th className={`${cellR} font-semibold`}>Ads</th>
              <th className={`${cellR} font-semibold`}>Impressions</th>
              <th className={`${cellR} font-semibold`}>Reach</th>
              <th className={`${cellR} font-semibold`}>Clicks</th>
              <th className={`${cellR} font-semibold`}>Leads</th>
              <th className={`${cellR} font-semibold`}>Calls</th>
              <th className={`${cellR} font-semibold`}>Ad spend ({cur})</th>
            </tr>
          </thead>
          <tbody>
            {campaignRows.length === 0 && (
              <tr>
                <td colSpan={8} className="py-6 text-center text-warmgray">
                  No campaign activity in this period.
                </td>
              </tr>
            )}
            {campaignRows.map((c) => (
              <tr key={c.id} className="border-b border-line/50">
                <td className="max-w-[55mm] truncate py-1.5 pr-2">{c.name}</td>
                <td className={cellR}>{num(c.ads)}</td>
                <td className={cellR}>{num(c.totals.impressions)}</td>
                <td className={cellR}>{num(c.totals.reach)}</td>
                <td className={cellR}>{num(c.totals.clicks)}</td>
                <td className={cellR}>{num(c.totals.leads)}</td>
                <td className={cellR}>{num(c.totals.calls)}</td>
                <td className={cellR}>{num(c.totals.spend)}</td>
              </tr>
            ))}
            {campaignRows.length > 0 && (
              <tr className="border-b border-line text-[10px] font-semibold">
                <td className="py-1 pr-2 uppercase tracking-wider text-warmgray">
                  Subtotal
                </td>
                <td className={cellR}>{num(adsTotal)}</td>
                <td className={cellR}>{num(totals.impressions)}</td>
                <td className={cellR}>{num(totals.reach)}</td>
                <td className={cellR}>{num(totals.clicks)}</td>
                <td className={cellR}>{num(totals.leads)}</td>
                <td className={cellR}>{num(totals.calls)}</td>
                <td className={cellR}>{num(totals.spend)}</td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Additional charges for this group */}
        {costs.length > 0 && (
          <table className="mt-4 w-full border-collapse">
            <thead>
              <tr className="border-b border-navy/60 text-[9px] uppercase tracking-wider text-warmgray">
                <th className="py-1.5 pr-2 text-left font-semibold">
                  Additional charges
                </th>
                <th className={`${cellR} font-semibold`}>Date</th>
                <th className={`${cellR} font-semibold`}>Amount ({cur})</th>
              </tr>
            </thead>
            <tbody>
              {costs.map((cost) => (
                <tr key={cost.$id} className="border-b border-line/50">
                  <td className="py-1.5 pr-2">
                    {COST_CATEGORY_LABELS[cost.category]}
                    {cost.description && (
                      <span className="text-warmgray"> — {cost.description}</span>
                    )}
                  </td>
                  <td className={`${cellR} font-mono text-[9px]`}>{cost.date}</td>
                  <td className={cellR}>{num(cost.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Totals + taxes */}
        <div className="mt-5 flex justify-end">
          <div className="w-72">
            <div className="flex justify-between border-b border-line/60 py-1">
              <span className="text-warmgray">Ad spend</span>
              <span className="tabular-nums">{money(totals.spend, cur)}</span>
            </div>
            <div className="flex justify-between border-b border-line/60 py-1">
              <span className="text-warmgray">Services</span>
              <span className="tabular-nums">{money(costTotal, cur)}</span>
            </div>
            <div className="flex justify-between border-b border-line/60 py-1 font-semibold">
              <span>Subtotal</span>
              <span className="tabular-nums">{money(subtotal, cur)}</span>
            </div>
            <div className="flex justify-between border-b border-line/60 py-1">
              <span className="text-warmgray">VAT (15%)</span>
              <span className="tabular-nums">{money(vat, cur)}</span>
            </div>
            <div className="flex justify-between border-b border-line/60 py-1 font-bold">
              <span>Total charge</span>
              <span className="tabular-nums">{money(subtotal + vat, cur)}</span>
            </div>
            {wht > 0 && (
              <div className="flex justify-between border-b border-line/60 py-1">
                <span className="text-warmgray">WHT (3%)</span>
                <span className="tabular-nums">−{money(wht, cur)}</span>
              </div>
            )}
            {/* Navy fill on screen; in print, browsers often skip backgrounds,
                so fall back to a heavy-bordered box with dark text. */}
            <div className="mt-1.5 flex items-center justify-between rounded bg-navy px-3 py-2.5 font-display text-base font-bold text-white print:rounded-none print:border-y-4 print:border-navy print:bg-transparent print:text-navy">
              <span className="uppercase tracking-wide">Total payable</span>
              <span className="tabular-nums text-gold print:text-navy">
                {money(totalPayable, cur)}
              </span>
            </div>
            {wht > 0 && (
              <p className="mt-1 text-right text-[8px] text-warmgray">
                3% withholding tax applies to payments above{" "}
                {money(WHT_THRESHOLD, cur)}.
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-6 flex items-end justify-between border-t border-line pt-3 text-[9px] text-warmgray">
          <div>
            <p className="font-semibold text-charcoal">
              Prepared by{" "}
              {company.accountManager
                ? `${company.accountManager} · Awaj ET`
                : "Awaj ET"}
            </p>
            <p>Data from Meta Ads · Figures in {cur}</p>
          </div>
          <p className="font-mono uppercase tracking-[0.18em]">
            Awaj ET · All-in-one marketing solutions · From pitch to profit
          </p>
        </footer>
      </div>
    </div>
  );
}
