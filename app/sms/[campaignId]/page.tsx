import Link from "next/link";
import { notFound } from "next/navigation";
import { getSmsCampaign, getSmsMessagesForCampaign } from "@/lib/sms/data";

export const dynamic = "force-dynamic";

export default async function SmsCampaignPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  const campaign = await getSmsCampaign(campaignId);
  if (!campaign) notFound();

  const messages = await getSmsMessagesForCampaign(campaignId);
  const pendingCount = messages.filter((m) => m.state === "pending" || m.state === "queued").length;
  const totalCost = messages.reduce((n, m) => n + m.cost, 0);

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/sms" className="text-sm text-muted hover:text-fg">
        ← SMS
      </Link>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">{campaign.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {campaign.status} · sender {campaign.senderName}
          </p>
        </div>
        <div className="flex gap-4 text-sm">
          <span className="text-green-600">{campaign.deliveredCount} delivered</span>
          <span className="text-red-600">{campaign.failedCount} failed</span>
          <span className="text-muted">{pendingCount} pending</span>
        </div>
      </div>

      <p className="mt-2 text-sm text-muted">Total cost so far: {totalCost.toFixed(2)}</p>

      <div className="mt-6 overflow-x-auto rounded-xl border border-edge bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-edge text-left text-xs tracking-wide text-muted uppercase">
              {["To", "State", "Provider status", "Parts", "Cost", "Updated"].map((h) => (
                <th key={h} className="px-4 py-3 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {messages.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted">
                  No messages yet.
                </td>
              </tr>
            )}
            {messages.map((m) => (
              <tr key={m.$id} className="border-b border-edge/60 last:border-0">
                <td className="px-4 py-3 font-mono text-xs">{m.toNumber}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs uppercase ${
                      m.state === "delivered"
                        ? "bg-gold/15 text-amber"
                        : m.state === "failed"
                          ? "bg-red-600/10 text-red-600"
                          : "bg-fg/10 text-muted"
                    }`}
                  >
                    {m.state}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted">{m.providerStatusRaw ?? "—"}</td>
                <td className="px-4 py-3">{m.parts || "—"}</td>
                <td className="px-4 py-3">{m.cost ? m.cost.toFixed(2) : "—"}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted">
                  {new Date(m.$updatedAt).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
