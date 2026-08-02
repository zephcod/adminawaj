"use client";

import { useState } from "react";
import { ComposeForm } from "./compose-ui";
import { ManualSendForm } from "./ui";

interface TemplateOption {
  key: string;
  defaultSubject: string;
  category: string;
  description: string;
}

export function SendTabs({ templates }: { templates: TemplateOption[] }) {
  const [tab, setTab] = useState<"template" | "compose">("template");

  const tabCls = (active: boolean) =>
    `rounded-md px-4 py-2 text-sm font-medium ${
      active ? "bg-gold text-navy" : "text-muted hover:bg-fg/5 hover:text-fg"
    }`;

  return (
    <div>
      <div className="mb-6 inline-flex gap-1 rounded-lg border border-edge bg-card p-1">
        <button className={tabCls(tab === "template")} onClick={() => setTab("template")}>
          From template
        </button>
        <button className={tabCls(tab === "compose")} onClick={() => setTab("compose")}>
          Compose
        </button>
      </div>
      {tab === "template" ? <ManualSendForm templates={templates} /> : <ComposeForm />}
    </div>
  );
}
