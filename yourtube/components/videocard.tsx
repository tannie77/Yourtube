   "use client";

import React from "react";
import Link from "next/link";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { formatDistanceToNow } from "date-fns";

export default function VideoCard({ video }: any) {
  if (!video) return null;

  const videoId = video?._id || video?.id;

  const channelName =
    video?.videochanel ||
    video?.videoChannel ||
    video?.channel ||
    "Unknown Channel";

  const title = video?.videotitle || video?.title || "Untitled Video";

  const views = Number(video?.views || 0);

  const createdAt = video?.createdAt
    ? formatDistanceToNow(new Date(video.createdAt), {
        addSuffix: true,
      })
    : "Recently";

  return (
    <Link href={`/watch/${videoId}`} className="group">
      <div className="space-y-3">
        {/* Video */}
        <div className="relative aspect-video rounded-lg overflow-hidden bg-gray-100">
          <video
            src={`${process.env.NEXT_PUBLIC_BACKEND_URL || ""}${
              video?.filepath || ""
            }`}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
            controls={false}
            muted
          />

          <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-1 rounded">
            10:24
          </div>
        </div>

        {/* Video information */}
        <div className="flex gap-3">
          <Avatar className="w-9 h-9 flex-shrink-0">
            <AvatarFallback>
              {channelName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-sm line-clamp-2 group-hover:text-blue-600">
              {title}
            </h3>

            <p className="text-sm text-gray-600 mt-1">
              {channelName}
            </p>

            <p className="text-sm text-gray-600">
              {views.toLocaleString()} views • {createdAt}
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}