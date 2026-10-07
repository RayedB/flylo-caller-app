import { NextResponse } from "next/server";
import { completeCallback } from "@/lib/callbacks";

export const runtime = "nodejs";

/** The phone hung up a callback; post the transcript to the ticket. */
export async function POST(req: Request, ctx: RouteContext<"/api/callbacks/[id]/complete">) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    transcript?: { role?: unknown; text?: unknown }[];
  };
  const transcript = (Array.isArray(body.transcript) ? body.transcript : [])
    .filter((l) => typeof l?.text === "string" && typeof l?.role === "string")
    .map((l) => ({ role: String(l.role), text: String(l.text).slice(0, 2000) }));
  const cb = await completeCallback(id, transcript);
  if (!cb) return NextResponse.json({ error: "Unknown callback" }, { status: 404 });
  return NextResponse.json({ ok: true, state: cb.state });
}
