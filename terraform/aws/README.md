# AWS bootstrap

## Usage

```bash
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan
terraform apply
```

## Notes

- Restrict `admin_cidrs` to your own IP.
- `vpc_id` and `subnet_id` must already exist.
- User data installs Docker Engine and Docker Compose plugin.
- After provisioning, clone this repo to `/home/<deploy_user>/deploy-hub`.
