import { BUILT_IN_VOICES, DEFAULT_VOICE } from "@/lib/agent-session";

// Server-only. The realtime API silently falls back to a default voice for
// unknown ids, so check custom ids once per server process and warn.
const checked = new Map<string, Promise<boolean>>();

function isBuiltIn(voice: string) {
  return (BUILT_IN_VOICES as readonly string[]).includes(voice);
}

async function customVoiceExists(voiceId: string, apiKey: string) {
  try {
    const res = await fetch(
      `https://api.x.ai/v1/custom-voices/${encodeURIComponent(voiceId)}`,
      { headers: { Authorization: `Bearer ${apiKey}` }, cache: "no-store" },
    );
    if (res.status === 404) return false;
    return true; // treat other failures as unknown and let the API decide
  } catch {
    return true;
  }
}

export async function resolveVoice(apiKey: string): Promise<string> {
  const voice = process.env.XAI_VOICE_ID?.trim() || DEFAULT_VOICE;
  if (isBuiltIn(voice)) return voice;

  if (!checked.has(voice)) {
    checked.set(voice, customVoiceExists(voice, apiKey));
  }
  if (!(await checked.get(voice))) {
    console.warn(
      `XAI_VOICE_ID "${voice}" is not a custom voice on this team; using "${DEFAULT_VOICE}".`,
    );
    return DEFAULT_VOICE;
  }
  return voice;
}
