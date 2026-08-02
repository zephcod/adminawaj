"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState, useTransition } from "react";
import { addCompany } from "@/app/actions";

const inputCls =
  "w-full rounded-md border border-edge bg-input px-2.5 py-2 text-sm focus:outline-2 focus:outline-gold";

export default function NewCompanyDialog() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await addCompany(formData);
        setOpen(false);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className="rounded-md bg-gold px-4 py-2 text-sm font-semibold text-navy transition-colors hover:bg-amber hover:text-white">
        + New company
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-navy/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-xl bg-card p-5 shadow-xl outline-none sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:p-6">
          <div className="flex items-start justify-between">
            <Dialog.Title className="text-xl font-semibold">New company</Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="rounded-md p-1.5 text-muted hover:bg-app hover:text-fg"
            >
              ✕
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            Create a new company
          </Dialog.Description>

          <form action={submit} className="mt-4 flex flex-col gap-4">
            <Field label="Company name">
              <input name="name" required className={inputCls} />
            </Field>
            <Field label="Report PIN (4–10 digits)">
              <input
                name="pin"
                required
                pattern="\d{4,10}"
                inputMode="numeric"
                className={inputCls}
              />
            </Field>
            <Field label="Meta ad account ID">
              <input
                name="metaAdAccountId"
                placeholder="act_1234567890"
                className={inputCls}
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Currency">
                <input name="currency" defaultValue="ETB" className={inputCls} />
              </Field>
              <Field label="Contacts “company” value">
                <input name="sourceCompany" className={inputCls} />
              </Field>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="mt-2 flex justify-end gap-3">
              <Dialog.Close className="rounded-md px-4 py-2 text-sm text-muted hover:text-fg">
                Cancel
              </Dialog.Close>
              <button
                type="submit"
                disabled={pending}
                className="rounded-md bg-navy px-5 py-2 text-sm font-semibold text-white hover:bg-charcoal disabled:opacity-50"
              >
                {pending ? "Saving…" : "Create"}
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
      <span className="font-mono text-[11px] tracking-[0.12em] text-muted uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}
