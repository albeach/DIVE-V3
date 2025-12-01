# DIVE V3 Federation Infrastructure - Implementation Runbook

**Version**: 1.0.0  
**Date**: 2025-11-28  
**Status**: Ready for Deployment

---

## Executive Summary

This runbook provides step-by-step instructions for deploying and maintaining the DIVE V3 federation infrastructure. The implementation addresses all issues identified in the gap analysis and provides a resilient, persistent solution.

---

## Quick Start

### Full Deployment (All Instances)
```bash
# Generate all configs from federation-registry.json
./scripts/federation/generate-all-configs.sh

# Deploy with orchestrated sequence
./scripts/deploy-federation.sh

# Verify deployment
./scripts/verify-federation.sh
```

### Local-Only Deployment (USA, FRA, GBR)
```bash
./scripts/deploy-federation.sh --local-only
```

### Re-sync After Terraform Changes
```bash
./scripts/sync-federation-secrets.sh
```

---

## Architecture Overview

### Instances
| Instance | Type | Domain | IdP URL | App URL |
|----------|------|--------|---------|---------|
| USA | Local | dive25.com | https://usa-idp.dive25.com | https://usa-app.dive25.com |
| FRA | Local | dive25.com | https://fra-idp.dive25.com | https://fra-app.dive25.com |
| GBR | Local | dive25.com | https://gbr-idp.dive25.com | https://gbr-app.dive25.com |
| DEU | Remote | prosecurity.biz | https://deu-idp.prosecurity.biz | https://deu-app.prosecurity.biz |

### Federation Matrix
```
    USA ←→ FRA ←→ GBR ←→ DEU
     ↑       ↖   ↗       ↑
     └────────←→─────────┘
```
Each instance federates with all others (12 total paths).

---

## Deployment Sequence

### Phase 1: Configuration Generation

The configuration generator creates all files from `config/federation-registry.json`:

```bash
./scripts/federation/generate-all-configs.sh [instance] [--dry-run]
```

**Generated Files:**
- `terraform/instances/*.tfvars` - Terraform variable files
- `frontend/.env.*` - Frontend environment files

### Phase 2: Infrastructure Deployment

The deployment orchestrator handles proper sequencing:

```bash
./scripts/deploy-federation.sh [options]
```

**Options:**
- `--local-only` - Skip remote instances (DEU)
- `--skip-terraform` - Use existing Keycloak configuration
- `--no-sync-secrets` - Skip federation secret synchronization
- `--verbose` - Show detailed output

**Deployment Order:**
1. Shared services (blacklist Redis)
2. For each local instance:
   - PostgreSQL → wait healthy
   - Keycloak → wait healthy
   - Terraform apply
   - Remaining services
3. Sync federation secrets
4. Remote instances (rsync + docker compose)
5. Verify health

### Phase 3: Secret Synchronization

Federation secrets must be synced after Terraform creates clients:

```bash
./scripts/sync-federation-secrets.sh [options]
```

**Options:**
- `--dry-run` - Preview without changes
- `--validate-only` - Check current state
- `--instance=CODE` - Sync specific instance only

**Why This Is Necessary:**
The chicken-and-egg problem:
- Instance A creates client `dive-v3-b-federation` for Instance B
- Instance B's IdP broker needs A's client secret
- Terraform creates the broker before the secret exists
- This script fetches secrets and updates brokers post-Terraform

### Phase 4: Verification

Comprehensive verification of all 12 federation paths:

```bash
./scripts/verify-federation.sh [options]
```

**Options:**
- `--quick` - Skip slow federation path tests
- `--json` - Output results as JSON
- `--fix` - Attempt auto-repair of issues

---

## Configuration Files

### Single Source of Truth
`config/federation-registry.json` is the ONLY place to define:
- Instance URLs
- Ports
- Passwords
- Federation relationships
- Cloudflare tunnel IDs

**Never edit generated files directly!**

### Key Files
| File | Purpose |
|------|---------|
| `config/federation-registry.json` | Master configuration |
| `docker-compose.yml` | USA instance |
| `docker-compose.fra.yml` | FRA instance |
| `docker-compose.gbr.yml` | GBR instance |
| `docker-compose.deu.yml` | DEU instance |
| `cloudflared/config-*.yml` | Tunnel configurations |
| `terraform/instances/*.tfvars` | Terraform variables |

---

## Troubleshooting

### Issue: Federation 401 Unauthorized

**Symptom:**
```
ERROR: Unexpected response from token endpoint ... status=401, 
response={"error":"unauthorized_client","error_description":"Invalid client or Invalid client credentials"}
```

**Solution:**
```bash
# Re-sync federation secrets
./scripts/sync-federation-secrets.sh

# Validate current state
./scripts/sync-federation-secrets.sh --validate-only
```

### Issue: Service Marked Unhealthy

**Symptom:** Container shows unhealthy but seems to work.

**Solution:** Check healthcheck command matches container tools:
- OPA: Use `/opa version` not `wget`
- Keycloak: Use `curl -f http://localhost:8080/health`

### Issue: NextAuth Session Errors

**Symptom:**
```
relation "session" does not exist
```

**Solution:** Ensure postgres init script is mounted:
```yaml
volumes:
  - ./scripts/postgres-init-{instance}/init-{instance}-db.sh:/docker-entrypoint-initdb.d/init-db.sh
```

Then restart postgres (requires volume cleanup for fresh init).

### Issue: DEU Tunnel Not Connecting

**Symptom:** DEU services unreachable via Cloudflare.

**Checklist:**
1. Verify tunnel ID matches in `config-deu.yml` and `federation-registry.json`
2. Ensure `deu-tunnel-credentials.json` exists and has correct credentials
3. Check docker-compose.deu.yml mounts DEU credentials (not USA's)

### Issue: CORS Errors

**Symptom:** Browser console shows CORS blocked requests.

**Solution:** Verify CORS origins include all federation partners:
```yaml
CORS_ORIGIN: https://usa-app.dive25.com,https://fra-app.dive25.com,https://gbr-app.dive25.com,https://deu-app.prosecurity.biz
```

---

## Remote Instance (DEU) Operations

### SSH Access
```bash
source scripts/remote/ssh-helper.sh
ssh_remote deu "docker ps"
```

### Sync Themes
```bash
source scripts/remote/ssh-helper.sh
sync_themes deu
```

### Full Remote Deployment
```bash
./scripts/remote/deploy-remote.sh deu --sync-themes --sync-policies
```

---

## Testing Checklist

### Direct Login Tests
- [ ] USA: https://usa-app.dive25.com → login as testuser-usa-1
- [ ] FRA: https://fra-app.dive25.com → login as testuser-fra-1
- [ ] GBR: https://gbr-app.dive25.com → login as testuser-gbr-1
- [ ] DEU: https://deu-app.prosecurity.biz → login as testuser-deu-1

### Federation Tests (Sample)
- [ ] USA → FRA: Login at USA, select France IdP
- [ ] FRA → USA: Login at FRA, select United States IdP
- [ ] GBR → DEU: Login at GBR, select Germany IdP
- [ ] DEU → GBR: Login at DEU, select United Kingdom IdP

### Attribute Verification
- [ ] Clearance displays correctly
- [ ] countryOfAffiliation displays correctly
- [ ] testuser-xxx-2 shows CONFIDENTIAL clearance

### Dashboard Verification
- [ ] Shows correct instance name
- [ ] Shows "Federated Access via [country]" when federated
- [ ] Dynamic stats load from backend API

---

## Maintenance Procedures

### Adding a New Instance

1. Add entry to `config/federation-registry.json`
2. Add to federation matrix
3. Create docker-compose.{instance}.yml
4. Create cloudflared/config-{instance}.yml
5. Create postgres init script
6. Run `./scripts/federation/generate-all-configs.sh`
7. Deploy: `./scripts/deploy-federation.sh`

### Rotating Keycloak Client Secrets

1. Update secret in Keycloak admin console
2. Run `./scripts/sync-federation-secrets.sh`
3. Restart affected frontends

### Upgrading Keycloak

1. Backup existing data
2. Update image tag in docker-compose files
3. Test locally before production
4. Watch for syncMode or API changes

---

## Success Criteria

| Criteria | Verification |
|----------|--------------|
| All services healthy | `docker ps` shows healthy |
| All 4 IdPs responding | `./scripts/verify-federation.sh --quick` |
| Federation secrets synced | `./scripts/sync-federation-secrets.sh --validate-only` |
| All 12 paths configured | `./scripts/verify-federation.sh` |
| Test users exist | Manual login verification |
| Attributes flow correctly | Check dashboard after federation |

---

## Files Modified in This Implementation

### Terraform
- `terraform/modules/federated-instance/variables.tf` - Added client_secret to federation_partners
- `terraform/modules/federated-instance/idp-brokers.tf` - Updated client_secret handling

### Docker Compose
- `docker-compose.fra.yml` - Network aliases, healthchecks, init script, CORS
- `docker-compose.gbr.yml` - Init script, CORS
- `docker-compose.deu.yml` - OPA healthcheck, tunnel credentials, CORS

### Cloudflare
- `cloudflared/config-deu.yml` - Fixed tunnel ID
- `cloudflared/deu-tunnel-credentials.json` - Created (needs credentials)

### Scripts (New/Updated)
- `scripts/federation/generate-all-configs.sh` - Comprehensive config generator
- `scripts/deploy-federation.sh` - Deployment orchestrator
- `scripts/sync-federation-secrets.sh` - Enhanced with validation
- `scripts/verify-federation.sh` - Federation verification

### Database Init
- `scripts/postgres-init-fra/init-fra-db.sh` - Created
- `scripts/postgres-init-gbr/init-gbr-db.sh` - Created

### Documentation
- `docs/FEDERATION-GAP-ANALYSIS.md` - Comprehensive gap analysis
- `docs/FEDERATION-IMPLEMENTATION-RUNBOOK.md` - This document

---

## References

- Gap Analysis: `docs/FEDERATION-GAP-ANALYSIS.md`
- Original Prompt: `docs/FEDERATION-REBUILD-PROMPT.md`
- Registry Schema: `config/federation-registry.schema.json`
- Project Conventions: `.cursorrules`




