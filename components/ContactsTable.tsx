"use client";

import { useMemo, useState } from "react";
import { sortTags, tagChipClass } from "@/lib/tags";
import EditContactForm from "./EditContactForm";
import TagEditor from "./TagEditor";

interface Row {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  phone: string;
  jobTitle: string;
  status: string;
  source: string;
  tags: string[];
}

const STATUS_STYLES: Record<string, string> = {
  active: "bg-gold/15 text-amber",
  unsubscribed: "bg-charcoal/10 text-warmgray",
  bounced: "bg-charcoal/10 text-warmgray",
  complained: "bg-charcoal/10 text-warmgray",
};

export default function ContactsTable({
  contacts,
  updateTags,
  updateContact,
}: {
  contacts: Row[];
  updateTags: (contactId: string, tags: string[]) => Promise<void>;
  updateContact: (contactId: string, formData: FormData) => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [source, setSource] = useState("all");
  const [status, setStatus] = useState("all");
  const [activeTags, setActiveTags] = useState<string[]>([]);

  const sources = useMemo(
    () => ["all", ...new Set(contacts.map((c) => c.source))],
    [contacts]
  );

  const allTags = useMemo(
    () => sortTags([...new Set(contacts.flatMap((c) => c.tags))]),
    [contacts]
  );

  function toggleTag(tag: string) {
    setActiveTags((ts) =>
      ts.includes(tag) ? ts.filter((t) => t !== tag) : [...ts, tag]
    );
  }

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return contacts.filter((c) => {
      if (source !== "all" && c.source !== source) return false;
      if (status !== "all" && c.status !== status) return false;
      if (activeTags.length && !activeTags.every((t) => c.tags.includes(t)))
        return false;
      if (!needle) return true;
      return [c.name, c.email, c.company, c.phone, ...c.tags]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [contacts, q, source, status, activeTags]);

  return (
    <div className="rounded-lg border border-line bg-white">
      <div className="flex flex-wrap gap-3 border-b border-line p-3 md:p-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, email, company…"
          className="w-full rounded-md border border-line px-3 py-2 text-sm focus:outline-2 focus:outline-gold sm:w-64"
        />
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="rounded-md border border-line px-2 py-2 text-sm"
        >
          {sources.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "All sources" : s.replace("_", " ")}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-md border border-line px-2 py-2 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="unsubscribed">Unsubscribed</option>
          <option value="bounced">Bounced</option>
          <option value="complained">Complained</option>
        </select>
        <span className="ml-auto self-center font-mono text-xs text-warmgray">
          {filtered.length} shown
        </span>
      </div>

      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-2.5 md:px-4">
          <span className="mr-1 font-mono text-[10px] tracking-[0.12em] text-warmgray uppercase">
            Segments
          </span>
          {allTags.map((t) => {
            const active = activeTags.includes(t);
            return (
              <button
                key={t}
                onClick={() => toggleTag(t)}
                className={`rounded-full px-2.5 py-1 font-mono text-[11px] transition-all ${tagChipClass(t)} ${
                  active
                    ? "ring-2 ring-gold"
                    : activeTags.length
                      ? "opacity-40 hover:opacity-100"
                      : "hover:ring-1 hover:ring-line"
                }`}
              >
                {t}
              </button>
            );
          })}
          {activeTags.length > 0 && (
            <button
              onClick={() => setActiveTags([])}
              className="ml-1 font-mono text-[11px] text-amber hover:underline"
            >
              clear
            </button>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
      <table className="w-full min-w-[920px] text-left text-sm">
        <thead>
          <tr className="border-b-2 border-charcoal">
            {["Name", "Email", "Company", "Phone", "Tags", "Source", "Status", ""].map(
              (h) => (
                <th
                  key={h}
                  className="px-4 py-2.5 font-mono text-[10px] tracking-[0.12em] text-warmgray uppercase"
                >
                  {h}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody>
          {filtered.map((c) => (
            <tr key={c.id} className="border-b border-line last:border-0 hover:bg-mist/50">
              <td className="px-4 py-3 font-medium">{c.name}</td>
              <td className="px-4 py-3 text-warmgray">{c.email}</td>
              <td className="px-4 py-3">{c.company || "—"}</td>
              <td className="px-4 py-3 font-mono text-xs">{c.phone || "—"}</td>
              <td className="px-4 py-3">
                <div className="flex max-w-64 flex-wrap items-center gap-1">
                  {sortTags(c.tags).map((t) => (
                    <span
                      key={t}
                      className={`rounded-full px-2 py-0.5 font-mono text-[10px] ${tagChipClass(t)}`}
                    >
                      {t}
                    </span>
                  ))}
                  <TagEditor
                    name={c.name}
                    tags={c.tags}
                    suggestions={allTags}
                    onSave={(tags) => updateTags(c.id, tags)}
                  />
                </div>
              </td>
              <td className="px-4 py-3">
                <span className="font-mono text-[10px] tracking-wider text-warmgray uppercase">
                  {c.source.replace("_", " ")}
                </span>
              </td>
              <td className="px-4 py-3">
                <span
                  className={`rounded-full px-2 py-0.5 font-mono text-[10px] tracking-wider uppercase ${
                    STATUS_STYLES[c.status] ?? "bg-charcoal/10 text-warmgray"
                  }`}
                >
                  {c.status}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <EditContactForm contact={c} updateContact={updateContact} />
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={8} className="px-4 py-10 text-center text-warmgray">
                No contacts match.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}
