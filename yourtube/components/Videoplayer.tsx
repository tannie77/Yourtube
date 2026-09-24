"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Captions, Expand, Keyboard, LoaderCircle, RotateCcw, RotateCw,
  Maximize, Minimize, Pause, PictureInPicture2, Play, Shrink, Volume2,
  VolumeX, X,
} from "lucide-react";
import axiosInstance from "@/lib/axiosinstance";
import { mediaSource, previewSource, type LocalVideo, type VideoQuality } from "@/lib/local-video";
import styles from "./Videoplayer.module.css";

const speeds = [0.5, 1, 1.25, 1.5, 2] as const;
const playbackChannelName = "vidcircle-active-playback";
const saveIntervalMs = 5000;

type WatchProgress = {
  positionSeconds: number;
  watchedSeconds: number;
  completed: boolean;
  completionPercent: number;
  durationSeconds: number;
  updatedAt: string | null;
};

type PlaybackClaim = { type: "playing"; instanceId: string; startedAt: number };
type PendingSave = { positionSeconds: number; watchedSecondsDelta: number };

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  const remainder = String(whole % 60).padStart(2, "0");
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}:${remainder}`
    : `${minutes}:${remainder}`;
}

function PlayerButton({ label, title, onClick, children, pressed, disabled = false }: {
  label: string; title: string; onClick: () => void; children: ReactNode;
  pressed?: boolean; disabled?: boolean;
}) {
  return <button type="button" aria-label={label} aria-pressed={pressed} title={title} onClick={onClick} disabled={disabled}
    className="flex size-9 shrink-0 items-center justify-center rounded-lg text-white/85 transition hover:bg-white/15 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffb59f] disabled:cursor-not-allowed disabled:opacity-35 sm:size-10">
    {children}
  </button>;
}

export default function Videoplayer({ video, nextVideo, onLoaded, theatreMode = false, onTheatreChange = () => {} }: {
  video: LocalVideo;
  nextVideo?: LocalVideo;
  onLoaded?: () => void;
  theatreMode?: boolean;
  onTheatreChange?: (enabled: boolean) => void;
}) {
  const router = useRouter();
  const shellRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const switchRef = useRef<{ position: number; resume: boolean } | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resumePosition = useRef(0);
  const latestPosition = useRef(0);
  const lastSavedPosition = useRef(0);
  const pendingSave = useRef<PendingSave | null>(null);
  const watchedSinceLastSave = useRef(0);
  const lastMediaTime = useRef<number | null>(null);
  const seeking = useRef(false);
  const saveInFlight = useRef<Promise<void> | null>(null);
  const hasPlayed = useRef(false);
  const alive = useRef(true);
  const progressReady = useRef(false);
  const instanceId = useRef("");
  const activeClaim = useRef<PlaybackClaim | null>(null);
  const playbackChannel = useRef<BroadcastChannel | null>(null);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [pictureInPicture, setPictureInPicture] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [playbackError, setPlaybackError] = useState("");
  const [notice, setNotice] = useState("");
  const [progressState, setProgressState] = useState<"loading" | "ready" | "error">("loading");
  const [resumeAt, setResumeAt] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [watchedSeconds, setWatchedSeconds] = useState(0);
  const [completionPercent, setCompletionPercent] = useState(90);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [quality, setQuality] = useState<VideoQuality>(video.qualityOptions?.filter((item) => item.allowed).at(-1)?.quality || video.sourceQuality || "480p");
  const [captionUrl, setCaptionUrl] = useState("");
  const [captionsOn, setCaptionsOn] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [hoverPreview, setHoverPreview] = useState<{ index: number; time: number; left: number } | null>(null);

  const stopHideTimer = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = null;
  }, []);
  const scheduleHide = useCallback(() => {
    stopHideTimer();
    hideTimer.current = setTimeout(() => {
      if (!videoRef.current?.paused) setControlsVisible(false);
    }, 3000);
  }, [stopHideTimer]);
  const revealControls = useCallback(() => {
    setControlsVisible(true);
    if (!videoRef.current?.paused) scheduleHide();
  }, [scheduleHide]);

  useEffect(() => () => stopHideTimer(), [stopHideTimer]);
  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); }, []);
  const showNotice = useCallback((message: string) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice(message);
    noticeTimer.current = setTimeout(() => setNotice(""), 4500);
  }, []);
  useEffect(() => {
    if (!video.hasCaptions) return;
    let active = true;
    let url = "";
    axiosInstance.get<Blob>(`/video/${video._id}/captions`, { responseType: "blob" })
      .then(({ data }) => { if (active) { url = URL.createObjectURL(new Blob([data], { type: "text/vtt" })); setCaptionUrl(url); } })
      .catch(() => { if (active) showNotice("Captions could not be loaded."); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [showNotice, video._id, video.hasCaptions]);
  useEffect(() => {
    const track = videoRef.current?.textTracks[0];
    if (track) track.mode = captionsOn ? "showing" : "disabled";
  }, [captionUrl, captionsOn]);
  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      if (nextVideo && /^[a-f0-9]{24}$/i.test(nextVideo._id)) router.push(`/watch/${nextVideo._id}`);
      return;
    }
    const timer = window.setTimeout(() => setCountdown((value) => value === null ? null : value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown, nextVideo, router]);
  useEffect(() => { if (switchRef.current) videoRef.current?.load(); }, [quality]);
  const sendQueuedPosition = useCallback(function drainPositionQueue() {
    if (saveInFlight.current || pendingSave.current === null) return;
    const save = pendingSave.current;
    pendingSave.current = null;
    if (alive.current) setSaveState("saving");
    let succeeded = false;
    const request = axiosInstance.put<WatchProgress>(`/video/${video._id}/progress`, save, { timeout: 10000 })
      .then(({ data }) => {
        succeeded = true;
        lastSavedPosition.current = save.positionSeconds;
        if (alive.current) {
          setCompleted(data.completed);
          setWatchedSeconds(data.watchedSeconds);
          setSaveState("saved");
        }
      })
      .catch(() => {
        const next = pendingSave.current;
        pendingSave.current = next
          ? { ...next, watchedSecondsDelta: next.watchedSecondsDelta + save.watchedSecondsDelta }
          : save;
        if (alive.current) setSaveState("error");
      })
      .finally(() => {
        saveInFlight.current = null;
        if (succeeded && pendingSave.current !== null) drainPositionQueue();
      });
    saveInFlight.current = request;
  }, [video._id]);
  const queuePosition = useCallback((positionSeconds: number, force = false) => {
    if (!progressReady.current || !Number.isFinite(positionSeconds) || positionSeconds < 0) return;
    const watchedSecondsDelta = watchedSinceLastSave.current;
    if (!force && Math.abs(positionSeconds - lastSavedPosition.current) < 0.5 && watchedSecondsDelta < 0.25) return;
    watchedSinceLastSave.current = 0;
    const next = pendingSave.current;
    pendingSave.current = {
      positionSeconds,
      watchedSecondsDelta: watchedSecondsDelta + (next?.watchedSecondsDelta || 0),
    };
    sendQueuedPosition();
  }, [sendQueuedPosition]);
  useEffect(() => {
    alive.current = true;
    let active = true;
    progressReady.current = false;
    axiosInstance.get<WatchProgress>(`/video/${video._id}/progress`, { timeout: 5000 })
      .then(({ data }) => {
        if (!active) return;
        const resume = !data.completed && data.positionSeconds > 2 && data.positionSeconds < data.durationSeconds - 2
          ? data.positionSeconds : 0;
        resumePosition.current = resume;
        latestPosition.current = resume;
        lastSavedPosition.current = data.positionSeconds;
        setResumeAt(resume);
        setCompleted(data.completed);
        setWatchedSeconds(data.watchedSeconds);
        setCompletionPercent(data.completionPercent);
        progressReady.current = true;
        setProgressState("ready");
      })
      .catch(() => {
        if (!active) return;
        progressReady.current = false;
        setProgressState("error");
      });
    return () => {
      active = false;
      alive.current = false;
      if (hasPlayed.current && progressReady.current) queuePosition(latestPosition.current, true);
    };
  }, [queuePosition, video._id]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      const element = videoRef.current;
      if (hasPlayed.current && element && !element.paused) queuePosition(element.currentTime);
    }, saveIntervalMs);
    return () => window.clearInterval(timer);
  }, [queuePosition]);
  useEffect(() => {
    instanceId.current = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    const handleClaim = (claim: PlaybackClaim) => {
      if (claim?.type !== "playing" || claim.instanceId === instanceId.current) return;
      const own = activeClaim.current;
      const otherWins = !own || claim.startedAt > own.startedAt ||
        (claim.startedAt === own.startedAt && claim.instanceId > own.instanceId);
      if (otherWins && videoRef.current && !videoRef.current.paused) {
        activeClaim.current = null;
        videoRef.current.pause();
        showNotice("Paused because another VidCircle tab started playing.");
      }
    };
    if ("BroadcastChannel" in window) {
      try {
        const channel = new BroadcastChannel(playbackChannelName);
        channel.onmessage = (event: MessageEvent<PlaybackClaim>) => handleClaim(event.data);
        playbackChannel.current = channel;
      } catch { /* Storage events provide the local fallback. */ }
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key !== playbackChannelName || !event.newValue) return;
      try { handleClaim(JSON.parse(event.newValue) as PlaybackClaim); } catch { /* Ignore an invalid local notification. */ }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      playbackChannel.current?.close();
      playbackChannel.current = null;
      window.removeEventListener("storage", onStorage);
    };
  }, [showNotice]);
  const claimPlayback = useCallback(() => {
    const claim: PlaybackClaim = { type: "playing", instanceId: instanceId.current, startedAt: Date.now() };
    activeClaim.current = claim;
    playbackChannel.current?.postMessage(claim);
    try { window.localStorage.setItem(playbackChannelName, JSON.stringify(claim)); } catch { /* BroadcastChannel still works when storage is unavailable. */ }
  }, []);
  useEffect(() => {
    const syncFullscreen = () => setFullscreen(document.fullscreenElement === shellRef.current);
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);
  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;
    const entered = () => setPictureInPicture(true);
    const left = () => setPictureInPicture(false);
    element.addEventListener("enterpictureinpicture", entered);
    element.addEventListener("leavepictureinpicture", left);
    return () => {
      element.removeEventListener("enterpictureinpicture", entered);
      element.removeEventListener("leavepictureinpicture", left);
    };
  }, []);

  const togglePlay = useCallback(async () => {
    const element = videoRef.current;
    if (!element || progressState === "loading") return;
    if (!element.paused) return element.pause();
    setCountdown(null);
    setPlaybackError("");
    try { await element.play(); }
    catch { setBuffering(false); setPlaybackError("Playback could not start. Check the local API, your plan and today’s watch allowance."); }
  }, [progressState]);
  const startOver = useCallback(() => {
    setCountdown(null);
    resumePosition.current = 0;
    latestPosition.current = 0;
    setResumeAt(0);
    const element = videoRef.current;
    if (element && element.readyState >= 1) {
      element.currentTime = 0;
      setCurrentTime(0);
    }
    queuePosition(0, true);
  }, [queuePosition]);
  const seekBy = useCallback((seconds: number) => {
    const element = videoRef.current;
    if (!element || !Number.isFinite(element.duration)) return;
    element.currentTime = Math.max(0, Math.min(element.duration, element.currentTime + seconds));
    setCurrentTime(element.currentTime);
    revealControls();
  }, [revealControls]);
  const changeVolume = useCallback((next: number) => {
    const element = videoRef.current;
    if (!element) return;
    element.volume = Math.max(0, Math.min(1, next));
    element.muted = next === 0;
    setVolume(element.volume);
    setMuted(element.muted);
    revealControls();
  }, [revealControls]);
  const toggleMute = useCallback(() => {
    const element = videoRef.current;
    if (!element) return;
    element.muted = !element.muted;
    setMuted(element.muted);
    revealControls();
  }, [revealControls]);
  const changeSpeed = useCallback((next: number) => {
    const element = videoRef.current;
    if (!element || !speeds.some((item) => item === next)) return;
    element.playbackRate = next;
    setSpeed(next);
    revealControls();
  }, [revealControls]);
  const stepSpeed = useCallback((direction: number) => {
    const index = speeds.findIndex((item) => item === (videoRef.current?.playbackRate ?? 1));
    changeSpeed(speeds[Math.max(0, Math.min(speeds.length - 1, (index < 0 ? 1 : index) + direction))]);
  }, [changeSpeed]);
  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement === shellRef.current) await document.exitFullscreen();
      else {
        if (!document.fullscreenEnabled || !shellRef.current?.requestFullscreen) {
          showNotice("Full-screen mode is unavailable in this browser.");
          return;
        }
        await shellRef.current.requestFullscreen();
        if (document.fullscreenElement !== shellRef.current) showNotice("Full-screen mode is unavailable in this browser.");
      }
    } catch { showNotice("Full-screen mode is unavailable in this browser."); }
  }, [showNotice]);
  const togglePictureInPicture = useCallback(async () => {
    const element = videoRef.current;
    if (!element) return;
    if (!document.pictureInPictureEnabled || !element.requestPictureInPicture) {
      showNotice("Picture-in-Picture is unavailable in this browser.");
      return;
    }
    try {
      if (document.pictureInPictureElement === element) await document.exitPictureInPicture();
      else await element.requestPictureInPicture();
    } catch { showNotice("Start the video before opening Picture-in-Picture, or check browser support."); }
  }, [showNotice]);
  const toggleTheatre = useCallback(() => {
    onTheatreChange(!theatreMode);
    revealControls();
  }, [onTheatreChange, revealControls, theatreMode]);
  const toggleCaptions = useCallback(() => {
    if (!video.hasCaptions) return showNotice("This video has no uploaded captions.");
    if (!captionUrl) return showNotice("Captions are still loading.");
    setCaptionsOn((enabled) => !enabled);
    revealControls();
  }, [captionUrl, revealControls, showNotice, video.hasCaptions]);
  const changeQuality = useCallback((next: VideoQuality) => {
    if (next === quality || !video.qualityOptions?.some((item) => item.quality === next && item.allowed)) return;
    const element = videoRef.current;
    switchRef.current = { position: element?.currentTime || 0, resume: Boolean(element && !element.paused) };
    setPlaybackError("");
    setBuffering(true);
    setQuality(next);
    revealControls();
  }, [quality, revealControls, video.qualityOptions]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (
        target.isContentEditable || target.closest("input, textarea, select, [contenteditable='true']") ||
        ((event.code === "Space" || event.key === "Enter") && target.closest("button"))
      )) return;
      if (event.key === "Escape" && showShortcuts) { setShowShortcuts(false); return; }
      let handled = true;
      if (event.code === "Space" || event.key.toLowerCase() === "k") void togglePlay();
      else if (event.key === "ArrowLeft") seekBy(event.shiftKey ? -30 : -10);
      else if (event.key === "ArrowRight") seekBy(event.shiftKey ? 30 : 10);
      else if (event.key === "ArrowUp") changeVolume((videoRef.current?.volume ?? 1) + 0.1);
      else if (event.key === "ArrowDown") changeVolume((videoRef.current?.volume ?? 1) - 0.1);
      else if (event.key.toLowerCase() === "m") toggleMute();
      else if (event.key === ",") stepSpeed(-1);
      else if (event.key === ".") stepSpeed(1);
      else if (event.key.toLowerCase() === "t") toggleTheatre();
      else if (event.key.toLowerCase() === "f") void toggleFullscreen();
      else if (event.key.toLowerCase() === "p") void togglePictureInPicture();
      else if (event.key.toLowerCase() === "c") toggleCaptions();
      else if (event.key.toLowerCase() === "n" && nextVideo) router.push(`/watch/${nextVideo._id}`);
      else if (event.key === "?" || event.key.toLowerCase() === "h") setShowShortcuts((value) => !value);
      else handled = false;
      if (handled) event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [changeVolume, nextVideo, router, seekBy, showShortcuts, stepSpeed, toggleCaptions, toggleFullscreen, toggleMute, togglePictureInPicture, togglePlay, toggleTheatre]);

  function syncBuffer() {
    const element = videoRef.current;
    if (!element || !Number.isFinite(element.duration) || element.duration <= 0) return;
    let end = 0;
    for (let index = 0; index < element.buffered.length; index += 1) end = Math.max(end, element.buffered.end(index));
    setBuffered(Math.min(100, end / element.duration * 100));
  }

  const knownDuration = duration || video.durationSeconds || 0;
  const playableDuration = Number.isFinite(knownDuration) ? knownDuration : 0;
  const progress = playableDuration > 0 ? Math.min(100, currentTime / playableDuration * 100) : 0;
  const remaining = Math.max(0, playableDuration - currentTime);
  if (!video.canWatch) return null;

  return <div ref={shellRef} role="region" aria-label={`Video player for ${video.videotitle}`} tabIndex={0}
    onPointerMove={revealControls} onPointerLeave={() => { if (playing) scheduleHide(); }} onFocusCapture={revealControls}
    data-controls-hidden={playing && !controlsVisible && !showShortcuts}
    className={`${styles.player} relative isolate aspect-video min-h-[280px] w-full overflow-hidden rounded-[22px] bg-[#0b0f1d] text-white shadow-[0_18px_45px_rgba(16,20,33,0.18)] outline-none focus-visible:ring-4 focus-visible:ring-[#ed6049]/35 sm:min-h-0`}>
    <video ref={videoRef} src={mediaSource(video, quality)} preload="none" playsInline
      className="absolute inset-0 size-full bg-black object-contain" aria-label={video.videotitle}
      onClick={() => { void togglePlay(); }} onDoubleClick={() => { void toggleFullscreen(); }}
      onLoadedMetadata={() => {
        const element = videoRef.current;
        if (!element) return;
        setDuration(Number.isFinite(element.duration) ? element.duration : 0);
        const switching = switchRef.current;
        if (switching) {
          element.currentTime = Math.min(switching.position, Math.max(0, element.duration - 0.1));
          element.playbackRate = speed;
          switchRef.current = null;
          if (switching.resume) void element.play().catch(() => setPlaybackError("Playback could not resume after changing quality."));
        } else if (resumePosition.current > 0 && Number.isFinite(element.duration)) {
          element.currentTime = Math.min(resumePosition.current, Math.max(0, element.duration - 0.1));
          resumePosition.current = 0;
        }
        setCurrentTime(element.currentTime);
        latestPosition.current = element.currentTime;
        syncBuffer();
        onLoaded?.();
      }}
      onDurationChange={() => setDuration(videoRef.current?.duration || 0)}
      onTimeUpdate={() => {
        const element = videoRef.current;
        if (!element) return;
        const position = element.currentTime;
        if (hasPlayed.current && !element.paused && !seeking.current && lastMediaTime.current !== null) {
          const played = position - lastMediaTime.current;
          if (played > 0 && played <= Math.max(10, element.playbackRate * 10)) watchedSinceLastSave.current += played;
        }
        lastMediaTime.current = position;
        latestPosition.current = position;
        setCurrentTime(position);
      }}
      onProgress={syncBuffer} onWaiting={() => setBuffering(true)} onSeeking={() => { seeking.current = true; setBuffering(true); }}
      onSeeked={() => { seeking.current = false; lastMediaTime.current = videoRef.current?.currentTime || 0; setBuffering(false); if (hasPlayed.current) queuePosition(videoRef.current?.currentTime || 0, true); }} onCanPlay={() => setBuffering(false)}
      onPlaying={() => { hasPlayed.current = true; lastMediaTime.current = videoRef.current?.currentTime || 0; claimPlayback(); setPlaying(true); setBuffering(false); setPlaybackError(""); setResumeAt(0); revealControls(); }}
      onPause={() => { lastMediaTime.current = null; setPlaying(false); setControlsVisible(true); stopHideTimer(); if (hasPlayed.current) queuePosition(videoRef.current?.currentTime || 0, true); }}
      onEnded={() => { setPlaying(false); setControlsVisible(true); stopHideTimer(); queuePosition(videoRef.current?.duration || latestPosition.current, true); if (nextVideo) setCountdown(5); }}
      onVolumeChange={() => { setVolume(videoRef.current?.volume ?? 1); setMuted(videoRef.current?.muted ?? false); }}
      onRateChange={() => setSpeed(videoRef.current?.playbackRate ?? 1)}
      onError={() => { setBuffering(false); setPlaying(false); setPlaybackError("This video could not be played. Check the local API, your plan and today’s watch allowance."); }}>
      {captionUrl && <track key={captionUrl} kind="captions" src={captionUrl} srcLang="en" label="Uploaded captions" onLoad={() => { const track = videoRef.current?.textTracks[0]; if (track) track.mode = captionsOn ? "showing" : "disabled"; }} />}
      Your browser does not support HTML5 video.
    </video>
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#060915]/90 via-transparent to-[#060915]/40" />
    <div className={`${styles.fadeWithControls} pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4 sm:p-5`}>
      <div className="min-w-0"><p className="truncate text-sm font-semibold drop-shadow-sm">{video.videotitle}</p><p className="mt-0.5 text-[11px] text-white/65">VidCircle local player</p></div>
      <span className="shrink-0 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/90 backdrop-blur-sm">{video.sourceQuality || "MP4"} source</span>
    </div>
    {buffering && <div className="pointer-events-none absolute inset-0 flex items-center justify-center" role="status" aria-label="Loading video"><LoaderCircle className="size-12 animate-spin text-[#ffad96]" aria-hidden="true" /></div>}
    {!playing && !buffering && !playbackError && <button type="button" onClick={() => { void togglePlay(); }} aria-label="Play video" disabled={progressState === "loading"} className="absolute top-1/2 left-1/2 z-10 flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-[#ed6049] text-white shadow-[0_14px_35px_rgba(0,0,0,0.35)] transition hover:scale-105 hover:bg-[#e55841] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white disabled:cursor-wait disabled:opacity-55 sm:size-20"><Play className="ml-1 size-7 fill-current sm:size-8" strokeWidth={1.5} aria-hidden="true" /></button>}
    {playbackError && <div role="alert" className="absolute inset-x-4 top-[35%] z-20 rounded-xl border border-[#efbaa9]/40 bg-[#1e2637]/95 px-5 py-4 text-center text-sm leading-6 text-white shadow-xl sm:inset-x-[15%]">{playbackError}</div>}
    {notice && <div role="status" className="absolute inset-x-4 top-16 z-30 rounded-lg border border-white/20 bg-[#1e2637]/95 px-4 py-2 text-center text-xs text-white shadow-lg sm:inset-x-auto sm:right-5 sm:max-w-sm">{notice}</div>}
    {countdown !== null && nextVideo && <div role="status" className="absolute inset-x-4 top-[25%] z-30 mx-auto max-w-sm rounded-2xl border border-white/20 bg-[#151b2b]/95 p-5 text-center text-white shadow-2xl">
      <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#ffad96]">Up next in {countdown}s</p>
      <p className="mt-2 truncate text-base font-semibold">{nextVideo.videotitle}</p>
      <div className="mt-4 flex justify-center gap-3"><button type="button" onClick={() => router.push(`/watch/${nextVideo._id}`)} className="rounded-lg bg-[#ed6049] px-4 py-2 text-xs font-semibold text-white hover:bg-[#dd563f]">Play now</button><button type="button" onClick={() => setCountdown(null)} className="rounded-lg border border-white/25 px-4 py-2 text-xs font-semibold hover:bg-white/10">Cancel</button></div>
    </div>}
    {(resumeAt > 0 || (completed && !playing) || progressState === "error") && <div role="status" className="absolute top-16 left-4 z-20 flex max-w-[calc(100%-2rem)] items-center gap-3 rounded-lg border border-white/15 bg-[#151b2b]/90 px-3 py-2 text-xs font-medium text-white shadow-lg sm:left-5">
      <span>{resumeAt > 0 ? `Resuming at ${formatTime(resumeAt)}` : completed ? "Completed · replay from start" : "Saved position unavailable; playback still works"}</span>
      {resumeAt > 0 && <button type="button" onClick={startOver} className="shrink-0 font-bold text-[#ffad96] hover:underline">Start over</button>}
    </div>}
    {showShortcuts && <div role="region" aria-label="Keyboard shortcuts" className="absolute top-16 right-4 left-4 z-30 max-h-[calc(100%-9rem)] overflow-auto rounded-xl border border-white/20 bg-[#141a2c]/95 p-4 text-xs text-white shadow-2xl backdrop-blur-md sm:right-5 sm:left-auto sm:w-80">
      <div className="flex items-center justify-between gap-4"><p className="text-sm font-semibold">Keyboard shortcuts</p><button type="button" aria-label="Close keyboard shortcuts" onClick={() => setShowShortcuts(false)} className="rounded-md p-1 hover:bg-white/15"><X className="size-4" aria-hidden="true" /></button></div>
      <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-5 gap-y-2 text-white/80"><dt>Play / pause</dt><dd>Space or K</dd><dt>Seek 10 seconds</dt><dd>← / →</dd><dt>Seek 30 seconds</dt><dd>Shift + ← / →</dd><dt>Volume</dt><dd>↑ / ↓</dd><dt>Mute</dt><dd>M</dd><dt>Captions</dt><dd>C</dd><dt>Next video</dt><dd>N</dd><dt>Speed down / up</dt><dd>, / .</dd><dt>Theatre / full screen</dt><dd>T / F</dd><dt>Picture-in-Picture</dt><dd>P</dd><dt>Show this help</dt><dd>? or H</dd></dl>
    </div>}
    <div className={`${styles.fadeWithControls} absolute inset-x-0 bottom-0 z-20 px-4 pb-3 pt-9 sm:px-5 sm:pb-5`}>
      <div className="relative flex h-5 items-center">
        {hoverPreview && video.previewCount && <div className="pointer-events-none absolute bottom-7 z-30 -translate-x-1/2 rounded-lg border border-white/20 bg-[#111827] p-1.5 text-center shadow-xl" style={{ left: `${hoverPreview.left}%` }}><Image unoptimized src={previewSource(video, hoverPreview.index)} alt="Timeline preview" width={128} height={72} className="aspect-video w-32 rounded object-cover" /><span className="mt-1 block text-[11px] font-semibold text-white">{formatTime(hoverPreview.time)}</span></div>}
        <div aria-hidden="true" className="absolute inset-x-0 h-1 rounded-full bg-white/25"><div className="absolute inset-y-0 left-0 rounded-full bg-white/40" style={{ width: `${buffered}%` }} /><div className="absolute inset-y-0 left-0 rounded-full bg-[#f1785e]" style={{ width: `${progress}%` }} /></div>
        <input type="range" min="0" max={Math.max(playableDuration, 0.1)} step="0.1" value={Math.min(currentTime, Math.max(playableDuration, 0.1))}
          onChange={(event) => { const element = videoRef.current; if (element && Number.isFinite(element.duration)) { element.currentTime = Number(event.target.value); setCurrentTime(element.currentTime); } }}
          onPointerMove={(event) => { if (!video.previewCount || playableDuration <= 0) return; const rect = event.currentTarget.getBoundingClientRect(); const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)); setHoverPreview({ index: Math.min(video.previewCount - 1, Math.floor(ratio * video.previewCount)), time: ratio * playableDuration, left: Math.max(9, Math.min(91, ratio * 100)) }); }} onPointerLeave={() => setHoverPreview(null)}
          aria-label="Seek" aria-valuetext={`${formatTime(currentTime)} of ${formatTime(playableDuration)}`} disabled={duration <= 0}
          className={`${styles.seek} relative w-full cursor-pointer disabled:cursor-not-allowed`} />
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 items-center gap-0.5 sm:gap-1">
          <PlayerButton label={playing ? "Pause video" : "Play video"} title="Play or pause (Space / K)" disabled={progressState === "loading"} onClick={() => { void togglePlay(); }}>{playing ? <Pause className="size-5 fill-current" aria-hidden="true" /> : <Play className="ml-0.5 size-5 fill-current" aria-hidden="true" />}</PlayerButton>
          <PlayerButton label="Back 10 seconds" title="Back 10 seconds (←)" onClick={() => seekBy(-10)}><span className="relative flex size-6 items-center justify-center"><RotateCcw className="size-6" aria-hidden="true" /><span className="absolute pt-1 text-[8px] font-bold" aria-hidden="true">10</span></span></PlayerButton>
          <PlayerButton label="Forward 10 seconds" title="Forward 10 seconds (→)" onClick={() => seekBy(10)}><span className="relative flex size-6 items-center justify-center"><RotateCw className="size-6" aria-hidden="true" /><span className="absolute pt-1 text-[8px] font-bold" aria-hidden="true">10</span></span></PlayerButton>
          <PlayerButton label={muted ? "Unmute" : "Mute"} title="Mute or unmute (M)" pressed={muted} onClick={toggleMute}>{muted || volume === 0 ? <VolumeX className="size-5" aria-hidden="true" /> : <Volume2 className="size-5" aria-hidden="true" />}</PlayerButton>
          <input type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume} onChange={(event) => changeVolume(Number(event.target.value))}
            aria-label="Volume" aria-valuetext={`${Math.round((muted ? 0 : volume) * 100)} percent`} className={`${styles.volume} w-14 cursor-pointer sm:w-20`} />
        </div>
        <div className="flex items-center gap-0.5 sm:gap-1">
          <label className="sr-only" htmlFor={`quality-${video._id}`}>Video quality</label>
          <select id={`quality-${video._id}`} value={quality} onChange={(event) => changeQuality(event.target.value as VideoQuality)} title="Video quality"
            className="h-9 rounded-lg bg-white/10 px-2 text-xs font-semibold text-white outline-none transition hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-[#ffb59f] sm:h-10 sm:text-sm">{(video.qualityOptions || [{ quality, allowed: true, requiredPlanId: "free" }]).map((item) => <option key={item.quality} value={item.quality} disabled={!item.allowed} className="bg-[#182033] text-white">{item.quality}{item.allowed ? "" : ` · ${item.requiredPlanId} plan`}</option>)}</select>
          <PlayerButton label={captionsOn ? "Turn captions off" : "Turn captions on"} title="Captions (C)" pressed={captionsOn} disabled={!video.hasCaptions} onClick={toggleCaptions}><Captions className="size-5" aria-hidden="true" /></PlayerButton>
          <label className="sr-only" htmlFor={`speed-${video._id}`}>Playback speed</label>
          <select id={`speed-${video._id}`} value={speed} onChange={(event) => changeSpeed(Number(event.target.value))} title="Playback speed (, / .)"
            className="h-9 rounded-lg bg-white/10 px-2 text-xs font-semibold text-white outline-none transition hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-[#ffb59f] sm:h-10 sm:text-sm">{speeds.map((item) => <option key={item} value={item} className="bg-[#182033] text-white">{item}×</option>)}</select>
          <PlayerButton label={theatreMode ? "Exit theatre mode" : "Theatre mode"} title="Theatre mode (T)" pressed={theatreMode} onClick={toggleTheatre}>{theatreMode ? <Shrink className="size-5" aria-hidden="true" /> : <Expand className="size-5" aria-hidden="true" />}</PlayerButton>
          <PlayerButton label={pictureInPicture ? "Exit Picture-in-Picture" : "Picture-in-Picture"} title="Picture-in-Picture (P)" pressed={pictureInPicture} onClick={() => { void togglePictureInPicture(); }}><PictureInPicture2 className="size-5" aria-hidden="true" /></PlayerButton>
          <PlayerButton label={fullscreen ? "Exit full screen" : "Full screen"} title="Full screen (F)" pressed={fullscreen} onClick={() => { void toggleFullscreen(); }}>{fullscreen ? <Minimize className="size-5" aria-hidden="true" /> : <Maximize className="size-5" aria-hidden="true" />}</PlayerButton>
          <PlayerButton label="Keyboard shortcuts" title="Keyboard shortcuts (?)" pressed={showShortcuts} onClick={() => setShowShortcuts((value) => !value)}><Keyboard className="size-5" aria-hidden="true" /></PlayerButton>
        </div>
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] font-medium text-white/70 sm:text-xs">
        <span aria-live="off">{formatTime(currentTime)} / {formatTime(playableDuration)} <span className="text-white/40">·</span> -{formatTime(remaining)}</span>
        <span className="inline-flex items-center gap-1.5 text-white/55">{progressState === "loading" ? "Checking saved position…" : progressState === "error" ? "Position saving unavailable" : saveState === "saving" ? "Saving position…" : saveState === "error" ? "Position not saved" : completed ? `Completed · ${completionPercent}% watched` : `${playableDuration > 0 ? Math.floor(watchedSeconds / playableDuration * 100) : 0}% watched · saves every 5 seconds`}</span>
      </div>
    </div>
  </div>;
}
