"use client";

import { useState, useTransition } from "react";
import { runSync } from "@/app/actions";
import type { CompanySyncResult } from "@/lib/sync";

export default function SyncButton({
  companyId,
  label = "Sync from Meta",
  compact = false,
}: {
  companyId?: string;
  label?: string;
  /** Small table-row variant: short status, full detail in the tooltip. */
  compact?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  function onClick() {
    setMessage(null);
    setFailed(false);
    startTransition(async () => {
      try {
        const results: CompanySyncResult[] = await runSync(companyId);
        const errors = results.filter((r) => r.error);
        const rows = results.reduce((n, r) => n + r.created + r.updated, 0);
        const skipped = results.reduce((n, r) => n + r.skippedEdited, 0);
        setFailed(errors.length > 0);
        setMessage(
          errors.length
            ? errors.map((r) => `${r.companyName}: ${r.error}`).join("; ")
            : `Synced ${rows} rows${skipped ? ` (${skipped} edited rows preserved)` : ""}.`
        );
      } catch (e) {
        setFailed(true);
        setMessage((e as Error).message);
      }
    });
  }

  const buttonCls = compact
    ? "rounded border border-amber/40 bg-amber/10 px-2 py-1 text-xs font-medium text-amber transition hover:bg-amber/20 disabled:opacity-60"
    : "rounded-md border border-amber/40 bg-amber/10 px-3 py-1.5 text-sm font-medium text-amber transition hover:bg-amber/20 disabled:opacity-60";

  return (
    <span className="inline-flex items-center gap-2">
      <button onClick={onClick} disabled={pending} className={buttonCls}>
        {pending ? "Syncing…" : label}
      </button>
      {message &&
        (compact ? (
          <span
            title={message}
            className={`cursor-help text-xs ${failed ? "text-red-600" : "text-muted"}`}
          >
            {failed ? "✗ failed" : "✓ done"}
          </span>
        ) : (
          <span className={`text-xs ${failed ? "text-red-600" : "text-muted"}`}>
            {message}
          </span>
        ))}
    </span>
  );
}
