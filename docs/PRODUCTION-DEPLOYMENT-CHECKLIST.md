# DIVE V3 Production Deployment Checklist

**Version**: 1.0 (Phase 7)  
**Date**: October 30, 2025  
**Status**: Ready for Production Deployment

---

## Pre-Deployment (T-7 days)

### Infrastructure Preparation

- [ ] **Environment Provisioning**
  - [ ] Production servers provisioned (22 cores, 28GB RAM, 335GB disk)
  - [ ] Network segmentation configured
  - [ ] Firewall rules applied (ports: 8081, 4000, 3000, 8080, 8181)
  - [ ] Load balancer configured (if applicable)
  - [ ] DNS records created

- [ ] **Security Setup**
  - [ ] TLS certificates obtained (Let's Encrypt or corporate CA)
  - [ ] Certificate expiry monitoring enabled (30-day alerts)
  - [ ] mTLS configured for KAS communication
  - [ ] HSM/KMS integration tested
  - [ ] Secrets vault configured (HashiCorp Vault, AWS Secrets Manager, etc.)

- [ ] **Database Preparation**
  - [ ] PostgreSQL 15 installed and hardened
  - [ ] MongoDB 7 installed and hardened
  - [ ] Redis 7 installed with AUTH enabled
  - [ ] Database encryption at rest enabled
  - [ ] Backup automation configured (daily at 2 AM)
  - [ ] Restore procedure tested

### Configuration Review

- [ ] **Environment Variables**
  - [ ] Copy `config/production.env.template` to `.env.production`
  - [ ] Fill in all `CHANGE_ME` values with strong passwords
  - [ ] Generate JWT secrets: `openssl rand -base64 32`
  - [ ] Verify KMS/HSM credentials
  - [ ] Configure SMTP settings for alerts
  - [ ] Set backup S3 bucket credentials

- [ ] **Terraform Configuration**
  - [ ] Review `terraform/*.tf` files
  - [ ] Verify Keycloak provider version (5.5.0)
  - [ ] Run `terraform plan` and review changes
  - [ ] Backup existing Terraform state
  - [ ] Configure remote state backend (S3 + DynamoDB for locking)

- [ ] **Keycloak Realm Configuration**
  - [ ] Verify 10 IdP configurations (USA, Spain, France, UK, Germany, Italy, Netherlands, Poland, Canada, Industry)
  - [ ] Verify MFA flows (Phase 1-6 complete)
  - [ ] Verify Custom SPI JAR (`dive-keycloak-extensions.jar` 1.4MB)
  - [ ] Verify attribute mappers (81/81 clearance mappings)
  - [ ] Test federation with each external IdP

### Testing on Staging

- [ ] **Regression Testing**
  - [ ] OPA policy tests: 175/175 passing
  - [ ] Crypto services tests: 29/29 passing
  - [ ] Decision logging tests: 15/15 passing
  - [ ] MFA enrollment tests: 19/19 passing
  - [ ] Backend integration tests: ≥96% coverage
  - [ ] Frontend component tests: ≥83% coverage

- [ ] **Performance Testing**
  - [ ] Load testing: 100 req/s sustained
  - [ ] OPA decision latency: p95 < 200ms
  - [ ] KAS key release latency: p95 < 300ms
  - [ ] Frontend LCP < 2.5s (Lighthouse)

- [ ] **Security Scanning**
  - [ ] npm audit (backend, frontend, kas): No critical vulnerabilities
  - [ ] Docker image scan (Trivy): No high/critical CVEs
  - [ ] Terraform scan (tfsec, Checkov): No security issues
  - [ ] Secret scan (TruffleHog): No exposed secrets

### Documentation

- [ ] **Verify Complete**
  - [ ] Implementation Plan updated (Phases 1-7 marked complete)
  - [ ] CHANGELOG.md updated (Phase 6 entry added)
  - [ ] README.md updated (test results, MFA flow, Phase 6 features)
  - [ ] PRODUCTION-DEPLOYMENT-GUIDE.md reviewed
  - [ ] RUNBOOK.md reviewed
  - [ ] PHASE-7-QA-REPORT.md completed

---

## Deployment Day (T-0)

### Pre-Deployment Checks (2 hours before)

- [ ] **Team Coordination**
  - [ ] Deployment team assembled (security, ops, backend, frontend)
  - [ ] Stakeholders notified (security architect, product owner)
  - [ ] Rollback team on standby
  - [ ] Communication channel open (Slack, Teams, etc.)

- [ ] **System Backups**
  - [ ] Keycloak PostgreSQL database backed up
  - [ ] Application PostgreSQL database backed up
  - [ ] MongoDB backed up
  - [ ] Terraform state backed up
  - [ ] Docker images tagged with pre-deployment version
  - [ ] Backup integrity verified

- [ ] **Final Verification**
  - [ ] All CI/CD workflows passing (6/6 green)
  - [ ] No active incidents or alerts
  - [ ] External IdPs operational
  - [ ] Network connectivity verified
  - [ ] DNS propagation complete

### Deployment Execution

- [ ] **Step 1: Infrastructure Deployment**
  ```bash
  cd terraform
  terraform init
  terraform plan -out=tfplan
  terraform apply tfplan
  ```
  - [ ] Terraform apply successful
  - [ ] Zero drift after apply
  - [ ] All 14 realms created
  - [ ] 47 users provisioned
  - [ ] 10 IdPs configured

- [ ] **Step 2: Database Initialization**
  - [ ] PostgreSQL tables created
  - [ ] MongoDB collections created (`resources`, `decisions`, `key_releases`)
  - [ ] TTL indexes created (90-day retention)
  - [ ] Seed data loaded (7,002 resources)

- [ ] **Step 3: Service Deployment**
  ```bash
  ./scripts/deploy-production.sh production
  ```
  - [ ] Docker images pulled/built
  - [ ] Services started in order (postgres → mongo → redis → keycloak → opa → backend → kas → frontend)
  - [ ] All containers healthy

- [ ] **Step 4: Health Checks**
  ```bash
  ./scripts/health-check.sh
  ```
  - [ ] All health checks passing (≥90% success rate)
  - [ ] Keycloak responding (http://localhost:8081)
  - [ ] Backend API responding (http://localhost:4000)
  - [ ] Frontend responding (http://localhost:3000)
  - [ ] OPA responding (http://localhost:8181)
  - [ ] KAS responding (http://localhost:8080)

- [ ] **Step 5: Smoke Tests**
  - [ ] OPA tests: `docker exec dive-v3-opa opa test /policies` (175/175)
  - [ ] Backend health: `curl http://localhost:4000/health` (status: healthy)
  - [ ] MFA enforcement: admin-dive blocked without OTP ✅
  - [ ] Authorization: Test ALLOW/DENY decisions
  - [ ] KAS: Test key release with policy re-evaluation

### Post-Deployment Verification (1 hour)

- [ ] **Functional Testing**
  - [ ] **MFA Enrollment (Phase 6)**:
    - [ ] admin-dive (TOP_SECRET) enrollment: Setup OTP → login with code → credential created
    - [ ] Subsequent login with existing credential working
    - [ ] bob.contractor (UNCLASSIFIED) login without OTP working
  
  - [ ] **Federation (Phase 1)**:
    - [ ] USA OIDC IdP login successful
    - [ ] Spain SAML IdP login successful
    - [ ] France SAML IdP login successful
    - [ ] Post-broker MFA flow working
  
  - [ ] **Authorization (Phase 3)**:
    - [ ] USA TOP_SECRET → USA SECRET resource: ALLOW
    - [ ] USA CONFIDENTIAL → USA SECRET resource: DENY
    - [ ] FRA CONFIDENTIEL_DEFENSE → FVEY resource: Releasability check
    - [ ] AccessDenied component shows correct reason codes
  
  - [ ] **Data-Centric Security (Phase 4)**:
    - [ ] ZTDF metadata signature verification working
    - [ ] KAS key release policy re-evaluation working
    - [ ] Decision logging to MongoDB working
    - [ ] 90-day TTL enforced

- [ ] **Monitoring Setup**
  - [ ] Prometheus collecting metrics (port 9090)
  - [ ] Grafana dashboards loading (port 3001)
  - [ ] AlertManager configured (port 9093)
  - [ ] Alerts testing (send test alert to Slack/email)
  - [ ] Log aggregation working (Syslog/SIEM)

- [ ] **Security Verification**
  - [ ] TLS certificates valid and not expiring soon
  - [ ] mTLS handshake successful (KAS)
  - [ ] No exposed secrets in environment
  - [ ] Audit logs capturing all authentication attempts
  - [ ] PII minimization working (only uniqueID logged)

### Monitoring Period (24 hours)

- [ ] **Hour 1-4: Intensive Monitoring**
  - [ ] Monitor service logs for errors
  - [ ] Check resource utilization (CPU, RAM, disk)
  - [ ] Verify no connection pool exhaustion
  - [ ] Watch for authentication failures
  - [ ] Monitor authorization decision latency

- [ ] **Hour 4-8: Standard Monitoring**
  - [ ] Review Grafana dashboards
  - [ ] Check alert silence
  - [ ] Verify backup jobs running
  - [ ] Test sample user logins across all 10 IdPs

- [ ] **Hour 8-24: Passive Monitoring**
  - [ ] On-call team available
  - [ ] Automated alerts configured
  - [ ] Rollback procedure ready if needed

---

## Post-Deployment (T+1 to T+7 days)

### Day 1: Immediate Follow-up

- [ ] **Performance Analysis**
  - [ ] Review OPA decision latency (target: p95 < 200ms)
  - [ ] Review KAS key release latency (target: p95 < 300ms)
  - [ ] Check database query performance
  - [ ] Verify no memory leaks

- [ ] **User Acceptance Testing**
  - [ ] 10 test users from each nation login successfully
  - [ ] MFA enrollment tested with 5 classified users
  - [ ] Resource access tested (ALLOW and DENY scenarios)
  - [ ] Report generation working

### Day 3: Mid-Week Review

- [ ] **Metrics Review**
  - [ ] Uptime: ≥99.9%
  - [ ] Authentication success rate: ≥98%
  - [ ] Authorization decision accuracy: 100%
  - [ ] Zero data breaches or security incidents

- [ ] **User Feedback**
  - [ ] Collect feedback from pilot users
  - [ ] Document any usability issues
  - [ ] Create improvement backlog

### Day 7: Weekly Review

- [ ] **System Health**
  - [ ] All services running smoothly
  - [ ] No critical alerts
  - [ ] Backup restore tested successfully
  - [ ] Disaster recovery runbook verified

- [ ] **Documentation Updates**
  - [ ] Update RUNBOOK.md with production-specific notes
  - [ ] Document any configuration changes
  - [ ] Update incident response procedures

- [ ] **Compliance Verification**
  - [ ] ACP-240 AAL2 enforcement: 100% for classified users
  - [ ] 90-day audit trail: Verified
  - [ ] Attribute normalization: 100% (47/47 users)
  - [ ] Decision logging: Working correctly

---

## Rollback Procedure

**If ANY critical issue occurs, execute rollback immediately:**

```bash
./scripts/rollback.sh ./backups/YYYYMMDD-HHMMSS
```

**Rollback Triggers**:
- MFA enforcement failing (≥10% false positive rate)
- Authorization decisions incorrect (≥1% error rate)
- Service downtime ≥15 minutes
- Data corruption detected
- Security breach suspected

**Rollback SLA**: < 30 minutes to restore previous working state

---

## Sign-Off

**Deployment Team**:
- [ ] Security Architect: _________________ Date: _______
- [ ] Lead Engineer: _________________ Date: _______
- [ ] DevOps Engineer: _________________ Date: _______
- [ ] QA Engineer: _________________ Date: _______

**Stakeholders**:
- [ ] Product Owner: _________________ Date: _______
- [ ] Security Operations: _________________ Date: _______
- [ ] CISO (if required): _________________ Date: _______

**Final Approval**: 
- [ ] ✅ **APPROVED FOR PRODUCTION**
- [ ] ⚠️ **CONDITIONAL APPROVAL** (conditions: _________________)
- [ ] ❌ **REJECTED** (reasons: _________________)

---

**Deployment Date**: _______________________  
**Completion Time**: _______________________  
**Total Duration**: _______ hours  
**Issues Encountered**: _______________________  
**Lessons Learned**: _______________________  

**Status**: ⬜ **PENDING** | ⬜ **IN PROGRESS** | ⬜ **COMPLETE** | ⬜ **ROLLED BACK**

