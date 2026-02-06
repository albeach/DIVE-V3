# OPAL Operations Runbook

## Overview

DIVE V3 uses OPAL (Open Policy Administration Layer) for real-time policy distribution from the Hub to all Spoke instances. This runbook documents operational procedures based on [official OPAL best practices](https://docs.opal.ac/tutorials/monitoring_opal).

**Version:** 1.0  
**Last Updated:** 2026-02-06  
**Target Audience:** DevOps, SREs, Security Operations

---

## Architecture

```
┌─────────────────┐
│   Git Repo      │  (Future: webhook-based instant updates)
│   (policies/)   │  (Current: file-based with 5s polling)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  OPAL Server    │  Port: 7002 (HTTPS)
│  (Hub)          │  Container: dive-hub-opal-server
│                 │  
│  - File watcher │  Polling: 5 seconds
│  - Pub/Sub via  │  Broadcast: Redis
│    Redis        │  
└────────┬────────┘
         │
         │ WebSocket + Pub/Sub
         ├──────────────────┬──────────────────┐
         ▼                  ▼                  ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ OPAL Client  │    │ OPAL Client  │    │ OPAL Client  │
│ (FRA)        │    │ (GBR)        │    │ (USA)        │
│              │    │              │    │              │
│ Port: 9191   │    │ Port: 9212   │    │ Port: 8181   │
└──────┬───────┘    └──────┬───────┘    └──────┬───────┘
       │                   │                   │
       ▼                   ▼                   ▼
  ┌─────────┐         ┌─────────┐         ┌─────────┐
  │OPA (FRA)│         │OPA (GBR)│         │OPA (Hub)│
  │Port:8281│         │Port:8491│         │Port:8181│
  └─────────┘         └─────────┘         └─────────┘
```

---

## Health Monitoring

### Official OPAL Health Checks

Based on [OPAL monitoring documentation](https://docs.opal.ac/tutorials/monitoring_opal):

#### 1. OPAL Server Health

**Endpoint:** `https://localhost:7002/healthcheck`

```bash
# Check server health
curl -sk https://localhost:7002/healthcheck

# Expected: HTTP 200 OK
# Response: {} or {"status": "healthy"}
```

#### 2. OPAL Client Health

**Readiness Check** (`/ready`):
- Returns `200 OK` if client has loaded policy & data to OPA **at least once**
- Returns `503 Unavailable` otherwise

**Liveness Check** (`/healthcheck`):
- Returns `200 OK` if **last** load attempts succeeded
- Returns `503 Unavailable` if last attempts failed

```bash
# Check FRA client readiness
curl -s -o /dev/null -w "%{http_code}" http://localhost:9191/ready

# Check FRA client liveness
curl -s -o /dev/null -w "%{http_code}" http://localhost:9191/healthcheck

# Check GBR client readiness
curl -s -o /dev/null -w "%{http_code}" http://localhost:9212/ready

# Check GBR client liveness
curl -s -o /dev/null -w "%{http_code}" http://localhost:9212/healthcheck
```

#### 3. OPA Instance Health

```bash
# Hub OPA
curl -sk https://localhost:8181/health
# Expected: {}

# FRA OPA
curl -sk https://localhost:8281/health

# GBR OPA
curl -sk https://localhost:8491/health
```

### OPAL Statistics API

When `OPAL_STATISTICS_ENABLED=true`, the server maintains unified state of all clients.

```bash
# Get statistics
curl -sk https://localhost:7002/statistics | jq .

# Expected format:
{
  "clients": [
    {
      "client_id": "spoke-fra",
      "topics": ["policy_data", "trusted_issuers", "federation_matrix"],
      "connected_at": "2026-02-06T08:00:00Z"
    }
  ],
  "topics": {
    "policy_data": ["spoke-fra", "spoke-gbr"],
    "trusted_issuers": ["spoke-fra", "spoke-gbr"]
  }
}
```

### DIVE Backend Metrics

Custom metrics endpoint for operational insights:

```bash
# Get OPAL metrics from DIVE backend
curl -sk https://localhost:4000/api/opal/health | jq .

# Response includes:
{
  "healthy": true,
  "version": "2.0.0",
  "uptime": 3600,
  "redis": {
    "connected": true,
    "clients": 2
  },
  "stats": {
    "totalPublishes": 150,
    "totalDataUpdates": 45,
    "failedOperations": 0
  }
}
```

---

## Policy Distribution

### Current Configuration

**Policy Source:**
- **Type:** File-based (`file:///policies`)
- **Polling Interval:** 5 seconds
- **Watched Directories:** `base`, `org`, `tenant`, `entrypoints`, `compat`, `data`

**Environment Variables:**
```bash
OPAL_POLICY_REPO_URL=file:///policies
OPAL_POLICY_REPO_POLLING_INTERVAL=5
OPAL_REPO_WATCHER_ENABLED=true
OPAL_POLICY_SOURCE_DIRS=.,base,org,tenant,entrypoints,compat,data
```

### Making Policy Changes

#### Development (File-Based)

1. Edit policy files in `policies/` directory
2. Wait for OPAL to detect (max 5 seconds)
3. Verify propagation using health checks

```bash
# Example: Add a new policy rule
echo "# Updated $(date)" >> policies/base/common.rego

# Wait for propagation (5-10 seconds)
sleep 10

# Verify policy loaded in OPA
curl -sk https://localhost:8181/v1/policies/base/common.rego | grep "Updated"
curl -sk https://localhost:8281/v1/policies/base/common.rego | grep "Updated"
```

#### Production (Git Webhook - Recommended)

**Setup Steps:**
1. Host policies in Git repository (GitHub/GitLab)
2. Configure OPAL server with Git URL:
   ```bash
   OPAL_POLICY_REPO_URL=https://github.com/org/dive-policies.git
   OPAL_POLICY_REPO_SSH_KEY=<deploy-key>
   ```
3. Generate webhook secret:
   ```bash
   opal-server generate-secret
   ```
4. Configure webhook in Git provider:
   - **URL:** `https://opal.yourdomain.com/webhook`
   - **Format:** JSON
   - **Secret:** From step 3
   - **Events:** Push events only

5. Set environment variable:
   ```bash
   OPAL_POLICY_REPO_WEBHOOK_SECRET=<generated-secret>
   ```

**Benefits:**
- ✅ Instant policy updates (< 1 second)
- ✅ No polling overhead
- ✅ Cleaner logs
- ✅ Git-based version control

### Propagation Latency

**Expected Times:**
- **File-based (current):** 5-10 seconds
  - Hub detection: < 5s (polling interval)
  - Pub/Sub broadcast: < 1s
  - OPA reload: < 2s
  
- **Webhook-based (production):** < 2 seconds
  - Hub detection: < 0.5s (instant)
  - Pub/Sub broadcast: < 0.5s
  - OPA reload: < 1s

**Testing Propagation:**
```bash
# Use official test script
./scripts/test-opal-distribution.sh full

# Or test individual components
./scripts/test-opal-distribution.sh health
./scripts/test-opal-distribution.sh statistics
./scripts/test-opal-distribution.sh distribution
```

---

## Data Updates

OPAL distributes two types of updates:
1. **Policy updates** (`.rego` files) - from Git/file system
2. **Data updates** (dynamic data) - from backend API

### Data Topics

**Subscribed Topics:**
- `policy_data` - General policy data
- `trusted_issuers` - Federated IdP configurations
- `federation_matrix` - Trust relationships between spokes
- `tenant_configs` - Tenant-specific settings
- `coi_definitions` - Community of Interest definitions
- `federation_constraints` - Authorization constraints

### Backend Data Endpoints

OPAL Server fetches data from backend API:

```bash
# Policy data
GET /api/opal/policy-data

# Trusted issuers (dynamic IdP list)
GET /api/opal/trusted-issuers

# Federation matrix
GET /api/opal/federation-matrix

# Tenant configurations
GET /api/opal/tenant-configs

# COI definitions
GET /api/opal/coi-definitions

# Federation constraints
GET /api/opal/federation-constraints
```

### MongoDB Change Data Capture (CDC)

OPAL automatically publishes data updates when MongoDB changes:

**Watched Collections:**
- `trustedIssuers` → topic: `trusted_issuers`
- `federationSpokes` → topic: `federation_matrix`
- `tenantConfigs` → topic: `tenant_configs`
- `coiDefinitions` → topic: `coi_definitions`

**How it Works:**
1. MongoDB change stream detects document change
2. OPAL CDC service (`opalCdcService`) captures event
3. Event published to OPAL Server via REST API
4. OPAL Server broadcasts to all subscribed clients
5. Clients update OPA data document

---

## Troubleshooting

### Issue: Clients Not Connecting

**Symptoms:**
- Statistics API shows 0 clients
- Client health checks fail
- Policies not propagating

**Debug Steps:**
1. Check client logs:
   ```bash
   docker logs dive-spoke-fra-opal-client --tail 50
   docker logs dive-spoke-gbr-opal-client --tail 50
   ```

2. Verify network connectivity:
   ```bash
   docker exec dive-spoke-fra-opal-client curl -sk https://dive-hub-opal-server:7002/healthcheck
   ```

3. Check SSL certificates:
   ```bash
   docker exec dive-spoke-fra-opal-client ls -la /var/opal/hub-certs/ca/
   ```

4. Verify authentication token:
   ```bash
   docker exec dive-spoke-fra-opal-client printenv OPAL_CLIENT_TOKEN
   ```

**Common Causes:**
- Missing or expired OPAL client token
- SSL certificate trust issues
- Hub OPAL server not accessible (firewall, network)
- Incorrect `OPAL_SERVER_URL`

**Solution:**
```bash
# Regenerate spoke tokens
./scripts/provision-opal-tokens.sh

# Restart spoke OPAL clients
docker restart dive-spoke-fra-opal-client
docker restart dive-spoke-gbr-opal-client

# Verify connection
curl -sk https://localhost:7002/statistics | jq '.clients | length'
```

### Issue: Policies Not Updating

**Symptoms:**
- Policy changes not reflected in OPA
- Old policy versions still active
- No errors in logs

**Debug Steps:**
1. Verify OPAL server detects changes:
   ```bash
   docker logs dive-hub-opal-server --tail 50 | grep -i "policy\|reload"
   ```

2. Check OPA policy versions:
   ```bash
   curl -sk https://localhost:8181/v1/policies | jq 'keys | length'
   curl -sk https://localhost:8281/v1/policies | jq 'keys | length'
   ```

3. Test manual policy fetch:
   ```bash
   curl -sk https://localhost:7002/policy-data
   ```

**Common Causes:**
- Polling disabled or too long interval
- File watcher not detecting changes
- Policy syntax errors (invalid Rego)
- OPA connection issues

**Solution:**
```bash
# Check polling configuration
docker exec dive-hub-opal-server printenv OPAL_POLICY_REPO_POLLING_INTERVAL

# Force policy reload (restart server)
docker restart dive-hub-opal-server

# Wait for propagation
sleep 10

# Verify
curl -sk https://localhost:8181/v1/policies
```

### Issue: High Propagation Latency

**Symptoms:**
- Policy updates take > 10 seconds
- Intermittent update failures
- Clients report stale policies

**Debug Steps:**
1. Measure propagation time:
   ```bash
   ./scripts/test-opal-distribution.sh distribution
   ```

2. Check Redis pub/sub:
   ```bash
   docker exec dive-hub-redis redis-cli MONITOR
   ```

3. Review OPAL server logs for performance issues:
   ```bash
   docker logs dive-hub-opal-server --tail 100 | grep -i "slow\|timeout\|error"
   ```

**Common Causes:**
- Long polling interval (> 10s)
- Redis connection issues
- Network latency to spoke instances
- Large policy files causing slow parsing

**Solution:**
```bash
# Reduce polling interval (if using file-based)
# In docker-compose.hub.yml:
OPAL_POLICY_REPO_POLLING_INTERVAL=3

# Switch to webhook-based (production)
# See "Production (Git Webhook)" section above

# Optimize policy files
opa check policies/  # Validate syntax
opa build --optimize policies/  # Optimize bundle
```

### Issue: Data Updates Not Propagating

**Symptoms:**
- MongoDB changes not reflected in OPA
- Trusted issuers list outdated
- Federation matrix not updating

**Debug Steps:**
1. Check CDC service status:
   ```bash
   curl -sk https://localhost:4000/api/opal/health | jq '.cdc'
   ```

2. Test data endpoint:
   ```bash
   curl -sk https://localhost:4000/api/opal/trusted-issuers | jq .
   ```

3. Check OPAL server data fetching:
   ```bash
   docker logs dive-hub-opal-server | grep -i "data\|fetch"
   ```

**Common Causes:**
- CDC service not initialized
- Backend API unreachable from Hub
- Data topic subscription mismatch
- MongoDB change streams not enabled

**Solution:**
```bash
# Restart backend (reinitializes CDC)
docker restart dive-hub-backend

# Verify CDC initialization
docker logs dive-hub-backend | grep "OPAL CDC"

# Manual data update test
curl -X POST https://localhost:7002/data/refresh

# Check client subscriptions
curl -sk https://localhost:7002/statistics | jq '.topics'
```

---

## Maintenance Procedures

### Routine Health Checks

**Daily:**
```bash
# Run health check suite
./scripts/test-opal-distribution.sh health

# Check statistics
curl -sk https://localhost:7002/statistics | jq '.clients | length'
# Expected: 2 (FRA + GBR)

# Verify backend metrics
curl -sk https://localhost:4000/api/opal/health | jq '.healthy'
# Expected: true
```

**Weekly:**
```bash
# Full distribution test
./scripts/test-opal-distribution.sh full

# Review propagation latency trends
# Check Grafana OPAL dashboard

# Review error logs
docker logs dive-hub-opal-server --since 168h | grep -i error
```

### Planned Policy Updates

1. **Test policy changes locally:**
   ```bash
   opa check policies/
   opa test policies/
   ```

2. **Apply to non-production first:**
   ```bash
   # Deploy to dev/staging
   git push origin dev

   # Verify propagation
   ./scripts/test-opal-distribution.sh distribution

   # Check for errors
   docker logs dive-spoke-fra-opal-client --tail 50
   ```

3. **Deploy to production:**
   ```bash
   # Merge to main branch
   git push origin main

   # Monitor propagation
   watch -n 1 'curl -sk https://localhost:7002/statistics | jq ".clients"'

   # Verify all clients updated
   curl -sk https://localhost:8181/v1/policies
   curl -sk https://localhost:8281/v1/policies
   curl -sk https://localhost:8491/v1/policies
   ```

### OPAL Client Token Rotation

Tokens should be rotated periodically (every 6-12 months):

```bash
# Generate new tokens
./scripts/provision-opal-tokens.sh

# Update spoke environment files
# Edit .env files in instances/fra/, instances/gbr/, etc.

# Restart spoke OPAL clients
docker restart dive-spoke-fra-opal-client
docker restart dive-spoke-gbr-opal-client

# Verify reconnection
curl -sk https://localhost:7002/statistics | jq '.clients'
```

### Upgrading OPAL

```bash
# Check current version
docker exec dive-hub-opal-server opal-server --version

# Pull new image
docker pull permitio/opal-server:latest

# Update docker-compose.hub.yml
# Set image: permitio/opal-server:X.Y.Z

# Restart with new version
docker-compose -f docker-compose.hub.yml up -d opal-server

# Verify health
curl -sk https://localhost:7002/healthcheck
```

---

## Monitoring & Alerting

### Key Metrics

**Availability:**
- OPAL Server uptime
- Client connection count
- OPA instance health

**Performance:**
- Policy propagation latency (target: < 5s file-based, < 2s webhook)
- Data update frequency
- Pub/Sub message rate

**Reliability:**
- Failed policy loads
- Client reconnection rate
- Error rate per topic

### Prometheus Metrics

OPAL exposes metrics for Prometheus scraping (if configured):

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'opal-server'
    static_configs:
      - targets: ['dive-hub-opal-server:7002']
    metrics_path: '/metrics'
    
  - job_name: 'opal-clients'
    static_configs:
      - targets: ['dive-spoke-fra-opal-client:8181', 'dive-spoke-gbr-opal-client:8181']
    metrics_path: '/metrics'
```

### Grafana Dashboard

Import OPAL dashboard:
- **File:** `monitoring/grafana/dashboards/opal-policy-distribution.json`
- **URL:** `http://localhost:3001/d/opal/`

**Key Panels:**
- OPAL Server health status
- Connected clients (time series)
- Policy propagation latency (histogram)
- Data update rate (gauge)
- Error rate by topic (graph)

### Alert Rules

**Critical Alerts:**
```yaml
# No clients connected for > 5 minutes
- alert: OPALNoClientsConnected
  expr: opal_connected_clients == 0
  for: 5m
  annotations:
    summary: "No OPAL clients connected to server"

# High propagation latency (> 30s)
- alert: OPALHighLatency
  expr: opal_propagation_latency_seconds > 30
  for: 2m
  annotations:
    summary: "OPAL policy propagation latency exceeds 30s"

# Policy load failures
- alert: OPALPolicyLoadFailure
  expr: rate(opal_policy_load_failures_total[5m]) > 0.1
  for: 5m
  annotations:
    summary: "OPAL policy load failures detected"
```

---

## Security Considerations

### Authentication

- **OPAL Clients:** Use JWT tokens (RS256 signed)
- **Token Expiry:** 1 year (configurable)
- **Token Storage:** Kubernetes secrets or environment files (encrypted)

### Transport Security

- **Server-Client:** WebSocket over TLS (wss://)
- **Pub/Sub:** Redis with TLS (rediss://)
- **Hub-Spoke:** mTLS with certificate validation

### Policy Integrity

- **Git Signed Commits:** Require GPG signatures (production)
- **Webhook Authentication:** Use HMAC-SHA256 shared secret
- **Bundle Signing:** OPA bundle signatures (future enhancement)

---

## References

### Official OPAL Documentation
- [Monitoring OPAL](https://docs.opal.ac/tutorials/monitoring_opal)
- [Policy Repository Syncing](https://docs.opal.ac/getting-started/running-opal/run-opal-server/policy-repo-syncing)
- [Broadcast Interface](https://docs.opal.ac/getting-started/running-opal/run-opal-server/broadcast-interface)
- [Running in Production](https://docs.opal.ac/getting-started/running-opal/as-python-package/running-in-prod)

### DIVE Documentation
- [Hub-Spoke Architecture](../docs/HUB_SPOKE_ARCHITECTURE.md)
- [Federation Implementation](../docs/federation/README.md)
- [Performance Testing](../scripts/test-opal-distribution.sh)

### Support Channels
- **OPAL Slack:** https://slack.opal.ac/
- **GitHub Issues:** https://github.com/permitio/opal/issues
- **DIVE Team:** Consult internal documentation

---

## Changelog

| Version | Date       | Changes                                           |
|---------|------------|---------------------------------------------------|
| 1.0     | 2026-02-06 | Initial version based on OPAL official best practices |

---

**Document Status:** Production Ready  
**Review Frequency:** Quarterly  
**Next Review:** 2026-05-06
