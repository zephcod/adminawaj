"use client";

import { useState, useTransition } from "react";
import { saveCampaignParent } from "@/app/actions";

/**
 * Free-text parent-campaign group input. Saves on blur or Enter;
 * `knownParents` feeds a datalist so existing groups autocomplete.
 */
export default function CampaignParentInput({
  campaignId,
  current,
  knownParents,
}: {
  campaignId: string;
  current: string;
  knownParents: string[];
}) {
  const [value, setValue] = useState(current);
  const [saved, setSaved] = useState(current);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  function save() {
    const next = value.trim();
    if (next === saved) return;
    setStatus(null);
    startTransition(async () => {
      try {
        await saveCampaignParent(campaignId, next);
        setSaved(next);
        setStatus("Saved");
      } catch (e) {
        setValue(saved);
        setStatus((e as Error).message);
      }
    });
  }

  const listId = `parents-${campaignId}`;

  return (
    <span className="inline-flex items-center gap-2">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        list={listId}
        placeholder="Parent group…"
        maxLength={256}
        className={`w-40 rounded-md border border-edge bg-input px-3 py-2 text-sm text-fg placeholder:text-muted/60 focus:border-gold focus:outline-none ${
          pending ? "opacity-60" : ""
        }`}
      />
      <datalist id={listId}>
        {knownParents.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      {status && (
        <span className="text-xs text-muted">{pending ? "…" : status}</span>
      )}
    </span>
  );
}
