"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Header from "@/components/header";
import Sidebar from "@/components/Sidebar";
import { useUser } from "@/lib/AuthContent";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useUser();
  const isEntryRoute = pathname === "/" || pathname === "/sign-in";

  useEffect(() => {
    if (!isEntryRoute && !loading && !user) router.replace("/sign-in");
  }, [isEntryRoute, loading, router, user]);

  if (isEntryRoute) return <>{children}</>;

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#faf9f7] text-sm text-[#687181]">
        Opening VidCircle…
      </main>
    );
  }

  if (pathname === "/dashboard" || pathname.startsWith("/channel/") || pathname.startsWith("/watch/")) return <>{children}</>;

  return (
    <>
      <Header />
      <div className="flex min-h-[calc(100vh-57px)]">
        <Sidebar />
        {children}
      </div>
    </>
  );
}
