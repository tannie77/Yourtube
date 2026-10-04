import { ArrowLeft, Clock3, Crown, Download, LogOut, Menu, Mic, Plus, Search, ShieldCheck, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { useUser } from "@/lib/AuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import Channeldialogue from "./channeldialogue";
import ThemeToggle from "./ThemeToggle";

export default function Header({ onMenuToggle }: { onMenuToggle: () => void }) {
  const { user, logout } = useUser();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [channelDialogOpen, setChannelDialogOpen] = useState(false);

  useEffect(() => {
    setSearchQuery(typeof router.query.q === "string" ? router.query.q : "");
  }, [router.query.q, router.pathname]);

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;
    setMobileSearchOpen(false);
    void router.push(`/search?q=${encodeURIComponent(query)}`);
  };

  const handleVoiceSearch = () => {
    type Recognition = { lang: string; start: () => void; onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onerror: (() => void) | null };
    const browserWindow = window as Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const RecognitionConstructor = browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition;
    if (!RecognitionConstructor) { toast.info("Voice search is unavailable in this browser."); return; }
    const recognition = new RecognitionConstructor();
    recognition.lang = "en-IN";
    recognition.onresult = (event) => {
      const query = event.results[0]?.[0]?.transcript?.trim();
      if (query) { setSearchQuery(query); setMobileSearchOpen(false); void router.push(`/search?q=${encodeURIComponent(query)}`); }
    };
    recognition.onerror = () => toast.error("Voice search could not hear you. Please try again.");
    recognition.start();
  };

  return (
    <header className="yt-header" data-signed-in={Boolean(user)}>
      <div className="yt-header-left">
        <button type="button" className="yt-icon-button" aria-label="Toggle navigation menu" onClick={onMenuToggle}><Menu aria-hidden="true" /></button>
        <Link href="/" className="yt-brand" aria-label="YourTube home">
          <img className="yt-brand-mark" src="/favicon.ico" alt="" />
          <span>YourTube</span><span className="yt-brand-country">IN</span>
        </Link>
      </div>

      <div className="yt-search-wrap">
        <form className={`yt-search${mobileSearchOpen ? " is-open" : ""}`} role="search" onSubmit={handleSearch}>
          <button type="button" className="yt-search-back" aria-label="Close search" onClick={() => setMobileSearchOpen(false)}><ArrowLeft aria-hidden="true" /></button>
          <input className="yt-search-input" type="search" aria-label="Search videos" placeholder="Search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />
          <button type="submit" className="yt-search-submit" aria-label="Search"><Search aria-hidden="true" /></button>
        </form>
        <button type="button" className="yt-icon-button yt-voice-search" aria-label="Search with your voice" onClick={handleVoiceSearch}><Mic aria-hidden="true" /></button>
      </div>

      <div className="yt-header-actions">
        <button type="button" className="yt-icon-button yt-mobile-search" aria-label="Open search" onClick={() => setMobileSearchOpen(true)}><Search aria-hidden="true" /></button>
        {user && <ThemeToggle />}
        {!user ? <Link href="/sign-in" className="yt-sign-in"><UserRound aria-hidden="true" /><span>Sign in</span></Link> : user.channelname ? (
          <Link href={`/channel/${user._id}#upload`} className="yt-create"><Plus aria-hidden="true" /><span>Create</span></Link>
        ) : (
          <button type="button" className="yt-create" onClick={() => setChannelDialogOpen(true)}><Plus aria-hidden="true" /><span>Create</span></button>
        )}
        {user && <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="yt-account-button" aria-label="Open account menu">
              {typeof user?.image === "string" && /^data:image\/(?:png|jpeg|webp);base64,/.test(user.image)
                ? <img src={user.image} alt="" />
                : user?.name?.[0]?.toUpperCase() || "Y"}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-60" align="end">
            <div className="yt-account-summary"><strong>{user?.name}</strong><span>{user?.email}</span></div>
            <DropdownMenuSeparator />
            {user?.channelname && <DropdownMenuItem asChild><Link href={`/channel/${user._id}`}><UserRound />Your channel</Link></DropdownMenuItem>}
            <DropdownMenuItem asChild><Link href="/membership"><Crown />Membership</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link href="/downloads"><Download />Downloads</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link href="/history"><Clock3 />Watch history</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link href="/security"><ShieldCheck />Security and appearance</Link></DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => { void logout().catch(() => toast.error("Could not sign out. Please try again.")); }}><LogOut />Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>}
      </div>
      {user && <Channeldialogue isopen={channelDialogOpen} onclose={() => setChannelDialogOpen(false)} mode="create" />}
    </header>
  );
}
