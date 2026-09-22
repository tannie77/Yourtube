    "use client";
    import { formatDistanceToNow } from "date-fns";
    import Link from "next/link";
    import React, { useEffect, useState } from "react";

    const vid = "/video/vdo.mp4";

    const RelatedVideos = ({ videos }: any) => {
    const [timeAgo, setTimeAgo] = useState<{ [key: string]: string }>({});

    useEffect(() => {
        const times: { [key: string]: string } = {};
        videos.forEach((v: any) => {
        times[v._id] = formatDistanceToNow(new Date(v.createdAt));
        });
        setTimeAgo(times);
    }, [videos]);

        return (
        <div className="space-y-3">
        {videos.map((video: any) => (
            <Link key={video._id} href={`/watch/${video._id}`}>
            <div className="flex gap-2 mb-3"> {/* ✅ side by side layout */}
                <div className="w-40 shrink-0">  {/* ✅ fixed width thumbnail */}
                <video src={vid} className="w-full rounded-lg" />
                </div>
                <div>
                <h3 className="text-sm font-medium line-clamp-2">{video.videotitle}</h3>
                <p className="text-xs text-gray-500">{video.videochanel}</p>
                <p className="text-xs text-gray-500">
                    {video.views.toLocaleString()} views •{" "}
                    {timeAgo[video._id]} ago
                </p>
                </div>
            </div>
            </Link>
        ))}
        </div>
    );
    };

export default RelatedVideos;