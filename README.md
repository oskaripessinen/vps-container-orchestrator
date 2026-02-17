# vps-container-orchestrator

Centralized pattern for deploying backend services on a single VPS with Docker Compose.

- Infrastructure stack is run once (Nginx Proxy Manager + Watchtower)
- Each backend runs in its own `apps/<app-slug>` directory
- Deploys happen via GitHub Actions on push, with Watchtower as fallback
- Optional `control-panel/` Next.js UI can trigger build+deploy from selected Git repositories

## Directory structure

```text
deploy-hub/
├── infrastructure/
│   ├── docker-compose.yml
│   └── .env
├── apps/
│   ├── _template/
│   │   ├── docker-compose.yml
│   │   └── .env.example
│   └── <app-slug>/
│       ├── docker-compose.yml
│       └── .env
├── scripts/
│   ├── create-app.sh
│   └── server-deploy.sh
├── templates/
│   └── backend-repo/.github/workflows/deploy.yml
├── control-panel/
│   ├── src/
│   ├── .env.example
│   └── README.md
├── docs/
│   └── new-backend-flow.md
└── terraform/
    └── aws/
```

## Control panel (optional)

The `control-panel/` app provides a web UI for authenticated users to import a repository,
build an image, and dispatch deploy workflow `deploy-app-from-ui.yml`.

- Start from `control-panel/README.md` for setup and required environment variables.
- End users do not provide deploy tokens; one server-side deploy credential is configured in control-panel env.

The shared Docker network is fixed:

- `vps-container-orchestrator`

## How deploy works (when adding a new backend)

1. Create the app on the server with `scripts/create-app.sh`.
2. Add a workflow to the backend repo from `templates/backend-repo/.github/workflows/deploy.yml`.
3. Push to the `main` branch in the backend repo.
4. The workflow builds the image and pushes it to GHCR (`latest` + `sha`).
5. The workflow SSHs to the VPS and runs `scripts/server-deploy.sh <app-slug>`.
6. The server runs `docker compose pull && docker compose up -d`.
7. Watchtower updates labeled containers as a fallback on its interval.

## 1) Initial server setup

Run the following commands on the VPS (for example in `/home/ubuntu/deploy-hub`):

```bash
git clone <this-repo-url> /home/ubuntu/deploy-hub
cd /home/ubuntu/deploy-hub
cp infrastructure/.env.example infrastructure/.env
docker compose -f infrastructure/docker-compose.yml --env-file infrastructure/.env up -d
```

Then open Nginx Proxy Manager:

- `http://<server-ip>:81`

## 2) Add a new backend on the server

```bash
cd /home/ubuntu/deploy-hub
bash scripts/create-app.sh <app-slug> <ghcr-image> <internal-port>
```

Example:

```bash
bash scripts/create-app.sh project-a ghcr.io/your-org/project-a:latest 3000
```

This creates:

- `apps/project-a/docker-compose.yml`
- `apps/project-a/.env`

First manual deploy:

```bash
bash scripts/server-deploy.sh project-a
```

## 3) GitHub secrets in the backend repo

Add at least these secrets to the backend repository:

- `SSH_HOST` (VPS IP or DNS)
- `SSH_USER` (for example `ubuntu`)
- `SSH_PRIVATE_KEY` (private key used to log in to the VPS)
- `APP_SLUG` (for example `project-a`)
- `GHCR_READ_TOKEN` (only if the image is private, scope `read:packages`)

## 4) Nginx Proxy Manager for the app

Create a new Proxy Host:

- Domain Names: app domain
- Forward Hostname / IP: `APP_NAME` (from the app `.env`)
- Forward Port: `APP_INTERNAL_PORT`

Enable SSL in the NPM UI.

## 5) Terraform (AWS) bootstrap

If you want to provision an EC2 instance with code:

```bash
cd terraform/aws
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan
terraform apply
```

Important:

- Restrict `admin_cidrs` to your own IP address (SSH 22 and NPM UI 81)
- `vpc_id`, `subnet_id`, and `key_name` must exist before apply

Terraform creates:

- EC2 instance
- Security Group for ports 22/80/443/81
- Elastic IP
- User data setup for Docker and Docker Compose plugin

## Useful commands

Bring infrastructure stack up:

```bash
docker compose -f infrastructure/docker-compose.yml --env-file infrastructure/.env up -d
```

Deploy one app:

```bash
bash scripts/server-deploy.sh <app-slug>
```

List containers:

```bash
docker ps
```
