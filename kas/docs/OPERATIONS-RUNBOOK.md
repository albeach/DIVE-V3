# KAS Operations Runbook
# ACP-240 Phase 4.3 - Cost-Optimized Production Deployment

**Document Version**: 1.0
**Last Updated**: 2026-01-31
**Target Audience**: DevOps, SRE, Platform Engineers

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture Summary](#architecture-summary)
3. [Deployment Procedures](#deployment-procedures)
4. [Common Operations](#common-operations)
5. [Monitoring & Observability](#monitoring--observability)
6. [Troubleshooting](#troubleshooting)
7. [Cost Management](#cost-management)
8. [Security Maintenance](#security-maintenance)
9. [Incident Response](#incident-response)
10. [Escalation Procedures](#escalation-procedures)

---

## Overview

### Service Description

**KAS (Key Access Service)** provides cryptographic key unwrapping and policy-based access control for encrypted resources in the DIVE V3 system.

### Deployment Model

- **Platform**: Google Cloud Run (serverless, scale-to-zero)
- **Region**: us-central1 (primary)
- **Cost Target**: <$20/month for <1,000 req/day
- **Cache Backend**: In-memory (no Redis)
- **Rate Limiting**: In-memory (per-instance)

### Key Characteristics

- **Scalability**: Auto-scales from 0 to 3 instances
- **Cold Start**: 1-3 seconds (acceptable for pilot)
- **Warm Latency**: <100ms (p95)
- **Availability**: 99.5% (Cloud Run SLA)
- **Security**: FIPS 140-2 Level 3 HSM (GCP KMS)

---

## Architecture Summary

### Component Stack

```
┌─────────────────────────────────────────┐
│  Cloud Load Balancer (Built-in)        │
│  TLS 1.3 Termination                    │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│  Cloud Run (kas-usa)                    │
│  - Node.js 20 (Alpine)                  │
│  - 1 vCPU, 512 MB RAM                   │
│  - Min: 0, Max: 3 instances             │
│  - In-memory cache (no Redis)           │
│  - In-memory rate limiting              │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│  GCP Cloud KMS                          │
│  - FIPS 140-2 Level 3 HSM               │
│  - us-central1 keyring                  │
│  - Usage-based billing                  │
└─────────────────────────────────────────┘
```

### Cost Profile

| Traffic Level | Monthly Cost | Components |
|--------------|--------------|------------|
| Baseline (idle) | $0 | Scale to zero |
| 1,000 req/day | $5-10 | Cloud Run + KMS |
| 5,000 req/day | $10-15 | Same (consider Redis) |
| 10,000 req/day | $15-25 | Same (add Redis) |

---

## Deployment Procedures

### Initial Deployment

#### Prerequisites

1. **GCP Project**: `dive25` configured
2. **GCP KMS**: Key ring and key created
3. **Service Account**: `dive-v3-kas-sa` with KMS access
4. **gcloud CLI**: Authenticated and configured

#### Deployment Steps

```bash
# 1. Navigate to KAS directory
cd /path/to/DIVE-V3/kas

# 2. Run deployment script
./scripts/deploy-cloudrun.sh

# 3. Verify deployment
curl https://kas-usa-[hash]-uc.a.run.app/health

# 4. Test JWKS endpoint
curl https://kas-usa-[hash]-uc.a.run.app/.well-known/jwks.json
```

#### Expected Output

```
Service deployed at: https://kas-usa-[hash]-uc.a.run.app
✓ Health check passed
Cost-Optimized Configuration:
  - Min Instances: 0 (scale to zero)
  - Cache: In-memory (no Redis)
  - Expected cost: $5-10/month
```

### Update Deployment

#### Code Update Deployment

```bash
# Build and deploy new version
cd /path/to/DIVE-V3
gcloud builds submit --config kas/cloudbuild.yaml

# Monitor deployment
gcloud run services describe kas-usa --region=us-central1

# Test new deployment
curl https://kas-usa-[hash]-uc.a.run.app/health
```

#### Environment Variable Update

```bash
# Update environment variables
gcloud run services update kas-usa \
  --region=us-central1 \
  --set-env-vars="LOG_LEVEL=debug,CACHE_TTL_DEK=120"

# Verify changes
gcloud run services describe kas-usa --region=us-central1 --format="yaml(spec.template.spec.containers[0].env)"
```

#### Secret Update

```bash
# Update secret in Secret Manager
echo -n "new-secret-value" | gcloud secrets versions add dive-v3-kas-credentials --data-file=-

# Force new deployment to pick up secret
gcloud run services update kas-usa \
  --region=us-central1 \
  --set-secrets=GOOGLE_APPLICATION_CREDENTIALS=dive-v3-kas-credentials:latest
```

### Rollback Procedure

```bash
# 1. List previous revisions
gcloud run revisions list \
  --service=kas-usa \
  --region=us-central1 \
  --limit=5

# 2. Get revision name (e.g., kas-usa-00005-abc)
PREVIOUS_REVISION="kas-usa-00005-abc"

# 3. Route traffic to previous revision
gcloud run services update-traffic kas-usa \
  --region=us-central1 \
  --to-revisions="${PREVIOUS_REVISION}=100"

# 4. Verify rollback
curl https://kas-usa-[hash]-uc.a.run.app/health

# 5. Monitor logs
gcloud run services logs read kas-usa --region=us-central1 --limit=100
```

### Blue/Green Deployment

```bash
# Deploy new revision (no traffic)
gcloud run deploy kas-usa \
  --image=gcr.io/dive25/kas:new-version \
  --region=us-central1 \
  --no-traffic

# Test new revision
NEW_REVISION=$(gcloud run revisions list --service=kas-usa --region=us-central1 --format="value(name)" --limit=1)
NEW_URL=$(gcloud run revisions describe ${NEW_REVISION} --region=us-central1 --format="value(status.url)")
curl ${NEW_URL}/health

# Gradually shift traffic
gcloud run services update-traffic kas-usa \
  --region=us-central1 \
  --to-revisions="${NEW_REVISION}=10,LATEST=90"

# Monitor for 10 minutes, then shift 100%
gcloud run services update-traffic kas-usa \
  --region=us-central1 \
  --to-latest
```

---

## Common Operations

### View Service Status

```bash
# Get service details
gcloud run services describe kas-usa --region=us-central1

# Get service URL
SERVICE_URL=$(gcloud run services describe kas-usa \
  --region=us-central1 \
  --format="value(status.url)")
echo "Service URL: ${SERVICE_URL}"

# Check health
curl ${SERVICE_URL}/health
```

### View Logs

```bash
# Recent logs (last 100 lines)
gcloud run services logs read kas-usa \
  --region=us-central1 \
  --limit=100

# Follow logs in real-time
gcloud run services logs tail kas-usa \
  --region=us-central1

# Filter by severity
gcloud run services logs read kas-usa \
  --region=us-central1 \
  --log-filter="severity>=ERROR"

# Filter by time
gcloud run services logs read kas-usa \
  --region=us-central1 \
  --log-filter='timestamp>="2026-01-31T00:00:00Z"'

# Search for specific errors
gcloud run services logs read kas-usa \
  --region=us-central1 \
  --log-filter='textPayload:"KMS error"'
```

### View Metrics

```bash
# Cloud Console
echo "Metrics: https://console.cloud.google.com/run/detail/us-central1/kas-usa/metrics"

# CLI - Request count
gcloud monitoring time-series list \
  --filter='metric.type="run.googleapis.com/request_count" AND resource.labels.service_name="kas-usa"' \
  --format="table(metric.labels.response_code_class, points[0].value)"

# CLI - Request latency
gcloud monitoring time-series list \
  --filter='metric.type="run.googleapis.com/request_latencies" AND resource.labels.service_name="kas-usa"' \
  --format="table(points[0].value)"
```

### Scale Configuration

```bash
# Scale to zero (cost savings during maintenance)
gcloud run services update kas-usa \
  --region=us-central1 \
  --min-instances=0 \
  --max-instances=0

# Resume normal operation
gcloud run services update kas-usa \
  --region=us-central1 \
  --min-instances=0 \
  --max-instances=3

# Temporarily increase capacity (high traffic)
gcloud run services update kas-usa \
  --region=us-central1 \
  --max-instances=10
```

### Resource Allocation

```bash
# Increase memory (if OOM errors)
gcloud run services update kas-usa \
  --region=us-central1 \
  --memory=1Gi

# Increase CPU (if slow cold starts)
gcloud run services update kas-usa \
  --region=us-central1 \
  --cpu=2

# Increase timeout (if federation latency high)
gcloud run services update kas-usa \
  --region=us-central1 \
  --timeout=120s
```

---

## Monitoring & Observability

### Key Metrics to Monitor

#### 1. Request Rate
- **Metric**: `run.googleapis.com/request_count`
- **Threshold**: <1,000 req/day expected
- **Action**: If >5,000 req/day, consider adding Redis

#### 2. Latency
- **Metric**: `run.googleapis.com/request_latencies`
- **Target**: p95 <100ms (warm), <3s (cold start)
- **Action**: If p95 >200ms, investigate

#### 3. Error Rate
- **Metric**: `run.googleapis.com/request_count` (5xx responses)
- **Target**: <0.5%
- **Action**: If >1%, investigate immediately

#### 4. Instance Count
- **Metric**: `run.googleapis.com/container/instance_count`
- **Target**: 0 when idle, 1-2 during traffic
- **Action**: If >3, check for traffic spike

#### 5. Memory Usage
- **Metric**: `run.googleapis.com/container/memory/utilizations`
- **Target**: <80% of 512MB
- **Action**: If >90%, increase memory

#### 6. KMS Operations
- **Metric**: `cloudkms.googleapis.com/crypto_key/asymmetric_decrypt_request_count`
- **Target**: ~1,000 ops/day (cache hit rate ~80%)
- **Action**: If >10,000 ops/day, check cache

### Dashboards

#### Cloud Console Dashboard

```
https://console.cloud.google.com/run/detail/us-central1/kas-usa/metrics
```

Key metrics visible:
- Request count
- Request latency
- Container instance count
- Error rate
- CPU utilization
- Memory utilization

#### Custom Dashboard (optional)

```bash
# Create custom dashboard JSON
cat > kas-dashboard.json <<'EOF'
{
  "displayName": "KAS Monitoring - Cost Optimized",
  "dashboardFilters": [],
  "mosaicLayout": {
    "columns": 12,
    "tiles": [
      {
        "width": 6,
        "height": 4,
        "widget": {
          "title": "Request Count (Last 24h)",
          "xyChart": {
            "dataSets": [{
              "timeSeriesQuery": {
                "timeSeriesFilter": {
                  "filter": "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"kas-usa\" AND metric.type=\"run.googleapis.com/request_count\""
                }
              }
            }]
          }
        }
      }
    ]
  }
}
EOF

# Create dashboard
gcloud monitoring dashboards create --config-from-file=kas-dashboard.json
```

### Alerts

#### Budget Alert (already configured)

```bash
# View budget alerts
gcloud billing budgets list \
  --billing-account=$(gcloud billing projects describe dive25 --format="value(billingAccountName)" | cut -d'/' -f2)
```

#### Error Rate Alert

```bash
# Create alert policy
gcloud alpha monitoring policies create \
  --notification-channels=CHANNEL_ID \
  --display-name="KAS High Error Rate" \
  --condition-display-name="5xx Error Rate > 1%" \
  --condition-threshold-value=1 \
  --condition-threshold-duration=300s \
  --condition-threshold-comparison=COMPARISON_GT \
  --condition-threshold-filter='resource.type="cloud_run_revision" AND resource.labels.service_name="kas-usa" AND metric.type="run.googleapis.com/request_count" AND metric.labels.response_code_class="5xx"'
```

#### Latency Alert

```bash
# Create latency alert
gcloud alpha monitoring policies create \
  --notification-channels=CHANNEL_ID \
  --display-name="KAS High Latency" \
  --condition-display-name="p95 Latency > 200ms" \
  --condition-threshold-value=200 \
  --condition-threshold-duration=300s \
  --condition-threshold-comparison=COMPARISON_GT \
  --condition-threshold-filter='resource.type="cloud_run_revision" AND resource.labels.service_name="kas-usa" AND metric.type="run.googleapis.com/request_latencies"'
```

---

## Troubleshooting

### Problem: Service Not Responding

**Symptoms**:
- Health check returns 503 or timeouts
- Cloud Run shows 0 instances

**Diagnosis**:
```bash
# Check service status
gcloud run services describe kas-usa --region=us-central1

# Check recent errors
gcloud run services logs read kas-usa --region=us-central1 --log-filter="severity>=ERROR" --limit=50

# Check cold start time
gcloud run services logs read kas-usa --region=us-central1 --log-filter="textPayload:startup" --limit=10
```

**Resolution**:
1. Check for startup errors in logs
2. Verify GCP KMS credentials are valid
3. Verify secret mounting is correct
4. Redeploy if necessary

### Problem: Cold Start Too Slow (>3s)

**Symptoms**:
- First request after idle takes >3 seconds
- User complaints about intermittent slowness

**Diagnosis**:
```bash
# Check instance startup time
gcloud run services logs read kas-usa --region=us-central1 --log-filter="Cold start" --limit=20
```

**Resolution**:
1. **Short-term**: Increase memory to 1GB
   ```bash
   gcloud run services update kas-usa --region=us-central1 --memory=1Gi
   ```

2. **Long-term**: Add min instance (costs ~$10/month)
   ```bash
   gcloud run services update kas-usa --region=us-central1 --min-instances=1
   ```

3. **Code optimization**: Reduce dependency loading time

### Problem: High KMS Costs

**Symptoms**:
- KMS costs >$1/month
- >10,000 KMS operations/month

**Diagnosis**:
```bash
# Check KMS operation count
gcloud monitoring time-series list \
  --filter='metric.type="cloudkms.googleapis.com/crypto_key/asymmetric_decrypt_request_count"' \
  --format="table(points[0].value)"

# Check cache hit rate (should be >80%)
gcloud run services logs read kas-usa --region=us-central1 --log-filter="Cache hit" --limit=100 | grep -c "Cache hit"
gcloud run services logs read kas-usa --region=us-central1 --log-filter="Cache miss" --limit=100 | grep -c "Cache miss"
```

**Resolution**:
1. **If cache hit rate <70%**: Add Redis Memorystore
   - Cost: +$13/month
   - Benefit: Shared cache across instances

2. **Increase cache TTL** (if acceptable):
   ```bash
   gcloud run services update kas-usa --region=us-central1 --set-env-vars="CACHE_TTL_DEK=120"
   ```

3. **Review request patterns**: Check for duplicate requests

### Problem: Rate Limiting Too Aggressive

**Symptoms**:
- Legitimate users getting 429 errors
- Rate limit exceeded logs

**Diagnosis**:
```bash
# Check rate limit hits
gcloud run services logs read kas-usa --region=us-central1 --log-filter="Rate limit exceeded" --limit=50
```

**Resolution**:
1. **Temporarily increase limits**:
   ```bash
   gcloud run services update kas-usa \
     --region=us-central1 \
     --set-env-vars="RATE_LIMIT_MAX_REQUESTS=200"
   ```

2. **Add Redis for distributed rate limiting** (if multi-instance):
   - Cost: +$13/month
   - Benefit: Rate limits shared across instances

3. **Review rate limit strategy**: Adjust per-endpoint limits

### Problem: Out of Memory (OOM)

**Symptoms**:
- Container crashes with OOM
- 503 errors
- Logs show "SIGKILL"

**Diagnosis**:
```bash
# Check memory usage
gcloud run services logs read kas-usa --region=us-central1 --log-filter="Memory" --limit=20

# Check container restarts
gcloud run revisions describe $(gcloud run revisions list --service=kas-usa --region=us-central1 --limit=1 --format="value(name)") --region=us-central1 --format="yaml(status)"
```

**Resolution**:
1. **Increase memory allocation**:
   ```bash
   gcloud run services update kas-usa --region=us-central1 --memory=1Gi
   ```

2. **Reduce cache size**: Lower TTL or reduce max cache entries

3. **Add Redis** (offload cache to external store):
   - Cost: +$13/month
   - Benefit: Reduced memory pressure

### Problem: High Latency (>200ms)

**Symptoms**:
- p95 latency >200ms
- Slow response times

**Diagnosis**:
```bash
# Check latency distribution
gcloud monitoring time-series list \
  --filter='metric.type="run.googleapis.com/request_latencies" AND resource.labels.service_name="kas-usa"'

# Check for KMS latency
gcloud run services logs read kas-usa --region=us-central1 --log-filter="KMS decrypt" --limit=50
```

**Resolution**:
1. **Check GCP KMS latency**: Should be <20ms

2. **Increase CPU**:
   ```bash
   gcloud run services update kas-usa --region=us-central1 --cpu=2
   ```

3. **Optimize cache hit rate**: Increase cache TTL

4. **Check federation latency**: If multi-KAS, optimize network

### Problem: Authentication Errors

**Symptoms**:
- 401 Unauthorized errors
- "Invalid token" in logs

**Diagnosis**:
```bash
# Check for auth errors
gcloud run services logs read kas-usa --region=us-central1 --log-filter="401" --limit=50

# Check JWKS endpoint
curl https://kas-usa-[hash]-uc.a.run.app/.well-known/jwks.json
```

**Resolution**:
1. **Verify token format**: Check JWT structure

2. **Check JWKS caching**: Clear cache if stale

3. **Verify token issuer**: Must match expected issuer

---

## Cost Management

### Daily Cost Monitoring

```bash
# Check daily spend
gcloud billing projects describe dive25 --format="table(billingAccountName, billingEnabled)"

# View detailed billing
gcloud billing projects describe dive25 --format="json" | jq '.billingAccountName'

# Cloud Console billing dashboard
echo "https://console.cloud.google.com/billing/$(gcloud billing projects describe dive25 --format='value(billingAccountName)' | cut -d'/' -f2)/reports?project=dive25"
```

### Weekly Cost Review

**Process**:
1. Check budget alert status (should be <$20/month)
2. Review service usage:
   - Cloud Run: Request count, billable time
   - KMS: Decrypt operations
3. Identify cost trends
4. Adjust if needed

### Cost Optimization Checklist

- [ ] Scale-to-zero enabled (min instances = 0)
- [ ] No Redis (using in-memory cache)
- [ ] Cache TTL optimized (60s for DEK, 3600s for public keys)
- [ ] Rate limiting in-memory (no Redis)
- [ ] Memory allocation appropriate (512MB baseline)
- [ ] Max instances limited (3 instances max)
- [ ] Budget alert configured (<$20/month)

### Scaling Decision Matrix

| Daily Traffic | Action | Cost Impact |
|--------------|--------|-------------|
| <1,000 req | Keep current (Cloud Run only) | $5-10/month |
| 1,000-5,000 req | Monitor cache hit rate | $10-15/month |
| 5,000-10,000 req | **Add Redis** if cache <70% | $18-25/month |
| 10,000-50,000 req | Add Redis, increase max instances | $25-50/month |
| >50,000 req | **Migrate to GKE** | $150-200/month |

---

## Security Maintenance

### Service Account Key Rotation

**Schedule**: Every 90 days

**Procedure**:
```bash
# 1. Create new service account key
gcloud iam service-accounts keys create new-key.json \
  --iam-account=dive-v3-kas-sa@dive25.iam.gserviceaccount.com

# 2. Update secret in Secret Manager
gcloud secrets versions add dive-v3-kas-credentials --data-file=new-key.json

# 3. Force new deployment
gcloud run services update kas-usa \
  --region=us-central1 \
  --set-secrets=GOOGLE_APPLICATION_CREDENTIALS=dive-v3-kas-credentials:latest

# 4. Wait 5 minutes for deployment

# 5. Delete old service account key
gcloud iam service-accounts keys list \
  --iam-account=dive-v3-kas-sa@dive25.iam.gserviceaccount.com

gcloud iam service-accounts keys delete OLD_KEY_ID \
  --iam-account=dive-v3-kas-sa@dive25.iam.gserviceaccount.com

# 6. Clean up local key
rm new-key.json
```

### Dependency Updates

**Schedule**: Monthly

**Procedure**:
```bash
# 1. Check for vulnerabilities
cd /path/to/DIVE-V3/kas
npm audit

# 2. Fix vulnerabilities
npm audit fix

# 3. Test locally
npm test

# 4. Deploy updated dependencies
gcloud builds submit --config cloudbuild.yaml

# 5. Verify deployment
curl https://kas-usa-[hash]-uc.a.run.app/health
```

### Security Audit

**Schedule**: Quarterly

**Checklist**:
- [ ] Review service account permissions
- [ ] Check KMS key access logs
- [ ] Review rate limiting effectiveness
- [ ] Check for suspicious traffic patterns
- [ ] Verify TLS 1.3 enforcement
- [ ] Review dependency vulnerabilities
- [ ] Check Cloud Audit Logs

### Certificate Management

**Cloud Run manages TLS certificates automatically** - no manual action needed.

**Verification**:
```bash
# Check TLS version
curl -I https://kas-usa-[hash]-uc.a.run.app/health | grep -i "server:"

# Check certificate
echo | openssl s_client -connect kas-usa-[hash]-uc.a.run.app:443 2>/dev/null | openssl x509 -noout -dates
```

---

## Incident Response

### Severity Levels

| Level | Definition | Response Time |
|-------|-----------|---------------|
| **P0 - Critical** | Service down, security breach | Immediate (5 min) |
| **P1 - High** | Degraded performance, partial outage | 15 minutes |
| **P2 - Medium** | Non-critical feature broken | 2 hours |
| **P3 - Low** | Minor issue, no impact | Next business day |

### P0 - Service Down

**Steps**:
1. **Acknowledge**: Alert team in incident channel
2. **Diagnose**: Check logs and metrics
   ```bash
   gcloud run services logs read kas-usa --region=us-central1 --limit=100
   ```
3. **Mitigate**: Rollback if recent deploy
   ```bash
   # Rollback to previous revision
   PREV_REVISION=$(gcloud run revisions list --service=kas-usa --region=us-central1 --limit=2 --format="value(name)" | tail -1)
   gcloud run services update-traffic kas-usa --region=us-central1 --to-revisions="${PREV_REVISION}=100"
   ```
4. **Communicate**: Update status page
5. **Root Cause**: Analyze logs, create post-mortem

### P1 - Degraded Performance

**Steps**:
1. **Check metrics**: Latency, error rate, instance count
2. **Scale up** if needed:
   ```bash
   gcloud run services update kas-usa --region=us-central1 --max-instances=10
   ```
3. **Investigate**: Check KMS, cache hit rate, external dependencies
4. **Optimize**: Adjust configuration based on findings

### Incident Communication

**Stakeholders**:
- Project Lead
- DevOps Team
- Pilot Users (if prolonged outage)

**Template**:
```
[INCIDENT] KAS Service - [STATUS]

Time: [UTC timestamp]
Severity: [P0/P1/P2/P3]
Impact: [Description]
Status: [Investigating/Identified/Mitigating/Resolved]

Timeline:
- [HH:MM UTC] - Incident detected
- [HH:MM UTC] - Root cause identified
- [HH:MM UTC] - Mitigation applied
- [HH:MM UTC] - Service restored

Next Steps:
- [Action items]
```

---

## Escalation Procedures

### L1 Support (DevOps Engineer)

**Responsibilities**:
- Monitor alerts
- Restart services
- Basic troubleshooting
- Log analysis

**Escalate to L2 if**:
- Issue unresolved after 30 minutes
- Requires code changes
- GCP platform issue suspected

### L2 Support (Senior SRE / Platform Engineer)

**Responsibilities**:
- Complex troubleshooting
- Configuration changes
- Performance optimization
- Security incident response

**Escalate to L3 if**:
- Application bug identified
- Architecture change needed
- GCP support required

### L3 Support (Development Team / GCP Support)

**Responsibilities**:
- Application code fixes
- Architecture changes
- GCP platform issues

**GCP Support**:
```bash
# Create GCP support case
gcloud support cases create \
  --display-name="KAS Cloud Run Issue" \
  --description="[Detailed description]" \
  --severity=S2 \
  --component="Cloud Run"
```

---

## Appendix

### Useful Commands Reference

```bash
# Service management
gcloud run services list --region=us-central1
gcloud run services describe kas-usa --region=us-central1
gcloud run services delete kas-usa --region=us-central1

# Revisions
gcloud run revisions list --service=kas-usa --region=us-central1
gcloud run revisions describe REVISION --region=us-central1

# Logs
gcloud run services logs read kas-usa --region=us-central1 --limit=100
gcloud run services logs tail kas-usa --region=us-central1

# Metrics
gcloud monitoring time-series list --filter='resource.labels.service_name="kas-usa"'

# Cost
gcloud billing projects describe dive25

# Secrets
gcloud secrets list
gcloud secrets versions access latest --secret=dive-v3-kas-credentials
```

### Health Check Endpoints

- **Health**: `GET /health` - Basic health check
- **JWKS**: `GET /.well-known/jwks.json` - Public key endpoint
- **Metrics**: `GET /metrics` - Prometheus metrics (if enabled)

### Configuration Files

- **Dockerfile**: `kas/Dockerfile.cloudrun`
- **Cloud Build**: `kas/cloudbuild.yaml`
- **Environment**: `kas/.env.cloudrun`
- **Deployment Script**: `kas/scripts/deploy-cloudrun.sh`

### Support Contacts

- **Project Lead**: [email]
- **DevOps Team**: [slack-channel]
- **GCP Support**: gcloud support cases create

---

**Document Owner**: DevOps Team
**Review Schedule**: Quarterly
**Last Review**: 2026-01-31
**Next Review**: 2026-04-30
