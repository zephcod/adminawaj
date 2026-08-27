import Link from "next/link";
import { getContacts } from "@/lib/data";
import { getSmsBalance } from "@/lib/sms/afromessage";
import { listSmsCampaigns, listSuppressedPhones } from "@/lib/sms/data";
import SmsTabs from "./sms-tabs";

export const dynamic = "force-dynamic";

export default async function SmsPage() {
  const [contacts, balance, campaigns, suppressedPhones] = await Promise.all([
    getContacts(),
    getSmsBalance(),
    listSmsCampaigns(),
    listSuppressedPhones(),
  ]);

  const recipients = contacts
    .filter((c) => c.phone)
    .map((c) => ({
      id: c.$id,
      name: [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email,
      phone: c.phone as string,
      tags: c.tags,
      optedOut: suppressedPhones.has(c.phone as string),
    }));

  return (
    <div className="mx-auto max-w-4xl">
      <p className="font-mono text-xs tracking-[0.18em] text-amber uppercase">Send</p>
      <h1 className="mt-1 text-2xl font-bold md:text-3xl">Awaj SMS</h1>
      <p className="mt-2 text-sm text-muted">
        Single sends and bulk campaigns via AfroMessage. Every send checks phone
        opt-outs server-side; bulk campaigns require an explicit confirmation
        step before launch.
      </p>

      <div className="mt-4 rounded-lg border border-edge bg-card px-4 py-3 text-sm">
        {balance.ok ? (
          <span>
            Balance: <strong>{balance.data.balance}</strong> · Estimated sends
            remaining: <strong>{balance.data.estimatedMessages}</strong>
            <span className="ml-2 text-xs text-muted">
              (currency per your AfroMessage account)
            </span>
          </span>
        ) : (
          <span className="text-muted">Balance unavailable: {balance.message}</span>
        )}
      </div>

      <div className="mt-6">
        <SmsTabs recipients={recipients} />
      </div>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Campaigns</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-edge bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-edge text-left text-xs tracking-wide text-muted uppercase">
                {["Name", "Status", "Recipients", "Delivered", "Failed", ""].map((h) => (
                  <th key={h} className="px-4 py-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {campaigns.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted">
                    No SMS campaigns yet.
                  </td>
                </tr>
              )}
              {campaigns.map((c) => (
                <tr key={c.$id} className="border-b border-edge/60 last:border-0">
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-fg/10 px-2 py-0.5 text-xs text-muted uppercase">
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">{c.recipientCount}</td>
                  <td className="px-4 py-3 text-green-600">{c.deliveredCount}</td>
                  <td className="px-4 py-3 text-red-600">{c.failedCount}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/sms/${c.$id}`}
                      className="rounded-md border border-edge px-2.5 py-1 text-xs font-medium text-fg transition hover:border-gold hover:text-amber"
                    >
                      Details
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
