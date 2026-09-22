import SearchResult from "@/components/SearchResult";
import { useRouter } from "next/router";
import React, { Suspense } from "react";

const Index = () => {
  const router = useRouter();
  const { q } = router.query;

  // Safely extract a single string from query parameters
  const searchQuery = Array.isArray(q) ? q[0] : q || "";

  return (
    <div className="flex-1 p-4">
      <div className="max-w-6xl">
        {searchQuery && (
          <div className="mb-6">
            <h1 className="text-xl font-medium mb-4">
              Search results for "{searchQuery}"
            </h1>
          </div>
        )}
        <Suspense fallback={<div>Loading search results...</div>}>
          <SearchResult query={searchQuery} />
        </Suspense>
      </div>
    </div>
  );
};

export default Index;