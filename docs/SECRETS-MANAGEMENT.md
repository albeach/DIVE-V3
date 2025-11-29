# DIVE V3 Secrets Management Guide

## Overview

This document explains how secrets (passwords, API keys, tokens) flow through the DIVE V3 infrastructure.

> **📢 Vault Integration Implemented**
> 
> Federation secrets (IdP broker client secrets) are now centrally managed via GCP Secret Manager + Keycloak Vault SPI. See:
> - [ADR-001: Vault Secrets Management](./ADR-001-VAULT-SECRETS-MANAGEMENT.md)
> - [Partner Onboarding Guide](./PARTNER-ONBOARDING-GUIDE.md)
> 
> **GCP Project**: `dive25`
> **Total Secrets**: 12 federation secrets (4 instances × 3 partners each)
> 
> **Quick Start with Vault:**
> ```bash
> # Verify GCP secrets are configured
> ./scripts/vault/verify-secrets.sh --verbose
> 
> # Deploy with Vault integration
> ./scripts/vault/deploy-with-vault.sh
> 
> # Or manually:
> ./scripts/vault/upload-federation-secrets.sh    # Upload to GCP
> docker compose -f docker-compose.yml -f docker-compose.vault.yml up -d
> ```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        SECRETS FLOW ARCHITECTURE                             │
└─────────────────────────────────────────────────────────────────────────────┘

                              ┌─────────────────────┐
                              │   .env.secrets      │
                              │   (NEVER COMMITTED) │
                              │                     │
                              │ KEYCLOAK_ADMIN_PASS │
                              │ POSTGRES_PASSWORD   │
                              │ MONGO_PASSWORD      │
                              │ AUTH_SECRET         │
                              └──────────┬──────────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    │                    │                    │
                    ▼                    ▼                    ▼
         ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
         │   TERRAFORM      │  │  DOCKER COMPOSE  │  │   APPLICATION    │
         │                  │  │                  │  │                  │
         │ Reads TF_VAR_*   │  │ Reads ${VAR}     │  │ Reads process.env│
         │ from environment │  │ with defaults    │  │ from .env files  │
         └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘
                  │                     │                     │
                  ▼                     ▼                     ▼
         ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
         │   KEYCLOAK       │  │   POSTGRESQL     │  │   NEXT.JS        │
         │   Realm Config   │  │   MONGODB        │  │   EXPRESS.JS     │
         │   Client Secrets │  │   REDIS          │  │   API Keys       │
         └──────────────────┘  └──────────────────┘  └──────────────────┘
```

## Files Involved

| File | Purpose | Committed to Git? |
|------|---------|-------------------|
| `.env.secrets` | Single source of truth for all secrets | ❌ NO (gitignored) |
| `.env.secrets.example` | Template showing required secrets | ✅ YES |
| `docker-compose.yml` | Uses `${VAR:-default}` syntax | ✅ YES |
| `terraform/*.tfvars` | Instance-specific Terraform vars | ❌ NO (gitignored) |
| `terraform/variables.tf` | Terraform variable definitions | ✅ YES |
| `frontend/.env.local` | Frontend environment vars | ❌ NO (gitignored) |
| `backend/.env` | Backend environment vars | ❌ NO (gitignored) |

## How Each Component Gets Secrets

### 1. Docker Compose

Docker Compose uses **variable substitution with defaults**:

```yaml
# docker-compose.yml
environment:
  POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-password}
```

This means:
- If `POSTGRES_PASSWORD` is set in the environment → use it
- Otherwise → use `password` as default (for development)

**To use custom secrets:**
```bash
# Option A: Export before running
export POSTGRES_PASSWORD="my-secure-password"
docker compose up

# Option B: Source the secrets file
source .env.secrets
docker compose up

# Option C: Use env_file (recommended for production)
docker compose --env-file .env.secrets up
```

### 2. Terraform

Terraform uses **TF_VAR_ prefix** for environment variables:

```hcl
# terraform/variables.tf
variable "keycloak_admin_password" {
  type      = string
  sensitive = true
  # No default = required!
}
```

**To provide the value:**
```bash
# Option A: Environment variable (recommended)
export TF_VAR_keycloak_admin_password="my-secure-password"
terraform apply

# Option B: tfvars file (gitignored)
# terraform/instances/usa.tfvars
keycloak_admin_password = "my-secure-password"

# Option C: Command line (NOT recommended - visible in history)
terraform apply -var="keycloak_admin_password=my-secure-password"
```

### 3. Application Code

The applications read from `.env` files or environment:

```typescript
// backend/src/config.ts
const config = {
  mongoUrl: process.env.MONGODB_URL,
  // Falls back to default if not set
};
```

## Quick Start

### Development Setup

```bash
# 1. Generate secrets
./scripts/setup-secrets.sh generate

# 2. Review and save the generated passwords
cat .env.secrets

# 3. Source the secrets
source .env.secrets

# 4. Start services
docker compose up -d

# 5. Apply Terraform
cd terraform/instances
terraform workspace select usa
terraform apply
```

### Production Setup

For production, use a secrets manager instead of `.env.secrets`:

```bash
# Option A: HashiCorp Vault
export POSTGRES_PASSWORD=$(vault kv get -field=password secret/dive-v3/postgres)
export KEYCLOAK_ADMIN_PASSWORD=$(vault kv get -field=password secret/dive-v3/keycloak)

# Option B: AWS Secrets Manager
export POSTGRES_PASSWORD=$(aws secretsmanager get-secret-value --secret-id dive-v3/postgres --query SecretString --output text | jq -r .password)

# Option C: 1Password CLI
export POSTGRES_PASSWORD=$(op read "op://DevOps/DIVE-V3/PostgreSQL/password")

# Then run your deployment
docker compose up -d
terraform apply
```

## Secret Rotation

### Rotate Keycloak Admin Password

```bash
# 1. Generate new password
NEW_PASS=$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-32)

# 2. Update in Keycloak (via API or Admin Console)
# 3. Update .env.secrets
sed -i "s/KEYCLOAK_ADMIN_PASSWORD=.*/KEYCLOAK_ADMIN_PASSWORD=$NEW_PASS/" .env.secrets

# 4. Restart Keycloak
docker compose restart keycloak
```

### Rotate Database Passwords

```bash
# 1. Generate new password
NEW_PASS=$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-32)

# 2. Update in PostgreSQL
docker exec dive-v3-postgres psql -U postgres -c "ALTER USER postgres PASSWORD '$NEW_PASS';"

# 3. Update .env.secrets
sed -i "s/POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$NEW_PASS/" .env.secrets

# 4. Restart services that use the password
docker compose restart keycloak backend
```

## Security Best Practices

### DO ✅

1. **Generate strong passwords** (32+ characters, random)
2. **Use different passwords** for each service
3. **Rotate secrets** every 90 days
4. **Store secrets** in a password manager
5. **Use environment variables** for passing secrets
6. **Audit access** to secrets regularly

### DON'T ❌

1. **Never commit** `.env.secrets` to git
2. **Never use** default passwords in production
3. **Never share** secrets via Slack/email/chat
4. **Never log** secrets in application code
5. **Never hardcode** secrets in source files
6. **Never use** the same password across services

## Troubleshooting

### "Variable not set" error in Terraform

```
Error: No value for required variable

  variable "keycloak_admin_password" is not set
```

**Solution:**
```bash
# Source the secrets file first
source .env.secrets

# Or export directly
export TF_VAR_keycloak_admin_password="your-password"

# Then run Terraform
terraform apply
```

### Docker container can't connect to database

Check if the password was passed correctly:

```bash
# Check what password Docker is using
docker compose config | grep PASSWORD

# If it shows the default, you need to export first
source .env.secrets
docker compose up -d
```

### Keycloak admin login fails after password change

```bash
# Verify the password is being passed
docker compose config | grep KEYCLOAK_ADMIN

# Restart with fresh state (dev only!)
docker compose down -v
source .env.secrets
docker compose up -d
```

## Federation Secrets (Vault Integration)

For federation secrets between coalition partners, we use a centralized approach:

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     FEDERATION SECRETS FLOW                                  │
└─────────────────────────────────────────────────────────────────────────────┘

                        ┌─────────────────────────────────────┐
                        │        GCP SECRET MANAGER           │
                        │   (Centralized, Audited, HA)        │
                        │                                     │
                        │   dive-v3-federation-usa-fra        │
                        │   dive-v3-federation-usa-gbr        │
                        │   dive-v3-federation-fra-usa        │
                        │   ... (12 total for 4 partners)     │
                        └──────────────────┬──────────────────┘
                                           │
                    ┌──────────────────────┼──────────────────────┐
                    │                      │                      │
                    ▼                      ▼                      ▼
            ┌───────────────┐      ┌───────────────┐      ┌───────────────┐
            │  Vault Sync   │      │  Vault Sync   │      │  Vault Sync   │
            │  (Init Cont.) │      │  (Init Cont.) │      │  (Init Cont.) │
            └───────┬───────┘      └───────┬───────┘      └───────┬───────┘
                    │                      │                      │
                    ▼                      ▼                      ▼
            ┌───────────────┐      ┌───────────────┐      ┌───────────────┐
            │  Keycloak     │      │  Keycloak     │      │  Keycloak     │
            │  (USA)        │      │  (FRA)        │      │  (DEU)        │
            │               │      │               │      │               │
            │  IdP uses:    │      │  IdP uses:    │      │  IdP uses:    │
            │  ${vault.key} │      │  ${vault.key} │      │  ${vault.key} │
            └───────────────┘      └───────────────┘      └───────────────┘
```

### How It Works

1. **Terraform** creates federation clients in each Keycloak instance
2. **Upload Script** extracts client secrets and stores in GCP Secret Manager
3. **Vault Sync** container fetches secrets to `/opt/keycloak/vault/`
4. **Keycloak** uses `${vault.key}` references to read secrets at runtime

### Key Commands

```bash
# Upload secrets after Terraform creates clients
./scripts/vault/upload-federation-secrets.sh

# Sync secrets to Keycloak vault directory (runs automatically in Docker)
INSTANCE=usa ./scripts/vault/sync-secrets-to-files.sh

# Verify all secrets are properly configured
./scripts/vault/verify-secrets.sh --verbose

# Full deployment with vault integration
./scripts/vault/deploy-with-vault.sh
```

### Secret Naming Convention

| GCP Secret Name | Purpose |
|-----------------|---------|
| `dive-v3-federation-{source}-{target}` | Secret for target's IdP to authenticate to source |

Example: `dive-v3-federation-usa-fra` is the secret that FRA uses when federating to USA.

## Reference

### Environment Variable Naming

| Service | Variable | Terraform Variable |
|---------|----------|-------------------|
| Keycloak Admin | `KEYCLOAK_ADMIN_PASSWORD` | `TF_VAR_keycloak_admin_password` |
| PostgreSQL | `POSTGRES_PASSWORD` | - |
| MongoDB | `MONGO_INITDB_ROOT_PASSWORD` | - |
| Redis | `REDIS_PASSWORD` | - |
| NextAuth | `AUTH_SECRET` | - |
| Keycloak Client | `KEYCLOAK_CLIENT_SECRET` | - |

### File Locations

```
dive-v3/
├── .env.secrets              # Main secrets file (gitignored)
├── .env.secrets.example      # Template (committed)
├── docker-compose.yml        # Uses ${VAR:-default}
├── terraform/
│   └── instances/
│       ├── variables.tf      # Variable definitions
│       ├── usa.tfvars        # Instance config (gitignored)
│       └── fra.tfvars        # Instance config (gitignored)
├── frontend/
│   └── .env.local            # Frontend secrets (gitignored)
└── backend/
    └── .env                   # Backend secrets (gitignored)
```


