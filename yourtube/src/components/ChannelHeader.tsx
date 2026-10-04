import { useState } from "react";
import { Pencil, Upload } from "lucide-react";
import Channeldialogue from "./channeldialogue";

export default function ChannelHeader({ channel }: { channel: { _id: string; channelname: string; description?: string } }) {
  const [editOpen, setEditOpen] = useState(false);
  const name = channel.channelname || "Your channel";
  return (
    <>
      <div className="yt-channel-banner" aria-hidden="true" />
      <div className="yt-channel-header">
        <span className="yt-channel-avatar" aria-hidden="true">{name[0]?.toUpperCase() || "Y"}</span>
        <div className="min-w-0 flex-1">
          <h1 className="yt-channel-name">{name}</h1>
          <p className="yt-video-meta">@{name.toLowerCase().replace(/\s+/g, "")}</p>
          {channel.description && <p className="yt-channel-description">{channel.description}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="yt-pill-button" onClick={() => setEditOpen(true)}><Pencil aria-hidden="true" />Edit channel</button>
          <a href="#upload" className="yt-primary-button"><Upload aria-hidden="true" className="h-4 w-4" />Upload video</a>
        </div>
      </div>
      <Channeldialogue isopen={editOpen} onclose={() => setEditOpen(false)} mode="edit" channeldata={channel} />
    </>
  );
}
