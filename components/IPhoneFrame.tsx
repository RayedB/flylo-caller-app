"use client";

import type { ReactNode } from "react";

export function IPhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="iphone-float relative mx-auto w-[min(100%,320px)] sm:w-[340px]">
      <div className="relative rounded-[3rem] bg-gradient-to-b from-zinc-200 via-zinc-300 to-zinc-500 p-[10px] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.12)_inset]">
        <div className="relative overflow-hidden rounded-[2.45rem] bg-black aspect-[9/19.5]">
          {/* Dynamic Island */}
          <div className="pointer-events-none absolute left-1/2 top-3 z-20 h-[28px] w-[112px] -translate-x-1/2 rounded-full bg-black shadow-[0_0_0_1px_rgba(255,255,255,0.06)]" />
          {/* Side buttons (visual) */}
          <div className="pointer-events-none absolute -left-[12px] top-28 h-8 w-[3px] rounded-l bg-zinc-400" />
          <div className="pointer-events-none absolute -left-[12px] top-40 h-14 w-[3px] rounded-l bg-zinc-400" />
          <div className="pointer-events-none absolute -left-[12px] top-56 h-14 w-[3px] rounded-l bg-zinc-400" />
          <div className="pointer-events-none absolute -right-[12px] top-44 h-20 w-[3px] rounded-r bg-zinc-400" />

          <div className="absolute inset-0 flex flex-col text-white">
            {children}
          </div>

          {/* Home indicator */}
          <div className="pointer-events-none absolute bottom-2 left-1/2 z-20 h-1 w-28 -translate-x-1/2 rounded-full bg-white/35" />
        </div>
      </div>
    </div>
  );
}