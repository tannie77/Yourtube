export type VideoAccessPlan = "free" | "bronze" | "silver" | "gold";
export type VideoQuality = "480p" | "720p" | "1080p" | "4K";

export type LocalVideo = {
  _id: string;
  videotitle: string;
  videochanel: string;
  uploader: string;
  mediaUrl?: string;
  filepath?: string;
  filename?: string;
  filesize?: number;
  createdAt?: string;
  accessPlan: VideoAccessPlan;
  canWatch: boolean;
  sourceQuality?: VideoQuality;
  qualityOptions?: { quality: VideoQuality; allowed: boolean; requiredPlanId: VideoAccessPlan }[];
  hasCaptions?: boolean;
  previewCount?: number;
  durationSeconds?: number;
  earlyAccessUntil?: string | null;
  earlyAccessActive?: boolean;
  showLocalAd?: boolean;
  mediaUnavailable?: boolean;
};

function videoBaseUrl(video: LocalVideo) {
  if (!/^[a-f0-9]{24}$/i.test(video._id)) return "";
  const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:5000";
  return `${baseUrl.replace(/\/$/, "")}/video/${video._id}`;
}

export function mediaSource(video: LocalVideo, quality?: VideoQuality) {
  const base = videoBaseUrl(video);
  return base ? `${base}/media${quality ? `?quality=${quality}` : ""}` : "";
}

export function previewSource(video: LocalVideo, index: number) {
  const base = videoBaseUrl(video);
  return base && Number.isInteger(index) && index >= 0 ? `${base}/preview/${index}` : "";
}

export function accessPlanName(plan: VideoAccessPlan) {
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

export function addedDate(value?: string) {
  if (!value) return "Added recently";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Added recently";
  return `Added ${new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(date)}`;
}
