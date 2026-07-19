"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";

const inputCls =
  "w-full rounded-md border border-charcoal/20 bg-white px-2.5 py-2 text-sm focus:outline-2 focus:outline-gold";

export interface EditableContact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  phone: string;
  jobTitle: string;
  source: string;
  status: string;
}

export default function EditContactForm({
  contact,
  updateContact,
}: {
  contact: EditableContact;
  updateContact: (contactId: string, formData: FormData) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        aria-label={`Edit ${contact.firstName}`}
        className="rounded-md border border-line px-2.5 py-1 font-mono text-[11px] text-warmgray transition-colors hover:border-gold hover:text-amber"
      >
        Edit
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-navy/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-xl bg-white p-5 shadow-xl outline-none sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:p-6">
          <div className="flex items-start justify-between">
            <Dialog.Title className="text-xl font-semibold">
              Edit contact
            </Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="rounded-md p-1.5 text-warmgray hover:bg-mist hover:text-charcoal"
            >
              ✕
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            Edit contact details
          </Dialog.Description>

          <form
            action={async (fd) => {
              await updateContact(contact.id, fd);
              setOpen(false);
            }}
            className="mt-4 flex flex-col gap-4"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="First name">
                <input
                  name="firstName"
                  required
                  defaultValue={contact.firstName}
                  className={inputCls}
                />
              </Field>
              <Field label="Last name">
                <input
                  name="lastName"
                  defaultValue={contact.lastName}
                  className={inputCls}
                />
              </Field>
            </div>
            <Field label="Email">
              <input
                name="email"
                type="email"
                required
                defaultValue={contact.email}
                className={inputCls}
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Company">
                <input
                  name="company"
                  defaultValue={contact.company}
                  className={inputCls}
                />
              </Field>
              <Field label="Phone">
                <input
                  name="phone"
                  type="tel"
                  defaultValue={contact.phone}
                  placeholder="+251 …"
                  className={inputCls}
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Job title">
                <input
                  name="jobTitle"
                  defaultValue={contact.jobTitle}
                  className={inputCls}
                />
              </Field>
              <Field label="Source">
                <select name="source" defaultValue={contact.source} className={inputCls}>
                  <option value="manual">Manual</option>
                  <option value="referral">Referral</option>
                  <option value="website">Website</option>
                  <option value="cold">Cold</option>
                  <option value="lead_magnet">Lead magnet</option>
                  <option value="import">Import</option>
                </select>
              </Field>
            </div>
            <Field label="Status">
              <select name="status" defaultValue={contact.status} className={inputCls}>
                <option value="active">Active</option>
                <option value="unsubscribed">Unsubscribed</option>
                <option value="bounced">Bounced</option>
                <option value="complained">Complained</option>
              </select>
            </Field>

            <div className="mt-2 flex justify-end gap-3">
              <Dialog.Close className="rounded-md px-4 py-2 text-sm text-warmgray hover:text-charcoal">
                Cancel
              </Dialog.Close>
              <button
                type="submit"
                className="rounded-md bg-navy px-5 py-2 text-sm font-semibold text-white hover:bg-charcoal"
              >
                Save changes
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
