# DIVE V3 Federation Infrastructure - Gap Analysis

**Date**: 2025-11-28  
**Analyst**: AI Assistant  
**Source Document**: `docs/FEDERATION-REBUILD-PROMPT.md`

---

## Executive Summary

This document presents a comprehensive gap analysis of the DIVE V3 federation infrastructure. The analysis identified **15 gaps** across 5 severity levels, with **3 critical**, **5 high**, **4 medium**, and **3 low** priority issues. A phased implementation plan addresses each gap systematically.

---

## Gap Analysis Matrix

| ID | Severity | Category | Description | Impact | Location |
|----|----------|----------|-------------|--------|----------|
| FED-001 | 🔴 CRITICAL | Federation | IdP client secrets are placeholders | 401 Unauthorized on federation | `idp-brokers.tf:28` |
| FED-002 | 🔴 CRITICAL | Cloudflare | DEU tunnel credentials file missing | DEU tunnel won't authenticate | `cloudflared/` |
| FED-003 | 🔴 CRITICAL | Cloudflare | DEU tunnel ID mismatch between config and registry | DEU tunnel routing fails | `config-deu.yml` |
| NET-001 | 🟠 HIGH | Docker | Missing network aliases in FRA docker-compose | Services unreachable by cloudflared | `docker-compose.fra.yml` |
| DB-001 | 🟠 HIGH | Database | Missing postgres init scripts for FRA/GBR | NextAuth sessions fail | `docker-compose.fra.yml` |
| OPA-001 | 🟠 HIGH | Healthcheck | OPA healthcheck uses wget (not available) | Containers marked unhealthy | `docker-compose.deu.yml` |
| CORS-001 | 🟠 HIGH | Security | Incomplete CORS origins for federation | Cross-instance API calls fail | All docker-compose files |
| SEC-001 | 🟠 HIGH | Security | Hardcoded client secrets across instances | Security vulnerability | All docker-compose files |
| DB-002 | 🟡 MEDIUM | Database | Inconsistent database naming | Confusion, potential data issues | All instances |
| CFG-001 | 🟡 MEDIUM | Config | docker-compose.deu.yml uses USA tunnel creds | Wrong credentials mounted | `docker-compose.deu.yml:280` |
| CFG-002 | 🟡 MEDIUM | Config | No config generator for instance env files | Manual config prone to drift | `scripts/federation/` |
| CFG-003 | 🟡 MEDIUM | Config | Missing .env.* files for frontend instances | Environment not isolated | `frontend/` |
| DOC-001 | 🟢 LOW | Docs | Port allocation confusing (GBR uses DEU ports) | Developer confusion | `docker-compose.gbr.yml` |
| DOC-002 | 🟢 LOW | Docs | Missing deployment runbook | Operations unclear | `docs/` |
| MON-001 | 🟢 LOW | Monitoring | No federation verification script | Manual testing required | `scripts/` |

---

## Detailed Gap Analysis

### FED-001: IdP Client Secrets are Placeholders 🔴 CRITICAL

**Current State:**
```hcl
# terraform/modules/federated-instance/idp-brokers.tf:28
client_secret = lookup(each.value, "client_secret", "placeholder-configure-manually")
```

**Problem:**
- Terraform creates IdP brokers with placeholder secrets
- The actual secrets are only known AFTER Terraform creates the federation clients
- Chicken-and-egg: Instance A creates client for B, but B's IdP needs A's secret

**Symptom:**
```
ERROR: Unexpected response from token endpoint ... status=401, 
response={"error":"unauthorized_client","error_description":"Invalid client or Invalid client credentials"}
```

**Root Cause:**
- `sync-federation-secrets.sh` exists but is not run automatically after Terraform
- No validation that secrets were actually synced

**Fix Required:**
1. Run `sync-federation-secrets.sh` after every Terraform apply
2. Add secret sync to deployment orchestration
3. Add validation step to verify secrets are correct

---

### FED-002: DEU Tunnel Credentials File Missing 🔴 CRITICAL

**Current State:**
```yaml
# docker-compose.deu.yml:280
volumes:
  - ./cloudflared/config-deu.yml:/etc/cloudflared/config.yml:ro
  - ./cloudflared/tunnel-credentials.json:/etc/cloudflared/tunnel-credentials.json:ro  # ❌ WRONG
```

**Problem:**
- DEU uses USA's tunnel credentials file (`tunnel-credentials.json`)
- No `deu-tunnel-credentials.json` exists in `cloudflared/`
- Other instances have properly named files: `fra-tunnel-credentials.json`, `gbr-tunnel-credentials.json`

**Fix Required:**
1. Create `cloudflared/deu-tunnel-credentials.json` with DEU's tunnel token
2. Update `docker-compose.deu.yml` to reference correct file

---

### FED-003: DEU Tunnel ID Mismatch 🔴 CRITICAL

**Current State:**
- `cloudflared/config-deu.yml`: `tunnel: 2856308e-2467-495d-b735-6f588140c387`
- `config/federation-registry.json`: `tunnelId: 2112e264-61e3-463f-9d13-b55273bde204`

**Problem:**
- Config file has different tunnel ID than registry
- One of these is wrong - tunnel won't connect

**Fix Required:**
1. Verify correct tunnel ID from Cloudflare dashboard
2. Update both files to use correct ID
3. Add validation to config generator

---

### NET-001: Missing Network Aliases in FRA 🟠 HIGH

**Current State:**
```yaml
# docker-compose.fra.yml - NO network aliases
keycloak-fra:
  networks:
    - dive-fra-network  # No aliases!
```

**Problem:**
- FRA services don't have network aliases like DEU/GBR
- Cloudflared references `keycloak-fra`, `frontend-fra`, etc.
- Without aliases, DNS resolution may fail in some scenarios

**Compare to DEU (correct):**
```yaml
# docker-compose.deu.yml:62-64
networks:
  dive-deu-network:
    aliases:
      - keycloak
```

**Fix Required:**
Add network aliases to all FRA services.

---

### DB-001: Missing Postgres Init Scripts 🟠 HIGH

**Current State:**
| Instance | Init Script | Mounted |
|----------|-------------|---------|
| USA | `scripts/setup/init-db.sh` | ✅ Yes |
| FRA | None | ❌ No |
| GBR | None | ❌ No |
| DEU | `scripts/postgres-init-deu/init-deu-db.sh` | ✅ Yes |

**Problem:**
- FRA and GBR don't create `dive_v3_app` database
- NextAuth sessions fail with "relation 'session' does not exist"

**Fix Required:**
1. Create standardized init scripts for FRA/GBR
2. Mount them in docker-compose files

---

### OPA-001: Healthcheck Uses Unavailable Tool 🟠 HIGH

**Current State:**
```yaml
# docker-compose.deu.yml and docker-compose.fra.yml
healthcheck:
  test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:8181/health"]
```

**Problem:**
- OPA alpine image doesn't include `wget`
- Containers show as unhealthy even when OPA is working

**Compare to USA (correct):**
```yaml
# docker-compose.yml
healthcheck:
  test: ["CMD", "/opa", "version"]
```

**Fix Required:**
Update healthcheck to use `/opa version` or curl (if available).

---

### CORS-001: Incomplete CORS Origins 🟠 HIGH

**Current State:**
```yaml
# docker-compose.fra.yml
FEDERATION_ALLOWED_ORIGINS: https://fra-app.dive25.com,https://localhost:3001
# Missing: USA, GBR, DEU origins!
```

**Problem:**
- Cross-instance API calls fail with CORS errors
- Federation partners can't make authenticated API calls

**Fix Required:**
Generate CORS config from federation-registry.json to include all partners:
```
https://usa-app.dive25.com,https://fra-app.dive25.com,https://gbr-app.dive25.com,https://deu-app.prosecurity.biz
```

---

### SEC-001: Hardcoded Client Secrets 🟠 HIGH

**Current State:**
All docker-compose files contain:
```yaml
KEYCLOAK_CLIENT_SECRET: 8AcfbgtdNIZp3tbrcmc2voiUfxNb8d6L
```

**Problem:**
- This is USA's client secret
- Each instance should have unique secrets
- Secrets should come from environment or secrets manager

**Fix Required:**
1. Remove hardcoded secrets from docker-compose files
2. Use environment variable substitution: `KEYCLOAK_CLIENT_SECRET: ${KEYCLOAK_CLIENT_SECRET}`
3. Store secrets in `.env.*` files (git-ignored)

---

### DB-002: Inconsistent Database Naming 🟡 MEDIUM

**Current State:**
| Instance | NextAuth DB | Notes |
|----------|-------------|-------|
| USA | `dive_v3_app` | Using postgres user |
| FRA | `dive_v3_app` | Using keycloak user |
| GBR | `dive_v3_app` | Using keycloak user |
| DEU | `dive_v3_deu` | Different name |

**Fix Required:**
Standardize database naming in init scripts:
- `keycloak_db` for Keycloak
- `dive_v3_{instance}` for NextAuth

---

### CFG-001: DEU Uses Wrong Credentials Mount 🟡 MEDIUM

**Current State:**
```yaml
# docker-compose.deu.yml:280
- ./cloudflared/tunnel-credentials.json:/etc/cloudflared/tunnel-credentials.json:ro
```

**Expected:**
```yaml
- ./cloudflared/deu-tunnel-credentials.json:/etc/cloudflared/tunnel-credentials.json:ro
```

**Fix Required:**
Update the volume mount to use DEU-specific credentials file.

---

### CFG-002: Missing Config Generator 🟡 MEDIUM

**Current State:**
- `scripts/federation/generate-tfvars.sh` exists ✅
- No `generate-docker-compose.sh` implementation
- No `generate-env-files.sh` for frontend .env files

**Fix Required:**
Create comprehensive config generator that produces:
1. Terraform .tfvars files
2. Docker Compose environment overrides
3. Frontend .env.{instance} files
4. Cloudflared config files

---

### CFG-003: Missing Frontend .env Files 🟡 MEDIUM

**Current State:**
```yaml
# docker-compose.fra.yml references:
- ./frontend/.env.fra:/app/.env.local:ro
```

**Problem:**
These files may not exist or may have stale values.

**Fix Required:**
Generate `.env.{instance}` files from federation-registry.json.

---

## Implementation Plan

### Phase 1: Critical Fixes (Immediate)
1. Fix DEU tunnel credentials and ID
2. Fix terraform IdP sync_mode (already done ✅)
3. Run and validate sync-federation-secrets.sh

### Phase 2: Docker Compose Fixes
1. Add network aliases to FRA
2. Fix OPA healthchecks across all instances
3. Add postgres init scripts for FRA/GBR

### Phase 3: Security & CORS
1. Generate CORS config from registry
2. Move secrets to environment variables
3. Create .env template files

### Phase 4: Config Generation
1. Create comprehensive config generator
2. Generate all configs from federation-registry.json
3. Add pre-commit hook for validation

### Phase 5: Testing & Verification
1. Create federation verification script
2. Test all 12 federation paths
3. Document deployment runbook

---

## Success Criteria

| Phase | Criteria | Verification |
|-------|----------|--------------|
| 1 | DEU tunnel connects | `cloudflared tunnel info` shows healthy |
| 1 | Federation secrets synced | No 401 errors on federation login |
| 2 | All services healthy | `docker ps` shows all healthy |
| 2 | NextAuth sessions work | Login persists across requests |
| 3 | Cross-origin API calls work | No CORS errors in browser console |
| 4 | Configs generated from registry | `diff` shows no drift |
| 5 | All 12 federation paths work | Automated test passes |

---

## Files to Modify

### Critical (Phase 1)
- `cloudflared/config-deu.yml` - Fix tunnel ID
- `cloudflared/deu-tunnel-credentials.json` - Create file
- `docker-compose.deu.yml` - Fix credentials mount

### High Priority (Phase 2)
- `docker-compose.fra.yml` - Add network aliases, fix healthchecks
- `docker-compose.deu.yml` - Fix OPA healthcheck
- `scripts/postgres-init-fra/init-fra-db.sh` - Create
- `scripts/postgres-init-gbr/init-gbr-db.sh` - Create

### Medium Priority (Phase 3-4)
- All docker-compose files - Environment variable substitution
- `scripts/federation/generate-all-configs.sh` - Create
- `frontend/.env.fra`, `.env.gbr`, `.env.deu` - Generate

---

## References

- Source: `docs/FEDERATION-REBUILD-PROMPT.md`
- Registry: `config/federation-registry.json`
- Terraform: `terraform/modules/federated-instance/`
- Sync Script: `scripts/sync-federation-secrets.sh`

