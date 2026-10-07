import { NextResponse } from "next/server";
import {
  buildSessionUpdate,
  isAgentMode,
  openingPrompt,
  REALTIME_URL,
  type AgentMode,
} from "@/lib/agent-session";
import { answerCallback, getCallback, toBrief } from "@/lib/callbacks";
import { resolveVoice } from "@/lib/voice-config";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let mode: AgentMode = "voice";
  let callbackId: string | null = null;
  try {
    const body = (await req.json()) as { mode?: unknown; callbackId?: unknown };
    if (isAgentMode(body.mode)) mode = body.mode;
    if (typeof body.callbackId === "string") callbackId = body.callbackId;
  } catch {
    /* empty or non-JSON body: default to voice */
  }

  // Callbacks are always voice calls; check before minting so a stale call fails fast.
  if (callbackId) {
    mode = "voice";
    if (!getCallback(callbackId)) {
      return NextResponse.json({ error: "This callback is no longer available" }, { status: 410 });
    }
  }

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "XAI_API_KEY is not configured" },
      { status: 500 },
    );
  }

  // Each token opens one WebSocket, so voice calls get a second one for live captions.
  const mint = () =>
    fetch("https://api.x.ai/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        expires_after: { seconds: 600 },
      }),
    });
  const [res, voice, captionsRes] = await Promise.all([
    mint(),
    resolveVoice(apiKey),
    mode === "voice" ? mint().catch(() => null) : Promise.resolve(null),
  ]);
  const captionsToken = captionsRes?.ok
    ? ((await captionsRes.json()) as { value?: string }).value ?? null
    : null;

  const data = (await res.json()) as {
    value?: string;
    expires_at?: number;
    error?: unknown;
  };

  if (!res.ok || !data.value) {
    return NextResponse.json(
      { error: "Failed to mint ephemeral token", detail: data },
      { status: 502 },
    );
  }

  const callback = callbackId ? answerCallback(callbackId) : null;
  if (callbackId && !callback) {
    return NextResponse.json({ error: "This callback was already answered" }, { status: 409 });
  }
  const brief = callback ? toBrief(callback) : undefined;

  return NextResponse.json({
    token: data.value,
    captionsToken,
    expiresAt: data.expires_at,
    url: REALTIME_URL,
    mode,
    callbackId: callback?.id ?? null,
    openingPrompt: openingPrompt(mode, brief),
    sessionUpdate: buildSessionUpdate(mode, voice, brief),
  });
}