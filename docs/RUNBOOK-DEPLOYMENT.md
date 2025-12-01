# DIVE V3 Deployment Runbook

**Document Version:** 1.0.0  
**Last Updated:** 2025-12-01  
**Audience:** Operations Team, DevOps Engineers  
**Classification:** UNCLASSIFIED

---

## Table of Contents

1. [Quick Reference](#quick-reference)
2. [Pre-Deployment Checklist](#pre-deployment-checklist)
3. [Deployment Procedures](#deployment-procedures)
4. [Rollback Procedures](#rollback-procedures)
5. [Health Verification](#health-verification)
6. [Troubleshooting](#troubleshooting)
7. [Emergency Contacts](#emergency-contacts)

---

## Quick Reference

### Instance URLs

| Instance | Frontend | Backend | Keycloak |
|----------|----------|---------|----------|
| 🇺🇸 USA | https://usa-app.dive25.com | https://usa-api.dive25.com | https://usa-idp.dive25.com |
| 🇫🇷 FRA | https://fra-app.dive25.com | https://fra-api.dive25.com | https://fra-idp.dive25.com |
| 🇬🇧 GBR | https://gbr-app.dive25.com | https://gbr-api.dive25.com | https://gbr-idp.dive25.com |
| 🇩🇪 DEU | https://deu-app.prosecurity.biz | https://deu-api.prosecurity.biz | https://deu-idp.prosecurity.biz |

### Key Commands

```bash
# Load secrets
source ./scripts/sync-gcp-secrets.sh [instance]

# Start instance
docker compose -p [instance] -f docker-compose.[instance].yml up -d

# Health check
./scripts/health-check-all.sh --instance [instance]

# Apply Terraform
cd terraform/instances && terraform workspace select [instance] && terraform apply -var-file=[instance].tfvars
```

### Key Files

| File | Purpose |
|------|---------|
| `config/federation-registry.json` | Single Source of Truth |
| `docker-compose.yml` | USA instance |
| `docker-compose.{fra,gbr,deu}.yml` | Other instances |
| `terraform/instances/*.tfvars` | Instance Terraform configs |

---

## Pre-Deployment Checklist

### Before Any Deployment

- [ ] **Notify stakeholders** of planned maintenance window
- [ ] **Check current health** of all instances: `./scripts/health-check-all.sh`
- [ ] **Verify GCP authentication**: `gcloud auth print-access-token`
- [ ] **Create backup** (if database changes): See Backup Procedures
- [ ] **Review changes** in the deployment (commits, PRs)
- [ ] **Test locally** if this is a code change

### Environment Validation

```bash
# Verify GCP secrets access
gcloud secrets list --project=dive25 --filter="name:dive-v3" | wc -l
# Expected: ~50 secrets

# Verify Docker
docker --version && docker compose version

# Verify Terraform
terraform version
# Expected: >= 1.13.4

# Check disk space
df -h .
# Minimum: 10GB free
```

---

## Deployment Procedures

### 1. Standard Deployment (USA Local)

**Use Case:** Deploy code/config changes to USA instance

```bash
# 1. Navigate to project root
cd /path/to/DIVE-V3

# 2. Pull latest changes
git pull origin main

# 3. Load secrets from GCP
source ./scripts/sync-gcp-secrets.sh usa

# 4. Rebuild containers (if code changed)
docker compose -p usa build --no-cache frontend backend

# 5. Deploy with zero-downtime (rolling restart)
docker compose -p usa up -d --force-recreate

# 6. Wait for services to stabilize (60s)
sleep 60

# 7. Verify health
./scripts/health-check-all.sh --instance usa

# 8. Apply Terraform changes (if Keycloak config changed)
cd terraform/instances
terraform workspace select usa
export TF_VAR_keycloak_admin_password=$KEYCLOAK_ADMIN_PASSWORD_USA
terraform apply -var-file=usa.tfvars
```

### 2. Multi-Instance Deployment (FRA, GBR)

**Use Case:** Deploy to France and UK instances

```bash
# Deploy FRA
source ./scripts/sync-gcp-secrets.sh fra
docker compose -p fra -f docker-compose.fra.yml up -d --force-recreate
sleep 60
./scripts/health-check-all.sh --instance fra

# Deploy GBR  
source ./scripts/sync-gcp-secrets.sh gbr
docker compose -p gbr -f docker-compose.gbr.yml up -d --force-recreate
sleep 60
./scripts/health-check-all.sh --instance gbr
```

### 3. Remote Deployment (DEU)

**Use Case:** Deploy to Germany remote instance

```bash
# Full deployment with all syncs
./scripts/remote/deploy-remote.sh deu --full

# OR individual steps:
./scripts/remote/deploy-remote.sh deu --sync-themes
./scripts/remote/deploy-remote.sh deu --sync-policies
./scripts/remote/deploy-remote.sh deu --sync-tunnel
```

### 4. CI/CD Automated Deployment

**Use Case:** GitHub Actions triggered deployment

1. Push to `main` branch triggers `deploy-production.yml`
2. Tests run in parallel
3. Terraform plans are generated
4. **Manual approval required** (production environment)
5. Deployment proceeds sequentially: USA → FRA → GBR → DEU
6. Health checks verify each deployment

---

## Rollback Procedures

### Quick Rollback (Docker)

```bash
# Rollback to previous image
docker compose -p [instance] down
git checkout HEAD~1 -- docker-compose.[instance].yml
docker compose -p [instance] up -d
```

### Full Rollback (With Terraform State)

```bash
# 1. Identify last known good state
cd terraform/instances
terraform workspace select [instance]
terraform show | head -50

# 2. Restore previous Terraform state
# (States are versioned in GCS)
gsutil ls gs://dive25-terraform-state/dive-v3/keycloak/[instance].tfstate

# 3. Restore Docker state
docker compose -p [instance] down
docker image pull dive-v3-frontend:[previous-tag]
docker image pull dive-v3-backend:[previous-tag]
docker compose -p [instance] up -d
```

### Database Rollback

⚠️ **CAUTION: Data loss risk**

```bash
# MongoDB (restore from backup)
mongorestore --uri="mongodb://admin:$MONGO_PASSWORD@localhost:27017" \
  --authenticationDatabase=admin \
  --dir=/path/to/backup

# PostgreSQL (Keycloak)
psql -U postgres -h localhost -p 5433 < /path/to/backup.sql
```

---

## Health Verification

### Automated Health Check

```bash
# Check all instances
./scripts/health-check-all.sh

# Check specific instance
./scripts/health-check-all.sh --instance usa

# JSON output (for CI)
./scripts/health-check-all.sh --json

# With auto-rollback on failure
./scripts/health-check-all.sh --auto-rollback
```

### Manual Health Checks

```bash
# Frontend (should return 200)
curl -sk https://usa-app.dive25.com -o /dev/null -w "%{http_code}\n"

# Backend health endpoint
curl -sk https://usa-api.dive25.com/health | jq .status

# Keycloak readiness
curl -sk https://usa-idp.dive25.com/health/ready

# OPA (via Docker)
docker exec dive-v3-opa /opa version

# Check container health
docker ps --format "table {{.Names}}\t{{.Status}}" | grep -E "dive-v3|healthy"
```

### Smoke Test - Authentication Flow

```bash
# Test login flow (requires test user)
curl -sk "https://usa-idp.dive25.com/realms/dive-v3-broker/.well-known/openid-configuration" | jq .issuer
```

---

## Troubleshooting

### Common Issues

#### 1. Frontend "unhealthy"

**Symptom:** `docker ps` shows frontend as unhealthy

**Diagnosis:**
```bash
docker logs dive-v3-frontend --tail 50
docker exec dive-v3-frontend curl -s http://localhost:3000/
```

**Resolution:**
```bash
# Restart frontend
docker compose -p usa restart frontend

# If persists, rebuild
docker compose -p usa build --no-cache frontend
docker compose -p usa up -d frontend
```

#### 2. Keycloak "unhealthy"

**Symptom:** Keycloak not ready after 5 minutes

**Diagnosis:**
```bash
docker logs dive-v3-keycloak --tail 100 | grep -E "ERROR|WARN"
curl -sk https://localhost:9000/health/ready
```

**Resolution:**
```bash
# Check PostgreSQL connection
docker exec dive-v3-keycloak ping postgres

# Restart Keycloak
docker compose -p usa restart keycloak

# Increase memory if OOM
# Edit docker-compose.yml: deploy.resources.limits.memory: 2G
```

#### 3. OPA Policy Errors

**Symptom:** Authorization always denying

**Diagnosis:**
```bash
# Check OPA logs
docker logs dive-v3-opa --tail 50

# Test policy directly
curl -X POST http://localhost:8181/v1/data/dive/authorization/decision \
  -H "Content-Type: application/json" \
  -d '{"input":{"subject":{"clearance":"SECRET"},"resource":{"classification":"UNCLASSIFIED"}}}'
```

**Resolution:**
```bash
# Reload policies
docker exec dive-v3-opa /opa build /policies -o /bundle.tar.gz
docker restart dive-v3-opa
```

#### 4. Database Connection Failures

**Symptom:** Backend cannot connect to MongoDB

**Diagnosis:**
```bash
# Check MongoDB status
docker exec dive-v3-mongo mongosh --eval "db.adminCommand('ping')"

# Check connection string
docker exec dive-v3-backend env | grep MONGODB_URL
```

**Resolution:**
```bash
# Verify password
echo $MONGO_PASSWORD_USA

# Restart with fresh secrets
source ./scripts/sync-gcp-secrets.sh usa
docker compose -p usa restart backend
```

#### 5. DEU Remote Deployment Failures

**Symptom:** SSH connection fails to 192.168.42.120

**Diagnosis:**
```bash
# Test SSH
./scripts/remote/ssh-helper.sh
ssh_remote deu "echo 'Connection OK'"

# Check SSH password secret
gcloud secrets versions access latest --secret=dive-v3-ssh-deu --project=dive25
```

**Resolution:**
```bash
# Manual SSH with password
source ./scripts/remote/ssh-helper.sh
check_ssh_prereqs

# Verify sshpass is installed
which sshpass
```

---

## Emergency Contacts

| Role | Contact | Availability |
|------|---------|--------------|
| DevOps Lead | [TBD] | 24/7 on-call |
| Security Team | [TBD] | Business hours |
| GCP Admin | [TBD] | Business hours |
| Cloudflare Support | support@cloudflare.com | 24/7 |

### Escalation Path

1. **L1 - On-call Engineer:** Initial triage, restart services
2. **L2 - DevOps Lead:** Complex issues, rollback decisions
3. **L3 - Security Team:** Security incidents, credential compromise

---

## Appendix: Service Dependencies

```
Frontend (Next.js)
    └── Backend (Express.js)
            ├── MongoDB (resources, decisions)
            ├── OPA (authorization)
            └── KAS (key access - optional)
    └── Keycloak (authentication)
            └── PostgreSQL (Keycloak data)
            └── Redis (sessions - optional)

External Dependencies:
    └── Cloudflare (tunnels, DNS)
    └── GCP Secret Manager (credentials)
```

### Startup Order

1. PostgreSQL (5433)
2. MongoDB (27017)
3. Redis (6379)
4. OPA (8181)
5. Keycloak (8443) - waits for PostgreSQL
6. Backend (4000) - waits for MongoDB, OPA
7. Frontend (3000) - waits for Backend
8. Cloudflared (tunnel)

---

*Document maintained by DIVE V3 Operations Team*


