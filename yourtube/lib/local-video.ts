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
};

export function mediaSource(video: LocalVideo) {
  const relativePath = video.mediaUrl || video.filepath || "";
  if (!relativePath.startsWith("/uploads/")) return "";
  const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:5000";
  return `${baseUrl.replace(/\/$/, "")}${relativePath}`;
}

export function addedDate(value?: string) {
  if (!value) return "Added recently";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Added recently";
  return `Added ${new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(date)}`;
}
