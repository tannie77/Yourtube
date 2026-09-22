"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import Videoplayer from "@/components/Videoplayer";
import Comments from "@/components/components";
import RelatedVideos from "@/components/RelatedVideos";
import Videoinfo from "@/components/videoinfo";
import axiosInstance from "@/lib/axiosinstance";

const WatchPage = () => {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");

  const [video, setVideo] = useState<any>(null);
  const [videos, setVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchVideo = async () => {
      if (!id) {
        setLoading(false);
        return;
      }

      try {
        const res = await axiosInstance.get("/video/getall");

        const allVideos = res.data || [];

        const selectedVideo = allVideos.find(
          (vid: any) => vid._id === id
        );

        setVideo(selectedVideo);
        setVideos(allVideos);
      } catch (error) {
        console.error("Error fetching video:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchVideo();
  }, [id]);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!video) {
    return <div>Video not found</div>;
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto p-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          <div className="lg:col-span-2 space-y-4">
            <Videoplayer video={video} />

            <Videoinfo video={video} />

            <Comments videoId={id} />
          </div>

          <div className="space-y-4">
            <RelatedVideos videos={videos} />
          </div>

        </div>
      </div>
    </div>
  );
};

export default WatchPage; 