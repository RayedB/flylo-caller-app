import { NextResponse } from "next/server";
import { buildSessionUpdate, REALTIME_URL } from "@/lib/agent-session";

export const runtime = "nodejs";

export async function POST() {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "XAI_API_KEY is not configured" },
      { status: 500 },
    );
  }

  const res = await fetch("https://api.x.ai/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      expires_after: { seconds: 600 },
    }),
  });

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

  return NextResponse.json({
    token: data.value,
    expiresAt: data.expires_at,
    url: REALTIME_URL,
    sessionUpdate: buildSessionUpdate(),
  });
}