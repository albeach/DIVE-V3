# DIVE V3 - Phase 3 Complete: Scalability, Testing & Keycloak Maximization
## Comprehensive Session Handoff for AI Assistant

**🎯 COPY THIS ENTIRE DOCUMENT INTO YOUR NEXT CHAT SESSION FOR COMPLETE CONTEXT**

---

## 🚀 Mission Statement

**Your mission is to complete Phase 3 of DIVE V3**, focusing on:

1. **Scalability**: Implement <2 hour coalition partner onboarding (test with Canada)
2. **Testing**: Achieve 80%+ backend test coverage with comprehensive test suites
3. **Keycloak Maximization**: Implement 10+ advanced Keycloak features using Admin API
4. **Resilience**: Build 100% persistent, resilient, production-ready solution
5. **Performance**: Validate p95 <200ms, 100 req/s sustained throughput

**Timeline:** Complete by December 19, 2025 (21 days remaining)  
**Approach:** Best practices only - no shortcuts, comprehensive coverage, production-grade quality

---

## 📚 Project Overview - DIVE V3

### What is DIVE V3?

**DIVE V3** (Data In Virtual Environments v3) is a **coalition-friendly ICAM** (Identity, Credential, and Access Management) web application demonstrating **federated identity management** across USA/NATO partners with **policy-driven ABAC authorization**.

**Deployment Type:** Medium-term pilot (3-12 months)  
**User Scale:** 10-50 concurrent users across multiple geographic locations  
**Coalition Partners:** USA, France (FRA), United Kingdom (GBR), Germany (DEU) + future expansion

### Core Value Proposition

✅ **Multi-National Federation**: Users from any partner nation can authenticate via their home IdP  
✅ **Policy-Based Authorization**: ABAC (Attribute-Based Access Control) using OPA (Open Policy Agent)  
✅ **Security by Design**: ACP-240 compliant, NIST 800-63 AAL2/AAL3, NATO standards  
✅ **Encrypted Content**: ZTDF (Zero Trust Data Format) with policy-bound key release (KAS)  
✅ **Audit Trail**: Complete ACP-240 audit logging for compliance

---

## 🏗️ Architecture Overview

### Technology Stack

| Layer | Technology | Version | Purpose | Status |
|-------|------------|---------|---------|--------|
| **Frontend** | Next.js | 15+ | App Router, React UI | ✅ Operational |
| **Auth Broker** | Keycloak | 26.x | IdP federation, claim mapping | ✅ 4 instances |
| **Authorization** | OPA | 0.68.0+ | Policy Decision Point (Rego) | ✅ Operational |
| **Backend API** | Express.js | 4.18 | Node.js 20+, PEP (Policy Enforcement Point) | ✅ Operational |
| **Databases** | PostgreSQL | 15 | Keycloak realm data | ✅ Per-instance |
| | MongoDB | 7 | Resource metadata | ✅ Per-instance |
| | Redis | 7 | Token blacklist, session cache | ✅ Shared |
| **Infrastructure** | Docker Compose | - | Local/dev deployment | ✅ Operational |
| | Terraform | 1.5+ | Keycloak IaC (realms, clients, IdPs) | ✅ Operational |
| | Cloudflare Tunnel | - | Secure external access | ✅ 3 tunnels |
| **Testing** | Jest | - | Backend unit/integration tests | 🚧 52.33% coverage |
| | Playwright | - | E2E browser automation | 🚧 8 scenarios |
| | OPA Test | - | Rego policy tests | 🚧 85% coverage |
| **Monitoring** | Prometheus | - | Metrics collection | 🎯 Phase 3 task |
| | Grafana | - | Visualization dashboards | 🎯 Phase 3 task |
| **Secrets** | GCP Secret Manager | - | Centralized secret storage | 🎯 Phase 3 task |

### Current Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DIVE V3 Federation Network (4 Nations)                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  LOCAL INSTANCES (dive25.com)          REMOTE INSTANCE                     │
│  ┌──────────────────────────┐          ┌──────────────────────────┐        │
│  │  🇺🇸 USA (localhost)      │◄────────►│  🇩🇪 DEU (prosecurity.biz)│       │
│  │  Frontend:  3000         │          │  External partner        │        │
│  │  Backend:   4000         │          │  192.168.42.120          │        │
│  │  Keycloak:  8443         │          │  Cloudflare tunnel       │        │
│  │  Postgres:  5433         │          │                          │        │
│  │  MongoDB:   27017        │          │                          │        │
│  └──────────────────────────┘          └──────────────────────────┘        │
│           │  ▲  Bilateral Federation (SAML/OIDC)                           │
│           │  │                                                              │
│           ▼  │                                                              │
│  ┌──────────────────────────┐                                              │
│  │  🇫🇷 FRA (localhost)      │                                              │
│  │  Frontend:  3001         │                                              │
│  │  Backend:   4001         │                                              │
│  │  Keycloak:  8444         │                                              │
│  │  Postgres:  5434         │                                              │
│  │  MongoDB:   27018        │                                              │
│  └──────────────────────────┘                                              │
│           │  ▲                                                              │
│           │  │                                                              │
│           ▼  │                                                              │
│  ┌──────────────────────────┐                                              │
│  │  🇬🇧 GBR (localhost)      │                                              │
│  │  Frontend:  3002         │                                              │
│  │  Backend:   4002         │                                              │
│  │  Keycloak:  8445         │                                              │
│  │  Postgres:  5435         │                                              │
│  │  MongoDB:   27019        │                                              │
│  └──────────────────────────┘                                              │
│                                                                             │
│  🔧 Shared Services (localhost):                                           │
│  - Blacklist Redis:  6399                                                  │
│  - Prometheus:       9090                                                  │
│  - Grafana:          3333                                                  │
│  - Status Page:      8888                                                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Federation Matrix (All Operational ✅)

| From → To | USA | FRA | GBR | DEU |
|-----------|:---:|:---:|:---:|:---:|
| **USA** 🇺🇸 | - | ✅ | ✅ | ✅ |
| **FRA** 🇫🇷 | ✅ | - | ✅ | ✅ |
| **GBR** 🇬🇧 | ✅ | ✅ | - | ✅ |
| **DEU** 🇩🇪 | ✅ | ✅ | ✅ | - |

**Total:** 12 bilateral federation links (fully meshed topology)

---

## 🎯 Phase 3 Objectives (SMART)

### Overview

**Phase:** 3 of 4 (Weeks 5-7 of 8-week plan)  
**Duration:** 21 days (Dec 19, 2025 completion target)  
**Current Progress:** Week 5, Day 2 (Nov 28, 2025)

### Objective 3.1: Comprehensive Test Coverage (80%+)

**Specific:** Achieve ≥80% code coverage across Backend, Frontend, OPA policies, and E2E tests  
**Measurable:** Coverage reports from Jest, Playwright, and OPA test frameworks  
**Achievable:** Current baseline 52.33%, with 110 new tests already created  
**Relevant:** Production readiness requires comprehensive testing for coalition deployment  
**Time-bound:** Complete by Day 35 (Dec 19, 2025)

**Success Criteria:**
- ✅ Backend test coverage ≥80% (lines, statements)
- ✅ Frontend test coverage ≥80% (components, pages)
- ✅ OPA policy coverage 100% (all 41+ test scenarios)
- ✅ E2E test scenarios ≥20 (authentication, authorization, federation)
- ✅ All tests passing with ≥95% pass rate
- ✅ Zero flaky tests (reproducible results)
- ✅ CI/CD integration with GitHub Actions

**Current Status:**
- ✅ Backend: 52.33% → Target 80% (🚧 In Progress)
- 🚧 Frontend: ~40% → Target 80% (Pending)
- 🚧 OPA: ~85% → Target 100% (Pending)
- 🚧 E2E: 8 scenarios → Target 20+ (Pending)

### Objective 3.2: Scalable Partner Onboarding (<2 Hours)

**Specific:** Streamline coalition partner onboarding to <2 hours end-to-end (config → deployment → testing)  
**Measurable:** Timed end-to-end onboarding of Canada (CAN) as test nation  
**Achievable:** Phase 2 SSOT infrastructure provides automation foundation  
**Relevant:** Coalition operations require rapid partner integration for operational agility  
**Time-bound:** Complete by Day 40 (Dec 24, 2025)

**Success Criteria:**
- ✅ Automated configuration generation from federation registry
- ✅ Terraform deployment automation (realms, clients, IdPs, protocol mappers)
- ✅ Cloudflare tunnel automation (DNS, ingress, SSL/TLS)
- ✅ Docker Compose orchestration automation
- ✅ GCP Secret Manager integration for secure credential management
- ✅ Automated federation trust establishment (SAML metadata exchange)
- ✅ Automated test suite execution (federation matrix validation)
- ✅ CAN partner fully operational in <2 hours (timed test)
- ✅ Documentation/runbook for partner onboarding

**Current Status:**
- ✅ Federation registry v2.0 (SSOT) operational
- ✅ Auto-generation scripts for .tfvars and docker-compose
- ✅ JSON Schema validation
- ✅ Git pre-commit hooks
- 🚧 GCP Secret Manager integration (prepared, not activated)
- 🚧 Full automation script (`onboard-partner.sh`) not created
- 🚧 CAN partner not added (test case)

### Objective 3.3: Keycloak Feature Maximization (10+ Features)

**Specific:** Implement ≥10 advanced Keycloak features using Admin API and server configuration  
**Measurable:** Feature checklist with implementation evidence and test coverage  
**Achievable:** Keycloak Docs MCP provides complete API documentation access  
**Relevant:** Maximize IdP broker capabilities for production coalition use  
**Time-bound:** Complete by Day 42 (Dec 26, 2025)

**Success Criteria:**
- ✅ 10+ advanced Keycloak features implemented and tested
- ✅ Keycloak Docs MCP used extensively for API guidance
- ✅ Features documented in `docs/keycloak-features/`
- ✅ Terraform IaC for all features (reproducible deployments)
- ✅ Test coverage for each feature
- ✅ Admin API automation scripts

**Target Features (Priority Order):**

1. **Custom Authentication Flows** (Conditional MFA based on clearance)
   - MCP Query: "How to create custom authentication flows with conditional execution based on user attributes?"
   
2. **Advanced Protocol Mappers** (Dynamic claim transformation with JavaScript)
   - MCP Query: "JavaScript protocol mappers for dynamic claim transformation and calculated attributes"
   
3. **Event Listeners & Webhooks** (Real-time audit logging to external systems)
   - MCP Query: "Custom event listener implementation for audit logging and webhook integration"
   
4. **User Federation** (LDAP integration for external directories)
   - MCP Query: "LDAP user federation configuration and custom user storage provider implementation"
   
5. **Session Management** (Advanced session policies, timeout, concurrent limits)
   - MCP Query: "Advanced session management policies, timeout configuration, and concurrent session limits"
   
6. **Client Policies** (Protocol-specific policies, conditional client access)
   - MCP Query: "Client authentication policies and protocol-specific client access control"
   
7. **Identity Brokering Advanced** (Custom IdP mappers, attribute-based selection)
   - MCP Query: "Advanced SAML identity provider configuration with custom attribute mapping"
   
8. **Fine-Grained Authorization** (Resource-based permissions in Keycloak)
   - MCP Query: "Fine-grained authorization services configuration and resource-based permissions"
   
9. **Admin REST API Automation** (Bulk user management, configuration updates)
   - MCP Query: "Admin REST API endpoints for bulk user management and automated configuration"
   
10. **Performance Tuning** (Connection pooling, caching, database optimization)
    - MCP Query: "Keycloak performance tuning, connection pooling, and caching configuration"

**Current Status:**
- 🚧 ~5 basic features implemented (IdP federation, protocol mappers, basic flows)
- 🚧 Keycloak Docs MCP available but not extensively used
- 🚧 Need systematic implementation of 10+ advanced features

### Objective 3.4: Performance & Resilience Validation

**Specific:** Achieve and validate p95 latency <200ms, 100 req/s sustained, 99.9% uptime  
**Measurable:** Load testing with k6/Artillery, uptime monitoring over 7 days  
**Achievable:** Current architecture supports horizontal scaling  
**Relevant:** Production deployment requires performance guarantees for coalition users  
**Time-bound:** Complete by Day 45 (Dec 29, 2025)

**Success Criteria:**
- ✅ p50 latency <100ms (authentication and authorization flows)
- ✅ p95 latency <200ms
- ✅ p99 latency <500ms
- ✅ Sustained throughput ≥100 req/s (10-minute load test)
- ✅ Error rate <0.1% (HTTP 5xx responses)
- ✅ System uptime ≥99.9% (7-day monitoring period)
- ✅ Chaos testing scenarios (service failures, network issues, resource constraints)
- ✅ Recovery procedures documented (incident response runbooks)
- ✅ Monitoring dashboards operational (Prometheus + Grafana)

**Current Status:**
- 🚧 Performance not measured (no load testing conducted)
- 🚧 Monitoring infrastructure exists but not fully configured
- 🚧 Chaos testing not performed
- 🚧 Recovery procedures not documented

---

## 📊 Current Status (Detailed)

### Phase Completion Status

| Phase | Status | Completion | Key Achievements |
|-------|--------|------------|------------------|
| **Phase 1** | ✅ Complete | 100% | Passwords standardized, DEU federation fixed, health checks corrected |
| **Phase 2** | ✅ Complete | 100% | SSOT (federation registry v2.0), auto-generation, JSON Schema validation, pre-commit hooks |
| **Phase 3** | 🚧 In Progress | ~15% | 3 middleware test suites (110 tests), coverage +0.9% (52.33%) |
| **Phase 4** | 🎯 Planned | 0% | Production deployment, monitoring, final pilot report |

### Test Coverage Progress (Phase 3 Focus)

**Backend Coverage (Current: 52.33% → Target: 80%)**

| Metric | Before | Current | Target | Gap |
|--------|--------|---------|--------|-----|
| **Lines** | 51.43% | **52.33%** | 80% | **27.67%** |
| Statements | 51.8% | 52.78% | 80% | 27.22% |
| Branches | 41.59% | 42.41% | 80% | 37.59% |
| Functions | 51.17% | 52.3% | 80% | 27.7% |

**Recent Achievements (This Session):**
- ✅ `compression.middleware.test.ts`: 34 tests (0% → ~90%)
- ✅ `security-headers.middleware.test.ts`: 37 tests (0% → ~95%)
- ✅ `validation.middleware.test.ts`: 39 tests (0% → ~85%)
- ✅ **Total: 110 tests, 100% passing**

**Priority Coverage Gaps:**

**Controllers (Current ~50% avg → Target 80%+):**
```
CRITICAL (0-20% coverage):
- otp.controller.ts                    6.47%  ⚠️ HIGH PRIORITY
- policy.controller.ts                 9.67%  ⚠️ HIGH PRIORITY
- otp-enrollment.controller.ts         0%     ⚠️ CRITICAL
- admin-certificates.controller.ts     11.4%  ⚠️ CRITICAL
- coi-keys.controller.ts              10.86% ⚠️ HIGH PRIORITY
- compliance.controller.ts            13.46% ⚠️ HIGH PRIORITY
- sp-management.controller.ts         11.11% ⚠️ HIGH PRIORITY

MEDIUM (20-50%):
- auth.controller.ts                  29.85% 🔶 ENHANCE
- admin.controller.ts                 17.03% 🔶 ENHANCE

GOOD (50%+, enhance to 80%+):
- custom-login.controller.ts          78.87% ✅ ENHANCE TO 80%+
- oauth.controller.ts                 74.34% ✅ ENHANCE
- scim.controller.ts                  75%    ✅ ENHANCE
- resource.controller.ts              61.27% ✅ ENHANCE
- federation.controller.ts            69.23% ✅ ENHANCE
```

**Services (Current ~65% avg → Target 85%+):**
```
CRITICAL (0-20%):
- fra-federation.service.ts            0%     ⚠️ CRITICAL
- kms.service.ts                       0%     ⚠️ CRITICAL
- saml-metadata-parser.service.ts     3.47%  ⚠️ HIGH PRIORITY
- scim.service.ts                     4.41%  ⚠️ HIGH PRIORITY
- sp-management.service.ts            7.59%  ⚠️ HIGH PRIORITY
- mfa-detection.service.ts            2.98%  ⚠️ HIGH PRIORITY
- oidc-discovery.service.ts           5.66%  ⚠️ HIGH PRIORITY
- otp-redis.service.ts                10%    ⚠️ HIGH PRIORITY
- otp.service.ts                      11.49% ⚠️ HIGH PRIORITY

EXCELLENT (90%+, maintain):
- risk-scoring.service.ts             97.93% ✅ MAINTAIN
- compliance-validation.service.ts    94.59% ✅ MAINTAIN
- authz-cache.service.ts              97.14% ✅ MAINTAIN
- idp-validation.service.ts           94.62% ✅ MAINTAIN
- analytics.service.ts                98.9%  ✅ MAINTAIN
- health.service.ts                   94.53% ✅ MAINTAIN
```

---

## 🚀 Scalability Focus: Coalition Partner Onboarding

### The 2-Hour Onboarding Challenge

**Objective:** Enable any coalition partner to join DIVE V3 in <2 hours (end-to-end)

**Why Critical:**
- ✅ Operational agility for coalition missions
- ✅ Rapid response to changing political alliances
- ✅ Demonstration of technical maturity
- ✅ Scalability proof for 20+ nation deployments

### Current Onboarding Process (Manual)

**Estimated Time:** 8-12 hours (manual, error-prone)

1. **Configuration** (~2 hours)
   - Manually edit federation registry
   - Generate port allocations
   - Create .tfvars files
   - Write docker-compose configuration

2. **Infrastructure** (~3 hours)
   - Deploy Keycloak realm via Terraform
   - Configure PostgreSQL database
   - Deploy MongoDB instance
   - Setup Redis connection
   - Configure OPA instance

3. **Networking** (~2 hours)
   - Create Cloudflare tunnel
   - Configure DNS records
   - Setup SSL/TLS certificates
   - Configure ingress rules

4. **Federation** (~2 hours)
   - Exchange SAML metadata
   - Configure IdP trust
   - Setup protocol mappers
   - Map attributes

5. **Testing** (~1-2 hours)
   - Manual federation testing
   - Authorization testing
   - User acceptance testing

6. **Documentation** (~1 hour)
   - Update architecture diagrams
   - Document configuration
   - Update runbooks

### Target Automated Process (<2 Hours)

**🎯 Automation Script: `scripts/federation/onboard-partner.sh`**

```bash
#!/bin/bash
# Usage: ./scripts/federation/onboard-partner.sh <country_code> <country_name>
# Example: ./scripts/federation/onboard-partner.sh can "Canada"
#
# Automated Partner Onboarding (Target: <2 hours)
# 
# Step 1: Update Federation Registry (10 min)
# Step 2: Generate Configurations (5 min)
# Step 3: Store Secrets in GCP (10 min)
# Step 4: Deploy Infrastructure (30 min)
# Step 5: Configure Cloudflare Tunnel (15 min)
# Step 6: Automated Testing (20 min)
# Step 7: Monitoring & Documentation (10 min)
# 
# Total: ~100 minutes (< 2 hours)
```

**Automation Breakdown:**

#### Step 1: Update Federation Registry (10 minutes) ⏱️

```bash
# Prompt: Country code, name, URLs, ports
./scripts/federation/update-registry.sh can "Canada"

# Auto-generates:
# - Port allocations (check conflicts)
# - URL patterns (can-app.dive25.com)
# - Federation matrix (bilateral links to all existing)
# - JSON Schema validation
```

**Registry Entry Example:**
```json
{
  "instances": {
    "can": {
      "code": "CAN",
      "name": "Canada",
      "type": "local",
      "enabled": true,
      "deployment": {
        "provider": "docker",
        "host": "localhost",
        "domain": "dive25.com"
      },
      "urls": {
        "app": "https://can-app.dive25.com",
        "api": "https://can-api.dive25.com",
        "idp": "https://can-idp.dive25.com"
      },
      "ports": {
        "frontend": 3003,
        "backend": 4003,
        "keycloak": 8446,
        "keycloakHttp": 8086,
        "postgres": 5436,
        "mongodb": 27020,
        "redis": 6382,
        "opa": 8184,
        "kas": 8093
      },
      "keycloak": {
        "realm": "dive-v3-broker",
        "clientId": "dive-v3-client"
      },
      "federation": {
        "enabled": true,
        "partners": ["usa", "fra", "gbr", "deu"]
      }
    }
  }
}
```

#### Step 2: Generate Configurations (5 minutes) ⏱️

```bash
# Validate configuration
./scripts/federation/validate-config.sh

# Generate Terraform .tfvars
./scripts/federation/generate-tfvars.sh can

# Generate docker-compose.yml
./scripts/federation/generate-docker-compose.sh can

# Outputs:
# - terraform/instances/can.tfvars
# - instances/can/docker-compose.yml
```

#### Step 3: Store Secrets in GCP Secret Manager (10 minutes) ⏱️

```bash
# Store all secrets securely
./scripts/gcp/store-secrets.sh --instance can

# Creates secrets:
# - dive-v3-can-keycloak-admin-password
# - dive-v3-can-postgres-password
# - dive-v3-can-mongodb-password
# - dive-v3-can-redis-password
# - dive-v3-can-client-secret
# - dive-v3-can-jwt-secret

# Access pattern:
# gcloud secrets versions access latest --secret="dive-v3-can-keycloak-admin-password"
```

#### Step 4: Deploy Infrastructure via Terraform (30 minutes) ⏱️

```bash
cd terraform/instances

# Create workspace
terraform workspace new can

# Apply configuration
terraform apply -var-file=can.tfvars -auto-approve

# Deploys:
# - Keycloak realm (dive-v3-broker)
# - Client (dive-v3-client)
# - Protocol mappers (uniqueID, clearance, countryOfAffiliation, acpCOI)
# - IdP connections (to USA, FRA, GBR, DEU)
# - SAML endpoints
# - OIDC configuration
```

#### Step 5: Configure Cloudflare Tunnel (15 minutes) ⏱️

```bash
# Create tunnel
cloudflared tunnel create dive-v3-can

# Configure ingress
cat > cloudflared/config-can.yml << EOF
tunnel: <tunnel-id>
credentials-file: /etc/cloudflared/tunnel-credentials.json

ingress:
  - hostname: can-app.dive25.com
    service: http://localhost:3003
  - hostname: can-api.dive25.com
    service: http://localhost:4003
  - hostname: can-idp.dive25.com
    service: https://localhost:8446
  - service: http_status:404
EOF

# Route DNS
cloudflared tunnel route dns dive-v3-can can-app.dive25.com
cloudflared tunnel route dns dive-v3-can can-api.dive25.com
cloudflared tunnel route dns dive-v3-can can-idp.dive25.com

# Start tunnel
docker-compose -f instances/can/docker-compose.yml up -d cloudflared
```

#### Step 6: Automated Testing (20 minutes) ⏱️

```bash
# Run full federation matrix test
./tests/e2e/test-federation-matrix.sh --include can

# Tests:
# - CAN → USA authentication
# - CAN → FRA authentication
# - CAN → GBR authentication
# - CAN → DEU authentication
# - USA → CAN authentication (reverse)
# - Authorization with CAN users
# - Resource access with CAN clearances
# - COI enforcement for CAN
# - Health checks (all services)
# - Performance baseline (latency, throughput)

# Expected: All tests pass, federation operational
```

#### Step 7: Monitoring & Documentation (10 minutes) ⏱️

```bash
# Add to monitoring
./scripts/monitoring/add-instance.sh can

# Generate documentation
./scripts/docs/generate-instance-docs.sh can

# Outputs:
# - docs/instances/CAN-deployment.md
# - docs/instances/CAN-federation-links.md
# - monitoring/grafana-dashboards/can-metrics.json
```

### Scalability Targets

| Metric | Current | Phase 3 Target | Future (20+ nations) |
|--------|---------|----------------|----------------------|
| **Onboarding Time** | 8-12 hours | <2 hours | <2 hours |
| **Manual Steps** | ~50 | <5 | 0 (fully automated) |
| **Configuration Files** | Manual edit | Auto-generated | Auto-generated |
| **Federation Links** | Manual setup | Automatic | Automatic |
| **Testing** | Manual | Automated | Automated + CI/CD |
| **Documentation** | Manual | Auto-generated | Auto-generated |

---

## 🔐 CLI Tool Permissions & Usage

### GitHub CLI (`gh`)

**Purpose:** CI/CD automation, workflow management, release management

**Authentication:**
```bash
gh auth login
# Follow prompts for authentication

gh auth status
# Verify: Logged in to github.com as [username]
```

**Required Permissions:**
- ✅ `repo` (full repository control)
- ✅ `workflow` (manage GitHub Actions workflows)
- ✅ `admin:org` (read organization data)
- ✅ `packages:read` (read container registry)

**Phase 3 Usage:**

1. **Create Test Workflow**
```bash
# Create .github/workflows/phase3-tests.yml
gh workflow run phase3-tests.yml

# Monitor workflow
gh run watch

# View results
gh run view --log
```

2. **Manage Releases**
```bash
# Create release for Phase 3 completion
gh release create v0.3.0 \
  --title "Phase 3: Testing & Scalability Complete" \
  --notes-file docs/PHASE3-COMPLETION-REPORT.md
```

3. **Issue Tracking**
```bash
# Create issues for remaining tasks
gh issue create \
  --title "Implement Keycloak Custom Authentication Flows" \
  --body "Use Keycloak Docs MCP to implement conditional MFA" \
  --label "phase3,keycloak"
```

### GCP CLI (`gcloud`)

**Purpose:** Secret management, cloud deployment, monitoring

**🚨 CRITICAL: Create New Project for Phase 3**

```bash
# Authenticate
gcloud auth login
gcloud auth application-default login

# Create NEW project for DIVE V3 Pilot
gcloud projects create dive-v3-pilot \
  --name="DIVE V3 Coalition Pilot" \
  --set-as-default

# Set project and region
gcloud config set project dive-v3-pilot
gcloud config set compute/region us-east4

# Enable required APIs
gcloud services enable \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com \
  logging.googleapis.com \
  monitoring.googleapis.com \
  iam.googleapis.com
```

**Required Roles:**
- ✅ Project Creator (create dive-v3-pilot)
- ✅ Secret Manager Admin (manage secrets)
- ✅ Service Account Admin (create service accounts)
- ✅ Cloud Build Editor (CI/CD pipelines)
- ✅ Logging Admin (audit logs)
- ✅ Monitoring Admin (metrics, alerts)
- ✅ IAM Admin (permission management)

**Phase 3 Usage:**

1. **Setup GCP Secret Manager**
```bash
# Initialize secret storage
./scripts/gcp/setup-project.sh

# Store secrets for all instances
./scripts/gcp/store-secrets.sh --instance usa
./scripts/gcp/store-secrets.sh --instance fra
./scripts/gcp/store-secrets.sh --instance gbr
./scripts/gcp/store-secrets.sh --instance deu

# For new partner (CAN):
./scripts/gcp/store-secrets.sh --instance can
```

2. **Access Secrets in Application**
```bash
# Retrieve secret
gcloud secrets versions access latest \
  --secret="dive-v3-usa-keycloak-admin-password"

# List all DIVE V3 secrets
gcloud secrets list --filter="name:dive-v3-*"
```

3. **Rotate Secrets**
```bash
# Automated rotation script
./scripts/gcp/rotate-secrets.sh --instance usa --service keycloak
```

4. **Backup Secrets**
```bash
# Backup all secrets (encrypted)
./scripts/gcp/backup-secrets.sh --output backups/secrets-$(date +%Y%m%d).enc
```

### Cloudflare CLI (`cloudflared`, `wrangler`)

**Purpose:** Tunnel management, DNS configuration, SSL/TLS

**Authentication:**
```bash
# Authenticate cloudflared
cloudflared login

# Authenticate wrangler (API token)
wrangler login
```

**Required Permissions:**
- ✅ Tunnel create/delete
- ✅ DNS record management
- ✅ Zone settings read/write
- ✅ SSL/TLS certificate management

**Phase 3 Usage:**

1. **Create Tunnel for New Partner**
```bash
# Create tunnel
cloudflared tunnel create dive-v3-can

# Configure ingress
cat > cloudflared/config-can.yml << EOF
tunnel: $(cloudflared tunnel info dive-v3-can -o json | jq -r .id)
credentials-file: cloudflared/can-tunnel-credentials.json
ingress:
  - hostname: can-app.dive25.com
    service: http://localhost:3003
  - hostname: can-api.dive25.com
    service: http://localhost:4003
  - hostname: can-idp.dive25.com
    service: https://localhost:8446
  - service: http_status:404
EOF

# Route DNS
cloudflared tunnel route dns dive-v3-can can-app.dive25.com
cloudflared tunnel route dns dive-v3-can can-api.dive25.com
cloudflared tunnel route dns dive-v3-can can-idp.dive25.com
```

2. **Manage Existing Tunnels**
```bash
# List all tunnels
cloudflared tunnel list

# View tunnel info
cloudflared tunnel info dive-v3-usa

# Delete tunnel
cloudflared tunnel delete dive-v3-can
```

3. **Monitor Tunnel Health**
```bash
# Check tunnel connectivity
curl -I https://usa-app.dive25.com/api/health

# View tunnel metrics (via Cloudflare dashboard)
wrangler tail dive-v3-usa
```

### Keycloak Docs MCP (CRITICAL FOR PHASE 3)

**Tool:** `mcp_keycloak-docs_docs_search`  
**Purpose:** Access complete Keycloak server administration and Admin API documentation

**🌟 THIS IS YOUR PRIMARY RESOURCE FOR KEYCLOAK FEATURE IMPLEMENTATION**

**How to Use:**

```typescript
// Query format
mcp_keycloak-docs_docs_search({
  query: "Your specific question about Keycloak configuration or Admin API",
  k: 10 // Number of results (optional, default 5)
})
```

**Phase 3 Required Queries (10+ Features):**

1. **Custom Authentication Flows**
```
Query: "How to create custom authentication flows with conditional execution based on user attributes like clearance level?"
```

2. **JavaScript Protocol Mappers**
```
Query: "JavaScript protocol mappers for dynamic claim transformation and calculated attributes in OIDC tokens"
```

3. **Event Listeners Implementation**
```
Query: "Custom event listener implementation for audit logging and webhook integration to external systems"
```

4. **LDAP User Federation**
```
Query: "LDAP user federation configuration and custom user storage provider implementation for external directories"
```

5. **Advanced Session Management**
```
Query: "Advanced session management policies including timeout configuration and concurrent session limits per user"
```

6. **Client Authentication Policies**
```
Query: "Client authentication policies and protocol-specific client access control with conditional enforcement"
```

7. **SAML Advanced Configuration**
```
Query: "Advanced SAML identity provider configuration with custom attribute mapping and encrypted assertions"
```

8. **Fine-Grained Authorization**
```
Query: "Fine-grained authorization services configuration and resource-based permissions in Keycloak"
```

9. **Bulk User Management API**
```
Query: "Admin REST API endpoints for bulk user management and automated configuration updates"
```

10. **Performance Optimization**
```
Query: "Keycloak performance tuning including connection pooling, caching configuration, and database optimization"
```

**Best Practices:**
- ✅ Always query MCP BEFORE implementing new Keycloak features
- ✅ Use specific queries with context (e.g., "for clearance level" not just "authentication")
- ✅ Review API documentation for exact endpoint usage and parameters
- ✅ Test configurations in development before applying to production
- ✅ Document Keycloak-specific implementations in `docs/keycloak-features/`

---

## 🧪 Testing Strategy (Phase 3 Core)

### Test Pyramid (Target Distribution)

```
           /\
          /  \        E2E Tests (20+ scenarios)
         /____\       Playwright - Full user flows
        /      \      
       /________\     Integration Tests (100+ tests)
      /          \    Jest - API integration, Database, OPA
     /____________\   
    /              \  Unit Tests (500+ tests)
   /________________\ Jest - Pure functions, business logic
  /                  \ 
 /____________________\ 
  
 Target: 620+ total tests
 Current: 110 tests (middleware only)
 Gap: 510+ tests needed
```

### Coverage Targets

| Component | Current | Phase 3 Target | Priority |
|-----------|---------|----------------|----------|
| **Backend Overall** | 52.33% | **80%** | 🔴 HIGH |
| Controllers | ~50% | **80%** | 🔴 HIGH |
| Services | ~65% | **85%** | 🔴 HIGH |
| Middleware | ~70% | **90%** | ✅ 3/N DONE |
| Utils | ~80% | **95%** | 🟡 MEDIUM |
| Routes | ~60% | **90%** | 🟡 MEDIUM |
| **Frontend Overall** | ~40% | **80%** | 🟡 MEDIUM |
| Components | ~30% | **80%** | 🟡 MEDIUM |
| Pages | ~20% | **75%** | 🟡 MEDIUM |
| API Routes | ~50% | **85%** | 🟡 MEDIUM |
| **OPA Policies** | ~85% | **100%** | 🔴 HIGH |
| **E2E Scenarios** | 8 | **20+** | 🔴 HIGH |

### Testing Best Practices (MANDATORY)

**✅ DO (What We've Established):**

1. **Read code first** - Check actual exports, don't assume API structure
2. **Test real behavior** - Use actual logic, mock external dependencies only
3. **Comprehensive coverage** - Happy path + error path + edge cases
4. **Security focus** - Test XSS, injection, DoS, CORS, authentication, authorization
5. **Descriptive names** - "should [expected behavior] when [condition]"
6. **Proper isolation** - Mock logger, database, external APIs only
7. **Validate all error conditions** - 401, 403, 404, 500, validation errors
8. **Test edge cases** - Empty arrays, null values, undefined, boundary conditions
9. **100% pass rate** - No flaky tests, reproducible results
10. **Document complex tests** - Explain why test exists, what it validates

**❌ DON'T (Avoid Shortcuts):**

1. ❌ Don't mock everything - Test real business logic
2. ❌ Don't skip negative tests - Error paths are critical for security
3. ❌ Don't assume APIs - Read actual source code and exports
4. ❌ Don't ignore TypeScript errors - Fix them properly
5. ❌ Don't create fake implementations - Test what actually exists
6. ❌ Don't skip validation tests - Input validation is security-critical
7. ❌ Don't use shallow coverage - Deep, meaningful coverage required
8. ❌ Don't optimize prematurely - Correctness before performance
9. ❌ Don't duplicate test logic - DRY principle applies to tests too
10. ❌ Don't commit failing tests - All tests must pass before commit

### Test Template (Use This)

```typescript
/**
 * [Feature Name] Test Suite
 * Target: XX%+ coverage for [file.ts]
 * 
 * Tests:
 * - [Key functionality 1]
 * - [Key functionality 2]
 * - Error handling (401, 403, 404, 500)
 * - Input validation (400 errors)
 * - Edge cases (null, undefined, empty, boundary)
 * - Security scenarios (XSS, injection, DoS)
 */

import { Request, Response, NextFunction } from 'express';
import { functionToTest } from '../path/to/module';
import * as externalDep from '../path/to/dependency';

// Mock external dependencies only (logger, database, external APIs)
jest.mock('../utils/logger', () => ({
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    },
}));

jest.mock('../path/to/dependency');

describe('[Feature Name]', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;

    beforeEach(() => {
        // Fresh mocks for each test
        mockReq = {
            headers: { 'x-request-id': 'test-123' },
            params: {},
            body: {},
            query: {},
        };

        mockRes = {
            json: jest.fn(),
            status: jest.fn().mockReturnThis(),
            send: jest.fn(),
        };

        mockNext = jest.fn();

        // Clear all mocks
        jest.clearAllMocks();
    });

    describe('Happy Path', () => {
        it('should [do expected behavior] when [normal condition]', async () => {
            // Arrange
            mockReq.body = { validInput: true };
            (externalDep.someFunction as jest.Mock).mockResolvedValue({ success: true });

            // Act
            await functionToTest(mockReq as Request, mockRes as Response, mockNext);

            // Assert
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: 'success',
                    data: expect.any(Object),
                })
            );
            expect(mockNext).not.toHaveBeenCalled();
        });
    });

    describe('Error Handling', () => {
        it('should return 401 when not authenticated', async () => {
            mockReq.headers = {}; // No auth header

            await functionToTest(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalled();
            const error = mockNext.mock.calls[0][0];
            expect(error.statusCode).toBe(401);
        });

        it('should return 403 when insufficient permissions', async () => {
            mockReq.user = { clearance: 'CONFIDENTIAL' };
            // Resource requires SECRET

            await functionToTest(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalled();
            const error = mockNext.mock.calls[0][0];
            expect(error.statusCode).toBe(403);
        });

        it('should return 404 when resource not found', async () => {
            mockReq.params = { id: 'non-existent' };
            (externalDep.findById as jest.Mock).mockResolvedValue(null);

            await functionToTest(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalled();
            const error = mockNext.mock.calls[0][0];
            expect(error.statusCode).toBe(404);
        });

        it('should return 500 when external service fails', async () => {
            (externalDep.someFunction as jest.Mock).mockRejectedValue(
                new Error('Service unavailable')
            );

            await functionToTest(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalled();
            const error = mockNext.mock.calls[0][0];
            expect(error.message).toContain('Service unavailable');
        });
    });

    describe('Input Validation', () => {
        it('should return 400 when required field missing', async () => {
            mockReq.body = {}; // Missing required field

            await functionToTest(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalled();
            const error = mockNext.mock.calls[0][0];
            expect(error.statusCode).toBe(400);
            expect(error.message).toContain('required');
        });

        it('should return 400 when input type invalid', async () => {
            mockReq.body = { age: 'not-a-number' }; // Invalid type

            await functionToTest(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalled();
            const error = mockNext.mock.calls[0][0];
            expect(error.statusCode).toBe(400);
        });
    });

    describe('Edge Cases', () => {
        it('should handle null values', async () => {
            mockReq.body = { field: null };

            await functionToTest(mockReq as Request, mockRes as Response, mockNext);

            // Verify behavior with null
        });

        it('should handle empty arrays', async () => {
            mockReq.body = { items: [] };

            await functionToTest(mockReq as Request, mockRes as Response, mockNext);

            // Verify behavior with empty array
        });

        it('should handle undefined values', async () => {
            mockReq.body = { field: undefined };

            await functionToTest(mockReq as Request, mockRes as Response, mockNext);

            // Verify behavior with undefined
        });

        it('should handle boundary conditions', async () => {
            mockReq.body = { value: Number.MAX_SAFE_INTEGER };

            await functionToTest(mockReq as Request, mockRes as Response, mockNext);

            // Verify behavior at boundaries
        });
    });

    describe('Security', () => {
        it('should prevent XSS attacks', async () => {
            mockReq.body = { message: '<script>alert("XSS")</script>' };

            await functionToTest(mockReq as Request, mockRes as Response, mockNext);

            const response = (mockRes.json as jest.Mock).mock.calls[0][0];
            expect(response.message).not.toContain('<script>');
        });

        it('should prevent SQL injection', async () => {
            mockReq.body = { username: "admin' OR '1'='1" };

            await functionToTest(mockReq as Request, mockRes as Response, mockNext);

            // Verify parameterized queries used
        });

        it('should prevent path traversal', async () => {
            mockReq.params = { file: '../../../etc/passwd' };

            await functionToTest(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalled();
            const error = mockNext.mock.calls[0][0];
            expect(error.statusCode).toBe(400);
        });
    });
});
```

---

## 📋 Detailed Task Breakdown

### Week 5 (Days 1-7): Backend Test Coverage (60% → 80%)

**Day 1-2: Controller Tests (Priority 1)** ✅ CURRENT FOCUS

```bash
# Target controllers (0-30% coverage → 80%+):
backend/src/__tests__/policy.controller.test.ts
backend/src/__tests__/auth.controller.test.ts
backend/src/__tests__/admin.controller.test.ts
backend/src/__tests__/otp.controller.test.ts
backend/src/__tests__/compliance.controller.test.ts

# Read actual exports FIRST
cat backend/src/controllers/policy.controller.ts | grep "^export"

# Create comprehensive tests (see template above)

# Verify coverage improvement
npm test -- policy.controller.test.ts --coverage
```

**Day 3-4: Service Tests (Priority 1)**

```bash
# Target services (0-20% coverage → 85%+):
backend/src/__tests__/kms.service.test.ts
backend/src/__tests__/saml-metadata-parser.service.test.ts
backend/src/__tests__/scim.service.test.ts
backend/src/__tests__/otp.service.test.ts
```

**Day 5-6: Integration Tests**

```bash
# Create integration test suites:
backend/src/__tests__/integration/federation-flow.test.ts
backend/src/__tests__/integration/authorization-flow.test.ts
backend/src/__tests__/integration/kas-flow.test.ts
```

**Day 7: Validation & Reporting**

```bash
# Run full test suite
npm test -- --coverage

# Generate coverage report
npm test -- --coverage --coverageReporters=html lcov

# Verify target achieved
# Target: ≥80% backend coverage
```

### Week 6 (Days 8-14): Scalability & Keycloak Features

**Day 8-9: Partner Onboarding Automation**

```bash
# Create onboarding automation script
touch scripts/federation/onboard-partner.sh
chmod +x scripts/federation/onboard-partner.sh

# Implement 7-step automation (see above)

# Test with Canada (CAN)
time ./scripts/federation/onboard-partner.sh can "Canada"

# Verify: < 2 hours total
```

**Day 10-11: GCP Secret Manager Integration**

```bash
# Create GCP project
gcloud projects create dive-v3-pilot

# Setup secret storage
./scripts/gcp/setup-project.sh

# Migrate all secrets
./scripts/gcp/migrate-secrets.sh --from-env --to-gcp

# Update docker-compose to use GCP secrets
# Verify all services can access secrets
```

**Day 12-13: Keycloak Feature Implementation (Use MCP)**

```bash
# Query Keycloak Docs MCP for each feature
# Document in docs/keycloak-features/

# Feature 1: Custom Authentication Flows
mcp_keycloak-docs_docs_search("How to create custom authentication flows...")

# Feature 2: JavaScript Protocol Mappers
mcp_keycloak-docs_docs_search("JavaScript protocol mappers for dynamic...")

# Feature 3-10: Continue systematically

# Update Terraform for each feature
# Test each feature thoroughly
```

**Day 14: CAN Partner Validation**

```bash
# Verify CAN partner fully operational
./tests/e2e/test-federation-matrix.sh --include can

# Test all 20 federation links (5 nations × 4 partners each)
# USA ↔ FRA, USA ↔ GBR, USA ↔ DEU, USA ↔ CAN (4)
# FRA ↔ USA, FRA ↔ GBR, FRA ↔ DEU, FRA ↔ CAN (4)
# GBR ↔ USA, GBR ↔ FRA, GBR ↔ DEU, GBR ↔ CAN (4)
# DEU ↔ USA, DEU ↔ FRA, DEU ↔ GBR, DEU ↔ CAN (4)
# CAN ↔ USA, CAN ↔ FRA, CAN ↔ GBR, CAN ↔ DEU (4)
# Total: 20 bilateral links

# Expected: All pass
```

### Week 7 (Days 15-21): Performance, Resilience & Completion

**Day 15-16: Performance Testing**

```bash
# Setup k6 load testing
npm install -g k6

# Create load test scripts
tests/performance/auth-load.js
tests/performance/authz-load.js
tests/performance/federation-load.js

# Run load tests
k6 run --vus 50 --duration 10m tests/performance/auth-load.js

# Validate targets:
# - p95 < 200ms
# - 100 req/s sustained
# - Error rate < 0.1%
```

**Day 17-18: Resilience & Chaos Testing**

```bash
# Create chaos test scenarios
tests/resilience/chaos-test.sh

# Test scenarios:
# 1. Keycloak instance down
# 2. OPA service unavailable
# 3. MongoDB connection lost
# 4. Redis cache failure
# 5. Network latency injection
# 6. Resource exhaustion (memory, CPU, disk)

# Document recovery procedures
docs/runbooks/incident-response.md
```

**Day 19-20: Monitoring & Observability**

```bash
# Configure Prometheus exporters
# Create Grafana dashboards
# Setup Alertmanager rules

# Dashboards:
monitoring/grafana-dashboards/application-metrics.json
monitoring/grafana-dashboards/infrastructure-metrics.json
monitoring/grafana-dashboards/business-metrics.json

# Start 7-day uptime monitoring
# Target: 99.9% uptime
```

**Day 21: Phase 3 Completion Report**

```bash
# Generate completion report
docs/PHASE3-COMPLETION-REPORT.md

# Include:
# - All objectives met (SMART criteria)
# - Test coverage results (≥80%)
# - CAN partner onboarding proof (<2 hours)
# - Keycloak features implemented (10+)
# - Performance validation (p95 < 200ms)
# - Resilience testing results
# - Monitoring dashboards
# - Lessons learned
# - Phase 4 recommendations
```

---

## 🔄 Persistence & Resilience Requirements

### 100% Persistent Solution Checklist

**✅ Data Persistence:**
- [ ] PostgreSQL persistent volumes (Keycloak state)
- [ ] MongoDB persistent volumes (resource metadata)
- [ ] Redis AOF + RDB persistence (session cache, blacklist)
- [ ] Backup strategy (daily automated backups)
- [ ] Disaster recovery plan (RPO 24h, RTO 4h)

**✅ Configuration Persistence:**
- [ ] All Terraform state in remote backend (GCS/S3)
- [ ] All secrets in GCP Secret Manager (not .env files)
- [ ] Federation registry as SSOT (version controlled)
- [ ] Docker volume backups (automated)

**✅ Service Resilience:**
- [ ] Health checks for all services (liveness, readiness)
- [ ] Automatic restart policies (on-failure, unless-stopped)
- [ ] Graceful shutdown handling (SIGTERM, connection draining)
- [ ] Circuit breakers (prevent cascade failures)
- [ ] Retry logic with exponential backoff

**✅ Network Resilience:**
- [ ] Multiple DNS providers (Cloudflare + Route53)
- [ ] Load balancing (future: NGINX/HAProxy)
- [ ] SSL/TLS certificate auto-renewal
- [ ] DDoS protection (Cloudflare)

**✅ Monitoring & Alerting:**
- [ ] 24/7 uptime monitoring
- [ ] Alert on service failures
- [ ] Alert on performance degradation
- [ ] Alert on security events
- [ ] Alert on resource exhaustion

---

## 📁 Critical Files Reference

### Configuration Files (SSOT)

```
config/
├── federation-registry.json         ← SINGLE SOURCE OF TRUTH
└── federation-registry.schema.json  ← JSON Schema validation
```

### Generated Files (Auto-Generated from SSOT)

```
terraform/instances/
├── usa.tfvars  ← Generated by generate-tfvars.sh
├── fra.tfvars
├── gbr.tfvars
├── deu.tfvars
└── can.tfvars  ← New partner

instances/
├── usa/docker-compose.yml  ← Generated by generate-docker-compose.sh
├── fra/docker-compose.yml
├── gbr/docker-compose.yml
├── deu/docker-compose.yml
└── can/docker-compose.yml  ← New partner
```

### Test Files (Your Focus)

```
backend/src/__tests__/
├── compression.middleware.test.ts       ✅ 34 tests (DONE)
├── security-headers.middleware.test.ts  ✅ 37 tests (DONE)
├── validation.middleware.test.ts        ✅ 39 tests (DONE)
├── policy.controller.test.ts            🚧 TODO (HIGH PRIORITY)
├── auth.controller.test.ts              🚧 TODO (HIGH PRIORITY)
├── admin.controller.test.ts             🚧 TODO (HIGH PRIORITY)
└── [500+ more tests needed...]

policies/tests/
├── clearance_tests.rego                 🚧 ENHANCE (85% → 100%)
├── releasability_tests.rego             🚧 ENHANCE
├── coi_tests.rego                       🚧 ENHANCE
└── embargo_tests.rego                   🚧 ENHANCE

tests/e2e/playwright/
├── auth.spec.ts                         ✅ EXISTS
├── authz.spec.ts                        ✅ EXISTS
├── federation.spec.ts                   ✅ EXISTS
├── auth-mfa.spec.ts                     🚧 TODO (NEW)
├── session-management.spec.ts           🚧 TODO (NEW)
├── rate-limiting.spec.ts                🚧 TODO (NEW)
└── [12+ more scenarios needed...]
```

### Automation Scripts (Phase 3 Focus)

```
scripts/federation/
├── onboard-partner.sh                   🚧 TODO (CRITICAL)
├── validate-config.sh                   ✅ EXISTS
├── generate-tfvars.sh                   ✅ EXISTS
├── generate-docker-compose.sh           ✅ EXISTS
└── test-new-partner.sh                  🚧 TODO

scripts/gcp/
├── setup-project.sh                     🚧 TODO (HIGH PRIORITY)
├── store-secrets.sh                     🚧 TODO (HIGH PRIORITY)
├── rotate-secrets.sh                    🚧 TODO
└── backup-secrets.sh                    🚧 TODO

scripts/monitoring/
├── add-instance.sh                      🚧 TODO
└── generate-dashboards.sh               🚧 TODO
```

---

## 🚀 HOW TO START (Step-by-Step)

### Step 1: Verify Current State (5 minutes)

```bash
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3

# Check git status
git status

# Verify current branch
git branch --show-current

# Pull latest changes
git pull origin main

# Navigate to backend
cd backend

# Run existing tests to confirm baseline
npm test -- --coverage --coverageReporters=text-summary

# Expected output:
# Lines: 52.33%
# Statements: 52.78%
# Branches: 42.41%
# Functions: 52.3%

# Verify 3 middleware tests still pass
npm test -- compression.middleware.test.ts security-headers.middleware.test.ts validation.middleware.test.ts

# Expected: 110 tests passing
```

### Step 2: Choose Your Focus Area

**Option A: Continue Backend Testing (Recommended)**
```bash
# Read the policy controller (check actual exports)
cat src/controllers/policy.controller.ts | grep "^export"

# Create test file
touch src/__tests__/policy.controller.test.ts

# Use the test template (see above)
# Target: 80%+ coverage

# Run tests
npm test -- policy.controller.test.ts --coverage
```

**Option B: Start Partner Onboarding Automation**
```bash
# Create onboarding script
touch ../scripts/federation/onboard-partner.sh
chmod +x ../scripts/federation/onboard-partner.sh

# Implement 7-step automation
# Target: < 2 hours total for CAN partner
```

**Option C: Keycloak Feature Implementation**
```bash
# Query Keycloak Docs MCP for first feature
# Example: Custom Authentication Flows

# Create documentation
mkdir -p ../docs/keycloak-features
touch ../docs/keycloak-features/custom-authentication-flows.md

# Update Terraform
# Test feature
# Document results
```

### Step 3: Work Systematically

**For Backend Testing:**
1. Read actual source code FIRST
2. Identify all exported functions
3. Create comprehensive test suite (use template)
4. Run tests (verify pass)
5. Check coverage improvement
6. Move to next controller/service
7. Repeat until 80% coverage achieved

**For Partner Onboarding:**
1. Design automation script (7 steps)
2. Implement each step systematically
3. Test each step independently
4. Integrate full workflow
5. Time end-to-end execution
6. Verify < 2 hours
7. Document process

**For Keycloak Features:**
1. Query Keycloak Docs MCP for feature details
2. Read Admin API documentation
3. Test in development Keycloak first
4. Update Terraform configuration
5. Apply to all instances
6. Test feature thoroughly
7. Document in `docs/keycloak-features/`
8. Move to next feature

### Step 4: Track Progress

Update TODO list as you complete tasks:

```bash
# View current TODOs
# (The system will show you active TODO items)

# Mark completed tasks
# (Use todo_write tool to update status)
```

### Step 5: Validate & Document

After completing major milestones:

```bash
# Run full test suite
npm test -- --coverage

# Generate coverage report
npm test -- --coverage --coverageReporters=html

# Open in browser
open coverage/lcov-report/index.html

# Document completion
# Update PHASE3-COMPLETION-REPORT.md
```

---

## 🆘 Common Issues & Solutions

### Issue 1: Tests Fail Due to Missing Exports

**Symptom:** `Module has no exported member 'functionName'`

**Solution:**
```bash
# Check actual exports
grep "^export" backend/src/path/to/file.ts

# Update test imports to match reality
# Don't assume - read the code first!
```

### Issue 2: Mock Not Working

**Symptom:** Real implementation called instead of mock

**Solution:**
```typescript
// Place mock BEFORE imports
jest.mock('../path/to/module', () => ({
    functionName: jest.fn(),
}));

// Then import
import { functionToTest } from '../path/to/module';
```

### Issue 3: Async Test Timeout

**Symptom:** Test hangs or times out after 15 seconds

**Solution:**
```typescript
// Ensure async/await
it('should work', async () => {
    await functionUnderTest();
});

// Increase timeout if needed
jest.setTimeout(30000);

// Check for unresolved promises
// Use --detectOpenHandles to debug
```

### Issue 4: Coverage Not Improving

**Symptom:** Coverage percentage stays same despite new tests

**Solution:**
```bash
# Verify tests actually run the code
# Add tests for error paths (often missed)
# Test edge cases
# Check coverage report for uncovered lines

npm test -- path/to/test.test.ts --coverage --verbose
```

### Issue 5: Keycloak MCP Query Returns No Results

**Symptom:** MCP search returns empty or irrelevant results

**Solution:**
- Make query more specific
- Add context to question
- Try different phrasing
- Query for examples: "example of custom authentication flow configuration"

### Issue 6: GCP Secret Manager Access Denied

**Symptom:** `Permission denied` when accessing secrets

**Solution:**
```bash
# Verify authentication
gcloud auth application-default login

# Check project
gcloud config get-value project

# Verify IAM roles
gcloud projects get-iam-policy dive-v3-pilot

# Add Secret Manager Admin role if missing
gcloud projects add-iam-policy-binding dive-v3-pilot \
  --member="user:your-email@example.com" \
  --role="roles/secretmanager.admin"
```

---

## 📊 Success Metrics & Validation

### Phase 3 Complete When:

- ✅ Backend test coverage ≥ 80% (lines, statements)
- ✅ Frontend test coverage ≥ 80% (components, pages)
- ✅ OPA policy coverage = 100% (all scenarios)
- ✅ E2E test scenarios ≥ 20 (comprehensive flows)
- ✅ All tests passing (≥ 95% pass rate)
- ✅ Zero flaky tests (reproducible results)
- ✅ CAN partner operational in < 2 hours (timed test)
- ✅ 10+ Keycloak features implemented (documented + tested)
- ✅ GCP Secret Manager integration active (all instances)
- ✅ p95 latency < 200ms (load testing validated)
- ✅ Sustained throughput ≥ 100 req/s (10-minute test)
- ✅ Error rate < 0.1% (HTTP 5xx responses)
- ✅ System uptime ≥ 99.9% (7-day monitoring)
- ✅ Chaos testing complete (all scenarios recovered)
- ✅ Monitoring dashboards operational (Prometheus + Grafana)
- ✅ Documentation complete (runbooks, ADRs, API docs)

### Validation Checklist

Before marking Phase 3 complete, validate:

```bash
# 1. Test Coverage
npm test -- --coverage
# Verify: Backend ≥80%, Frontend ≥80%, OPA 100%

# 2. Partner Onboarding
time ./scripts/federation/onboard-partner.sh can "Canada"
# Verify: < 2 hours, all services operational

# 3. Keycloak Features
ls -la docs/keycloak-features/
# Verify: ≥10 documented features with tests

# 4. Performance
k6 run --vus 50 --duration 10m tests/performance/auth-load.js
# Verify: p95 < 200ms, 100 req/s sustained

# 5. Resilience
./tests/resilience/chaos-test.sh
# Verify: All scenarios recovered

# 6. Monitoring
open http://localhost:3333  # Grafana
# Verify: All dashboards showing data

# 7. Federation Matrix
./tests/e2e/test-federation-matrix.sh
# Verify: All 20 links operational

# 8. Documentation
ls -la docs/runbooks/
ls -la docs/keycloak-features/
ls -la docs/adr/
# Verify: Complete and up-to-date
```

---

## 🎯 Your Mission Summary

**Primary Goal:** Complete Phase 3 of DIVE V3 with 100% success across all objectives

**Focus Areas:**
1. **Testing** - 80%+ backend/frontend coverage, 100% OPA, 20+ E2E
2. **Scalability** - <2 hour partner onboarding (CAN test case)
3. **Keycloak** - 10+ advanced features using MCP docs
4. **Resilience** - 100% persistent, validated performance/uptime
5. **Automation** - GCP Secret Manager, monitoring, documentation

**Timeline:** Complete by December 19, 2025 (21 days)

**Approach:** Best practices only - no shortcuts, comprehensive coverage, production-grade quality

**Success Criteria:** See detailed checklist above (15 criteria must pass)

**Tools Available:**
- ✅ GitHub CLI (full permissions)
- ✅ GCP CLI (create new project: dive-v3-pilot)
- ✅ Cloudflare CLI (tunnel management)
- ✅ Keycloak Docs MCP (complete Admin API documentation)
- ✅ All development tools (Jest, Playwright, k6, Terraform)

**Remember:**
- Read code first, don't assume
- Test comprehensively (happy + error + edge)
- Use Keycloak Docs MCP extensively
- Document as you go
- Validate everything
- No shortcuts - production quality required

---

## 📚 Reference Documents

**Primary Documents:**
- `docs/PHASE3-HANDOFF-PROMPT.md` - Original Phase 3 plan
- `docs/PHASE3-PROGRESS-HANDOFF.md` - Previous session progress
- `docs/PHASE3-SESSION-SUMMARY.md` - Quick summary

**Implementation Specs:**
- `docs/dive-v3-implementation-plan.md` - 8-week plan
- `docs/dive-v3-backend.md` - Backend specification
- `docs/dive-v3-frontend.md` - Frontend specification
- `docs/dive-v3-requirements.md` - Requirements
- `docs/dive-v3-security.md` - Security requirements

**Configuration:**
- `config/federation-registry.json` - SSOT for federation
- `config/federation-registry.schema.json` - JSON Schema

**Scripts:**
- `scripts/federation/` - Federation automation
- `scripts/gcp/` - GCP Secret Manager scripts
- `scripts/monitoring/` - Monitoring setup

---

**🚀 YOU ARE READY TO BEGIN PHASE 3 COMPLETION**

**Start with:** Backend test coverage (52.33% → 80%)  
**Next:** Partner onboarding automation (<2 hours)  
**Then:** Keycloak feature maximization (10+ features)  
**Finally:** Performance validation + completion report

**Good luck! Let's build a production-ready coalition ICAM platform! 🎉**

---

*Document Version: 2.0*  
*Created: November 28, 2025*  
*Session: Phase 3 Complete - Full Context Handoff*  
*Previous Phases: Phase 1 (✅ Complete), Phase 2 (✅ Complete), Phase 3 (🚧 15% Complete)*  
*Target Completion: December 19, 2025*  
*Classification: INTERNAL USE ONLY*








