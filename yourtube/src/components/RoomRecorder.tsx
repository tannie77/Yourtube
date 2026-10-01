import { useCallback, useEffect, useRef, useState } from "react";
import { Circle, Square } from "lucide-react";
import styles from "../pages/rooms/rooms.module.css";

type Ack = { ok: boolean; message?: string };
type Props = {
  roomId: string;
  localStream: MediaStream | null;
  remoteStreams: Record<string, MediaStream>;
  names: Record<string, string>;
  onStatus: (active: boolean) => Promise<Ack>;
  onNotice: (message: string) => void;
};

export default function RoomRecorder({ roomId, localStream, remoteStreams, names, onStatus, onNotice }: Props) {
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const frameRef = useRef<number | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const outputRef = useRef<MediaStream | null>(null);
  const videosRef = useRef(new Map<string, HTMLVideoElement>());
  const audioSourcesRef = useRef(new Map<string, MediaStreamAudioSourceNode>());
  const destinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const streamsRef = useRef<Record<string, MediaStream>>({});
  const namesRef = useRef<Record<string, string>>({});
  const startingRef = useRef(false);
  const statusActiveRef = useRef(false);
  const failedRef = useRef(false);
  const mountedRef = useRef(true);
  const supported = typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && typeof AudioContext !== "undefined" && typeof HTMLCanvasElement !== "undefined" && "captureStream" in HTMLCanvasElement.prototype;

  const clearStatus = useCallback(() => {
    if (!statusActiveRef.current) return;
    statusActiveRef.current = false;
    void onStatus(false).then((result) => {
      if (!result.ok && mountedRef.current) onNotice(result.message || "Could not clear the recording indicator.");
    });
  }, [onNotice, onStatus]);

  const syncSources = useCallback(() => {
    const streams = streamsRef.current;
    for (const [key, video] of videosRef.current) if (!streams[key]) {
      video.pause();
      video.srcObject = null;
      videosRef.current.delete(key);
    }
    for (const [key, stream] of Object.entries(streams)) {
      const existing = videosRef.current.get(key);
      if (!existing || existing.srcObject !== stream) {
        const video = existing || document.createElement("video");
        video.muted = true;
        video.playsInline = true;
        video.srcObject = stream;
        void video.play().catch(() => {});
        videosRef.current.set(key, video);
      }
      const context = contextRef.current;
      const destination = destinationRef.current;
      if (context && destination) for (const track of stream.getAudioTracks()) {
        if (audioSourcesRef.current.has(track.id)) continue;
        const source = context.createMediaStreamSource(new MediaStream([track]));
        source.connect(destination);
        audioSourcesRef.current.set(track.id, source);
      }
    }
    const activeIds = new Set(Object.values(streams).flatMap((stream) => stream.getAudioTracks().map((track) => track.id)));
    for (const [id, source] of audioSourcesRef.current) if (!activeIds.has(id)) {
      source.disconnect();
      audioSourcesRef.current.delete(id);
    }
  }, []);

  useEffect(() => {
    streamsRef.current = { ...(localStream ? { local: localStream } : {}), ...remoteStreams };
    namesRef.current = names;
    if (recorderRef.current) syncSources();
  }, [localStream, names, remoteStreams, syncSources]);

  const cleanup = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    outputRef.current?.getTracks().forEach((track) => track.stop());
    outputRef.current = null;
    for (const video of videosRef.current.values()) { video.pause(); video.srcObject = null; }
    videosRef.current.clear();
    for (const source of audioSourcesRef.current.values()) source.disconnect();
    audioSourcesRef.current.clear();
    destinationRef.current = null;
    if (contextRef.current) void contextRef.current.close();
    contextRef.current = null;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      else cleanup();
      clearStatus();
    };
  }, [cleanup, clearStatus]);

  async function start() {
    if (startingRef.current || recorderRef.current) return;
    if (!supported) { onNotice("Local recording is unavailable in this browser. Try one with MediaRecorder and canvas capture support."); return; }
    startingRef.current = true;
    setStarting(true);
    try {
      const context = new AudioContext();
      contextRef.current = context;
      await context.resume();
      const status = await onStatus(true);
      if (!status.ok) throw new Error(status.message || "Only the host can record this room.");
      statusActiveRef.current = true;
      if (!mountedRef.current) throw new Error("The room was closed before recording started.");
      const canvas = document.createElement("canvas");
      canvas.width = 960;
      canvas.height = 540;
      const drawing = canvas.getContext("2d");
      if (!drawing) throw new Error("Canvas capture is unavailable.");
      const destination = context.createMediaStreamDestination();
      destinationRef.current = destination;
      syncSources();
      const draw = () => {
        const streams = streamsRef.current;
        const entries = Object.keys(streams);
        const count = Math.max(entries.length, 1);
        const columns = Math.ceil(Math.sqrt(count));
        const rows = Math.ceil(count / columns);
        const width = canvas.width / columns;
        const height = canvas.height / rows;
        drawing.fillStyle = "#111827";
        drawing.fillRect(0, 0, canvas.width, canvas.height);
        entries.forEach((key, index) => {
          const x = (index % columns) * width;
          const y = Math.floor(index / columns) * height;
          const video = videosRef.current.get(key);
          drawing.fillStyle = "#263348";
          drawing.fillRect(x + 4, y + 4, width - 8, height - 8);
          if (video && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0 && streams[key].getVideoTracks().some((track) => track.enabled && track.readyState === "live")) {
            const scale = Math.max(width / video.videoWidth, height / video.videoHeight);
            const drawnWidth = video.videoWidth * scale;
            const drawnHeight = video.videoHeight * scale;
            drawing.save();
            drawing.beginPath();
            drawing.rect(x + 4, y + 4, width - 8, height - 8);
            drawing.clip();
            drawing.drawImage(video, x + (width - drawnWidth) / 2, y + (height - drawnHeight) / 2, drawnWidth, drawnHeight);
            drawing.restore();
          }
          drawing.fillStyle = "rgba(17,24,39,0.8)";
          drawing.fillRect(x + 12, y + height - 44, Math.min(width - 24, 210), 30);
          drawing.fillStyle = "#ffffff";
          drawing.font = "600 15px sans-serif";
          drawing.fillText((namesRef.current[key] || "Participant").slice(0, 24), x + 20, y + height - 24);
        });
        frameRef.current = requestAnimationFrame(draw);
      };
      draw();
      const canvasStream = canvas.captureStream(15);
      const output = new MediaStream([...canvasStream.getVideoTracks(), ...destination.stream.getAudioTracks()]);
      outputRef.current = output;
      const mimeType = ["video/webm;codecs=vp8,opus", "video/webm", "video/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(output, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      failedRef.current = false;
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => {
        failedRef.current = true;
        if (mountedRef.current) onNotice("The browser could not continue recording.");
        if (recorder.state === "recording") recorder.stop();
      };
      recorder.onstop = () => {
        if (!failedRef.current) {
          const type = recorder.mimeType || "video/webm";
          const blob = new Blob(chunks, { type });
          if (blob.size) {
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `yourtube-room-${roomId}-${new Date().toISOString().replace(/[:.]/g, "-")}.${type.includes("mp4") ? "mp4" : "webm"}`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
          } else if (mountedRef.current) onNotice("No recording data was captured by this browser.");
        }
        clearStatus();
        recorderRef.current = null;
        cleanup();
        if (mountedRef.current) setRecording(false);
      };
      recorder.start(1000);
      setRecording(true);
    } catch (error) {
      if (mountedRef.current) onNotice(error instanceof Error ? error.message : "Local recording is unavailable in this browser.");
      clearStatus();
      recorderRef.current = null;
      cleanup();
    } finally {
      startingRef.current = false;
      if (mountedRef.current) setStarting(false);
    }
  }

  function stop() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    clearStatus();
    setRecording(false);
  }

  return <div className={styles.recordingPanel}>
    <div><p className={styles.recordingTitle}>Local recording</p><p className={styles.recordingCopy}>Host only · saves to your downloads when stopped. Everyone in the room sees the recording indicator.</p></div>
    <button type="button" disabled={!supported || starting} onClick={() => recording ? stop() : void start()} className={styles.recordButton} data-recording={recording}>
      {recording ? <Square aria-hidden="true" /> : <Circle aria-hidden="true" />}{recording ? "Stop and save" : starting ? "Starting…" : supported ? "Record room" : "Unavailable"}
    </button>
  </div>;
}
