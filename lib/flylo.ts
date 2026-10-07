function baseUrl() {
  return (
    process.env.FLYLO_API_BASE_URL?.replace(/\/$/, "") ||
    "https://booking-api.flylo-air.com"
  );
}

function headers(): HeadersInit {
  const h: Record<string, string> = { Accept: "application/json" };
  const key = process.env.FLYLO_API_KEY;
  if (key) h.Authorization = `Bearer ${key}`;
  return h;
}

async function flyloGet(path: string, query?: Record<string, string | undefined>) {
  const url = new URL(path, `${baseUrl()}/`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, v);
    }
  }
  const res = await fetch(url, { headers: headers(), cache: "no-store" });
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    return {
      ok: false as const,
      status: res.status,
      error: body,
    };
  }
  return { ok: true as const, status: res.status, data: body };
}

export async function listAirports() {
  return flyloGet("/v1/airports");
}

export async function listRoutes(args: { from?: string; to?: string }) {
  return flyloGet("/v1/routes", {
    from: args.from?.toUpperCase(),
    to: args.to?.toUpperCase(),
  });
}

export async function searchFlights(args: {
  from: string;
  to: string;
  date: string;
  pax?: number;
  cabin?: string;
}) {
  return flyloGet("/v1/flights/search", {
    from: args.from.toUpperCase(),
    to: args.to.toUpperCase(),
    date: args.date,
    pax: String(args.pax ?? 1),
    cabin: args.cabin?.toUpperCase(),
  });
}

export async function getFlight(flightId: string) {
  return flyloGet(`/v1/flights/${encodeURIComponent(flightId)}`);
}

export async function getFlightCalendar(args: {
  from: string;
  to: string;
  month: string;
  cabin?: string;
}) {
  return flyloGet("/v1/flights/calendar", {
    from: args.from.toUpperCase(),
    to: args.to.toUpperCase(),
    month: args.month,
    cabin: args.cabin?.toUpperCase(),
  });
}

export async function getBooking(args: { pnr: string; email?: string }) {
  const pnr = args.pnr.trim().toUpperCase();
  // Prefer by-pnr; fall back to /v1/bookings/:pnr
  const primary = await flyloGet("/v1/bookings/by-pnr", {
    pnr,
    email: args.email,
  });
  if (primary.ok || primary.status !== 404) return primary;
  return flyloGet(`/v1/bookings/${encodeURIComponent(pnr)}`, {
    email: args.email,
  });
}