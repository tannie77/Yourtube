type Transformable = { transform?: unknown };

export function roomKeyFromHash(hash: string): Uint8Array | null {
  const value = new URLSearchParams(hash.replace(/^#/, "")).get("e2ee");
  if (!value || !/^[A-Za-z0-9_-]{43}$/.test(value)) return null;
  try {
    const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/") + "=");
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch { return null; }
}

export function supportsRoomE2EE() {
  return typeof Worker !== "undefined" && typeof RTCRtpScriptTransform !== "undefined" &&
    typeof RTCRtpSender !== "undefined" && "transform" in RTCRtpSender.prototype &&
    typeof RTCRtpReceiver !== "undefined" && "transform" in RTCRtpReceiver.prototype;
}

export function installRoomE2EE(peer: RTCPeerConnection, worker: Worker, key: Uint8Array) {
  for (const transceiver of peer.getTransceivers()) {
    const options = { key: Array.from(key), media: transceiver.receiver.track.kind };
    (transceiver.sender as Transformable).transform = new RTCRtpScriptTransform(worker, { ...options, direction: "encrypt" });
    (transceiver.receiver as Transformable).transform = new RTCRtpScriptTransform(worker, { ...options, direction: "decrypt" });
  }
}
