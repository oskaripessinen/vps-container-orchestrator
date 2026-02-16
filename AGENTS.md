# AGENTS.md

Operational guide for coding agents working in `vps-container-orchestrator`.
This repository is infrastructure-first: Bash scripts, Docker Compose, and Terraform.

## Scope and goals
- Manage shared VPS infrastructure in `infrastructure/`.
- Create and deploy per-app Compose stacks in `apps/<app-slug>/`.
- Provision AWS bootstrap resources in `terraform/aws/`.
- Keep changes safe, reproducible, and automation-friendly.

## Repository map
- `scripts/create-app.sh`: scaffolds `apps/<app-slug>` from template.
- `scripts/server-deploy.sh`: pulls image and restarts one app stack.
- `apps/_template/docker-compose.yml`: baseline app service definition.
- `infrastructure/docker-compose.yml`: Nginx Proxy Manager + Watchtower.
- `terraform/aws/*.tf`: EC2, SG, EIP, variables, outputs.
- `templates/backend-repo/.github/workflows/deploy.yml`: backend CI deploy template.
- `docs/new-backend-flow.md`: deployment flow reference.

## Tooling baseline
- Bash (`#!/usr/bin/env bash`).
- Docker with Compose v2 plugin (`docker compose`).
- Terraform >= `1.6.0` with AWS provider `~> 5.0`.
- Recommended local tools: `shellcheck`, `shfmt`.

## Build, lint, test, and validation commands
Run commands from repository root unless noted otherwise.

### Environment bootstrap
- `cp infrastructure/.env.example infrastructure/.env`
- `docker compose -f infrastructure/docker-compose.yml --env-file infrastructure/.env up -d`

### Compose validation and deploy
- Validate shared infra compose: `docker compose -f infrastructure/docker-compose.yml --env-file infrastructure/.env config`
- Create one app definition: `bash scripts/create-app.sh <app-slug> <ghcr-image> <internal-port>`
- Deploy one app: `bash scripts/server-deploy.sh <app-slug>`
- Validate one app compose file: `docker compose --env-file apps/<app-slug>/.env -f apps/<app-slug>/docker-compose.yml config`

### Shell scripts (`scripts/*.sh`)
- Lint all scripts: `shellcheck scripts/*.sh`
- Lint one script (single-test equivalent): `shellcheck scripts/server-deploy.sh`
- Syntax check all scripts: `bash -n scripts/create-app.sh && bash -n scripts/server-deploy.sh`
- Syntax check one script (single-test equivalent): `bash -n scripts/create-app.sh`
- Format scripts (if installed): `shfmt -w scripts/*.sh`

### Terraform (`terraform/aws`)
Run these commands from `terraform/aws`.
- Initialize: `terraform init`
- Format all files: `terraform fmt -recursive`
- Check formatting (CI style): `terraform fmt -check -recursive`
- Check one file (single-test equivalent): `terraform fmt -check main.tf`
- Validate configuration: `terraform validate`
- Plan infra changes: `terraform plan`
- Apply infra changes: `terraform apply`

### Test strategy status
- There is no dedicated unit/integration test suite in this repository today.
- Use these checks as merge gates:
  - `shellcheck` and `bash -n` for script changes
  - `docker compose ... config` for Compose changes
  - `terraform fmt -check` and `terraform validate` (plus `terraform plan` for infra updates)

### Change validation matrix
- If you change only `scripts/create-app.sh`:
  - `shellcheck scripts/create-app.sh`
  - `bash -n scripts/create-app.sh`
- If you change only `scripts/server-deploy.sh`:
  - `shellcheck scripts/server-deploy.sh`
  - `bash -n scripts/server-deploy.sh`
- If you change only `infrastructure/docker-compose.yml`:
  - `docker compose -f infrastructure/docker-compose.yml --env-file infrastructure/.env config`
- If you change only `apps/_template/docker-compose.yml`:
  - create/inspect a generated app and run `docker compose --env-file apps/<app-slug>/.env -f apps/<app-slug>/docker-compose.yml config`
- If you change Terraform files in `terraform/aws`:
  - `terraform fmt -check -recursive`
  - `terraform validate`
  - `terraform plan` when behavior changes

### Deploy workflow invariants
- Deploys target one app slug at a time via `bash scripts/server-deploy.sh <app-slug>`.
- Keep `watchtower` label-based updates enabled for app services.
- Preserve the shared network contract name: `vps-container-orchestrator`.
- In deploy workflow templates, keep `script_stop: true` for SSH deploy reliability.

## Code style and conventions

### General
- Keep diffs minimal and scoped; avoid unrelated refactors.
- Prefer explicit, readable commands over dense one-liners.
- Never commit secrets (`.env` files are gitignored by design).
- Preserve existing folder layout and naming patterns.

### Bash style
- Include `#!/usr/bin/env bash` and `set -euo pipefail`.
- Validate argument counts early and print usage on failure.
- Use uppercase variable names for script-level values (`APP_SLUG`, `APP_DIR`).
- Quote variable expansions and paths (`"$VAR"`).
- Use `printf` for user-facing output.
- Check preconditions (`-f`, `-e`, directory existence) before side effects.
- Exit non-zero on invalid inputs and missing prerequisites.

### Terraform style
- Use snake_case for variables, locals, outputs, and resources.
- Define `description` and `type` for every variable; provide `default` when sensible.
- Add `validation` blocks for safety-critical or user-provided inputs.
- Prefer locals for derived values (for example `selected_ami_id`).
- Keep shared tags merged with `merge(var.tags, {...})`.
- Keep provider/version constraints explicit in `versions.tf`.
- Run `terraform fmt` after edits.

### YAML/Compose style
- Use 2-space indentation; never use tabs.
- Keep service names descriptive and stable (`nginx-proxy-manager`, `watchtower`, `backend`).
- Use env substitution for deploy-time values (`${APP_IMAGE}`, `${APP_INTERNAL_PORT}`).
- Keep shared network name stable: `vps-container-orchestrator`.
- Prefer `restart: unless-stopped` for long-running services.

### Naming conventions
- App directory: `apps/<app-slug>` with lowercase kebab-case slug.
- Env vars: uppercase snake_case (`WATCHTOWER_INTERVAL`, `APP_INTERNAL_PORT`).
- Terraform identifiers: snake_case.
- Script files: kebab-case with action verbs (`create-app.sh`, `server-deploy.sh`).

### Imports, formatting, and types (future runtime code)
- This repo currently has no Python/Node/Go app modules.
- If runtime code is added, group imports as: standard library, third-party, local.
- Use project-standard formatter/linter for that language and commit config files.
- Prefer explicit typing when language/tooling supports it.

### Error handling expectations
- Fail fast on invalid args, missing files, and failed external commands.
- Emit actionable errors that include what is missing and where.
- Avoid silent fallbacks that can hide deploy/provision failures.
- For potentially destructive actions, require explicit operator intent and clear logs.

## Security and operational guardrails
- Never commit or print sensitive values from `.env` files or CI secrets.
- Keep `admin_cidrs` restricted; avoid `0.0.0.0/0` unless explicitly required.
- Preserve `script_stop: true` behavior in SSH-based deploy workflow variants.
- Do not rename the shared Docker network without coordinated migration.

## Cursor and Copilot rules
- `.cursorrules`: not present
- `.cursor/rules/`: not present
- `.github/copilot-instructions.md`: not present
- If these files are added, treat them as higher-priority instructions and update this doc.

## PR-ready checklist for agents
- Run relevant validation commands for all changed files.
- Include exact commands run in your handoff or PR description.
- Call out any command you could not run and why.
- Keep behavior backward compatible unless a breaking change is intentional.
