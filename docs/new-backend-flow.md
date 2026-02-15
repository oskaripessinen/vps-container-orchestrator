# New backend flow

This document explains exactly what happens when a new backend is added.

## 1) Prepare app folder on VPS

Run on server inside `/home/ubuntu/deploy-hub`:

```bash
bash scripts/create-app.sh <app-slug> <ghcr-image> <internal-port>
```

Example:

```bash
bash scripts/create-app.sh projekti-a ghcr.io/your-org/projekti-a:latest 3000
```

This creates:

- `apps/<app-slug>/docker-compose.yml`
- `apps/<app-slug>/.env`

## 2) Add reverse proxy route once

In Nginx Proxy Manager:

- Domain Names: your app domain
- Forward Hostname/IP: value of `APP_NAME` in `apps/<app-slug>/.env`
- Forward Port: value of `APP_INTERNAL_PORT`

Enable SSL in the same UI.

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
