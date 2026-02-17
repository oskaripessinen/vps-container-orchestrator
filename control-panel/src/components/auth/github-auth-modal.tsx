"use client";

import { useState } from "react";
import { useSignIn } from "@clerk/nextjs";
import { Github, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type GitHubAuthModalProps = {
  triggerLabel: string;
  triggerClassName?: string;
};

export function GitHubAuthModal({
  triggerLabel,
  triggerClassName,
}: GitHubAuthModalProps) {
  const { isLoaded, signIn } = useSignIn();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const continueWithGitHub = async () => {
    if (!isLoaded) {
      return;
    }

    setIsSubmitting(true);

    await signIn.authenticateWithRedirect({
      strategy: "oauth_github",
      redirectUrl: "/sso-callback",
      redirectUrlComplete: "/dashboard",
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className={triggerClassName}>{triggerLabel}</Button>
      </DialogTrigger>
      <DialogContent className="max-w-[420px] overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-white/5 to-transparent" />
        <DialogHeader className="relative">
          <DialogTitle>Sign in to Orchestrator Console</DialogTitle>
          <DialogDescription>
            Authenticate with your GitHub account to access deployments.
          </DialogDescription>
        </DialogHeader>
        <div className="relative space-y-4">
          <Button
            variant="outline"
            className="h-11 w-full justify-start gap-3 bg-card/70"
            onClick={() => {
              void continueWithGitHub();
            }}
            disabled={!isLoaded || isSubmitting}
          >
            <Github className="h-4 w-4" />
            {isSubmitting ? "Redirecting..." : "Continue With GitHub"}
          </Button>

          <div
            id="clerk-captcha"
            data-cl-theme="dark"
            data-cl-size="flexible"
            className="overflow-hidden rounded-md border border-border/70"
          />

          <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            OAuth session handled by Clerk
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
