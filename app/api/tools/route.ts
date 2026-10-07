import { NextResponse } from "next/server";
import { executeTool } from "@/lib/tools";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { name?: string; arguments?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = body.name;
  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  let args = body.arguments;
  if (typeof args === "string") {
    try {
      args = JSON.parse(args);
    } catch {
      return NextResponse.json(
        { error: "arguments must be valid JSON" },
        { status: 400 },
      );
    }
  }

  try {
    const result = await executeTool(name, args ?? {});
    return NextResponse.json({ name, result });
  } catch (e) {
    return NextResponse.json(
      {
        name,
        result: {
          ok: false,
          error: e instanceof Error ? e.message : "Tool execution failed",
        },
      },
      { status: 500 },
    );
  }
}