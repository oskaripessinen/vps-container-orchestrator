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

## 3) Expose endpoint via Nginx Proxy Manager

Create a new Proxy Host in NPM:

- Domain: `metrics.your-domain.com`
- Forward Hostname / IP: `vps-metrics-api`
- Forward Port: `8787`

Enable SSL.

## 4) Configure control-panel

In `control-panel/.env.local`:

```bash
VPS_METRICS_URL=https://metrics.your-domain.com/api/v1/stats
VPS_METRICS_TOKEN=replace-with-the-same-token
```

`control-panel` route `GET /api/vps/status` proxies the request to `VPS_METRICS_URL`.
