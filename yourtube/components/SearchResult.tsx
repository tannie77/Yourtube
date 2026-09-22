import React, { useEffect, useState } from "react";
import Link from "next/link";

const SearchResult = ({ query }: { query: string }) => {
  const [video, setVideos] = useState<any[]>([]);

  useEffect(() => {
    if (!query.trim()) {
      setVideos([]);
      return;
    }

    const allVideos = [
      {
        _id: "1",
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
        _id: "2",
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

    const searchQuery = query.toLowerCase();

    const results = allVideos.filter(
      (vid) =>
        vid.videotitle.toLowerCase().includes(searchQuery) ||
        vid.videochannel.toLowerCase().includes(searchQuery)
    );

    setVideos(results);
  }, [query]);

  // Empty search
  if (!query.trim()) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">
          Enter a search term to find videos
        </p>
      </div>
    );
  }

  // No results
  if (video.length === 0) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold mb-2">
          No results found
        </h2>

        <p className="text-gray-600">
          Try different keywords or remove search filters
        </p>
      </div>
    );
  }

  const vids = "/video/vdo.mp4";

  return (
    <div className="space-y-6">
      {/* Video Results */}
      <div className="space-y-4">
        {video.map((vid: any) => (
          <div
            key={vid._id}
            className="flex gap-4 group"
          >
            <Link
              href={`/watch/${vid._id}`}
              className="flex-shrink-0"
            >
              <div className="relative w-80 aspect-video bg-gray-100 rounded-lg overflow-hidden">
                <video
                  src={vids}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                  muted
                  playsInline
                />
              </div>
            </Link>

            {/* Video Information */}
            <div className="flex flex-col justify-center">
              <h3 className="text-lg font-semibold">
                {vid.videotitle}
              </h3>

              <p className="text-sm text-gray-600">
                {vid.videochannel}
              </p>

              <p className="text-sm text-gray-500">
                {vid.views.toLocaleString()} views
              </p>
            </div>
        </div>
        ))}
    </div>
    </div>
);
};

export default SearchResult;