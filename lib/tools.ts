import { ALLOWED_TOOLS, type AgentMode, type ToolName } from "@/lib/agent-session";
import { getCallback, recordCallbackUpdate } from "@/lib/callbacks";
import { createSupportTicket } from "@/lib/chatwoot";
import * as flylo from "@/lib/flylo";

function asRecord(args: unknown): Record<string, unknown> {
  if (args && typeof args === "object" && !Array.isArray(args)) {
    return args as Record<string, unknown>;
  }
  return {};
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

export type ToolContext = {
  channel: AgentMode;
  /** Browser that is talking to the agent; stored on new tickets for callbacks. */
  deviceId?: string;
  /** Set during an outbound callback; the server resolves the ticket from it. */
  callbackId?: string;
};

export async function executeTool(
  name: string,
  rawArgs: unknown,
  ctx: ToolContext = { channel: "voice" },
) {
  const { channel, deviceId, callbackId } = ctx;
  if (!ALLOWED_TOOLS.has(name as ToolName)) {
    return { ok: false, error: `Tool not allowed: ${name}` };
  }

  const args = asRecord(rawArgs);

  switch (name as ToolName) {
    case "list_airports":
      return flylo.listAirports();
    case "list_routes":
      return flylo.listRoutes({ from: str(args.from), to: str(args.to) });
    case "search_flights": {
      const from = str(args.from);
      const to = str(args.to);
      const date = str(args.date);
      if (!from || !to || !date) {
        return { ok: false, error: "from, to, and date are required" };
      }
      return flylo.searchFlights({
        from,
        to,
        date,
        pax: num(args.pax),
        cabin: str(args.cabin),
      });
    }
    case "get_flight": {
      const flightId = str(args.flightId);
      if (!flightId) return { ok: false, error: "flightId is required" };
      return flylo.getFlight(flightId);
    }
    case "get_flight_calendar": {
      const from = str(args.from);
      const to = str(args.to);
      const month = str(args.month);
      if (!from || !to || !month) {
        return { ok: false, error: "from, to, and month are required" };
      }
      return flylo.getFlightCalendar({
        from,
        to,
        month,
        cabin: str(args.cabin),
      });
    }
    case "get_booking": {
      const pnr = str(args.pnr);
      if (!pnr) return { ok: false, error: "pnr is required" };
      return flylo.getBooking({ pnr, email: str(args.email) });
    }
    case "create_support_ticket": {
      const name = str(args.name);
      const email = str(args.email);
      const summary = str(args.summary);
      if (!name || !email || !summary) {
        return {
          ok: false,
          error: "name, email, and summary are required",
        };
      }
      try {
        const result = await createSupportTicket({
          name,
          email,
          phone: str(args.phone),
          pnr: str(args.pnr),
          summary,
          transcript: str(args.transcript),
          channel,
          deviceId,
          callbackRequested: args.callback_requested === true,
        });
        return result;
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "Chatwoot error",
        };
      }
    }
    case "add_ticket_update": {
      const cb = callbackId ? getCallback(callbackId) : undefined;
      if (!cb || cb.state !== "answered") {
        return { ok: false, error: "add_ticket_update is only available during a callback" };
      }
      const summary = str(args.summary);
      if (!summary) return { ok: false, error: "summary is required" };
      try {
        return await recordCallbackUpdate(cb.id, {
          summary,
          callbackRequested: args.callback_requested === true,
        });
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Chatwoot error" };
      }
    }
    default:
      return { ok: false, error: `Unhandled tool: ${name}` };
  }
}