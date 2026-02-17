import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { GitHubAuthPanel } from "@/components/auth/github-auth-panel";

export default async function LoginPage() {
  const { userId } = await auth();

  if (userId) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <GitHubAuthPanel />
    </main>
  );
}
