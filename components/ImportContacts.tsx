"use client";

import { useState, useTransition } from "react";

type Row = {
  email: string;
  firstName: string;
  lastName?: string;
  company?: string;
  phone?: string;
};

/** Minimal CSV parser handling quoted fields. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

const HEADER_ALIASES: Record<string, keyof Row> = {
  email: "email",
  "email address": "email",
  firstname: "firstName",
  "first name": "firstName",
  first: "firstName",
  lastname: "lastName",
  "last name": "lastName",
  last: "lastName",
  company: "company",
  organization: "company",
  phone: "phone",
  "phone number": "phone",
  mobile: "phone",
};

export default function ImportContacts({
  importContacts,
}: {
  importContacts: (rows: Row[]) => Promise<{ imported: number; skipped: number }>;
}) {
  const [result, setResult] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const grid = parseCsv(String(reader.result ?? ""));
      if (grid.length < 2) {
        setResult("CSV needs a header row and at least one data row.");
        return;
      }
      const header = grid[0].map((h) => h.trim().toLowerCase());
      const cols = header.map((h) => HEADER_ALIASES[h]);
      if (!cols.includes("email") || !cols.includes("firstName")) {
        setResult("CSV must include 'email' and 'first name' columns.");
        return;
      }
      const rows: Row[] = grid.slice(1).map((r) => {
        const obj = {} as Row;
        cols.forEach((key, i) => {
          const val = r[i];
          if (key && val !== undefined) obj[key] = val.trim();
        });
        return obj;
      });
      startTransition(async () => {
        const { imported, skipped } = await importContacts(rows);
        setResult(`Imported ${imported}, skipped ${skipped} (duplicates/invalid).`);
      });
    };
    reader.readAsText(file);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <label className="cursor-pointer rounded-md border border-charcoal/30 px-4 py-2 text-sm font-semibold hover:border-gold hover:text-amber">
        {pending ? "Importing…" : "Import CSV"}
        <input
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          disabled={pending}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
      </label>
      {result && <p className="font-mono text-[11px] text-warmgray">{result}</p>}
    </div>
  );
}
