"use client";

import { useState, useTransition } from "react";
import { runMetaLeadSync } from "@/app/actions";
import type { MetaLeadSyncResult } from "@/lib/meta-leads";

/**
 * Manual trigger for the Meta Lead Ads backfill. The webhook delivers leads
 * in real time on its own — this is for catching up after downtime, or for
 * confirming a newly connected Page actually returns leads.
 */
export default function MetaLeadSync({
  companyId,
  label = "Sync Meta leads",
}: {
  companyId?: string;
  label?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  function run() {
    setResult(null);
    startTransition(async () => {
      try {
        const results = await runMetaLeadSync(companyId);
        setResult(summarize(results));
      } catch (e) {
        setResult(e instanceof Error ? e.message : "Sync failed.");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="rounded-md border border-edge px-4 py-2 text-sm font-semibold hover:border-gold hover:text-amber disabled:opacity-50"
      >
        {pending ? "Syncing…" : label}
      </button>
      {result && <p className="font-mono text-[11px] text-muted">{result}</p>}
    </div>
  );
}

function summarize(results: MetaLeadSyncResult[]): string {
  if (results.length === 0) {
    return "No company has a Facebook Page ID set.";
  }
  const total = (pick: (r: MetaLeadSyncResult) => number) =>
    results.reduce((n, r) => n + pick(r), 0);

  const parts = [
    `Imported ${total((r) => r.imported)}`,
    `${total((r) => r.duplicates)} already in`,
  ];
  const failed = total((r) => r.failed);
  if (failed) parts.push(`${failed} failed`);

  // Per-company errors (bad token, page without leads_retrieval) matter more
  // than the counts — surface the first one verbatim.
  const errored = results.filter((r) => r.error);
  const summary = `${parts.join(", ")}.`;
  return errored.length
    ? `${summary} ${errored.length} page(s) errored: ${errored[0].companyName} — ${errored[0].error}`
    : summary;
}
