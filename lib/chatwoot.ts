type TicketInput = {
  name: string;
  email: string;
  phone?: string;
  pnr?: string;
  summary: string;
  transcript?: string;
  channel: "voice" | "chat";
  /** Browser that opened the ticket, so a later callback rings that phone. */
  deviceId?: string;
  callbackRequested?: boolean;
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

type ContactInbox = { source_id: string; inbox?: { id: number } };
type ContactNode = { id: number; email?: string | null; contact_inboxes?: ContactInbox[] };
type ChatwootConn = { baseUrl: string; accountId: string; inboxId: number; token: string };

async function searchContact(q: string, conn: ChatwootConn, match: (c: ContactNode) => boolean) {
  const res = (await chatwootFetch(
    `/api/v1/accounts/${conn.accountId}/contacts/search?q=${encodeURIComponent(q)}`,
    { method: "GET", baseUrl: conn.baseUrl, token: conn.token },
  )) as { payload?: ContactNode[] };
  return (res.payload ?? []).find(match) ?? null;
}

/**
 * Reuse an existing contact (Chatwoot rejects duplicate email/phone with 422),
 * otherwise create one, then make sure it is attached to the API inbox.
 */
async function findOrCreateContact(input: TicketInput, conn: ChatwootConn) {
  const email = input.email.trim().toLowerCase();
  let contact = await searchContact(email, conn, (c) => c.email?.toLowerCase() === email);

  if (!contact) {
    const payload = {
      inbox_id: conn.inboxId,
      name: input.name,
      email: input.email,
      phone_number: input.phone || undefined,
      custom_attributes: {
        pnr: input.pnr || null,
        channel: input.channel,
        source: `flylo-guest-care-${input.channel}`,
      },
    };
    try {
      const created = (await chatwootFetch(`/api/v1/accounts/${conn.accountId}/contacts`, {
        method: "POST",
        body: JSON.stringify(payload),
        baseUrl: conn.baseUrl,
        token: conn.token,
      })) as { payload?: { contact?: ContactNode } } & Partial<ContactNode>;
      // Chatwoot responses vary: sometimes wrapped in payload.contact
      contact = created.payload?.contact ?? (created as ContactNode);
    } catch (e) {
      // New email but the phone belongs to another contact: reuse that contact.
      const phone = input.phone?.replace(/[^\d+]/g, "");
      if (!phone || !(e instanceof Error) || !e.message.includes("Chatwoot 422")) throw e;
      contact = await searchContact(phone, conn, () => true);
      if (!contact) throw e;
    }
  }

  if (!contact?.id) {
    throw new Error("Chatwoot contact create returned no id");
  }

  let sourceId = contact.contact_inboxes?.find((ci) => ci.inbox?.id === conn.inboxId)?.source_id;
  if (!sourceId) {
    const ci = (await chatwootFetch(
      `/api/v1/accounts/${conn.accountId}/contacts/${contact.id}/contact_inboxes`,
      {
        method: "POST",
        body: JSON.stringify({ inbox_id: conn.inboxId }),
        baseUrl: conn.baseUrl,
        token: conn.token,
      },
    )) as { source_id?: string };
    sourceId = ci.source_id;
  }
  if (!sourceId) {
    throw new Error("Chatwoot did not return a contact inbox source_id");
  }

  return { contactId: contact.id, sourceId };
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

  const { contactId, sourceId } = await findOrCreateContact(input, {
    baseUrl,
    accountId,
    inboxId,
    token,
  });

  const messageContent = [
    input.channel === "chat" ? `Chat Guest Care ticket` : `Voice Guest Care ticket`,
    ``,
    `Guest: ${input.name}`,
    `Email: ${input.email}`,
    input.phone ? `Phone: ${input.phone}` : null,
    input.pnr ? `PNR: ${input.pnr}` : null,
    ``,
    `Summary:`,
    input.summary,
    input.transcript ? `\nCall context:\n${input.transcript}` : null,
    input.callbackRequested
      ? `\nThe guest asked for a call back. Reply with a private note: /callback <what to tell them>`
      : null,
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
          channel: input.channel,
          device_id: input.deviceId || null,
          callback_requested: Boolean(input.callbackRequested),
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

  if (input.callbackRequested && displayId != null) {
    await addLabels(displayId, [CALLBACK_LABEL]).catch((e) =>
      console.error("Chatwoot label failed", e),
    );
  }

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

/* ---------- Callback support ---------- */

export const CALLBACK_LABEL = "callback-requested";

function conn() {
  const { baseUrl, accountId, token } = chatwootConfig();
  return { baseUrl, accountId, token };
}

export function chatwootConfigured() {
  return Boolean(
    process.env.CHATWOOT_BASE_URL &&
      process.env.CHATWOOT_ACCOUNT_ID &&
      process.env.CHATWOOT_USER_ACCESS_TOKEN,
  );
}

/** Internal note on the ticket; guests never see private notes. */
export async function addPrivateNote(displayId: number, content: string) {
  const { baseUrl, accountId, token } = conn();
  await chatwootFetch(`/api/v1/accounts/${accountId}/conversations/${displayId}/messages`, {
    method: "POST",
    body: JSON.stringify({ content, private: true, message_type: "outgoing" }),
    baseUrl,
    token,
  });
}

/** Adds labels without dropping existing ones (the API replaces the full set). */
export async function addLabels(displayId: number, labels: string[]) {
  const { baseUrl, accountId, token } = conn();
  const path = `/api/v1/accounts/${accountId}/conversations/${displayId}/labels`;
  const current = (await chatwootFetch(path, { method: "GET", baseUrl, token })) as {
    payload?: string[];
  };
  const next = Array.from(new Set([...(current.payload ?? []), ...labels]));
  await chatwootFetch(path, {
    method: "POST",
    body: JSON.stringify({ labels: next }),
    baseUrl,
    token,
  });
}

export async function removeLabel(displayId: number, label: string) {
  const { baseUrl, accountId, token } = conn();
  const path = `/api/v1/accounts/${accountId}/conversations/${displayId}/labels`;
  const current = (await chatwootFetch(path, { method: "GET", baseUrl, token })) as {
    payload?: string[];
  };
  if (!current.payload?.includes(label)) return;
  await chatwootFetch(path, {
    method: "POST",
    body: JSON.stringify({ labels: current.payload.filter((l) => l !== label) }),
    baseUrl,
    token,
  });
}

export async function reopenConversation(displayId: number) {
  const { baseUrl, accountId, token } = conn();
  await chatwootFetch(
    `/api/v1/accounts/${accountId}/conversations/${displayId}/toggle_status`,
    { method: "POST", body: JSON.stringify({ status: "open" }), baseUrl, token },
  );
}

export type TicketContext = {
  displayId: number;
  guest: { name: string; email: string | null; phone: string | null };
  pnr: string | null;
  deviceId: string | null;
  /** Guest-visible history plus earlier callback notes, oldest first. */
  history: string[];
};

type CwMessage = {
  content?: string | null;
  private?: boolean;
  message_type?: number;
  created_at?: number;
};

export async function getTicketContext(displayId: number): Promise<TicketContext> {
  const { baseUrl, accountId, token } = conn();
  const convo = (await chatwootFetch(
    `/api/v1/accounts/${accountId}/conversations/${displayId}`,
    { method: "GET", baseUrl, token },
  )) as {
    display_id?: number;
    custom_attributes?: Record<string, unknown>;
    meta?: { sender?: { name?: string; email?: string | null; phone_number?: string | null } };
  };
  const msgs = (await chatwootFetch(
    `/api/v1/accounts/${accountId}/conversations/${displayId}/messages`,
    { method: "GET", baseUrl, token },
  )) as { payload?: CwMessage[] };

  const history = (msgs.payload ?? [])
    .filter((m) => m.content && (m.message_type === 0 || m.message_type === 1))
    // Internal notes stay internal, except the ones this app writes about callbacks.
    .filter((m) => !m.private || /^(📞|🗣️|✅)/u.test(m.content ?? ""))
    .filter((m) => !/^\/callback\b/i.test(m.content ?? ""))
    .sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0))
    .slice(-12)
    .map((m) => (m.content ?? "").trim().slice(0, 1200));

  const attrs = convo.custom_attributes ?? {};
  const sender = convo.meta?.sender ?? {};
  return {
    displayId: convo.display_id ?? displayId,
    guest: {
      name: sender.name || "the guest",
      email: sender.email ?? null,
      phone: sender.phone_number ?? null,
    },
    pnr: typeof attrs.pnr === "string" && attrs.pnr ? attrs.pnr : null,
    deviceId: typeof attrs.device_id === "string" && attrs.device_id ? attrs.device_id : null,
    history,
  };
}

/** Read-merge-write: Chatwoot's custom_attributes endpoint replaces the whole object. */
export async function updateConversationAttributes(
  displayId: number,
  patch: Record<string, unknown>,
) {
  const { baseUrl, accountId, token } = conn();
  const convo = (await chatwootFetch(
    `/api/v1/accounts/${accountId}/conversations/${displayId}`,
    { method: "GET", baseUrl, token },
  )) as { custom_attributes?: Record<string, unknown> };
  const next = { ...(convo.custom_attributes ?? {}), ...patch };
  await chatwootFetch(
    `/api/v1/accounts/${accountId}/conversations/${displayId}/custom_attributes`,
    { method: "POST", body: JSON.stringify({ custom_attributes: next }), baseUrl, token },
  );
}

export type OwedCallbackConversation = {
  displayId: number;
  status: string;
  customAttributes: Record<string, unknown>;
};

/** Tickets that still owe the guest a call back (labelled callback-requested). */
export async function listOwedCallbacks(): Promise<OwedCallbackConversation[]> {
  const { baseUrl, accountId, token } = conn();
  const out: OwedCallbackConversation[] = [];
  for (let page = 1; page <= 4; page++) {
    const res = (await chatwootFetch(
      `/api/v1/accounts/${accountId}/conversations?status=all&page=${page}&labels[]=${encodeURIComponent(CALLBACK_LABEL)}`,
      { method: "GET", baseUrl, token },
    )) as {
      data?: {
        payload?: { id: number; status: string; custom_attributes?: Record<string, unknown> }[];
      };
    };
    const rows = res.data?.payload ?? [];
    out.push(
      ...rows.map((c) => ({
        displayId: c.id,
        status: c.status,
        customAttributes: c.custom_attributes ?? {},
      })),
    );
    if (rows.length < 25) break;
  }
  return out;
}

/** Notes this app writes; never treated as an agent's resolution. */
const APP_NOTE = /^(📞|🗣️|📵|⚠️|✅|⏳|\/callback\b|(Voice|Chat) Guest Care ticket)/iu;

/**
 * The most recent thing an agent wrote on the ticket (reply or private note),
 * used as the resolution when a resolved ticket triggers a callback.
 */
export async function latestAgentResolution(displayId: number) {
  const { baseUrl, accountId, token } = conn();
  const msgs = (await chatwootFetch(
    `/api/v1/accounts/${accountId}/conversations/${displayId}/messages`,
    { method: "GET", baseUrl, token },
  )) as {
    payload?: (CwMessage & { sender?: { name?: string; type?: string } })[];
  };
  // The messages list identifies agents by sender.type ("user"); sender_type is not included.
  const latest = (msgs.payload ?? [])
    .filter((m) => m.message_type === 1 && m.sender?.type === "user")
    .filter((m) => m.content?.trim() && !APP_NOTE.test(m.content.trim()))
    .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))[0];
  return latest
    ? { text: latest.content!.trim(), author: latest.sender?.name || "Guest Care" }
    : null;
}
