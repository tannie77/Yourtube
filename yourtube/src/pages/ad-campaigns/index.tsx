import { useCallback, useEffect, useState, type FormEvent } from "react";
import axiosInstance from "@/lib/axiosinstance";
import { useUser } from "@/lib/AuthContext";

type Campaign = { _id: string; sponsor: string; headline: string; description: string; cta: string; destination: string; active: boolean; impressions: number; clicks: number };
const empty = { sponsor: "", headline: "", description: "", cta: "", destination: "" };

export default function AdCampaignsPage() {
  const { user } = useUser();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { setCampaigns((await axiosInstance.get<Campaign[]>("/ads/admin")).data); setError(""); }
    catch { setError("Could not load ad campaigns."); }
  }, []);
  useEffect(() => { if (user?.role === "admin") void load(); }, [user?.role, load]);

  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await axiosInstance.post("/ads/admin", form); setForm(empty); await load(); }
    catch { setError("Could not create campaign. Check the text and destination link."); }
    finally { setBusy(false); }
  }
  async function toggle(campaign: Campaign) {
    setBusy(true);
    try { await axiosInstance.patch(`/ads/admin/${campaign._id}`, { active: !campaign.active }); await load(); }
    catch { setError("Could not update campaign."); }
    finally { setBusy(false); }
  }

  if (user?.role !== "admin") return <main className="yt-page yt-page-narrow"><h1>Administrator access required</h1></main>;
  return <main className="yt-page yt-page-narrow">
    <div className="yt-page-header"><div><h1 className="yt-page-title">Ad campaigns</h1><p className="yt-page-description">Manage first-party promotions and sponsored text ads shown to Free and Bronze viewers.</p></div></div>
    {error && <p role="alert" className="yt-comment-error">{error}</p>}
    <form onSubmit={(event) => void create(event)} className="yt-downloads-surface yt-downloads-card mt-6 grid gap-3">
      <h2 className="text-lg font-semibold">New campaign</h2>
      {(["sponsor", "headline", "description", "cta", "destination"] as const).map((key) => <label key={key} className="grid gap-1 text-sm font-medium"><span className="capitalize">{key === "cta" ? "Button text" : key}</span><input required maxLength={key === "description" ? 240 : key === "destination" ? 500 : key === "headline" ? 100 : key === "sponsor" ? 80 : 32} className="yt-search-input rounded-lg border border-[var(--yt-border)] bg-[var(--yt-bg)] p-2" value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} placeholder={key === "destination" ? "https://example.com or /membership" : undefined} /></label>)}
      <button type="submit" disabled={busy} className="yt-primary-button w-fit">Create campaign</button>
    </form>
    <section className="mt-8 space-y-3" aria-label="Existing campaigns">{campaigns.map((campaign) => <article key={campaign._id} className="yt-downloads-surface yt-downloads-card"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs yt-subtle">{campaign.sponsor} · {campaign.active ? "Active" : "Paused"}</p><h2 className="text-lg font-semibold">{campaign.headline}</h2><p className="text-sm yt-subtle">{campaign.description}</p><p className="mt-2 text-xs yt-subtle">{campaign.impressions} impressions · {campaign.clicks} clicks</p></div><button type="button" className="yt-pill-button" disabled={busy} onClick={() => void toggle(campaign)}>{campaign.active ? "Pause" : "Activate"}</button></div></article>)}</section>
  </main>;
}
