const KEY = "flylo-device-id";

/** Stable id for this browser so Chatwoot callbacks ring the phone that opened the ticket. */
export function getDeviceId() {
  try {
    let id = window.localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return "anonymous-device";
  }
}
