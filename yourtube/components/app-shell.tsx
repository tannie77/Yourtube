"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import WorkspaceShell from "@/components/workspace-shell";
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

  return <WorkspaceShell>{children}</WorkspaceShell>;
}
