import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import { Toaster } from "@/components/ui/sonner";
import { UserProvider, useUser } from "@/lib/AuthContext";
import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import type { AppProps } from "next/app";
import "@/styles/globals.css";
import "@/styles/youtube-ui.css";

function AppPage({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const { user, loading, offlineUserId } = useUser();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isSignInPage = router.pathname === "/sign-in";
  const isPublicPage = ["/", "/explore", "/subscriptions", "/search"].includes(router.pathname);
  const offlineDownloads = router.pathname === "/downloads" && Boolean(offlineUserId);

  useEffect(() => {
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/offline-worker.js").catch(() => {});
  }, []);

  useEffect(() => {
    if (router.isReady && !isSignInPage && !isPublicPage && !offlineDownloads && !loading && !user) {
      void router.replace("/sign-in");
    }
  }, [isSignInPage, isPublicPage, offlineDownloads, loading, router, user]);

  useEffect(() => { setMobileMenuOpen(false); }, [router.asPath]);

  const toggleMenu = () => {
    if (window.matchMedia("(max-width: 767px)").matches) setMobileMenuOpen((open) => !open);
    else setSidebarCollapsed((collapsed) => !collapsed);
  };

  if (isSignInPage) return <Component {...pageProps} />;
  if (!isPublicPage && (loading || (!user && !offlineDownloads))) {
    return <main className="yt-app flex min-h-screen items-center justify-center text-sm yt-subtle">Opening YourTube…</main>;
  }

  return (
    <div className="yt-app" data-collapsed={sidebarCollapsed} data-mobile-open={mobileMenuOpen}>
      <Header onMenuToggle={toggleMenu} />
      <Sidebar onNavigate={() => setMobileMenuOpen(false)} />
      {mobileMenuOpen && <button type="button" className="yt-sidebar-scrim" aria-label="Close menu" onClick={() => setMobileMenuOpen(false)} />}
      <div className="yt-app-content"><Component {...pageProps} /></div>
    </div>
  );
}

export default function App(props: AppProps) {
  return (
    <UserProvider>
      <Head><title>YourTube 2.0</title><link rel="icon" href="/favicon.ico" /></Head>
      <Toaster />
      <AppPage {...props} />
    </UserProvider>
  );
}
