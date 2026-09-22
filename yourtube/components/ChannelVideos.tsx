import React from "react";
import VideoCard from "./videocard";

const ChannelVideos = ({ videos }: any) => {
        if (videos.length === 0) {
            return (
            <div>
                <p>NO videos uploaded yet</p>
            </div>
            );
        }
return (
    <div>
        <h2>Videos</h2>
        <div>
            {videos.map((video: any) => (
            <VideoCard key={video._id} video={video} />
            ))}
        </div>
    </div>
  );
};

export default ChannelVideos;