"use client";

import React from "react";
import ChannelHeader from "../../../components/ChannelHeader";
import ChannelTabs from "../../../components/ChannelTabs";
import VideoUploader from "../../../components/VideoUploader";
import ChannelVideos from "../../../components/ChannelVideos";
import { useRouter } from "next/router";

const Index = () => {
  const router = useRouter();
  const { id } = router.query;

  const { user } = useUser();

  // Temporary channel data
  const channel = {
    id: id as string,
    channelName: user?.name || "My Channel",
  };

  const videos = [
    {
      id: "1",
      videotitle: "Amazing Nature Documentary",
      filename: "nature-doc.mp4",
      filetype: "video/mp4",
      filepath: "/videos/nature-doc.mp4",
      filesize: "500MB",
      videochannel: "Nature Channel",
      Like: 1250,
      views: 45000,
      uploader: "nature_lover",
      createdAt: new Date().toISOString(),
    },
    {
      id: "2",
      videotitle: "Cooking Tutorial: Perfect Pasta",
      filename: "pasta-tutorial.mp4",
      filetype: "video/mp4",
      filepath: "/videos/pasta-tutorial.mp4",
      filesize: "300MB",
      videochannel: "Chef's Kitchen",
      Like: 890,
      views: 23000,
      uploader: "chef_master",
      createdAt: new Date(
        Date.now() - 86400000
      ).toISOString(),
    },
  ];

  return (
    <div className="flex-1 min-h-screen bg-white">
      <div className="max-w-7xl mx-auto">
        <ChannelHeader
          channel={channel}
          user={user}
        />

        <ChannelTabs />

        <div className="px-4 pb-8">
          <VideoUploader
            channelId={id as string}
            channelName={channel.channelName}
          />
        </div>

        <div>
          <ChannelVideos videos={videos} />
        </div>
      </div>
    </div>
  );
};

export default Index;

function useUser(): { user: any } {
  // Temporary user data
  return {
    user: {
      id: "1",
      name: "John Doe",
      email: "john@example.com",
      image: "https://github.com/shadcn.png",
    },
  };
}
