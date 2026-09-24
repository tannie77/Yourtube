"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import ChannelDialogue from "@/components/channeldialgoue";
import { useUser } from "@/lib/AuthContent";

export default function ChannelPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading } = useUser();
  const [editing, setEditing] = useState(false);

  if (loading) return <main className="p-8">Loading channel...</main>;
  if (!user) {
    return <main className="p-8">Sign in to view your channel. <Link className="underline" href="/sign-in">Sign in</Link></main>;
  }
  if (user._id !== id || !user.channelname) {
    return <main className="p-8">This channel is not available yet.</main>;
  }

  return (
    <main className="min-h-screen flex-1 bg-white p-6 md:p-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="h-32 rounded-xl bg-gradient-to-r from-red-500 to-orange-300" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">{user.channelname}</h1>
            <p className="mt-1 text-sm text-gray-500">{user.name}</p>
          </div>
          <Button variant="outline" onClick={() => setEditing(true)}>Edit channel</Button>
        </div>
        <p className="whitespace-pre-wrap text-gray-700">{user.description || "Add a description to introduce your channel."}</p>
        <p className="border-t pt-6 text-sm text-gray-500">Video uploads and channel videos will be completed in the next builds.</p>
      </div>
      <ChannelDialogue
        isopen={editing}
        onclose={() => setEditing(false)}
        mode="edit"
        channeldata={{ name: user.channelname, description: user.description }}
      />
    </main>
  );
}
