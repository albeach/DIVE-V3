# Monitoring Stack Deployment Guide

**Phase 5 Task 5.2**: Production Monitoring with Prometheus, Grafana, and AlertManager

---

## Why Separate Containers? (Best Practice)

✅ **Recommended Approach**: Prometheus & Grafana as separate containers

**Benefits**:
- **Isolation**: Monitoring survives application restarts
- **Scalability**: Scale monitoring independently
- **Updates**: Update monitoring without touching app
- **Resource Control**: Dedicated CPU/RAM limits
- **Standard Practice**: Industry standard for production

❌ **NOT Recommended**: Embedded metrics libraries in application
- Application restarts kill monitoring history
- Resource contention with application
- Harder to scale and manage

---

## Current Configuration

**Files Created** (Phase 5):
```
monitoring/
├── prometheus.yml              # Prometheus config (7 scrape jobs)
├── alerts/
│   └── dive-v3-alerts.yml     # 20+ alerting rules
└── alertmanager.yml           # Alert routing config
```

**Deployment File** (NEW):
```
docker-compose.monitoring.yml   # Monitoring stack definition
```

---

## Quick Deployment (Option 1 - Recommended)

Deploy monitoring alongside main application:

```bash
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3

# Deploy main app + monitoring together
docker-compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d

# Check status
docker ps | grep -E "prometheus|grafana|alertmanager|exporter"

# Access UIs
# Prometheus: http://localhost:9090
# Grafana:    http://localhost:3001 (admin/admin)
# AlertManager: http://localhost:9093
```

---

## Selective Deployment (Option 2)

Deploy only monitoring components:

```bash
# Just monitoring stack
docker-compose -f docker-compose.monitoring.yml up -d

# Or individual services
docker-compose -f docker-compose.monitoring.yml up -d prometheus grafana
```

---

## Verification Steps

### 1. Check All Services Running

```bash
docker ps --format "table {{.Names}}\t{{.Status}}" | grep -E "prometheus|grafana|alert|exporter"
```

**Expected Output**:
```
dive-v3-prometheus        Up (healthy)
dive-v3-grafana           Up (healthy)
dive-v3-alertmanager      Up (healthy)
dive-v3-mongo-exporter    Up
dive-v3-postgres-exporter Up
dive-v3-redis-exporter    Up
```

### 2. Verify Prometheus Targets

```bash
curl -s http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | {job, health}'
```

**Expected**: All targets "up"

### 3. Access Grafana

```bash
open http://localhost:3001
# Login: admin / admin (change on first login)
```

### 4. Check Alerts

```bash
curl -s http://localhost:9090/api/v1/alerts | jq '.data.alerts[] | select(.state=="firing")'
```

**Expected**: No alerts firing (empty array)

---

## Resource Requirements

**Additional Resources Needed**:

| Service | CPU | RAM | Disk | Notes |
|---------|-----|-----|------|-------|
| Prometheus | 2 cores | 4GB | 100GB | 30-day retention |
| Grafana | 1 core | 1GB | 10GB | Dashboards |
| AlertManager | 0.5 cores | 512MB | 5GB | Alert state |
| Mongo Exporter | 0.25 cores | 256MB | 1GB | Metrics scraping |
| Postgres Exporter | 0.25 cores | 256MB | 1GB | Metrics scraping |
| Redis Exporter | 0.25 cores | 256MB | 1GB | Metrics scraping |
| **TOTAL** | **4.25 cores** | **6.25GB** | **118GB** | |

**Recommendation**: Ensure host has **additional 6-8GB RAM** available

---

## Configuration Details

### Prometheus Scrape Jobs

From `monitoring/prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'dive-v3-backend'      # Backend API metrics
    static_configs:
      - targets: ['backend:4000']
    scrape_interval: 10s

  - job_name: 'dive-v3-opa'          # OPA policy metrics
    static_configs:
      - targets: ['opa:8181']
    scrape_interval: 15s

  # + 5 more jobs (KAS, Keycloak, MongoDB, PostgreSQL, Redis)
```

### Alerting Rules

From `monitoring/alerts/dive-v3-alerts.yml`:

**Critical Alerts**:
- BackendAPIDown (service unavailable)
- OPAServiceDown (authorization fails)
- MetadataTamperingDetected (security incident)

**Performance Alerts**:
- HighAuthorizationLatency (p95 > 200ms)
- HighLoginFailureRate (>10%)

**20+ total rules** monitoring all critical paths

---

## Production Recommendations

### 1. Persistent Storage

Ensure data persists across restarts:

```bash
# Volumes are created automatically by docker-compose
# To check:
docker volume ls | grep -E "prometheus|grafana|alertmanager"
```

### 2. Alert Integrations

Configure AlertManager for production alerting:

Edit `monitoring/alertmanager.yml`:

```yaml
receivers:
  - name: 'critical-alerts'
    pagerduty_configs:
      - service_key: '<YOUR-PAGERDUTY-KEY>'
    slack_configs:
      - api_url: '<YOUR-SLACK-WEBHOOK>'
        channel: '#dive-v3-alerts'
```

Then restart:
```bash
docker-compose -f docker-compose.monitoring.yml restart alertmanager
```

### 3. Grafana Dashboards

Import pre-built dashboards:

1. Access Grafana: http://localhost:3001
2. Add Data Source → Prometheus → http://prometheus:9090
3. Import Dashboard → ID: 1860 (Node Exporter Full)
4. Create custom dashboard for DIVE V3 metrics

### 4. Backup Grafana Dashboards

```bash
# Backup dashboards
docker exec dive-v3-grafana grafana-cli admin export-dashboard > grafana-backup.json

# Restore
docker cp grafana-backup.json dive-v3-grafana:/tmp/
docker exec dive-v3-grafana grafana-cli admin import-dashboard /tmp/grafana-backup.json
```

---

## Troubleshooting

### Prometheus Not Scraping Targets

**Problem**: Targets show "down" in Prometheus UI

**Check**:
```bash
# Verify network connectivity
docker exec dive-v3-prometheus wget -O- http://backend:4000/metrics

# Check Prometheus logs
docker logs dive-v3-prometheus --tail 50
```

**Fix**: Ensure all services are on `dive-v3-network`:
```bash
docker network inspect dive-v3-network | jq '.[].Containers'
```

### Grafana Can't Connect to Prometheus

**Problem**: "Cannot connect to data source"

**Fix**:
1. In Grafana, use `http://prometheus:9090` (not localhost)
2. Save & Test
3. Should show "Data source is working"

### High Resource Usage

**Problem**: Prometheus using too much RAM/disk

**Solutions**:
```yaml
# Reduce retention in docker-compose.monitoring.yml
command:
  - '--storage.tsdb.retention.time=7d'  # Reduce from 30d to 7d
  - '--storage.tsdb.retention.size=50GB'  # Add size limit
```

---

## Stopping Monitoring

```bash
# Stop monitoring only (keep main app running)
docker-compose -f docker-compose.monitoring.yml down

# Stop but keep data
docker-compose -f docker-compose.monitoring.yml stop

# Stop and remove data (⚠️ DATA LOSS)
docker-compose -f docker-compose.monitoring.yml down -v
```

---

## Cost/Benefit Analysis

**Costs**:
- Additional 6-8GB RAM
- Additional 120GB disk space
- Slight network overhead (metrics scraping)

**Benefits**:
- **MTTR Reduction**: Find issues 10x faster
- **Proactive Alerting**: Know about problems before users
- **Performance Insights**: Identify bottlenecks
- **Audit Trail**: Historical metrics for analysis
- **SLA Compliance**: Prove uptime/performance

**Recommendation**: **DEPLOY for staging and production**

For pilot/demo: **OPTIONAL** (configuration ready when needed)

---

## Next Steps

1. **Now** (Pilot): Configuration ready, deployment optional
2. **Staging**: Deploy monitoring stack for testing
3. **Production**: REQUIRED - deploy with AlertManager integrations

---

**Status**: Configuration ✅ COMPLETE, Deployment ⏭️ OPTIONAL  
**Recommendation**: Deploy when moving to staging/production

