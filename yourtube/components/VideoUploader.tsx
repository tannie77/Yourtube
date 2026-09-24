"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import axios from "axios";
import { ArrowUpRight, FileVideo, Upload, X } from "lucide-react";
import axiosInstance from "@/lib/axiosinstance";
import type { LocalVideo, VideoAccessPlan } from "@/lib/local-video";

const maxBytes = 100 * 1024 * 1024;

type Props = {
  channelId?: string;
  channelName?: string;
  onUploaded?: (video: LocalVideo) => void;
};

export default function VideoUploader({ channelName, onUploaded }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const captionInput = useRef<HTMLInputElement>(null);
  const requestController = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [captions, setCaptions] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [accessPlan, setAccessPlan] = useState<VideoAccessPlan>("free");
  const [earlyAccess, setEarlyAccess] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [uploadedVideo, setUploadedVideo] = useState<LocalVideo | null>(null);

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0] || null;
    setError("");
    setUploadedVideo(null);
    if (!chosen) return;
    if (chosen.type !== "video/mp4" || !chosen.name.toLowerCase().endsWith(".mp4")) {
      setError("Choose an MP4 video file.");
      event.target.value = "";
      return;
    }
    if (chosen.size > maxBytes) {
      setError("MP4 videos must be 100 MB or smaller.");
      event.target.value = "";
      return;
    }
    setFile(chosen);
    if (!title.trim()) setTitle(chosen.name.replace(/\.mp4$/i, "").slice(0, 120));
  }

  function removeFile() {
    setFile(null);
    setError("");
    if (fileInput.current) fileInput.current.value = "";
  }

  function selectCaptions(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0] || null;
    setError("");
    if (chosen && (!chosen.name.toLowerCase().endsWith(".vtt") || chosen.size > 1024 * 1024)) {
      setError("Choose a WebVTT (.vtt) caption file up to 1 MB.");
      event.target.value = "";
      return;
    }
    setCaptions(chosen);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !title.trim()) {
      setError("Choose an MP4 file and enter a title.");
      return;
    }

    const form = new FormData();
    form.set("file", file);
    if (captions) form.set("captions", captions);
    form.set("videotitle", title.trim());
    form.set("accessPlan", accessPlan);
    form.set("earlyAccess", String(earlyAccess));
    const controller = new AbortController();
    requestController.current = controller;
    setUploading(true);
    setProgress(0);
    setError("");
    setUploadedVideo(null);

    try {
      const response = await axiosInstance.post<{ video: LocalVideo }>("/video/upload", form, {
        signal: controller.signal,
        onUploadProgress: (event) => {
          if (event.total) setProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
        },
      });
      setUploadedVideo(response.data.video);
      setFile(null);
      setCaptions(null);
      setTitle("");
      setAccessPlan("free");
      setEarlyAccess(false);
      setProgress(0);
      if (fileInput.current) fileInput.current.value = "";
      if (captionInput.current) captionInput.current.value = "";
      onUploaded?.(response.data.video);
    } catch (uploadError) {
      if (axios.isCancel(uploadError)) {
        setError("Upload cancelled. Your file is still selected if you want to try again.");
      } else if (axios.isAxiosError(uploadError)) {
        setError(uploadError.response?.data?.message || "Could not upload the video. Please try again.");
      } else {
        setError("Could not upload the video. Please try again.");
      }
    } finally {
      requestController.current = null;
      setUploading(false);
    }
  }

  return (
    <form onSubmit={(event) => { void submit(event); }} className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-[-0.045em] text-[#172033]">Upload a video</h2>
        <p className="mt-1 text-sm text-[#7d8797]">{channelName ? `Share an MP4 from ${channelName}.` : "Share an MP4 with your local video library."}</p>
      </div>

      <label htmlFor="video-file" className="group flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#dce2ea] bg-[#fafbfc] px-5 py-7 text-center transition hover:border-[#ed9b89] hover:bg-[#fff8f5] focus-within:border-[#ed6049] focus-within:ring-4 focus-within:ring-[#ed6049]/10">
        <span className="flex size-11 items-center justify-center rounded-xl bg-[#fff0ec] text-[#e56a51]"><Upload className="size-5" aria-hidden="true" /></span>
        <span className="mt-3 text-sm font-semibold text-[#344054]">{file ? "Choose a different MP4" : "Choose an MP4 video"}</span>
        <span className="mt-1 text-xs text-[#929bab]">Stored on this computer · up to 100 MB</span>
        <input ref={fileInput} id="video-file" type="file" accept="video/mp4,.mp4" onChange={selectFile} disabled={uploading} className="sr-only" aria-describedby="video-file-help" />
      </label>
      <p id="video-file-help" className="sr-only">Only MP4 files up to 100 MB can be uploaded.</p>

      {file && (
        <div className="flex items-center gap-3 rounded-xl border border-[#e8ebf0] bg-white p-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#f5f2ff] text-[#7666a7]"><FileVideo className="size-5" aria-hidden="true" /></span>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[#344054]">{file.name}</p><p className="mt-0.5 text-xs text-[#929bab]">{(file.size / (1024 * 1024)).toFixed(1)} MB</p></div>
          <button type="button" aria-label="Remove selected file" disabled={uploading} onClick={removeFile} className="rounded-lg p-2 text-[#929bab] hover:bg-[#f5f6f8] hover:text-[#344054] disabled:opacity-40"><X className="size-4" aria-hidden="true" /></button>
        </div>
      )}

      <div>
        <label htmlFor="video-captions" className="mb-2 block text-sm font-semibold text-[#344054]">Captions <span className="font-normal text-[#8d96a5]">(optional)</span></label>
        <input ref={captionInput} id="video-captions" type="file" accept=".vtt,text/vtt" onChange={selectCaptions} disabled={uploading} className="block w-full rounded-xl border border-[#dce2ea] bg-white p-3 text-sm text-[#344054] file:mr-3 file:rounded-lg file:border-0 file:bg-[#fff0ec] file:px-3 file:py-2 file:font-semibold file:text-[#d75b45] disabled:opacity-60" />
        <p className="mt-1.5 text-xs text-[#8d96a5]">Upload a UTF-8 WebVTT file with time-coded cues, up to 1 MB.</p>
      </div>

      <div>
        <label htmlFor="video-title" className="mb-2 block text-sm font-semibold text-[#344054]">Video title</label>
        <input id="video-title" type="text" maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} disabled={uploading} placeholder="Give your video a name" className="h-12 w-full rounded-xl border border-[#dce2ea] bg-white px-4 text-sm text-[#172033] outline-none transition placeholder:text-[#a0a8b5] focus:border-[#ed6049] focus:ring-4 focus:ring-[#ed6049]/10 disabled:opacity-60" />
      </div>

      <div>
        <label htmlFor="video-access-plan" className="mb-2 block text-sm font-semibold text-[#344054]">Minimum viewer plan</label>
        <select id="video-access-plan" value={accessPlan} onChange={(event) => setAccessPlan(event.target.value as VideoAccessPlan)} disabled={uploading} className="h-12 w-full rounded-xl border border-[#dce2ea] bg-white px-4 text-sm text-[#172033] outline-none transition focus:border-[#ed6049] focus:ring-4 focus:ring-[#ed6049]/10 disabled:opacity-60">
          <option value="free">Free · anyone signed in</option>
          <option value="bronze">Bronze or higher</option>
          <option value="silver">Silver or higher</option>
          <option value="gold">Gold only</option>
        </select>
        <p className="mt-1.5 text-xs leading-5 text-[#8d96a5]">You can always preview your own upload. Other viewers need the selected plan or higher.</p>
        <p className="mt-1 text-xs leading-5 text-[#8d96a5]">New uploads make lower-resolution local copies where needed. Free can select up to 480p, Bronze 720p, Silver 1080p and Gold 4K. Older uploads without copies keep their source-quality gate.</p>
      </div>

      <label className="flex items-start gap-3 rounded-xl border border-[#e8ebf0] bg-[#fafbfc] p-4 text-sm text-[#344054]">
        <input type="checkbox" checked={earlyAccess} onChange={(event) => setEarlyAccess(event.target.checked)} disabled={uploading} className="mt-0.5 accent-[#ed6049]" />
        <span><span className="font-semibold">Gold early access for seven days</span><span className="mt-1 block text-xs leading-5 text-[#8d96a5]">After seven days, the selected minimum plan and available quality determine access automatically.</span></span>
      </label>

      {uploading && <div aria-live="polite"><div className="mb-2 flex justify-between text-xs font-semibold text-[#697486]"><span>{progress === 100 ? "Creating local qualities and previews…" : "Uploading…"}</span><span>{progress}%</span></div><div className="h-2 overflow-hidden rounded-full bg-[#f3e6e2]"><div className="h-full rounded-full bg-[#ed6049] transition-all" style={{ width: `${progress}%` }} /></div></div>}
      {error && <p role="alert" className="rounded-xl border border-[#f3d5cf] bg-[#fff7f4] px-4 py-3 text-sm text-[#a34d3d]">{error}</p>}
      {uploadedVideo && <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#cce7d9] bg-[#f2fbf6] px-4 py-3 text-sm text-[#276b4b]"><span>Video uploaded successfully.</span><Link href={`/watch/${uploadedVideo._id}`} className="inline-flex items-center gap-1 font-semibold hover:underline">Watch it <ArrowUpRight className="size-4" aria-hidden="true" /></Link></div>}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={uploading || !file || !title.trim()} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#ed6049] px-5 text-sm font-semibold text-white shadow-[0_10px_18px_rgba(237,96,73,0.18)] transition hover:bg-[#dd563f] disabled:cursor-not-allowed disabled:opacity-50"><Upload className="size-4" aria-hidden="true" />{uploading ? "Uploading…" : "Upload video"}</button>
        {uploading && <button type="button" onClick={() => requestController.current?.abort()} className="h-11 rounded-xl px-3 text-sm font-semibold text-[#697486] hover:bg-[#f6f7f9]">Cancel upload</button>}
      </div>
    </form>
  );
}
