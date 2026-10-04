import HistoryContent from "@/components/HistoryContent";

export default function HistoryPage() {
  return (
    <main className="yt-page yt-page-narrow">
      <div className="yt-page-header"><div><h1 className="yt-page-title">Watch history</h1><p className="yt-page-description">Find videos you recently watched.</p></div></div>
      <HistoryContent />
    </main>
  );
}
