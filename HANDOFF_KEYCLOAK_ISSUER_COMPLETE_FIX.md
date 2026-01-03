# DIVE V3 - Complete Keycloak Issuer URL Fix

## Problem Statement

Login from NZL spoke frontend (https://localhost:3033/) results in `error=Configuration` redirect. The root cause is a Keycloak issuer URL mismatch between what the frontend expects and what Keycloak returns.

**Error Flow**:
```
1. User clicks login on https://localhost:3033/
2. Frontend (NextAuth) expects issuer: https://localhost:8476/realms/dive-v3-broker-nzl
3. Keycloak returns issuer: https://localhost:8468/realms/dive-v3-broker-nzl
4. Issuer mismatch causes "Configuration" error
5. User redirected to: /api/auth/error?error=Configuration
```

## Root Cause Analysis

### Docker Port Mapping vs Keycloak Detection

```
┌─────────────────────────────────────────────────────────────────┐
│                    DOCKER PORT MAPPING                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Browser/Frontend                                               │
│       │                                                         │
│       ▼ Connects to localhost:8476 (external port)              │
│  ┌────────────────────────────────────────────────────┐        │
│  │             Docker Host                             │        │
│  │    ┌────────────────────────────────────────┐      │        │
│  │    │  Port Mapping: 8476:8443               │      │        │
│  │    │                                        │      │        │
│  │    │  ┌────────────────────────────────┐   │      │        │
│  │    │  │  Keycloak Container             │   │      │        │
│  │    │  │  Listens on: 8443 (internal)    │   │      │        │
│  │    │  │  Sees port: 8443 NOT 8476       │   │      │        │
│  │    │  │                                 │   │      │        │
│  │    │  │  Generates issuer with:         │   │      │        │
│  │    │  │  https://localhost:8468 ❌       │   │      │        │
│  │    │  └────────────────────────────────┘   │      │        │
│  │    └────────────────────────────────────────┘      │        │
│  └────────────────────────────────────────────────────┘        │
│                                                                 │
│  Expected by Frontend: https://localhost:8476 ✓                 │
│  Returned by Keycloak: https://localhost:8468 ❌                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Why Port 8468?

- NZL port offset = 33 (from `get_instance_ports()` in common.sh)
- Expected HTTPS port: 8443 + 33 = **8476** ✓
- Keycloak returns: **8468** (8443 + 25 = GBR's offset!)
- This suggests Keycloak is using cached/stale configuration or persisted realm data

### Keycloak v26+ Hostname Behavior

**In development mode (`start-dev`)**:
- Keycloak auto-detects hostname from incoming requests
- Uses `X-Forwarded-*` headers if `KC_PROXY_HEADERS` is set
- **Problem**: Direct browser access to `localhost:8476` doesn't pass through a proxy
- Keycloak sees internal port (8443), derives wrong external port

**Deprecated v1 Options** (show warnings in Keycloak 26+):
- `KC_HOSTNAME_URL` - "Hostname v1 options still in use"
- `KC_HOSTNAME_PORT` - Removed
- `KC_PROXY: edge` - Old proxy mode syntax

**Current v2 Options**:
- `KC_HOSTNAME` - Base hostname only
- `KC_HOSTNAME_STRICT` - Whether to allow dynamic detection
- `KC_PROXY_HEADERS` - Which headers to trust (xforwarded, forwarded)

## Previous Session Work

### Commits Made

1. **0c370e9c** - `fix(terraform): Use instance-suffixed client_id for spoke Keycloak`
   - Fixed INTERNAL SERVER ERROR from missing client
   - Updated `terraform/spoke/main.tf` to compute client_id

2. **b9c7cdb8** - `refactor: Remove deprecated dive-v3-broker and cross-border-client patterns`
   - Cleaned up all non-instance-specific client naming
   - Archived 15 legacy scripts
   - Updated Terraform, backend, and scripts

3. **2622c210** - `fix(keycloak): Add hostname configuration infrastructure for spoke instances`
   - Updated spoke-init.sh template with correct Keycloak v26+ config
   - Created spoke-fix-hostname.sh migration module
   - Integrated auto-fix into spoke_up() workflow

4. **e30a09c3** - `docs: Add comprehensive Keycloak issuer fix analysis and solution`
   - Added HANDOFF_KEYCLOAK_ISSUER_FIX.md documentation

### Files Modified

| File | Change | Status |
|------|--------|--------|
| `terraform/spoke/main.tf` | Compute client_id with instance suffix | ✅ Done |
| `terraform/modules/federated-instance/variables.tf` | Removed stale defaults | ✅ Done |
| `scripts/dive-modules/spoke-init.sh` | Updated Keycloak template | ✅ Done |
| `scripts/dive-modules/spoke-fix-hostname.sh` | Created migration module | ✅ Done |
| `scripts/dive-modules/spoke-deploy.sh` | Added auto-fix integration | ✅ Done |
| `scripts/dive-modules/spoke.sh` | Added fix-hostname command | ✅ Done |

### Current Infrastructure Status

- New spoke instances: Will have correct Keycloak config from template
- Existing instances: Can use `./dive spoke fix-hostname`
- Auto-fix: Runs during `./dive spoke up` (non-blocking)
- **BUT**: The underlying issuer URL mismatch still occurs

## Deferred Actions (MUST COMPLETE)

### 1. Fix Keycloak Issuer Port Detection

The core issue remains unfixed. Keycloak still returns wrong port in issuer URL.

**Options to Evaluate**:

#### Option A: Nginx Reverse Proxy (Recommended)
Add Nginx in front of Keycloak to handle port mapping properly.

```yaml
# In instances/{code}/docker-compose.yml
nginx-keycloak-{code}:
  image: nginx:alpine
  ports:
    - "${SPOKE_KEYCLOAK_HTTPS_PORT}:443"
  volumes:
    - ./nginx-keycloak.conf:/etc/nginx/nginx.conf:ro
    - ./certs:/etc/nginx/certs:ro
  depends_on:
    - keycloak-{code}
  networks:
    - dive-{code}-network
```

**Pros**: Clean separation, proper header forwarding, production-like
**Cons**: Additional container, more complexity

#### Option B: Internal URLs Only
Configure frontend/backend to use internal Docker URLs.

```bash
# In instances/{code}/.env
AUTH_KEYCLOAK_ISSUER=https://keycloak-{code}:8443/realms/dive-v3-broker-{code}
```

**Pros**: Works immediately, no port mapping issues
**Cons**: Can't access Keycloak admin from host browser

#### Option C: Keycloak Production Mode with Explicit Port
Use production mode with explicit hostname configuration.

```yaml
command: start --hostname=localhost --hostname-port=${SPOKE_KEYCLOAK_HTTPS_PORT}
```

**Pros**: Explicit control
**Cons**: Loses dev mode features, slower startup

### 2. Update All Existing Spoke Instances

After determining the solution, update:
- `instances/nzl/docker-compose.yml`
- `instances/fra/docker-compose.yml`
- `instances/gbr/docker-compose.yml`

### 3. Update SSOT Template

Update `scripts/dive-modules/spoke-init.sh` with the chosen solution.

### 4. Test Complete Login Flow

Verify end-to-end login works for all spokes:
- NZL: https://localhost:3033/
- FRA: https://localhost:3034/
- GBR: https://localhost:3035/

### 5. Verify Persistence

Confirm fix survives:
- `./dive spoke down` and `./dive spoke up`
- `./dive spoke clean` and `./dive spoke deploy`
- Full system restart

## Project Directory Structure

```
DIVE-V3/
├── dive                              # DIVE CLI entrypoint (MUST USE THIS)
├── docker-compose.hub.yml            # Hub docker-compose
├── instances/                        # Spoke instance configurations
│   ├── fra/
│   │   ├── docker-compose.yml        # FRA spoke compose
│   │   ├── .env                      # FRA secrets
│   │   ├── config.json               # FRA config
│   │   └── certs/                    # FRA certificates
│   ├── gbr/
│   │   ├── docker-compose.yml        # GBR spoke compose
│   │   ├── .env                      # GBR secrets
│   │   ├── config.json               # GBR config
│   │   └── certs/                    # GBR certificates
│   └── nzl/
│       ├── docker-compose.yml        # NZL spoke compose ← NEEDS FIX
│       ├── .env                      # NZL secrets
│       ├── config.json               # NZL config
│       └── certs/                    # NZL certificates
├── scripts/
│   ├── dive-modules/                 # DIVE CLI modules
│   │   ├── common.sh                 # SSOT for ports, helpers
│   │   ├── hub.sh                    # Hub commands
│   │   ├── spoke.sh                  # Spoke command router
│   │   ├── spoke-init.sh             # Spoke initialization/template
│   │   ├── spoke-deploy.sh           # Spoke up/down/deploy
│   │   ├── spoke-fix-hostname.sh     # Hostname fix module ← CREATED
│   │   └── ...                       # Other modules
│   └── nato-countries.sh             # Country database
├── docker/
│   └── base/
│       └── services.yml              # Base service templates
├── keycloak/
│   ├── Dockerfile                    # Keycloak image
│   ├── themes/                       # Custom themes
│   └── certs/                        # Hub Keycloak certs
├── frontend/
│   └── src/
│       └── auth.ts                   # NextAuth configuration
└── terraform/
    ├── spoke/
    │   └── main.tf                   # Spoke Terraform config
    └── modules/
        └── federated-instance/
            └── variables.tf          # Module variables
```

## Key Files Reference

### Port SSOT: `scripts/dive-modules/common.sh`

```bash
# Lines 746-789: get_instance_ports()
# Partner nations (32-39):
#   AUS) port_offset=32 ;;
#   NZL) port_offset=33 ;;  # → HTTPS: 8443+33=8476
#   JPN) port_offset=34 ;;
#   KOR) port_offset=35 ;;
#   ISR) port_offset=36 ;;
#   UKR) port_offset=37 ;;
```

### Keycloak Template: `scripts/dive-modules/spoke-init.sh`

```yaml
# Lines 985-1000: keycloak-${code_lower} environment
KC_HOSTNAME: localhost
KC_HOSTNAME_STRICT: "false"
KC_PROXY_HEADERS: xforwarded
KC_HTTP_ENABLED: "true"
KC_HTTPS_CERTIFICATE_FILE: /opt/keycloak/certs/certificate.pem
KC_HTTPS_CERTIFICATE_KEY_FILE: /opt/keycloak/certs/key.pem
KC_HTTPS_PORT: "8443"
KC_TRUSTSTORE_PATHS: /opt/keycloak/conf/truststores/mkcert-rootCA.pem
```

### Hub Reference: `docker-compose.hub.yml`

```yaml
# Lines 162-194: keycloak service
KC_HOSTNAME: ${KEYCLOAK_HOSTNAME:-localhost}
KC_HOSTNAME_STRICT: "false"
KC_PROXY_HEADERS: xforwarded
KC_HTTP_ENABLED: "true"
# Hub uses 8443:8443 (same port) - no mapping issue!
```

### Frontend Auth: `frontend/src/auth.ts`

```typescript
// Uses environment variables:
// AUTH_KEYCLOAK_ISSUER - Expected issuer URL
// AUTH_KEYCLOAK_ID - Client ID (dive-v3-broker-{code})
// AUTH_KEYCLOAK_SECRET - Client secret
```

## Gap Analysis

| Component | Expected State | Current State | Gap |
|-----------|---------------|---------------|-----|
| Spoke Template | Correct Keycloak v26+ config | ✅ Updated | None |
| Migration Tool | CLI command exists | ✅ Created | None |
| Auto-fix | Runs during spoke up | ✅ Integrated | None |
| NZL Keycloak Config | KC_HOSTNAME_URL set | Has deprecated option | Config fix needed |
| NZL Issuer URL | https://localhost:8476 | https://localhost:8468 | **CRITICAL** |
| FRA Issuer URL | https://localhost:8453 | Unknown | Testing needed |
| GBR Issuer URL | https://localhost:8474 | Unknown | Testing needed |
| Nginx Proxy | In front of Keycloak | Not present | **NEEDS IMPLEMENTATION** |
| End-to-end Login | Works for all spokes | NZL broken | **TESTING NEEDED** |
| Persistence | Survives down/up | Untested | **TESTING NEEDED** |

## Phased Implementation Plan

### Phase 1: Root Cause Verification (30 min)
**SMART Goal**: Confirm exact source of port 8468 in Keycloak issuer

**Tasks**:
1. Check if port 8468 is persisted in Keycloak database
2. Verify GBR Keycloak isn't interfering (port 8474 = 8443 + 31)
3. Check Keycloak realm settings for hardcoded URLs
4. Review Keycloak startup logs for hostname detection

**Success Criteria**:
- [ ] Identified exact source of 8468 port
- [ ] Documented which component sets this value
- [ ] Determined if database wipe is needed

**Commands**:
```bash
./dive --instance nzl spoke logs keycloak | grep -E "hostname|8468|issuer"
curl -sk https://localhost:8476/realms/dive-v3-broker-nzl | jq '.issuer'
```

### Phase 2: Solution Implementation (1 hour)
**SMART Goal**: Implement Nginx reverse proxy in spoke template

**Tasks**:
1. Create `docker/base/nginx-keycloak.conf` template
2. Update `spoke-init.sh` to include nginx-keycloak service
3. Update port mapping: nginx on external port, Keycloak internal only
4. Configure proper X-Forwarded headers

**Success Criteria**:
- [ ] Nginx template created
- [ ] spoke-init.sh updated with nginx service
- [ ] Port mapping: nginx:8476 → keycloak:8443
- [ ] X-Forwarded-Proto, X-Forwarded-Port, X-Forwarded-Host set

**Files to Create/Modify**:
```
docker/base/nginx-keycloak.conf          # NEW
scripts/dive-modules/spoke-init.sh       # UPDATE
```

### Phase 3: Migration of Existing Instances (30 min)
**SMART Goal**: Update all spoke docker-compose files with new architecture

**Tasks**:
1. Update NZL docker-compose.yml
2. Update FRA docker-compose.yml
3. Update GBR docker-compose.yml
4. Add nginx-keycloak.conf to each instance

**Success Criteria**:
- [ ] All spokes have nginx-keycloak service
- [ ] Keycloak only exposed internally
- [ ] Nginx handles external HTTPS

**Commands**:
```bash
./dive spoke fix-hostname --all
# OR manually update each instance
```

### Phase 4: Clean Slate Testing (30 min)
**SMART Goal**: Verify fix works from scratch

**Tasks**:
1. Stop and clean all spokes
2. Re-deploy NZL from scratch
3. Verify issuer URL is correct
4. Test full login flow

**Success Criteria**:
- [ ] `./dive --instance nzl spoke clean` succeeds
- [ ] `./dive --instance nzl spoke deploy` succeeds
- [ ] Issuer returns https://localhost:8476
- [ ] Login flow completes successfully

**Commands**:
```bash
./dive --instance nzl spoke clean
./dive --instance nzl spoke deploy
curl -sk https://localhost:8476/realms/dive-v3-broker-nzl/.well-known/openid-configuration | jq '.issuer'
```

### Phase 5: Multi-Spoke Verification (30 min)
**SMART Goal**: Confirm all spokes work correctly

**Tasks**:
1. Deploy FRA spoke
2. Deploy GBR spoke
3. Test login on each frontend
4. Verify federation still works

**Success Criteria**:
- [ ] NZL login works (https://localhost:3033)
- [ ] FRA login works (https://localhost:3034)
- [ ] GBR login works (https://localhost:3035)
- [ ] Federation between spokes works

**Commands**:
```bash
./dive --instance fra spoke deploy
./dive --instance gbr spoke deploy
./dive verify spoke --all
```

### Phase 6: Persistence Testing (30 min)
**SMART Goal**: Confirm fix survives restarts

**Tasks**:
1. Stop all spokes
2. Start all spokes
3. Verify issuer URLs still correct
4. Test login again

**Success Criteria**:
- [ ] `./dive spoke down --all` succeeds
- [ ] `./dive spoke up --all` succeeds
- [ ] All issuer URLs still correct
- [ ] All logins still work

**Commands**:
```bash
./dive --instance nzl spoke down
./dive --instance nzl spoke up
curl -sk https://localhost:8476/realms/dive-v3-broker-nzl/.well-known/openid-configuration | jq '.issuer'
```

### Phase 7: Commit and Document (15 min)
**SMART Goal**: All changes committed with documentation

**Tasks**:
1. Review all changes
2. Commit with descriptive message
3. Update/delete HANDOFF files
4. Verify clean git status

**Success Criteria**:
- [ ] All changes committed
- [ ] No uncommitted files
- [ ] Documentation updated
- [ ] HANDOFF files cleaned up

## Requirements

1. **Use ./dive CLI ONLY** - No direct docker commands
2. **All data is DUMMY/FAKE** - Authorized to nuke Docker resources
3. **Best practice approach** - Solutions must be resilient and persistent
4. **Full testing suite** - Clean slate testing required
5. **Terraform is SSOT** - Keycloak client config managed via Terraform

## Current Environment Status

```
Hub (USA):     https://localhost:3000 → Working ✅
Spoke (NZL):   https://localhost:3033 → BROKEN (issuer mismatch) ❌
Spoke (FRA):   https://localhost:3034 → Unknown
Spoke (GBR):   https://localhost:3035 → Unknown
```

## Success Criteria Summary

1. ✅ NZL spoke frontend login works (no Configuration error)
2. ✅ All spokes (FRA, GBR, NZL) can login from their frontends
3. ✅ Keycloak issuer URL matches frontend expectation
4. ✅ Fix is persistent (survives ./dive spoke down/up)
5. ✅ Fix is baked into spoke-init.sh template
6. ✅ All changes committed to git
7. ✅ No manual workarounds required

## Key Commands Reference

```bash
# Spoke lifecycle
./dive --instance nzl spoke deploy    # Full deployment
./dive --instance nzl spoke up        # Start services
./dive --instance nzl spoke down      # Stop services
./dive --instance nzl spoke clean     # Remove all resources
./dive --instance nzl spoke logs      # View logs

# Fix commands
./dive --instance nzl spoke fix-hostname    # Fix single spoke
./dive spoke fix-hostname --all             # Fix all spokes

# Verification
./dive --instance nzl spoke health    # Health check
./dive --instance nzl spoke verify    # Full verification
./dive verify spoke                   # Verify all spokes

# Hub operations
./dive hub up                         # Start hub
./dive hub down                       # Stop hub
./dive hub status                     # Hub status
```

## Notes

- The Hub works correctly because it maps 8443:8443 (no port difference)
- Spokes use port offsets (NZL=33, FRA=10, GBR=31)
- Keycloak v26 deprecated many hostname options
- `start-dev` mode auto-detects hostname from requests
- Docker port mapping is invisible to Keycloak
