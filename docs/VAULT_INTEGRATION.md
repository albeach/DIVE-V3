# HashiCorp Vault Integration

## Overview

DIVE V3 uses HashiCorp Vault 1.21 as the primary secret management provider, replacing GCP Secret Manager. Vault runs as a container on the hub stack and provides centralized secret storage for all hub and spoke instances.

## Architecture

```
                    ┌─────────────────────────────────┐
                    │         Hub Stack                │
                    │                                  │
                    │  ┌──────────┐  ┌──────────────┐ │
                    │  │  Vault   │  │   Backend    │ │
                    │  │ :8200    │←─│   Keycloak   │ │
                    │  │          │  │   Frontend   │ │
                    │  └────┬─────┘  └──────────────┘ │
                    │       │ dive-shared network      │
                    └───────┼─────────────────────────┘
              ┌─────────────┼─────────────────┐
              │             │                 │
     ┌────────┴───┐  ┌─────┴──────┐  ┌──────┴─────┐
     │  Spoke DEU │  │ Spoke GBR  │  │ Spoke FRA  │
     │  (AppRole) │  │ (AppRole)  │  │ (AppRole)  │
     └────────────┘  └────────────┘  └────────────┘
```

**Provider Selection:** Set `SECRETS_PROVIDER=vault` in `.env.hub` and spoke `.env` files.

## Quick Start

```bash
# 1. Start Vault container
docker compose -f docker-compose.hub.yml up -d vault

# 2. Initialize Vault (one-time)
./dive vault init

# 3. Unseal Vault
./dive vault unseal

# 4. Configure mount points and policies
./dive vault setup

# 5. Migrate secrets from GCP
./scripts/migrate-secrets-gcp-to-vault.sh

# 6. Enable Vault provider
echo "SECRETS_PROVIDER=vault" >> .env.hub

# 7. Deploy with Vault
./dive hub deploy
./dive spoke deploy deu
```

## CLI Commands

| Command | Description |
|---|---|
| `./dive vault init` | Initialize Vault (creates unseal keys, backs up to GCP) |
| `./dive vault unseal` | Unseal Vault after container restart |
| `./dive vault status` | Check Vault health and seal status |
| `./dive vault setup` | Configure mount points, policies, AppRoles, and audit logging |
| `./dive vault snapshot [path]` | Create Raft snapshot backup |
| `./dive vault restore <path>` | Restore from Raft snapshot |

## Secret Path Hierarchy

Vault uses KV v2 engines with the following mount points:

| Mount | Purpose | Example Path |
|---|---|---|
| `dive-v3/core` | Service credentials | `dive-v3/core/usa/postgres` |
| `dive-v3/auth` | Authentication secrets | `dive-v3/auth/deu/nextauth` |
| `dive-v3/federation` | Federation credentials | `dive-v3/federation/deu-usa` |
| `dive-v3/opal` | OPAL policy tokens | `dive-v3/opal/master-token` |

### GCP to Vault Mapping

| GCP Secret | Vault Path | Field |
|---|---|---|
| `dive-v3-postgres-password-usa` | `dive-v3/core/usa/postgres` | `password` |
| `dive-v3-mongo-password-deu` | `dive-v3/core/deu/mongodb` | `password` |
| `dive-v3-keycloak-admin-password-fra` | `dive-v3/core/fra/keycloak-admin` | `password` |
| `dive-v3-auth-secret-gbr` | `dive-v3/auth/gbr/nextauth` | `secret` |
| `dive-v3-keycloak-client-secret` | `dive-v3/auth/shared/keycloak-client` | `secret` |
| `dive-v3-redis-blacklist` | `dive-v3/core/shared/redis-blacklist` | `password` |
| `dive-v3-federation-deu-usa` | `dive-v3/federation/deu-usa` | `client-secret` |

## Access Control

### Hub Policy
Full admin access to all `dive-v3/*` paths.

### Spoke Policies
Each spoke has scoped access:
- **Read/Write:** Own instance secrets (`dive-v3/core/{spoke}/*`, `dive-v3/auth/{spoke}/*`)
- **Read-Only:** Shared secrets (`dive-v3/core/shared/*`, `dive-v3/auth/shared/*`)
- **Read-Only:** Federation secrets involving this spoke
- **Read-Only:** OPAL tokens

### Authentication
- **Hub:** Uses root token (stored in `.vault-token`)
- **Spokes:** Use AppRole authentication (`VAULT_ROLE_ID` + `VAULT_SECRET_ID` in `.env`)

## Unsealing

Vault seals itself on restart and must be unsealed with 3 of 5 unseal keys.

**Automatic unseal:**
```bash
./dive vault unseal
# Fetches unseal keys from GCP Secret Manager and applies them
```

**Manual unseal (if GCP unavailable):**
```bash
# Keys are in .vault-init.txt (created during init)
vault operator unseal <key-1>
vault operator unseal <key-2>
vault operator unseal <key-3>
```

## Migration

### From GCP to Vault

```bash
# Dry run (preview only)
DRY_RUN=true ./scripts/migrate-secrets-gcp-to-vault.sh

# Migrate all instances
./scripts/migrate-secrets-gcp-to-vault.sh

# Migrate specific instance
./scripts/migrate-secrets-gcp-to-vault.sh --instance deu
```

### Rollback to GCP

```bash
# Instant rollback - change provider in .env files
export SECRETS_PROVIDER=gcp
./dive hub deploy
./dive spoke deploy deu
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SECRETS_PROVIDER` | `gcp` | Secret provider: `vault`, `gcp`, or `aws` |
| `VAULT_ADDR` | `http://dive-hub-vault:8200` | Vault API address |
| `VAULT_TOKEN` | (none) | Vault authentication token |
| `VAULT_ROLE_ID` | (none) | AppRole role ID (spokes) |
| `VAULT_SECRET_ID` | (none) | AppRole secret ID (spokes) |

## Troubleshooting

### Vault is sealed
```bash
./dive vault unseal
# If GCP keys unavailable, check .vault-init.txt
```

### Vault not reachable from spokes
```bash
# Verify dive-shared network
docker network inspect dive-shared

# Test connectivity from spoke container
docker exec dive-spoke-deu-backend curl -s http://dive-hub-vault:8200/v1/sys/health
```

### Secret not found
```bash
# List secrets in a path
vault kv list dive-v3/core/deu/

# Read a specific secret
vault kv get dive-v3/core/deu/postgres

# Re-run migration for missing secrets
./scripts/migrate-secrets-gcp-to-vault.sh --instance deu
```

### Authentication failures
```bash
# Check token validity
vault token lookup

# Re-authenticate with AppRole (spoke)
vault write auth/approle/login role_id="$VAULT_ROLE_ID" secret_id="$VAULT_SECRET_ID"
```

## Backup and Recovery

### Create Snapshot
```bash
# Using DIVE CLI (recommended - saves to backups/vault/)
./dive vault snapshot

# Custom output path
./dive vault snapshot /tmp/vault-backup.snap

# Using vault CLI directly
vault operator raft snapshot save /tmp/vault-backup-$(date +%Y%m%d).snap
```

### Restore Snapshot
```bash
# Using DIVE CLI
./dive vault restore /tmp/vault-backup.snap
./dive vault unseal  # Re-unseal after restore

# Using vault CLI directly
vault operator raft snapshot restore /tmp/vault-backup-20260209.snap
./dive vault unseal  # Re-unseal after restore
```

## Secret Rotation

```bash
# Rotate a specific secret
vault kv put dive-v3/core/deu/postgres password="$(openssl rand -base64 32 | tr -d '/+=')"

# Restart affected services
docker compose -f instances/deu/docker-compose.yml restart backend-deu

# Verify connectivity
./dive spoke verify deu
```

## Files Reference

| File | Purpose |
|---|---|
| `docker-compose.hub.yml` | Vault service definition |
| `vault_config/config.hcl` | Vault server configuration |
| `vault_config/policies/*.hcl` | Access control policies |
| `scripts/dive-modules/vault/module.sh` | CLI commands |
| `scripts/dive-modules/configuration/secrets.sh` | Bash Vault provider |
| `scripts/dive-modules/spoke/pipeline/spoke-secrets.sh` | Spoke Vault loading |
| `backend/src/utils/vault-secrets.ts` | TypeScript Vault client |
| `backend/src/utils/gcp-secrets.ts` | Provider routing |
| `scripts/migrate-secrets-gcp-to-vault.sh` | Migration script |
