import {
  addLabels,
  addPrivateNote,
  CALLBACK_LABEL,
  getTicketContext,
  latestAgentResolution,
  listOwedCallbacks,
  removeLabel,
  reopenConversation,
  updateConversationAttributes,
  type TicketContext,
} from "@/lib/chatwoot";

/**
 * Callback orchestration between Chatwoot and the demo phones.
 *
 * Chatwoot is the durable record of what is owed to a guest:
 * - label `callback-requested`: the guest is waiting for a call back
 * - custom attribute `callback_pending`: an update that still has to be delivered
 *   (survives server restarts, reloads, missed calls; cleared after a real call)
 *
 * This module only keeps live state in memory (connected phones, calls in progress).
 */

export type CallbackState =
  | "ringing"
  | "answered"
  | "declined"
  | "missed"
  | "busy"
  | "dropped"
  | "completed"
  | "undeliverable"
  | "superseded";

type UnreachedReason = "offline" | "ringing" | "missed" | "declined" | "busy" | "dropped";

/** Stored on the Chatwoot conversation as `callback_pending`. */
type PendingCallback = {
  message: string;
  requestedBy: string;
  reason: UnreachedReason;
  kind: CallbackKind;
  at: string;
};

export type CallbackKind = "update" | "resolved";

export type Callback = {
  id: string;
  displayId: number;
  /** What the Guest Care team wants the guest told. */
  message: string;
  requestedBy: string;
  kind: CallbackKind;
  ticket: TicketContext;
  state: CallbackState;
  createdAt: number;
  answeredAt?: number;
  /** The agent promised another call back during this call. */
  promisedAgain?: boolean;
};

/** What the phone may see before answering. */
export type IncomingCallEvent = {
  id: string;
  displayId: number;
  guestName: string;
  createdAt: number;
};

type Connection = { deviceId: string; send: (event: string, data: unknown) => void };

type Hub = {
  connections: Set<Connection>;
  callbacks: Map<string, Callback>;
  syncing: Map<string, Promise<void>>;
};

const RING_TIMEOUT_MS = 35_000;
/** Shorter calls count as dropped: the update stays owed. */
const MIN_DELIVERED_SEC = 10;
const RING_ON_CONNECT: UnreachedReason[] = ["offline", "ringing"];

const g = globalThis as typeof globalThis & { __flyloCallbackHub?: Hub };
const hub: Hub = (g.__flyloCallbackHub ??= {
  connections: new Set(),
  callbacks: new Map(),
  syncing: new Map(),
});
hub.syncing ??= new Map();

function toEvent(cb: Callback): IncomingCallEvent {
  return {
    id: cb.id,
    displayId: cb.displayId,
    guestName: cb.ticket.guest.name,
    createdAt: cb.createdAt,
  };
}

function note(displayId: number, text: string) {
  return addPrivateNote(displayId, text).catch((e) =>
    console.error(`Chatwoot note failed for #${displayId}`, e),
  );
}

function savePending(cb: Callback, reason: UnreachedReason) {
  const pending: PendingCallback = {
    message: cb.message,
    requestedBy: cb.requestedBy,
    reason,
    kind: cb.kind,
    at: new Date().toISOString(),
  };
  return Promise.all([
    updateConversationAttributes(cb.displayId, { callback_pending: pending }),
    addLabels(cb.displayId, [CALLBACK_LABEL]),
  ]).catch((e) => console.error(`Saving pending callback for #${cb.displayId} failed`, e));
}

function parsePending(value: unknown): PendingCallback | null {
  if (!value || typeof value !== "object") return null;
  const p = value as Partial<PendingCallback>;
  return typeof p.message === "string" && p.message
    ? {
        message: p.message,
        requestedBy: p.requestedBy || "Guest Care",
        reason: (p.reason as UnreachedReason) || "offline",
        kind: p.kind === "resolved" ? "resolved" : "update",
        at: p.at || new Date().toISOString(),
      }
    : null;
}

/* ---------- Phone connections ---------- */

function connectedDeviceIds() {
  return new Set([...hub.connections].map((c) => c.deviceId));
}

/**
 * Ring only the phone that opened the ticket; if it is offline the call waits
 * for it. Tickets without a linked phone (created outside the app) ring every
 * connected demo phone.
 */
function targets(cb: Callback) {
  const online = connectedDeviceIds();
  if (cb.ticket.deviceId) return online.has(cb.ticket.deviceId) ? [cb.ticket.deviceId] : [];
  return [...online];
}

function sendTo(deviceIds: string[], event: string, data: unknown) {
  for (const c of hub.connections) {
    if (deviceIds.includes(c.deviceId)) c.send(event, data);
  }
}

function broadcast(event: string, data: unknown) {
  sendTo([...connectedDeviceIds()], event, data);
}

function liveCallbackFor(displayId: number) {
  return [...hub.callbacks.values()].find(
    (c) => c.displayId === displayId && (c.state === "ringing" || c.state === "answered"),
  );
}

export function connectDevice(deviceId: string, send: Connection["send"]) {
  const conn: Connection = { deviceId, send };
  hub.connections.add(conn);
  for (const cb of hub.callbacks.values()) {
    if (cb.state === "ringing" && targets(cb).includes(deviceId)) send("incoming_call", toEvent(cb));
  }
  void syncOwedCallbacks(deviceId, send);
  return () => {
    hub.connections.delete(conn);
  };
}

/**
 * When a phone connects, deliver what Chatwoot says is still owed to it:
 * ring for queued updates, and restore missed callbacks in Recents.
 */
function syncOwedCallbacks(deviceId: string, send: Connection["send"]) {
  const inFlight = hub.syncing.get(deviceId);
  if (inFlight) return inFlight;
  const run = (async () => {
    let owed;
    try {
      owed = await listOwedCallbacks();
    } catch (e) {
      console.error("Listing owed callbacks failed", e);
      return;
    }
    for (const convo of owed) {
      if (convo.customAttributes.device_id !== deviceId) continue;
      const pending = parsePending(convo.customAttributes.callback_pending);
      if (!pending || liveCallbackFor(convo.displayId)) continue;

      const existing = [...hub.callbacks.values()].find(
        (c) => c.displayId === convo.displayId && ["missed", "declined", "busy", "dropped"].includes(c.state),
      );
      if (existing && !RING_ON_CONNECT.includes(pending.reason)) {
        send("missed_call", { ...toEvent(existing), reason: existing.state });
        continue;
      }

      const cb = await createCallback(convo.displayId, pending.message, pending.requestedBy, pending.kind);
      if (RING_ON_CONNECT.includes(pending.reason)) {
        await note(cb.displayId, `📞 ${cb.ticket.guest.name}'s phone is back online. Calling them back now.`);
        ring(cb, [deviceId]);
      } else {
        cb.state = pending.reason as CallbackState;
        send("missed_call", { ...toEvent(cb), reason: pending.reason });
      }
    }
  })().finally(() => hub.syncing.delete(deviceId));
  hub.syncing.set(deviceId, run);
  return run;
}

/* ---------- Callback lifecycle ---------- */

export function getCallback(id: string) {
  return hub.callbacks.get(id);
}

async function createCallback(
  displayId: number,
  message: string,
  requestedBy: string,
  kind: CallbackKind,
) {
  const ticket = await getTicketContext(displayId);
  // A newer callback for the same ticket replaces any unanswered one.
  for (const old of hub.callbacks.values()) {
    if (old.displayId === ticket.displayId && ["ringing", "missed", "declined", "busy", "dropped"].includes(old.state)) {
      old.state = "superseded";
      broadcast("call_ended", { id: old.id, state: "superseded" });
    }
  }
  const cb: Callback = {
    id: crypto.randomUUID(),
    displayId: ticket.displayId,
    message,
    requestedBy,
    kind,
    ticket,
    state: "ringing",
    createdAt: Date.now(),
  };
  hub.callbacks.set(cb.id, cb);
  return cb;
}

function ring(cb: Callback, deviceIds: string[]) {
  cb.state = "ringing";
  sendTo(deviceIds, "incoming_call", toEvent(cb));
  setTimeout(() => {
    if (getCallback(cb.id)?.state === "ringing") void markUnanswered(cb.id, "missed");
  }, RING_TIMEOUT_MS);
}

/** Agent wrote `/callback <message>`, or a resolved ticket triggers one. */
export async function requestCallback(input: {
  displayId: number;
  message: string;
  requestedBy: string;
  kind?: CallbackKind;
}) {
  const message = input.message.trim();
  if (!message) {
    await addPrivateNote(
      input.displayId,
      "⚠️ Callback not placed: add what to tell the guest after the command, e.g. `/callback Your refund was approved and will arrive in 5 days.`",
    );
    return null;
  }
  const live = liveCallbackFor(input.displayId);
  if (live?.state === "answered") {
    await note(input.displayId, "⚠️ A callback on this ticket is in progress. Send /callback again after it ends.");
    return null;
  }

  const cb = await createCallback(input.displayId, message, input.requestedBy, input.kind ?? "update");
  // Persist first, so the promise survives restarts and missed calls.
  await savePending(cb, "ringing");

  const deviceIds = targets(cb);
  if (deviceIds.length === 0) {
    cb.state = "undeliverable";
    await savePending(cb, "offline");
    await note(
      cb.displayId,
      `⏳ ${cb.ticket.guest.name}'s phone isn't connected right now. The callback is queued and will ring as soon as they open the FlyLo app.`,
    );
    return cb;
  }

  const lead =
    cb.kind === "resolved"
      ? `📞 Ticket resolved. Calling ${cb.ticket.guest.name} back proactively with the resolution`
      : `📞 Calling ${cb.ticket.guest.name} back now`;
  await note(cb.displayId, `${lead} (requested by ${cb.requestedBy}).`);
  ring(cb, deviceIds);
  return cb;
}

/** Ticket marked resolved in Chatwoot: call the guest if they asked to hear back. */
export async function onTicketResolved(input: {
  displayId: number;
  labels: string[];
  customAttributes: Record<string, unknown>;
}) {
  const owed =
    input.labels.includes(CALLBACK_LABEL) || input.customAttributes.callback_requested === true;
  if (!owed || liveCallbackFor(input.displayId)) return null;

  const resolution = await latestAgentResolution(input.displayId);
  if (!resolution) {
    await note(
      input.displayId,
      "⚠️ Ticket resolved, but there's no resolution to tell the guest, who asked for a call back. Add a private note: /callback <what to tell them>",
    );
    return null;
  }
  return requestCallback({
    displayId: input.displayId,
    message: resolution.text,
    requestedBy: `${resolution.author} (ticket resolved)`,
    kind: "resolved",
  });
}

/** Guest declined, didn't answer, or was already on a call. The callback stays owed. */
export async function markUnanswered(id: string, state: "declined" | "missed" | "busy") {
  const cb = getCallback(id);
  if (!cb || cb.state !== "ringing") return cb;
  cb.state = state;
  broadcast("call_ended", { id, state });
  await savePending(cb, state);
  const why = {
    declined: "declined the call",
    missed: "didn't answer",
    busy: "was already on another call",
  }[state];
  await note(
    cb.displayId,
    `📵 Callback not connected: ${cb.ticket.guest.name} ${why}. It stays queued: their phone shows a missed call they can return, or send /callback again later.`,
  );
  return cb;
}

/** Answering a ringing call, or returning a missed one from the phone. */
export function answerCallback(id: string) {
  const cb = getCallback(id);
  if (!cb || !["ringing", "missed", "declined", "busy", "dropped"].includes(cb.state)) return null;
  const returned = cb.state !== "ringing";
  cb.state = "answered";
  cb.answeredAt = Date.now();
  broadcast("call_ended", { id, state: "answered" });
  void note(
    cb.displayId,
    returned
      ? `📞 ${cb.ticket.guest.name} returned the missed callback. Connected.`
      : `📞 ${cb.ticket.guest.name} answered the callback.`,
  );
  return cb;
}

/** Written by the voice agent mid-call when the guest raises something new. */
export async function recordCallbackUpdate(
  id: string,
  update: { summary: string; callbackRequested: boolean },
) {
  const cb = getCallback(id);
  if (!cb) throw new Error("Unknown callback");
  const lines = [`🗣️ Update from callback with ${cb.ticket.guest.name}:`, update.summary.trim()];
  if (update.callbackRequested) {
    cb.promisedAgain = true;
    lines.push(
      "",
      "We promised to call them back. Resolve the ticket with your answer to call them automatically, or reply with a private note: /callback <what to tell them>",
    );
  }
  await addPrivateNote(cb.displayId, lines.join("\n"));
  if (update.callbackRequested) {
    await Promise.all([
      addLabels(cb.displayId, [CALLBACK_LABEL]),
      updateConversationAttributes(cb.displayId, { callback_requested: true }),
      reopenConversation(cb.displayId),
    ]);
  }
  return { ok: true as const, displayId: cb.displayId, callbackPromised: update.callbackRequested };
}

export async function completeCallback(
  id: string,
  transcript: { role: string; text: string }[],
) {
  const cb = getCallback(id);
  if (!cb || cb.state !== "answered") return cb;
  const sec = cb.answeredAt ? Math.round((Date.now() - cb.answeredAt) / 1000) : 0;
  const duration = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  const agentSpoke = transcript.some((l) => l.role === "assistant" && l.text.trim());
  const delivered = sec >= MIN_DELIVERED_SEC && agentSpoke;

  const lines = transcript
    .filter((l) => l.text?.trim())
    .slice(-40)
    .map((l) => `${l.role === "user" ? cb.ticket.guest.name : "Guest Care"}: ${l.text.trim()}`);
  const transcriptBlock = ["", "Transcript:", ...(lines.length ? lines : ["(nothing said)"])];

  if (!delivered) {
    cb.state = "dropped";
    broadcast("call_ended", { id, state: "dropped" });
    await savePending(cb, "dropped");
    await note(
      cb.displayId,
      [`📵 Callback dropped after ${duration}, before the update was delivered. It stays queued as a missed call.`, ...transcriptBlock].join("\n"),
    );
    return cb;
  }

  cb.state = "completed";
  // The owed call happened. Keep the label only if another call back was promised.
  await Promise.all([
    updateConversationAttributes(cb.displayId, {
      callback_pending: null,
      callback_requested: Boolean(cb.promisedAgain),
    }),
    // Re-assert rather than assume: the label may have been edited during the call.
    cb.promisedAgain
      ? addLabels(cb.displayId, [CALLBACK_LABEL])
      : removeLabel(cb.displayId, CALLBACK_LABEL),
  ]).catch((e) => console.error(`Clearing callback state for #${cb.displayId} failed`, e));
  await note(
    cb.displayId,
    [
      `✅ Callback completed (${duration}).${cb.promisedAgain ? " Another call back was promised; the ticket stays labelled callback-requested." : ""}`,
      ...transcriptBlock,
    ].join("\n"),
  );
  return cb;
}

export function toBrief(cb: Callback) {
  return {
    displayId: cb.displayId,
    guestName: cb.ticket.guest.name,
    guestEmail: cb.ticket.guest.email,
    guestPhone: cb.ticket.guest.phone,
    pnr: cb.ticket.pnr,
    message: cb.message,
    kind: cb.kind,
    requestedBy: cb.requestedBy,
    history: cb.ticket.history,
  };
}
