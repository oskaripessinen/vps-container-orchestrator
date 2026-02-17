"use client";

import { LogOut, Settings2 } from "lucide-react";
import { useClerk, useUser } from "@clerk/nextjs";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

function initialsFromName(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function ProfileDropdown({ afterSignOutUrl }: { afterSignOutUrl: string }) {
  const { user, isLoaded } = useUser();
  const clerk = useClerk();

  if (!isLoaded || !user) {
    return (
      <Avatar className="h-9 w-9 border border-border/80 bg-muted/60">
        <AvatarFallback className="bg-muted/60" />
      </Avatar>
    );
  }

  const displayName = user.fullName || user.username || user.primaryEmailAddress?.emailAddress || "User";
  const secondaryText = user.username || user.primaryEmailAddress?.emailAddress || "";
  const initials = initialsFromName(displayName || "User");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full border border-border/80 bg-muted/40 p-0 text-foreground hover:bg-muted/70"
          aria-label="Open user menu"
        >
          <Avatar className="h-full w-full">
            <AvatarImage src={user.imageUrl} alt={displayName} />
            <AvatarFallback className="text-xs font-semibold text-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="px-2.5 py-2.5">
          <p className="truncate text-sm font-semibold text-card-foreground">{displayName}</p>
          <p className="truncate text-xs text-muted-foreground">{secondaryText}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            clerk.openUserProfile();
          }}
        >
          <Settings2 className="h-4 w-4" />
          Manage account
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            void clerk.signOut({ redirectUrl: afterSignOutUrl });
          }}
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
