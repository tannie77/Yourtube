import { Clock3, Crown, Download, Flag, History, Home, ShieldCheck, ThumbsUp, UserRound, Video } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useUser } from "@/lib/AuthContext";

type NavItemProps = { href: string; label: string; icon: typeof Home; active: boolean; onNavigate: () => void };

function NavItem({ href, label, icon: Icon, active, onNavigate }: NavItemProps) {
  return (
    <Link href={href} className="yt-nav-item" aria-label={label} aria-current={active ? "page" : undefined} onClick={onNavigate}>
      <Icon aria-hidden="true" /><span>{label}</span>
    </Link>
  );
}

export default function Sidebar({ onNavigate }: { onNavigate: () => void }) {
  const { user } = useUser();
  const router = useRouter();
  return (
    <aside className="yt-sidebar" aria-label="Main navigation">
      <nav>
        <div className="yt-nav-section">
          <NavItem href="/" label="Home" icon={Home} active={router.pathname === "/"} onNavigate={onNavigate} />
        </div>
        <div className="yt-nav-section">
          <p className="yt-nav-heading">You</p>
          {user?.channelname && <NavItem href={`/channel/${user._id}`} label="Your channel" icon={UserRound} active={router.pathname === "/channel/[id]"} onNavigate={onNavigate} />}
          <NavItem href="/history" label="History" icon={History} active={router.pathname === "/history"} onNavigate={onNavigate} />
          <NavItem href="/membership" label="Membership" icon={Crown} active={router.pathname === "/membership"} onNavigate={onNavigate} />
          <NavItem href="/downloads" label="Downloads" icon={Download} active={router.pathname === "/downloads"} onNavigate={onNavigate} />
          <NavItem href="/liked" label="Liked videos" icon={ThumbsUp} active={router.pathname === "/liked"} onNavigate={onNavigate} />
          <NavItem href="/watch-later" label="Watch later" icon={Clock3} active={router.pathname === "/watch-later"} onNavigate={onNavigate} />
          <NavItem href="/rooms" label="Video rooms" icon={Video} active={router.pathname === "/rooms" || router.pathname === "/rooms/[id]"} onNavigate={onNavigate} />
          <NavItem href="/security" label="Security" icon={ShieldCheck} active={router.pathname === "/security"} onNavigate={onNavigate} />
          {user?.role === "admin" && <NavItem href="/moderation" label="Moderation" icon={Flag} active={router.pathname === "/moderation"} onNavigate={onNavigate} />}
        </div>
      </nav>
      <div className="yt-sidebar-footer">Watch · Create · Connect<br />YourTube 2.0</div>
    </aside>
  );
}
