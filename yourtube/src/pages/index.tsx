import CategoryTabs, { FeedSort } from "@/components/category-tabs";
import Videogrid from "@/components/Videogrid";
import type { GetServerSideProps } from "next";
import { useState } from "react";

export const getServerSideProps: GetServerSideProps = async ({ req }) => {
  if (!req.cookies?.yourtube2_session) {
    return { redirect: { destination: "/sign-in", permanent: false } };
  }
  return { props: {} };
};

export default function Home() {
  const [sort, setSort] = useState<FeedSort>("all");
  return (
    <main className="yt-page">
      <div className="yt-page-header">
        <div><span className="yt-page-eyebrow">Watch · Discover</span><h1 className="yt-page-title">Home</h1><p className="yt-page-description">Videos from the YourTube community.</p></div>
      </div>
      <CategoryTabs value={sort} onChange={setSort} />
      <Videogrid sort={sort} />
    </main>
  );
}
