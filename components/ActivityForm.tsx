"use client";

import { useRef } from "react";

const TYPES = ["note", "call", "email", "meeting", "task"] as const;

export default function ActivityForm({
  addActivity,
}: {
  addActivity: (formData: FormData) => Promise<void>;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (fd) => {
        await addActivity(fd);
        formRef.current?.reset();
      }}
      className="rounded-lg border border-line bg-white p-4"
    >
      <div className="flex flex-wrap items-center gap-3">
        <select
          name="type"
          defaultValue="note"
          className="rounded-md border border-line px-2 py-1.5 text-sm"
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t[0].toUpperCase() + t.slice(1)}
            </option>
          ))}
        </select>
        <input
          name="createdBy"
          placeholder="Your name (optional)"
          className="rounded-md border border-line px-2 py-1.5 text-sm"
        />
      </div>
      <textarea
        name="body"
        required
        rows={3}
        placeholder="Log a note, call summary, meeting outcome…"
        className="mt-3 w-full rounded-md border border-line px-3 py-2 text-sm focus:outline-2 focus:outline-gold"
      />
      <div className="mt-2 flex justify-end">
        <button className="rounded-md bg-gold px-4 py-1.5 text-sm font-semibold text-navy hover:bg-amber hover:text-white">
          Log activity
        </button>
      </div>
    </form>
  );
}
