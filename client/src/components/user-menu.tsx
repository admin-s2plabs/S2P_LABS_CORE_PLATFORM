import type { CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { type AccentColor, useTheme } from "@/components/theme-provider";
import { ChevronDown, LogOut, MessageSquare, User } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

interface UserMenuProps {
  userName: string;
  userEmail: string;
  userInitials: string;
  userPhoto?: string;
  userRole?: string;
  onLogout: () => void;
  profilePath?: string;
  feedbackPath?: string;
}

const ACCENT_COLORS: { value: AccentColor; label: string; swatchClass?: string; swatchStyle?: CSSProperties }[] = [
  { value: "blue", label: "Blue", swatchClass: "bg-[#2986CE]" },
  { value: "green", label: "Green", swatchClass: "bg-[#1BB394]" },
  { value: "yellow", label: "Yellow", swatchClass: "bg-[#F39F0C]" },
  { value: "red", label: "Red", swatchClass: "bg-[#ED2A56]" },
  {
    value: "linear",
    label: "Linear",
    swatchStyle: { backgroundImage: "linear-gradient(90deg, #9E5CF7 0%, #E354D4 33%, #FF5D9F 66%, #FF8E6F 100%)" },
  },
];

export function UserMenu({ userName, userRole, onLogout, profilePath = "/app/profile", feedbackPath = "/app/feedback" }: UserMenuProps) {
  const { theme, setTheme, accentColor, setAccentColor } = useTheme();
  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="flex items-center gap-2" data-testid="button-user-menu">
          <div className="hidden sm:flex flex-col items-start">
            <span className="text-sm font-medium">{userName}</span>
            {userRole && <span className="text-xs text-muted-foreground">{userRole}</span>}
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 bg-white dark:bg-popover">
        <Link href={profilePath}>
          <DropdownMenuItem data-testid="menu-profile">
            <User className="h-4 w-4 mr-2" />
            Profile
          </DropdownMenuItem>
        </Link>
        <Link href={feedbackPath}>
          <DropdownMenuItem data-testid="menu-feedback">
            <MessageSquare className="h-4 w-4 mr-2" />
            Feedback
          </DropdownMenuItem>
        </Link>
        <DropdownMenuItem onClick={onLogout} data-testid="button-logout">
          <LogOut className="h-4 w-4 mr-2" />
          Logout
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <div className="flex items-center justify-center gap-2 px-2 py-1.5">
          {ACCENT_COLORS.map((accent) => (
            <button
              key={accent.value}
              type="button"
              aria-label={accent.label}
              aria-pressed={accentColor === accent.value}
              data-testid={`button-accent-${accent.value}`}
              onClick={() => setAccentColor(accentColor === accent.value ? "default" : accent.value)}
              style={accent.swatchStyle}
              className={cn(
                "h-6 w-6 rounded-md ring-offset-2 ring-offset-popover transition-shadow",
                accent.swatchClass,
                accentColor === accent.value ? "ring-2 ring-foreground" : "hover:ring-2 hover:ring-border"
              )}
            />
          ))}
        </div>
        <div className="flex items-center justify-center gap-2 px-2 pb-1.5">
          <span className={cn("text-xs", !isDark ? "font-medium text-foreground" : "text-muted-foreground")}>Light</span>
          <Switch
            checked={isDark}
            onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
            data-testid="switch-theme"
          />
          <span className={cn("text-xs", isDark ? "font-medium text-foreground" : "text-muted-foreground")}>Dark</span>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
