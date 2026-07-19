"use client";

import { useOptimistic, useTransition } from "react";
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

export default function PipelineBoard({ leads }: { leads: LeadWithContact[] }) {
  const [, startTransition] = useTransition();
  const [optimisticLeads, applyMove] = useOptimistic(
    leads,
    (state, { id, stage }: { id: string; stage: LeadStage }) =>
      state.map((l) => (l.$id === id ? { ...l, stage } : l))
  );

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
    <div className="-mx-4 mt-6 flex snap-x gap-3 overflow-x-auto px-4 pb-4 md:mx-0 md:px-0 lg:mt-8">
      {LEAD_STAGES.map((stage) => {
        const items = optimisticLeads.filter((l) => l.stage === stage);
        const total = items.reduce((s, l) => s + (l.value || 0), 0);
        return (
          <div
            key={stage}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => onDrop(e, stage)}
            className={`flex min-h-[50vh] w-60 shrink-0 snap-start flex-col rounded-lg border border-line border-t-4 bg-white/60 md:min-h-[60vh] xl:w-auto xl:flex-1 ${STAGE_ACCENT[stage]}`}
          >
            <div className="px-3 pt-3 pb-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] font-medium tracking-[0.12em] uppercase">
                  {STAGE_LABELS[stage]}
                </span>
                <span className="rounded-full bg-mist px-2 font-mono text-[11px] text-warmgray">
                  {items.length}
                </span>
              </div>
              <p className="mt-1 font-mono text-[10px] text-warmgray">
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
                  className="cursor-grab rounded-md border border-line bg-white p-3 shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing"
                >
                  <p className="text-[13px] leading-snug font-semibold">
                    {lead.title}
                  </p>
                  <p className="mt-1 text-[12px] text-warmgray">
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
                          : "text-warmgray"
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
  );
}
