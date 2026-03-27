# vps-container-orchestrator

A practical deploy hub for running multiple backend apps on one VPS with Docker Compose.

This repo gives you:
- one shared infrastructure stack (`traefik`, `watchtower`, optional `vps-metrics-api`)
- one folder per deployed app under `apps/<app-slug>/`
- scripts for creating and deploying app stacks
- optional AWS bootstrap with Terraform
- an optional `control-panel/` app for authenticated GitHub-triggered deploys and live VPS metrics

## How it works

There are two layers in this repo:

1. Shared infrastructure in `infrastructure/`
   - runs once on the VPS
   - provides reverse proxy, automatic image watching, and optional metrics API

2. Per-app stacks in `apps/<app-slug>/`
   - each backend gets its own Compose file and `.env`
   - deploys pull the latest image and restart that app only

Typical flow:
- bring up shared infrastructure once
- create a new app folder with `scripts/create-app.sh`
- point wildcard DNS to the VPS once
- deploy updates with GitHub Actions or from `control-panel`

## Repository structure

```text
.
├── infrastructure/
│   ├── docker-compose.yml
│   └── vps-metrics-api/
├── apps/
│   └── _template/
├── scripts/
│   ├── create-app.sh
│   ├── server-deploy.sh
│   └── deploy-app-from-image.sh
├── templates/
│   └── backend-repo/.github/workflows/deploy.yml
├── .github/workflows/
│   ├── deploy-orchestrator.yml
│   └── deploy-app-from-ui.yml
├── control-panel/
├── docs/
└── terraform/aws/
```

## Quick start

### 1. Clone repo to the server

Example target directory:

```bash
git clone <this-repo-url> /home/ubuntu/deploy-hub
cd /home/ubuntu/deploy-hub
```

### 2. Start shared infrastructure

```bash
cp infrastructure/.env.example infrastructure/.env
mkdir -p infrastructure/letsencrypt
touch infrastructure/letsencrypt/acme.json
chmod 600 infrastructure/letsencrypt/acme.json
docker compose -f infrastructure/docker-compose.yml --env-file infrastructure/.env up -d --remove-orphans
```

Set these values in `infrastructure/.env` before starting:

- `BASE_DOMAIN` (for example `oskaripessinen.com`)
- `ACME_EMAIL` (Let's Encrypt email)
- `METRICS_API_TOKEN` if you want live VPS metrics in `control-panel`

### 3. Point wildcard DNS to the VPS

- Add `A` record `*` -> your VPS public IP
- Example: `*.oskaripessinen.com` -> `56.228.56.105`
- After that, apps can use automatic subdomains like `<app-slug>.your-domain.com`

## Add a new backend app

Create the app stack on the server:

```bash
bash scripts/create-app.sh <app-slug> <ghcr-image> <internal-port>
```

Example:

```bash
bash scripts/create-app.sh project-a ghcr.io/your-org/project-a:latest 3000
```

If `BASE_DOMAIN` is set in `infrastructure/.env`, this app will automatically get:

- `https://project-a.<base-domain>`

This creates:
- `apps/<app-slug>/docker-compose.yml`
- `apps/<app-slug>/.env`

If the source repository contains a Compose file (`docker-compose.yml`, `docker-compose.yaml`,
`compose.yml`, or `compose.yaml`) anywhere in the repo, the UI-triggered deploy flow now prefers
that Compose app definition over a single Dockerfile build. The server clones the source repo under
`apps/<app-slug>/source-repo/`, deploys the Compose stack, and adds a Traefik override for the
detected public service.

Run the first deploy:

```bash
bash scripts/server-deploy.sh <app-slug>
```

## Automatic routing with Traefik

Per-app Compose stacks include Traefik labels by default.

With wildcard DNS and `BASE_DOMAIN=example.com`:

- app slug `project-a` becomes `https://project-a.example.com`
- metrics API becomes `https://metrics.example.com/api/v1/stats`

No per-app reverse proxy configuration is needed.

## Deploy options

### Option 1: backend repo pushes deploy directly

Use the template at `templates/backend-repo/.github/workflows/deploy.yml` in the backend repository.

What happens on push to `main`:
- GitHub Actions builds the image
- pushes it to GHCR
- SSHs to the VPS
- runs `bash /home/<user>/deploy-hub/scripts/server-deploy.sh <app-slug>`

Backend repo secrets you usually need:
- `SSH_HOST`
- `SSH_USER`
- `SSH_PRIVATE_KEY`
- `APP_SLUG`
- `GHCR_READ_TOKEN` if the image is private

### Option 2: deploy from `control-panel`

`control-panel/` is a Next.js dashboard that lets authenticated users:
- browse accessible GitHub repositories
- trigger build + deploy workflow dispatch
- view live VPS and container metrics

The UI-triggered workflow is `.github/workflows/deploy-app-from-ui.yml`.

That flow:
- checks out the selected source repository
- builds and pushes a tagged GHCR image
- connects to EC2 through AWS SSM
- runs `scripts/deploy-app-from-image.sh` on the server

Start with `control-panel/README.md` if you want to use the dashboard.

## Shared infrastructure services

`infrastructure/docker-compose.yml` currently includes:
- `traefik`
- `watchtower`
- `vps-metrics-api`

The shared Docker network name is fixed:

- `vps-container-orchestrator`

Do not rename that network unless you also migrate app stacks and infra together.

## Terraform bootstrap

If you want to provision the VPS host in AWS:

```bash
cd terraform/aws
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan
terraform apply
```

Important notes:
- keep `admin_cidrs` restricted to your own IPs
- `vpc_id`, `subnet_id`, and `key_name` must already exist
- user data installs Docker Engine and the Docker Compose plugin

After provisioning, clone this repository to `/home/<deploy_user>/deploy-hub` on the instance.

## Useful commands

Start or refresh shared infrastructure:

```bash
docker rm -f nginx-proxy-manager >/dev/null 2>&1 || true
docker compose -f infrastructure/docker-compose.yml --env-file infrastructure/.env up -d --remove-orphans
```

Validate shared infrastructure Compose:

```bash
docker compose -f infrastructure/docker-compose.yml --env-file infrastructure/.env config
```

Validate one app stack:

```bash
docker compose --env-file apps/<app-slug>/.env -f apps/<app-slug>/docker-compose.yml config
```

Deploy one app:

```bash
bash scripts/server-deploy.sh <app-slug>
```

Check Bash scripts:

```bash
shellcheck scripts/*.sh
bash -n scripts/create-app.sh && bash -n scripts/server-deploy.sh && bash -n scripts/deploy-app-from-image.sh && bash -n scripts/migrate-traefik.sh && bash -n scripts/upsert-env.sh
```

## Extra docs

- `control-panel/README.md`: control panel setup
- `docs/new-backend-flow.md`: backend onboarding flow
- `docs/vps-metrics-api.md`: metrics API setup
- `terraform/aws/README.md`: AWS bootstrap notes
