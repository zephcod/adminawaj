"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState, useTransition } from "react";
import { emailStatement } from "@/app/actions";

export default function SendStatementButton({
  companyId,
  range,
  parent,
  defaultTo = "",
}: {
  companyId: string;
  range?: string;
  parent: string;
  defaultTo?: string;
}) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(defaultTo);
  const [summary, setSummary] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(
    null
  );

  function send() {
    setResult(null);
    startTransition(async () => {
      const r = await emailStatement({ companyId, to, range, parent, summary });
      setResult(r);
      if (r.ok) setTimeout(() => setOpen(false), 1200);
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button className="rounded-md border border-line bg-white px-4 py-2 text-sm font-medium text-charcoal transition hover:border-gold hover:text-amber print:hidden">
          Send Invoice
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-navy/50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[min(26rem,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-xl">
          <Dialog.Title className="font-display text-lg font-semibold">
            Email statement
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-warmgray">
            Sends a summarized statement for this campaign group to the client.
          </Dialog.Description>
          <label className="mt-4 block text-sm">
            <span className="mb-1 block text-warmgray">Recipient email</span>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="client@example.com"
              autoFocus
              className="w-full rounded-md border border-charcoal/20 bg-white px-3 py-2 text-sm text-charcoal focus:border-gold focus:outline-none"
            />
          </label>
          <label className="mt-3 block text-sm">
            <span className="mb-1 block text-warmgray">
              Summary <span className="text-warmgray/60">(optional — shown at the top of the report)</span>
            </span>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="e.g. Strong month — leads up 30% and cost per lead down. Recommending we scale the top set next month."
              className="w-full rounded-md border border-charcoal/20 bg-white px-3 py-2 text-sm text-charcoal focus:border-gold focus:outline-none"
            />
          </label>
          {result && (
            <p
              className={`mt-3 text-sm ${result.ok ? "text-amber" : "text-red-600"}`}
            >
              {result.message}
            </p>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button className="rounded-md border border-line px-4 py-2 text-sm text-warmgray">
                Cancel
              </button>
            </Dialog.Close>
            <button
              onClick={send}
              disabled={pending}
              className="rounded-md bg-gold px-4 py-2 text-sm font-medium text-navy transition hover:bg-amber disabled:opacity-60"
            >
              {pending ? "Sending…" : "Send statement"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
