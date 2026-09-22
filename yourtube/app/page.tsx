import dynamic from "next/dynamic";
import videogrid from "@/components/videogrid";
import Videogrid from "@/components/videogrid";
import CategoryTabs from "@/components/category-tabs";

// Disable Server-Side Rendering for CategoryTabs to fix hydration error
// const CategoryTabs = dynamic(() => import("@/components/category-tabs"), {
//   // ssr: false,
// });

export default function Home() {
  return (
    <main className="flex-1 p-4">
      <CategoryTabs />
      <Videogrid />
    </main>
  );
}