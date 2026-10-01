import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Clapperboard } from "lucide-react";
import axiosInstance from "@/lib/axiosinstance";
import { useUser } from "@/lib/AuthContext";
import { VideoRecord } from "@/lib/video-media";
import ChannelHeader from "@/components/ChannelHeader";
import ChannelVideos from "@/components/ChannelVideos";
import EmptyState from "@/components/EmptyState";
import VideoUploader from "@/components/VideoUploader";

export default function ChannelPage() {
  const router = useRouter();
  const { id } = router.query;
  const { user, loading: authLoading } = useUser();
  const [videos, setVideos] = useState<VideoRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadVideos = async () => {
    if (typeof id !== "string") return;
    setLoading(true);
    setError(false);
    try {
      const response = await axiosInstance.get<VideoRecord[]>("/video/getall");
      setVideos(response.data.filter((video) => video.uploader === id));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading || !router.isReady) return;
    if (!user || user._id !== id) { setLoading(false); return; }
    void loadVideos();
  }, [authLoading, router.isReady, user?._id, id]);

  if (authLoading || !router.isReady || loading) return <main className="yt-page"><p className="yt-subtle py-12 text-center text-sm">Loading channel…</p></main>;
  if (!user || user._id !== id || !user.channelname) return <main className="yt-page"><EmptyState icon={Clapperboard} title="Channel unavailable" description="This channel isn't available from your account." /></main>;
  if (error) return <main className="yt-page"><EmptyState icon={Clapperboard} title="Channel couldn't load" description="Please refresh the page and try again." /></main>;

  return (
    <main className="yt-page">
      <ChannelHeader channel={user} />
      <div className="yt-divider mb-8" />
      <div className="space-y-10">
        <VideoUploader onUploaded={() => { void loadVideos(); }} />
        <ChannelVideos videos={videos} />
      </div>
    </main>
  );
}
