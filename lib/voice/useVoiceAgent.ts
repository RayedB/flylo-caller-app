"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  LIVE_CAPTIONS_URL,
  openingPrompt,
  SAMPLE_RATE,
  type AgentMode,
} from "@/lib/agent-session";
import { getDeviceId } from "@/lib/device-id";
import {
  base64PCM16ToFloat32,
  float32ToBase64PCM16,
  float32ToPCM16Bytes,
} from "@/lib/voice/pcm";

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
  callbackRequested?: boolean;
};

/** The ticket an outbound callback is about. */
export type ActiveCallback = { id: string; displayId: number; guestName: string };

type SessionResponse = {
  token: string;
  url: string;
  sessionUpdate: unknown;
  openingPrompt?: string;
  callbackId?: string | null;
  /** Separate token for the live-captions (streaming STT) socket. */
  captionsToken?: string | null;
};

/**
 * One Grok speech-to-speech realtime session, in either mode:
 * - voice: mic audio in, spoken audio out (server VAD turns)
 * - chat: typed text in, the reply's transcript shown as text (audio is not played)
 */
export function useVoiceAgent() {
  const [mode, setMode] = useState<AgentMode>("voice");
  const [status, setStatus] = useState<CallStatus>("idle");
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [liveAssistant, setLiveAssistant] = useState("");
  /** Guest speech so far in the current turn (voice only), from streaming STT. */
  const [liveUser, setLiveUser] = useState("");
  const [ticket, setTicket] = useState<TicketBanner | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [activeCallback, setActiveCallback] = useState<ActiveCallback | null>(null);

  const modeRef = useRef<AgentMode>("voice");
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
  const callbackIdRef = useRef<string | null>(null);
  const captionsWsRef = useRef<WebSocket | null>(null);
  // Live guest captions follow the realtime API's turns (its VAD + final transcript):
  // text locked in earlier STT utterances, locked chunks of the current one, and
  // the realtime item the captions belong to (null = not listening for captions).
  const captionDoneRef = useRef("");
  const captionFinalRef = useRef("");
  const captionItemRef = useRef<string | null>(null);
  const transcriptRef = useRef<TranscriptLine[]>([]);

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

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

  const flushAssistant = useCallback(() => {
    pushTranscript("assistant", assistantBufRef.current);
    assistantBufRef.current = "";
    setLiveAssistant("");
  }, [pushTranscript]);

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
    // A finished callback posts its transcript to the Chatwoot ticket.
    captionsWsRef.current?.close();
    captionsWsRef.current = null;
    captionDoneRef.current = "";
    captionFinalRef.current = "";
    captionItemRef.current = null;
    setLiveUser("");

    const finishedCallback = callbackIdRef.current;
    callbackIdRef.current = null;
    if (finishedCallback) {
      void fetch(`/api/callbacks/${encodeURIComponent(finishedCallback)}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: transcriptRef.current.map(({ role, text }) => ({ role, text })),
        }),
        keepalive: true,
      }).catch(() => {});
    }

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
    setLiveAssistant("");
  }, [stopPlayback]);

  const hangUp = useCallback(() => {
    cleanup();
    setStatus("idle");
    setMuted(false);
  }, [cleanup]);

  const playPcmChunk = useCallback(
    (base64: string) => {
      // Chat mode has no AudioContext, so spoken audio is dropped.
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
          body: JSON.stringify({
            name,
            arguments: args,
            channel: modeRef.current,
            deviceId: getDeviceId(),
            callbackId: callbackIdRef.current,
          }),
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
              callbackRequested:
                (args as { callback_requested?: unknown }).callback_requested === true,
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
        // VAD can fire twice within one turn (same item); only a new item resets captions.
        const item = typeof event.item_id === "string" ? event.item_id : "turn";
        if (captionItemRef.current !== item) {
          captionItemRef.current = item;
          captionDoneRef.current = "";
          captionFinalRef.current = "";
          setLiveUser("");
        }
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
        setLiveAssistant(assistantBufRef.current);
        // Voice switches to "speaking" when audio starts playing.
        if (modeRef.current === "chat") setStatus("speaking");
        return;
      }

      if (type === "response.output_audio_transcript.done") {
        flushAssistant();
        return;
      }

      if (
        (type === "conversation.item.input_audio_transcription.completed" ||
          type === "conversation.item.input_audio_transcription.done") &&
        typeof event.transcript === "string"
      ) {
        pushTranscript("user", event.transcript);
        userBufRef.current = "";
        setLiveUser("");
        captionDoneRef.current = "";
        captionFinalRef.current = "";
        captionItemRef.current = null; // ignore late STT events for this turn
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
        if (assistantBufRef.current) flushAssistant();
        // Stay "thinking" while a tool result is still on its way back.
        if (pendingToolCallsRef.current > 0) return;
        setStatus((s) => {
          if (s === "thinking") return "listening";
          // Voice leaves "speaking" when playback ends; chat has no playback.
          if (s === "speaking" && modeRef.current === "chat") return "listening";
          return s;
        });
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
    [flushAssistant, handleFunctionCall, playPcmChunk, pushTranscript, stopPlayback],
  );

  const sendUserText = useCallback((ws: WebSocket, text: string) => {
    ws.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text }],
        },
      }),
    );
    ws.send(JSON.stringify({ type: "response.create" }));
  }, []);

  const start = useCallback(
    async (nextMode: AgentMode, callback?: ActiveCallback) => {
      modeRef.current = nextMode;
      setMode(nextMode);
      setActiveCallback(callback ?? null);
      setError(null);
      setTicket(null);
      setTranscript([]);
      setLiveAssistant("");
      setElapsedSec(0);
      setStatus("connecting");

      try {
        const sessionRes = await fetch("/api/voice/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: nextMode, callbackId: callback?.id }),
        });
        const session = (await sessionRes.json()) as SessionResponse & {
          error?: string;
        };
        if (!sessionRes.ok || !session.token) {
          if (callback) setActiveCallback(null);
          throw new Error(
            session.error ||
              (nextMode === "chat"
                ? "Could not start chat session"
                : "Could not start voice session"),
          );
        }

        let stream: MediaStream | null = null;
        let ctx: AudioContext | null = null;
        if (nextMode === "voice") {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              channelCount: 1,
            },
          });
          mediaStreamRef.current = stream;

          ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
          audioContextRef.current = ctx;
          if (ctx.state === "suspended") await ctx.resume();
        }

        callbackIdRef.current = session.callbackId ?? null;

        const ws = new WebSocket(session.url, [
          `xai-client-secret.${session.token}`,
        ]);
        wsRef.current = ws;

        await new Promise<void>((resolve, reject) => {
          ws.onopen = () => resolve();
          ws.onerror = () => reject(new Error("WebSocket failed to connect"));
        });

        ws.send(JSON.stringify(session.sessionUpdate));

        if (nextMode === "voice" && session.captionsToken) {
          // Best effort: if live captions fail, the final transcript still arrives per turn.
          try {
            const cap = new WebSocket(LIVE_CAPTIONS_URL, [
              `xai-client-secret.${session.captionsToken}`,
            ]);
            cap.binaryType = "arraybuffer";
            cap.onmessage = (msg) => {
              let ev: { type?: string; text?: string; is_final?: boolean; speech_final?: boolean };
              try {
                ev = JSON.parse(String(msg.data));
              } catch {
                return;
              }
              if (ev.type !== "transcript.partial" || typeof ev.text !== "string") return;
              if (captionItemRef.current === null) return;
              const join = (...parts: string[]) => parts.filter(Boolean).join(" ").trim();
              if (ev.speech_final) {
                // STT utterance done (text is the whole utterance); the turn may continue.
                captionDoneRef.current = join(captionDoneRef.current, ev.text);
                captionFinalRef.current = "";
                setLiveUser(captionDoneRef.current);
              } else if (ev.is_final) {
                captionFinalRef.current = join(captionFinalRef.current, ev.text);
                setLiveUser(join(captionDoneRef.current, captionFinalRef.current));
              } else {
                setLiveUser(join(captionDoneRef.current, captionFinalRef.current, ev.text));
              }
            };
            captionsWsRef.current = cap;
          } catch {
            captionsWsRef.current = null;
          }
        }

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

        if (stream && ctx) {
          const source = ctx.createMediaStreamSource(stream);
          sourceRef.current = source;
          const processor = ctx.createScriptProcessor(4096, 1, 1);
          processorRef.current = processor;

          processor.onaudioprocess = (e) => {
            if (mutedRef.current) return;
            if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
            const input = e.inputBuffer.getChannelData(0);
            const cap = captionsWsRef.current;
            if (cap?.readyState === WebSocket.OPEN) cap.send(float32ToPCM16Bytes(input));
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
        }

        callStartedAtRef.current = Date.now();
        setStatus(nextMode === "chat" ? "thinking" : "listening");

        // Greet the guest (not shown in the transcript).
        sendUserText(ws, session.openingPrompt ?? openingPrompt(nextMode));
      } catch (e) {
        cleanup();
        setActiveCallback(null);
        const fallback =
          nextMode === "chat" ? "Failed to start chat" : "Failed to start call";
        const message = e instanceof Error ? e.message : fallback;
        setError(message);
        setStatus("error");
      }
    },
    [cleanup, onServerEvent, sendUserText],
  );

  const startCall = useCallback(() => start("voice"), [start]);
  /** Answer (or return) a Guest Care callback; always a voice call. */
  const startCallback = useCallback(
    (call: ActiveCallback) => start("voice", call),
    [start],
  );
  const startChat = useCallback(() => start("chat"), [start]);

  /** Send a typed guest message. Returns false if it could not be sent. */
  const sendText = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      const ws = wsRef.current;
      if (!trimmed || !ws || ws.readyState !== WebSocket.OPEN) return false;
      pushTranscript("user", trimmed);
      setStatus("thinking");
      sendUserText(ws, trimmed);
      return true;
    },
    [pushTranscript, sendUserText],
  );

  useEffect(() => () => cleanup(), [cleanup]);

  const toggleMute = useCallback(() => setMuted((m) => !m), []);

  return {
    mode,
    status,
    muted,
    error,
    transcript,
    liveAssistant,
    liveUser,
    ticket,
    elapsedSec,
    activeCallback,
    startCall,
    startCallback,
    startChat,
    sendText,
    hangUp,
    toggleMute,
  };
}
