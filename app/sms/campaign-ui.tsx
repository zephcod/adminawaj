"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useMemo, useState, useTransition } from "react";
import { createSmsCampaign } from "@/app/actions";
import { analyzeSegments } from "@/lib/sms/segments";
import type { RecipientOption } from "./sms-tabs";

const inputCls =
  "w-full rounded-md border border-edge bg-input px-3 py-2 text-sm focus:border-gold focus:outline-none";

const RECIPIENT_CAP = 500;

export default function CampaignSmsForm({ recipients }: { recipients: RecipientOption[] }) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [name, setName] = useState("");
  const [senderName, setSenderName] = useState("");
  const [body, setBody] = useState("");
  const [overrideCap, setOverrideCap] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [balance, setBalance] = useState<{ estimatedMessages: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return recipients;
    return recipients.filter((r) =>
      [r.name, r.phone, ...r.tags].join(" ").toLowerCase().includes(needle)
    );
  }, [recipients, q]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const segments = analyzeSegments(body);
  const recipientCount = selected.size;
  const overCap = recipientCount > RECIPIENT_CAP;
  const canReview = !!name && !!senderName && !!body && recipientCount > 0 && (!overCap || overrideCap);

  function openConfirm() {
    if (!canReview) return;
    setConfirmOpen(true);
    fetch("/api/sms/balance")
      .then((r) => (r.ok ? r.json() : null))
      .then(setBalance)
      .catch(() => setBalance(null));
  }

  function submit(formData: FormData) {
    setResult(null);
    startTransition(async () => {
      const r = await createSmsCampaign(formData);
      setResult(r);
      if (r.ok) {
        setConfirmOpen(false);
        setSelected(new Set());
        setBody("");
      }
    });
  }

  const previewRecipients = [...selected]
    .slice(0, 3)
    .map((id) => recipients.find((r) => r.id === id))
    .filter((r): r is RecipientOption => !!r);

  return (
    <div className="max-w-2xl space-y-5">
      <div className="rounded-lg border border-edge bg-card p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Campaign name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Sender name</span>
            <input
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              placeholder="Verified sender"
              className={inputCls}
            />
          </label>
        </div>
        <label className="mt-3 block text-sm">
          <span className="mb-1 block text-muted">Message</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            className={inputCls}
          />
          <p className="mt-1 text-xs text-muted">
            {segments.length} chars · {segments.parts || 0} part
            {segments.parts === 1 ? "" : "s"} · {segments.encoding}
          </p>
        </label>
      </div>

      <div className="rounded-lg border border-edge bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Recipients ({recipientCount} selected)</h3>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, phone, tag…"
            className="w-56 rounded-md border border-edge bg-input px-2.5 py-1.5 text-sm"
          />
        </div>
        <div className="mt-3 max-h-72 overflow-y-auto rounded-md border border-edge">
          {filtered.length === 0 && (
            <p className="p-4 text-center text-sm text-muted">No contacts match.</p>
          )}
          {filtered.map((r) => (
            <label
              key={r.id}
              className={`flex items-center gap-2 border-b border-edge/60 px-3 py-2 text-sm last:border-0 ${
                r.optedOut ? "opacity-40" : "hover:bg-app/50"
              }`}
            >
              <input
                type="checkbox"
                checked={selected.has(r.id)}
                onChange={() => toggle(r.id)}
                disabled={r.optedOut}
                className="accent-gold"
              />
              <span className="flex-1">{r.name}</span>
              {r.optedOut && (
                <span className="rounded-full bg-fg/10 px-2 py-0.5 text-[10px] text-muted uppercase">
                  opted out
                </span>
              )}
              <span className="font-mono text-xs text-muted">{r.phone}</span>
            </label>
          ))}
        </div>
        {overCap && (
          <label className="mt-3 flex items-center gap-2 text-xs text-amber">
            <input
              type="checkbox"
              checked={overrideCap}
              onChange={(e) => setOverrideCap(e.target.checked)}
              className="accent-gold"
            />
            I understand this exceeds the recommended {RECIPIENT_CAP}-recipient cap and want to
            proceed anyway.
          </label>
        )}
      </div>

      {result && (
        <p className={`text-sm ${result.ok ? "text-amber" : "text-red-600"}`}>{result.message}</p>
      )}

      <Dialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
        <button
          type="button"
          onClick={openConfirm}
          disabled={!canReview}
          className="rounded-md bg-gold px-4 py-2 text-sm font-semibold text-navy transition hover:bg-amber disabled:opacity-50"
        >
          Review &amp; launch
        </button>

        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-navy/60 backdrop-blur-sm" />
          <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-xl bg-card p-5 shadow-xl outline-none sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:p-6">
            <Dialog.Title className="text-xl font-semibold">Confirm SMS campaign</Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-muted">
              This will send {recipientCount} real messages. Review before launching.
            </Dialog.Description>

            <div className="mt-4 space-y-1.5 text-sm">
              <p>
                <span className="text-muted">Recipients:</span> {recipientCount}
              </p>
              <p>
                <span className="text-muted">Sender:</span> {senderName}
              </p>
              <p>
                <span className="text-muted">Segments per message:</span> {segments.parts} (
                {segments.encoding})
              </p>
              {balance && (
                <p>
                  <span className="text-muted">Estimated sends remaining:</span>{" "}
                  {balance.estimatedMessages}
                  {Number(balance.estimatedMessages) < recipientCount && (
                    <span className="ml-2 font-semibold text-red-600">
                      — may exceed your balance
                    </span>
                  )}
                </p>
              )}
            </div>

            <div className="mt-4">
              <p className="text-xs font-semibold tracking-wide text-muted uppercase">
                Preview ({previewRecipients.length} of {recipientCount})
              </p>
              <ul className="mt-2 space-y-2">
                {previewRecipients.map((r) => (
                  <li key={r.id} className="rounded-md border border-edge bg-input p-3 text-sm">
                    <span className="block text-xs text-muted">
                      To: {r.name} ({r.phone})
                    </span>
                    {body}
                  </li>
                ))}
              </ul>
            </div>

            <form action={submit} className="mt-5 flex justify-end gap-3">
              <input type="hidden" name="name" value={name} />
              <input type="hidden" name="senderName" value={senderName} />
              <input type="hidden" name="bodyTemplate" value={body} />
              <input type="hidden" name="confirmed" value="on" />
              {overrideCap && <input type="hidden" name="overrideCap" value="on" />}
              {[...selected].map((id) => (
                <input key={id} type="hidden" name="contactIds" value={id} />
              ))}
              <Dialog.Close className="rounded-md px-4 py-2 text-sm text-muted hover:text-fg">
                Cancel
              </Dialog.Close>
              <button
                type="submit"
                disabled={pending}
                className="rounded-md bg-navy px-5 py-2 text-sm font-semibold text-white hover:bg-charcoal disabled:opacity-50"
              >
                {pending ? "Launching…" : "Launch campaign"}
              </button>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
