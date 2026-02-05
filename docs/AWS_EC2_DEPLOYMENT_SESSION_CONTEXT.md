# DIVE V3 Hub AWS EC2 Deployment - New Session Context

## Session Objective
Complete the deployment of DIVE V3 Hub to AWS EC2 instance (`18.254.34.87`, ARM64, us-gov-east-1) with proper CI/CD, Docker Buildx, AWS Secrets Manager integration, and TLS certificate management.

## Current Status (as of 2026-02-05 05:45 UTC)

### ✅ Completed
1. **CI/CD Infrastructure**
   - Created `.github/workflows/docker-build.yml` for automated multi-platform Docker image building
   - Images pushed to GitHub Container Registry (GHCR)
   - Smart rebuild logic based on changed files
   - Updated Docker Buildx to v0.19.3 on EC2

2. **AWS Secrets Manager Integration**
   - Created `scripts/dive-modules/configuration/secrets-aws.sh`
   - Updated `scripts/dive-modules/configuration/secrets.sh` for multi-provider support
   - Created migration script `scripts/migrate-secrets-gcp-to-aws.sh`
   - Documentation: `docs/AWS_SECRETS_MANAGER_GUIDE.md`

3. **Dependency Installation on EC2**
   - `yq` v4.52.2 (ARM64) - required for docker-compose service discovery
   - `mkcert` v1.4.4 (ARM64) - for TLS certificate generation
   - `nss-tools` - required for mkcert certificate trust
   - Docker Buildx v0.19.3

4. **TLS Certificate Management**
   - Updated `hub_init()` to generate certificates with ALL Docker service names in SANs:
     - `localhost`, `*.localhost`, `127.0.0.1`
     - `backend`, `keycloak`, `opa`, `mongodb`, `postgres`, `redis`, `kas`, `opal-server`, `frontend`
   - Mkcert root CA copied to `./certs/mkcert/rootCA.pem` for shared access
   - Certificate permissions set to 644 for container access
   - Manual regeneration completed on EC2 with verified SANs

5. **Service Configuration Fixes**
   - **KAS Service**: Upgraded from "stretch" to "core" class
     - Volume mount: `./instances/hub/certs:/opt/app/certs:ro`
     - Healthcheck: Falls back to HTTP if HTTPS fails
   - **Frontend**: 
     - `PORT=3000` explicitly set (overrides `.env.hub`)
     - `CERT_PATH=/opt/app/certs` for certificate loading
   - **Backend**: 
     - `NODE_OPTIONS="--max-old-space-size=4096 --use-openssl-ca"` for mkcert CA trust
   - **Keycloak**: Removed deprecated build-time certificate copying

6. **Bug Fixes**
   - Orchestration schema migration: Filtered `\c orchestration` command, use `docker cp` + `-f`
   - OPA permissions: Fixed key.pem permissions (644)
   - Service discovery: yq installation fixed "0 services started" issue

### 🚧 In Progress
- Backend service restarting with updated NODE_OPTIONS
- Waiting for backend to become healthy (OPA health checks should now pass)

### ❌ Current Blocker
**Environment Variable Loading Error** during `docker-compose up -d backend`:
```
error while interpolating services.keycloak.environment.KEYCLOAK_CLIENT_SECRET: 
required variable KEYCLOAK_CLIENT_SECRET is missing a value
```

**Root Cause**: When running `docker-compose` commands directly (not via `./dive hub deploy`), 
the secrets from `.env.hub` are not loaded into the environment.

**Solution**: Must use `./dive hub deploy` which properly loads secrets, OR manually source `.env.hub`:
```bash
cd ~/DIVE-V3
source .env.hub  # or use: set -a; source .env.hub; set +a
sudo -E docker compose -f docker-compose.hub.yml up -d backend
```

## Deployment Architecture

### EC2 Instance Details
- **IP**: 18.254.34.87
- **Region**: us-gov-east-1
- **Architecture**: ARM64 (Graviton)
- **OS**: Amazon Linux 2023
- **SSH Key**: `~/.ssh/ABeach-SSH-Key.pem`
- **Mode**: Local Development (ALLOW_INSECURE_LOCAL_DEVELOPMENT=true)

### Service Dependency Levels
```
Level 0: postgres, mongodb, redis, opa (all healthy)
Level 1: keycloak, kas (all healthy)
Level 2: backend (currently restarting - health: starting)
Level 3: otel-collector, frontend, opal-server (not started yet)
```

### Current Service Status
```
dive-hub-mongodb     Up, healthy
dive-hub-redis       Up, healthy  
dive-hub-postgres    Up, healthy
dive-hub-opa         Up, healthy
dive-hub-keycloak    Up, healthy (8 min)
dive-hub-kas         Up, healthy (7 min)
dive-hub-backend     Up, health: starting (restarting with NODE_OPTIONS fix)
```

## Critical Files and Configurations

### Certificate Files (Generated on EC2)
```
~/DIVE-V3/instances/hub/certs/
├── certificate.pem (with all Docker service SANs)
├── key.pem (644 permissions)
└── mkcert-rootCA.pem

~/DIVE-V3/certs/mkcert/
└── rootCA.pem (shared mkcert CA)
```

### Environment Configuration
```bash
# .env.hub (on EC2)
PORT=4000  # For backend (frontend overrides to 3000)
MONGO_PASSWORD=<secret>
POSTGRES_PASSWORD=<secret>
REDIS_PASSWORD_USA=<secret>
KC_ADMIN_PASSWORD=<secret>
KEYCLOAK_CLIENT_SECRET=<secret>
AUTH_SECRET=<secret>
```

### Docker Compose Key Settings
```yaml
backend:
  environment:
    NODE_OPTIONS: "--max-old-space-size=4096 --use-openssl-ca"
    NODE_EXTRA_CA_CERTS: /app/certs/ca/rootCA.pem
    PORT: "4000"
  volumes:
    - ./instances/hub/certs:/opt/keycloak/certs:ro
    - ./certs/mkcert:/app/certs/ca:ro

frontend:
  environment:
    PORT: "3000"
    CERT_PATH: /opt/app/certs
  volumes:
    - ./instances/hub/certs:/opt/app/certs:ro
    - ./certs/mkcert:/app/certs/ca:ro

kas:
  labels:
    dive.service.class: "core"  # Changed from "stretch"
  volumes:
    - ./instances/hub/certs:/opt/app/certs:ro
    - ./certs/mkcert:/app/certs/ca:ro
```

## Phased Implementation Plan

### Phase 1: Complete Backend Deployment ⏳ IN PROGRESS
**SMART Goal**: Backend service becomes healthy within 5 minutes, successfully connects to OPA/MongoDB/Keycloak via HTTPS.

**Actions**:
1. ✅ Verify backend container is running
2. ⏳ Monitor backend logs for OPA health check success
3. ⏳ Confirm backend passes Docker healthcheck (curl to https://localhost:4000/api/health)
4. ⏳ Verify no certificate trust errors in logs

**Success Criteria**:
- Backend status shows "healthy" (not "starting")
- Backend logs show: `OPA health check passed` (no certificate errors)
- Backend accessible at `https://localhost:4000/api/health`

**Commands**:
```bash
ssh -i ~/.ssh/ABeach-SSH-Key.pem ec2-user@18.254.34.87
cd ~/DIVE-V3

# Check backend status
sudo docker ps --filter name=dive-hub-backend --format 'table {{.Names}}\t{{.Status}}'

# Monitor logs (should see OPA health check success)
sudo docker logs -f dive-hub-backend 2>&1 | grep -E '(OPA|health|Ready|Error)'

# Test healthcheck endpoint
sudo docker exec dive-hub-backend curl -k https://localhost:4000/api/health
```

**Estimated Time**: 2-5 minutes

---

### Phase 2: Deploy Frontend and Level 3 Services 🔜 NEXT
**SMART Goal**: All Level 3 services (frontend, opal-server, otel-collector) become healthy within 10 minutes.

**Dependencies**: Phase 1 complete (backend healthy)

**Actions**:
1. Continue hub deployment: `sudo -E ./dive hub deploy` (resumes from Phase 3)
2. Monitor Level 3 service startup
3. Verify frontend starts on port 3000 (not 4000)
4. Confirm frontend loads certificates from `/opt/app/certs`

**Success Criteria**:
- Frontend status: "healthy"
- Frontend logs show: `Ready on https://localhost:3000` (not 4000)
- Frontend logs show: `Certificate: /opt/app/certs/certificate.pem`
- OPAL Server status: "healthy" (or acceptable failure if stretch goal)
- OTel Collector status: running

**Commands**:
```bash
# Check frontend
sudo docker logs dive-hub-frontend 2>&1 | grep -E '(Ready|port|Certificate)'

# Verify port binding
sudo netstat -tlnp | grep :3000

# Test frontend healthcheck
curl -k https://localhost:3000/
```

**Estimated Time**: 5-10 minutes

---

### Phase 3: End-to-End Validation ⏭️ QUEUED
**SMART Goal**: Hub deployment completes successfully, all CORE services healthy, accessible via EC2 public IP.

**Dependencies**: Phase 2 complete

**Actions**:
1. Verify deployment completion message
2. Check all service health status
3. Test backend API from external client
4. Verify Keycloak admin console accessible
5. Test frontend UI loads

**Success Criteria**:
- Deployment exits with code 0 (success)
- All CORE services show "healthy" status
- Backend API responds: `curl -k https://18.254.34.87:4000/api/health`
- Keycloak admin accessible: `https://18.254.34.87:8443/admin`
- Frontend loads: `https://18.254.34.87:3000`

**Commands**:
```bash
# On EC2
sudo docker ps --filter name=dive-hub- --format 'table {{.Names}}\t{{.Status}}'

# From local machine
curl -k https://18.254.34.87:4000/api/health
curl -k https://18.254.34.87:8443/realms/dive-v3-broker-usa
curl -k https://18.254.34.87:3000
```

**Estimated Time**: 5 minutes

---

### Phase 4: AWS Secrets Manager Migration 🔄 DEFERRED
**SMART Goal**: Replace local `.env.hub` with AWS Secrets Manager, verify secrets loaded successfully.

**Dependencies**: Phase 3 complete, IAM role configured

**Prerequisites**:
- Attach IAM role to EC2 instance with SecretsManager permissions
- Recommended role policy:
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "secretsmanager:GetSecretValue",
      "secretsmanager:DescribeSecret"
    ],
    "Resource": "arn:aws-us-gov:secretsmanager:us-gov-east-1:*:secret:dive-v3-*"
  }]
}
```

**Actions**:
1. Create secrets in AWS Secrets Manager (us-gov-east-1):
   ```bash
   ./scripts/migrate-secrets-gcp-to-aws.sh usa
   ```
2. Set environment variables:
   ```bash
   export SECRETS_PROVIDER=aws
   export AWS_REGION=us-gov-east-1
   unset ALLOW_INSECURE_LOCAL_DEVELOPMENT
   ```
3. Redeploy: `sudo -E ./dive hub deploy`

**Success Criteria**:
- Secrets loaded from AWS (log shows: "✅ Secrets loaded from AWS Secrets Manager")
- No "INSECURE LOCAL DEVELOPMENT MODE" warnings
- All services start successfully with AWS secrets

**Rollback Plan**: `export ALLOW_INSECURE_LOCAL_DEVELOPMENT=true` to revert to local .env.hub

**Estimated Time**: 15-20 minutes

---

### Phase 5: CI/CD Validation & Optimization 🔄 DEFERRED
**SMART Goal**: GitHub Actions successfully builds all 5 Docker images, deployment uses pre-built images from GHCR.

**Dependencies**: Phase 3 complete

**Actions**:
1. Trigger GitHub Actions workflow (push to main or manual trigger)
2. Verify all images build successfully:
   - `ghcr.io/albeach/dive-v3/backend:latest`
   - `ghcr.io/albeach/dive-v3/frontend:latest`
   - `ghcr.io/albeach/dive-v3/keycloak:latest`
   - `ghcr.io/albeach/dive-v3/kas:latest`
   - `ghcr.io/albeach/dive-v3/opal-server:latest`
3. Update docker-compose to pull from GHCR instead of building locally
4. Redeploy with pre-built images

**Success Criteria**:
- GitHub Actions workflow completes in < 20 minutes
- All 5 images published to GHCR with `latest` tag
- Deployment pulls images instead of building (saves 10-15 minutes)
- Image sizes optimized (multi-stage builds)

**Estimated Time**: 30-45 minutes (first run), 10-15 min (subsequent)

---

## Key Learnings & Best Practices

### 1. EC2 ARM64 Dependencies
**Always install before deployment**:
```bash
# Package manager tools
sudo yum install -y nss-tools

# yq (ARM64 - required for service discovery)
sudo wget -qO /usr/local/bin/yq https://github.com/mikefarah/yq/releases/latest/download/yq_linux_arm64
sudo chmod +x /usr/local/bin/yq

# mkcert (ARM64 - required for TLS certificates)
wget https://github.com/FiloSottile/mkcert/releases/latest/download/mkcert-v1.4.4-linux-arm64
sudo mv mkcert-v1.4.4-linux-arm64 /usr/local/bin/mkcert
sudo chmod +x /usr/local/bin/mkcert
mkcert -install
```

### 2. TLS Certificate Generation
**Always include all Docker service names**:
```bash
mkcert -cert-file certificate.pem -key-file key.pem \
    localhost '*.localhost' 127.0.0.1 \
    backend keycloak opa mongodb postgres redis kas opal-server frontend
```

### 3. Node.js Certificate Trust (Node 24+)
**Always use both flags**:
```yaml
environment:
  NODE_OPTIONS: "--use-openssl-ca"  # Forces loading of extra CAs
  NODE_EXTRA_CA_CERTS: /app/certs/ca/rootCA.pem  # Points to mkcert CA
```

### 4. Docker Compose Environment Loading
**Never run docker-compose directly** - always use `./dive hub deploy`:
```bash
# ❌ WRONG - missing secrets
sudo docker-compose up -d

# ✅ CORRECT - loads secrets properly  
sudo -E ./dive hub deploy
```

### 5. Service Classification
**Mark critical services as "core"**, not "stretch":
- KAS is CORE (policy-bound decryption is critical)
- OPAL Server can be "stretch" (optional policy distribution)

## Troubleshooting Reference

### Backend Won't Start
1. **Check OPA connectivity**:
   ```bash
   sudo docker exec dive-hub-backend curl -k https://opa:8181/health
   ```
2. **Verify certificate SANs**:
   ```bash
   openssl x509 -in ~/DIVE-V3/instances/hub/certs/certificate.pem -noout -text | grep -A10 'Alternative'
   ```
3. **Check NODE_OPTIONS**:
   ```bash
   sudo docker exec dive-hub-backend env | grep NODE
   ```

### Frontend Wrong Port
1. **Check PORT environment**:
   ```bash
   sudo docker exec dive-hub-frontend env | grep PORT
   ```
   Should be `PORT=3000`, not 4000

2. **Check logs for port message**:
   ```bash
   sudo docker logs dive-hub-frontend | grep Ready
   ```
   Should show `https://localhost:3000`, not 4000

### Service Discovery Returns 0 Services
1. **Verify yq is installed**:
   ```bash
   yq --version
   ```
2. **Check yq can parse compose file**:
   ```bash
   yq eval '.services | keys' docker-compose.hub.yml
   ```

### Certificate Trust Issues
1. **Verify mkcert CA exists**:
   ```bash
   ls -la ~/DIVE-V3/certs/mkcert/rootCA.pem
   ```
2. **Check container can access CA**:
   ```bash
   sudo docker exec <service> ls -la /app/certs/ca/
   ```
3. **Verify NODE_EXTRA_CA_CERTS is set**:
   ```bash
   sudo docker exec <service> env | grep NODE_EXTRA_CA_CERTS
   ```

## Next Immediate Actions

1. **Monitor backend restart** (5 min):
   ```bash
   ssh -i ~/.ssh/ABeach-SSH-Key.pem ec2-user@18.254.34.87 "
   sudo docker logs -f dive-hub-backend 2>&1 | grep -E '(OPA|health|Ready)'
   "
   ```

2. **If backend restart fails**, properly load environment and restart:
   ```bash
   cd ~/DIVE-V3
   sudo -E ./dive nuke all --confirm --deep
   export ALLOW_INSECURE_LOCAL_DEVELOPMENT=true
   sudo -E ./dive hub deploy
   ```

3. **Once backend healthy**, verify full deployment:
   ```bash
   sudo docker ps --filter name=dive-hub- --format 'table {{.Names}}\t{{.Status}}'
   ```

4. **Test external accessibility**:
   ```bash
   curl -k https://18.254.34.87:4000/api/health
   curl -k https://18.254.34.87:3000
   ```

## Recommended Production Enhancements

### 1. AWS Secrets Manager (Priority: HIGH)
- Eliminate `.env.hub` file
- Use IAM role authentication (no access keys)
- Enable secret rotation
- Audit trail via CloudTrail

### 2. TLS Certificates (Priority: HIGH)
- Replace mkcert with Let's Encrypt for production
- Use AWS Certificate Manager for load balancer
- Implement cert rotation automation

### 3. Monitoring & Alerting (Priority: MEDIUM)
- Enable CloudWatch Container Insights
- Set up alarms for service health
- Configure log aggregation to CloudWatch Logs
- Implement Grafana dashboards (already in stack)

### 4. Security Hardening (Priority: HIGH)
- Remove `ALLOW_INSECURE_LOCAL_DEVELOPMENT` flag
- Enable security groups (restrict ports)
- Implement WAF rules
- Enable GuardDuty for threat detection

### 5. High Availability (Priority: MEDIUM)
- Deploy across multiple AZs
- Use RDS for PostgreSQL
- Use DocumentDB for MongoDB
- Implement ElastiCache for Redis

## Contact & Documentation

- **Project**: DIVE V3 (Defense Identity Virtualization Environment)
- **Repository**: https://github.com/albeach/DIVE-V3
- **Documentation**: `./docs/` directory
- **AWS Region**: us-gov-east-1
- **Deployment Method**: `./dive` CLI tool

---

**Session End Timestamp**: 2026-02-05 05:45 UTC  
**Next Session Goal**: Complete Phase 1 (Backend Healthy), then proceed to Phase 2 (Frontend Deployment)
