"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { formatDistanceToNow } from "date-fns";
import { MoreVertical, X, Clock, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
    import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    } from "@/components/ui/dropdown-menu";

    interface LikeItem {
    _id: string;
    videoid: string;
    viewer: string;
    watchedon: string;
    video: {
        _id: string;
        videotitle: string;
        videochanel: string;
        views: number;
        createdAt: string;
    };
    }
    export default function LikedContent() {
    const [like, setLike] = useState<LikeItem[]>([]);
    const [loading, setLoading] = useState(true);

    const user = {
        id: "1",
        name: "John Doe",
        email: "john@example.com",
        image: "https://github.com/shadcn.png?height=32&width=32",
    };

    useEffect(() => {
        if (user) {
        loadHistory();
        }
    }, []);

    const loadHistory = async () => {
        if (!user) return;
        try {
        const likeData = [
        {
            _id: "h1",
            videoid: "1",
            viewer: user.id,
            watchedon: new Date(Date.now() - 3600000).toISOString(),
            video: {
            _id: "1",
            videotitle: "Amazing Nature Documentary",
            videochanel: "Nature Channel",
            views: 45000,
            createdAt: new Date().toISOString(),
            },
        },
        {
            _id: "h2",
            videoid: "2",
            viewer: user.id,
            watchedon: new Date(Date.now() - 7200000).toISOString(),
            video: {
                    _id: "2",
            videotitle: "Cooking Tutorial: Perfect Pasta",
            videochanel: "Chef's Kitchen",
            views: 23000,
            createdAt: new Date(Date.now() - 86400000).toISOString(),
            },
        },
        ];

        setLike(likeData);
    } catch (error) {
        console.error("Error loading like data:", error);
    } finally {
        setLoading(false);
    }
    };

    const handleunlikedvideos = async (likeId: string) => {
    try {
        console.log("Removing from like list:", likeId);

        setLike(like.filter((item) => item._id !== likeId));
    } catch (error) {
        console.error("Error removing from like list:", error);
    }
    };

    if (!user) {
    return (
        <div className="text-center py-12">
        <Clock className="w-16 h-16 mx-auto text-gray-400 mb-4" />
        <h2 className="text-xl font-semibold mb-2">
            Keep track of what you watch
        </h2>

        <p className="text-gray-600">
            Sign in to see your liked videos and manage your preferences.
        </p>
        </div>
    );
    }

    if (loading) {
    return <div>Loading Videos...</div>;
    }

    if (like.length === 0) {
    return (
        <div className="text-center py-12">
        <Clock className="w-16 h-16 mx-auto text-gray-400 mb-4" />
        <h2 className="text-xl font-semibold mb-2">
            No liked videos yet
        </h2>
        <p className="text-gray-600">
            Videos you like will appear here.
        </p>
        </div>
    );
    }

    const videos = "/video/vdo.mp4";

        return (
    <div className="space-y-4">
        <div className="flex justify-between items-center">
        <p className="text-sm text-gray-600">{like.length} videos</p>

        <Button>
            <Play className="w-4 h-4 mr-2" />
            Play all
        </Button>
        </div>

        <div className="space-y-4">
        {like.map((item) => (
            <div key={item._id} className="flex gap-4 group">
            <Link
                href={`/watch/${item.video._id}`}
                className="flex-shrink-0"
            >
                <div className="relative w-40 aspect-video bg-gray-100 rounded overflow-hidden">
                <video
                    src={videos}
                    className="object-cover group-hover:scale-105 transition-transform duration-200"
                />
                </div>
            </Link>

            <div className="flex-1 min-w-0">
                <Link href={`/watch/${item.video._id}`}>
                <h3 className="font-medium text-sm line-clamp-2 group-hover:text-blue-600 mb-1">
                    {item.video.videotitle}
                </h3>
                </Link>

                <p className="text-sm text-gray-600">
                {item.video.videochanel}
                </p>

                <p className="text-sm text-gray-600">
                {item.video.views.toLocaleString()} views •{" "}
                {formatDistanceToNow(new Date(item.video.createdAt))} ago
                </p>

                <p className="text-xs text-gray-500 mt-1">
                Watched {formatDistanceToNow(new Date(item.watchedon))} ago
                </p>
            </div>

            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="opacity-0 group-hover:opacity-100"
                >
                    <MoreVertical className="w-4 h-4" />
                </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="end">
                <DropdownMenuItem
                    onClick={() => handleunlikedvideos(item._id)}
                >
                    <X className="w-4 h-4 mr-2" />
                    Remove from Liked Videos
                </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            </div>
        ))}
        </div>
    </div>
    );
}