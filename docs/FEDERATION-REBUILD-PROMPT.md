# DIVE V3 Federation Infrastructure - Complete Rebuild Prompt

## Executive Summary

The DIVE V3 project has accumulated technical debt through incremental fixes that need to be addressed with a comprehensive, persistent solution. This document provides full context for rebuilding the federation infrastructure correctly.

---

## Current Architecture

### Instances
| Instance | Type | Domain | Purpose |
|----------|------|--------|---------|
| USA | Local | dive25.com | Primary hub |
| FRA | Local | dive25.com | Coalition partner |
| GBR | Local | dive25.com | Coalition partner |
| DEU | **Remote** | prosecurity.biz | Remote coalition partner (192.168.42.120) |

### Services Per Instance
- **PostgreSQL**: Keycloak database + NextAuth database (`dive_v3_app`)
- **Keycloak**: Identity Provider (IdP) with `dive-v3-broker` realm
- **MongoDB**: Resource metadata and decision logs
- **Redis**: Session cache and token blacklist
- **OPA**: Policy Decision Point (PDP)
- **Backend**: Node.js Express API (PEP)
- **Frontend**: Next.js with NextAuth
- **KAS**: Key Access Service (stretch goal)
- **Cloudflared**: Cloudflare Tunnel for external access

---

## Lessons Learned (Root Causes of Issues)

### 1. **Keycloak Federation IdP Configuration**

**Problem**: IdP brokers created via Terraform have placeholder client secrets and incorrect `syncMode`.

**Root Cause**: Chicken-and-egg problem:
- Instance A creates client `dive-v3-b-federation` for Instance B
- Instance B's Terraform can't know the secret until Instance A creates it
- Result: IdPs created with `client_secret = "placeholder-configure-manually"`

**Symptom**: `401 Unauthorized` from token endpoint during federation:
```
ERROR: Unexpected response from token endpoint ... status=401, 
response={"error":"unauthorized_client","error_description":"Invalid client or Invalid client credentials"}
```

**Fix Required**: Post-Terraform script that:
1. Extracts client secrets from each instance
2. Updates partner IdP brokers with correct secrets
3. Must run after every Terraform apply

### 2. **Keycloak syncMode Incompatibility**

**Problem**: Terraform creates IdPs with `syncMode = "INHERIT"` which is invalid in Keycloak 26.x

**Symptom**:
```
java.lang.IllegalArgumentException: No enum constant org.keycloak.models.IdentityProviderSyncMode.INHERIT
```

**Fix Required**: Update `terraform/modules/federated-instance/idp-brokers.tf`:
```hcl
sync_mode = "FORCE"  # Not "INHERIT"
```

### 3. **DEU Instance Domain Mismatch**

**Problem**: Multiple files reference `dive25.com` for DEU but it uses `prosecurity.biz`

**Affected Files**:
- `docker-compose.deu.yml`: Wrong URLs for frontend, backend, Keycloak
- `cloudflared/config-deu.yml`: Wrong hostnames in ingress rules
- Various environment variables

**Fix Required**: Single source of truth for instance URLs in `config/federation-registry.json`

### 4. **Docker Compose Network Aliases**

**Problem**: Cloudflared and services can't find each other by name

**Root Cause**: Services named `backend-deu` but cloudflared config references `backend-deu` without network aliases

**Fix Required**: Add network aliases for all services:
```yaml
networks:
  dive-deu-network:
    aliases:
      - backend  # Generic alias
      - backend-deu  # Specific alias
```

### 5. **NextAuth Database Schema**

**Problem**: Frontend fails with `relation "session" does not exist` or `null value in column "id"`

**Root Cause**: PostgreSQL init scripts don't create the NextAuth schema consistently

**Fix Required**: Standardized `init-db.sh` script that creates:
- `keycloak_db` database
- `dive_v3_app` database with correct NextAuth schema (no `id` column in `session` table)

### 6. **Keycloak User Profile (KC 26.x)**

**Problem**: Custom user attributes (clearance, countryOfAffiliation, etc.) silently ignored

**Root Cause**: Keycloak 26.x requires explicit User Profile configuration for custom attributes

**Fix Required**: Terraform resource `keycloak_user_profile` defining all 16 DIVE attributes

### 7. **Cloudflared Tunnel Credentials**

**Problem**: `config-deu.yml` mounted as directory instead of file

**Root Cause**: Docker volume mount creates directory if source doesn't exist

**Affected**: DEU tunnel fails with:
```
yaml: input error: read /etc/cloudflared/config.yml: is a directory
```

**Fix Required**: 
- Ensure credentials files exist BEFORE docker-compose up
- Use consistent naming: `{instance}-tunnel-credentials.json`

### 8. **OPA/Keycloak Healthcheck Failures**

**Problem**: Containers marked unhealthy but actually working

**Root Cause**: Healthcheck commands use tools not available in container (wget in alpine)

**Fix Required**: Use appropriate healthcheck commands:
- OPA: `curl` or check process
- Keycloak: `curl -f http://localhost:8080/health`

### 9. **Inconsistent Admin Passwords**

**Problem**: Different passwords in different places causes auth failures

**Locations where password must match**:
- `docker-compose.*.yml` KEYCLOAK_ADMIN_PASSWORD
- `terraform/instances/*.tfvars` keycloak_admin_password  
- `.env.*` files
- Backend service environment variables

**Fix Required**: Single source in `config/federation-registry.json`:
```json
"defaults": {
  "adminPassword": "DivePilot2025!SecureAdmin"
}
```

### 10. **CORS Configuration**

**Problem**: Backend rejects requests from frontend due to CORS

**Root Cause**: `FEDERATION_ALLOWED_ORIGINS` missing correct domains

**Fix Required**: Auto-generate CORS config from `federation-registry.json`:
- Include app URL for current instance
- Include app URLs for all federation partners

---

## Single Source of Truth Architecture

### `config/federation-registry.json`
This file should be the ONLY place instance configuration is defined:
- Instance URLs (app, api, idp)
- Ports
- Passwords (or references to secrets manager)
- Federation partners

### Generated Files (from federation-registry.json)
- `terraform/instances/{instance}.tfvars`
- `docker-compose.{instance}.yml` (or use envsubst)
- `cloudflared/config-{instance}.yml`
- `.env.{instance}`

### Generator Scripts Needed
1. `scripts/generate-instance-configs.sh` - Creates all config files from registry
2. `scripts/sync-federation-secrets.sh` - Syncs IdP client secrets after Terraform
3. `scripts/deploy-instance.sh` - Full deployment with proper ordering

---

## Correct Deployment Order

```
1. Generate configs from federation-registry.json
2. Deploy shared services (blacklist Redis)
3. For each LOCAL instance (USA, FRA, GBR):
   a. docker-compose -p dive-v3-{instance} up -d postgres
   b. Wait for postgres healthy
   c. docker-compose -p dive-v3-{instance} up -d keycloak
   d. Wait for keycloak healthy
   e. terraform -chdir=terraform/instances workspace select {instance}
   f. terraform -chdir=terraform/instances apply -var-file={instance}.tfvars
   g. docker-compose -p dive-v3-{instance} up -d (remaining services)
4. Run sync-federation-secrets.sh (updates all IdP client secrets)
5. For REMOTE instance (DEU):
   a. rsync all configs to remote
   b. SSH: docker compose up -d
   c. SSH: terraform apply (if running terraform remotely)
   d. Run sync-federation-secrets.sh again (includes DEU)
6. Verify federation: test login from each instance to each partner
```

---

## Files Requiring Updates

### Terraform
- `terraform/modules/federated-instance/idp-brokers.tf`: Fix syncMode
- `terraform/modules/federated-instance/variables.tf`: Add client_secret to federation_partners

### Docker Compose
- `docker-compose.deu.yml`: 
  - All URLs to prosecurity.biz
  - Network aliases for all services
  - Correct credential file paths
  - Correct admin password

### Cloudflared
- `cloudflared/config-deu.yml`: All hostnames to prosecurity.biz

### Scripts (New)
- `scripts/generate-instance-configs.sh`
- `scripts/sync-federation-secrets.sh` (created but needs testing)
- `scripts/verify-federation.sh`

---

## Remote Instance (DEU) Specifics

### SSH Access
```bash
User: mike@192.168.42.120
Password: mike2222
Project Dir: /opt/dive-v3
```

### Key Differences from Local
- Domain: prosecurity.biz (not dive25.com)
- Tunnel ID: 2856308e-2467-495d-b735-6f588140c387
- Needs rsync for file sync (use `scripts/remote/ssh-helper.sh`)
- Must have all files synced BEFORE docker compose up

---

## Testing Checklist

After deployment, verify:

### 1. Direct Login (each instance)
- [ ] USA: https://usa-app.dive25.com → login as testuser-usa-1
- [ ] FRA: https://fra-app.dive25.com → login as testuser-fra-1
- [ ] GBR: https://gbr-app.dive25.com → login as testuser-gbr-1
- [ ] DEU: https://deu-app.prosecurity.biz → login as testuser-deu-1

### 2. Federation (cross-instance)
- [ ] DEU → USA: Start at DEU, federate via USA IdP
- [ ] USA → DEU: Start at USA, federate via DEU IdP
- [ ] All 12 combinations (4×3)

### 3. User Attributes
- [ ] Verify clearance displayed correctly
- [ ] Verify countryOfAffiliation displayed correctly
- [ ] Verify testuser-usa-2 is CONFIDENTIAL (not UNCLASSIFIED)

### 4. Dashboard
- [ ] Shows correct instance name
- [ ] Shows "Federated Access via [country]" when federated
- [ ] Dynamic stats load from backend API

---

## Prompt for New Chat

Copy everything below this line to start a new chat:

---

# DIVE V3 Federation Infrastructure Rebuild

## Context
I have a coalition identity management system (DIVE V3) with 4 Keycloak instances that need to federate:
- USA, FRA, GBR (local on dive25.com)
- DEU (remote on prosecurity.biz at 192.168.42.120)

## Current State
The system has accumulated technical debt with multiple configuration issues documented in `docs/FEDERATION-REBUILD-PROMPT.md`. Key issues:
1. Keycloak IdP syncMode incompatibility (INHERIT vs FORCE)
2. IdP client secrets are placeholders, not synced
3. DEU uses wrong domain (dive25.com instead of prosecurity.biz)
4. Docker network aliases missing
5. NextAuth database schema inconsistent
6. CORS configuration incomplete
7. Cloudflared config incorrect

## Your Task
1. First, read `docs/FEDERATION-REBUILD-PROMPT.md` for full context
2. Read `config/federation-registry.json` for the intended configuration
3. Create a systematic fix plan that:
   - Uses federation-registry.json as the single source of truth
   - Generates all instance configs from this registry
   - Properly sequences deployment (postgres → keycloak → terraform → services)
   - Includes a post-Terraform script to sync IdP secrets
   - Handles the remote DEU instance correctly

## Key Constraints
- Admin password for all instances: `DivePilot2025!SecureAdmin`
- Test user password: `TestUser2025!Pilot`
- DEU SSH: `mike@192.168.42.120` password `mike2222`
- Never hardcode secrets in docker-compose files
- All changes must be persistent (survive restarts)

## Files to Reference
- `config/federation-registry.json` - SSOT for all instance config
- `terraform/modules/federated-instance/` - Keycloak IaC
- `docker-compose.yml`, `docker-compose.fra.yml`, `docker-compose.gbr.yml`, `docker-compose.deu.yml`
- `cloudflared/config-*.yml` - Tunnel configs
- `scripts/remote/ssh-helper.sh` - Helper for DEU access

## Expected Deliverables
1. Fixed Terraform module for IdP brokers (syncMode = FORCE)
2. Config generator script (federation-registry.json → all configs)
3. Updated docker-compose files with correct network aliases
4. Fixed cloudflared configs (especially DEU with prosecurity.biz)
5. Post-Terraform secret sync script
6. Deployment runbook with correct ordering
7. Verification script to test all 12 federation paths

Start by reading the referenced files, then propose a plan before making changes.








