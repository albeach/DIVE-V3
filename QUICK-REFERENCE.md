# DIVE V3 - Quick Reference: Service Management

## ✅ Current System Status

All 9 services operational:

| Service | Container | Status | Port | Critical? |
|---------|-----------|--------|------|-----------|
| Frontend | `dive-v3-frontend` | ✅ Healthy | 3000 | Yes |
| Backend | `dive-v3-backend` | ✅ Healthy | 4000 | Yes |
| Keycloak | `dive-v3-keycloak` | ✅ Healthy | 8081, 8443 | Yes |
| PostgreSQL | `dive-v3-postgres` | ✅ Healthy | 5433 | Yes |
| MongoDB | `dive-v3-mongo` | ✅ Healthy | 27017 | Yes |
| Redis | `dive-v3-redis` | ✅ Healthy | 6379 | Yes |
| OPA | `dive-v3-opa` | ✅ Healthy | 8181 | Yes |
| AuthzForce | `dive-v3-authzforce` | ✅ Healthy | 8282 | Optional* |
| KAS | `dive-v3-kas` | ✅ Running | 8080 | Optional |

\* **AuthzForce:** Educational only (Policies Lab XACML comparison). Not used in production authorization (OPA handles that).

---

## 🔑 Key Naming Convention

**Pattern:** `dive-v3-{service}`

- Frontend: `dive-v3-frontend` (docker-compose service: `nextjs`)
- Backend: `dive-v3-backend` (docker-compose service: `backend`)
- All others follow same pattern

**Why different service names?**
- Docker Compose service names: Short, semantic (e.g., `nextjs`, `postgres`)
- Container names: Explicit project prefix (e.g., `dive-v3-frontend`)
- **Best practice:** Use service names with `docker-compose`, container names with `docker`

---

## 📋 Common Commands

### Service Management
```bash
# Start all services
docker-compose up -d

# Restart specific service (use docker-compose service name)
docker-compose restart nextjs      # Frontend
docker-compose restart backend
docker-compose restart keycloak

# Stop service
docker-compose stop nextjs

# View logs (use container name)
docker logs -f dive-v3-frontend
docker logs dive-v3-backend --tail 50
```

### Health Checks
```bash
# All services status
docker ps --format "table {{.Names}}\t{{.Status}}"

# Check specific service
curl http://localhost:4000/health          # Backend
curl https://localhost:3000/               # Frontend (SSL)
curl http://localhost:8282/authzforce-ce/domains  # AuthzForce
```

### Troubleshooting
```bash
# Restart unhealthy frontend
docker-compose restart nextjs

# Full frontend rebuild
docker-compose down nextjs
docker-compose build --no-cache nextjs
docker-compose up -d nextjs

# Check build artifacts
docker exec dive-v3-frontend ls -la /app/.next

# Clean orphaned containers
docker container prune -f

# View detailed logs
docker logs dive-v3-frontend --tail 100
```

---

## ⚠️ Common Issues

### Issue: Frontend Unhealthy
**Symptom:** `dive-v3-frontend` shows unhealthy status  
**Solution:**
```bash
docker-compose restart nextjs
# Wait 60s for rebuild
docker logs dive-v3-frontend --tail 30
```

### Issue: Duplicate Containers
**Symptom:** Multiple containers for same service  
**Cause:** Manual `docker run` commands outside docker-compose  
**Solution:**
```bash
# Remove orphaned containers
docker ps -a | grep [service_name]
docker rm -f [container_id]

# Restart via docker-compose
docker-compose up -d [service]
```

### Issue: Port Conflicts
**Symptom:** "port already allocated" error  
**Solution:**
```bash
# Find process using port
sudo lsof -i :3000
sudo netstat -tulpn | grep 3000

# Stop conflicting service
docker-compose down
# Or kill process if not Docker
sudo kill [pid]
```

---

## 🎯 Best Practices

1. **Always use docker-compose** for service management
   - ✅ `docker-compose restart nextjs`
   - ❌ `docker run authzforce/server`

2. **Use service names** with docker-compose commands
   - `docker-compose restart nextjs` (not `dive-v3-frontend`)

3. **Use container names** with docker commands
   - `docker logs dive-v3-frontend` (not `nextjs`)

4. **Monitor health regularly**
   ```bash
   docker ps --format "table {{.Names}}\t{{.Status}}"
   ```

5. **Clean up periodically**
   ```bash
   docker container prune -f  # Remove stopped containers
   docker volume prune -f     # Remove unused volumes
   ```

---

## 📦 Service Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    DIVE V3 Stack                         │
├─────────────────────────────────────────────────────────┤
│  Browser (External)                                      │
│  ↓ Cloudflare Tunnel                                     │
│  ├─ dev-app.dive25.com → Frontend (dive-v3-frontend)    │
│  ├─ dev-api.dive25.com → Backend (dive-v3-backend)      │
│  └─ dev-auth.dive25.com → Keycloak (dive-v3-keycloak)   │
│                                                          │
│  Docker Internal Network (dive-network)                  │
│  ├─ Frontend → Backend (https://backend:4000)            │
│  ├─ Frontend → Keycloak (https://keycloak:8443)         │
│  ├─ Backend → OPA (http://opa:8181)                     │
│  ├─ Backend → MongoDB (mongodb://mongo:27017)           │
│  ├─ Backend → Redis (redis://redis:6379)                │
│  ├─ Backend → AuthzForce (http://authzforce:8080)       │
│  └─ Keycloak → PostgreSQL (postgres:5432)               │
└─────────────────────────────────────────────────────────┘
```

---

## 🔍 Quick Diagnostics

```bash
# Health check all services
./scripts/deploy-dev.sh

# Check frontend specifically
curl -k https://localhost:3000/ && echo "✅ Frontend OK"

# Check backend
curl https://localhost:4000/health && echo "✅ Backend OK"

# Check AuthzForce
curl http://localhost:8282/authzforce-ce/domains && echo "✅ AuthzForce OK"

# View all logs
docker-compose logs --tail=20

# View specific service logs
docker-compose logs -f nextjs
```

---

## 📞 Support

**Deployment Issues:** See `FRONTEND-AUTHZFORCE-RESOLUTION.md`  
**AuthzForce Config:** See `AUTHZFORCE-RESOLUTION-SUMMARY.md`  
**Full Deployment:** Run `./scripts/deploy-dev.sh`

---

**Last Updated:** November 13, 2025  
**System Status:** ✅ All Services Operational

