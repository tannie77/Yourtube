import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Circle,
  Copy,
  Camera,
  CameraOff,
  Download,
  DoorOpen,
  Hand,
  LockKeyhole,
  MessageCircle,
  Mic,
  MicOff,
  MonitorUp,
  Paperclip,
  RefreshCw,
  Send,
  ShieldCheck,
  Signal,
  UserRound,
  UsersRound,
  VideoOff,
  X,
} from "lucide-react";
import { useRoomLobby, type HostAction } from "@/lib/use-room-lobby";
import type { ChatEntry, RoomParticipant } from "@/lib/room-types";
import RoomRecorder from "@/components/RoomRecorder";
import styles from "../rooms.module.css";

function Setting({ label, detail, enabled, busy, onClick }: {
  label: string; detail: string; enabled: boolean; busy: boolean; onClick: () => void;
}) {
  return <button type="button" className={styles.setting} aria-pressed={enabled} disabled={busy} onClick={onClick}>
    <span><strong>{label}</strong><small>{detail}</small></span><span className={styles.switch} aria-hidden="true"><span /></span>
  </button>;
}

function roleLabel(role: RoomParticipant["role"]) {
  return role === "host" ? "Host" : role === "cohost" ? "Co-host" : "Member";
}

function downloadFile(entry: Extract<ChatEntry, { kind: "file" }>) {
  const bytes = Uint8Array.from(atob(entry.data), (character) => character.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = entry.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function callTime(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function VideoTile({ name, label, stream, muted = false, cameraOn = false, micOn = false, sharing = false, speaking = false, handRaised = false, connection = "unknown" }: {
  name: string; label: string; stream?: MediaStream | null; muted?: boolean; cameraOn?: boolean; micOn?: boolean;
  sharing?: boolean; speaking?: boolean; handRaised?: boolean; connection?: RoomParticipant["connection"];
}) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    element.srcObject = stream || null;
    if (stream) void element.play().catch(() => { /* Browser autoplay can require interaction. */ });
    return () => { element.srcObject = null; };
  }, [stream]);
  return <div className={styles.videoTile} data-speaking={speaking}>
    <video ref={video} autoPlay playsInline muted={muted} className={styles.tileVideo} data-visible={cameraOn || sharing} data-sharing={sharing} />
    {!cameraOn && !sharing && <span className={styles.tileAvatar} aria-hidden="true">{name.charAt(0).toUpperCase()}</span>}
    {sharing && <span className={styles.tileSharingBadge}><MonitorUp aria-hidden="true" />Presenting</span>}
    <div className={styles.tileFooter}><span className={styles.tileIdentity}><strong>{name}</strong>{label && <small>{label}</small>}{handRaised && <Hand aria-label="Hand raised" />}</span><span className={styles.tileStatus} title={`Connection ${connection}`}>{micOn ? <Mic aria-label="Microphone on" /> : <MicOff aria-label="Microphone off" />}{connection !== "unknown" && <Signal aria-label={`Connection ${connection}`} />}</span></div>
  </div>;
}

export default function RoomPage() {
  const router = useRouter();
  const roomId = typeof router.query.id === "string" ? router.query.id : "";
  const { room, loading, state, selfId, participants, messages, remoteStreams, localStream, micOn, cameraOn, cameraDeviceId, sharing, speaking, noiseSuppression, lowBandwidth, devices, mediaBusy, seconds, error, notice, setError, setNotice, refresh, refreshDevices, join, leave, toggleMic, toggleCamera, toggleShare, switchDevice, toggleNoise, toggleLowBandwidth, hostAction, setRecordingStatus, toggleHand, sendChat, sendFile } = useRoomLobby(roomId);
  const [actionBusy, setActionBusy] = useState("");
  const [handBusy, setHandBusy] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const [fileBusy, setFileBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const messagesPanel = useRef<HTMLDivElement>(null);
  const joined = state === "joined";
  const self = participants.find((participant) => participant.id === selfId);
  const role = self?.role;
  const isHost = role === "host";
  const canModerate = isHost || role === "cohost";
  const canChat = joined && (room?.allowChat || canModerate);
  const showMedia = joined || (state === "reconnecting" && Boolean(localStream));
  const activeMicId = localStream?.getAudioTracks()[0]?.getSettings().deviceId || "";
  const activeCameraId = cameraDeviceId;
  const blocked = Boolean(room?.endedAt || room?.isRemoved || state === "ended" || state === "removed");
  const recorderNames = useMemo(() => Object.fromEntries([
    ["local", participants.find((participant) => participant.id === selfId)?.name || "You"],
    ...participants.filter((participant) => participant.id !== selfId).map((participant) => [participant.id, participant.name]),
  ]), [participants, selfId]);

  useEffect(() => {
    const panel = messagesPanel.current;
    if (panel && panel.scrollHeight - panel.scrollTop - panel.clientHeight < 140) panel.scrollTop = panel.scrollHeight;
  }, [messages.length]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/rooms/${roomId}${window.location.hash}`);
      setCopied(true);
      setNotice("Room link copied. Share it with another signed-in person.");
      window.setTimeout(() => setCopied(false), 2500);
    } catch { setError("Could not copy the link. You can copy it from the address bar."); }
  }

  async function act(action: HostAction, success: string) {
    if (actionBusy) return;
    if (action.type === "end" && !window.confirm("End this room for everyone? The link cannot be reused.")) return;
    if (action.type === "remove" && !window.confirm("Remove this participant? They cannot rejoin this room.")) return;
    setActionBusy(`${action.type}-${action.target || "room"}`);
    setError("");
    try {
      const result = await hostAction(action);
      if (!result.ok) setError(result.message || "Could not change the room.");
      else setNotice(success);
    } finally { setActionBusy(""); }
  }

  async function raiseHand() {
    if (handBusy || !self) return;
    setHandBusy(true);
    setError("");
    try {
      const result = await toggleHand(!self.handRaised);
      if (!result.ok) setError(result.message || "Could not update your hand status.");
    } finally { setHandBusy(false); }
  }

  async function postMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (chatBusy || !canChat || !draft.trim()) return;
    setChatBusy(true);
    setError("");
    try {
      const result = await sendChat(draft);
      if (result.ok) setDraft("");
      else setError(result.message || "Could not send your message.");
    } finally { setChatBusy(false); }
  }

  async function shareFile(file: File) {
    if (fileBusy || !canChat) return;
    setFileBusy(true);
    setError("");
    try {
      const result = await sendFile(file);
      if (!result.ok) setError(result.message || "Could not share that file.");
    } finally { setFileBusy(false); }
  }

  if (!router.isReady || loading) return <main className="yt-page"><div className={styles.loading}>Opening room…</div></main>;
  if (!room) return <main className="yt-page"><div className={styles.notFound}><VideoOff aria-hidden="true" /><h1>Room unavailable</h1><p>{error || "This room link could not be opened."}</p><Link href="/rooms" className="yt-pill-button"><ArrowLeft aria-hidden="true" />Back to rooms</Link></div></main>;

  return <main className="yt-page">
    <div className={styles.roomTop}><Link href="/rooms" className={styles.backLink}><ArrowLeft aria-hidden="true" />All rooms</Link><span className={styles.roomStatus} data-state={blocked ? "blocked" : joined ? "joined" : "waiting"}><span />{room.endedAt ? "Ended" : room.isRemoved ? "Access removed" : joined ? "You are in the room" : room.locked ? "Entry locked" : "Ready to join"}</span></div>
    <section className={styles.roomHero} aria-labelledby="room-heading">
      <div><h1 id="room-heading">{room.title}</h1><p>{room.isHost ? "You are the host. Share the link and manage this room." : "Join the lobby to see who is here and connect with the host."}</p></div>
      <div className={styles.roomHeroBadge}><UsersRound aria-hidden="true" /><strong>{joined ? participants.length : "—"}<span> / {room.participantLimit}</span></strong><small>{joined ? "People here" : "Join to see people"}</small></div>
    </section>
    <p className={styles.cardCopy}><ShieldCheck className="inline size-4" aria-hidden="true" /> {room.e2eeRequired ? "Media is end-to-end encrypted when you join with the complete invitation link in a supported browser. The link contains the secret key; share it only with invitees." : "This older room uses WebRTC transport encryption."}</p>
    {joined && room.recording && <p className={styles.recordingBanner} role="status"><Circle aria-hidden="true" />The host is recording this room to a local file.</p>}

    <div className={styles.roomLayout}>
      <div className={styles.roomMain}>
        {error && <p className={styles.formError} role="alert">{error}</p>}
        {!error && notice && <p className={styles.notice} role="status">{notice}</p>}
        <section className={styles.roomCard} aria-labelledby="lobby-heading">
          <div className={styles.cardHeader}><div><span className={styles.cardIcon}><VideoOff aria-hidden="true" /></span><h2 id="lobby-heading">Room lobby</h2></div><span className={styles.noMediaBadge}>{cameraOn && micOn ? "Camera and mic on" : cameraOn ? "Camera on · mic off" : micOn ? "Mic on · camera off" : "Camera and mic off"}</span></div>
          {room.endedAt || state === "ended" ? <p className={styles.cardCopy}>The host ended this room. Create a new room to meet again.</p>
            : room.isRemoved || state === "removed" ? <p className={styles.cardCopy}>A host removed your account from this room. This link cannot be used to rejoin.</p>
            : joined ? <><p className={styles.cardCopy}>You are connected. Your camera, microphone, and screen only start when you choose to enable them. The room stays available through this link if you leave.</p><div className={styles.lobbyActions}><button type="button" className={styles.secondaryButton} onClick={leave}><DoorOpen aria-hidden="true" />Leave room</button><button type="button" className={styles.secondaryButton} aria-pressed={Boolean(self?.handRaised)} disabled={handBusy || !self} onClick={() => void raiseHand()}><Hand aria-hidden="true" />{self?.handRaised ? "Lower hand" : "Raise hand"}</button><button type="button" className={styles.secondaryButton} onClick={() => void copyLink()}>{copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{copied ? "Copied" : "Copy room link"}</button></div></>
            : <><p className={styles.cardCopy}>{room.locked && !room.isHost ? "The host has locked entry. Co-hosts may still rejoin; other members need the host to unlock it." : "Choose how to join. Your browser only asks for camera or microphone access when you choose the media option."}</p><div className={styles.lobbyActions}><button type="button" className="yt-primary-button" disabled={state === "joining" || state === "reconnecting"} onClick={() => void join(false)}><UsersRound aria-hidden="true" />{state === "joining" ? "Joining…" : state === "reconnecting" ? "Reconnecting…" : "Join without media"}</button><button type="button" className={styles.secondaryButton} disabled={state === "joining" || state === "reconnecting"} onClick={() => void join(true)}><Camera aria-hidden="true" />Join with camera and mic</button>{state === "reconnecting" && <button type="button" className={styles.secondaryButton} onClick={leave}>Cancel</button>}<button type="button" className={styles.secondaryButton} onClick={() => void copyLink()}>{copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{copied ? "Copied" : "Copy link"}</button></div></>}
        </section>

        {showMedia && <section className={styles.roomCard} aria-labelledby="call-heading">
          <div className={styles.cardHeader}><div><span className={styles.cardIcon}><Camera aria-hidden="true" /></span><h2 id="call-heading">Live room</h2></div><span className={styles.countBadge}>{state === "reconnecting" ? "Reconnecting…" : callTime(seconds)}</span></div>
          <div className={styles.videoGrid}>
            <VideoTile name={self?.name || "You"} label="You" stream={localStream} muted cameraOn={cameraOn} micOn={micOn} sharing={sharing} speaking={speaking} handRaised={Boolean(self?.handRaised)} connection={state === "reconnecting" ? "poor" : "good"} />
            {participants.filter((participant) => participant.id !== selfId).map((participant) => <VideoTile key={participant.id} name={participant.name} label={roleLabel(participant.role)} stream={remoteStreams[participant.id]} cameraOn={participant.cameraOn} micOn={participant.micOn} sharing={participant.sharing} speaking={participant.speaking} handRaised={participant.handRaised} connection={participant.connection} />)}
          </div>
          <div className={styles.mediaControls} aria-label="Call controls"><button type="button" className={styles.secondaryButton} aria-pressed={micOn} disabled={!joined || mediaBusy} onClick={() => void toggleMic()}>{micOn ? <Mic aria-hidden="true" /> : <MicOff aria-hidden="true" />}{micOn ? "Mute mic" : "Turn on mic"}</button><button type="button" className={styles.secondaryButton} aria-pressed={cameraOn} disabled={!joined || mediaBusy} onClick={() => void toggleCamera()}>{cameraOn ? <Camera aria-hidden="true" /> : <CameraOff aria-hidden="true" />}{cameraOn ? "Turn off camera" : "Turn on camera"}</button><button type="button" className={styles.secondaryButton} aria-pressed={sharing} disabled={!joined || mediaBusy || (!sharing && !room.allowShare && !canModerate)} onClick={() => void toggleShare()}><MonitorUp aria-hidden="true" />{sharing ? "Stop sharing" : "Share screen"}</button></div>
        </section>}

        {joined && <section className={styles.roomCard} aria-labelledby="people-heading"><div className={styles.cardHeader}><div><span className={styles.cardIcon}><UsersRound aria-hidden="true" /></span><h2 id="people-heading">People in this room</h2></div><span className={styles.countBadge}>{participants.length} of {room.participantLimit}</span></div>
          <div className={styles.peopleList}>{participants.map((participant) => <div key={participant.id} className={styles.personRow}>
            <span className={styles.avatar}><UserRound aria-hidden="true" /></span><div className={styles.personIdentity}><strong>{participant.name}{participant.id === selfId ? " (you)" : ""}</strong><span>{roleLabel(participant.role)} · {participant.micOn ? "mic on" : "mic off"} · {participant.cameraOn ? "camera on" : "camera off"}{participant.speaking ? " · speaking" : ""}{participant.sharing ? " · presenting" : ""}</span>{participant.handRaised && <span className={styles.raisedBadge}><Hand aria-hidden="true" />Hand raised</span>}</div>
            {canModerate && participant.id !== selfId && participant.role !== "host" && <div className={styles.personActions}>{participant.micOn && <button type="button" className={styles.secondaryButton} aria-label={`Mute ${participant.name}`} disabled={Boolean(actionBusy)} onClick={() => void act({ type: "mute", target: participant.id }, "Participant muted.")}><MicOff aria-hidden="true" />Mute</button>}{isHost && <button type="button" className={styles.secondaryButton} aria-label={`${participant.role === "cohost" ? "Remove co-host access from" : "Make co-host"} ${participant.name}`} disabled={Boolean(actionBusy)} onClick={() => void act({ type: "cohost", target: participant.id, value: participant.role !== "cohost" }, participant.role === "cohost" ? "Co-host access removed." : "Co-host access granted.")}><ShieldCheck aria-hidden="true" />{participant.role === "cohost" ? "Remove co-host" : "Make co-host"}</button>}{(isHost || participant.role === "member") && <button type="button" className={styles.removeButton} aria-label={`Remove ${participant.name} from room`} disabled={Boolean(actionBusy)} onClick={() => void act({ type: "remove", target: participant.id }, "Participant removed.")}><X aria-hidden="true" />Remove</button>}</div>}
          </div>)}</div>
        </section>}

        {joined && <section className={styles.roomCard} aria-labelledby="chat-heading">
          <div className={styles.cardHeader}><div><span className={styles.cardIcon}><MessageCircle aria-hidden="true" /></span><h2 id="chat-heading">Room conversation</h2></div><span className={styles.countBadge}>Live only</span></div>
          <p className={styles.cardCopy}>Messages and files appear for people currently in the room. They clear when you leave or refresh.</p>
          <div ref={messagesPanel} className={styles.messageList} role="log" aria-label="Room messages" aria-live="polite">
            {messages.length ? messages.map((entry) => <div key={entry.id} className={styles.messageRow}>
              <span className={styles.messageAvatar}><UserRound aria-hidden="true" /></span>
              <div className={styles.messageBody}><div className={styles.messageMeta}><strong>{entry.from === selfId ? "You" : entry.name}</strong><time dateTime={entry.sentAt}>{new Date(entry.sentAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time></div>
                {entry.kind === "text" ? <p className={styles.messageText}>{entry.text}</p> : <button type="button" className={styles.fileDownload} onClick={() => downloadFile(entry)}><Download aria-hidden="true" /><span><strong>{entry.fileName}</strong><small>{Math.ceil(entry.size / 1024)} KB · Download file</small></span></button>}
              </div>
            </div>) : <p className={styles.emptyChat}>No messages yet. Start the conversation here.</p>}
          </div>
          {!canChat && <p className={styles.chatRestriction}>The host has paused messages and files for members.</p>}
          <form className={styles.chatComposer} onSubmit={(event) => void postMessage(event)}>
            <label htmlFor="room-message">Message</label>
            <div className={styles.composerRow}><input id="room-message" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={canChat ? "Write a message…" : "Chat is paused by the host"} maxLength={1000} disabled={!canChat || chatBusy} />
              <input ref={fileInput} type="file" hidden disabled={!canChat || fileBusy} onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void shareFile(file); }} />
              <button type="button" className={styles.attachButton} aria-label="Share a file up to 128 KB" title="Share a file up to 128 KB" disabled={!canChat || fileBusy} onClick={() => fileInput.current?.click()}><Paperclip aria-hidden="true" /></button>
              <button type="submit" className={styles.sendButton} aria-label="Send message" disabled={!canChat || chatBusy || !draft.trim()}><Send aria-hidden="true" /></button>
            </div>
            <small>Files up to 128 KB · {draft.length}/1000 characters</small>
          </form>
        </section>}
      </div>

      <aside className={styles.roomAside} aria-label="Room details">
        <section className={styles.roomCard}><div className={styles.cardHeader}><div><span className={styles.cardIcon}><LockKeyhole aria-hidden="true" /></span><h2>Room access</h2></div></div><p className={styles.cardCopy}>Only signed-in people with this room link can try to join. The host can lock entry or end the room.</p><div className={styles.factList}><div><span>Entry</span><strong>{room.locked ? "Locked" : "Open"}</strong></div><div><span>Chat and files</span><strong>{room.allowChat ? "Allowed" : "Host/co-host only"}</strong></div><div><span>Screen sharing</span><strong>{room.allowShare ? "Allowed" : "Host/co-host only"}</strong></div><div><span>Your role</span><strong>{role ? roleLabel(role) : room.isHost ? "Host" : "Member"}</strong></div></div><button type="button" className={styles.secondaryButton} disabled={loading} onClick={() => void refresh()}><RefreshCw aria-hidden="true" />Refresh details</button></section>

        {showMedia && <section className={styles.roomCard} aria-labelledby="devices-heading">
          <div className={styles.cardHeader}><div><span className={styles.cardIcon}><Camera aria-hidden="true" /></span><h2 id="devices-heading">Your devices</h2></div></div>
          <p className={styles.cardCopy}>Choose another microphone or camera after your browser grants access. Your video preview is always muted for you.</p>
          <div className={styles.deviceFields}>
            <label htmlFor="room-microphone">Microphone<select id="room-microphone" value={activeMicId} disabled={!joined || mediaBusy} onChange={(event) => void switchDevice("audio", event.target.value)}><option value="">Default microphone</option>{devices.filter((device) => device.kind === "audioinput" && device.deviceId).map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}</select></label>
            <label htmlFor="room-camera">Camera<select id="room-camera" value={activeCameraId} disabled={!joined || mediaBusy} onChange={(event) => void switchDevice("video", event.target.value)}><option value="">Default camera</option>{devices.filter((device) => device.kind === "videoinput" && device.deviceId).map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}</select></label>
          </div>
          <div className={styles.settingList}><Setting label="Noise suppression" detail="Reduce background microphone noise" enabled={noiseSuppression} busy={mediaBusy || !localStream?.getAudioTracks().length} onClick={() => void toggleNoise()} /><Setting label="Low bandwidth video" detail="Adjusts automatically when the network is slow; choose manually to override" enabled={lowBandwidth} busy={mediaBusy} onClick={() => void toggleLowBandwidth()} /></div>
          <button type="button" className={styles.secondaryButton} disabled={mediaBusy} onClick={() => void refreshDevices()}><RefreshCw aria-hidden="true" />Refresh devices</button>
        </section>}

        {joined && isHost && <section className={styles.roomCard} aria-labelledby="recording-heading"><div className={styles.cardHeader}><div><span className={styles.cardIcon}><Circle aria-hidden="true" /></span><h2 id="recording-heading">Record this room</h2></div></div><RoomRecorder roomId={roomId} localStream={localStream} remoteStreams={remoteStreams} names={recorderNames} onStatus={setRecordingStatus} onNotice={setNotice} /></section>}

        {joined && isHost && <section className={styles.roomCard} aria-labelledby="controls-heading"><div className={styles.cardHeader}><div><span className={styles.cardIcon}><ShieldCheck aria-hidden="true" /></span><h2 id="controls-heading">Host controls</h2></div></div><div className={styles.settingList}><Setting label="Lock entry" detail="Keep new members out" enabled={room.locked} busy={Boolean(actionBusy)} onClick={() => void act({ type: "lock", value: !room.locked }, room.locked ? "Entry unlocked." : "Entry locked.")} /><Setting label="Allow chat and files" detail="Members can send messages" enabled={room.allowChat} busy={Boolean(actionBusy)} onClick={() => void act({ type: "allowChat", value: !room.allowChat }, room.allowChat ? "Chat limited to hosts." : "Chat opened to everyone.")} /><Setting label="Allow screen sharing" detail="Members can present" enabled={room.allowShare} busy={Boolean(actionBusy)} onClick={() => void act({ type: "allowShare", value: !room.allowShare }, room.allowShare ? "Sharing limited to hosts." : "Sharing opened to everyone.")} /></div><button type="button" className={styles.endButton} disabled={Boolean(actionBusy)} onClick={() => void act({ type: "end" }, "Room ended for everyone.")}>End room for everyone</button></section>}
      </aside>
    </div>
    <p className={styles.pageNote}>Camera and microphone are optional. Local calls work best on the same network. The host can save a local room recording to their browser.</p>
  </main>;
}
