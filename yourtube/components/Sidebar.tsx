"use client";
import {
    Home,
    Compass,
    PlaySquare,
    History,
    ThumbsUp,
    Clock,
    User,
    } from "lucide-react";
    import Link from "next/link";
    import React, { useState } from "react";
    import { Button } from "./ui/button";
    
    import ChannelDialgoue from "./channeldialgoue";
import { useUser } from "@/lib/AuthContent";
const Sidebar = () => {
const {user} = useUser(); 

const [isdialogopen, setisdialogopen] = useState(false);

return (
    <aside className="w-64 min-h-screen border-r px-2 py-4">
    <nav className="flex flex-col gap-1">
        <Link href="/">
        <Button variant="ghost" className="w-full justify-start">
            <Home className="w-5 h-5 mr-3" />
            Home
        </Button>
        </Link>

        <Link href="/explore">
        <Button variant="ghost" className="w-full justify-start">
            <Compass className="w-5 h-5 mr-3" />
            Explore
        </Button>
        </Link>

        <Link href="/subscriptions">
        <Button variant="ghost" className="w-full justify-start">
            <PlaySquare className="w-5 h-5 mr-3" />
            Subscriptions
        </Button>
        </Link>

        {user && (
        <div className="border-t pt-2 mt-2 flex flex-col gap-1">
            <Link href="/history">
            <Button variant="ghost" className="w-full justify-start">
                <History className="w-5 h-5 mr-3" />
                History
            </Button>
            </Link>

            <Link href="/liked">
            <Button variant="ghost" className="w-full justify-start">
                <ThumbsUp className="w-5 h-5 mr-3" />
                Liked videos
            </Button>
            </Link>

            <Link href="/watch-later">
            <Button variant="ghost" className="w-full justify-start">
                <Clock className="w-5 h-5 mr-3" />
                Watch later
            </Button>
            </Link>

            {user?.channelname ? (
            <Link href={`/channel/${user._id}`}>
                <Button
                variant="ghost"
                className="w-full justify-start"
                >
                <User className="w-5 h-5 mr-3" />
                Your channel
                </Button>
            </Link>
            ) : (
            <div className="px-2 py-1.5">
                <Button
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={() => setisdialogopen(true)}
                >
                Create Channel
                </Button>
            </div>
            )}
        </div>
        )}
    </nav>
    <ChannelDialgoue isopen={isdialogopen} onclose={() => setisdialogopen(false)} mode="create"/>
    </aside>
);
};
export default Sidebar;
