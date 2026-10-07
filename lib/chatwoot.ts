type TicketInput = {
  name: string;
  email: string;
  phone?: string;
  pnr?: string;
  summary: string;
  transcript?: string;
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

function chatwootConfig() {
  return {
    baseUrl: requireEnv("CHATWOOT_BASE_URL").replace(/\/$/, ""),
    accountId: requireEnv("CHATWOOT_ACCOUNT_ID"),
    inboxId: Number(requireEnv("CHATWOOT_INBOX_ID")),
    token: requireEnv("CHATWOOT_USER_ACCESS_TOKEN"),
  };
}

async function chatwootFetch(
  path: string,
  init: RequestInit & { token: string; baseUrl: string },
) {
  const res = await fetch(`${init.baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      api_access_token: init.token,
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(
      `Chatwoot ${res.status}: ${typeof body === "object" ? JSON.stringify(body) : text}`,
    );
    throw err;
  }
  return body;
}

export async function createSupportTicket(input: TicketInput) {
  if (!process.env.CHATWOOT_BASE_URL || !process.env.CHATWOOT_USER_ACCESS_TOKEN) {
    return {
      ok: false as const,
      dryRun: true,
      message:
        "Chatwoot env not configured. Set CHATWOOT_BASE_URL, CHATWOOT_ACCOUNT_ID, CHATWOOT_INBOX_ID, CHATWOOT_USER_ACCESS_TOKEN.",
      conversationId: null,
      displayId: null,
    };
  }

  const { baseUrl, accountId, inboxId, token } = chatwootConfig();

  const contactPayload = {
    inbox_id: inboxId,
    name: input.name,
    email: input.email,
    phone_number: input.phone || undefined,
    custom_attributes: {
      pnr: input.pnr || null,
      channel: "voice",
      source: "flylo-guest-care-voice",
    },
  };

  const contact = (await chatwootFetch(
    `/api/v1/accounts/${accountId}/contacts`,
    {
      method: "POST",
      body: JSON.stringify(contactPayload),
      baseUrl,
      token,
    },
  )) as {
    id?: number;
    payload?: {
      contact?: {
        id: number;
        contact_inboxes?: Array<{ source_id: string; inbox?: { id: number } }>;
      };
    };
    contact_inboxes?: Array<{ source_id: string; inbox?: { id: number } }>;
  };

  // Chatwoot responses vary: sometimes wrapped in payload.contact
  const contactNode = contact.payload?.contact ?? (contact as {
    id: number;
    contact_inboxes?: Array<{ source_id: string; inbox?: { id: number } }>;
  });
  const contactId = contactNode.id;
  const inboxes = contactNode.contact_inboxes || [];
  const inboxMatch =
    inboxes.find((ci) => ci.inbox?.id === inboxId) || inboxes[0];
  const sourceId =
    inboxMatch?.source_id ||
    `voice-${input.email}-${Date.now()}`;

  if (!contactId) {
    throw new Error("Chatwoot contact create returned no id");
  }

  const messageContent = [
    `Voice Guest Care ticket`,
    ``,
    `Guest: ${input.name}`,
    `Email: ${input.email}`,
    input.phone ? `Phone: ${input.phone}` : null,
    input.pnr ? `PNR: ${input.pnr}` : null,
    ``,
    `Summary:`,
    input.summary,
    input.transcript ? `\nCall context:\n${input.transcript}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const conversation = (await chatwootFetch(
    `/api/v1/accounts/${accountId}/conversations`,
    {
      method: "POST",
      body: JSON.stringify({
        source_id: sourceId,
        inbox_id: inboxId,
        contact_id: contactId,
        status: "open",
        custom_attributes: {
          pnr: input.pnr || null,
          channel: "voice",
        },
        message: {
          content: messageContent,
        },
      }),
      baseUrl,
      token,
    },
  )) as { id?: number; display_id?: number };

  const conversationId = conversation.id ?? null;
  const displayId = conversation.display_id ?? conversation.id ?? null;

  // Fallback when Chatwoot webhooks cannot reach the host triage service.
  const triageUrl = process.env.TRIAGE_FALLBACK_URL;
  if (triageUrl && conversationId != null) {
    try {
      await fetch(triageUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          displayId,
          contactName: input.name,
          contactEmail: input.email,
          contactPhone: input.phone ?? null,
          pnr: input.pnr ?? null,
          summary: messageContent,
        }),
      });
    } catch (e) {
      console.error("TRIAGE_FALLBACK_URL notify failed", e);
    }
  }

  return {
    ok: true as const,
    dryRun: false,
    conversationId,
    displayId,
    contactId,
    sourceId,
  };
}