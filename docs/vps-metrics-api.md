# VPS Metrics API

This repository includes a lightweight metrics API service at `infrastructure/vps-metrics-api`.

It provides live VPS and container stats for `control-panel`.

## What it exposes

- Host:
  - hostname
  - uptime
  - load average (1m)
  - CPU usage percent
  - memory usage
- Running containers:
  - name, image, state
  - CPU percent
  - memory usage + percent
  - network RX/TX bytes
  - pids

Endpoint:

- `GET /api/v1/stats`
- auth required: `Authorization: Bearer <METRICS_API_TOKEN>`

Health endpoint:

- `GET /health`

## 1) Configure token on VPS

In `infrastructure/.env`:

```bash
METRICS_API_TOKEN=replace-with-a-strong-random-token
METRICS_CACHE_MS=2000
```

## 2) Start/refresh infrastructure stack

```bash
docker compose -f infrastructure/docker-compose.yml --env-file infrastructure/.env up -d --build
```

## 3) Expose endpoint via Traefik

Set `BASE_DOMAIN` and `ACME_EMAIL` in `infrastructure/.env`, then point wildcard DNS to the VPS.

- Example wildcard DNS: `*.your-domain.com` -> your VPS public IP

After shared infrastructure restarts, metrics is available at:

- `https://metrics.your-domain.com/api/v1/stats`

## 4) Configure control-panel

In `control-panel/.env.local`:

```bash
VPS_METRICS_URL=https://metrics.your-domain.com/api/v1/stats
VPS_METRICS_TOKEN=replace-with-the-same-token
```

`control-panel` route `GET /api/vps/status` proxies the request to `VPS_METRICS_URL`.

## 5) Optional: sync metrics env from GitHub Actions

If you deploy the orchestrator to EC2 with `.github/workflows/deploy-orchestrator.yml`, you can keep
the metrics values in GitHub Actions secrets instead of editing files manually on the server.

Add these repository secrets:

- `BASE_DOMAIN`
- `ACME_EMAIL`
- `METRICS_API_TOKEN`
- `CONTROL_PANEL_RESTART_COMMAND` (optional, but recommended)
- `VPS_METRICS_URL` (optional override; defaults to `https://metrics.<BASE_DOMAIN>/api/v1/stats`)

What the workflow does on EC2:

- upserts `BASE_DOMAIN` and `ACME_EMAIL` into `infrastructure/.env`
- upserts `METRICS_API_TOKEN` into `infrastructure/.env`
- upserts `VPS_METRICS_URL` and `VPS_METRICS_TOKEN` into `control-panel/.env.local`
- migrates existing app stacks to Traefik labels
- restarts the shared infrastructure stack
- runs `CONTROL_PANEL_RESTART_COMMAND` if you configured it

Example restart command secrets:

```bash
sudo systemctl restart control-panel
```

or:

```bash
pm2 restart control-panel
```
