"use client";

import type { ReactNode } from "react";
import type {
  CallStatus,
  TicketBanner,
  TranscriptLine,
} from "@/lib/voice/useVoiceAgent";

function formatTimer(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function statusLabel(status: CallStatus) {
  switch (status) {
    case "connecting":
      return "Connecting…";
    case "listening":
      return "Listening";
    case "thinking":
      return "Looking that up…";
    case "speaking":
      return "Speaking";
    case "error":
      return "Call failed";
    default:
      return "Guest Care";
  }
}

type Props = {
  status: CallStatus;
  muted: boolean;
  error: string | null;
  transcript: TranscriptLine[];
  ticket: TicketBanner | null;
  elapsedSec: number;
  onCall: () => void;
  onHangUp: () => void;
  onToggleMute: () => void;
};

export function CallScreen({
  status,
  muted,
  error,
  transcript,
  ticket,
  elapsedSec,
  onCall,
  onHangUp,
  onToggleMute,
}: Props) {
  const inCall = status !== "idle" && status !== "error";
  const speaking = status === "speaking";

  if (!inCall) {
    return (
      <div className="relative flex h-full flex-col bg-[radial-gradient(ellipse_at_top,_#1a2f3a_0%,_#0b1216_55%,_#050708_100%)] px-6 pb-10 pt-14">
        <div className="text-center text-[11px] tracking-[0.22em] text-white/45 uppercase">
          FlyLo
        </div>

        <div className="mt-10 flex flex-1 flex-col items-center">
          <div className="call-pulse flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-teal-300/90 to-cyan-700 shadow-[0_0_40px_rgba(45,212,191,0.25)]">
            <span className="font-[family-name:var(--font-display)] text-3xl tracking-tight text-[#062018]">
              FL
            </span>
          </div>
          <h1 className="mt-6 font-[family-name:var(--font-display)] text-[1.75rem] leading-tight tracking-tight">
            Guest Care
          </h1>
          <p className="mt-2 text-center text-sm text-white/55">
            Daily 06:00–22:00 PT
          </p>
          <p className="mt-6 max-w-[220px] text-center text-xs leading-relaxed text-white/40">
            Tap Call to speak with FlyLo. Mic access is required for the demo.
          </p>

          {error ? (
            <p className="mt-4 max-w-[240px] text-center text-xs text-rose-300">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col items-center gap-3 pb-4">
          <button
            type="button"
            onClick={onCall}
            className="call-pulse flex h-16 w-16 items-center justify-center rounded-full bg-[#34c759] text-white shadow-[0_10px_30px_rgba(52,199,89,0.45)] transition active:scale-95"
            aria-label="Call Guest Care"
          >
            <PhoneIcon />
          </button>
          <span className="text-xs tracking-wide text-white/50">Call</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col bg-[radial-gradient(ellipse_at_top,_#243447_0%,_#0d141c_50%,_#05070a_100%)] px-5 pb-9 pt-14">
      <div className="text-center">
        <p className="text-[11px] tracking-[0.2em] text-white/40 uppercase">
          FlyLo Airlines
        </p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-[1.65rem] tracking-tight">
          Guest Care
        </h1>
        <p className="mt-1 text-sm text-white/55">{formatTimer(elapsedSec)}</p>
        <p className="mt-0.5 text-xs text-teal-200/80">{statusLabel(status)}</p>
      </div>

      <div className="mt-8 flex justify-center">
        <div
          className={`flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-white/15 to-white/5 ring-1 ring-white/15 ${
            speaking ? "avatar-speak" : ""
          }`}
        >
          <span className="font-[family-name:var(--font-display)] text-3xl text-white/90">
            FL
          </span>
        </div>
      </div>

      {ticket ? (
        <div className="mt-4 rounded-xl bg-teal-400/15 px-3 py-2 text-center text-[11px] text-teal-100 ring-1 ring-teal-300/30">
          Ticket opened
          {ticket.displayId != null ? ` · #${ticket.displayId}` : ""}
          {ticket.conversationId != null
            ? ` (id ${ticket.conversationId})`
            : ""}
        </div>
      ) : null}

      <div className="mt-4 min-h-0 flex-1 overflow-hidden rounded-2xl bg-black/35 ring-1 ring-white/10">
        <div className="border-b border-white/10 px-3 py-1.5 text-[10px] tracking-wider text-white/35 uppercase">
          Live transcript
        </div>
        <div className="h-[140px] space-y-2 overflow-y-auto px-3 py-2 text-[11px] leading-snug">
          {transcript.length === 0 ? (
            <p className="text-white/30">Waiting for the first turn…</p>
          ) : (
            transcript.map((line) => (
              <p key={line.id}>
                <span
                  className={
                    line.role === "user"
                      ? "text-sky-200/90"
                      : line.role === "assistant"
                        ? "text-teal-100/90"
                        : "text-white/40"
                  }
                >
                  {line.role === "user"
                    ? "You"
                    : line.role === "assistant"
                      ? "Guest Care"
                      : "System"}
                  :{" "}
                </span>
                <span className="text-white/75">{line.text}</span>
              </p>
            ))
          )}
        </div>
      </div>

      <div className="mt-5 flex items-end justify-center gap-7 pb-2">
        <ControlButton
          label={muted ? "Unmute" : "Mute"}
          active={muted}
          onClick={onToggleMute}
        >
          <MicIcon muted={muted} />
        </ControlButton>
        <ControlButton label="Speaker" dim>
          <SpeakerIcon />
        </ControlButton>
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={onHangUp}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-[#ff3b30] text-white shadow-[0_8px_24px_rgba(255,59,48,0.4)] transition active:scale-95"
            aria-label="End call"
          >
            <EndIcon />
          </button>
          <span className="text-[10px] text-white/45">End</span>
        </div>
      </div>
    </div>
  );
}

function ControlButton({
  children,
  label,
  onClick,
  active,
  dim,
}: {
  children: ReactNode;
  label: string;
  onClick?: () => void;
  active?: boolean;
  dim?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={dim && !onClick}
        className={`flex h-12 w-12 items-center justify-center rounded-full transition ${
          active
            ? "bg-white text-black"
            : "bg-white/12 text-white ring-1 ring-white/10"
        } ${dim ? "opacity-70" : "active:scale-95"}`}
        aria-label={label}
      >
        {children}
      </button>
      <span className="text-[10px] text-white/45">{label}</span>
    </div>
  );
}

function PhoneIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6.6 10.8a15.1 15.1 0 006.6 6.6l2.2-2.2a1.2 1.2 0 011.2-.3 13 13 0 004 .6 1.2 1.2 0 011.2 1.2V20a1.2 1.2 0 01-1.2 1.2A17.8 17.8 0 012.8 3.2 1.2 1.2 0 014 2h3.3a1.2 1.2 0 011.2 1.2 13 13 0 00.6 4 1.2 1.2 0 01-.3 1.2L6.6 10.8z" />
    </svg>
  );
}

function MicIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      {muted ? (
        <path d="M19 11a1 1 0 00-2 0 5 5 0 01-.7 2.5l1.5 1.5A6.9 6.9 0 0019 11zm-7-8a3 3 0 00-3 3v.2l6 6V6a3 3 0 00-3-3zm7.7 14.3L4.7 2.3a1 1 0 10-1.4 1.4l4.2 4.2V11a5 5 0 006.1 4.9l1.7 1.7A6.9 6.9 0 015 11a1 1 0 10-2 0 8.9 8.9 0 007 8.7V22h4v-2.3a8.8 8.8 0 002.6-.9l2.7 2.7a1 1 0 001.4-1.4z" />
      ) : (
        <path d="M12 14a3 3 0 003-3V6a3 3 0 10-6 0v5a3 3 0 003 3zm5-3a1 1 0 112 0 7 7 0 01-6 6.9V22h-2v-4.1A7 7 0 015 11a1 1 0 112 0 5 5 0 0010 0z" />
      )}
    </svg>
  );
}

function SpeakerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 9v6h4l5 4V5L7 9H3zm13.5 3a2.5 2.5 0 00-1.5-2.3v4.6a2.5 2.5 0 001.5-2.3zm0-6.9v2.1a5 5 0 010 9.6v2.1a7 7 0 000-13.8z" />
    </svg>
  );
}

function EndIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
      <path d="M21 15.5a1.5 1.5 0 01-1.5 1.5h-2.1a1.5 1.5 0 01-1.5-1.3 12.6 12.6 0 01-.4-2.7 1.5 1.5 0 01.4-1l1.1-1.1a14.7 14.7 0 00-9 0l1.1 1.1a1.5 1.5 0 01.4 1 12.6 12.6 0 01-.4 2.7A1.5 1.5 0 016.6 17H4.5A1.5 1.5 0 013 15.5c0-6.2 8-8.5 9-8.5s9 2.3 9 8.5z" />
    </svg>
  );
}