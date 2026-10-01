import axios from "axios";
import { FileVideo, Upload, X } from "lucide-react";
import { ChangeEvent, useRef, useState } from "react";
import { toast } from "sonner";
import axiosInstance from "@/lib/axiosinstance";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Progress } from "./ui/progress";

export default function VideoUploader({ onUploaded }: { onUploaded: () => void }) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [captionFile, setCaptionFile] = useState<File | null>(null);
  const [videoTitle, setVideoTitle] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const captionInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setVideoFile(null); setCaptionFile(null); setVideoTitle(""); setUploadProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (captionInputRef.current) captionInputRef.current.value = "";
  };

  const selectVideo = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".mp4")) { toast.error("Choose an MP4 video file."); event.target.value = ""; return; }
    if (file.size > 100 * 1024 * 1024) { toast.error("Videos must be 100 MB or smaller."); event.target.value = ""; return; }
    setVideoFile(file);
    if (!videoTitle) setVideoTitle(file.name.replace(/\.mp4$/i, ""));
  };

  const selectCaptions = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) { setCaptionFile(null); return; }
    if (!file.name.toLowerCase().endsWith(".vtt") || file.size > 1024 * 1024) { toast.error("Choose a WebVTT (.vtt) file up to 1 MB."); event.target.value = ""; return; }
    setCaptionFile(file);
  };

  const handleUpload = async () => {
    if (!videoFile || !videoTitle.trim()) { toast.error("Choose a video and enter its title."); return; }
    const form = new FormData();
    form.append("file", videoFile);
    form.append("videotitle", videoTitle.trim());
    if (captionFile) form.append("captions", captionFile);
    setIsUploading(true); setUploadProgress(0);
    try {
      await axiosInstance.post("/video/upload", form, { onUploadProgress: (event) => {
        if (event.total) setUploadProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      } });
      toast.success("Video uploaded"); resetForm(); onUploaded();
    } catch (error) {
      const message = axios.isAxiosError(error) ? error.response?.data?.message : null;
      toast.error(message || "Could not upload the video. Please try again.");
    } finally { setIsUploading(false); }
  };

  return (
    <section id="upload" className="yt-upload-panel scroll-mt-20" aria-labelledby="upload-title">
      <div className="mb-5"><h2 id="upload-title" className="yt-section-title">Upload a video</h2><p className="yt-page-description">Share an MP4 video with your viewers. Captions are optional.</p></div>
      <div className="space-y-4">
        {!videoFile ? (
          <button type="button" className="yt-upload-drop" onClick={() => fileInputRef.current?.click()}><Upload aria-hidden="true" /><strong>Choose a video to upload</strong><span className="yt-subtle mt-1 text-xs">MP4 · Up to 100 MB</span></button>
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-[var(--yt-border)] bg-[var(--yt-bg)] p-3">
            <FileVideo className="h-6 w-6 text-[var(--yt-red)]" aria-hidden="true" />
            <div className="min-w-0 flex-1"><p className="truncate font-medium">{videoFile.name}</p><p className="yt-subtle text-xs">{(videoFile.size / (1024 * 1024)).toFixed(1)} MB</p></div>
            {!isUploading && <Button variant="ghost" size="icon" onClick={resetForm} aria-label="Remove video"><X className="h-4 w-4" /></Button>}
          </div>
        )}
        <input ref={fileInputRef} className="sr-only" type="file" accept=".mp4,video/mp4" onChange={selectVideo} aria-label="Select MP4 video" tabIndex={-1} />
        {videoFile && (
          <>
            <div><Label htmlFor="video-title">Title</Label><Input id="video-title" value={videoTitle} maxLength={120} onChange={(event) => setVideoTitle(event.target.value)} disabled={isUploading} className="mt-1" /></div>
            <div><Label htmlFor="video-captions">Captions (optional)</Label><Input ref={captionInputRef} id="video-captions" type="file" accept=".vtt,text/vtt" onChange={selectCaptions} disabled={isUploading} className="mt-1" />{captionFile && <p className="yt-subtle mt-1 text-xs">{captionFile.name}</p>}</div>
            {isUploading && <div className="space-y-2"><div className="flex justify-between text-sm"><span>{uploadProgress === 100 ? "Processing video…" : "Uploading…"}</span><span>{uploadProgress}%</span></div><Progress value={uploadProgress} className="h-2" /></div>}
            <div className="flex justify-end gap-3"><Button variant="outline" onClick={resetForm} disabled={isUploading}>Cancel</Button><button type="button" className="yt-primary-button" onClick={handleUpload} disabled={isUploading || !videoTitle.trim()}>{isUploading ? "Please wait…" : "Upload video"}</button></div>
          </>
        )}
      </div>
    </section>
  );
}
