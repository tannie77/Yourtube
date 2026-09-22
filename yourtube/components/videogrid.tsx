"use client";

import React, { useEffect, useState } from "react";
import VideoCard from "./videocard";
import axiosInstance from "@/lib/axiosinstance";

export default function Videogrid() {
  // 1. Initialize state as an empty array instead of null
  const [videos, setVideos] = useState([]);

useEffect(() => {
  axiosInstance
    .get("/video/getall")
    .then((res) => {
      console.log("API response:", res.data); // temporary debug log
      setVideos(Array.isArray(res.data) ? res.data : res.data?.videos || []);
    })
    .catch((err) => console.error(err));
}, []);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {/* 2. Use optional chaining to safely map through videos */}
      {videos?.map((video: any) => (
        <VideoCard key={video.id || video._id} video={video} />
      ))}
    </div>
  );
}

