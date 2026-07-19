import { TEMPLATES } from "@/emails/registry";
import { SendTabs } from "./send-tabs";

export const dynamic = "force-dynamic";

export default function SendPage() {
  const templates = Object.entries(TEMPLATES).map(([key, t]) => ({
    key,
    defaultSubject: t.defaultSubject,
    category: t.category,
    description: t.description,
  }));

  return (
    <div className="mx-auto max-w-4xl">
      <p className="font-mono text-xs tracking-[0.18em] text-amber uppercase">
        Send
      </p>
      <h1 className="mt-1 text-2xl font-bold md:text-3xl">Awaj Email</h1>
      <p className="mt-2 mb-6 max-w-2xl text-sm text-smoke">
        One-off manual sends — from a template, or compose free text with attachments. Both go
        through the same pipeline as the outreach app: suppression check, send logging, and
        unsubscribe headers all apply.
      </p>
      <SendTabs templates={templates} />
    </div>
  );
}
