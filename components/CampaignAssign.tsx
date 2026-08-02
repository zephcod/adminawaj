"use client";

import { useState, useTransition } from "react";
import { assignCampaign } from "@/app/actions";
import { Select } from "@/components/ui/select";

export default function CampaignAssign({
  campaignId,
  currentCompanyId,
  companies,
}: {
  campaignId: string;
  currentCompanyId: string;
  companies: { value: string; label: string }[];
}) {
  const [value, setValue] = useState(currentCompanyId);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  function onChange(next: string) {
    const previous = value;
    setValue(next);
    setStatus(null);
    startTransition(async () => {
      try {
        const { migrated } = await assignCampaign(campaignId, next);
        setStatus(migrated > 0 ? `Moved (${migrated} rows migrated)` : "Moved");
      } catch (e) {
        setValue(previous);
        setStatus((e as Error).message);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <div className={`w-48 ${pending ? "opacity-60" : ""}`}>
        <Select
          value={value}
          onValueChange={onChange}
          options={companies}
          placeholder="Assign company…"
        />
      </div>
      <span className="min-w-0 truncate text-xs text-muted">
        {pending ? "Moving…" : status}
      </span>
    </div>
  );
}
