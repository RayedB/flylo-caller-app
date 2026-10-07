// SF Symbols–style glyphs used across the phone screens.
type P = { size?: number; className?: string };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  "aria-hidden": true as const,
});

export function PhoneFill({ size = 22, className }: P) {
  return (
    <svg {...base(size)} fill="currentColor" className={className}>
      <path d="M6.6 10.8a15.1 15.1 0 006.6 6.6l2.2-2.2a1.2 1.2 0 011.2-.3 13 13 0 004 .6 1.2 1.2 0 011.2 1.2V20a1.2 1.2 0 01-1.2 1.2A17.8 17.8 0 012.8 3.2 1.2 1.2 0 014 2h3.3a1.2 1.2 0 011.2 1.2 13 13 0 00.6 4 1.2 1.2 0 01-.3 1.2L6.6 10.8z" />
    </svg>
  );
}

export function PhoneDown({ size = 30, className }: P) {
  return (
    <svg {...base(size)} fill="currentColor" className={className}>
      <path d="M21.4 14.9l-2 1.6a1.4 1.4 0 01-1.6.1l-2.2-1.3a1.4 1.4 0 01-.7-1.3l.1-1.7a12.4 12.4 0 00-6 0l.1 1.7a1.4 1.4 0 01-.7 1.3l-2.2 1.3a1.4 1.4 0 01-1.6-.1l-2-1.6a1.4 1.4 0 01-.2-2C5.1 10 8.4 8.6 12 8.6s6.9 1.4 9.6 4.3a1.4 1.4 0 01-.2 2z" />
    </svg>
  );
}

export function MessageFill({ size = 22, className }: P) {
  return (
    <svg {...base(size)} fill="currentColor" className={className}>
      <path d="M12 3C6.5 3 2 6.6 2 11c0 2.4 1.3 4.5 3.4 6L4.6 20.4a.6.6 0 00.9.7L9.3 19c.9.2 1.8.3 2.7.3 5.5 0 10-3.6 10-8.1S17.5 3 12 3z" />
    </svg>
  );
}

export function EnvelopeFill({ size = 22, className }: P) {
  return (
    <svg {...base(size)} fill="currentColor" className={className}>
      <path d="M3.5 5h17A1.5 1.5 0 0122 6.5v.3l-10 6.1L2 6.8v-.3A1.5 1.5 0 013.5 5zM2 8.9v8.6A1.5 1.5 0 003.5 19h17a1.5 1.5 0 001.5-1.5V8.9l-9.5 5.8a1 1 0 01-1 0L2 8.9z" />
    </svg>
  );
}

export function MicFill({ size = 26, className, slashed }: P & { slashed?: boolean }) {
  return (
    <svg {...base(size)} fill="currentColor" className={className}>
      <path d="M12 14.5a3.5 3.5 0 003.5-3.5V5.5a3.5 3.5 0 00-7 0V11a3.5 3.5 0 003.5 3.5zm6-3.6a.9.9 0 00-1.8 0 4.2 4.2 0 01-8.4 0 .9.9 0 00-1.8 0 6 6 0 005.1 5.9V19H8.8a.9.9 0 000 1.8h6.4a.9.9 0 000-1.8h-2.3v-2.2A6 6 0 0018 10.9z" />
      {slashed ? (
        <path d="M4.2 3.4l16.4 16.4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      ) : null}
    </svg>
  );
}

export function SpeakerWave({ size = 26, className }: P) {
  return (
    <svg {...base(size)} fill="currentColor" className={className}>
      <path d="M11.4 4.3L7 8H4.5A1.5 1.5 0 003 9.5v5A1.5 1.5 0 004.5 16H7l4.4 3.7a.9.9 0 001.5-.7V5a.9.9 0 00-1.5-.7z" />
      <path d="M15.6 8.6a.9.9 0 011.3.1 5.2 5.2 0 010 6.6.9.9 0 11-1.4-1.2 3.4 3.4 0 000-4.2.9.9 0 01.1-1.3zM18.4 6a.9.9 0 011.3.1 9.2 9.2 0 010 11.8.9.9 0 01-1.4-1.2 7.4 7.4 0 000-9.4.9.9 0 01.1-1.3z" />
    </svg>
  );
}

export function CaptionsBubble({ size = 26, className }: P) {
  return (
    <svg {...base(size)} fill="currentColor" className={className}>
      <path d="M5 4h14a3 3 0 013 3v8a3 3 0 01-3 3h-6.2l-4.3 3.3a.8.8 0 01-1.3-.6V18H5a3 3 0 01-3-3V7a3 3 0 013-3zm2 5a.9.9 0 000 1.8h6a.9.9 0 000-1.8H7zm0 3.4a.9.9 0 000 1.8h10a.9.9 0 000-1.8H7zm9-3.4a.9.9 0 000 1.8h1a.9.9 0 000-1.8h-1z" />
    </svg>
  );
}

export function ChevronLeft({ size = 22, className }: P) {
  return (
    <svg {...base(size)} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M15 4.5L7.5 12l7.5 7.5" />
    </svg>
  );
}

export function ChevronRight({ size = 10, className }: P) {
  return (
    <svg {...base(size)} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M9 4.5l7.5 7.5L9 19.5" />
    </svg>
  );
}

export function ArrowUp({ size = 16, className }: P) {
  return (
    <svg {...base(size)} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 19.5V5M5.5 11.5L12 5l6.5 6.5" />
    </svg>
  );
}

export function CheckCircle({ size = 14, className }: P) {
  return (
    <svg {...base(size)} fill="currentColor" className={className}>
      <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm4.7 7.3l-5.5 6a1 1 0 01-1.5 0l-2.4-2.6a1 1 0 111.5-1.4l1.7 1.8 4.7-5.2a1 1 0 011.5 1.4z" />
    </svg>
  );
}

/* Status bar glyphs */
export function CellularBars({ className }: { className?: string }) {
  return (
    <svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor" aria-hidden className={className}>
      <rect x="0" y="7.5" width="3" height="3.5" rx="0.8" />
      <rect x="4.6" y="5" width="3" height="6" rx="0.8" />
      <rect x="9.2" y="2.5" width="3" height="8.5" rx="0.8" />
      <rect x="13.8" y="0" width="3" height="11" rx="0.8" />
    </svg>
  );
}

export function WifiGlyph({ className }: { className?: string }) {
  return (
    <svg width="15" height="11" viewBox="0 0 15 11" fill="currentColor" aria-hidden className={className}>
      <path d="M7.5 2.3c2.1 0 4 .8 5.5 2.1a.5.5 0 00.7 0l1-1a.5.5 0 000-.7A10 10 0 007.5 0 10 10 0 00.3 2.7a.5.5 0 000 .7l1 1a.5.5 0 00.7 0 8 8 0 015.5-2.1z" />
      <path d="M7.5 5.7c1.2 0 2.3.4 3.1 1.2a.5.5 0 00.7 0l1-1a.5.5 0 000-.7 6.6 6.6 0 00-9.6 0 .5.5 0 000 .7l1 1a.5.5 0 00.7 0c.8-.8 1.9-1.2 3.1-1.2z" />
      <path d="M9.4 8.6a.5.5 0 000-.7 2.8 2.8 0 00-3.8 0 .5.5 0 000 .7l1.5 1.5a.5.5 0 00.7 0l1.6-1.5z" />
    </svg>
  );
}

export function BatteryGlyph({ className }: { className?: string }) {
  return (
    <svg width="26" height="12" viewBox="0 0 26 12" aria-hidden className={className}>
      <rect x="0.5" y="0.5" width="22" height="11" rx="3.3" fill="none" stroke="currentColor" strokeOpacity="0.4" />
      <rect x="2" y="2" width="16.5" height="8" rx="2" fill="currentColor" />
      <path d="M24 4v4a2.2 2.2 0 000-4z" fill="currentColor" fillOpacity="0.45" />
    </svg>
  );
}
