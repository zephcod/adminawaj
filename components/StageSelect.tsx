"use client";

import * as Select from "@radix-ui/react-select";
import { useTransition } from "react";
import type { LeadStage } from "@/lib/domain";

interface Props {
  leadId: string;
  current: LeadStage;
  stages: LeadStage[];
  labels: Record<LeadStage, string>;
  moveLeadStage: (leadId: string, stage: LeadStage) => Promise<void>;
}

export default function StageSelect({
  leadId,
  current,
  stages,
  labels,
  moveLeadStage,
}: Props) {
  const [pending, startTransition] = useTransition();

  return (
    <Select.Root
      defaultValue={current}
      disabled={pending}
      onValueChange={(v: string) =>
        startTransition(() => moveLeadStage(leadId, v as LeadStage))
      }
    >
      <Select.Trigger
        aria-label="Stage"
        className="mt-2 flex w-full items-center justify-between rounded-md border border-charcoal/20 bg-white px-2.5 py-2 text-sm outline-none focus:outline-2 focus:outline-gold disabled:opacity-50"
      >
        <Select.Value />
        <Select.Icon className="text-warmgray">▾</Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={4}
          className="z-50 w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-line bg-white shadow-lg"
        >
          <Select.Viewport className="p-1">
            {stages.map((s) => (
              <Select.Item
                key={s}
                value={s}
                className="flex cursor-pointer items-center justify-between rounded px-2.5 py-2 text-sm outline-none select-none data-[highlighted]:bg-mist data-[state=checked]:font-semibold data-[state=checked]:text-amber"
              >
                <Select.ItemText>{labels[s]}</Select.ItemText>
                <Select.ItemIndicator className="text-gold">●</Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
