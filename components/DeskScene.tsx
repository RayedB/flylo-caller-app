"use client";

import { IPhoneFrame } from "@/components/IPhoneFrame";
import { CallScreen } from "@/components/CallScreen";
import { useVoiceAgent } from "@/lib/voice/useVoiceAgent";

export function DeskScene() {
  const {
    status,
    muted,
    error,
    transcript,
    ticket,
    elapsedSec,
    startCall,
    hangUp,
    toggleMute,
  } = useVoiceAgent();

  return (
    <main className="relative flex min-h-full flex-1 flex-col overflow-hidden">
      <div className="desk-bg pointer-events-none absolute inset-0" />
      <div className="desk-grain pointer-events-none absolute inset-0 opacity-[0.07]" />

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 py-10 sm:py-14">
        <p className="mb-2 font-[family-name:var(--font-display)] text-4xl tracking-tight text-[var(--brand)] sm:text-5xl">
          FlyLo
        </p>
        <p className="mb-8 max-w-sm text-center text-sm text-[var(--ink-muted)] sm:mb-10">
          Guest Care · tap Call on the phone
        </p>

        <IPhoneFrame>
          <CallScreen
            status={status}
            muted={muted}
            error={error}
            transcript={transcript}
            ticket={ticket}
            elapsedSec={elapsedSec}
            onCall={startCall}
            onHangUp={hangUp}
            onToggleMute={toggleMute}
          />
        </IPhoneFrame>

        <p className="mt-10 max-w-md text-center text-xs leading-relaxed text-[var(--ink-muted)]">
          Local demo · voice via Grok · tickets via Chatwoot · flights via FlyLo
          booking API
        </p>
      </div>
    </main>
  );
}