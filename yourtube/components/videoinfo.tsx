"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { MoreHorizontal, Share2, ThumbsDown, ThumbsUp } from "lucide-react";
import axiosInstance from "@/lib/axiosinstance";
import { useUser } from "@/lib/AuthContent";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Button } from "./ui/button";

export default function VideoInfo({ video }: { video: any }) {
  const { user } = useUser();
  const [likes, setLikes] = useState(video.Like || 0);
  const [dislikes, setDislikes] = useState(video.Dislike || 0);
  const [activeReaction, setActiveReaction] = useState<"like" | "dislike" | null>(null);
  const [expanded, setExpanded] = useState(false);

  const reactToVideo = async (reaction: "like" | "dislike") => {
    const userId = user?._id || user?.id;
    if (!userId) return;
    try {
      const response = await axiosInstance.post(`/like/${video._id}`, { userId, reaction });
      setLikes(response.data.likes);
      setDislikes(response.data.dislikes);
      setActiveReaction(response.data.active ? reaction : null);
    } catch (error) { console.error("Could not save reaction:", error); }
  };

  const share = async () => {
    await navigator.clipboard?.writeText(window.location.href);
  };

  const channelName = video.videochanel || video.uploader || "YourTube creator";
  return <section className="space-y-4">
    <h1 className="text-xl font-bold leading-7 md:text-2xl">{video.videotitle}</h1>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3"><Avatar className="size-10"><AvatarFallback>{channelName[0]?.toUpperCase() || "C"}</AvatarFallback></Avatar><div><p className="font-semibold">{channelName}</p><p className="text-xs text-muted-foreground">Creator profile</p></div><Button className="ml-1 rounded-full bg-black px-5 text-white hover:bg-black/80">Subscribe</Button></div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-full bg-muted"><Button variant="ghost" onClick={() => reactToVideo("like")} className={`rounded-none px-4 ${activeReaction === "like" ? "bg-muted-foreground/15" : ""}`}><ThumbsUp className={`mr-2 size-5 ${activeReaction === "like" ? "fill-current" : ""}`} />{likes.toLocaleString()}</Button><span className="my-2 w-px bg-border" /><Button variant="ghost" size="icon" onClick={() => reactToVideo("dislike")} className={`rounded-none ${activeReaction === "dislike" ? "bg-muted-foreground/15" : ""}`} aria-label={`Dislike (${dislikes})`}><ThumbsDown className={`size-5 ${activeReaction === "dislike" ? "fill-current" : ""}`} /></Button></div>
        <Button variant="secondary" className="rounded-full" onClick={share}><Share2 className="mr-2 size-5" />Share</Button><Button variant="secondary" size="icon" className="rounded-full"><MoreHorizontal className="size-5" /></Button>
      </div>
    </div>
    <div className="rounded-xl bg-muted p-3 text-sm leading-6"><p className="font-semibold">{(video.views || 0).toLocaleString()} views · {video.createdAt ? formatDistanceToNow(new Date(video.createdAt), { addSuffix: true }) : "Recently"}</p><p className={expanded ? "mt-1 whitespace-pre-wrap" : "mt-1 line-clamp-2"}>{video.description || "Watch this video from " + channelName + "."}</p><button onClick={() => setExpanded(!expanded)} className="font-semibold">{expanded ? "Show less" : "...more"}</button></div>
  </section>;
}
