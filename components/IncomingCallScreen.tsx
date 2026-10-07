"use client";

import { PhoneDown, PhoneFill } from "@/components/icons";
import type { IncomingCall } from "@/lib/voice/useCallbackLine";

/** iOS-style full-screen incoming call for a Guest Care callback. */
export function IncomingCallScreen({
  call,
  onAccept,
  onDecline,
}: {
  call: IncomingCall;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div
      className="relative flex h-full flex-col bg-[radial-gradient(130%_70%_at_50%_0%,#145552_0%,#0b2b2c_40%,#060b0c_75%,#000_100%)] px-8 pt-[86px] pb-14"
      role="dialog"
      aria-label="Incoming call from FlyLo Guest Care"
    >
      <div className="text-center">
        <p className="text-[15px] text-white/60">FlyLo callback</p>
        <h1 className="mt-1 text-[30px] leading-tight font-semibold tracking-[-0.02em]">
          FlyLo Guest Care
        </h1>
        <p className="mt-1 text-[15px] text-white/60">About your ticket #{call.displayId}</p>
      </div>

      <div className="mt-12 flex flex-1 justify-center">
        <div className="incoming-halo flex h-[112px] w-[112px] items-center justify-center rounded-full bg-[linear-gradient(160deg,#5eead4_0%,#14b8a6_45%,#0e5f63_100%)] shadow-[inset_0_-6px_14px_rgba(0,0,0,0.25)]">
          <span className="font-[family-name:var(--font-display)] text-[42px] tracking-tight text-[#05201c]">
            FL
          </span>
        </div>
      </div>

      <div className="flex items-start justify-between px-2">
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={onDecline}
            aria-label="Decline call"
            className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-[#ff3b30] text-white transition active:brightness-90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
          >
            <PhoneDown />
          </button>
          <span className="text-[13px] text-white/85">Decline</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={onAccept}
            aria-label="Accept call"
            className="accept-pulse flex h-[72px] w-[72px] items-center justify-center rounded-full bg-[#30d158] text-white transition active:brightness-90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
          >
            <PhoneFill size={30} />
          </button>
          <span className="text-[13px] text-white/85">Accept</span>
        </div>
      </div>
    </div>
  );
}
