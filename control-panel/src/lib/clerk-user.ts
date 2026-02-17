import { auth, clerkClient } from "@clerk/nextjs/server";

type AuthenticatedGitHubUser = {
  userId: string;
  githubLogin: string;
  githubAccessToken: string;
};

export async function getAuthenticatedGitHubUser(): Promise<AuthenticatedGitHubUser | null> {
  const { userId } = await auth();

  if (!userId) {
    return null;
  }

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const oauthTokenResponse = await client.users.getUserOauthAccessToken(
    userId,
    "github"
  );

  const githubAccount = user.externalAccounts.find(
    (account) => account.provider === "oauth_github"
  );

  const githubLogin = githubAccount?.username || user.username || user.firstName;

  if (!githubLogin) {
    throw new Error(
      "No GitHub username available in Clerk user profile. Sign in with GitHub."
    );
  }

  const githubAccessToken = oauthTokenResponse.data[0]?.token;

  if (!githubAccessToken) {
    throw new Error(
      "No GitHub OAuth token found in Clerk for this user. Reconnect GitHub in Clerk and ensure read:packages scope is granted."
    );
  }

  return {
    userId,
    githubLogin,
    githubAccessToken,
  };
}
