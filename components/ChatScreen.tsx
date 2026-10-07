"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUp, CheckCircle, ChevronLeft, ChevronRight } from "@/components/icons";
import type {
  CallStatus,
  TicketBanner,
  TranscriptLine,
} from "@/lib/voice/useVoiceAgent";

const SUGGESTIONS = [
  "Flights London → Paris on Oct 20?",
  "Check my booking",
  "My bag was damaged",
];

type Item =
  | { kind: "msg"; id: string; from: "user" | "assistant"; text: string }
  | { kind: "system"; id: string; text: string }
  | { kind: "typing"; id: string };

type Props = {
  status: CallStatus;
  transcript: TranscriptLine[];
  liveAssistant: string;
  ticket: TicketBanner | null;
  onSend: (text: string) => boolean;
  onEnd: () => void;
};

export function ChatScreen({
  status,
  transcript,
  liveAssistant,
  ticket,
  onSend,
  onEnd,
}: Props) {
  const [draft, setDraft] = useState("");
  const [openedAt] = useState(() =>
    new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const ready = status === "listening";
  const busy = status === "thinking" || status === "speaking";
  const guestHasSpoken = transcript.some((l) => l.role === "user");

  const items: Item[] = transcript.map((l) =>
    l.role === "system"
      ? { kind: "system", id: l.id, text: l.text }
      : { kind: "msg", id: l.id, from: l.role, text: l.text },
  );
  if (liveAssistant) {
    items.push({ kind: "msg", id: "live", from: "assistant", text: liveAssistant });
  } else if (busy) {
    items.push({ kind: "typing", id: "typing" });
  }

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcript, liveAssistant, busy, ticket]);

  useEffect(() => {
    if (ready) inputRef.current?.focus();
  }, [ready]);

  function submit(text: string) {
    if (!ready) return;
    if (onSend(text)) setDraft("");
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    submit(draft);
  }

  return (
    <div className="relative flex h-full flex-col bg-black" data-status={status}>
      <header className="relative z-10 border-b border-white/[0.08] bg-[#1c1c1e]/85 px-2 pt-[50px] pb-2 backdrop-blur-xl">
        <button
          type="button"
          onClick={onEnd}
          className="absolute top-[58px] left-1.5 flex h-9 w-9 items-center justify-center rounded-full text-[#0a84ff] transition active:opacity-60 focus-visible:outline-2 focus-visible:outline-[#0a84ff]"
          aria-label="End chat"
        >
          <ChevronLeft size={24} />
        </button>
        <div className="flex flex-col items-center">
          <div className="flex h-[42px] w-[42px] items-center justify-center rounded-full bg-[linear-gradient(160deg,#5eead4_0%,#14b8a6_45%,#0e5f63_100%)]">
            <span className="font-[family-name:var(--font-display)] text-[16px] text-[#05201c]">
              FL
            </span>
          </div>
          <p className="mt-1 flex items-center gap-0.5 text-[11px] text-white/90">
            FlyLo Guest Care
            <ChevronRight size={8} className="text-white/40" />
          </p>
        </div>
      </header>

      {ticket ? (
        <div className="relative z-10 flex items-center justify-center gap-1.5 bg-[#1c1c1e]/85 px-3 pb-2 text-[11px] text-white/80 backdrop-blur-xl">
          <CheckCircle size={13} className="text-[#30d158]" />
          Support ticket opened
          {ticket.displayId != null ? ` · #${ticket.displayId}` : ""}
          {ticket.callbackRequested ? " · we'll call you back" : ""}
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-3.5 pt-3 pb-2 text-[14px] leading-[1.32]"
        role="log"
        aria-label="Messages with Guest Care"
      >
        <p className="mb-3 text-center text-[11px] text-white/45">
          <span className="font-semibold">Today</span> {openedAt}
        </p>

        {status === "connecting" ? (
          <p className="pt-4 text-center text-[12px] text-white/40">Connecting to Guest Care…</p>
        ) : null}

        {items.map((item, i) => {
          const next = items[i + 1];
          if (item.kind === "system") {
            return (
              <p key={item.id} className="my-2 text-center text-[11px] text-white/45">
                {item.text}
              </p>
            );
          }
          const from = item.kind === "typing" ? "assistant" : item.from;
          const nextFrom =
            next?.kind === "msg" ? next.from : next?.kind === "typing" ? "assistant" : null;
          const tail = nextFrom !== from;
          const gap = tail ? "mb-2.5" : "mb-[3px]";
          if (item.kind === "typing") {
            return <TypingBubble key={item.id} className={gap} />;
          }
          return <Bubble key={item.id} from={item.from} text={item.text} tail={tail} className={gap} />;
        })}

        {ready && !guestHasSpoken ? (
          <div className="mt-3 flex flex-col items-end gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => submit(s)}
                className="rounded-full px-3 py-1.5 text-[13px] text-[#0a84ff] ring-1 ring-[#0a84ff]/60 transition active:bg-[#0a84ff]/15 focus-visible:outline-2 focus-visible:outline-[#0a84ff]"
              >
                {s}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <form onSubmit={onSubmit} className="flex items-end gap-2 bg-black px-3 pt-1.5 pb-[26px]">
        <div className="flex min-h-[36px] flex-1 items-center rounded-[18px] border border-white/[0.18] pr-1 pl-3.5">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Message"
            aria-label="Message"
            maxLength={1000}
            enterKeyHint="send"
            className="min-w-0 flex-1 bg-transparent py-1.5 text-[14px] text-white outline-none placeholder:text-white/35"
          />
          {draft.trim() ? (
            <button
              type="submit"
              disabled={!ready}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0a84ff] text-white transition active:brightness-90 disabled:bg-white/20 disabled:text-white/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0a84ff]"
              aria-label="Send message"
            >
              <ArrowUp size={15} />
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}

function Bubble({
  from,
  text,
  tail,
  className = "",
}: {
  from: "user" | "assistant";
  text: string;
  tail: boolean;
  className?: string;
}) {
  const me = from === "user";
  return (
    <div className={`flex ${me ? "justify-end" : "justify-start"} ${className}`}>
      <p
        className={`imsg max-w-[76%] rounded-[18px] px-3 py-[7px] break-words whitespace-pre-wrap ${
          me ? "bg-[#0a84ff] text-white" : "bg-[#262629] text-white"
        } ${tail ? (me ? "imsg-tail-me" : "imsg-tail-them") : ""}`}
      >
        {text}
      </p>
    </div>
  );
}

function TypingBubble({ className = "" }: { className?: string }) {
  return (
    <div className={`flex justify-start ${className}`} aria-label="Guest Care is typing">
      <div className="imsg imsg-tail-them flex items-center gap-[5px] rounded-[18px] bg-[#262629] px-3.5 py-3">
        <span className="typing-dot h-[7px] w-[7px] rounded-full bg-white/50" />
        <span className="typing-dot h-[7px] w-[7px] rounded-full bg-white/50 [animation-delay:150ms]" />
        <span className="typing-dot h-[7px] w-[7px] rounded-full bg-white/50 [animation-delay:300ms]" />
      </div>
    </div>
  );
}
