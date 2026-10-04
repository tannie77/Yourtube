import CategoryTabs, { FeedTopic } from "@/components/category-tabs";
import Videogrid from "@/components/Videogrid";
import { useState } from "react";

export default function Home() {
  const [topic, setTopic] = useState<FeedTopic>("All");
  return (
    <main className="yt-page yt-home-page">
      <h1 className="sr-only">Home</h1>
      <CategoryTabs value={topic} onChange={setTopic} />
      <Videogrid topic={topic} />
    </main>
  );
}
