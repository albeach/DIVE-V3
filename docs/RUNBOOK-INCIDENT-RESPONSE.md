# DIVE V3 Incident Response Runbook

**Document Version:** 1.0.0  
**Last Updated:** 2025-12-01  
**Classification:** UNCLASSIFIED  
**Review Cycle:** Quarterly

---

## Table of Contents

1. [Incident Severity Levels](#incident-severity-levels)
2. [Response Procedures](#response-procedures)
3. [Common Incident Playbooks](#common-incident-playbooks)
4. [Post-Incident Actions](#post-incident-actions)
5. [Communication Templates](#communication-templates)

---

## Incident Severity Levels

### SEV-1: Critical (P0)

**Definition:** Complete service outage affecting all users

**Examples:**
- All 4 instances down
- Authentication completely broken
- Data breach detected
- GCP secrets compromised

**Response Time:** Immediate (< 15 minutes)  
**Resolution Target:** < 2 hours

**Required Actions:**
- [ ] Page on-call engineer immediately
- [ ] Establish incident command
- [ ] Notify leadership within 30 minutes
- [ ] Begin continuous status updates (every 15 min)

### SEV-2: High (P1)

**Definition:** Major functionality degraded, affecting many users

**Examples:**
- Single instance completely down
- Federation broken between instances
- Authorization denying all requests
- Database connection failures

**Response Time:** < 30 minutes  
**Resolution Target:** < 4 hours

**Required Actions:**
- [ ] Alert on-call engineer
- [ ] Begin troubleshooting
- [ ] Notify stakeholders if > 1 hour

### SEV-3: Medium (P2)

**Definition:** Minor functionality degraded, workaround available

**Examples:**
- Slow response times (p95 > 500ms)
- Single service intermittent failures
- Non-critical monitoring gaps
- UI rendering issues

**Response Time:** < 2 hours  
**Resolution Target:** < 24 hours

### SEV-4: Low (P3)

**Definition:** Minor issue, no user impact

**Examples:**
- Log verbosity issues
- Minor UI bugs
- Documentation updates needed
- Non-urgent improvements

**Response Time:** Next business day  
**Resolution Target:** < 1 week

---

## Response Procedures

### Initial Triage (First 5 Minutes)

```bash
# 1. Quick health check of all instances
./scripts/health-check-all.sh --json

# 2. Check monitoring dashboards
# Grafana: http://localhost:3333
# Prometheus: http://localhost:9090

# 3. Check recent deployments
git log --oneline -10

# 4. Check Alertmanager for active alerts
curl -s http://localhost:9093/api/v2/alerts | jq '.[].labels.alertname'
```

### Incident Command Structure

| Role | Responsibility |
|------|----------------|
| **Incident Commander (IC)** | Overall coordination, decisions |
| **Technical Lead** | Root cause analysis, fixes |
| **Communications Lead** | Stakeholder updates, status page |
| **Scribe** | Document timeline, actions taken |

### Communication Channels

- **Slack:** #dive-v3-incidents
- **Video Call:** [Zoom/Meet link]
- **Status Page:** [Internal status page URL]

---

## Common Incident Playbooks

### Playbook 1: Complete Instance Outage

**Trigger:** Frontend/Backend/Keycloak all unhealthy for > 5 minutes

**Step 1: Identify Scope**
```bash
./scripts/health-check-all.sh --instance [affected]
docker ps -a | grep dive-v3
```

**Step 2: Check Root Cause**
```bash
# Container logs
docker logs dive-v3-frontend-[inst] --tail 100
docker logs dive-v3-backend-[inst] --tail 100
docker logs dive-v3-keycloak-[inst] --tail 100

# System resources
docker stats --no-stream
df -h
free -m
```

**Step 3: Attempt Recovery**
```bash
# Option A: Restart all services
docker compose -p [inst] restart

# Option B: Full recreation
docker compose -p [inst] down
docker compose -p [inst] up -d

# Option C: Rollback (if recent deployment)
git checkout HEAD~1 -- docker-compose.[inst].yml
docker compose -p [inst] up -d --force-recreate
```

**Step 4: Verify Recovery**
```bash
./scripts/health-check-all.sh --instance [inst]
```

---

### Playbook 2: Authentication Failure (Keycloak Down)

**Trigger:** Users cannot log in, Keycloak health check failing

**Step 1: Diagnose**
```bash
# Check Keycloak container
docker logs dive-v3-keycloak --tail 200 | grep -E "ERROR|FATAL|Exception"

# Check PostgreSQL connection
docker exec dive-v3-postgres pg_isready -U postgres
docker exec dive-v3-keycloak ping postgres
```

**Step 2: Check PostgreSQL Health**
```bash
# Connect to PostgreSQL
docker exec -it dive-v3-postgres psql -U postgres -d keycloak_db -c "SELECT 1"

# Check connections
docker exec dive-v3-postgres psql -U postgres -c "SELECT count(*) FROM pg_stat_activity"
```

**Step 3: Recovery Options**
```bash
# Option A: Restart Keycloak
docker compose -p usa restart keycloak
sleep 120  # Wait for Keycloak to initialize

# Option B: Restart PostgreSQL and Keycloak
docker compose -p usa restart postgres
sleep 30
docker compose -p usa restart keycloak
sleep 120

# Option C: Clear Keycloak cache (if memory issue)
docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh \
  config credentials --server https://localhost:8443 \
  --realm master --user admin --password $KEYCLOAK_ADMIN_PASSWORD_USA
docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh \
  clear-realm-cache -r dive-v3-broker
```

**Step 4: Verify**
```bash
curl -sk https://usa-idp.dive25.com/health/ready
curl -sk https://usa-idp.dive25.com/realms/dive-v3-broker/.well-known/openid-configuration | jq .issuer
```

---

### Playbook 3: Authorization Failures (OPA Issues)

**Trigger:** All authorization requests being denied

**Step 1: Diagnose**
```bash
# Check OPA health
docker exec dive-v3-opa /opa version
curl -s http://localhost:8181/health

# Test simple query
curl -X POST http://localhost:8181/v1/data/dive/authorization/allow \
  -H "Content-Type: application/json" \
  -d '{"input": {"subject": {"clearance": "TOP_SECRET"}, "resource": {"classification": "UNCLASSIFIED"}}}'
```

**Step 2: Check Policy Loading**
```bash
# List loaded policies
curl -s http://localhost:8181/v1/policies | jq '.result[].id'

# Check for policy errors
docker logs dive-v3-opa --tail 100 | grep -E "error|Error|ERROR"
```

**Step 3: Recovery**
```bash
# Option A: Restart OPA
docker compose -p usa restart opa
sleep 10

# Option B: Reload policies
docker cp policies/. dive-v3-opa:/policies/
docker restart dive-v3-opa
sleep 10

# Option C: Rebuild OPA bundle
cd policies
opa build . -o bundle.tar.gz
docker cp bundle.tar.gz dive-v3-opa:/
docker restart dive-v3-opa
```

**Step 4: Verify**
```bash
# Run OPA tests
cd policies && opa test . -v | tail -20

# Test live query
curl -X POST http://localhost:8181/v1/data/dive/authorization/decision \
  -H "Content-Type: application/json" \
  -d '{"input": {"subject": {"uniqueID": "test", "clearance": "SECRET", "countryOfAffiliation": "USA"}, "resource": {"resourceId": "test", "classification": "UNCLASSIFIED", "releasabilityTo": ["USA"]}, "action": {"type": "read"}, "context": {"requestId": "test"}}}'
```

---

### Playbook 4: Database Connection Failures

**Trigger:** Backend cannot connect to MongoDB/PostgreSQL

**Step 1: Diagnose MongoDB**
```bash
# Check MongoDB container
docker exec dive-v3-mongo mongosh --eval "db.adminCommand('ping')"

# Check MongoDB connections
docker exec dive-v3-mongo mongosh --eval "db.serverStatus().connections"

# Check backend MongoDB connection
docker logs dive-v3-backend --tail 100 | grep -E "mongo|MongoDB|connection"
```

**Step 2: Diagnose PostgreSQL**
```bash
# Check PostgreSQL
docker exec dive-v3-postgres pg_isready -U postgres

# Check connections
docker exec dive-v3-postgres psql -U postgres -c "SELECT count(*) FROM pg_stat_activity"
```

**Step 3: Recovery**
```bash
# Option A: Restart databases
docker compose -p usa restart mongo postgres
sleep 30
docker compose -p usa restart backend

# Option B: Reset connections
docker exec dive-v3-postgres psql -U postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'keycloak_db' AND pid <> pg_backend_pid()"
docker compose -p usa restart keycloak
```

---

### Playbook 5: Secret Compromise

**Trigger:** Suspected or confirmed secret exposure

**Severity:** SEV-1 (Critical)

**IMMEDIATE ACTIONS:**

```bash
# 1. ROTATE ALL AFFECTED SECRETS IMMEDIATELY
./scripts/rotate-secrets.sh --force --type all

# 2. Restart all services
docker compose -p usa down
docker compose -p fra -f docker-compose.fra.yml down
docker compose -p gbr -f docker-compose.gbr.yml down

source ./scripts/sync-gcp-secrets.sh all

docker compose -p usa up -d
docker compose -p fra -f docker-compose.fra.yml up -d
docker compose -p gbr -f docker-compose.gbr.yml up -d

# 3. For DEU (remote)
./scripts/remote/deploy-remote.sh deu --full
```

**Investigation:**
- [ ] Identify how secrets were exposed
- [ ] Determine scope (which secrets, which systems)
- [ ] Check GCP Secret Manager access logs
- [ ] Review Git history for accidental commits

**Post-Incident:**
- [ ] Update incident report
- [ ] Implement preventive measures
- [ ] Notify affected parties if data breach

---

### Playbook 6: DEU Remote Instance Issues

**Trigger:** DEU instance unreachable or unhealthy

**Step 1: Check Connectivity**
```bash
# Test SSH
source ./scripts/remote/ssh-helper.sh
ssh_remote deu "echo 'SSH OK'"

# Check via Cloudflare
curl -sk https://deu-app.prosecurity.biz -o /dev/null -w "%{http_code}\n"
```

**Step 2: Remote Diagnosis**
```bash
# Check containers
ssh_remote deu "docker ps -a | grep dive-v3"

# Check logs
ssh_remote deu "docker logs dive-v3-frontend-deu --tail 50"
ssh_remote deu "docker logs dive-v3-backend-deu --tail 50"
ssh_remote deu "docker logs dive-v3-keycloak-deu --tail 50"
```

**Step 3: Remote Recovery**
```bash
# Option A: Restart services
ssh_remote deu "cd /opt/dive-v3 && docker compose restart"

# Option B: Full redeploy
./scripts/remote/deploy-remote.sh deu --full
```

---

## Post-Incident Actions

### Immediate (Within 24 Hours)

- [ ] Verify full service recovery
- [ ] Document timeline and actions taken
- [ ] Communicate resolution to stakeholders
- [ ] Schedule post-mortem meeting

### Post-Mortem Template

1. **Incident Summary**
   - What happened?
   - When did it happen?
   - Who was affected?

2. **Timeline**
   - Detection time
   - Response time
   - Resolution time

3. **Root Cause Analysis**
   - What was the root cause?
   - Why did monitoring miss it (if applicable)?

4. **Impact**
   - User impact
   - Business impact
   - Data impact

5. **Action Items**
   - Preventive measures
   - Monitoring improvements
   - Process improvements

---

## Communication Templates

### Status Update Template

```
DIVE V3 Incident Update - [DATE TIME]

SEVERITY: [SEV-1/2/3/4]
STATUS: [Investigating/Identified/Monitoring/Resolved]
INSTANCES AFFECTED: [USA/FRA/GBR/DEU]

CURRENT SITUATION:
[Brief description of current state]

IMPACT:
[User impact description]

NEXT UPDATE:
[Time of next update or "upon significant change"]

Contact: [Incident Commander name]
```

### Resolution Notification

```
DIVE V3 Incident Resolved

The incident affecting [affected services] has been resolved.

DURATION: [X hours Y minutes]
ROOT CAUSE: [Brief description]
RESOLUTION: [What fixed it]

NEXT STEPS:
- Post-mortem scheduled for [date]
- [Any follow-up actions for users]

We apologize for any inconvenience caused.
```

---

## Appendix: Monitoring Queries

### Prometheus Queries for Incident Investigation

```promql
# Service availability
up{job=~".*backend.*"} == 0

# High latency
histogram_quantile(0.95, sum(rate(dive_v3_authorization_latency_seconds_bucket[5m])) by (le)) > 0.2

# Error rate
sum(rate(dive_v3_http_requests_total{status=~"5.."}[5m])) / sum(rate(dive_v3_http_requests_total[5m])) > 0.01

# OPA decision denials spike
rate(dive_v3_authorization_decisions_total{decision="DENY"}[5m]) > 10
```

### Log Search Patterns

```bash
# Find errors in last hour
docker logs dive-v3-backend --since 1h 2>&1 | grep -E "ERROR|FATAL|Exception"

# Find authentication failures
docker logs dive-v3-keycloak --since 1h 2>&1 | grep -E "LOGIN_ERROR|INVALID_USER"

# Find authorization denials
docker logs dive-v3-backend --since 1h 2>&1 | grep "decision.*DENY"
```

---

*Document maintained by DIVE V3 Security Operations Team*





