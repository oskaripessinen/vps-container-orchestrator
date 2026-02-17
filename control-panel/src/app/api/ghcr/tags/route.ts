import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getAuthenticatedGitHubUser } from "@/lib/clerk-user";
import { fetchGitHub, listAccessibleOwners } from "@/lib/github";

export const runtime = "nodejs";

const querySchema = z.object({
  package: z.string().min(1),
  owner: z.string().min(1),
});

type GitHubPackageVersion = {
  metadata?: {
    container?: {
      tags?: string[];
    };
  };
};

export async function GET(request: NextRequest) {
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

  const parsed = querySchema.safeParse({
    package: request.nextUrl.searchParams.get("package") ?? "",
    owner:
      request.nextUrl.searchParams.get("owner") ?? authenticatedUser.githubLogin,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Missing package or owner query parameter" },
      { status: 400 }
    );
  }

  try {
    const accessibleOwners = new Set(
      await listAccessibleOwners(
        authenticatedUser.githubLogin,
        authenticatedUser.githubAccessToken
      )
    );

    if (!accessibleOwners.has(parsed.data.owner)) {
      return NextResponse.json(
        { error: "Not allowed to read packages from this owner" },
        { status: 403 }
      );
    }

    const versionsEndpoint =
      parsed.data.owner === authenticatedUser.githubLogin
        ? `/user/packages/container/${encodeURIComponent(parsed.data.package)}/versions?per_page=100`
        : `/orgs/${encodeURIComponent(parsed.data.owner)}/packages/container/${encodeURIComponent(parsed.data.package)}/versions?per_page=100`;

    const versions = await fetchGitHub<GitHubPackageVersion[]>(
      versionsEndpoint,
      authenticatedUser.githubAccessToken
    );

    const seen = new Set<string>();
    const tags: string[] = [];

    for (const version of versions) {
      for (const tag of version.metadata?.container?.tags ?? []) {
        if (!seen.has(tag)) {
          seen.add(tag);
          tags.push(tag);
        }
      }
    }

    return NextResponse.json({
      package: parsed.data.package,
      tags,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to fetch package tags",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 502 }
    );
  }
}
