"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { BatteryGlyph, CellularBars, WifiGlyph } from "@/components/icons";

function subscribeClock(onChange: () => void) {
  const id = window.setInterval(onChange, 5000);
  return () => window.clearInterval(id);
}

function clockSnapshot() {
  return new Date()
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    .replace(/\s?[AP]M$/i, "");
}

// Server render shows Apple's keynote time until the client clock takes over.
const serverClock = () => "9:41";

function StatusBar() {
  const time = useSyncExternalStore(subscribeClock, clockSnapshot, serverClock);
  return (
    <div className="ios-type pointer-events-none absolute inset-x-0 top-0 z-30 flex h-[50px] items-center justify-between pr-[26px] pl-[34px] text-white">
      <span className="w-[54px] text-center text-[15px] font-semibold tracking-[-0.01em] tabular-nums">
        {time}
      </span>
      <span className="flex items-center gap-[5px]">
        <CellularBars />
        <WifiGlyph />
        <BatteryGlyph />
      </span>
    </div>
  );
}

// Device is laid out at 350×731 px; page chrome above/below needs ~285 px.
const DEVICE_W = 350;
const DEVICE_H = 731;
const CHROME_H = 285;
const SIDE_GUTTER = 32;

function subscribeResize(onChange: () => void) {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

function scaleSnapshot() {
  const s = Math.min(
    1,
    (window.innerHeight - CHROME_H) / DEVICE_H,
    (window.innerWidth - SIDE_GUTTER) / DEVICE_W,
  );
  return Math.max(0.6, Math.floor(s * 100) / 100);
}

/** iPhone 16 Pro–style device: titanium band, buttons, Dynamic Island, status bar. */
export function IPhoneFrame({
  children,
  ringing = false,
}: {
  children: ReactNode;
  ringing?: boolean;
}) {
  // Scale the whole device (like a photo of a phone) so iOS layouts never reflow.
  const scale = useSyncExternalStore(subscribeResize, scaleSnapshot, () => 1);
  return (
    <div className="iphone-float iphone-size relative mx-auto" style={{ zoom: scale }}>
      <div className={`relative ${ringing ? "iphone-ring" : ""}`}>
        {/* Left: Action button, volume up, volume down. Right: side button, Camera Control. */}
        <span className="iphone-btn top-[16.5%] -left-[2.5px] h-[4.6%]" />
        <span className="iphone-btn top-[24%] -left-[2.5px] h-[8.4%]" />
        <span className="iphone-btn top-[34.4%] -left-[2.5px] h-[8.4%]" />
        <span className="iphone-btn top-[26%] -right-[2.5px] h-[13%]" />
        <span className="iphone-btn iphone-camera-control top-[58%] -right-[1.5px] h-[7.5%]" />

        <div className="iphone-titanium relative rounded-[3.35rem] p-[3px]">
          {/* Antenna bands */}
          <span className="iphone-antenna top-[8%] left-0" />
          <span className="iphone-antenna top-[8%] right-0" />
          <span className="iphone-antenna bottom-[8%] left-0" />
          <span className="iphone-antenna bottom-[8%] right-0" />

          <div className="rounded-[3.2rem] bg-black p-[9px] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)]">
            <div className="ios-type relative aspect-[9/19.5] overflow-hidden rounded-[2.65rem] bg-black">
              <div className="absolute inset-0 flex flex-col text-white">
                {children}
              </div>

              <StatusBar />

              {/* Dynamic Island */}
              <div className="pointer-events-none absolute top-[11px] left-1/2 z-40 flex h-[31px] w-[33%] -translate-x-1/2 items-center justify-end rounded-full bg-black pr-[9px]">
                <span className="h-[11px] w-[11px] rounded-full bg-[radial-gradient(circle_at_35%_35%,#2b3550_0%,#0d1018_55%,#000_100%)] shadow-[0_0_0_1.5px_#0b0b0d]" />
              </div>

              {/* Glass glare */}
              <div className="iphone-glare pointer-events-none absolute inset-0 z-50" />

              {/* Home indicator */}
              <div className="pointer-events-none absolute bottom-[7px] left-1/2 z-40 h-[5px] w-[36%] -translate-x-1/2 rounded-full bg-white/85" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

