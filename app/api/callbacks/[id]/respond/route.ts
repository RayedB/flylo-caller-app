import { NextResponse } from "next/server";
import { markUnanswered } from "@/lib/callbacks";

export const runtime = "nodejs";

const ACTIONS = new Set(["declined", "missed", "busy"]);

/** The phone reports an incoming callback it did not pick up. */
export async function POST(req: Request, ctx: RouteContext<"/api/callbacks/[id]/respond">) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  if (!body.action || !ACTIONS.has(body.action)) {
    return NextResponse.json({ error: "action must be declined, missed, or busy" }, { status: 400 });
  }
  const cb = await markUnanswered(id, body.action as "declined" | "missed" | "busy");
  if (!cb) return NextResponse.json({ error: "Unknown callback" }, { status: 404 });
  return NextResponse.json({ ok: true, state: cb.state });
}
