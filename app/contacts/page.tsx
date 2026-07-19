import {
  createContact,
  importContacts,
  updateContact,
  updateContactTags,
} from "@/app/actions";
import { getContacts } from "@/lib/data";
import ContactsTable from "@/components/ContactsTable";
import ImportContacts from "@/components/ImportContacts";
import NewContactForm from "@/components/NewContactForm";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const contacts = await getContacts();

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs tracking-[0.18em] text-amber uppercase">
            Contacts
          </p>
          <h1 className="mt-1 text-2xl font-bold md:text-3xl">All Awaj Contacts</h1>
          <p className="mt-1 text-sm text-warmgray">
            Shared with the email outreach system — {contacts.length} contact
            {contacts.length === 1 ? "" : "s"}.
          </p>
        </div>
        <div className="flex gap-3">
          <ImportContacts importContacts={importContacts} />
          <NewContactForm createContact={createContact} />
        </div>
      </div>

      <div className="mt-8">
        <ContactsTable
          updateTags={updateContactTags}
          updateContact={updateContact}
          contacts={contacts.map((c) => ({
            id: c.$id,
            name: [c.firstName, c.lastName].filter(Boolean).join(" "),
            firstName: c.firstName,
            lastName: c.lastName ?? "",
            email: c.email,
            company: c.company ?? "",
            phone: c.phone ?? "",
            jobTitle: c.jobTitle ?? "",
            status: c.status,
            source: c.source,
            tags: c.tags ?? [],
          }))}
        />
      </div>
    </div>
  );
}
