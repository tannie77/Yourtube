import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import axios from "axios";
import axiosInstance from "./axiosinstance";
import type { ChatEntry, RoomInfo, RoomParticipant, RoomState } from "./room-types";

type Ack = { ok: boolean; message?: string; selfId?: string; peers?: RoomParticipant[] };
type Signal = { from: string; type: "offer" | "answer" | "candidate"; description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
export type HostAction = { type: "lock" | "allowChat" | "allowShare" | "cohost" | "mute" | "remove" | "end"; target?: string; value?: boolean };
const MAX_FILE_BYTES = 128 * 1024;

function readFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = reader.result;
      if (typeof value !== "string") return reject(new Error("Could not read that file."));
      resolve(value.slice(value.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

function message(error: unknown, fallback: string) {
  return axios.isAxiosError(error) && typeof error.response?.data?.message === "string"
    ? error.response.data.message : fallback;
}

export function useRoomLobby(roomId: string) {
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<RoomState>("preview");
  const [selfId, setSelfId] = useState("");
  const [participants, setParticipants] = useState<RoomParticipant[]>([]);
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [micOn, setMicOn] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [noiseSuppression, setNoiseSuppression] = useState(true);
  const [lowBandwidth, setLowBandwidth] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const socketRef = useRef<Socket | null>(null);
  const peersRef = useRef(new Map<string, RTCPeerConnection>());
  const streamsRef = useRef(new Map<string, MediaStream>());
  const candidatesRef = useRef(new Map<string, RTCIceCandidateInit[]>());
  const localRef = useRef<MediaStream | null>(null);
  const screenRef = useRef<MediaStreamTrack | null>(null);
  const screenRequestRef = useRef(false);
  const joinedAtRef = useRef<number | null>(null);
  const joinAttemptRef = useRef(0);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try { setDevices(await navigator.mediaDevices.enumerateDevices()); }
    catch { /* Device labels can be hidden until permission is granted. */ }
  }, []);

  const sendPresence = useCallback((changes: Record<string, boolean | string>) => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    socket.timeout(5000).emit("room:presence", changes, (timeout: Error | null, result: Ack) => {
      if (socketRef.current === socket && (timeout || !result?.ok)) setNotice(result?.message || "Call status was not updated.");
    });
  }, []);

  const closePeers = useCallback(() => {
    for (const peer of peersRef.current.values()) peer.close();
    peersRef.current.clear();
    streamsRef.current.clear();
    candidatesRef.current.clear();
    setRemoteStreams({});
  }, []);

  const stopLocal = useCallback(() => {
    const screen = screenRef.current;
    screenRef.current = null;
    if (screen) { screen.onended = null; screen.stop(); }
    localRef.current?.getTracks().forEach((track) => track.stop());
    localRef.current = null;
    setLocalStream(null);
    setMicOn(false);
    setCameraOn(false);
    setSharing(false);
    setSpeaking(false);
  }, []);

  const resetJoinedState = useCallback(() => {
    joinedAtRef.current = null;
    setSeconds(0);
    setSelfId("");
    setParticipants([]);
    setMessages([]);
  }, []);

  const closePeer = useCallback((id: string) => {
    peersRef.current.get(id)?.close();
    peersRef.current.delete(id);
    streamsRef.current.delete(id);
    candidatesRef.current.delete(id);
    setRemoteStreams((current) => { const next = { ...current }; delete next[id]; return next; });
  }, []);

  const createPeer = useCallback((id: string, socket: Socket) => {
    if (typeof RTCPeerConnection === "undefined") { setNotice("WebRTC is unavailable in this browser. Chat still works."); return null; }
    const existing = peersRef.current.get(id);
    if (existing) return existing;
    const peer = new RTCPeerConnection({ iceServers: [] });
    peersRef.current.set(id, peer);
    const stream = new MediaStream();
    streamsRef.current.set(id, stream);
    const audio = peer.addTransceiver("audio", { direction: "sendrecv" });
    const video = peer.addTransceiver("video", { direction: "sendrecv" });
    void audio.sender.replaceTrack(localRef.current?.getAudioTracks()[0] || null);
    void video.sender.replaceTrack(screenRef.current || localRef.current?.getVideoTracks()[0] || null);
    peer.onicecandidate = (event) => {
      if (event.candidate && socketRef.current === socket) socket.emit("room:signal", { to: id, type: "candidate", candidate: event.candidate.toJSON() });
    };
    peer.ontrack = (event) => {
      if (socketRef.current !== socket) return;
      const inbound = event.streams[0] || new MediaStream([event.track]);
      for (const track of inbound.getTracks()) if (!stream.getTracks().some((item) => item.id === track.id)) stream.addTrack(track);
      setRemoteStreams((current) => ({ ...current, [id]: stream }));
    };
    peer.onconnectionstatechange = () => {
      if (socketRef.current !== socket) return;
      if (peer.connectionState === "failed") { setNotice("A peer connection failed. Try rejoining the room."); sendPresence({ connection: "poor" }); }
      else if (peer.connectionState === "connected") sendPresence({ connection: "good" });
      else if (peer.connectionState === "disconnected") sendPresence({ connection: "fair" });
    };
    return peer;
  }, [sendPresence]);

  const handleSignal = useCallback(async (signal: Signal, socket: Socket) => {
    if (socketRef.current !== socket || !signal?.from || !["offer", "answer", "candidate"].includes(signal.type)) return;
    try {
      const peer = createPeer(signal.from, socket);
      if (!peer) return;
      if (signal.type === "candidate") {
        if (!signal.candidate) return;
        if (peer.remoteDescription) await peer.addIceCandidate(signal.candidate);
        else candidatesRef.current.set(signal.from, [...(candidatesRef.current.get(signal.from) || []), signal.candidate]);
        return;
      }
      if (!signal.description) return;
      await peer.setRemoteDescription(signal.description);
      for (const candidate of candidatesRef.current.get(signal.from) || []) await peer.addIceCandidate(candidate);
      candidatesRef.current.delete(signal.from);
      if (signal.type === "offer") {
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        if (socketRef.current === socket) socket.emit("room:signal", { to: signal.from, type: "answer", description: peer.localDescription });
      }
    } catch { if (socketRef.current === socket) setNotice("Could not complete a peer connection. Try rejoining the room."); }
  }, [createPeer]);

  const refresh = useCallback(async () => {
    if (!roomId) return;
    setLoading(true);
    setError("");
    try {
      const response = await axiosInstance.get<{ room: RoomInfo }>(`/rooms/${encodeURIComponent(roomId)}`);
      setRoom(response.data.room);
    } catch (cause) {
      setError(message(cause, "Could not open this room."));
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    setRoom(null);
    setState("preview");
    resetJoinedState();
    setRemoteStreams({});
    setLocalStream(null);
    setMicOn(false);
    setCameraOn(false);
    setSharing(false);
    void refresh();
    return () => {
      joinAttemptRef.current += 1;
      const socket = socketRef.current;
      socketRef.current = null;
      socket?.disconnect();
      for (const peer of peersRef.current.values()) peer.close();
      peersRef.current.clear();
      streamsRef.current.clear();
      candidatesRef.current.clear();
      const screen = screenRef.current;
      screenRef.current = null;
      if (screen) { screen.onended = null; screen.stop(); }
      localRef.current?.getTracks().forEach((track) => track.stop());
      localRef.current = null;
    };
  }, [refresh, resetJoinedState]);

  const acquireMedia = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) { setNotice("Camera and microphone are unavailable here. Joined without media."); return null; }
    const audio = { echoCancellation: true, noiseSuppression };
    const video = { width: { ideal: lowBandwidth ? 320 : 1280 }, height: { ideal: lowBandwidth ? 180 : 720 } };
    try { return await navigator.mediaDevices.getUserMedia({ audio, video }); }
    catch {
      try { const stream = await navigator.mediaDevices.getUserMedia({ audio, video: false }); setNotice("Camera unavailable. Joined with microphone only."); return stream; }
      catch {
        try { const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video }); setNotice("Microphone unavailable. Joined with camera only."); return stream; }
        catch { setNotice("Camera and microphone were blocked or unavailable. Joined without media."); return null; }
      }
    }
  }, [lowBandwidth, noiseSuppression]);

  const join = useCallback(async (withMedia = false) => {
    if (!roomId || !room || room.endedAt || room.isRemoved || socketRef.current || state === "joining") return;
    const attempt = ++joinAttemptRef.current;
    setError("");
    setNotice("");
    setState("joining");
    resetJoinedState();
    closePeers();
    stopLocal();

    if (withMedia) {
      const stream = await acquireMedia();
      if (attempt !== joinAttemptRef.current) { stream?.getTracks().forEach((track) => track.stop()); return; }
      if (stream) {
        localRef.current = stream;
        setLocalStream(stream);
        setMicOn(stream.getAudioTracks().length > 0);
        setCameraOn(stream.getVideoTracks().length > 0);
        void refreshDevices();
      }
    }

    const apiUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:5000";
    const socket = io(apiUrl, { withCredentials: true, autoConnect: false });
    socketRef.current = socket;

    socket.on("connect", () => {
      if (socketRef.current !== socket) return;
      closePeers();
      setState("joining");
      socket.timeout(5000).emit("room:join", roomId, (timeout: Error | null, result: Ack) => {
        if (socketRef.current !== socket) return;
        if (timeout || !result?.ok) {
          setError(result?.message || "Could not join this room. Try again.");
          setState("preview");
          socketRef.current = null;
          socket.disconnect();
          closePeers();
          stopLocal();
          resetJoinedState();
          return;
        }
        setSelfId(result.selfId || socket.id || "");
        setError("");
        setState("joined");
        if (!joinedAtRef.current) joinedAtRef.current = Date.now();
        sendPresence({ micOn: Boolean(localRef.current?.getAudioTracks()[0]?.enabled), cameraOn: Boolean(localRef.current?.getVideoTracks()[0]?.enabled) });
        void refreshDevices();
        for (const participant of result.peers || []) {
          const peer = createPeer(participant.id, socket);
          if (!peer) continue;
          void (async () => {
            try {
              const offer = await peer.createOffer();
              await peer.setLocalDescription(offer);
              if (socketRef.current === socket) socket.emit("room:signal", { to: participant.id, type: "offer", description: peer.localDescription });
            } catch { if (socketRef.current === socket) setNotice("Could not connect to one participant. Try rejoining the room."); }
          })();
        }
      });
    });
    socket.on("connect_error", (cause: Error) => {
      if (socketRef.current !== socket) return;
      setError(cause.message || "Could not connect to the room.");
      setState("reconnecting");
    });
    socket.on("disconnect", (reason: string) => {
      if (socketRef.current !== socket) return;
      closePeers();
      setParticipants([]);
      setSelfId("");
      if (reason === "io server disconnect") {
        socketRef.current = null;
        setState("left");
        stopLocal();
        resetJoinedState();
        setError("The room connection closed. Join again to continue.");
      } else setState("reconnecting");
    });
    socket.on("room:state", (snapshot: { room: RoomInfo; participants: RoomParticipant[] }) => {
      if (socketRef.current !== socket) return;
      setRoom((current) => ({ ...current, ...snapshot.room, isHost: current?.isHost, isRemoved: current?.isRemoved }));
      setParticipants(snapshot.participants);
    });
    socket.on("room:signal", (signal: Signal) => { void handleSignal(signal, socket); });
    socket.on("room:participant-left", ({ id }: { id: string }) => { if (socketRef.current === socket) closePeer(id); });
    socket.on("room:force-mute", () => {
      if (socketRef.current !== socket) return;
      const track = localRef.current?.getAudioTracks()[0];
      if (track) track.enabled = false;
      setMicOn(false);
      sendPresence({ micOn: false, speaking: false });
      setNotice("A host muted your microphone.");
    });
    socket.on("room:chat", (entry: Omit<Extract<ChatEntry, { kind: "text" }>, "id" | "kind">) => {
      if (socketRef.current !== socket) return;
      setMessages((current) => [...current, { ...entry, kind: "text" as const, id: crypto.randomUUID() }].slice(-50));
    });
    socket.on("room:file", (entry: { from: string; senderName: string; name: string; size: number; data: string; sentAt: string }) => {
      if (socketRef.current !== socket) return;
      setMessages((current) => [...current, { kind: "file" as const, id: crypto.randomUUID(), from: entry.from, name: entry.senderName, fileName: entry.name, size: entry.size, data: entry.data, sentAt: entry.sentAt }].slice(-50));
    });
    socket.on("room:removed", () => {
      if (socketRef.current !== socket) return;
      setRoom((current) => current ? { ...current, isRemoved: true } : current);
      setNotice("A host removed you from this room.");
      setState("removed");
      socketRef.current = null;
      socket.disconnect();
      closePeers();
      stopLocal();
      resetJoinedState();
    });
    socket.on("room:ended", () => {
      if (socketRef.current !== socket) return;
      setRoom((current) => current ? { ...current, endedAt: new Date().toISOString() } : current);
      setNotice("The host ended this room.");
      setState("ended");
      socketRef.current = null;
      socket.disconnect();
      closePeers();
      stopLocal();
      resetJoinedState();
    });
    socket.on("room:auth-expired", () => {
      if (socketRef.current !== socket) return;
      setError("Your session expired. Sign in again to rejoin.");
      setState("left");
      socketRef.current = null;
      socket.disconnect();
      closePeers();
      stopLocal();
      resetJoinedState();
    });
    socket.connect();
  }, [acquireMedia, closePeer, closePeers, createPeer, handleSignal, refreshDevices, resetJoinedState, room, roomId, sendPresence, state, stopLocal]);

  const leave = useCallback(() => {
    joinAttemptRef.current += 1;
    const socket = socketRef.current;
    socketRef.current = null;
    socket?.emit("room:leave", null);
    socket?.disconnect();
    closePeers();
    stopLocal();
    resetJoinedState();
    setState("left");
    setNotice("You left the room. You can rejoin with this link.");
    setError("");
  }, [closePeers, resetJoinedState, stopLocal]);

  useEffect(() => {
    if (state !== "joined") return;
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - (joinedAtRef.current || Date.now())) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [state]);

  useEffect(() => {
    if (state !== "joined" || !navigator.mediaDevices?.addEventListener) return;
    navigator.mediaDevices.addEventListener("devicechange", refreshDevices);
    return () => navigator.mediaDevices.removeEventListener("devicechange", refreshDevices);
  }, [refreshDevices, state]);

  useEffect(() => {
    const audio = localRef.current?.getAudioTracks()[0];
    const video = localRef.current?.getVideoTracks()[0];
    const audioEnded = () => { setMicOn(false); setSpeaking(false); sendPresence({ micOn: false, speaking: false }); setNotice("Your microphone disconnected. Choose another device to continue."); };
    const videoEnded = () => { setCameraOn(false); sendPresence({ cameraOn: false }); setNotice("Your camera disconnected. Choose another device to continue."); };
    audio?.addEventListener("ended", audioEnded);
    video?.addEventListener("ended", videoEnded);
    return () => { audio?.removeEventListener("ended", audioEnded); video?.removeEventListener("ended", videoEnded); };
  }, [localStream, sendPresence]);

  useEffect(() => {
    const track = localStream?.getAudioTracks()[0];
    if (state !== "joined" || !track || typeof AudioContext === "undefined") return;
    let context: AudioContext;
    try { context = new AudioContext(); } catch { return; }
    const source = context.createMediaStreamSource(new MediaStream([track]));
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    let last = false;
    const timer = window.setInterval(() => {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) sum += ((sample - 128) / 128) ** 2;
      const active = track.enabled && Math.sqrt(sum / samples.length) > 0.035;
      if (active !== last) { last = active; setSpeaking(active); sendPresence({ speaking: active }); }
    }, 350);
    return () => { window.clearInterval(timer); source.disconnect(); void context.close(); setSpeaking(false); };
  }, [localStream, sendPresence, state]);

  const replaceKind = useCallback(async (kind: "audio" | "video", track: MediaStreamTrack | null) => {
    for (const peer of peersRef.current.values()) {
      const sender = peer.getTransceivers().find((item) => item.receiver.track.kind === kind)?.sender;
      if (sender) await sender.replaceTrack(track);
    }
  }, []);

  const stopSharing = useCallback(async () => {
    const screen = screenRef.current;
    if (!screen) return;
    screenRef.current = null;
    screen.onended = null;
    screen.stop();
    try { await replaceKind("video", localRef.current?.getVideoTracks()[0] || null); }
    catch { setNotice("Could not restore your camera after sharing. Try rejoining the room."); }
    setLocalStream(localRef.current ? new MediaStream(localRef.current.getTracks()) : null);
    setSharing(false);
    sendPresence({ sharing: false });
  }, [replaceKind, sendPresence]);

  const toggleShare = useCallback(async () => {
    if (screenRef.current) { await stopSharing(); return; }
    const socket = socketRef.current;
    if (!socket?.connected) { setNotice("Join the room first."); return; }
    if (screenRequestRef.current) return;
    if (!navigator.mediaDevices?.getDisplayMedia) { setNotice("Screen sharing is unavailable in this browser."); return; }
    const role = participants.find((entry) => entry.id === selfId)?.role;
    if (!room?.allowShare && role !== "host" && role !== "cohost") { setNotice("Screen sharing is disabled by the host."); return; }
    const attempt = joinAttemptRef.current;
    screenRequestRef.current = true;
    setMediaBusy(true);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const screen = stream.getVideoTracks()[0];
      if (!screen) { stream.getTracks().forEach((track) => track.stop()); throw new Error("No screen video was selected."); }
      if (socketRef.current !== socket || !socket.connected || attempt !== joinAttemptRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      screenRef.current = screen;
      await replaceKind("video", screen);
      if (screen.readyState !== "live" || screenRef.current !== screen || socketRef.current !== socket || !socket.connected || attempt !== joinAttemptRef.current) {
        await stopSharing();
        return;
      }
      screen.onended = () => { if (screenRef.current === screen) void stopSharing(); };
      const status = await new Promise<Ack>((resolve) => {
        socket.timeout(5000).emit("room:presence", { sharing: true }, (timeout: Error | null, result: Ack) => {
          resolve(timeout ? { ok: false, message: "The room did not respond. Try sharing again." } : result);
        });
      });
      if (!status?.ok || screenRef.current !== screen || socketRef.current !== socket || !socket.connected || attempt !== joinAttemptRef.current) {
        if (socketRef.current === socket) setNotice(status?.message || "Screen sharing could not start.");
        await stopSharing();
        return;
      }
      setLocalStream(new MediaStream([...(localRef.current?.getAudioTracks() || []), screen]));
      setSharing(true);
    } catch (error) {
      if (screenRef.current) await stopSharing();
      else setNotice(error instanceof Error && error.message === "No screen video was selected" ? error.message : "Screen sharing was cancelled or blocked by the browser.");
    } finally {
      screenRequestRef.current = false;
      setMediaBusy(false);
    }
  }, [participants, replaceKind, room?.allowShare, selfId, stopSharing]);

  useEffect(() => {
    if (!sharing || !screenRef.current || room?.allowShare) return;
    if (participants.find((entry) => entry.id === selfId)?.role !== "member") return;
    void stopSharing();
  }, [participants, room?.allowShare, selfId, sharing, stopSharing]);

  const switchDevice = useCallback(async (kind: "audio" | "video", deviceId: string) => {
    const socket = socketRef.current;
    if (!socket?.connected) { setNotice("Join the room first."); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setNotice("Media devices are unavailable in this browser."); return; }
    const attempt = joinAttemptRef.current;
    setMediaBusy(true);
    let fresh: MediaStream | null = null;
    try {
      const constraints: MediaStreamConstraints = kind === "audio"
        ? { audio: { ...(deviceId ? { deviceId: { exact: deviceId } } : {}), echoCancellation: true, noiseSuppression }, video: false }
        : { audio: false, video: { ...(deviceId ? { deviceId: { exact: deviceId } } : {}), width: { ideal: lowBandwidth ? 320 : 1280 }, height: { ideal: lowBandwidth ? 180 : 720 } } };
      fresh = await navigator.mediaDevices.getUserMedia(constraints);
      const next = fresh.getTracks()[0];
      if (!next) throw new Error("Device unavailable");
      if (socketRef.current !== socket || attempt !== joinAttemptRef.current) { fresh.getTracks().forEach((track) => track.stop()); fresh = null; return; }
      if (kind !== "video" || !screenRef.current) await replaceKind(kind, next);
      if (socketRef.current !== socket || attempt !== joinAttemptRef.current) { fresh.getTracks().forEach((track) => track.stop()); fresh = null; return; }
      const local = localRef.current || new MediaStream();
      const old = kind === "audio" ? local.getAudioTracks()[0] : local.getVideoTracks()[0];
      if (old) local.removeTrack(old);
      local.addTrack(next);
      localRef.current = local;
      setLocalStream(new MediaStream(screenRef.current ? [...local.getAudioTracks(), screenRef.current] : local.getTracks()));
      if (kind === "audio") { setMicOn(true); sendPresence({ micOn: true, speaking: false }); }
      else { setCameraOn(true); sendPresence({ cameraOn: true }); }
      old?.stop();
      fresh = null;
      await refreshDevices();
    } catch { fresh?.getTracks().forEach((track) => track.stop()); setNotice(`Could not switch ${kind === "audio" ? "microphone" : "camera"}. Check device permissions.`); }
    finally { setMediaBusy(false); }
  }, [lowBandwidth, noiseSuppression, refreshDevices, replaceKind, sendPresence]);

  const toggleMic = useCallback(async () => {
    const track = localRef.current?.getAudioTracks()[0];
    if (!track || track.readyState === "ended") { await switchDevice("audio", ""); return; }
    track.enabled = !track.enabled;
    setMicOn(track.enabled);
    sendPresence({ micOn: track.enabled, speaking: false });
  }, [sendPresence, switchDevice]);

  const toggleCamera = useCallback(async () => {
    const track = localRef.current?.getVideoTracks()[0];
    if (!track || track.readyState === "ended") { await switchDevice("video", ""); return; }
    track.enabled = !track.enabled;
    setCameraOn(track.enabled);
    sendPresence({ cameraOn: track.enabled });
  }, [sendPresence, switchDevice]);

  const toggleNoise = useCallback(async () => {
    const track = localRef.current?.getAudioTracks()[0];
    if (!track || !navigator.mediaDevices?.getSupportedConstraints().noiseSuppression) { setNotice("Noise suppression is unavailable for this microphone."); return; }
    try { await track.applyConstraints({ noiseSuppression: !noiseSuppression }); setNoiseSuppression((current) => !current); }
    catch { setNotice("This microphone could not change noise suppression."); }
  }, [noiseSuppression]);

  const toggleLowBandwidth = useCallback(async () => {
    const next = !lowBandwidth;
    const track = localRef.current?.getVideoTracks()[0];
    if (track) {
      try { await track.applyConstraints({ width: { ideal: next ? 320 : 1280 }, height: { ideal: next ? 180 : 720 }, frameRate: { ideal: next ? 15 : 30 } }); }
      catch { setNotice("Camera quality could not be changed on this device."); return; }
    }
    setLowBandwidth(next);
  }, [lowBandwidth]);

  const hostAction = useCallback((action: HostAction) => new Promise<Ack>((resolve) => {
    const socket = socketRef.current;
    if (!socket?.connected) return resolve({ ok: false, message: "Join the room first." });
    socket.timeout(5000).emit("room:host", action, (timeout: Error | null, result: Ack) => {
      resolve(timeout ? { ok: false, message: "The room did not respond. Try again." } : result);
    });
  }), []);

  const setRecordingStatus = useCallback((active: boolean) => new Promise<Ack>((resolve) => {
    const socket = socketRef.current;
    if (!socket?.connected) return resolve({ ok: false, message: "Join the room first." });
    socket.timeout(5000).emit("room:recording", active, (timeout: Error | null, result: Ack) => {
      resolve(timeout ? { ok: false, message: "The room did not respond. Try again." } : result);
    });
  }), []);

  const toggleHand = useCallback((handRaised: boolean) => new Promise<Ack>((resolve) => {
    const socket = socketRef.current;
    if (!socket?.connected) return resolve({ ok: false, message: "Join the room first." });
    socket.timeout(5000).emit("room:presence", { handRaised }, (timeout: Error | null, result: Ack) => {
      resolve(timeout ? { ok: false, message: "The room did not respond. Try again." } : result);
    });
  }), []);

  const sendChat = useCallback((text: string) => new Promise<Ack>((resolve) => {
    const socket = socketRef.current;
    if (!socket?.connected) return resolve({ ok: false, message: "Join the room first." });
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > 1_000) return resolve({ ok: false, message: "Enter a message of up to 1,000 characters." });
    socket.timeout(5000).emit("room:chat", trimmed, (timeout: Error | null, result: Ack) => {
      resolve(timeout ? { ok: false, message: "The room did not respond. Try again." } : result);
    });
  }), []);

  const sendFile = useCallback(async (file: File): Promise<Ack> => {
    const socket = socketRef.current;
    if (!socket?.connected) return { ok: false, message: "Join the room first." };
    if (!file.size || file.size > MAX_FILE_BYTES) return { ok: false, message: "Files must be 128 KB or smaller." };
    try {
      const data = await readFile(file);
      if (socketRef.current !== socket || !socket.connected) return { ok: false, message: "Join the room first." };
      return await new Promise<Ack>((resolve) => {
        socket.timeout(5000).emit("room:file", { name: file.name, data }, (timeout: Error | null, result: Ack) => {
          resolve(timeout ? { ok: false, message: "The room did not respond. Try again." } : result);
        });
      });
    } catch { return { ok: false, message: "Could not read that file." }; }
  }, []);

  return { room, loading, state, selfId, participants, messages, remoteStreams, localStream, micOn, cameraOn, cameraDeviceId: localRef.current?.getVideoTracks()[0]?.getSettings().deviceId || "", sharing, speaking, noiseSuppression, lowBandwidth, devices, mediaBusy, seconds, error, notice, setError, setNotice, refresh, refreshDevices, join, leave, toggleMic, toggleCamera, toggleShare, switchDevice, toggleNoise, toggleLowBandwidth, hostAction, setRecordingStatus, toggleHand, sendChat, sendFile };
}
