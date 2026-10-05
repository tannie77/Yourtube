import { useEffect, useState } from "react";
import axiosInstance from "@/lib/axiosinstance";

type Campaign = { id: string; sponsor: string; headline: string; description: string; cta: string; destination: string };

export default function AdSlot({ videoId }: { videoId: string }) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  useEffect(() => {
    let active = true;
    void axiosInstance.get<{ campaign: Campaign | null }>("/ads/placement").then(({ data }) => {
      if (!active || !data.campaign) return;
      setCampaign(data.campaign);
      void axiosInstance.post(`/ads/${data.campaign.id}/event`, { kind: "impression", videoId }).catch(() => {});
    }).catch(() => {});
    return () => { active = false; };
  }, [videoId]);

  if (!campaign) return null;
  const local = campaign.destination.startsWith("/") && !campaign.destination.startsWith("//");
  return <aside className="yt-downloads-surface yt-downloads-card mt-6" aria-label="Advertisement">
    <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--yt-red)]">{campaign.sponsor === "YourTube" ? "YourTube promotion" : "Sponsored"}</p>
    <h2 className="mt-2 text-base font-semibold">{campaign.headline}</h2>
    <p className="mt-1 text-sm text-[var(--yt-muted)]">{campaign.description}</p>
    <a className="yt-primary-button mt-4 inline-flex" href={campaign.destination} target={local ? undefined : "_blank"} rel={local ? undefined : "sponsored noopener noreferrer"}
      onClick={() => { void axiosInstance.post(`/ads/${campaign.id}/event`, { kind: "click", videoId }).catch(() => {}); }}>{campaign.cta}</a>
  </aside>;
}
