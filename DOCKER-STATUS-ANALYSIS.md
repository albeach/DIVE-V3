# DIVE V3 Docker Container Status Analysis
**Date:** $(date +%Y-%m-%d\ %H:%M:%S)
**Analyst:** AI Assistant

## Executive Summary

The DIVE V3 deployment has **3 separate instance stacks** (USA, FRA, GBR) plus **1 shared infrastructure stack**, but currently only **1 instance (USA)** is running. The FRA and GBR instances are **not started**, and the shared infrastructure stack is **not running**.

## Current Status

### ✅ Running (USA Instance - Main Stack)
- **Project:** `dive-v3` (from `docker-compose.yml`)
- **Containers:** 11 containers running
  - ✅ `dive-v3-postgres` (healthy)
  - ✅ `dive-v3-mongo` (healthy)
  - ✅ `dive-v3-redis` (healthy)
  - ✅ `dive-v3-keycloak` (healthy)
  - ✅ `dive-v3-opa` (healthy)
  - ✅ `dive-v3-authzforce` (healthy)
  - ✅ `dive-v3-backend` (healthy)
  - ⚠️ `dive-v3-frontend` (**UNHEALTHY** - returning 500 errors)
  - ✅ `dive-v3-kas` (healthy)
  - ✅ `dive-v3-tunnel` (healthy - USA cloudflared tunnel)

### ❌ Not Running (FRA Instance)
- **Expected Project:** `fra` (from `docker-compose.fra.yml`)
- **Expected Containers:** None running
  - ❌ `dive-v3-postgres-fra`
  - ❌ `dive-v3-mongodb-fra`
  - ❌ `dive-v3-redis-fra`
  - ❌ `dive-v3-keycloak-fra`
  - ❌ `dive-v3-opa-fra`
  - ❌ `dive-v3-backend-fra`
  - ❌ `dive-v3-frontend-fra`
  - ❌ `dive-v3-kas-fra`
  - ❌ `dive-v3-tunnel-fra` (cloudflared tunnel)

### ❌ Not Running (GBR Instance)
- **Expected Project:** `gbr` (from `docker-compose.gbr.yml`)
- **Expected Containers:** None running
  - ❌ `dive-v3-postgres-gbr`
  - ❌ `dive-v3-mongodb-gbr`
  - ❌ `dive-v3-redis-gbr`
  - ❌ `dive-v3-keycloak-gbr`
  - ❌ `dive-v3-opa-gbr`
  - ❌ `dive-v3-backend-gbr`
  - ❌ `dive-v3-frontend-gbr`
  - ❌ `dive-v3-kas-gbr`
  - ❌ `dive-v3-tunnel-gbr` (cloudflared tunnel)

### ❌ Not Running (Shared Infrastructure)
- **Expected Project:** `shared` (from `docker-compose.shared.yml`)
- **Expected Containers:** None running
  - ❌ `dive-v3-blacklist-redis` (centralized token blacklist)
  - ❌ `dive-v3-landing` (DIVE25.COM landing page)
  - ❌ `dive-v3-prometheus` (metrics collection)
  - ❌ `dive-v3-grafana` (visualization dashboards)
  - ❌ `dive-v3-alertmanager` (alert routing)

## Root Cause Analysis

### Primary Issue: Instance Stacks Not Started
The system is configured with **separate Docker Compose files** for each instance:
- `docker-compose.yml` → USA instance (currently running)
- `docker-compose.fra.yml` → FRA instance (**NOT started**)
- `docker-compose.gbr.yml` → GBR instance (**NOT started**)
- `docker-compose.shared.yml` → Shared infrastructure (**NOT started**)

**Root Cause:** Only the main `docker-compose.yml` was started. The instance-specific stacks require separate `docker compose` commands with project names.

### Secondary Issue: Frontend 500 Errors
The USA frontend container (`dive-v3-frontend`) is returning **500 Internal Server Error** on all requests. This indicates a runtime error in the Next.js application, likely:
- Missing environment variables
- Database connection issues
- Authentication configuration problems
- Build/compilation errors

### Network Configuration
Multiple Docker networks exist but are orphaned from previous runs:
- `dive-v3_dive-network` (USA - active)
- `dive-v3_dive-fra-network` (FRA - orphaned)
- `dive-v3_dive-gbr-network` (GBR - orphaned)
- `dive-v3-shared-network` (shared - exists but no containers)

## Cloudflare Tunnel Status

### ✅ USA Tunnel
- **Container:** `dive-v3-tunnel`
- **Status:** Healthy
- **Config:** `cloudflared/config.yml`
- **Tunnel ID:** `f8e6c558-847b-4952-b8b2-27f98a85e36c`
- **Routes:**
  - `usa-app.dive25.com` → `frontend:3000`
  - `usa-api.dive25.com` → `backend:4000`
  - `usa-idp.dive25.com` → `keycloak:8443`
  - `usa-kas.dive25.com` → `kas:8080`

### ❌ FRA Tunnel
- **Container:** Not running
- **Config:** `cloudflared/config-fra.yml` (exists)
- **Tunnel ID:** `e07574bd-6f32-478b-8f71-42fc3d4073f7`
- **Routes:** (would route to `*-fra` containers)

### ❌ GBR Tunnel
- **Container:** Not running
- **Config:** `cloudflared/config-gbr.yml` (exists)
- **Tunnel ID:** `375d2bed-2002-4604-9fa6-22ca251ac957`
- **Routes:** (would route to `*-gbr` containers)

## Required Actions

### 1. Start Shared Infrastructure Stack
```bash
# Option A: Using manage-instances.sh script
./scripts/manage-instances.sh start shared

# Option B: Direct docker compose
docker compose -p shared -f docker-compose.shared.yml up -d
```

**Prerequisites:**
- GCP secrets must be loaded: `source ./scripts/sync-gcp-secrets.sh`
- Network must exist: `docker network create dive-v3-shared-network 2>/dev/null || true`

### 2. Start FRA Instance Stack
```bash
# Option A: Using manage-instances.sh script
./scripts/manage-instances.sh start fra

# Option B: Direct docker compose
docker compose -p fra -f docker-compose.fra.yml up -d

# Option C: Using start-instance.sh script
./scripts/start-instance.sh fra
```

**Prerequisites:**
- GCP secrets for FRA: `source ./scripts/sync-gcp-secrets.sh fra`
- Shared stack should be running first (for blacklist-redis)

### 3. Start GBR Instance Stack
```bash
# Option A: Using manage-instances.sh script
./scripts/manage-instances.sh start gbr

# Option B: Direct docker compose
docker compose -p gbr -f docker-compose.gbr.yml up -d

# Option C: Using start-instance.sh script
./scripts/start-instance.sh gbr
```

**Prerequisites:**
- GCP secrets for GBR: `source ./scripts/sync-gcp-secrets.sh gbr`
- Shared stack should be running first (for blacklist-redis)

### 4. Fix Frontend 500 Error (USA Instance)
```bash
# Check detailed logs
docker logs dive-v3-frontend --tail 200

# Check environment variables
docker exec dive-v3-frontend env | grep -E "(NEXT|KEYCLOAK|AUTH|DATABASE)"

# Restart frontend
docker restart dive-v3-frontend

# Or rebuild if needed
docker compose -p dive-v3 -f docker-compose.yml up -d --build frontend
```

### 5. Verify All Tunnels
```bash
# Check tunnel status
docker ps --filter "name=tunnel"

# Check tunnel metrics
curl http://localhost:9126/metrics  # USA
curl http://localhost:9127/metrics  # FRA (when running)
curl http://localhost:9128/metrics  # GBR (when running)

# Test tunnel connectivity
curl -I https://usa-app.dive25.com
curl -I https://fra-app.dive25.com  # Should work after FRA starts
curl -I https://gbr-app.dive25.com  # Should work after GBR starts
```

## Quick Start All Stacks

```bash
# 1. Load GCP secrets
source ./scripts/sync-gcp-secrets.sh

# 2. Start shared infrastructure
./scripts/manage-instances.sh start shared

# 3. Wait for shared services
sleep 10

# 4. Start all instances
./scripts/manage-instances.sh start all

# 5. Check status
./scripts/manage-instances.sh status
```

## Expected Final State

After all stacks are started, you should have:

### Containers by Instance
- **USA:** 11 containers (postgres, mongo, redis, keycloak, opa, backend, frontend, kas, tunnel, authzforce)
- **FRA:** 9 containers (postgres-fra, mongodb-fra, redis-fra, keycloak-fra, opa-fra, backend-fra, frontend-fra, kas-fra, tunnel-fra)
- **GBR:** 9 containers (postgres-gbr, mongodb-gbr, redis-gbr, keycloak-gbr, opa-gbr, backend-gbr, frontend-gbr, kas-gbr, tunnel-gbr)
- **Shared:** 5 containers (blacklist-redis, landing, prometheus, grafana, alertmanager)

### Total: ~34 containers across 4 stacks

### Cloudflare Tunnels
- ✅ USA tunnel routing to `usa-*.dive25.com`
- ✅ FRA tunnel routing to `fra-*.dive25.com`
- ✅ GBR tunnel routing to `gbr-*.dive25.com`

## Notes

1. **Port Conflicts:** Each instance uses different ports to avoid conflicts:
   - USA: 3000, 4000, 5433, 27017, 6379, 8181, 8080, 8443, 8081
   - FRA: 3001, 4001, 5434, 27018, 6380, 8182, 8083, 8444, 8082
   - GBR: 3002, 4002, 5435, 27019, 6381, 8283, 8092, 8445, 8084

2. **GCP Secrets:** All instances require GCP Secret Manager secrets. Ensure:
   - `USE_GCP_SECRETS=true`
   - `gcloud auth application-default login`
   - Secrets exist in project `dive25`

3. **Network Isolation:** Each instance uses its own Docker network, but GBR connects to shared network for blacklist-redis.

4. **Health Checks:** All services have health checks. Monitor with:
   ```bash
   docker ps --format "table {{.Names}}\t{{.Status}}"
   ```

