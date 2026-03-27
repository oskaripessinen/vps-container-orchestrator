# New backend flow

This document explains exactly what happens when a new backend is added.

## 1) Prepare app folder on VPS

Run on server inside `/home/ubuntu/deploy-hub`:

```bash
bash scripts/create-app.sh <app-slug> <ghcr-image> <internal-port>
```

Example:

```bash
bash scripts/create-app.sh project-a ghcr.io/your-org/project-a:latest 3000
```

This creates:

- `apps/<app-slug>/docker-compose.yml`
- `apps/<app-slug>/.env`

If `BASE_DOMAIN` is set in `infrastructure/.env`, the script also writes:

- `APP_DOMAIN=<app-slug>.<base-domain>`

## 2) Enable wildcard DNS once

- Point `*.<your-domain>` to the VPS public IP
- Example: `*.oskaripessinen.com` -> `56.228.56.105`

Traefik then routes containers automatically from their labels.

Example result:

- app slug `project-a` -> `https://project-a.<base-domain>`

## 3) Add workflow to backend repository

Copy `templates/backend-repo/.github/workflows/deploy.yml` to backend repository.

Required GitHub repository secrets in backend repo:

- `SSH_HOST`: VPS public IP or DNS
- `SSH_USER`: server user (for example `ubuntu`)
- `SSH_PRIVATE_KEY`: private key matching authorized key on VPS
- `APP_SLUG`: app directory name under `deploy-hub/apps`
- `GHCR_READ_TOKEN`: PAT with `read:packages` if image is private

## 4) What happens on each push to main

1. GitHub Actions builds Docker image.
2. GitHub Actions pushes image to GHCR.
3. GitHub Actions connects to VPS over SSH.
4. VPS runs `bash /home/<SSH_USER>/deploy-hub/scripts/server-deploy.sh <APP_SLUG>`.
5. `docker compose pull` fetches new image and `docker compose up -d` rolls container forward.
6. Watchtower remains as fallback updater if the deploy job is skipped or fails.

## Compose-first UI deploys

The `deploy-app-from-ui.yml` workflow now supports two source repository modes:

- If a Compose file is found in the source repo (`docker-compose.yml`, `docker-compose.yaml`,
  `compose.yml`, `compose.yaml`), the deploy flow clones the repo to the VPS and runs that Compose
  stack instead of forcing a single-image Dockerfile deploy.
- If no Compose file is found, it falls back to the single Dockerfile image flow.

For Compose deploys, the workflow:

1. finds the first Compose file in the repo, preferring shallow paths
2. selects a public service (`api`, `app`, `web`, `backend`, `server`, `frontend`, or first service)
3. clones the source repo under `apps/<app-slug>/source-repo/` on the VPS
4. writes a Traefik override so `<app-slug>.<base-domain>` points to the selected service on the given internal port
