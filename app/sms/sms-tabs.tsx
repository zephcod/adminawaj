"use client";

import { useState } from "react";
import CampaignSmsForm from "./campaign-ui";
import SingleSmsForm from "./single-ui";

export interface RecipientOption {
  id: string;
  name: string;
  phone: string;
  tags: string[];
  optedOut: boolean;
}

export default function SmsTabs({ recipients }: { recipients: RecipientOption[] }) {
  const [tab, setTab] = useState<"single" | "campaign">("single");

  const tabCls = (active: boolean) =>
    `rounded-md px-4 py-2 text-sm font-medium ${
      active ? "bg-gold text-navy" : "text-muted hover:bg-fg/5 hover:text-fg"
    }`;

  return (
    <div>
      <div className="mb-6 inline-flex gap-1 rounded-lg border border-edge bg-card p-1">
        <button className={tabCls(tab === "single")} onClick={() => setTab("single")}>
          Send single
        </button>
        <button className={tabCls(tab === "campaign")} onClick={() => setTab("campaign")}>
          New campaign
        </button>
      </div>
      {tab === "single" ? (
        <SingleSmsForm recipients={recipients} />
      ) : (
        <CampaignSmsForm recipients={recipients} />
      )}
    </div>
  );
}
