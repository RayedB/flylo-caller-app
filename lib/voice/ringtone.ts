/**
 * Soft two-tone ring built with Web Audio (no asset). Browsers may block
 * audio until the page has had a user gesture; then it stays silent.
 */
export function startRingtone() {
  let ctx: AudioContext | null = null;
  let timer: number | null = null;
  try {
    ctx = new AudioContext();
    void ctx.resume().catch(() => {});
  } catch {
    return () => {};
  }

  const chime = () => {
    if (!ctx || ctx.state !== "running") return;
    const t0 = ctx.currentTime;
    [
      [1318.5, 0],
      [987.8, 0.16],
      [1318.5, 0.32],
      [987.8, 0.48],
    ].forEach(([freq, at]) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t0 + at);
      gain.gain.linearRampToValueAtTime(0.12, t0 + at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + at + 0.3);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(t0 + at);
      osc.stop(t0 + at + 0.32);
    });
  };

  chime();
  timer = window.setInterval(chime, 2200);
  try {
    navigator.vibrate?.([400, 200, 400]);
  } catch {
    /* unsupported */
  }

  return () => {
    if (timer != null) window.clearInterval(timer);
    timer = null;
    try {
      navigator.vibrate?.(0);
    } catch {
      /* unsupported */
    }
    void ctx?.close().catch(() => {});
    ctx = null;
  };
}
