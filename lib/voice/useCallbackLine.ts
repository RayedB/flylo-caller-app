"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getDeviceId } from "@/lib/device-id";
import { startRingtone } from "@/lib/voice/ringtone";

export type IncomingCall = {
  id: string;
  displayId: number;
  guestName: string;
  createdAt: number;
};

export type MissedCall = IncomingCall & {
  reason: "missed" | "declined" | "busy" | "dropped";
};

const UNREACHED = new Set(["missed", "declined", "busy", "dropped"]);

async function respond(id: string, action: "declined" | "busy") {
  await fetch(`/api/callbacks/${encodeURIComponent(id)}/respond`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  }).catch(() => {});
}

/**
 * Keeps a Server-Sent Events stream open so Chatwoot can ring this phone.
 * `isBusy` reports whether a voice call is already in progress.
 */
export function useCallbackLine(isBusy: () => boolean) {
  const [connected, setConnected] = useState(false);
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [missed, setMissed] = useState<MissedCall[]>([]);
  const busyRef = useRef(isBusy);
  const seenRef = useRef(new Map<string, IncomingCall>());

  useEffect(() => {
    busyRef.current = isBusy;
  }, [isBusy]);

  useEffect(() => {
    const es = new EventSource(
      `/api/callbacks/stream?device=${encodeURIComponent(getDeviceId())}`,
    );
    es.addEventListener("ready", () => setConnected(true));
    // EventSource reconnects on its own; this only drives the status pill.
    es.onerror = () => setConnected(false);

    es.addEventListener("incoming_call", (e) => {
      const call = JSON.parse((e as MessageEvent<string>).data) as IncomingCall;
      seenRef.current.set(call.id, call);
      if (busyRef.current()) {
        void respond(call.id, "busy");
        return;
      }
      setIncoming((prev) => (prev?.id === call.id ? prev : call));
    });

    // Chatwoot still owes this phone a call (restored after a reload or restart).
    es.addEventListener("missed_call", (e) => {
      const call = JSON.parse((e as MessageEvent<string>).data) as MissedCall;
      seenRef.current.set(call.id, call);
      setMissed((m) =>
        m.some((c) => c.id === call.id || c.displayId === call.displayId)
          ? m
          : [call, ...m].slice(0, 5),
      );
    });

    es.addEventListener("call_ended", (e) => {
      const { id, state } = JSON.parse((e as MessageEvent<string>).data) as {
        id: string;
        state: string;
      };
      setIncoming((prev) => (prev?.id === id ? null : prev));
      const call = seenRef.current.get(id);
      if (!UNREACHED.has(state)) {
        // answered, or replaced by a newer callback on the same ticket
        setMissed((m) => m.filter((c) => c.id !== id));
      } else if (call) {
        const missedCall: MissedCall = { ...call, reason: state as MissedCall["reason"] };
        setMissed((m) => [missedCall, ...m.filter((c) => c.displayId !== call.displayId)].slice(0, 5));
      }
    });

    return () => es.close();
  }, []);

  // Ring while a call is incoming.
  useEffect(() => {
    if (!incoming) return;
    return startRingtone();
  }, [incoming]);

  const decline = useCallback(() => {
    if (!incoming) return;
    setIncoming(null);
    void respond(incoming.id, "declined");
  }, [incoming]);

  /** Clears the ringing screen; the caller then starts the callback session. */
  const takeIncoming = useCallback(() => {
    const call = incoming;
    setIncoming(null);
    return call;
  }, [incoming]);

  return { connected, incoming, missed, decline, takeIncoming };
}
