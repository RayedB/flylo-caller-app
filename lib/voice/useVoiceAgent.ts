"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SAMPLE_RATE } from "@/lib/agent-session";
import { base64PCM16ToFloat32, float32ToBase64PCM16 } from "@/lib/voice/pcm";

export type CallStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";

export type TranscriptLine = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
};

export type TicketBanner = {
  conversationId: number | null;
  displayId: number | null;
};

type SessionResponse = {
  token: string;
  url: string;
  sessionUpdate: unknown;
};

export function useVoiceAgent() {
  const [status, setStatus] = useState<CallStatus>("idle");
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [ticket, setTicket] = useState<TicketBanner | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const playTimeRef = useRef(0);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const mutedRef = useRef(false);
  const callStartedAtRef = useRef<number | null>(null);
  const pendingToolCallsRef = useRef(0);
  const assistantBufRef = useRef("");
  const userBufRef = useRef("");

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    if (status === "idle" || status === "error" || status === "connecting") {
      return;
    }
    const id = window.setInterval(() => {
      if (callStartedAtRef.current) {
        setElapsedSec(
          Math.floor((Date.now() - callStartedAtRef.current) / 1000),
        );
      }
    }, 500);
    return () => window.clearInterval(id);
  }, [status]);

  const pushTranscript = useCallback(
    (role: TranscriptLine["role"], text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setTranscript((prev) => [
        ...prev,
        { id: `${Date.now()}-${Math.random()}`, role, text: trimmed },
      ]);
    },
    [],
  );

  const stopPlayback = useCallback(() => {
    for (const src of sourcesRef.current) {
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
    }
    sourcesRef.current = [];
    playTimeRef.current = 0;
  }, []);

  const cleanup = useCallback(() => {
    stopPlayback();
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    processorRef.current = null;
    sourceRef.current = null;

    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;

    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        /* ignore */
      }
      wsRef.current = null;
    }

    callStartedAtRef.current = null;
    pendingToolCallsRef.current = 0;
    assistantBufRef.current = "";
    userBufRef.current = "";
  }, [stopPlayback]);

  const hangUp = useCallback(() => {
    cleanup();
    setStatus("idle");
    setMuted(false);
  }, [cleanup]);

  const playPcmChunk = useCallback(
    (base64: string) => {
      const ctx = audioContextRef.current;
      if (!ctx) return;
      const float32 = base64PCM16ToFloat32(base64);
      const buffer = ctx.createBuffer(1, float32.length, SAMPLE_RATE);
      buffer.copyToChannel(Float32Array.from(float32), 0);

      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);

      const now = ctx.currentTime;
      if (playTimeRef.current < now) playTimeRef.current = now + 0.05;
      src.start(playTimeRef.current);
      playTimeRef.current += buffer.duration;
      sourcesRef.current.push(src);
      src.onended = () => {
        sourcesRef.current = sourcesRef.current.filter((s) => s !== src);
        if (sourcesRef.current.length === 0 && wsRef.current) {
          setStatus((s) => (s === "speaking" ? "listening" : s));
        }
      };
      setStatus("speaking");
    },
    [],
  );

  const handleFunctionCall = useCallback(
    async (callId: string, name: string, argString: string) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      setStatus("thinking");
      pendingToolCallsRef.current += 1;

      let args: unknown = {};
      try {
        args = argString ? JSON.parse(argString) : {};
      } catch {
        args = {};
      }

      let result: unknown;
      try {
        const res = await fetch("/api/tools", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, arguments: args }),
        });
        const json = await res.json();
        result = json.result ?? json;

        if (name === "create_support_ticket" && result && typeof result === "object") {
          const r = result as unknown as {
            ok?: boolean;
            conversationId?: number | null;
            displayId?: number | null;
          };
          if (r.ok) {
            setTicket({
              conversationId: r.conversationId ?? null,
              displayId: r.displayId ?? null,
            });
          }
        }
      } catch (e) {
        result = {
          ok: false,
          error: e instanceof Error ? e.message : "Tool request failed",
        };
      }

      if (ws.readyState !== WebSocket.OPEN) return;

      ws.send(
        JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: callId,
            output: JSON.stringify(result),
          },
        }),
      );

      pendingToolCallsRef.current -= 1;
      if (pendingToolCallsRef.current <= 0) {
        pendingToolCallsRef.current = 0;
        ws.send(JSON.stringify({ type: "response.create" }));
      }
    },
    [],
  );

  const onServerEvent = useCallback(
    (event: Record<string, unknown>) => {
      const type = String(event.type || "");

      if (type === "input_audio_buffer.speech_started") {
        stopPlayback();
        setStatus("listening");
        return;
      }

      if (type === "response.output_audio.delta" && typeof event.delta === "string") {
        playPcmChunk(event.delta);
        return;
      }

      if (
        type === "response.output_audio_transcript.delta" &&
        typeof event.delta === "string"
      ) {
        assistantBufRef.current += event.delta;
        return;
      }

      if (type === "response.output_audio_transcript.done") {
        pushTranscript("assistant", assistantBufRef.current);
        assistantBufRef.current = "";
        return;
      }

      if (
        (type === "conversation.item.input_audio_transcription.completed" ||
          type === "conversation.item.input_audio_transcription.done") &&
        typeof event.transcript === "string"
      ) {
        pushTranscript("user", event.transcript);
        userBufRef.current = "";
        return;
      }

      if (
        type === "response.function_call_arguments.done" &&
        typeof event.name === "string"
      ) {
        const callId = String(event.call_id || event.id || "");
        const args =
          typeof event.arguments === "string" ? event.arguments : "{}";
        void handleFunctionCall(callId, event.name, args);
        return;
      }

      if (type === "response.done" || type === "response.completed") {
        if (assistantBufRef.current) {
          pushTranscript("assistant", assistantBufRef.current);
          assistantBufRef.current = "";
        }
        setStatus((s) => (s === "thinking" ? "listening" : s));
        return;
      }

      if (type === "error") {
        const msg =
          typeof event.error === "object" &&
          event.error &&
          "message" in event.error
            ? String((event.error as { message: string }).message)
            : "Voice session error";
        setError(msg);
        setStatus("error");
      }
    },
    [handleFunctionCall, playPcmChunk, pushTranscript, stopPlayback],
  );

  const startCall = useCallback(async () => {
    setError(null);
    setTicket(null);
    setTranscript([]);
    setElapsedSec(0);
    setStatus("connecting");

    try {
      const sessionRes = await fetch("/api/voice/session", { method: "POST" });
      const session = (await sessionRes.json()) as SessionResponse & {
        error?: string;
      };
      if (!sessionRes.ok || !session.token) {
        throw new Error(session.error || "Could not start voice session");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
        },
      });
      mediaStreamRef.current = stream;

      const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
      audioContextRef.current = ctx;
      if (ctx.state === "suspended") await ctx.resume();

      const ws = new WebSocket(session.url, [
        `xai-client-secret.${session.token}`,
      ]);
      wsRef.current = ws;

      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve();
        ws.onerror = () => reject(new Error("WebSocket failed to connect"));
      });

      ws.send(JSON.stringify(session.sessionUpdate));

      ws.onmessage = (msg) => {
        try {
          const event = JSON.parse(String(msg.data)) as Record<string, unknown>;
          onServerEvent(event);
        } catch {
          /* ignore malformed */
        }
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
          cleanup();
          setStatus((s) => (s === "error" ? s : "idle"));
        }
      };

      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (mutedRef.current) return;
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        const input = e.inputBuffer.getChannelData(0);
        const pcm = float32ToBase64PCM16(input);
        wsRef.current.send(
          JSON.stringify({
            type: "input_audio_buffer.append",
            audio: pcm,
          }),
        );
      };

      // Keep the processor graph alive without monitoring local mic audio.
      const silent = ctx.createGain();
      silent.gain.value = 0;
      source.connect(processor);
      processor.connect(silent);
      silent.connect(ctx.destination);

      callStartedAtRef.current = Date.now();
      setStatus("listening");

      // Greet the guest
      ws.send(
        JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [
              {
                type: "input_text",
                text: "The guest just connected on a voice call. Greet them briefly as FlyLo Guest Care and ask how you can help.",
              },
            ],
          },
        }),
      );
      ws.send(JSON.stringify({ type: "response.create" }));
    } catch (e) {
      cleanup();
      const message = e instanceof Error ? e.message : "Failed to start call";
      setError(message);
      setStatus("error");
    }
  }, [cleanup, onServerEvent]);

  useEffect(() => () => cleanup(), [cleanup]);

  const toggleMute = useCallback(() => setMuted((m) => !m), []);

  return {
    status,
    muted,
    error,
    transcript,
    ticket,
    elapsedSec,
    startCall,
    hangUp,
    toggleMute,
  };
}