"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import {
  contactName,
  LEAD_STAGES,
  LeadStage,
  LeadWithContact,
  money,
  STAGE_LABELS,
} from "@/lib/domain";
import { moveLeadStage } from "@/app/actions";

const STAGE_ACCENT: Record<LeadStage, string> = {
  new: "border-t-navy",
  contacted: "border-t-navy",
  qualified: "border-t-amber",
  proposal: "border-t-amber",
  won: "border-t-gold",
  lost: "border-t-charcoal/30",
};

const PRIORITIES = ["high", "medium", "low"] as const;

export default function PipelineBoard({ leads }: { leads: LeadWithContact[] }) {
  const [, startTransition] = useTransition();
  const [q, setQ] = useState("");
  const [owner, setOwner] = useState("all");
  const [priority, setPriority] = useState("all");
  const [optimisticLeads, applyMove] = useOptimistic(
    leads,
    (state, { id, stage }: { id: string; stage: LeadStage }) =>
      state.map((l) => (l.$id === id ? { ...l, stage } : l))
  );

  const owners = useMemo(
    () =>
      [...new Set(leads.map((l) => l.owner).filter((o): o is string => !!o))].sort(),
    [leads]
  );

  // Filter the optimistic list rather than the prop: a card that was just
  // dropped must stay in the column the drag put it in.
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return optimisticLeads.filter((l) => {
      if (owner !== "all" && (l.owner ?? "") !== owner) return false;
      if (priority !== "all" && l.priority !== priority) return false;
      if (!needle) return true;
      // Email and phone are searchable even though the card does not show
      // them — "which lead was that number?" is the common question.
      return [
        l.title,
        l.contact?.firstName,
        l.contact?.lastName,
        l.contact?.company,
        l.contact?.email,
        l.contact?.phone,
        l.owner,
        ...(l.services ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [optimisticLeads, q, owner, priority]);

  const filtering = q.trim() !== "" || owner !== "all" || priority !== "all";

  function clear() {
    setQ("");
    setOwner("all");
    setPriority("all");
  }

  function onDrop(e: React.DragEvent, stage: LeadStage) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/lead-id");
    if (!id) return;
    startTransition(async () => {
      applyMove({ id, stage });
      await moveLeadStage(id, stage);
    });
  }

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-lg border border-edge bg-card p-3 md:p-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search title, contact, company, email, phone…"
          className="w-full rounded-md border border-edge bg-input px-3 py-2 text-sm focus:outline-2 focus:outline-gold sm:w-72"
        />
        {owners.length > 0 && (
          <select
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            className="rounded-md border border-edge bg-input px-2 py-2 text-sm"
          >
            <option value="all">All owners</option>
            {owners.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        )}
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="rounded-md border border-edge bg-input px-2 py-2 text-sm"
        >
          <option value="all">All priorities</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p[0].toUpperCase() + p.slice(1)}
            </option>
          ))}
        </select>
        {filtering && (
          <button
            type="button"
            onClick={clear}
            className="rounded-md border border-edge px-3 py-2 text-xs font-semibold text-muted transition hover:border-gold hover:text-amber"
          >
            Clear
          </button>
        )}
        <span className="ml-auto self-center font-mono text-xs text-muted">
          {filtering
            ? `${filtered.length} of ${optimisticLeads.length} shown`
            : `${optimisticLeads.length} leads`}
        </span>
      </div>

      {filtering && filtered.length === 0 && (
        <p className="mt-4 rounded-lg border border-dashed border-edge p-6 text-center text-sm text-muted">
          No leads match. Try a different search, or{" "}
          <button
            type="button"
            onClick={clear}
            className="text-amber underline hover:no-underline"
          >
            clear the filters
          </button>
          .
        </p>
      )}

      <div className="-mx-4 mt-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4 md:mx-0 md:px-0">
        {LEAD_STAGES.map((stage) => {
          const items = filtered.filter((l) => l.stage === stage);
          const total = items.reduce((s, l) => s + (l.value || 0), 0);
          return (
            <div
              key={stage}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDrop(e, stage)}
              className={`flex min-h-[50vh] w-60 shrink-0 snap-start flex-col rounded-lg border border-edge border-t-4 bg-card/60 md:min-h-[60vh] xl:w-auto xl:flex-1 ${STAGE_ACCENT[stage]}`}
            >
              <div className="px-3 pt-3 pb-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] font-medium tracking-[0.12em] uppercase">
                    {STAGE_LABELS[stage]}
                  </span>
                  <span className="rounded-full bg-app px-2 font-mono text-[11px] text-muted">
                    {items.length}
                  </span>
                </div>
                <p className="mt-1 font-mono text-[10px] text-muted">
                  {money(total)}
                </p>
              </div>

              <div className="flex flex-1 flex-col gap-2 p-2">
                {items.map((lead) => (
                  <Link
                    key={lead.$id}
                    href={`/leads/${lead.$id}`}
                    draggable
                    onDragStart={(e) =>
                      e.dataTransfer.setData("text/lead-id", lead.$id)
                    }
                    className="cursor-grab rounded-md border border-edge bg-card p-3 shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing"
                  >
                    <p className="text-[13px] leading-snug font-semibold">
                      {lead.title}
                    </p>
                    <p className="mt-1 text-[12px] text-muted">
                      {contactName(lead.contact)}
                      {lead.contact?.company ? ` · ${lead.contact.company}` : ""}
                    </p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="font-mono text-[11px]">
                        {money(lead.value, lead.currency)}
                      </span>
                      {lead.priority === "high" && (
                        <span className="rounded-sm bg-amber/15 px-1.5 py-0.5 font-mono text-[9px] tracking-wider text-amber uppercase">
                          High
                        </span>
                      )}
                    </div>
                    {lead.nextFollowUpAt && (
                      <p
                        className={`mt-1.5 font-mono text-[10px] ${
                          new Date(lead.nextFollowUpAt) < new Date()
                            ? "text-amber"
                            : "text-muted"
                        }`}
                      >
                        ↳ {new Date(lead.nextFollowUpAt).toLocaleDateString()}
                      </p>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
