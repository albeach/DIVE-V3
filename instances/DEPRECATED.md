# ⚠️ DEPRECATED - Do Not Use

This `instances/` folder contains **legacy docker-compose templates** that are no longer actively maintained.

## Current Architecture

The DIVE V3 deployment now uses root-level docker-compose files:

| Instance | Current File | Status |
|----------|--------------|--------|
| USA | `docker-compose.yml` | ✅ Active |
| FRA | `docker-compose.fra.yml` | ✅ Active |
| GBR | `docker-compose.gbr.yml` | ✅ Active |
| DEU | `docker-compose.deu.yml` | ✅ Active |

## Deployment

Use the unified deployment script:

```bash
# Source secrets first (REQUIRED)
source ./scripts/sync-gcp-secrets.sh usa

# Deploy using the main script
./scripts/deploy-dive-instance.sh USA
```

## Why Deprecated?

1. **Security**: These templates contain hardcoded secrets
2. **Maintenance**: The root-level files are actively maintained
3. **Consistency**: The deploy script uses root-level files

## Migration

If you have scripts referencing `instances/*/docker-compose.yml`, update them to use:

- `docker-compose.yml` for USA
- `docker-compose.fra.yml` for FRA
- `docker-compose.gbr.yml` for GBR
- `docker-compose.deu.yml` for DEU

---

**Deprecated Date:** 2025-11-30
**Reason:** Security audit - hardcoded secrets, replaced by root-level files






