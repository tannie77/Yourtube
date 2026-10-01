import { Moon, Sun } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useUser } from "@/lib/AuthContext";

export default function ThemeToggle({ className = "" }: { className?: string }) {
  const { resolvedTheme, changeTheme } = useUser();
  const [changing, setChanging] = useState(false);
  const nextTheme = resolvedTheme === "dark" ? "light" : "dark";

  const toggle = async () => {
    setChanging(true);
    try {
      await changeTheme(nextTheme);
    } catch {
      toast.error("Could not save your theme. Please try again.");
    } finally {
      setChanging(false);
    }
  };

  return (
    <button type="button" className={`yt-theme-toggle ${className}`.trim()} onClick={toggle} disabled={changing} aria-label={`Switch to ${nextTheme} mode`} title={`Switch to ${nextTheme} mode`}>
      {resolvedTheme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
      <span>{resolvedTheme === "dark" ? "Light mode" : "Dark mode"}</span>
    </button>
  );
}
