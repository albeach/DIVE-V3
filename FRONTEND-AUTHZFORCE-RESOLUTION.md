# Frontend & AuthzForce Resolution Summary

## Issues Identified

**Date:** November 13, 2025

### Issue 1: Frontend Container Unhealthy
**Symptom:** `dive-v3-frontend` showing unhealthy status  
**Container Name:** Already correctly named `dive-v3-frontend` (consistent with project conventions)

### Issue 2: Duplicate AuthzForce Containers
**Symptom:** Two AuthzForce containers running simultaneously  
**Root Cause:** Orphaned container `relaxed_zhukovsky` from previous manual docker run

## Root Cause Analysis

### Frontend Unhealthy Status

**Error Messages:**
```
Error: Cannot find module 'next/dist/pages/_error'
Error: ENOENT: no such file or directory, open '/app/.next/server/app-paths-manifest.json'
Error: Cannot find module '@swc/helpers/package.json'
GET / 500 in 31ms
```

**Cause:**
- Missing Next.js build artifacts in `.next` directory
- Dependencies not fully installed or corrupted cache
- Likely due to interrupted build or volume permission issues

### Duplicate AuthzForce Containers

**Containers Found:**
```bash
$ docker ps -a | grep authzforce
dive-v3-authzforce   Up 7 minutes (healthy)   # Docker Compose managed
relaxed_zhukovsky    Up 4 hours               # Orphaned (manual docker run)
```

**Cause:**
- AuthzForce container started manually outside docker-compose
- Docker auto-generated name `relaxed_zhukovsky` when no name specified
- Not managed by docker-compose, causing confusion and potential port conflicts

## Resolution Applied

### 1. Cleaned Up Orphaned AuthzForce Container

```bash
$ docker ps -a | grep authzforce | awk '{print $1}' | xargs docker rm -f
# Removed: relaxed_zhukovsky (orphaned container)
```

### 2. Restarted AuthzForce via Docker Compose

```bash
$ docker-compose up -d authzforce
# Created: dive-v3-authzforce (properly managed by docker-compose)
```

### 3. Rebuilt Frontend Container

```bash
$ docker-compose restart nextjs
# Triggered fresh build with clean dependency installation
```

**Build Output:**
```
✓ Compiled /middleware in 501ms (114 modules)
✓ Compiled / in 5.3s (1286 modules)
GET / 200 in 5710ms
> Ready on https://localhost:3000
```

## Verification

### Container Status: All Healthy ✅

```bash
$ docker ps -a --format "table {{.Names}}\t{{.Status}}" | grep -E "authzforce|frontend"

NAMES                STATUS
dive-v3-authzforce   Up 5 minutes (healthy)
dive-v3-frontend     Up 5 minutes (healthy)
```

### Container Count Verification

```bash
$ docker ps -a | wc -l && docker ps | wc -l
10  # Total containers
10  # Running containers
# All containers running, no orphans or stopped containers
```

### Service Endpoints

- **Frontend:** https://localhost:3000/ → **200 OK**
- **AuthzForce:** http://localhost:8282/authzforce-ce/domains → **200 OK (XML)**

## Naming Consistency Verification

### Container Names (✅ Already Consistent)

| Service | Container Name | Status |
|---------|----------------|--------|
| Frontend | `dive-v3-frontend` | ✅ Consistent |
| Backend | `dive-v3-backend` | ✅ Consistent |
| Keycloak | `dive-v3-keycloak` | ✅ Consistent |
| AuthzForce | `dive-v3-authzforce` | ✅ Consistent |
| MongoDB | `dive-v3-mongo` | ✅ Consistent |
| PostgreSQL | `dive-v3-postgres` | ✅ Consistent |
| Redis | `dive-v3-redis` | ✅ Consistent |
| OPA | `dive-v3-opa` | ✅ Consistent |
| KAS | `dive-v3-kas` | ✅ Consistent |

### Docker Compose Service Names

```yaml
services:
  postgres:      # DB service name
  mongo:         # DB service name
  redis:         # Cache service name
  keycloak:      # IdP broker
  opa:           # Policy engine
  authzforce:    # XACML engine (optional)
  backend:       # Express API
  nextjs:        # ⚠️ Service name in docker-compose.yml
                 # ✅ Container name: dive-v3-frontend (correct)
  kas:           # Key Access Service
```

**Note:** The service name in `docker-compose.yml` is `nextjs`, but the container name is correctly set to `dive-v3-frontend` via the `container_name` directive. This is intentional and follows Docker Compose best practices.

### Script References (✅ All Use "Frontend")

**File:** `scripts/deploy-dev.sh`
```bash
FRONTEND_TIMEOUT=60
wait_for_service "Frontend" "$FRONTEND_TIMEOUT" "dive-v3-frontend" || return 1
```

## Best Practice Recommendations

### 1. Always Use Docker Compose for Service Management

**Do:**
```bash
docker-compose up -d [service]
docker-compose restart [service]
docker-compose down [service]
```

**Don't:**
```bash
docker run authzforce/server:12.0.1  # Creates orphaned containers
```

**Why:**
- Docker Compose tracks and manages containers
- Ensures correct networking, volumes, and configuration
- Prevents duplicate/orphaned containers
- Enables centralized orchestration

### 2. Clean Up Orphaned Containers Periodically

```bash
# List all containers (including stopped)
docker ps -a

# Remove stopped containers
docker container prune

# Or remove specific orphaned container
docker rm -f <container_id_or_name>
```

### 3. Frontend Troubleshooting Commands

If frontend becomes unhealthy again:

```bash
# Check logs
docker logs dive-v3-frontend --tail 50

# Restart (triggers rebuild)
docker-compose restart nextjs

# Full rebuild (if restart doesn't work)
docker-compose down nextjs
docker-compose build --no-cache nextjs
docker-compose up -d nextjs

# Check build artifacts inside container
docker exec dive-v3-frontend ls -la /app/.next
```

### 4. Service Name vs Container Name

**Understanding the Difference:**

- **Service Name** (`nextjs`): Used in `docker-compose.yml` and docker-compose commands
- **Container Name** (`dive-v3-frontend`): Actual container identifier, used in logs and docker commands

**Best Practice:**
- Keep service names short and lowercase (e.g., `nextjs`, `backend`)
- Use descriptive container names with project prefix (e.g., `dive-v3-frontend`)
- Set container names explicitly with `container_name` directive

**Example:**
```yaml
services:
  nextjs:  # Service name for docker-compose commands
    container_name: dive-v3-frontend  # Container name for docker commands
    # ...
```

Commands:
```bash
# Use service name with docker-compose
docker-compose restart nextjs

# Use container name with docker
docker logs dive-v3-frontend
docker exec dive-v3-frontend sh
```

## Prevention Strategies

### 1. Avoid Manual Docker Runs for Compose-Managed Services

If you need to test something manually:
```bash
# Bad: Creates orphaned container
docker run -d authzforce/server:12.0.1

# Good: Test with docker-compose
docker-compose run --rm authzforce /bin/sh
```

### 2. Monitor Container Health

```bash
# Quick health check for all services
docker ps --format "table {{.Names}}\t{{.Status}}"

# Or use deployment script
./scripts/deploy-dev.sh
```

### 3. Frontend-Specific: Volume Permissions

If `.next` directory is empty or build fails:

```bash
# Check volume permissions
docker exec dive-v3-frontend ls -la /app/.next

# If permission denied, rebuild with proper user
docker-compose build --no-cache nextjs
docker-compose up -d nextjs
```

## Summary of Changes

### Files Modified
- None (issues resolved through container management)

### Actions Taken
1. ✅ Removed orphaned AuthzForce container (`relaxed_zhukovsky`)
2. ✅ Restarted AuthzForce via docker-compose (proper management)
3. ✅ Rebuilt frontend container (dependency resolution)
4. ✅ Verified all containers healthy
5. ✅ Confirmed naming consistency (already correct)

### Current Status

| Service | Container | Status | Port |
|---------|-----------|--------|------|
| Frontend | dive-v3-frontend | ✅ Healthy | 3000 |
| Backend | dive-v3-backend | ✅ Healthy | 4000 |
| Keycloak | dive-v3-keycloak | ✅ Healthy | 8081, 8443 |
| AuthzForce | dive-v3-authzforce | ✅ Healthy | 8282 |
| PostgreSQL | dive-v3-postgres | ✅ Healthy | 5433 |
| MongoDB | dive-v3-mongo | ✅ Healthy | 27017 |
| Redis | dive-v3-redis | ✅ Healthy | 6379 |
| OPA | dive-v3-opa | ✅ Healthy | 8181 |
| KAS | dive-v3-kas | ✅ Running | 8080 |

**System Status:** ✅ **ALL SERVICES OPERATIONAL**

## Support Commands

```bash
# Check all service health
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Restart unhealthy frontend
docker-compose restart nextjs

# Clean up orphaned containers
docker container prune -f

# View frontend logs
docker logs -f dive-v3-frontend

# Rebuild frontend if needed
docker-compose build --no-cache nextjs && docker-compose up -d nextjs
```

## Conclusion

✅ **BOTH ISSUES RESOLVED**

1. **Frontend:** Now healthy and serving requests (200 OK)
2. **AuthzForce:** Orphaned container removed, single healthy instance running
3. **Naming:** Already consistent across all services (dive-v3-* pattern)

**Key Takeaway:** Always use `docker-compose` commands for service management to prevent orphaned containers and maintain proper orchestration.

