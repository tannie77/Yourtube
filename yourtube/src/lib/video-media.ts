export type VideoQuality = "480p" | "720p" | "1080p" | "4K";
export type VideoAccessPlan = "free" | "bronze" | "silver" | "gold";

export interface VideoRecord {
  _id: string;
  videotitle: string;
  videochanel: string;
  uploader: string;
  views: number;
  Like?: number;
  createdAt: string;
  durationSeconds?: number;
  previewCount?: number;
  canWatch: boolean;
  accessPlan?: VideoAccessPlan | null;
  sourceQuality?: VideoQuality;
  qualityOptions?: { quality: VideoQuality; allowed: boolean; requiredPlanId: VideoAccessPlan }[];
  earlyAccessActive?: boolean;
  isCourse?: boolean;
  showLocalAd?: boolean;
  maxPlaybackSpeed?: number;
  hasCaptions?: boolean;
  mediaUnavailable?: boolean;
  likedByViewer?: boolean;
  savedForLater?: boolean;
}

const backendUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:5000").replace(/\/$/, "");

export function videoMediaUrl(id: string, quality?: VideoQuality) {
  return `${backendUrl}/video/${encodeURIComponent(id)}/media${quality ? `?quality=${encodeURIComponent(quality)}` : ""}`;
}

export function videoPreviewUrl(id: string, index = 0) {
  return `${backendUrl}/video/${encodeURIComponent(id)}/preview/${Math.max(0, Math.floor(index))}`;
}

export function videoCaptionsUrl(id: string) {
  return `${backendUrl}/video/${encodeURIComponent(id)}/captions`;
}

export function formatDuration(seconds?: number) {
  if (!Number.isFinite(seconds) || !seconds || seconds <= 0) return null;
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const remainder = String(total % 60).padStart(2, "0");
  return `${minutes}:${remainder}`;
}
