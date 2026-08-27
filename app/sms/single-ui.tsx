"use client";

import { useMemo, useState, useTransition } from "react";
import { sendSingleSms } from "@/app/actions";
import { Select } from "@/components/ui/select";
import { analyzeSegments } from "@/lib/sms/segments";
import type { RecipientOption } from "./sms-tabs";

const inputCls =
  "w-full rounded-md border border-edge bg-input px-3 py-2 text-sm focus:border-gold focus:outline-none";

export default function SingleSmsForm({ recipients }: { recipients: RecipientOption[] }) {
  const [contactId, setContactId] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const contactOptions = useMemo(
    () =>
      recipients
        .filter((r) => !r.optedOut)
        .map((r) => ({ value: r.id, label: `${r.name} — ${r.phone}` })),
    [recipients]
  );

  function onContactChange(id: string) {
    setContactId(id);
    const contact = recipients.find((r) => r.id === id);
    if (contact) setPhone(contact.phone);
  }

  const segments = analyzeSegments(message);

  function submit(formData: FormData) {
    setResult(null);
    startTransition(async () => {
      const r = await sendSingleSms(formData);
      setResult(r);
      if (r.ok) {
        setMessage("");
      }
    });
  }

  return (
    <form action={submit} className="max-w-xl space-y-4 rounded-lg border border-edge bg-card p-5">
      <input type="hidden" name="contactId" value={contactId} />

      <div>
        <label className="mb-1 block text-xs font-medium text-muted">Contact</label>
        <Select
          value={contactId}
          onValueChange={onContactChange}
          options={contactOptions}
          placeholder="Pick a contact with a phone number…"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted">
          Phone number (auto-filled from contact, or type one directly)
        </label>
        <input
          name="phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+2519XXXXXXXX"
          className={inputCls}
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted">Message</label>
        <textarea
          name="message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          required
          className={inputCls}
        />
        <p className="mt-1 text-xs text-muted">
          {segments.length} chars · {segments.parts || 0} part
          {segments.parts === 1 ? "" : "s"} · {segments.encoding}
        </p>
      </div>

      {result && (
        <p className={`text-sm ${result.ok ? "text-amber" : "text-red-600"}`}>{result.message}</p>
      )}

      <button
        type="submit"
        disabled={pending || !phone || !message}
        className="rounded-md bg-gold px-4 py-2 text-sm font-semibold text-navy transition hover:bg-amber disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send SMS"}
      </button>
    </form>
  );
}
