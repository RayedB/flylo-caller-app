# FlyLo Guest Care (voice demo)

Local Next.js demo: an iPhone on a desk. Tap **call** to talk to FlyLo Guest Care over the [xAI Grok Speech-to-Speech API](https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech), or tap **message** to chat by text instead. Both modes use the same realtime session (model alias `grok-voice-think-fast-latest`). The agent looks up flights on the FlyLo booking API and opens Chatwoot tickets when it cannot resolve an issue.

## Install

**Requirements:** Node.js 20+ and npm.

```bash
git clone https://github.com/RayedB/flylo-caller-app.git
cd flylo-caller-app
npm install
cp .env.example .env.local
```

Edit `.env.local` and set at least `XAI_API_KEY` (from [console.x.ai](https://console.x.ai)). Add Chatwoot vars if you want live support tickets.

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and allow the microphone when prompted.

### Environment

| Variable | Purpose |
| --- | --- |
| `XAI_API_KEY` | Mint ephemeral realtime tokens (server-only) |
| `XAI_VOICE_ID` | Agent voice: built-in `eve` (default), `ara`, `rex`, `sal`, `leo`, or a team custom voice id. Unknown custom ids log a warning and fall back to `eve` |
| `FLYLO_API_BASE_URL` | Booking API origin (default in `.env.example`: `http://localhost:8787`) |
| `FLYLO_API_KEY` | Optional Bearer if your FlyLo deploy needs auth |
| `CHATWOOT_BASE_URL` | Chatwoot origin |
| `CHATWOOT_ACCOUNT_ID` | Account id |
| `CHATWOOT_INBOX_ID` | API inbox id |
| `CHATWOOT_USER_ACCESS_TOKEN` | Profile → Access Token |
| `TRIAGE_FALLBACK_URL` | Optional triage webhook if Chatwoot cannot reach the host |

Without Chatwoot env vars, `create_support_ticket` returns a dry-run error the agent can explain; flight tools still work.

## Demo script

1. Tap **call** on the FlyLo Guest Care contact card. Guest Care greets you.
2. Ask: *“What flights do you have from London to Paris on October 20th?”*
3. Follow up: *“How much is the cheapest Linen cabin?”*
4. Escalate: *“My baggage was damaged and I need someone to follow up. My name is Alex Guest, email alex@example.com, phone +1 415 555 0100.”*
5. Confirm the agent opens a ticket and shows the Chatwoot id on the phone UI. Check the API inbox in Chatwoot.

**Chat mode:** tap **message** on the contact card (no mic needed), then type the same questions or tap a suggestion.

## Callbacks

The phone keeps a live connection to the app (Server-Sent Events, `GET /api/callbacks/stream`) so Guest Care can call the guest back from Chatwoot.

**Setup (once):**
1. Let Chatwoot's webhooks reach your machine. In the Chatwoot `.env`, set `SAFE_FETCH_ALLOW_PRIVATE_NETWORK=true` (local development only), then restart Chatwoot.
2. Run `npm run chatwoot:webhook`. It registers the account webhook (`message_created`, `conversation_status_changed`) and saves `CHATWOOT_WEBHOOK_SECRET` to `.env.local`. Deliveries are verified with Chatwoot's HMAC signature.

**How agents trigger a callback:**
- **Resolve the ticket.** If the guest asked to hear back (label `callback-requested`), the app calls them automatically and reads out the agent's latest reply or note as the resolution.
- **Private note `/callback <what to tell the guest>`.** Calls right away with that message, on any ticket.

**What happens next (all logged as private notes on the ticket):**
- The phone that opened the ticket rings. If it is offline, the call is queued and rings when the app opens.
- Declined, missed, busy, or dropped calls stay owed and show under Recents on the phone.
- If the guest raises something new, the agent adds it to the ticket (`add_ticket_update`). When they want another call back, the ticket is reopened and labelled `callback-requested` again.
- After the call, the transcript is posted to the ticket.

Chatwoot is the durable record: the `callback-requested` label plus the `callback_pending` and `device_id` conversation attributes. Live state (connected phones, ringing calls) is in memory, so run a single app server process.

## Architecture

- Browser ↔ xAI realtime WebSocket (ephemeral `xai-client-secret`). Voice calls also stream mic audio to `wss://api.x.ai/v1/stt` (its own ephemeral token) for live guest captions
- `POST /api/voice/session` mints the token with your API key. Body `{ "mode": "voice" | "chat" }` (default `voice`) picks the instructions and turn detection
- Chat mode sends typed `input_text` turns with `turn_detection: null`; the API still streams audio, which the client does not play, and shows the reply transcript as chat bubbles
- `POST /api/tools` runs allowlisted FlyLo lookups + Chatwoot ticket create
- UI: desk scene + CSS iPhone 16 Pro frame with live status bar (`components/IPhoneFrame.tsx`); iOS contact card and call screen (`CallScreen.tsx`); iMessage-style chat (`ChatScreen.tsx`)
