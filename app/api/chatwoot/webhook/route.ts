import { createHmac, timingSafeEqual } from "node:crypto";
import { after, NextResponse } from "next/server";
import { onTicketResolved, requestCallback } from "@/lib/callbacks";

export const runtime = "nodejs";

const MAX_SKEW_SEC = 300;
const g = globalThis as typeof globalThis & { __flyloSeenDeliveries?: Set<string> };
const seenDeliveries = (g.__flyloSeenDeliveries ??= new Set());

type WebhookPayload = {
  event?: string;
  // message_created
  content?: string | null;
  private?: boolean;
  message_type?: string;
  sender?: { name?: string; type?: string };
  conversation?: { id?: number };
  // conversation_status_changed (the payload is the conversation itself)
  id?: number;
  status?: string;
  labels?: string[];
  custom_attributes?: Record<string, unknown>;
};

/** Chatwoot signs `${timestamp}.${body}` with the webhook secret (HMAC-SHA256). */
function verify(raw: string, ts: string | null, sig: string | null, secret: string) {
  if (!ts || !sig?.startsWith("sha256=")) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > MAX_SKEW_SEC) return false;
  const expected = createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex");
  const a = Buffer.from(sig.slice("sha256=".length), "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Chatwoot account webhook.
 * - message_created: a private note `/callback <what to tell the guest>` rings the guest's phone.
 * - conversation_status_changed → resolved: if the guest asked to hear back, call them
 *   proactively with the agent's latest reply or note as the resolution.
 */
export async function POST(req: Request) {
  const secret = process.env.CHATWOOT_WEBHOOK_SECRET;
  if (!secret) {
    console.error("CHATWOOT_WEBHOOK_SECRET is not set; run `npm run chatwoot:webhook`.");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 503 });
  }

  const raw = await req.text();
  if (!verify(raw, req.headers.get("x-chatwoot-timestamp"), req.headers.get("x-chatwoot-signature"), secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const delivery = req.headers.get("x-chatwoot-delivery");
  if (delivery) {
    if (seenDeliveries.has(delivery)) return NextResponse.json({ ok: true, duplicate: true });
    seenDeliveries.add(delivery);
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(raw) as WebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (payload.event === "conversation_status_changed") {
    const displayId = payload.id;
    if (payload.status !== "resolved" || typeof displayId !== "number") {
      return NextResponse.json({ ok: true, ignored: true });
    }
    after(async () => {
      try {
        await onTicketResolved({
          displayId,
          labels: payload.labels ?? [],
          customAttributes: payload.custom_attributes ?? {},
        });
      } catch (e) {
        console.error(`Resolution callback for #${displayId} failed`, e);
      }
    });
    return NextResponse.json({ ok: true, accepted: true });
  }

  const content = payload.content?.trim() ?? "";
  const match = /^\/callback\b([\s\S]*)$/i.exec(content);
  const displayId = payload.conversation?.id;
  const isAgentNote =
    payload.event === "message_created" &&
    payload.private === true &&
    payload.message_type === "outgoing" &&
    payload.sender?.type === "user";

  if (!isAgentNote || !match || typeof displayId !== "number") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const requestedBy = payload.sender?.name || "Guest Care";
  // Respond to Chatwoot right away; ringing the phone and writing notes happen after.
  after(async () => {
    try {
      await requestCallback({ displayId, message: match[1] ?? "", requestedBy });
    } catch (e) {
      console.error(`Callback for #${displayId} failed`, e);
    }
  });
  return NextResponse.json({ ok: true, accepted: true });
}
