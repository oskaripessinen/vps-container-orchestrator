# Control Panel

Next.js control panel for:

- Clerk authentication (App Router)
- Listing repositories the signed-in user can access
- Building GHCR images on demand and deploying to VPS via workflow dispatch

## Requirements

- Node.js 20+
- Clerk application with GitHub social login enabled
- One server-side GitHub token with rights to dispatch workflows

Users do not need to provide their own deploy token.

## Environment

Copy and edit:

```bash
cp .env.example .env.local
```

Required variables:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- repo target:
  - either `DEPLOY_REPO_OWNER` + `DEPLOY_REPO_NAME`
  - or `DEPLOY_REPOSITORY` as `owner/name`
- dispatch token:
  - `DEPLOY_GITHUB_TOKEN`
  - or `GITHUB_TOKEN`
  - or `GH_TOKEN`

Optional (defaults shown):

- `DEPLOY_WORKFLOW_FILE` (`deploy-app-from-ui.yml`)
- `DEPLOY_WORKFLOW_REF` (`main`)

Example:

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_or_test_xxx
CLERK_SECRET_KEY=sk_live_or_test_xxx

DEPLOY_REPOSITORY=your-org-or-user/vps-container-orchestrator
DEPLOY_GITHUB_TOKEN=github_pat_or_app_token_with_workflow_dispatch_access
DEPLOY_WORKFLOW_FILE=deploy-app-from-ui.yml
DEPLOY_WORKFLOW_REF=main
```

## Token model

- The control panel backend (`POST /api/deploy`) must authenticate when calling GitHub workflow dispatch API.
- That is why one deploy credential is required on the server.
- End users do not enter this token in the UI.

If you want a "no user token" setup, this repository already supports that model: keep one service token in `.env.local` and let all authenticated users trigger deploys.

Fully tokenless dispatch is not supported by GitHub API. If you want to avoid deploy credentials entirely, the flow must change (for example public-image only deploy without workflow dispatch).

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Clerk integration checklist

- `src/proxy.ts` uses `clerkMiddleware()`
- `src/app/layout.tsx` wraps app with `ClerkProvider`
- Custom GitHub auth panel is rendered on `/login`
- Header renders custom sign-in trigger + profile dropdown
- Protected pages and APIs use `auth()` from `@clerk/nextjs/server`
- GitHub repository reads use the signed-in user's GitHub OAuth token via Clerk

For repository listing and build access, configure GitHub OAuth scopes in Clerk to
include `repo` and `read:org`, then revoke old GitHub authorization and sign in
again so new scopes apply.

To keep auth GitHub-only, disable Email/Password and other social providers in the
Clerk Dashboard, and keep only GitHub enabled.

## Deploy flow

`POST /api/deploy` dispatches workflow `deploy-app-from-ui.yml` in the orchestrator repo
with these inputs:

- `app_slug`
- `source_owner`
- `source_repo`
- `source_ref`
- `internal_port`

The workflow checks out the selected source repository, builds and pushes a GHCR image,
then runs AWS SSM command on the target EC2 instance and calls
`scripts/deploy-app-from-image.sh`.
