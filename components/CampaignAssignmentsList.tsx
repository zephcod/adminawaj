"use client";

import { useMemo, useState } from "react";
import CampaignAssign from "./CampaignAssign";
import CampaignParentInput from "./CampaignParentInput";
import type { ReportCampaign } from "@/lib/domain";

interface Props {
  campaigns: ReportCampaign[];
  options: { value: string; label: string }[];
  companyNames: Record<string, string>;
  knownParents: string[];
}

export default function CampaignAssignmentsList({
  campaigns,
  options,
  companyNames,
  knownParents,
}: Props) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!q) return campaigns;
    return campaigns.filter((c) => {
      const haystack = [
        c.name,
        c.parentCampaign ?? "",
        companyNames[c.companyId] ?? "",
        c.adAccountId ?? "",
        c.objective ?? "",
        c.status ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [campaigns, companyNames, q]);

  // Group the filtered set by ad account.
  const accounts = useMemo(() => {
    const byAccount = new Map<string, ReportCampaign[]>();
    for (const c of filtered) {
      const key = c.adAccountId ?? "Unknown ad account";
      const list = byAccount.get(key) ?? [];
      list.push(c);
      byAccount.set(key, list);
    }
    return [...byAccount.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  return (
    <>
      <div className="relative mb-6">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search campaigns, parent group, company, or ad account…"
          className="w-full rounded-lg border border-edge bg-card py-2.5 pr-10 pl-10 text-sm text-fg shadow-sm placeholder:text-muted/70 focus:border-gold focus:outline-none"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute top-1/2 right-3 -translate-y-1/2 text-muted hover:text-fg"
          >
            ✕
          </button>
        )}
      </div>

      {q && (
        <p className="mb-4 text-xs text-muted">
          {filtered.length} campaign{filtered.length === 1 ? "" : "s"} match “{query}”
        </p>
      )}

      {accounts.length === 0 && (
        <div className="rounded-xl border border-edge bg-card px-6 py-10 text-center text-muted shadow-sm">
          {q ? "No campaigns match your search." : "No campaigns yet — run a sync first."}
        </div>
      )}

      {accounts.map(([account, list]) => {
        const usedBy = [
          ...new Set(list.map((c) => companyNames[c.companyId] ?? "?")),
        ];
        return (
          <section
            key={account}
            className="mb-6 rounded-xl border border-edge bg-card shadow-sm"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-edge px-4 py-4 sm:px-6">
              <h2 className="font-mono text-sm font-semibold">{account}</h2>
              <p className="text-xs text-muted">
                {list.length} campaign{list.length === 1 ? "" : "s"} ·{" "}
                {usedBy.length === 1
                  ? `all assigned to ${usedBy[0]}`
                  : `shared by ${usedBy.join(", ")}`}
              </p>
            </div>
            <ul>
              {list.map((c) => (
                <li
                  key={c.$id}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-edge/60 px-4 py-3 last:border-0 sm:px-6"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{c.name}</p>
                    <p className="text-xs text-muted">
                      {[c.objective, c.status].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <CampaignParentInput
                      campaignId={c.$id}
                      current={c.parentCampaign ?? ""}
                      knownParents={knownParents}
                    />
                    <CampaignAssign
                      campaignId={c.$id}
                      currentCompanyId={c.companyId}
                      companies={options}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}
