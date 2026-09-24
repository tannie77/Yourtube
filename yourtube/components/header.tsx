"use client";

import React, { useState } from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "./ui/avatar";
import {
  Menu,
  Search,
  Mic,
  Bell,
  VideoIcon,
  User,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/AuthContent";
import Channeldialogue from "./channeldialgoue";

const Header = () => {
  const { user, loading: authLoading, logout } = useUser();

  const [searchQuery, setSearchQuery] = useState("");
  const [isdialogopen, setisdialogopen] = useState(false);

  const router = useRouter();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();

    if (searchQuery.trim()) {
      router.push(
        `/search?q=${encodeURIComponent(searchQuery.trim())}`
      );
    }
  };

  return (
    <header className="flex items-center justify-between px-4 py-2 bg-white border-b">
      {/* Left - Logo */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon">
          <Menu className="w-6 h-6" />
        </Button>

        <Link href="/dashboard" className="flex items-center gap-1">
          <div className="bg-red-600 p-1 rounded">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="white"
            >
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136C4.495 20.455 12 20.455 12 20.455s7.505 0 9.377-.505a3.016 3.016 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
            </svg>
          </div>

          <span className="text-xl font-medium">VidCircle</span>
          <span className="text-xs text-gray-400 ml-1">IN</span>
        </Link>
      </div>

      {/* Middle - Search */}
      <form
        onSubmit={handleSearch}
        className="flex items-center gap-2 flex-1 max-w-2xl mx-4"
      >
        <div className="flex flex-1">
          <Input
            type="search"
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="rounded-l-full border-r-0 focus-visible:ring-0"
          />

          <Button
            type="submit"
            className="rounded-r-full px-6 bg-gray-50 hover:bg-gray-100 text-gray-600 border border-l-0"
          >
            <Search className="w-5 h-5" />
          </Button>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="rounded-full"
        >
          <Mic className="w-5 h-5" />
        </Button>
      </form>

      {/* Right - User actions */}
      <div className="flex items-center gap-2">
        {user ? (
          <>
            <Button variant="ghost" size="icon">
              <VideoIcon className="w-6 h-6" />
            </Button>

            <Button variant="ghost" size="icon">
              <Bell className="w-6 h-6" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="relative h-8 w-8 rounded-full"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user.image || ""} />
                    <AvatarFallback>
                      {user.name?.[0] || "U"}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent
                className="w-56"
                align="end"
                forceMount
              >
                {user?.channelname ? (
                  <DropdownMenuItem asChild>
                    <Link href={`/channel/${user?._id}`}>
                      Your channel
                    </Link>
                  </DropdownMenuItem>
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

                <DropdownMenuItem asChild>
                  <Link href="/history">History</Link>
                </DropdownMenuItem>

                <DropdownMenuItem asChild>
                  <Link href="/liked">Liked videos</Link>
                </DropdownMenuItem>

                <DropdownMenuItem asChild>
                  <Link href="/watch-later">Watch later</Link>
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem onClick={() => { void logout(); }}>
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : !authLoading ? (
          <Button asChild className="flex items-center gap-2">
            <Link href="/sign-in"><User className="w-4 h-4" />Sign in</Link>
          </Button>
        ) : null}
      </div>

      <Channeldialogue
        isopen={isdialogopen}
        onclose={() => setisdialogopen(false)}
        mode="create"
      />
    </header>
  );
};

export default Header;
