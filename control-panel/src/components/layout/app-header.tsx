"use client";

import { SignedIn, SignedOut } from "@clerk/nextjs";
import { usePathname } from "next/navigation";

import { GitHubAuthModal } from "@/components/auth/github-auth-modal";
import { ProfileDropdown } from "@/components/auth/profile-dropdown";

export function AppHeader() {
  const pathname = usePathname();

  if (pathname === "/login") {
    return null;
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-[#0b0b0d]/75 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 sm:px-8">
        <p className="text-sm font-semibold tracking-[0.18em] text-foreground/90 uppercase">
          Orchestrator Console
        </p>
        <div className="flex items-center gap-2">
          <SignedOut>
            <GitHubAuthModal
              triggerLabel="Sign In"
              triggerClassName="h-9 rounded-full px-5"
            />
          </SignedOut>
          <SignedIn>
            <ProfileDropdown afterSignOutUrl="/login" />
          </SignedIn>
        </div>
      </div>
    </header>
  );
}
