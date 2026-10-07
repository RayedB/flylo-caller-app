"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  CaptionsBubble,
  CheckCircle,
  EnvelopeFill,
  MessageFill,
  MicFill,
  PhoneDown,
  PhoneFill,
  SpeakerWave,
} from "@/components/icons";
import type { MissedCall } from "@/lib/voice/useCallbackLine";
import type {
  ActiveCallback,
  CallStatus,
  TicketBanner,
  TranscriptLine,
} from "@/lib/voice/useVoiceAgent";

const GUEST_CARE_PHONE = "+1 (415) 580-0707";
const GUEST_CARE_EMAIL = "contact@flylo-air.com";

function formatTimer(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function agentLabel(status: CallStatus) {
  switch (status) {
    case "listening":
      return "Listening";
    case "thinking":
      return "Looking that up…";
    case "speaking":
      return "Speaking";
    default:
      return "";
  }
}

type Props = {
  status: CallStatus;
  muted: boolean;
  error: string | null;
  transcript: TranscriptLine[];
  /** Streaming text for the turn in progress. */
  liveAssistant: string;
  liveUser: string;
  ticket: TicketBanner | null;
  elapsedSec: number;
  onCall: () => void;
  onChat: () => void;
  onHangUp: () => void;
  onToggleMute: () => void;
  /** Set while this call is a Guest Care callback. */
  callback: ActiveCallback | null;
  missed: MissedCall[];
  onReturnMissed: (call: MissedCall) => void;
};

export function CallScreen(props: Props) {
  const inCall = props.status !== "idle" && props.status !== "error";
  return inCall ? <ActiveCall {...props} /> : <ContactCard {...props} />;
}

function Monogram({ size, speaking }: { size: number; speaking?: boolean }) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full bg-[linear-gradient(160deg,#5eead4_0%,#14b8a6_45%,#0e5f63_100%)] shadow-[inset_0_-6px_14px_rgba(0,0,0,0.25)] ${
        speaking ? "avatar-speak" : ""
      }`}
      style={{ width: size, height: size }}
    >
      <span
        className="font-[family-name:var(--font-display)] tracking-tight text-[#05201c]"
        style={{ fontSize: size * 0.38 }}
      >
        FL
      </span>
    </div>
  );
}

/* ---------- Idle: iOS contact card ---------- */

function ContactCard({ error, onCall, onChat, missed, onReturnMissed }: Props) {
  return (
    <div className="flex h-full flex-col overflow-y-auto bg-black pb-8">
      <div className="bg-[radial-gradient(120%_85%_at_50%_0%,#134e4a_0%,#0b2a2a_45%,#000_100%)] px-4 pt-[64px] pb-5">
        <div className="flex flex-col items-center">
          <Monogram size={92} />
          <h1 className="mt-3 text-[26px] leading-tight font-semibold tracking-[-0.02em]">
            FlyLo Guest Care
          </h1>
          <p className="mt-0.5 text-[15px] text-white/55">FlyLo Airlines</p>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <ActionTile label="message" ariaLabel="Chat with Guest Care" onClick={onChat}>
            <MessageFill size={20} />
          </ActionTile>
          <ActionTile label="call" ariaLabel="Call Guest Care" onClick={onCall}>
            <PhoneFill size={20} />
          </ActionTile>
          <ActionTile label="mail" ariaLabel="Email Guest Care" href={`mailto:${GUEST_CARE_EMAIL}`}>
            <EnvelopeFill size={20} />
          </ActionTile>
        </div>

        {error ? (
          <p role="alert" className="mt-3 rounded-xl bg-[#ff453a]/15 px-3 py-2 text-center text-[13px] text-[#ff8a80]">
            {error}
          </p>
        ) : null}
      </div>

      <div className="space-y-3 px-4 pt-1">
        {missed.length ? (
          <div>
            <p className="mb-1 px-1 text-[12px] font-semibold text-white/50">Recents</p>
            <InfoGroup>
              {missed.map((call, i) => (
                <MissedRow
                  key={call.id}
                  call={call}
                  last={i === missed.length - 1}
                  onReturn={() => onReturnMissed(call)}
                />
              ))}
            </InfoGroup>
          </div>
        ) : null}

        <InfoGroup>
          <InfoRow label="guest care">
            <button type="button" onClick={onCall} className="text-[#0a84ff]">
              {GUEST_CARE_PHONE}
            </button>
          </InfoRow>
          <InfoRow label="email" last>
            <a href={`mailto:${GUEST_CARE_EMAIL}`} className="text-[#0a84ff]">
              {GUEST_CARE_EMAIL}
            </a>
          </InfoRow>
        </InfoGroup>

        <InfoGroup>
          <InfoRow label="hours" last>
            <span>Daily 06:00–22:00 PT</span>
          </InfoRow>
        </InfoGroup>

        <p className="px-1 text-[12px] leading-snug text-white/40">
          Calls use your microphone. Messages work without one.
        </p>
      </div>
    </div>
  );
}

function MissedRow({
  call,
  last,
  onReturn,
}: {
  call: MissedCall;
  last: boolean;
  onReturn: () => void;
}) {
  const at = new Date(call.createdAt).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  const label =
    call.reason === "declined"
      ? "Declined callback"
      : call.reason === "dropped"
        ? "Dropped callback"
        : "Missed callback";
  return (
    <div className="ml-3.5 flex items-center gap-2 py-2 pr-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] leading-tight text-[#ff453a]">{label}</p>
        <p className="mt-0.5 text-[12px] text-white/50">
          Ticket #{call.displayId} · {at}
        </p>
        {last ? null : <div className="mt-2 -mb-2 h-px bg-white/[0.12]" />}
      </div>
      <button
        type="button"
        onClick={onReturn}
        aria-label={`Return callback for ticket ${call.displayId}`}
        className="flex h-8 items-center gap-1 rounded-full bg-[#30d158]/15 px-3 text-[13px] font-medium text-[#30d158] transition active:bg-[#30d158]/25 focus-visible:outline-2 focus-visible:outline-[#30d158]"
      >
        <PhoneFill size={13} />
        call back
      </button>
    </div>
  );
}

function ActionTile({
  children,
  label,
  ariaLabel,
  onClick,
  href,
}: {
  children: ReactNode;
  label: string;
  ariaLabel: string;
  onClick?: () => void;
  href?: string;
}) {
  const cls =
    "flex h-[58px] flex-col items-center justify-center gap-1 rounded-[12px] bg-white/[0.11] text-[#0a84ff] transition active:bg-white/20 hover:bg-white/[0.15] focus-visible:outline-2 focus-visible:outline-[#0a84ff]";
  const inner = (
    <>
      {children}
      <span className="text-[11px] leading-none font-medium">{label}</span>
    </>
  );
  return href ? (
    <a href={href} aria-label={ariaLabel} className={cls}>
      {inner}
    </a>
  ) : (
    <button type="button" onClick={onClick} aria-label={ariaLabel} className={cls}>
      {inner}
    </button>
  );
}

function InfoGroup({ children }: { children: ReactNode }) {
  return <div className="overflow-hidden rounded-[12px] bg-[#1c1c1e]">{children}</div>;
}

function InfoRow({ label, children, last }: { label: string; children: ReactNode; last?: boolean }) {
  return (
    <div className="ml-3.5 py-2 pr-3.5">
      <p className="text-[12px] leading-tight text-white/90">{label}</p>
      <div className="mt-0.5 text-[15px] leading-snug">{children}</div>
      {last ? null : <div className="mt-2 -mb-2 h-px bg-white/[0.12]" />}
    </div>
  );
}

/* ---------- In call: iOS call screen ---------- */

function ActiveCall({
  status,
  muted,
  transcript,
  liveAssistant,
  liveUser,
  ticket,
  elapsedSec,
  onHangUp,
  onToggleMute,
  callback,
}: Props) {
  const [captions, setCaptions] = useState(true);
  const captionsRef = useRef<HTMLDivElement>(null);
  const connecting = status === "connecting";

  useEffect(() => {
    const el = captionsRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcript, liveAssistant, liveUser, captions]);

  return (
    <div className="relative flex h-full flex-col bg-[radial-gradient(130%_70%_at_50%_0%,#145552_0%,#0b2b2c_40%,#060b0c_75%,#000_100%)] px-6 pt-[72px] pb-10">
      <div className="text-center">
        <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.02em]">
          FlyLo Guest Care
        </h1>
        {callback ? (
          <p className="mt-0.5 text-[13px] text-white/50">Callback · ticket #{callback.displayId}</p>
        ) : null}
        <p className="mt-1 text-[17px] text-white/65 tabular-nums" aria-live="polite">
          {connecting ? (callback ? "connecting…" : "calling…") : formatTimer(elapsedSec)}
        </p>
      </div>

      <div className="mt-6 flex flex-col items-center">
        <Monogram size={104} speaking={status === "speaking"} />
        <p className="mt-3 h-4 text-[12px] text-teal-200/80" aria-live="polite">
          {agentLabel(status)}
        </p>
      </div>

      {ticket ? (
        <div className="mx-auto mt-3 flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[12px] text-white/90 backdrop-blur-xl">
          <CheckCircle className="text-[#30d158]" />
          Support ticket opened
          {ticket.displayId != null ? ` · #${ticket.displayId}` : ""}
        </div>
      ) : null}

      <div className="mt-4 min-h-0 flex-1">
        {captions ? (
          <div className="flex h-full max-h-[190px] flex-col overflow-hidden rounded-[18px] bg-white/[0.09] backdrop-blur-xl">
            <p className="px-3.5 pt-2.5 text-[10px] font-semibold tracking-[0.06em] text-white/45 uppercase">
              Live captions
            </p>
            <div ref={captionsRef} className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3.5 pt-1 pb-3 text-[13px] leading-snug">
              {transcript.length === 0 && !liveAssistant && !liveUser ? (
                <p className="text-white/35">Captions appear when someone speaks.</p>
              ) : (
                transcript.map((line) => (
                  <p key={line.id}>
                    <span className={line.role === "user" ? "font-semibold text-white" : "font-semibold text-teal-200"}>
                      {line.role === "user" ? "You" : line.role === "assistant" ? "Guest Care" : "System"}
                    </span>
                    <span className="text-white/80"> {line.text}</span>
                  </p>
                ))
              )}
              {liveAssistant ? <LiveCaption who="Guest Care" text={liveAssistant} /> : null}
              {liveUser ? <LiveCaption who="You" text={liveUser} /> : null}
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-6 grid grid-cols-3 gap-x-6 gap-y-5 px-1">
        <CallControl label="speaker" ariaLabel="Speaker" disabled>
          <SpeakerWave />
        </CallControl>
        <CallControl
          label="captions"
          ariaLabel={captions ? "Hide captions" : "Show captions"}
          active={captions}
          onClick={() => setCaptions((c) => !c)}
        >
          <CaptionsBubble />
        </CallControl>
        <CallControl label="mute" ariaLabel={muted ? "Unmute" : "Mute"} active={muted} onClick={onToggleMute}>
          <MicFill slashed={muted} />
        </CallControl>
      </div>

      <div className="mt-6 flex justify-center">
        <button
          type="button"
          onClick={onHangUp}
          className="flex h-[70px] w-[70px] items-center justify-center rounded-full bg-[#ff3b30] text-white transition active:brightness-90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
          aria-label="End call"
        >
          <PhoneDown />
        </button>
      </div>
    </div>
  );
}

function LiveCaption({ who, text }: { who: "You" | "Guest Care"; text: string }) {
  return (
    <p aria-live="off">
      <span className={who === "You" ? "font-semibold text-white" : "font-semibold text-teal-200"}>{who}</span>
      <span className="text-white/60"> {text}</span>
      <span className="caption-caret ml-0.5 inline-block h-[0.9em] w-[2px] translate-y-[2px] bg-white/50" />
    </p>
  );
}

function CallControl({
  children,
  label,
  ariaLabel,
  onClick,
  active,
  disabled,
}: {
  children: ReactNode;
  label: string;
  ariaLabel: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-pressed={disabled ? undefined : Boolean(active)}
        className={`flex h-[66px] w-[66px] items-center justify-center rounded-full backdrop-blur-xl transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
          active ? "bg-white text-black" : "bg-white/[0.18] text-white active:bg-white/30"
        } ${disabled ? "opacity-45" : ""}`}
      >
        {children}
      </button>
      <span className="text-[12px] text-white/85">{label}</span>
    </div>
  );
}
