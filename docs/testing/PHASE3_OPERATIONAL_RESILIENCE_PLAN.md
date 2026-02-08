# Phase 3 Operational Resilience - Implementation Plan

**Date**: 2026-02-08  
**Status**: 🟡 Planning Complete - Ready for Week 9-12  
**Priority**: P2 - Nice to Have (Phase 3: Weeks 9-12)

---

## Executive Summary

Phase 3 focuses on **operational resilience and observability** to ensure DIVE V3 can handle production workloads with zero-downtime deployments, automated dependency management, distributed tracing, and SLO enforcement.

**Current State**:
- ❌ **Blue-Green Deployments**: Rollback exists, but downtime during deployments
- ✅ **Dependabot**: Already configured (`.github/dependabot.yml`)
- ❌ **Distributed Tracing**: No OpenTelemetry instrumentation
- ⚠️ **SLOs**: Targets documented, but not enforced

**Phase 3 Initiatives** (Weeks 9-12):
1. **Blue-Green Deployments** - Zero-downtime with instant rollback
2. **Dependabot Enhancement** - Security auto-merge + testing
3. **Distributed Tracing** - OpenTelemetry across all services
4. **SLO Enforcement** - Automated monitoring + alerting

---

## Phase 3 Work Breakdown

### Initiative 1: Blue-Green Deployments (Week 9)

**Objective**: Achieve zero-downtime deployments with instant rollback capability

**Current State**:
- ✅ `scripts/deploy-production.sh` exists with rollback support
- ❌ Deployments cause downtime (services restart)
- ❌ No traffic switching between environments
- ❌ No canary release support

**Target Architecture**:
```
┌─────────────────────────────────────────────┐
│          Load Balancer (Traefik)             │
│         (traffic routing control)            │
└────────────┬────────────┬────────────────────┘
             │            │
    ┌────────▼────┐   ┌───▼──────────┐
    │  Blue Env   │   │  Green Env    │
    │  (Active)   │   │  (Standby)    │
    │             │   │               │
    │ Frontend:80 │   │ Frontend:8080 │
    │ Backend:4000│   │ Backend:5000  │
    └─────────────┘   └───────────────┘
```

**Implementation**:
1. Add Traefik load balancer to `docker-compose.yml`
2. Create blue/green service definitions
3. Implement traffic switching script
4. Add health checks before cutover
5. Automate rollback on health check failure

**Effort**: 40 hours (1 week)

---

### Initiative 2: Dependabot Enhancement (Week 10)

**Objective**: Automate security patches with confident auto-merge

**Current State**:
- ✅ Dependabot configured for npm, Docker, GitHub Actions
- ⚠️ Weekly schedule (can be daily for security)
- ❌ No auto-merge (manual review required)
- ❌ No automated testing before merge

**Enhancements**:
1. **Security Auto-Merge**: Auto-merge security patches after tests pass
2. **Daily Security Checks**: Change schedule for security updates
3. **Automated Testing**: Run full test suite on Dependabot PRs
4. **Slack Notifications**: Alert team on major version updates
5. **Rollback Detection**: Auto-rollback if post-merge tests fail

**Effort**: 24 hours (3 days)

---

### Initiative 3: Distributed Tracing (Weeks 10-11)

**Objective**: End-to-end request tracing across all DIVE V3 services

**Current State**:
- ❌ No OpenTelemetry instrumentation
- ⚠️ Correlation IDs exist (`request-context.ts`) but not used for tracing
- ✅ Grafana Tempo deployed (ready for traces)
- ❌ No trace visualization

**Implementation**:
1. **Week 10**: Backend instrumentation
   - Install OpenTelemetry SDK
   - Auto-instrument Express.js
   - Manual spans for OPA calls, Redis, MongoDB
   - Export to Grafana Tempo

2. **Week 11**: Frontend + Federation
   - Next.js browser instrumentation
   - Cross-service trace propagation
   - Federation trace visualization
   - Add trace IDs to error logs

**Effort**: 64 hours (8 days across 2 weeks)

---

### Initiative 4: SLO Enforcement (Week 12)

**Objective**: Automated SLO monitoring with alerts and error budgets

**Current State**:
- ✅ SLO targets documented (availability 99.9%, latency p95 <200ms)
- ✅ Prometheus + Grafana deployed
- ❌ No SLO dashboards
- ❌ No alerting rules
- ❌ No error budget tracking

**SLOs to Enforce**:
1. **Availability**: 99.9% uptime (43 min downtime/month allowed)
2. **Latency**: p95 <200ms for authorization decisions
3. **Error Rate**: <1% for all API calls
4. **Throughput**: ≥100 req/s sustained
5. **MTTR**: <15 minutes for P1 incidents

**Implementation**:
1. Create Prometheus alerting rules
2. Build Grafana SLO dashboards
3. Configure Slack alerting
4. Track error budgets
5. Weekly SLO reports

**Effort**: 32 hours (4 days)

---

## Detailed Implementation Guides

### 1. Blue-Green Deployment Implementation

#### Step 1: Add Traefik Load Balancer

**Create**: `docker-compose.traefik.yml`

```yaml
version: '3.8'

services:
  traefik:
    image: traefik:v3.0
    container_name: dive-v3-traefik
    command:
      - "--api.insecure=true"
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
    ports:
      - "80:80"
      - "443:443"
      - "8081:8080" # Traefik dashboard
    volumes:
      - "/var/run/docker.sock:/var/run/docker.sock:ro"
    networks:
      - dive-network
    labels:
      - "traefik.enable=true"

networks:
  dive-network:
    external: true
```

**Merge with main docker-compose**:
```bash
docker compose -f docker-compose.hub.yml -f docker-compose.traefik.yml up -d
```

---

#### Step 2: Create Blue/Green Service Definitions

**Modify**: `docker-compose.hub.yml`

```yaml
# Blue environment (active)
frontend-usa-blue:
  image: dive-v3-frontend:latest
  container_name: dive-v3-frontend-usa-blue
  environment:
    - ENVIRONMENT=blue
  labels:
    - "traefik.enable=true"
    - "traefik.http.routers.frontend-blue.rule=Host(`dive-v3.mil`)"
    - "traefik.http.services.frontend-blue.loadbalancer.server.port=3000"
    - "traefik.http.routers.frontend-blue.priority=100" # Active priority

backend-usa-blue:
  image: dive-v3-backend:latest
  container_name: dive-v3-backend-usa-blue
  environment:
    - ENVIRONMENT=blue
  labels:
    - "traefik.enable=true"
    - "traefik.http.routers.backend-blue.rule=Host(`api.dive-v3.mil`)"
    - "traefik.http.services.backend-blue.loadbalancer.server.port=4000"

# Green environment (standby)
frontend-usa-green:
  image: dive-v3-frontend:next # New version
  container_name: dive-v3-frontend-usa-green
  environment:
    - ENVIRONMENT=green
  ports:
    - "8080:3000" # Exposed for pre-prod testing
  labels:
    - "traefik.enable=false" # Not in rotation yet

backend-usa-green:
  image: dive-v3-backend:next # New version
  container_name: dive-v3-backend-usa-green
  environment:
    - ENVIRONMENT=green
  ports:
    - "5000:4000" # Exposed for pre-prod testing
  labels:
    - "traefik.enable=false"
```

---

#### Step 3: Traffic Switching Script

**Create**: `scripts/blue-green-deploy.sh`

```bash
#!/bin/bash
set -e

GREEN_FRONTEND="dive-v3-frontend-usa-green"
GREEN_BACKEND="dive-v3-backend-usa-green"
BLUE_FRONTEND="dive-v3-frontend-usa-blue"
BLUE_BACKEND="dive-v3-backend-usa-blue"

log_info() { echo "[INFO] $1"; }
log_success() { echo "[SUCCESS] $1"; }
log_error() { echo "[ERROR] $1"; exit 1; }

# Step 1: Deploy green environment
deploy_green() {
    log_info "Deploying green environment..."
    
    docker compose -f docker-compose.hub.yml up -d "$GREEN_FRONTEND" "$GREEN_BACKEND"
    
    log_info "Waiting for green environment to be healthy..."
    sleep 10
}

# Step 2: Health checks
health_check_green() {
    log_info "Running health checks on green environment..."
    
    # Frontend health check
    if ! curl -f http://localhost:8080/api/health >/dev/null 2>&1; then
        log_error "Green frontend health check failed"
    fi
    
    # Backend health check
    if ! curl -f http://localhost:5000/api/health >/dev/null 2>&1; then
        log_error "Green backend health check failed"
    fi
    
    # Run smoke tests
    if ! bash scripts/smoke-tests.sh http://localhost:8080; then
        log_error "Green environment smoke tests failed"
    fi
    
    log_success "Green environment is healthy"
}

# Step 3: Switch traffic (blue → green)
switch_to_green() {
    log_info "Switching traffic to green environment..."
    
    # Enable green in Traefik
    docker exec "$GREEN_FRONTEND" \
        sh -c 'echo "traefik.enable=true" > /tmp/traefik-enable'
    
    # Update Traefik labels dynamically
    docker update --label-add "traefik.enable=true" "$GREEN_FRONTEND"
    docker update --label-add "traefik.http.routers.frontend-green.priority=100" "$GREEN_FRONTEND"
    docker update --label-add "traefik.enable=true" "$GREEN_BACKEND"
    
    # Decrease blue priority
    docker update --label-add "traefik.http.routers.frontend-blue.priority=50" "$BLUE_FRONTEND"
    
    # Wait for traffic switch
    sleep 5
    
    log_success "Traffic switched to green environment"
}

# Step 4: Monitor green (canary period)
monitor_green() {
    log_info "Monitoring green environment (5 min canary period)..."
    
    # Monitor error rate
    for i in {1..30}; do
        error_rate=$(curl -s http://localhost:9090/api/v1/query?query='rate(http_requests_total{status=~"5.."}[1m])' | jq -r '.data.result[0].value[1]')
        
        if [ "$(echo "$error_rate > 0.01" | bc)" -eq 1 ]; then
            log_error "Green environment error rate too high: $error_rate"
            rollback_to_blue
        fi
        
        sleep 10
    done
    
    log_success "Green environment stable"
}

# Step 5: Decommission blue
decommission_blue() {
    log_info "Decommissioning blue environment..."
    
    # Disable blue in Traefik
    docker update --label-add "traefik.enable=false" "$BLUE_FRONTEND"
    docker update --label-add "traefik.enable=false" "$BLUE_BACKEND"
    
    # Keep blue running for 15 minutes (rollback window)
    log_info "Blue environment kept running for 15 min rollback window"
    sleep 900
    
    # Stop blue
    docker compose -f docker-compose.hub.yml stop "$BLUE_FRONTEND" "$BLUE_BACKEND"
    
    log_success "Blue environment decommissioned"
}

# Rollback to blue
rollback_to_blue() {
    log_error "Rolling back to blue environment..."
    
    # Re-enable blue
    docker update --label-add "traefik.enable=true" "$BLUE_FRONTEND"
    docker update --label-add "traefik.http.routers.frontend-blue.priority=100" "$BLUE_FRONTEND"
    docker update --label-add "traefik.enable=true" "$BLUE_BACKEND"
    
    # Disable green
    docker update --label-add "traefik.enable=false" "$GREEN_FRONTEND"
    docker update --label-add "traefik.enable=false" "$GREEN_BACKEND"
    
    log_success "Rolled back to blue environment"
    exit 1
}

# Main execution
main() {
    deploy_green
    health_check_green
    switch_to_green
    monitor_green
    decommission_blue
    
    log_success "🎉 Blue-green deployment complete!"
}

main "$@"
```

**Usage**:
```bash
./scripts/blue-green-deploy.sh
```

**Effort**: 16 hours

---

### 2. Dependabot Security Auto-Merge

#### Step 1: Update Dependabot Configuration

**Modify**: `.github/dependabot.yml`

```yaml
version: 2
updates:
  # Backend npm (with security auto-merge)
  - package-ecosystem: "npm"
    directory: "/backend"
    schedule:
      interval: "daily" # Changed from weekly for security
      time: "06:00" # Run early morning
    open-pull-requests-limit: 15 # Increased for daily
    reviewers:
      - "dive-v3-team"
    labels:
      - "dependencies"
      - "backend"
      - "security" # Add security label
    commit-message:
      prefix: "chore(deps)"
      include: "scope"
    # Auto-merge security patches only
    # (requires GitHub Actions workflow)
    ignore:
      - dependency-name: "*"
        update-types: ["version-update:semver-major"] # Still manual for major

  # ... repeat for frontend, kas
```

---

#### Step 2: Create Auto-Merge Workflow

**Create**: `.github/workflows/dependabot-auto-merge.yml`

```yaml
name: Dependabot Auto-Merge

on:
  pull_request_target:
    types: [opened, synchronize, reopened]

permissions:
  contents: write
  pull-requests: write

jobs:
  dependabot:
    runs-on: ubuntu-latest
    if: github.actor == 'dependabot[bot]'
    
    steps:
      - name: Dependabot metadata
        id: metadata
        uses: dependabot/fetch-metadata@v2
        with:
          github-token: "${{ secrets.GITHUB_TOKEN }}"

      - name: Check if security update
        id: check-security
        run: |
          if [[ "${{ steps.metadata.outputs.update-type }}" == "version-update:semver-patch" ]] || \
             [[ "${{ contains(github.event.pull_request.labels.*.name, 'security') }}" == "true" ]]; then
            echo "is_security=true" >> $GITHUB_OUTPUT
          else
            echo "is_security=false" >> $GITHUB_OUTPUT
          fi

      - name: Wait for CI tests
        if: steps.check-security.outputs.is_security == 'true'
        uses: lewagon/wait-on-check-action@v1.3.1
        with:
          ref: ${{ github.event.pull_request.head.sha }}
          check-name: 'CI Comprehensive Tests'
          repo-token: ${{ secrets.GITHUB_TOKEN }}
          wait-interval: 30 # seconds

      - name: Auto-approve PR
        if: steps.check-security.outputs.is_security == 'true'
        run: gh pr review --approve "$PR_URL"
        env:
          PR_URL: ${{ github.event.pull_request.html_url }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Auto-merge PR
        if: steps.check-security.outputs.is_security == 'true'
        run: gh pr merge --auto --squash "$PR_URL"
        env:
          PR_URL: ${{ github.event.pull_request.html_url }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**Effort**: 8 hours

---

### 3. Distributed Tracing with OpenTelemetry

#### Step 1: Install OpenTelemetry (Backend)

```bash
cd backend
npm install --save \
  @opentelemetry/api \
  @opentelemetry/sdk-node \
  @opentelemetry/auto-instrumentations-node \
  @opentelemetry/exporter-trace-otlp-http
```

---

#### Step 2: Configure OpenTelemetry

**Create**: `backend/src/telemetry.ts`

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

const traceExporter = new OTLPTraceExporter({
  url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://tempo:4318/v1/traces',
});

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'dive-v3-backend',
    [SemanticResourceAttributes.SERVICE_VERSION]: process.env.APP_VERSION || '1.0.0',
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'production',
  }),
  traceExporter,
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-express': { enabled: true },
      '@opentelemetry/instrumentation-http': { enabled: true },
      '@opentelemetry/instrumentation-mongodb': { enabled: true },
      '@opentelemetry/instrumentation-redis-4': { enabled: true },
    }),
  ],
});

sdk.start();

process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('OpenTelemetry shutdown'))
    .catch((error) => console.error('Error shutting down OpenTelemetry', error))
    .finally(() => process.exit(0));
});

export default sdk;
```

---

#### Step 3: Initialize in Server

**Modify**: `backend/src/server.ts`

```typescript
// MUST be first import
import './telemetry';

import express from 'express';
// ... rest of imports
```

---

#### Step 4: Add Custom Spans

**Example**: `backend/src/services/authorization.service.ts`

```typescript
import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('dive-v3-authorization');

export async function authorizeRequest(input: AuthzInput): Promise<AuthzDecision> {
  const span = tracer.startSpan('authorize_request', {
    attributes: {
      'user.id': input.subject.uniqueID,
      'resource.id': input.resource.resourceId,
      'resource.classification': input.resource.classification,
    },
  });

  try {
    // OPA span
    const opaSpan = tracer.startSpan('opa_evaluation', { parent: span });
    const decision = await opaClient.evaluate(input);
    opaSpan.setAttribute('opa.decision', decision.allow);
    opaSpan.end();

    // Redis span
    const cacheSpan = tracer.startSpan('cache_decision', { parent: span });
    await redisClient.set(`authz:${cacheKey}`, JSON.stringify(decision), 'EX', 60);
    cacheSpan.end();

    span.setStatus({ code: SpanStatusCode.OK });
    return decision;
  } catch (error) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    span.recordException(error);
    throw error;
  } finally {
    span.end();
  }
}
```

**Effort**: 32 hours (backend), 16 hours (frontend), 16 hours (integration)

---

### 4. SLO Enforcement

#### Step 1: Define Prometheus Alerting Rules

**Create**: `monitoring/prometheus/rules/slo-alerts.yml`

```yaml
groups:
  - name: dive-v3-slo-alerts
    interval: 30s
    rules:
      # Availability SLO: 99.9% uptime
      - alert: AvailabilitySLOViolation
        expr: |
          (1 - (sum(rate(http_requests_total{status!~"5.."}[5m]))
                / sum(rate(http_requests_total[5m])))) > 0.001
        for: 5m
        labels:
          severity: critical
          slo: availability
        annotations:
          summary: "Availability SLO violated (99.9% target)"
          description: "Error rate: {{ $value | humanizePercentage }}"

      # Latency SLO: p95 <200ms
      - alert: LatencySLOViolation
        expr: |
          histogram_quantile(0.95,
            sum(rate(http_request_duration_seconds_bucket{route="/api/authorize"}[5m])) by (le)
          ) > 0.2
        for: 5m
        labels:
          severity: warning
          slo: latency
        annotations:
          summary: "Latency SLO violated (p95 <200ms target)"
          description: "Current p95: {{ $value | humanizeDuration }}"

      # Throughput SLO: ≥100 req/s
      - alert: ThroughputSLOViolation
        expr: |
          sum(rate(http_requests_total[1m])) < 100
        for: 10m
        labels:
          severity: warning
          slo: throughput
        annotations:
          summary: "Throughput SLO violated (≥100 req/s target)"
          description: "Current throughput: {{ $value | humanize }} req/s"

      # Error Budget Alert (monthly)
      - alert: ErrorBudgetExhausted
        expr: |
          (
            1 - (
              sum(increase(http_requests_total{status!~"5.."}[30d]))
              / sum(increase(http_requests_total[30d]))
            )
          ) > 0.001  # 99.9% SLO = 0.1% error budget
        for: 1h
        labels:
          severity: critical
          slo: error-budget
        annotations:
          summary: "Error budget exhausted for this month"
          description: "No more errors allowed this month to meet 99.9% SLO"
```

---

#### Step 2: Create Grafana SLO Dashboard

**Create**: `monitoring/grafana/dashboards/slo-dashboard.json`

Key panels:
1. **Availability Gauge**: Current uptime % (99.9% target)
2. **Latency Graph**: p50, p95, p99 over time (200ms target line)
3. **Error Rate Graph**: 5xx errors per minute
4. **Throughput Graph**: Requests per second (100 target line)
5. **Error Budget Bar**: Remaining error budget % for month
6. **MTTR Stat**: Average time to resolve incidents
7. **SLO Status Table**: Green/Yellow/Red for each SLO

---

#### Step 3: Configure Alertmanager

**Modify**: `monitoring/alertmanager/alertmanager.yml`

```yaml
global:
  slack_api_url: ${{ secrets.SLACK_WEBHOOK_URL }}

route:
  group_by: ['alertname', 'slo']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  receiver: 'dive-v3-slo-alerts'

receivers:
  - name: 'dive-v3-slo-alerts'
    slack_configs:
      - channel: '#dive-v3-slo-alerts'
        title: '🚨 {{ .GroupLabels.slo | toUpper }} SLO Violation'
        text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'
        send_resolved: true
```

**Effort**: 32 hours

---

## Phase 3 Total Effort

| Initiative | Effort | Timeline |
|-----------|--------|----------|
| Blue-Green Deployments | 40 hours (5 days) | Week 9 |
| Dependabot Enhancement | 24 hours (3 days) | Week 10 |
| Distributed Tracing | 64 hours (8 days) | Weeks 10-11 |
| SLO Enforcement | 32 hours (4 days) | Week 12 |
| **Total** | **160 hours** | **4 weeks** |

**Team Size**: 1-2 engineers recommended

---

## Success Metrics

### Week 9 (End)
- ✅ Blue-green deployment working
- ✅ Zero downtime during deployments
- ✅ Instant rollback capability

### Week 10 (End)
- ✅ Security patches auto-merged
- ✅ Backend tracing instrumented
- ✅ Traces visible in Grafana Tempo

### Week 11 (End)
- ✅ Frontend tracing instrumented
- ✅ End-to-end trace visualization

### Week 12 (End)
- ✅ SLO dashboards created
- ✅ Alerting rules active
- ✅ Error budget tracking

---

## Next Steps (Week 9 Start)

**Day 1**: Blue-green setup
- [ ] Add Traefik to docker-compose
- [ ] Define blue/green service variants

**Day 2-3**: Traffic switching
- [ ] Create `blue-green-deploy.sh`
- [ ] Test local deployment

**Day 4-5**: Testing & docs
- [ ] Run full blue-green deployment
- [ ] Document runbook

---

**Document Owner**: Principal Software Architect  
**Last Updated**: 2026-02-08  
**Review Frequency**: Weekly during Phase 3
