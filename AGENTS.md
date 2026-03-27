# AGENTS.md

Guide for coding agents working in `vps-container-orchestrator`.

## What this repo is
- Docker Compose based VPS deploy hub for backend apps.
- Shared infrastructure lives in `infrastructure/`.
- Per-app stacks live in `apps/<app-slug>/`.
- AWS bootstrap lives in `terraform/aws/`.
- `control-panel/` is the current app UI: a Next.js dashboard for authenticated GitHub-based deploys and VPS metrics.

## Repository map
- `infrastructure/docker-compose.yml`: shared services (`traefik`, `watchtower`, `vps-metrics-api`).
- `infrastructure/vps-metrics-api/`: lightweight API used by `control-panel` for live host and container stats.
- `apps/_template/`: template used when creating a new app stack.
- `scripts/create-app.sh`: creates `apps/<app-slug>` from template and writes `.env`.
- `scripts/server-deploy.sh`: deploys one existing app with `docker compose pull` and `up -d`.
- `scripts/deploy-app-from-image.sh`: create-or-update flow used by UI-triggered deploys.
- `.github/workflows/deploy-orchestrator.yml`: deploy shared infra to EC2 through AWS SSM.
- `.github/workflows/deploy-app-from-ui.yml`: build source repo image, push to GHCR, then deploy through AWS SSM.
- `templates/backend-repo/.github/workflows/deploy.yml`: backend repo workflow template for push-to-deploy.
- `control-panel/`: Next.js 16 + React 19 + Clerk app router dashboard.
- `docs/new-backend-flow.md`: backend onboarding flow.
- `docs/vps-metrics-api.md`: metrics API setup and Traefik routing.

## Main workflows

### Shared infrastructure
- Copy `infrastructure/.env.example` to `infrastructure/.env`.
- Start or refresh with `docker compose -f infrastructure/docker-compose.yml --env-file infrastructure/.env up -d --remove-orphans`.
- The shared Docker network name must stay `vps-container-orchestrator`.

### Per-app deploys
- Create an app once with `bash scripts/create-app.sh <app-slug> <ghcr-image> <internal-port> [app-domain]`.
- Deploy an existing app with `bash scripts/server-deploy.sh <app-slug>`.
- UI-triggered deploys use `bash scripts/deploy-app-from-image.sh <app-slug> <ghcr-image-with-tag> <internal-port>` on the server.

### Control panel
- Auth is handled with Clerk.
- Dashboard currently focuses on repository import + deploy workflow dispatch + VPS metrics.
- Important API routes live under `control-panel/src/app/api/`:
  - `deploy`
  - `github/repos`
  - `ghcr/packages`
  - `ghcr/tags`
  - `vps/status`

## Validation commands

### Bash scripts
- `shellcheck scripts/*.sh`
- `bash -n scripts/create-app.sh && bash -n scripts/server-deploy.sh && bash -n scripts/deploy-app-from-image.sh && bash -n scripts/migrate-traefik.sh && bash -n scripts/upsert-env.sh`

### Docker Compose
- Shared infra: `docker compose -f infrastructure/docker-compose.yml --env-file infrastructure/.env config`
- App template / app stack: `docker compose --env-file apps/<app-slug>/.env -f apps/<app-slug>/docker-compose.yml config`

### Terraform
Run from `terraform/aws`.
- `terraform fmt -check -recursive`
- `terraform validate`
- `terraform plan`

### Control panel
Run from `control-panel`.
- `npm install`
- `npm run lint`
- `npm run build`

## Change checklist
- If you edit `scripts/**`, run shell checks and syntax checks.
- If you edit `infrastructure/**`, run Compose validation.
- If you edit `apps/_template/**`, validate a generated or existing app Compose file.
- If you edit `terraform/aws/**`, run `terraform fmt -check -recursive` and `terraform validate`.
- If you edit `control-panel/**`, run `npm run lint` and `npm run build` in `control-panel`.

## Conventions

### General
- Keep diffs small and scoped.
- Do not commit secrets or copy real `.env` values into docs, code, logs, or tests.
- Preserve the current folder layout and deployment flow unless the task explicitly changes them.

### Bash
- Use `#!/usr/bin/env bash` and `set -euo pipefail`.
- Validate inputs early.
- Prefer uppercase variable names.
- Quote all paths and expansions.
- Use `printf` for user-facing output.

### Compose
- Use 2-space indentation.
- Keep service names and network contract stable.
- Prefer env-driven values like `${APP_IMAGE}` and `${APP_INTERNAL_PORT}`.
- Keep long-running services on `restart: unless-stopped` unless there is a clear reason not to.

### Terraform
- Use snake_case.
- Keep variable `description` and `type` explicit.
- Add validation for risky user inputs.
- Run `terraform fmt` after edits.

### Next.js / TypeScript (`control-panel`)
- Prefer strict typing and avoid `any`.
- Keep server components by default; use client components only when state or browser APIs are needed.
- Validate API inputs explicitly with `zod`.
- Return structured errors from route handlers.

## Operational guardrails
- Do not rename the shared Docker network without a coordinated migration.
- Keep Watchtower label-based updates enabled for app services.
- Keep `script_stop: true` in SSH-based deploy templates.
- Keep `admin_cidrs` restricted; avoid broad exposure unless the task explicitly requires it.
- Prefer backward-compatible changes unless a breaking change is intentional and documented.

## Handoff expectations
- Run the relevant validation commands for the files you changed.
- Report exactly which commands you ran.
- If you could not run something, say what was skipped and why.
