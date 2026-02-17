export class GitHubApiError extends Error {
  status: number;
  endpoint: string;
  oauthScopes: string;

  constructor(message: string, status: number, endpoint: string, oauthScopes: string) {
    super(message);
    this.name = "GitHubApiError";
    this.status = status;
    this.endpoint = endpoint;
    this.oauthScopes = oauthScopes;
  }
}

export async function fetchGitHub<T>(path: string, accessToken: string): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();
    const oauthScopes = response.headers.get("x-oauth-scopes") ?? "unknown";
    throw new GitHubApiError(
      `GitHub API ${response.status} (${path}) scopes=[${oauthScopes}]: ${errorText}`,
      response.status,
      path,
      oauthScopes
    );
  }

  return (await response.json()) as T;
}

type GitHubOrg = {
  login: string;
};

type GitHubRepo = {
  name: string;
  full_name: string;
  private: boolean;
  visibility?: string;
  default_branch?: string;
  pushed_at?: string;
  updated_at?: string;
  owner?: {
    login?: string;
  };
};

type GitHubPackage = {
  name: string;
  visibility: string;
  owner?: {
    login?: string;
  };
};

export async function listAccessibleOwners(
  githubLogin: string,
  accessToken: string
): Promise<string[]> {
  const owners = new Set<string>([githubLogin]);

  let orgs: GitHubOrg[] = [];

  try {
    orgs = await fetchGitHub<GitHubOrg[]>("/user/orgs?per_page=100", accessToken);
  } catch {
    return [...owners];
  }

  for (const org of orgs) {
    if (org.login) {
      owners.add(org.login);
    }
  }

  return [...owners];
}

export async function listAccessibleContainerPackages(
  githubLogin: string,
  accessToken: string
): Promise<Array<{ name: string; visibility: string; owner: string }>> {
  const owners = await listAccessibleOwners(githubLogin, accessToken);

  const userPackages = await fetchGitHub<GitHubPackage[]>(
    "/user/packages?package_type=container&per_page=100",
    accessToken
  );

  const basePackages = userPackages.map((pkg) => ({
    name: pkg.name,
    visibility: pkg.visibility,
    owner: pkg.owner?.login ?? githubLogin,
  }));

  const packageSets = await Promise.all(
    owners
      .filter((owner) => owner !== githubLogin)
      .map(async (owner) => {
        const endpoint = `/orgs/${encodeURIComponent(owner)}/packages?package_type=container&per_page=100`;

        try {
          const packages = await fetchGitHub<GitHubPackage[]>(endpoint, accessToken);

          return packages.map((pkg) => ({
            name: pkg.name,
            visibility: pkg.visibility,
            owner: pkg.owner?.login ?? owner,
          }));
        } catch {
          return [];
        }
      })
  );

  const deduped = new Map<string, { name: string; visibility: string; owner: string }>();

  for (const pkg of basePackages) {
    deduped.set(`${pkg.owner}/${pkg.name}`, pkg);
  }

  for (const pkgList of packageSets) {
    for (const pkg of pkgList) {
      deduped.set(`${pkg.owner}/${pkg.name}`, pkg);
    }
  }

  return [...deduped.values()].sort((a, b) =>
    `${a.owner}/${a.name}`.localeCompare(`${b.owner}/${b.name}`)
  );
}

export async function listAccessibleRepos(
  accessToken: string
): Promise<
  Array<{
    name: string;
    owner: string;
    fullName: string;
    private: boolean;
    visibility: string;
    defaultBranch: string;
    pushedAt: string | null;
  }>
> {
  const repos = await fetchGitHub<GitHubRepo[]>(
    "/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member",
    accessToken
  );

  return repos
    .map((repo) => ({
      name: repo.name,
      owner: repo.owner?.login ?? "unknown",
      fullName: repo.full_name,
      private: repo.private,
      visibility: repo.visibility ?? (repo.private ? "private" : "public"),
      defaultBranch: repo.default_branch ?? "main",
      pushedAt: repo.pushed_at ?? repo.updated_at ?? null,
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}
