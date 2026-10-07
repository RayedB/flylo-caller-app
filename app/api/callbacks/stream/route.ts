import { connectDevice } from "@/lib/callbacks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 20_000;

/** Server-Sent Events stream the phone keeps open to receive incoming callbacks. */
export async function GET(req: Request) {
  const deviceId = new URL(req.url).searchParams.get("device")?.slice(0, 64);
  if (!deviceId) return new Response("device is required", { status: 400 });

  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      const send = (event: string, data: unknown) =>
        write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

      write("retry: 3000\n\n");
      send("ready", { deviceId });
      const disconnect = connectDevice(deviceId, send);
      const heartbeat = setInterval(() => write(": ping\n\n"), HEARTBEAT_MS);

      cleanup = () => {
        clearInterval(heartbeat);
        disconnect();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      req.signal.addEventListener("abort", () => cleanup(), { once: true });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
