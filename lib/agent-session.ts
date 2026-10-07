// Alias tracks the newest think-fast speech-to-speech model.
export const VOICE_MODEL = "grok-voice-think-fast-latest";
/** Built-in voices; anything else is treated as a team custom voice id. */
export const BUILT_IN_VOICES = ["eve", "ara", "rex", "sal", "leo"] as const;
export const DEFAULT_VOICE = "eve";
export const REALTIME_URL = `wss://api.x.ai/v1/realtime?model=${VOICE_MODEL}`;
export const SAMPLE_RATE = 24000;

/** Streaming speech-to-text, used only for live captions of the guest's speech. */
export const LIVE_CAPTIONS_URL = `wss://api.x.ai/v1/stt?${new URLSearchParams([
  ["sample_rate", String(SAMPLE_RATE)],
  ["encoding", "pcm"],
  ["interim_results", "true"],
  ["language", "en"],
  ["keyterm", "FlyLo"],
  ["keyterm", "PNR"],
  ["keyterm", "Linen"],
  ["keyterm", "Prospect"],
  ["keyterm", "Atlas"],
])}`;

/** voice = live mic call; chat = typed turns on the same realtime session. */
export type AgentMode = "voice" | "chat";

export function isAgentMode(value: unknown): value is AgentMode {
  return value === "voice" || value === "chat";
}

const CHANNEL: Record<AgentMode, { personality: string; environment: string; tone: string }> = {
  voice: {
    personality: "You speak in short turns suited to a phone call.",
    environment: "You are on a live voice call with a guest in a browser demo.",
    tone: `Conversational and concise. Confirm IATA codes by saying city names when helpful ("London Heathrow" for LHR). Spell PNRs letter-by-letter when repeating them back. Do not narrate tool use ("let me look that up") more than once per lookup.`,
  },
  chat: {
    personality: "You write short chat messages suited to a messaging app.",
    environment:
      "You are in a text chat with a guest in the FlyLo app (browser demo). The guest types; your replies are shown as chat bubbles. Do not refer to speaking, hearing, or the call.",
    tone: `Conversational and concise: one to three short sentences per message. Write IATA codes with city names when helpful ("London Heathrow (LHR)"). Write PNRs exactly as given, in capitals. When listing several flights, put each on its own line. Do not narrate tool use ("let me look that up") more than once per lookup.`,
  },
};

// The model has no clock; without this it guesses the year for "Oct 20".
function todayLine(now: Date) {
  const tz = "America/Los_Angeles";
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now);
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "long",
  }).format(now);
  return `Today is ${weekday}, ${iso} (Pacific Time). When a guest gives a date without a year, use the next upcoming occurrence of that date.`;
}

/** Ticket context for an outbound callback, built server-side from Chatwoot. */
export type CallbackBrief = {
  displayId: number;
  guestName: string;
  guestEmail: string | null;
  guestPhone: string | null;
  pnr: string | null;
  /** What the Guest Care team wants the guest told. */
  message: string;
  /** "resolved" when Chatwoot resolved the ticket and the message is the resolution. */
  kind: "update" | "resolved";
  requestedBy: string;
  history: string[];
};

function callbackSection(cb: CallbackBrief) {
  const contact = [cb.guestEmail, cb.guestPhone].filter(Boolean).join(", ");
  const history = cb.history.map((h) => `- ${h.replace(/\s+/g, " ")}`).join("\n");
  return `

## Callback (this call)
This is an outbound call: FlyLo Guest Care is calling ${cb.guestName} back about support ticket #${cb.displayId}. The guest answered your call; they did not call you.
Guest on file: ${cb.guestName}${contact ? ` (${contact})` : ""}${cb.pnr ? `, PNR ${cb.pnr}` : ""}.
Why we are calling: ${
    cb.kind === "resolved"
      ? "the guest asked to be called back once this ticket was resolved, and the team has now resolved it."
      : "the Guest Care team has an update on this ticket."
  }
${cb.kind === "resolved" ? "The resolution" : "What to tell the guest"}, from ${cb.requestedBy}. Deliver it accurately and do not add promises it does not contain:
<update>
${cb.message}
</update>
Ticket history, oldest first (context only; do not read it out):
${history || "- (none)"}

Callback flow:
1. In your first turn, greet ${cb.guestName.split(" ")[0]} by first name, say you are calling from FlyLo Guest Care about their ticket${
    cb.kind === "resolved" ? " because it has been resolved" : ""
  }, and deliver the ${cb.kind === "resolved" ? "resolution" : "update"} right away. Do not wait for permission first.
2. Ask whether that answers their question or if there is anything else.
3. Answer follow-up questions with your tools where possible.
4. If the guest raises something new, disputes the outcome, or asks for something only the team can decide, call add_ticket_update with a clear summary. Set callback_requested to true when they want to hear back, then tell them the team will review it and call them back on this number.
5. Before ending, recap what happens next and thank them.`;
}

export function agentInstructions(
  mode: AgentMode,
  now = new Date(),
  callback?: CallbackBrief,
) {
  const c = CHANNEL[mode];
  return `## Personality
You are FlyLo Guest Care, the voice of FlyLo Airlines guest support. You are calm, precise, and warm — the quiet airline's quiet desk. ${c.personality} You never invent schedule, fare, or booking facts.

## Environment
${c.environment} Guest Care hours are daily 06:00–22:00 PT. FlyLo flies a real network from hubs at SFO and LHR with cabins Atlas (A), Prospect (P), and Linen (L). Contact for humans: +1 (415) 580-0707, contact@flylo-air.com.
${todayLine(now)}

## Tone
${c.tone}

## Goal
1. Understand the guest's question.
2. Answer using tools when the question involves airports, routes, dates, flights, calendars, or existing bookings.
3. If you cannot resolve the issue (complaint, IRROPS, missing booking, policy exception, or anything needing a human), collect name, email, phone, PNR if any, and a short summary, then call create_support_ticket. Read back the ticket / conversation id clearly.
4. If the guest wants to hear back once the team has an answer, set callback_requested to true on create_support_ticket and tell them Guest Care will call them back on this device.

## Tools
- list_airports, list_routes, search_flights, get_flight, get_flight_calendar, get_booking — FlyLo booking data. Prefer tools over memory.
- create_support_ticket — opens a Chatwoot support ticket. Use only after collecting contact details and a clear issue summary.${
    callback
      ? "\n- add_ticket_update — adds what the guest said during this callback to its ticket for the team. Use it instead of create_support_ticket for anything about this ticket."
      : ""
  }
Never invent tool results. If a tool fails or finds nothing, say so and offer to open a ticket.

## Critical instructions
- Never invent PNRs, flight numbers, prices, or seat availability.
- Never claim a ticket was created unless create_support_ticket returned success with an id.
- Keep replies brief; put detail into the conversation naturally across turns.${callback ? callbackSection(callback) : ""}
`;
}

const OPENING_PROMPT: Record<AgentMode, string> = {
  voice:
    "The guest just connected on a voice call. Greet them briefly as FlyLo Guest Care and ask how you can help.",
  chat: "The guest just opened the FlyLo Guest Care chat. Greet them in one short message and ask how you can help.",
};

export function openingPrompt(mode: AgentMode, callback?: CallbackBrief) {
  if (callback) {
    return `${callback.guestName} just answered your outbound callback about ticket #${callback.displayId}. Start the call now: greet them by first name, say why you are calling, and deliver the ${callback.kind === "resolved" ? "resolution" : "update"} in this same turn.`;
  }
  return OPENING_PROMPT[mode];
}

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
        callback_requested: {
          type: "boolean",
          description:
            "True when the guest wants Guest Care to call them back once the team has an answer",
        },
      },
      required: ["name", "email", "summary"],
      additionalProperties: false,
    },
  },
];

/** Only offered during an outbound callback; the server knows which ticket. */
export const CALLBACK_TOOLS = [
  {
    type: "function" as const,
    name: "add_ticket_update",
    description:
      "Add something new the guest said during this callback to the ticket, so the Guest Care team sees it. Optionally promise another call back.",
    parameters: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description: "What the guest raised or asked for, written for the team",
        },
        callback_requested: {
          type: "boolean",
          description: "True when the guest wants another call back once the team has an answer",
        },
      },
      required: ["summary", "callback_requested"],
      additionalProperties: false,
    },
  },
];

export function buildSessionUpdate(
  mode: AgentMode = "voice",
  voice: string = DEFAULT_VOICE,
  callback?: CallbackBrief,
) {
  return {
    type: "session.update",
    session: {
      voice,
      instructions: agentInstructions(mode, new Date(), callback),
      // Chat has no mic stream, so turns are driven manually by text.
      turn_detection: mode === "voice" ? { type: "server_vad" } : null,
      tools: callback ? [...FUNCTION_TOOLS, ...CALLBACK_TOOLS] : FUNCTION_TOOLS,
      audio: SESSION_AUDIO,
      replace: {
        FlyLo: "Fly Low",
        LHR: "L H R",
        SFO: "S F O",
      },
    },
  };
}

export type ToolName =
  | (typeof FUNCTION_TOOLS)[number]["name"]
  | (typeof CALLBACK_TOOLS)[number]["name"];

export const ALLOWED_TOOLS = new Set<string>(
  [...FUNCTION_TOOLS, ...CALLBACK_TOOLS].map((t) => t.name),
);
