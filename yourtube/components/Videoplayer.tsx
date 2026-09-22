import React, { useRef } from "react";

const Videoplayer = ({ video }: any) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const filePath = video?.filepath?.replace(/\\/g, "/").replace(/^\/+/, "") || "";

  return (
  <div className="aspect-video bg-black rounded-lg overflow-hidden">
    <video
      ref={videoRef}
      className="w-full h-full"
      controls
      poster="/placeholder.svg"
    >
      <source
        src={`${process.env.NEXT_PUBLIC_BACKEND_URL || ""}/${filePath}`}
        type="video/mp4"
      />
      Your browser does not support the video tag.
    </video>
  </div>
)
};

export default Videoplayer;
