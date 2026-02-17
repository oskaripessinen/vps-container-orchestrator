"use client";

import { useState } from "react";
import { useSignIn } from "@clerk/nextjs";
import { Github, ShieldCheck, X } from "lucide-react";

import { Button } from "@/components/ui/button";

export function GitHubAuthPanel() {
  const { isLoaded, signIn } = useSignIn();
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
    <section className="relative w-full max-w-[420px] overflow-hidden rounded-xl border border-border/80 bg-card px-6 py-5 shadow-[0_30px_80px_-45px_rgba(0,0,0,0.95)]">
      <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-white/5 to-transparent" />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="absolute top-3 right-3 text-muted-foreground/80"
        aria-label="Close"
        disabled
      >
        <X className="h-4 w-4" />
      </Button>

      <div className="relative space-y-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight text-card-foreground">
            Sign in to Orchestrator Console
          </h1>
          <p className="text-sm text-muted-foreground">
            Authenticate with your GitHub account to access deployments.
          </p>
        </div>

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
    </section>
  );
}
