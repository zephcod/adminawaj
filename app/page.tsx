import Link from "next/link";
import { contactName, LEAD_STAGES, money, STAGE_LABELS } from "@/lib/domain";
import { getDashboardMetrics } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const m = await getDashboardMetrics();
  const maxStage = Math.max(1, ...Object.values(m.stageCounts));
  const maxSource = Math.max(1, ...m.sourceCounts.map((s) => s.count));

  return (
    <div className="mx-auto max-w-6xl">
      <p className="font-mono text-xs tracking-[0.18em] text-amber uppercase">
        Dashboard
      </p>
      <h1 className="mt-1 text-2xl font-bold md:text-3xl">Awaj status</h1>

      {/* Stat cards */}
      <div className="mt-6 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:gap-4 lg:mt-8 lg:grid-cols-4">
        <StatCard label="Open pipeline" value={money(m.openPipelineValue)} />
        <StatCard label="Won this month" value={money(m.wonValueThisMonth)} accent />
        <StatCard label="Open leads" value={String(m.openLeadCount)} />
        <StatCard label="Active contacts" value={String(m.activeContacts)} />
      </div>

      <div className="mt-6 grid gap-4 md:gap-6 lg:mt-8 lg:grid-cols-2">
        {/* Pipeline by stage */}
        <section className="rounded-lg border border-line bg-white p-6">
          <h3 className="text-lg font-semibold">Pipeline by stage</h3>
          <div className="mt-5 flex flex-col gap-3">
            {LEAD_STAGES.map((stage) => (
              <div key={stage} className="flex items-center gap-3">
                <span className="w-24 font-mono text-[11px] tracking-wider text-warmgray uppercase">
                  {STAGE_LABELS[stage]}
                </span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-mist">
                  <div
                    className={`h-full rounded-full ${
                      stage === "won"
                        ? "bg-gold"
                        : stage === "lost"
                          ? "bg-charcoal/30"
                          : "bg-navy"
                    }`}
                    style={{
                      width: `${(m.stageCounts[stage] / maxStage) * 100}%`,
                    }}
                  />
                </div>
                <span className="w-8 text-right font-mono text-xs text-charcoal">
                  {m.stageCounts[stage]}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Lead sources */}
        <section className="rounded-lg border border-line bg-white p-6">
          <h3 className="text-lg font-semibold">Lead sources</h3>
          {m.sourceCounts.length === 0 ? (
            <Empty text="No leads yet — add your first from the Pipeline page." />
          ) : (
            <div className="mt-5 flex flex-col gap-3">
              {m.sourceCounts.map((s) => (
                <div key={s.source} className="flex items-center gap-3">
                  <span className="w-24 truncate font-mono text-[11px] tracking-wider text-warmgray uppercase">
                    {s.source.replace("_", " ")}
                  </span>
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-mist">
                    <div
                      className="h-full rounded-full bg-amber"
                      style={{ width: `${(s.count / maxSource) * 100}%` }}
                    />
                  </div>
                  <span className="w-8 text-right font-mono text-xs">{s.count}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Overdue follow-ups */}
        <section className="rounded-lg border border-line bg-white p-6">
          <h3 className="text-lg font-semibold">
            Overdue follow-ups
            {m.overdueFollowUps.length > 0 && (
              <span className="ml-2 rounded-full bg-amber px-2 py-0.5 font-mono text-[11px] text-white">
                {m.overdueFollowUps.length}
              </span>
            )}
          </h3>
          {m.overdueFollowUps.length === 0 ? (
            <Empty text="Nothing overdue. Clear skies." />
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {m.overdueFollowUps.slice(0, 6).map((l) => (
                <li key={l.$id}>
                  <Link
                    href={`/leads/${l.$id}`}
                    className="flex items-center justify-between py-3 hover:bg-mist/60"
                  >
                    <div>
                      <p className="text-sm font-medium">{l.title}</p>
                      <p className="text-xs text-warmgray">{contactName(l.contact)}</p>
                    </div>
                    <span className="font-mono text-[11px] text-amber">
                      {new Date(l.nextFollowUpAt!).toLocaleDateString()}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Recent leads */}
        <section className="rounded-lg border border-line bg-white p-6">
          <h3 className="text-lg font-semibold">Recent leads</h3>
          {m.recentLeads.length === 0 ? (
            <Empty text="No leads yet." />
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {m.recentLeads.map((l) => (
                <li key={l.$id}>
                  <Link
                    href={`/leads/${l.$id}`}
                    className="flex items-center justify-between py-3 hover:bg-mist/60"
                  >
                    <div>
                      <p className="text-sm font-medium">{l.title}</p>
                      <p className="text-xs text-warmgray">
                        {contactName(l.contact)}
                        {l.contact?.company ? ` — ${l.contact.company}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-xs">{money(l.value, l.currency)}</p>
                      <p className="font-mono text-[10px] tracking-wider text-warmgray uppercase">
                        {STAGE_LABELS[l.stage]}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-5 ${
        accent ? "border-gold/40 bg-navy text-white" : "border-line bg-white"
      }`}
    >
      <p
        className={`font-mono text-[11px] tracking-[0.14em] uppercase ${
          accent ? "text-gold" : "text-warmgray"
        }`}
      >
        {label}
      </p>
      <p className="font-display mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="mt-4 text-sm text-warmgray">{text}</p>;
}
