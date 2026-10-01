import SearchResult from "@/components/SearchResult";
import { useRouter } from "next/router";

export default function SearchPage() {
  const router = useRouter();
  const query = typeof router.query.q === "string" ? router.query.q : "";
  return (
    <main className="yt-page yt-page-narrow">
      <div className="yt-page-header">
        <div><span className="yt-page-eyebrow">Discover</span><h1 className="yt-page-title">Search results</h1>{query && <p className="yt-page-description">Showing videos matching “{query}”</p>}</div>
      </div>
      <SearchResult query={query} />
    </main>
  );
}
