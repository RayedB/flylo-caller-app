"use client";

import { useCallback } from "react";
import { IPhoneFrame } from "@/components/IPhoneFrame";
import { CallScreen } from "@/components/CallScreen";
import { ChatScreen } from "@/components/ChatScreen";
import { IncomingCallScreen } from "@/components/IncomingCallScreen";
import { useCallbackLine, type IncomingCall } from "@/lib/voice/useCallbackLine";
import { useVoiceAgent } from "@/lib/voice/useVoiceAgent";

export function DeskScene() {
  const {
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
  } = useVoiceAgent();

  const sessionActive = status !== "idle" && status !== "error";
  const onVoiceCall = sessionActive && mode === "voice";
  // A callback that arrives during a voice call is reported to Chatwoot as busy.
  const isBusy = useCallback(() => onVoiceCall, [onVoiceCall]);
  const line = useCallbackLine(isBusy);

  const answer = useCallback(
    (call: IncomingCall) => {
      if (sessionActive) hangUp(); // accepting a callback ends an open chat
      void startCallback({ id: call.id, displayId: call.displayId, guestName: call.guestName });
    },
    [hangUp, sessionActive, startCallback],
  );

  const onAccept = useCallback(() => {
    const call = line.takeIncoming();
    if (call) answer(call);
  }, [answer, line]);

  const chatOpen = mode === "chat" && sessionActive;
  const ringing = Boolean(line.incoming) && !onVoiceCall;

  return (
    <main className="relative flex min-h-full flex-1 flex-col overflow-hidden">
      <div className="desk-bg pointer-events-none absolute inset-0" />
      <div className="desk-grain pointer-events-none absolute inset-0 opacity-[0.07]" />

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 py-8 sm:py-10">
        <p className="mb-2 font-[family-name:var(--font-display)] text-4xl tracking-tight text-[var(--brand)] sm:text-5xl">
          FlyLo
        </p>
        <p className="mb-6 max-w-sm text-center text-sm text-[var(--ink-muted)] sm:mb-8">
          Guest Care demo · call or message from the phone
        </p>

        <IPhoneFrame ringing={ringing}>
          {ringing && line.incoming ? (
            <IncomingCallScreen call={line.incoming} onAccept={onAccept} onDecline={line.decline} />
          ) : chatOpen ? (
            <ChatScreen
              status={status}
              transcript={transcript}
              liveAssistant={liveAssistant}
              ticket={ticket}
              onSend={sendText}
              onEnd={hangUp}
            />
          ) : (
            <CallScreen
              status={status}
              muted={muted}
              error={error}
              transcript={transcript}
              liveAssistant={liveAssistant}
              liveUser={liveUser}
              ticket={ticket}
              elapsedSec={elapsedSec}
              onCall={startCall}
              onChat={startChat}
              onHangUp={hangUp}
              onToggleMute={toggleMute}
              callback={activeCallback}
              missed={line.missed}
              onReturnMissed={answer}
            />
          )}
        </IPhoneFrame>

        <div className="mt-6 flex flex-col items-center gap-2">
          <p
            className="flex items-center gap-1.5 rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] text-[var(--ink-muted)] ring-1 ring-white/10"
            aria-live="polite"
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${line.connected ? "bg-[#30d158]" : "bg-amber-400"}`}
            />
            {line.connected
              ? "Callback line connected · Guest Care can call this phone"
              : "Callback line reconnecting…"}
          </p>
          <p className="max-w-md text-center text-xs leading-relaxed text-[var(--ink-muted)]">
            Local demo · voice and chat via Grok speech-to-speech · tickets via
            Chatwoot · flights via FlyLo booking API
          </p>
        </div>
      </div>
    </main>
  );
}
