"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Videoplayer from "@/components/Videoplayer";
import VideoInfo from "@/components/videoinfo";
import Comments from "@/components/comments";
import RelatedVideos from "@/components/RelatedVideos";
import axiosInstance from "@/lib/axiosinstance";

export default function WatchPage() {
  const params = useParams<{ id: string }>();
  const [video, setVideo] = useState<any>(null);
  const [videos, setVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadVideo = async () => {
      try {
        const response = await axiosInstance.get("/video/getall");
        const allVideos = Array.isArray(response.data) ? response.data : [];
        setVideos(allVideos.filter((item: any) => item._id !== params.id));
        setVideo(allVideos.find((item: any) => item._id === params.id) || null);
      } catch (error) {
        console.error("Could not load video:", error);
      } finally {
        setLoading(false);
      }
    };
    if (params.id) loadVideo();
  }, [params.id]);

  if (loading) return <main className="flex-1 p-4 text-sm text-muted-foreground">Loading video...</main>;
  if (!video) return <main className="flex-1 p-4"><h1 className="text-xl font-bold">Video not found</h1><p className="mt-1 text-sm text-muted-foreground">This video may have been removed or the backend is unavailable.</p></main>;

  return <main className="flex-1 p-4 lg:p-6"><div className="mx-auto grid max-w-[1700px] gap-6 xl:grid-cols-[minmax(0,1fr)_360px]"><div className="min-w-0 space-y-4"><Videoplayer video={video} /><VideoInfo video={video} /><Comments videoId={video._id} /></div><aside className="min-w-0"><h2 className="mb-3 text-base font-semibold">Related videos</h2><RelatedVideos videos={videos} /></aside></div></main>;
}
