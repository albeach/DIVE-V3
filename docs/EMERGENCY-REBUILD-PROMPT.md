# 🚨 EMERGENCY REBUILD PROMPT - DIVE V3 LOCAL ENVIRONMENT

**Status:** CRITICAL - Environment disrupted, requires full rebuild  
**Date:** 2025-11-28  
**Priority:** IMMEDIATE ACTION REQUIRED

---

## 📋 EXECUTIVE SUMMARY

The DIVE V3 local development environment consists of **5 SEPARATE Docker Compose PROJECTS** (not just files). Each instance MUST be started with the `-p` flag to create **PROJECT ISOLATION**.

### ❌ WRONG (What I was doing):
```bash
docker-compose -f docker-compose.fra.yml up -d  # WRONG! Creates services in "dive-v3" project
```

### ✅ CORRECT (How it should be done):
```bash
docker-compose -p fra -f docker-compose.fra.yml up -d  # Creates separate "fra" project
```

---

## 🏗️ ARCHITECTURE: 5 ISOLATED DOCKER COMPOSE PROJECTS

| # | Project Name | Compose File | Start Command |
|---|--------------|--------------|---------------|
| 1 | `shared` | `docker-compose.shared.yml` | `docker-compose -p shared -f docker-compose.shared.yml up -d` |
| 2 | `dive-v3` (or `usa`) | `docker-compose.yml` | `docker-compose up -d` |
| 3 | `fra` | `docker-compose.fra.yml` | `docker-compose -p fra -f docker-compose.fra.yml up -d` |
| 4 | `gbr` | `docker-compose.gbr.yml` | `docker-compose -p gbr -f docker-compose.gbr.yml up -d` |
| 5 | `dive25-landing` | `dive25-landing/docker-compose.yml` | `cd dive25-landing && docker-compose up -d` |

### Expected Output of `docker compose ls`:
```
NAME                STATUS
shared              running(1)
dive-v3             running(10)
fra                 running(8)
gbr                 running(8)
dive25-landing      running(1)
```

---

## 🔧 CORRECT REBUILD PROCEDURE

```bash
#!/bin/bash
# DIVE V3 Emergency Rebuild Script
# Each instance is a SEPARATE Docker Compose project

cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3

# ============================================================================
# STEP 0: STOP ALL EXISTING PROJECTS (by project name)
# ============================================================================
echo "=== Stopping all DIVE projects ==="
docker-compose -p shared -f docker-compose.shared.yml down 2>/dev/null
docker-compose down 2>/dev/null  # USA (dive-v3)
docker-compose -p fra -f docker-compose.fra.yml down 2>/dev/null
docker-compose -p gbr -f docker-compose.gbr.yml down 2>/dev/null
cd dive25-landing && docker-compose down 2>/dev/null && cd ..

# Remove any orphaned containers
docker stop $(docker ps -q --filter 'name=dive') 2>/dev/null
docker rm $(docker ps -aq --filter 'name=dive') 2>/dev/null

# ============================================================================
# STEP 1: CREATE SHARED NETWORK (required by all instances)
# ============================================================================
echo "=== Creating shared network ==="
docker network create dive-v3-shared-network 2>/dev/null || echo "Network exists"

# ============================================================================
# STEP 2: START SHARED SERVICES PROJECT
# ============================================================================
echo "=== Starting SHARED project ==="
docker-compose -p shared -f docker-compose.shared.yml up -d
sleep 10

# Verify shared Redis
docker exec dive-v3-blacklist-redis redis-cli -a DiveBlacklist2025! ping

# ============================================================================
# STEP 3: START USA PROJECT (primary instance)
# ============================================================================
echo "=== Starting USA project ==="
docker-compose up -d
sleep 60  # Keycloak needs time

# ============================================================================
# STEP 4: START FRA PROJECT (isolated instance)
# ============================================================================
echo "=== Starting FRA project ==="
docker-compose -p fra -f docker-compose.fra.yml up -d
sleep 45

# ============================================================================
# STEP 5: START GBR PROJECT (isolated instance)
# ============================================================================
echo "=== Starting GBR project ==="
docker-compose -p gbr -f docker-compose.gbr.yml up -d
sleep 45

# ============================================================================
# STEP 6: START LANDING PAGE PROJECT
# ============================================================================
echo "=== Starting LANDING project ==="
cd dive25-landing && docker-compose up -d && cd ..

# ============================================================================
# VERIFICATION
# ============================================================================
echo ""
echo "=== Docker Compose Projects ==="
docker compose ls -a

echo ""
echo "=== Container Status ==="
docker ps --format 'table {{.Names}}\t{{.Status}}'
```

---

## 📊 EXPECTED PORT ALLOCATION

| Instance | Frontend | Backend | Keycloak HTTPS | MongoDB | Redis | OPA |
|----------|----------|---------|----------------|---------|-------|-----|
| USA | 3000 | 4000 | 8443 | 27017 | 6379 | 8181 |
| FRA | 3001 | 4001 | 8444 | 27018 | 6380 | 8182 |
| GBR | 3002 | 4002 | 8445 | 27019 | 6381 | 8283 |
| Shared | - | - | - | - | 6399 | - |
| Landing | 8889 | - | - | - | - | - |

---

## 🔗 NETWORK ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    dive-v3-shared-network (EXTERNAL)                        │
│  ┌───────────────────┐                                                      │
│  │ blacklist-redis   │◄──────┬────────────┬────────────┐                   │
│  │ (Project: shared) │       │            │            │                   │
│  └───────────────────┘       │            │            │                   │
└──────────────────────────────│────────────│────────────│───────────────────┘
                               │            │            │
        ┌──────────────────────┘            │            └───────────────────┐
        │                                   │                                │
        ▼                                   ▼                                ▼
┌───────────────────┐          ┌───────────────────┐          ┌───────────────────┐
│   dive-network    │          │ dive-fra-network  │          │ dive-gbr-network  │
│ Project: dive-v3  │          │   Project: fra    │          │   Project: gbr    │
│                   │          │                   │          │                   │
│ • postgres        │          │ • postgres-fra    │          │ • postgres-gbr    │
│ • keycloak        │          │ • keycloak-fra    │          │ • keycloak-gbr    │
│ • mongo           │          │ • mongodb-fra     │          │ • mongodb-gbr     │
│ • redis           │          │ • redis-fra       │          │ • redis-gbr       │
│ • opa             │          │ • opa-fra         │          │ • opa-gbr         │
│ • backend         │          │ • backend-fra     │          │ • backend-gbr     │
│ • frontend        │          │ • frontend-fra    │          │ • frontend-gbr    │
│ • kas             │          │ • kas-fra         │          │ • kas-gbr         │
│ • cloudflared     │          │ • cloudflared-fra │          │ • cloudflared-gbr │
└───────────────────┘          └───────────────────┘          └───────────────────┘
```

---

## 🚀 ONE-LINER REBUILD (CORRECT)

```bash
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3 && \
docker-compose -p shared -f docker-compose.shared.yml down; \
docker-compose down; \
docker-compose -p fra -f docker-compose.fra.yml down; \
docker-compose -p gbr -f docker-compose.gbr.yml down; \
docker stop $(docker ps -q --filter 'name=dive') 2>/dev/null; \
docker rm $(docker ps -aq --filter 'name=dive') 2>/dev/null; \
docker network create dive-v3-shared-network 2>/dev/null; \
docker-compose -p shared -f docker-compose.shared.yml up -d && sleep 10 && \
docker-compose up -d && sleep 60 && \
docker-compose -p fra -f docker-compose.fra.yml up -d && sleep 45 && \
docker-compose -p gbr -f docker-compose.gbr.yml up -d && sleep 45 && \
cd dive25-landing && docker-compose up -d && cd .. && \
echo "=== Projects ===" && docker compose ls -a
```

---

## 🔒 CRITICAL RULES

1. **ALWAYS use `-p <project>` flag** for FRA, GBR, and shared instances
2. **NEVER run compose files without project isolation** (except USA which uses default)
3. **Check isolation** with `docker compose ls -a` - should show 5 separate projects
4. **Each project has its own network** - services cannot see other projects' services
5. **Only exception**: blacklist-redis connects all via external `dive-v3-shared-network`

---

## ⚙️ MANAGEMENT COMMANDS (CORRECT)

### Stop Individual Projects:
```bash
docker-compose -p shared -f docker-compose.shared.yml down  # Shared
docker-compose down                                          # USA
docker-compose -p fra -f docker-compose.fra.yml down        # FRA
docker-compose -p gbr -f docker-compose.gbr.yml down        # GBR
```

### View Logs by Project:
```bash
docker-compose logs -f                                       # USA
docker-compose -p fra -f docker-compose.fra.yml logs -f     # FRA
docker-compose -p gbr -f docker-compose.gbr.yml logs -f     # GBR
```

### Restart Services:
```bash
docker-compose restart backend                               # USA backend
docker-compose -p fra -f docker-compose.fra.yml restart backend-fra  # FRA backend
```

---

## 📝 SCRIPTS THAT DO IT RIGHT

The following scripts CORRECTLY use project isolation:

1. **`scripts/deploy-fra-alongside-usa.sh`** - Lines 252, 262, 293:
```bash
docker-compose -p fra -f docker-compose.fra.yml up -d postgres-fra mongodb-fra redis-fra
docker-compose -p fra -f docker-compose.fra.yml up -d keycloak-fra opa-fra
docker-compose -p fra -f docker-compose.fra.yml up -d kas-fra backend-fra frontend-fra
```

2. **`scripts/deploy-instance.sh`** - Line 547:
```bash
docker-compose -p "$COUNTRY_CODE" -f "$COMPOSE_FILE" up -d
```

---

## 🔍 VERIFICATION CHECKLIST

After rebuild, verify:

- [ ] `docker compose ls -a` shows 5 separate projects
- [ ] Each project has healthy containers
- [ ] USA frontend responds at https://localhost:3000
- [ ] FRA frontend responds at https://localhost:3001
- [ ] GBR frontend responds at https://localhost:3002
- [ ] Cloudflare tunnels are active for all instances
- [ ] Blacklist Redis is accessible from all backends

---

**END OF EMERGENCY REBUILD PROMPT**
