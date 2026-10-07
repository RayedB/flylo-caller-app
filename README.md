# FlyLo Guest Care (voice demo)

Local Next.js demo: an iPhone on a desk. Tap **Call** to talk to FlyLo Guest Care over the [xAI Grok Speech-to-Speech API](https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech). The agent looks up flights on the FlyLo booking API and opens Chatwoot tickets when it cannot resolve an issue.

## Setup

```bash
cp .env.example .env.local
# fill in XAI_API_KEY and Chatwoot vars
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Allow the microphone when prompted.

### Environment

| Variable | Purpose |
| --- | --- |
| `XAI_API_KEY` | Mint ephemeral realtime tokens (server-only) |
| `FLYLO_API_BASE_URL` | Default `https://booking-api.flylo-air.com` |
| `FLYLO_API_KEY` | Optional Bearer if your FlyLo deploy needs auth |
| `CHATWOOT_BASE_URL` | Self-hosted Chatwoot origin |
| `CHATWOOT_ACCOUNT_ID` | Account id |
| `CHATWOOT_INBOX_ID` | API inbox id |
| `CHATWOOT_USER_ACCESS_TOKEN` | Profile → Access Token |

Without Chatwoot env vars, `create_support_ticket` returns a dry-run error the agent can explain; flight tools still work.

## Demo script

1. Tap **Call** on the phone. Guest Care greets you.
2. Ask: *“What flights do you have from London to Paris on October 20th?”*
3. Follow up: *“How much is the cheapest Linen cabin?”*
4. Escalate: *“My baggage was damaged and I need someone to follow up. My name is Alex Guest, email alex@example.com, phone +1 415 555 0100.”*
5. Confirm the agent opens a ticket and shows the Chatwoot id on the phone UI. Check the API inbox in Chatwoot.

## Architecture

- Browser ↔ xAI realtime WebSocket (ephemeral `xai-client-secret`)
- `POST /api/voice/session` mints the token with your API key
- `POST /api/tools` runs allowlisted FlyLo lookups + Chatwoot ticket create
- UI: desk scene + CSS iPhone frame (`components/IPhoneFrame.tsx`, `CallScreen.tsx`)
