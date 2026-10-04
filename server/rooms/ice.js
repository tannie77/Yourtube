const DEFAULT_STUN = "stun:stun.cloudflare.com:3478";

function urls(value, schemes) {
  const entries = String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
  if (entries.length > 8 || entries.some((item) => item.length > 250 || !schemes.some((scheme) => item.startsWith(`${scheme}:`)) || /[\s<>]/.test(item))) {
    throw new Error("Invalid room ICE server configuration.");
  }
  return entries;
}

export function roomIceConfiguration(environment = process.env) {
  const stun = urls(environment.ROOM_STUN_URLS || DEFAULT_STUN, ["stun", "stuns"]);
  const turn = urls(environment.ROOM_TURN_URLS, ["turn", "turns"]);
  const iceServers = stun.length ? [{ urls: stun }] : [];
  if (turn.length) {
    const username = environment.ROOM_TURN_USERNAME || "";
    const credential = environment.ROOM_TURN_CREDENTIAL || "";
    if (!username || !credential || username.length > 256 || credential.length > 256) throw new Error("TURN username and credential are required for room relay.");
    iceServers.push({ urls: turn, username, credential });
  }
  return { iceServers, relayConfigured: turn.length > 0 };
}
