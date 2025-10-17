# Service Level Objectives (SLOs) - DIVE V3 Pilot

**Document Type:** Operational Targets  
**Audience:** Engineering, Product, Operations  
**Phase:** Phase 0 - Baseline Definition  
**Status:** Pilot/Proof-of-Concept

---

## Overview

This document defines **Service Level Objectives (SLOs)** for the DIVE V3 pilot. SLOs represent our commitment to system reliability and performance during the 4-week pilot period.

**Philosophy:** For a pilot, we prioritize **learning and iteration speed** over ultra-high availability. SLOs are intentionally achievable to avoid over-engineering while still ensuring a good user experience.

---

## SLO Framework

### Measurement Period
- **Pilot Duration:** 4 weeks (28 days)
- **Reporting Frequency:** Weekly review
- **Error Budget Reset:** Weekly (every Monday)

### Error Budget
- **Definition:** Allowed downtime or errors within measurement period
- **Calculation:** `(1 - SLO Target) × Time Period`
- **Consumption:** Tracked via Prometheus metrics

---

## Core SLOs

### 1. API Availability

**Objective:** Keep the backend API available for user requests.

| **Metric** | **Target** | **Error Budget** | **Measurement** |
|-----------|------------|------------------|-----------------|
| API Availability | **95%** | 84 minutes/week downtime | `(successful_requests / total_requests) × 100` |

**Why 95%?**  
For a pilot with <10 concurrent users, 95% allows ~1 hour/week for maintenance, deployments, and learning from failures.

**Prometheus Query:**
```promql
sum(rate(api_requests_total{status!~"5.."}[5m])) 
/ 
sum(rate(api_requests_total[5m])) * 100
```

**Alert Threshold:** < 90% availability over 15-minute window

---

### 2. IdP Approval Latency

**Objective:** Provide fast feedback to administrators approving IdPs.

| **Metric** | **Target** | **Error Budget** | **Measurement** |
|-----------|------------|------------------|-----------------|
| Approval p95 Latency | **< 15 seconds** | 20% of approvals can exceed 15s | `idp_approval_duration_seconds_p95` |

**Why 15 seconds?**  
Manual approval involves Keycloak API calls + MongoDB writes. 15s provides buffer for network latency while keeping admin UX snappy.

**Prometheus Query:**
```promql
histogram_quantile(0.95, idp_approval_duration_seconds_bucket)
```

**Alert Threshold:** p95 > 30 seconds (2× target)

---

### 3. Authentication Success Rate

**Objective:** Users can successfully authenticate via federated IdPs.

| **Metric** | **Target** | **Error Budget** | **Measurement** |
|-----------|------------|------------------|-----------------|
| Auth Success Rate | **99%** | 1% of auth attempts can fail | `(successful_logins / total_login_attempts) × 100` |

**Why 99%?**  
Authentication is mission-critical. We allow 1% failure for transient network issues or user errors (wrong password).

**Measurement Method:**
```typescript
// Track in backend/src/middleware/authz.middleware.ts
metricsService.recordAPIRequest(req.status >= 500);
```

**Alert Threshold:** < 95% success rate over 5-minute window

---

### 4. Resource Authorization Latency

**Objective:** Fast policy decisions from OPA for resource access.

| **Metric** | **Target** | **Error Budget** | **Measurement** |
|-----------|------------|------------------|-----------------|
| Authorization p95 Latency | **< 200ms** | 20% of requests can exceed 200ms | OPA metrics: `http_request_duration_seconds_p95` |

**Why 200ms?**  
OPA is in-memory and should be fast. 200ms allows for complex policy evaluation while keeping API response <1s total.

**Prometheus Query:**
```promql
histogram_quantile(0.95, 
  http_request_duration_seconds_bucket{job="dive-v3-opa"}
)
```

**Alert Threshold:** p95 > 500ms (2.5× target)

---

### 5. Critical Security Violations

**Objective:** Zero bypass of security controls.

| **Metric** | **Target** | **Error Budget** | **Measurement** |
|-----------|------------|------------------|-----------------|
| Security Bypasses | **0 per week** | 0 (zero tolerance) | Manual audit log review + OPA decision logs |

**What counts as a bypass?**
- User accesses resource above their clearance without OPA approval
- IdP approved without super_admin role
- JWT signature verification skipped
- Weak crypto (SHA-1, MD5) accepted

**Measurement Method:**
```bash
# Weekly audit query
grep "SECURITY_VIOLATION" logs/authz.log | wc -l
# Expected: 0
```

**Alert Threshold:** ANY security bypass triggers incident response

---

## Stretch Goals (Nice-to-Have)

These are **aspirational targets** for the pilot. Failure to meet them does NOT consume error budget.

| **Metric** | **Target** | **Why Stretch?** |
|-----------|------------|------------------|
| API Availability | 99% | Requires load balancer + failover (not in pilot scope) |
| Approval Latency p50 | < 3s | Would need caching + optimization |
| End-to-End Onboarding Time | < 5 min | Requires Phase 3 UX improvements |
| Prometheus Uptime | 99.9% | Single-node Prometheus acceptable for pilot |

---

## Error Budget Policy

### When Error Budget is Healthy (>20% remaining)

✅ **Allowed Activities:**
- Deploy new features daily
- Experiment with risky changes (new OPA policies)
- Refactor code for maintainability
- Add instrumentation/logging

### When Error Budget is Low (<20% remaining)

⚠️ **Restricted Activities:**
- **No** new feature deployments
- **No** database schema migrations
- **No** Keycloak configuration changes
- Focus on **bug fixes and stability only**

### When Error Budget is Exhausted (0% remaining)

🚨 **Incident Mode:**
- All-hands debugging session
- Rollback to last known good version
- Root cause analysis required before new deploys
- Postmortem document within 48 hours

---

## Monitoring & Alerting

### Grafana Dashboard

**URL:** http://localhost:3001/d/dive-v3-slo  
**Panels:**
1. **API Availability:** Green zone (>95%), Yellow (<95%), Red (<90%)
2. **Error Budget Burn Rate:** Shows % of weekly budget consumed
3. **Approval Latency:** Histogram with p50, p95, p99 markers
4. **Auth Success Rate:** Line chart with 99% threshold line
5. **OPA Latency:** Heatmap showing request distribution

### Alert Channels

For pilot, alerts go to:
- **Slack:** #dive-v3-alerts (non-critical)
- **Email:** devops@dive-v3.mil (critical only)
- **PagerDuty:** NOT USED (pilot doesn't warrant 24/7 on-call)

### Alert Rules

```yaml
# Grafana Alerting Rules (simplified for pilot)

groups:
  - name: dive-v3-slo
    interval: 1m
    rules:
      - alert: LowAPIAvailability
        expr: |
          sum(rate(api_requests_total{status!~"5.."}[5m])) 
          / 
          sum(rate(api_requests_total[5m])) * 100 < 90
        for: 5m
        annotations:
          summary: "API availability below 90%"
          description: "Current: {{ $value }}%. SLO: 95%"

      - alert: HighApprovalLatency
        expr: |
          histogram_quantile(0.95, idp_approval_duration_seconds_bucket) > 30
        for: 5m
        annotations:
          summary: "Approval p95 latency exceeds 30s"
          description: "Current: {{ $value }}s. SLO: 15s"

      - alert: LowAuthSuccessRate
        expr: |
          (sum(rate(api_requests_total{endpoint="/api/auth",status="200"}[5m])) 
          / 
          sum(rate(api_requests_total{endpoint="/api/auth"}[5m]))) * 100 < 95
        for: 5m
        annotations:
          summary: "Auth success rate below 95%"
          description: "Current: {{ $value }}%. SLO: 99%"
```

---

## Weekly SLO Review Checklist

Every Monday at 10:00 AM, team reviews:

- [ ] **API Availability:** Did we meet 95% target?
- [ ] **Approval Latency:** p95 within 15s?
- [ ] **Auth Success Rate:** Above 99%?
- [ ] **OPA Latency:** p95 below 200ms?
- [ ] **Security Violations:** Zero bypasses?
- [ ] **Error Budget:** How much consumed? (should be <80%)
- [ ] **Incidents:** Any outages? Root cause identified?
- [ ] **Action Items:** What needs fixing this week?

**Review Duration:** 30 minutes  
**Attendees:** Backend Lead, DevOps, Product Owner

---

## Success Criteria (End of Pilot)

At the end of 4 weeks, DIVE V3 pilot is considered **successful** if:

✅ **Met ALL 5 core SLOs at least 3 out of 4 weeks**  
✅ **Zero critical security bypasses**  
✅ **Error budget >20% remaining in final week** (shows stability)  
✅ **At least 4 partner IdPs successfully onboarded**  
✅ **Positive feedback from >80% of pilot users** (survey score >4/5)

**Failure Criteria** (would require pivot/redesign):
- ❌ Missed SLOs for 3+ consecutive weeks
- ❌ Any critical security incident
- ❌ User satisfaction score <3/5

---

## Measurement Examples

### Example 1: Good Week ✅

```
Week of 2025-10-15:
- API Availability: 98.2% (✅ target: 95%)
- Approval p95: 8.5s (✅ target: <15s)
- Auth Success: 99.8% (✅ target: 99%)
- OPA p95: 120ms (✅ target: <200ms)
- Security Violations: 0 (✅ target: 0)

Error Budget: 42% remaining
Status: 🟢 ALL SLOs MET
Action: Continue feature development
```

### Example 2: Struggling Week ⚠️

```
Week of 2025-10-22:
- API Availability: 91% (⚠️ target: 95%, missed by 4%)
- Approval p95: 32s (❌ target: <15s, missed by 17s)
- Auth Success: 99.5% (✅ target: 99%)
- OPA p95: 450ms (❌ target: <200ms, missed by 250ms)
- Security Violations: 0 (✅ target: 0)

Error Budget: 8% remaining (CRITICAL)
Status: 🟡 2/5 SLOs MISSED
Action: FREEZE features, debug OPA performance
```

### Example 3: Incident Week 🚨

```
Week of 2025-10-29:
- API Availability: 87% (❌ MongoDB replica failed)
- Approval p95: 125s (❌ Keycloak timeout cascade)
- Auth Success: 94% (❌ JWKS refresh failure)
- OPA p95: 180ms (✅ target: <200ms)
- Security Violations: 1 (🚨 Bronze user accessed SECRET doc)

Error Budget: -15% (EXHAUSTED)
Status: 🔴 INCIDENT MODE
Action: Rollback, postmortem, no new deploys
```

---

## Continuous Improvement

### Adjusting SLOs

SLOs may be adjusted after **2 weeks** if:
- **Too Easy:** Met with >80% error budget remaining → tighten targets
- **Too Hard:** Missed 2 weeks in a row despite good engineering → relax targets
- **New Data:** Discovered measurement was incorrect → recalibrate

**Process:**
1. Team proposes SLO change with data justification
2. Product Owner approves
3. Update this document + Grafana dashboards
4. Announce in #dive-v3-general

---

## References

- [Google SRE Book: SLOs](https://sre.google/sre-book/service-level-objectives/)
- [Prometheus Alerting Best Practices](https://prometheus.io/docs/practices/alerting/)
- [DIVE V3 Metrics Endpoint](/api/admin/metrics)
- [DIVE V3 Grafana Dashboard](http://localhost:3001)

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2025-10-15 | Initial SLO definition for pilot | AI Assistant |

---

**Document Owner:** Engineering Manager  
**Review Frequency:** Weekly  
**Next Review:** 2025-10-22 (Weekly SLO Review Meeting)

