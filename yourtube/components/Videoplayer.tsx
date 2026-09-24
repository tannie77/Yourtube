"use client";

import { useState } from "react";
import { mediaSource, type LocalVideo } from "@/lib/local-video";

export default function Videoplayer({ video }: { video: LocalVideo }) {
  const source = mediaSource(video);
  const [playbackError, setPlaybackError] = useState(false);

  return (
    <div className="overflow-hidden rounded-[22px] bg-[#101421] shadow-[0_18px_45px_rgba(16,20,33,0.14)]">
      <video key={source} controls preload="metadata" playsInline className="aspect-video w-full bg-black object-contain" onError={() => setPlaybackError(true)} aria-label={`Play ${video.videotitle}`}>
        {source && <source src={source} type="video/mp4" />}
        Your browser does not support HTML5 video.
      </video>
      {playbackError && <p role="alert" className="px-5 py-3 text-sm text-white">This file could not be played. Check that the uploaded MP4 is supported by your browser.</p>}
    </div>
  );
}
