import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export default function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="yt-empty">
      <span className="yt-empty-icon"><Icon aria-hidden="true" /></span>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}
