/**
 * AfroMessage `createCallback` — POST, fired as each bulk-send message is
 * queued. Body: { campaign_id, message_id, message, to, from, status }.
 *
 * Protected by an unguessable secret embedded in the URL itself (AfroMessage
 * documents no signature/shared-secret header). Must respond fast — the
 * provider's callback policy is one attempt, short timeout.
 */
import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import * as smsData from "@/lib/sms/data";

export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== env.afromessageCallbackSecret()) {
    return new NextResponse("forbidden", { status: 403 });
  }

  let body: {
    campaign_id?: string;
    message_id?: string;
    to?: string;
    status?: string;
  };
  try {
    body = await req.json();
  } catch {
    return new NextResponse("bad request", { status: 400 });
  }
  if (!body.message_id || !body.status) {
    return new NextResponse("bad request", { status: 400 });
  }

  // First time we've seen this message_id: link the pre-created `pending`
  // row (created before the provider ever assigned a message_id) by
  // campaign + phone, so the upsert below can find it by providerMessageId.
  const existing = await smsData.findMessageByProviderId(body.message_id);
  if (!existing && body.campaign_id && body.to) {
    const campaign = await smsData.getSmsCampaignByProviderId(body.campaign_id);
    if (campaign) {
      const pending = await smsData.findPendingMessageByCampaignAndPhone(campaign.$id, body.to);
      if (pending && !pending.providerMessageId) {
        await smsData.setMessageProviderId(pending.$id, body.message_id);
      }
    }
  }

  await smsData.upsertMessageStatus({
    providerMessageId: body.message_id,
    statusRaw: body.status,
    source: "create_callback",
  });

  return new NextResponse("ok", { status: 200 });
}
