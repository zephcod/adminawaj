"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";

const inputCls =
  "w-full rounded-md border border-charcoal/20 bg-white px-2.5 py-2 text-sm focus:outline-2 focus:outline-gold";

interface Props {
  contacts: { id: string; label: string }[];
  services: string[];
  createLead: (formData: FormData) => Promise<void>;
  defaultContactId?: string;
}

export default function NewLeadForm({
  contacts,
  services,
  createLead,
  defaultContactId,
}: Props) {
  const [open, setOpen] = useState(Boolean(defaultContactId));

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className="rounded-md bg-gold px-4 py-2 text-sm font-semibold text-navy transition-colors hover:bg-amber hover:text-white">
        + New lead
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-navy/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-xl bg-white p-5 shadow-xl outline-none sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:p-6">
          <div className="flex items-start justify-between">
            <Dialog.Title className="text-xl font-semibold">New lead</Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="rounded-md p-1.5 text-warmgray hover:bg-mist hover:text-charcoal"
            >
              ✕
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            Create a new lead
          </Dialog.Description>

          <form
            action={async (fd) => {
              await createLead(fd);
              setOpen(false);
            }}
            className="mt-4 flex flex-col gap-4"
          >
            <Field label="Contact">
              <select
                name="contactId"
                required
                defaultValue={defaultContactId ?? ""}
                className={inputCls}
              >
                <option value="" disabled>
                  Select a contact…
                </option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Title">
              <input
                name="title"
                required
                placeholder="e.g. Q3 paid media retainer"
                className={inputCls}
              />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Estimated value">
                <input name="value" type="number" min="0" defaultValue="0" className={inputCls} />
              </Field>
              <Field label="Currency">
                <select name="currency" defaultValue="ETB" className={inputCls}>
                  <option>ETB</option>
                  <option>USD</option>
                </select>
              </Field>
            </div>

            <Field label="Services">
              <div className="flex flex-wrap gap-2">
                {services.map((s) => (
                  <label
                    key={s}
                    className="flex cursor-pointer items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs has-checked:border-gold has-checked:bg-gold/10"
                  >
                    <input type="checkbox" name="services" value={s} className="accent-[#F0A93B]" />
                    {s.replace("_", " ")}
                  </label>
                ))}
              </div>
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Owner">
                <input name="owner" placeholder="Team member" className={inputCls} />
              </Field>
              <Field label="Priority">
                <select name="priority" defaultValue="medium" className={inputCls}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </Field>
            </div>

            <Field label="Next follow-up">
              <input name="nextFollowUpAt" type="datetime-local" className={inputCls} />
            </Field>

            <div className="mt-2 flex justify-end gap-3">
              <Dialog.Close className="rounded-md px-4 py-2 text-sm text-warmgray hover:text-charcoal">
                Cancel
              </Dialog.Close>
              <button
                type="submit"
                className="rounded-md bg-navy px-5 py-2 text-sm font-semibold text-white hover:bg-charcoal"
              >
                Create lead
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-[11px] tracking-[0.12em] text-warmgray uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}
