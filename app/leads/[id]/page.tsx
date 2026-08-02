import Link from "next/link";
import { notFound } from "next/navigation";
import { contactName, LEAD_STAGES, money, STAGE_LABELS } from "@/lib/domain";
import { getActivities, getLead } from "@/lib/data";
import {
  addActivity,
  assignOwner,
  deleteLead,
  markLost,
  moveLeadStage,
  updateFollowUp,
  updateLeadScore,
  updateLeadValue,
} from "@/app/actions";
import ActivityForm from "@/components/ActivityForm";
import DeleteLeadButton from "@/components/DeleteLeadButton";
import StageSelect from "@/components/StageSelect";

export const dynamic = "force-dynamic";

const TYPE_ICONS: Record<string, string> = {
  note: "✎",
  call: "☎",
  email: "✉",
  meeting: "◷",
  task: "☐",
  stage_change: "⇄",
};

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const lead = await getLead(id);
  if (!lead) notFound();
  const activities = await getActivities(id);
  const closed = lead.stage === "won" || lead.stage === "lost";

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link
          href="/pipeline"
          className="font-mono text-xs tracking-wider text-muted hover:text-amber"
        >
          ← Pipeline
        </Link>
        <DeleteLeadButton leadId={lead.$id} leadTitle={lead.title} deleteLead={deleteLead} />
      </div>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs tracking-[0.18em] text-amber uppercase">
            {STAGE_LABELS[lead.stage]}
            {lead.priority === "high" && " · High priority"}
            {lead.score != null && ` · Score ${lead.score}`}
          </p>
          <h1 className="mt-1 text-2xl font-bold md:text-3xl">{lead.title}</h1>
          <p className="mt-2 text-sm text-muted">
            {contactName(lead.contact)}
            {lead.contact?.company ? ` — ${lead.contact.company}` : ""}
            {lead.contact?.email ? ` · ${lead.contact.email}` : ""}
            {lead.contact?.phone ? ` · ${lead.contact.phone}` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-2xl font-bold">
            {money(lead.value, lead.currency)}
          </p>
          {lead.owner && (
            <p className="font-mono text-[11px] text-muted">Owner: {lead.owner}</p>
          )}
        </div>
      </div>

      {/* Stage + follow-up controls */}
      <div className="mt-6 grid gap-4 rounded-lg border border-edge bg-card p-5 md:grid-cols-3">
        <div>
          <p className="font-mono text-[11px] tracking-[0.12em] text-muted uppercase">
            Stage
          </p>
          <StageSelect
            leadId={lead.$id}
            current={lead.stage}
            stages={[...LEAD_STAGES]}
            labels={STAGE_LABELS}
            moveLeadStage={moveLeadStage}
          />
        </div>

        <div>
          <p className="font-mono text-[11px] tracking-[0.12em] text-muted uppercase">
            Next follow-up
          </p>
          <form action={updateFollowUp.bind(null, lead.$id)} className="mt-2 flex gap-2">
            <input
              type="datetime-local"
              name="nextFollowUpAt"
              defaultValue={
                lead.nextFollowUpAt
                  ? new Date(lead.nextFollowUpAt).toISOString().slice(0, 16)
                  : ""
              }
              className="w-full rounded-md border border-edge px-2 py-1.5 text-sm"
            />
            <button className="rounded-md bg-navy px-3 py-1.5 text-xs font-semibold text-white hover:bg-charcoal">
              Set
            </button>
          </form>
        </div>

        <div>
          <p className="font-mono text-[11px] tracking-[0.12em] text-muted uppercase">
            {closed ? "Closed" : "Mark lost"}
          </p>
          {closed ? (
            <p className="mt-2 text-sm">
              {lead.closedAt ? new Date(lead.closedAt).toLocaleDateString() : "—"}
              {lead.lostReason ? ` · ${lead.lostReason}` : ""}
            </p>
          ) : (
            <form action={markLost.bind(null, lead.$id)} className="mt-2 flex gap-2">
              <input
                name="lostReason"
                placeholder="Reason (optional)"
                className="w-full rounded-md border border-edge px-2 py-1.5 text-sm"
              />
              <button className="rounded-md border border-edge px-3 py-1.5 text-xs font-semibold text-muted hover:border-amber hover:text-amber">
                Lost
              </button>
            </form>
          )}
        </div>

        <div>
          <p className="font-mono text-[11px] tracking-[0.12em] text-muted uppercase">
            Price
          </p>
          <form action={updateLeadValue.bind(null, lead.$id)} className="mt-2 flex gap-2">
            <input
              name="value"
              type="number"
              min="0"
              step="1"
              defaultValue={lead.value}
              className="w-full rounded-md border border-edge px-2 py-1.5 text-sm"
            />
            <select
              name="currency"
              defaultValue={lead.currency}
              className="rounded-md border border-edge px-2 py-1.5 text-sm"
            >
              <option>ETB</option>
              <option>USD</option>
            </select>
            <button className="rounded-md bg-navy px-3 py-1.5 text-xs font-semibold text-white hover:bg-charcoal">
              Save
            </button>
          </form>
        </div>

        <div>
          <p className="font-mono text-[11px] tracking-[0.12em] text-muted uppercase">
            Potential score
          </p>
          <form action={updateLeadScore.bind(null, lead.$id)} className="mt-2 flex gap-2">
            <input
              name="score"
              type="number"
              min="0"
              max="100"
              placeholder="0–100"
              defaultValue={lead.score ?? ""}
              className="w-full rounded-md border border-edge px-2 py-1.5 text-sm"
            />
            <button className="rounded-md bg-navy px-3 py-1.5 text-xs font-semibold text-white hover:bg-charcoal">
              Save
            </button>
          </form>
        </div>

        <div>
          <p className="font-mono text-[11px] tracking-[0.12em] text-muted uppercase">
            Project manager
          </p>
          <form action={assignOwner.bind(null, lead.$id)} className="mt-2 flex gap-2">
            <input
              name="owner"
              placeholder="Team member"
              defaultValue={lead.owner ?? ""}
              className="w-full rounded-md border border-edge px-2 py-1.5 text-sm"
            />
            <button className="rounded-md bg-navy px-3 py-1.5 text-xs font-semibold text-white hover:bg-charcoal">
              Assign
            </button>
          </form>
        </div>
      </div>

      {lead.services.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {lead.services.map((s) => (
            <span
              key={s}
              className="rounded-full bg-navy px-3 py-1 font-mono text-[10px] tracking-wider text-gold uppercase"
            >
              {s.replace("_", " ")}
            </span>
          ))}
        </div>
      )}

      {/* Activity */}
      <section className="mt-8">
        <h2 className="text-xl font-semibold">Activity</h2>
        <div className="mt-4">
          <ActivityForm
            addActivity={addActivity.bind(null, lead.$id, lead.contactId)}
          />
        </div>

        <ol className="mt-6 flex flex-col">
          {activities.length === 0 && (
            <p className="text-sm text-muted">No activity yet.</p>
          )}
          {activities.map((a, i) => (
            <li key={a.$id} className="relative flex gap-4 pb-6">
              {i < activities.length - 1 && (
                <span className="absolute top-8 left-[15px] h-full w-px bg-edge" />
              )}
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm ${
                  a.type === "stage_change"
                    ? "bg-gold/15 text-amber"
                    : "bg-navy text-gold"
                }`}
              >
                {TYPE_ICONS[a.type] ?? "•"}
              </span>
              <div className="min-w-0 rounded-lg border border-edge bg-card px-4 py-3">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="font-mono text-[10px] tracking-[0.12em] text-amber uppercase">
                    {a.type.replace("_", " ")}
                  </span>
                  <span className="font-mono text-[10px] text-muted">
                    {new Date(a.occurredAt).toLocaleString()}
                    {a.createdBy ? ` · ${a.createdBy}` : ""}
                  </span>
                </div>
                <p className="mt-1 text-sm whitespace-pre-wrap">{a.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
