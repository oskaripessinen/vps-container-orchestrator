import { NextResponse } from "next/server";

import { getAuthenticatedGitHubUser } from "@/lib/clerk-user";
import { listAccessibleRepos } from "@/lib/github";

export const runtime = "nodejs";

export async function GET() {
  let authenticatedUser: Awaited<ReturnType<typeof getAuthenticatedGitHubUser>>;

  try {
    authenticatedUser = await getAuthenticatedGitHubUser();
  } catch (error) {
    return NextResponse.json(
      {
        error: "GitHub identity missing in Clerk profile",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 403 }
    );
  }

  if (!authenticatedUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const repos = await listAccessibleRepos(authenticatedUser.githubAccessToken);

    return NextResponse.json({
      githubLogin: authenticatedUser.githubLogin,
      repos,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to fetch repositories",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 502 }
    );
  }
}
