export const VOICE_MODEL = "grok-voice-think-fast-2.0";
export const VOICE_NAME = "eve";
export const REALTIME_URL = `wss://api.x.ai/v1/realtime?model=${VOICE_MODEL}`;
export const SAMPLE_RATE = 24000;

export const AGENT_INSTRUCTIONS = `## Personality
You are FlyLo Guest Care, the voice of FlyLo Airlines guest support. You are calm, precise, and warm — the quiet airline's quiet desk. You speak in short turns suited to a phone call. You never invent schedule, fare, or booking facts.

## Environment
You are on a live voice call with a guest in a browser demo. Guest Care hours are daily 06:00–22:00 PT. FlyLo flies a real network from hubs at SFO and LHR with cabins Atlas (A), Prospect (P), and Linen (L). Contact for humans: +1 (415) 580-0707, contact@flylo-air.com.

## Tone
Conversational and concise. Confirm IATA codes by saying city names when helpful ("London Heathrow" for LHR). Spell PNRs letter-by-letter when repeating them back. Do not narrate tool use ("let me look that up") more than once per lookup.

## Goal
1. Understand the guest's question.
2. Answer using tools when the question involves airports, routes, dates, flights, calendars, or existing bookings.
3. If you cannot resolve the issue (complaint, IRROPS, missing booking, policy exception, or anything needing a human), collect name, email, phone, PNR if any, and a short summary, then call create_support_ticket. Read back the ticket / conversation id clearly.

## Tools
- list_airports, list_routes, search_flights, get_flight, get_flight_calendar, get_booking — FlyLo booking data. Prefer tools over memory.
- create_support_ticket — opens a Chatwoot support ticket. Use only after collecting contact details and a clear issue summary.
Never invent tool results. If a tool fails or finds nothing, say so and offer to open a ticket.

## Critical instructions
- Never invent PNRs, flight numbers, prices, or seat availability.
- Never claim a ticket was created unless create_support_ticket returned success with an id.
- Keep spoken replies brief; put detail into the conversation naturally across turns.
`;

export const SESSION_AUDIO = {
  input: {
    format: { type: "audio/pcm" as const, rate: SAMPLE_RATE },
    transcription: {
      keyterms: [
        "FlyLo",
        "PNR",
        "Atlas",
        "Prospect",
        "Linen",
        "LHR",
        "SFO",
        "Guest Care",
      ],
    },
  },
  output: {
    format: { type: "audio/pcm" as const, rate: SAMPLE_RATE },
  },
};

export const FUNCTION_TOOLS = [
  {
    type: "function" as const,
    name: "list_airports",
    description: "List FlyLo airports in the booking catalog.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "list_routes",
    description:
      "List FlyLo routes, optionally filtered by origin and destination IATA codes.",
    parameters: {
      type: "object",
      properties: {
        from: {
          type: "string",
          description: "Origin IATA code (3 letters)",
        },
        to: {
          type: "string",
          description: "Destination IATA code (3 letters)",
        },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "search_flights",
    description:
      "Search dated flights for a route, passenger count, and optional cabin (A/P/L).",
    parameters: {
      type: "object",
      properties: {
        from: { type: "string", description: "Origin IATA" },
        to: { type: "string", description: "Destination IATA" },
        date: {
          type: "string",
          description: "Departure date YYYY-MM-DD",
        },
        pax: {
          type: "integer",
          description: "Passenger count 1-9",
          minimum: 1,
          maximum: 9,
        },
        cabin: {
          type: "string",
          enum: ["A", "P", "L"],
          description: "Cabin code: A Atlas, P Prospect, L Linen",
        },
      },
      required: ["from", "to", "date"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "get_flight",
    description: "Get flight details by flight UUID from search results.",
    parameters: {
      type: "object",
      properties: {
        flightId: { type: "string", description: "Flight UUID" },
      },
      required: ["flightId"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "get_flight_calendar",
    description:
      "Return a month grid of available flight days and starting prices.",
    parameters: {
      type: "object",
      properties: {
        from: { type: "string" },
        to: { type: "string" },
        month: {
          type: "string",
          description: "Month as YYYY-MM",
        },
        cabin: { type: "string", enum: ["A", "P", "L"] },
      },
      required: ["from", "to", "month"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "get_booking",
    description:
      "Load a booking by six-character PNR and the contact email on file.",
    parameters: {
      type: "object",
      properties: {
        pnr: { type: "string", description: "Record locator / PNR" },
        email: {
          type: "string",
          description: "Email on the booking",
        },
      },
      required: ["pnr"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "create_support_ticket",
    description:
      "Create a Chatwoot support ticket after collecting guest contact details and issue summary. Use when the agent cannot resolve the issue.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Guest full name" },
        email: { type: "string", description: "Guest email" },
        phone: { type: "string", description: "Guest phone number" },
        pnr: {
          type: "string",
          description: "Optional booking PNR",
        },
        summary: {
          type: "string",
          description: "Clear summary of the issue for agents",
        },
        transcript: {
          type: "string",
          description: "Optional short transcript or context from the call",
        },
      },
      required: ["name", "email", "summary"],
      additionalProperties: false,
    },
  },
];

export function buildSessionUpdate() {
  return {
    type: "session.update",
    session: {
      voice: VOICE_NAME,
      instructions: AGENT_INSTRUCTIONS,
      turn_detection: { type: "server_vad" },
      tools: FUNCTION_TOOLS,
      audio: SESSION_AUDIO,
      replace: {
        FlyLo: "Fly Low",
        LHR: "L H R",
        SFO: "S F O",
      },
    },
  };
}

export type ToolName = (typeof FUNCTION_TOOLS)[number]["name"];

export const ALLOWED_TOOLS = new Set(
  FUNCTION_TOOLS.map((t) => t.name),
);