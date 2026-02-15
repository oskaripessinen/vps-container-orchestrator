# vps-container-orchestrator

Keskitetty malli yhden VPS-palvelimen backend-deployhin Docker Composella.

- Infrastructure stack ajetaan kerran (Nginx Proxy Manager + Watchtower)
- Jokainen backend ajetaan omassa `apps/<app-slug>` kansiossa
- Deploy tapahtuu GitHub Actionsin kautta pushista, Watchtower toimii fallbackina

## Hakemistorakenne

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
├── docs/
│   └── new-backend-flow.md
└── terraform/
    └── aws/
```

Jaettu Docker-verkko on kiinteasti:

- `vps-container-orchestrator`

## Miten deploy toimii (kun lisataan uusi backend)

1. Luo appi palvelimelle komennolla `scripts/create-app.sh`.
2. Lisaa backend-repoon workflow pohjasta `templates/backend-repo/.github/workflows/deploy.yml`.
3. Push `main` haaraan backend-repossa.
4. Workflow buildaa imagen ja pushaa sen GHCR:aan (`latest` + `sha`).
5. Workflow SSH:aa VPS:lle ja ajaa `scripts/server-deploy.sh <app-slug>`.
6. Palvelin tekee `docker compose pull && docker compose up -d`.
7. Watchtower paivittaa labeloidut kontit fallbackina intervalilla.

## 1) Ensiasennus palvelimelle

Seuraavat komennot ajetaan VPS:lla (esim. `/home/ubuntu/deploy-hub`):

```bash
git clone <this-repo-url> /home/ubuntu/deploy-hub
cd /home/ubuntu/deploy-hub
cp infrastructure/.env.example infrastructure/.env
docker compose -f infrastructure/docker-compose.yml --env-file infrastructure/.env up -d
```

Sitten avaa Nginx Proxy Manager:

- `http://<server-ip>:81`

## 2) Uuden backendin lisays palvelimelle

```bash
cd /home/ubuntu/deploy-hub
bash scripts/create-app.sh <app-slug> <ghcr-image> <internal-port>
```

Esimerkki:

```bash
bash scripts/create-app.sh projekti-a ghcr.io/your-org/projekti-a:latest 3000
```

Tama luo:

- `apps/projekti-a/docker-compose.yml`
- `apps/projekti-a/.env`

Ensimmainen deploy manuaalisesti:

```bash
bash scripts/server-deploy.sh projekti-a
```

## 3) Backend-repon GitHub secrets

Lisaa backend-repositoryyn ainakin seuraavat secrets:

- `SSH_HOST` (VPS IP tai DNS)
- `SSH_USER` (esim. `ubuntu`)
- `SSH_PRIVATE_KEY` (private key, jolla VPS:lle kirjaudutaan)
- `APP_SLUG` (esim. `projekti-a`)
- `GHCR_READ_TOKEN` (vain jos image on private, scope `read:packages`)

## 4) Nginx Proxy Manager appille

Luo uusi Proxy Host:

- Domain Names: appin domain
- Forward Hostname / IP: `APP_NAME` (appin `.env`:sta)
- Forward Port: `APP_INTERNAL_PORT`

Ota SSL kayttoon NPM:n UI:ssa.

## 5) Terraform (AWS) bootstrap

Jos haluat pystyttaa EC2-instanssin koodilla:

```bash
cd terraform/aws
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan
terraform apply
```

Tarkea:

- Rajaa `admin_cidrs` omaan IP-osoitteeseen (SSH 22 ja NPM UI 81)
- `vpc_id`, `subnet_id` ja `key_name` tulee olla olemassa ennen applyta

Terraform luo:

- EC2 instanssin
- Security Groupin porteille 22/80/443/81
- Elastic IP:n
- User data -asennuksen Dockerille ja Docker Compose pluginille

## Hyodylliset komennot

Infra stack ylos:

```bash
docker compose -f infrastructure/docker-compose.yml --env-file infrastructure/.env up -d
```

Yhden appin deploy:

```bash
bash scripts/server-deploy.sh <app-slug>
```

Katso kontit:

```bash
docker ps
```
