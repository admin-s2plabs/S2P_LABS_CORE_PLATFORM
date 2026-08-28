import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, LogOut, MessageSquare, User } from "lucide-react";
import { Link } from "wouter";

interface UserMenuProps {
  userName: string;
  userEmail: string;
  userInitials: string;
  userPhoto?: string;
  onLogout: () => void;
  profilePath?: string;
  feedbackPath?: string;
}

export function UserMenu({ userName, userEmail, userInitials, userPhoto, onLogout, profilePath = "/app/profile", feedbackPath = "/app/feedback" }: UserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="flex items-center gap-2" data-testid="button-user-menu">
          {userPhoto ? (
            <img src={userPhoto} alt={userName} className="h-8 w-8 rounded-full object-cover" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
              {userInitials}
            </div>
          )}
          <div className="hidden sm:flex flex-col items-start">
            <span className="text-sm font-medium">{userName}</span>
            <span className="text-xs text-muted-foreground">{userEmail}</span>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="flex items-center gap-3 p-2">
          {userPhoto ? (
            <img src={userPhoto} alt={userName} className="h-9 min-w-[2.25rem] rounded-full object-cover" />
          ) : (
            <div className="flex h-9 min-w-[2.25rem] items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
              {userInitials}
            </div>
          )}
          <div className="flex flex-col break-all">
            <span className="text-sm font-medium">{userName}</span>
            <span className="text-xs text-muted-foreground">{userEmail}</span>
          </div>
        </div>
        <DropdownMenuSeparator />
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
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onLogout} data-testid="button-logout">
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
