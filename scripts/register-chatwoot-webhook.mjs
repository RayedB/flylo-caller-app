// Registers (or updates) the Chatwoot account webhook that triggers callbacks,
// then saves its signing secret to .env.local as CHATWOOT_WEBHOOK_SECRET.
// Usage: npm run chatwoot:webhook
import { readFileSync, writeFileSync } from "node:fs";

const ENV_FILE = ".env.local";
const { CHATWOOT_BASE_URL, CHATWOOT_ACCOUNT_ID, CHATWOOT_USER_ACCESS_TOKEN } = process.env;
// Chatwoot runs in Docker, so it reaches this app through the host alias.
const target =
  process.env.CHATWOOT_WEBHOOK_TARGET_URL || "http://host.docker.internal:3000/api/chatwoot/webhook";

if (!CHATWOOT_BASE_URL || !CHATWOOT_ACCOUNT_ID || !CHATWOOT_USER_ACCESS_TOKEN) {
  console.error("Set CHATWOOT_BASE_URL, CHATWOOT_ACCOUNT_ID and CHATWOOT_USER_ACCESS_TOKEN in .env.local first.");
  process.exit(1);
}

const api = `${CHATWOOT_BASE_URL.replace(/\/$/, "")}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/webhooks`;
const headers = { api_access_token: CHATWOOT_USER_ACCESS_TOKEN, "Content-Type": "application/json" };

async function call(url, init) {
  const res = await fetch(url, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${url} -> ${res.status} ${JSON.stringify(body)}`);
  return body;
}

const list = await call(api);
const existing = (list.payload?.webhooks ?? list.payload ?? []).find((w) =>
  String(w.url).includes("/api/chatwoot/webhook"),
);
const webhook = {
  url: target,
  subscriptions: ["message_created", "conversation_status_changed"],
  name: "FlyLo callbacks",
};
const saved = existing
  ? await call(`${api}/${existing.id}`, { method: "PATCH", body: JSON.stringify({ webhook }) })
  : await call(api, { method: "POST", body: JSON.stringify({ webhook }) });
const hook = saved.payload?.webhook ?? saved.payload ?? saved;
if (!hook.secret) throw new Error(`Chatwoot did not return a webhook secret: ${JSON.stringify(saved)}`);

const env = readFileSync(ENV_FILE, "utf8");
const line = `CHATWOOT_WEBHOOK_SECRET=${hook.secret}`;
writeFileSync(
  ENV_FILE,
  /^CHATWOOT_WEBHOOK_SECRET=.*$/m.test(env)
    ? env.replace(/^CHATWOOT_WEBHOOK_SECRET=.*$/m, line)
    : `${env.replace(/\n*$/, "\n")}\n# Signs Chatwoot -> app webhooks (set by npm run chatwoot:webhook)\n${line}\n`,
);

console.log(`${existing ? "Updated" : "Created"} webhook #${hook.id} -> ${hook.url}`);
console.log(`Saved CHATWOOT_WEBHOOK_SECRET to ${ENV_FILE}.`);
console.log("Chatwoot in Docker also needs SAFE_FETCH_ALLOW_PRIVATE_NETWORK=true to reach a local app.");
