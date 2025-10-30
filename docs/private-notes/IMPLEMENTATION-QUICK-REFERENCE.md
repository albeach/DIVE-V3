# DIVE-V3 Implementation Quick Reference Card

**Version**: 1.0 | **Date**: 2025-10-29 | **Status**: READY

---

## 🚀 Phase Quick Commands

### Phase 0: Readiness
```bash
# Check all services
docker ps | grep dive-v3

# Terraform status
cd terraform && terraform plan

# Test suite baseline
cd backend && npm test
cd frontend && npm test
docker exec dive-v3-opa opa test /policies -v
```

### Phase 1: Federation & MFA
```bash
# Export flows
docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh get \
  authentication/flows/Post-Broker%20Classified%20MFA \
  -r dive-v3-broker > flows/post-broker-mfa.json

# Test MFA enforcement
./scripts/test-mfa-flow.sh CONFIDENTIAL broker-login

# Run E2E
cd frontend && npm run test:e2e -- mfa-conditional.spec.ts
```

### Phase 2: Attributes
```bash
# Repair drift
./scripts/repair-clearance-drift.sh

# Verify conformance
./scripts/verify-mapper-conformance.sh
./scripts/verify-clearance-attributes.sh

# Test normalization
cd backend && npm test -- clearance-mapper.service.spec.ts
docker exec dive-v3-opa opa test /policies clearance_normalization_test.rego
```

### Phase 3: ABAC Policies
```bash
# Audit default-deny
./scripts/audit-default-deny.sh

# Test policies
docker exec dive-v3-opa opa test /policies -v

# Benchmark performance
ab -n 1000 -c 10 http://localhost:8181/v1/data/dive/authorization/decision \
  -p test-data/sample-decision.json -T application/json

# OPA/XACML parity
./scripts/test-opa-xacml-parity.sh
```

### Phase 4: Data-Centric
```bash
# Test crypto binding
cd backend && npm test -- ztdf-crypto.service.spec.ts

# Test KEK wrapping
cd backend && npm test -- kms.service.spec.ts

# OpenTDF PoC
node scripts/opentdf-poc.js

# KAS mTLS test
curl --cert /certs/client-cert.pem --key /certs/client-key.pem \
  https://localhost:8080/request-key -d '{"resourceId":"doc-123"}' \
  -H "Content-Type: application/json"
```

### Phase 5: Terraform
```bash
# Validate
cd terraform && terraform validate

# Format check
terraform fmt -check -recursive

# Plan (expect zero drift)
terraform plan -detailed-exitcode

# Apply
terraform apply -auto-approve
```

### Phase 6: Audit & SIEM
```bash
# Enable Keycloak events
./scripts/enable-keycloak-events.sh

# Check logs
tail -f logs/decision.log
tail -f logs/kas-audit.log

# Test SIEM forwarding
# Check Splunk/ELK dashboard
```

### Phase 7: CI/CD
```bash
# Run CI locally
act -W .github/workflows/terraform-ci.yml
act -W .github/workflows/opa-ci.yml

# Trigger drift detection
gh workflow run drift-detection.yml

# Check CI status
gh run list --workflow=terraform-ci.yml
```

---

## 📋 Critical Checkpoints

### Before Each Phase
```bash
# Backup Terraform state
cp terraform/terraform.tfstate terraform/terraform.tfstate.backup-$(date +%Y%m%d)

# Backup Keycloak DB
pg_dump -h localhost -p 5433 -U postgres keycloak_db > keycloak-backup-$(date +%Y%m%d).sql

# Backup MongoDB
mongodump --host localhost --port 27017 --out=mongo-backup-$(date +%Y%m%d)

# Tag Docker images
docker tag dive-v3-backend:latest dive-v3-backend:pre-P${PHASE}
```

### After Each Phase
```bash
# Run full test suite
cd backend && npm test
cd frontend && npm test
docker exec dive-v3-opa opa test /policies -v

# Check drift
cd terraform && terraform plan -detailed-exitcode

# Lint
npm run lint
terraform fmt -check -recursive

# Update CHANGELOG
echo "## Phase ${PHASE} Complete ($(date))" >> CHANGELOG.md
```

---

## 🎯 Go/No-Go Decision Points

| Week | Checkpoint | Criteria | Status |
|------|------------|----------|--------|
| 2 | P1 Complete | 12/12 MFA tests PASS | ⬜ |
| 3 | P2 Complete | 40/40 users have attrs | ⬜ |
| 4 | P3 Complete | OPA p95 < 200ms | ⬜ |
| 6 | P4 Complete | Crypto binding verified | ⬜ |
| 7 | P5 Complete | Zero Terraform drift | ⬜ |
| 8 | P6 Complete | 90-day retention active | ⬜ |
| 9 | P7 Complete | All CI/CD GREEN | ⬜ |
| 10 | Production | 80/80 criteria met | ⬜ |

---

## 🚨 Emergency Rollback

```bash
# Quick rollback (any phase)
cd terraform
terraform state push terraform.tfstate.backup-YYYYMMDD

# Restore Keycloak
psql -h localhost -p 5433 -U postgres keycloak_db < keycloak-backup-YYYYMMDD.sql

# Restore MongoDB
mongorestore --host localhost --port 27017 mongo-backup-YYYYMMDD/

# Restart services
docker-compose restart

# Verify health
curl http://localhost:4000/health
curl http://localhost:8081/realms/master
```

**Rollback SLA**: < 30 minutes

---

## 🔍 Key File Locations

### Configuration
- Keycloak: `docker-compose.yml` (line 15-80)
- Terraform: `terraform/main.tf`
- OPA Policies: `policies/*.rego`
- Backend: `backend/src/server.ts`
- Frontend: `frontend/src/app/`

### Tests
- Backend: `backend/src/__tests__/`
- Frontend: `frontend/tests/`
- OPA: `policies/tests/`
- E2E: `frontend/tests/e2e/`

### Documentation
- Playbook Part 1: `DIVE-V3-IMPLEMENTATION-PLAYBOOK-PART-1.md`
- Playbook Part 2: `DIVE-V3-IMPLEMENTATION-PLAYBOOK-PART-2.md`
- Playbook Part 3: `DIVE-V3-IMPLEMENTATION-PLAYBOOK-PART-3.md`
- Master Index: `DIVE-V3-IMPLEMENTATION-PLAYBOOK-README.md`

### Grounding Docs
- Tech Stack Audit: `DIVE-V3-TECH-STACK-AUDIT.md`
- Clearance Normalization: `FINAL-CLEARANCE-NORMALIZATION-SUMMARY.md`
- MFA Architecture: `POST-BROKER-MFA-ARCHITECTURE.md`
- ACP-240 Integration: `ADATP-5663-ACP-240-INTEGRATION-COMPLETE.md`

---

## 📊 Success Metrics Dashboard

```bash
# OPA Performance
ab -n 1000 -c 10 http://localhost:8181/v1/data/dive/authorization/decision

# KAS Performance
ab -n 500 -c 5 https://localhost:8080/request-key

# Test Coverage
cd backend && npm run test:coverage
cd frontend && npm run test:coverage
docker exec dive-v3-opa opa test /policies --coverage

# Terraform Drift
cd terraform && terraform plan -detailed-exitcode
```

**Target SLOs**:
- OPA p95 < 200ms ✅
- KAS p95 < 300ms ✅
- Test coverage ≥ 95% ✅
- Terraform drift = 0 ✅

---

## 🔑 Essential Commands Reference

### Keycloak Admin
```bash
# Login
docker exec -it dive-v3-keycloak /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080 --realm master --user admin --password admin

# Get realms
docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh get realms

# Get users
docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh get users -r dive-v3-broker

# Update user attribute
docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh update users/<USER_ID> \
  -r dive-v3-broker -s 'attributes.clearance=["SECRET"]'
```

### OPA
```bash
# Test policies
docker exec dive-v3-opa opa test /policies -v

# Format policies
docker exec dive-v3-opa opa fmt -w /policies/*.rego

# Evaluate decision
docker exec dive-v3-opa opa eval \
  -d /policies/fuel_inventory_abac_policy.rego \
  -i input.json 'data.dive.authorization.allow'
```

### Terraform
```bash
# Init
terraform init

# Validate
terraform validate

# Plan
terraform plan -out=tfplan

# Apply
terraform apply tfplan

# Destroy (DANGEROUS)
terraform destroy -auto-approve
```

### Docker
```bash
# View logs
docker-compose logs -f backend
docker-compose logs -f keycloak
docker-compose logs -f opa

# Restart service
docker-compose restart backend

# Shell into container
docker exec -it dive-v3-backend /bin/bash

# Health check
docker ps --filter "name=dive-v3"
```

---

## 📞 Quick Contacts

| Role | Responsibility | Escalation |
|------|----------------|------------|
| **Security Architect** | P0, P1, P3 | CISO |
| **Keycloak Admin** | P1 | Security Architect |
| **IAM Engineer** | P2 | Security Architect |
| **Backend Dev** | P2, P4 | Lead Engineer |
| **Crypto Engineer** | P4 | Security Architect |
| **Infra Engineer** | P5 | Lead Engineer |
| **Security Ops** | P6 | CISO |
| **DevOps** | P7 | Lead Engineer |

---

## 🎯 Phase Completion Checklist

- [ ] **P0**: 13/13 checks PASS
- [ ] **P1**: 9/9 DoD, 12/12 tests PASS
- [ ] **P2**: 10/10 DoD, 40/40 users
- [ ] **P3**: 11/11 DoD, 40+ tests PASS
- [ ] **P4**: 10/10 DoD, crypto verified
- [ ] **P5**: 10/10 DoD, zero drift
- [ ] **P6**: 9/9 DoD, 90-day retention
- [ ] **P7**: 8/8 DoD, CI/CD GREEN
- [ ] **Exit Report**: APPROVED

**Total**: 80 acceptance criteria

---

## 🏁 Production Readiness Checklist

### Security
- [ ] All MFA flows enforced (CONFIDENTIAL+)
- [ ] Token lifetime validated (15 min max)
- [ ] Metadata signatures verified (STANAG 4778)
- [ ] KEK wrapping active (KMS/HSM)
- [ ] 90-day audit trail confirmed

### Performance
- [ ] OPA p95 < 200ms
- [ ] KAS p95 < 300ms
- [ ] Frontend LCP < 2.5s
- [ ] Zero resource leaks

### Compliance
- [ ] ACP-240 §5.1-5.4 ✅
- [ ] ADatP-5663 §4.4, 5.1.3, 6.2-6.8 ✅
- [ ] NIST SP 800-63B ✅
- [ ] STANAG 4774/4778 ✅

### Operations
- [ ] All CI/CD workflows GREEN
- [ ] 10 runbooks documented
- [ ] SIEM forwarding active
- [ ] Rollback procedures tested

**Sign-off**: Security Architect + Lead Engineer + Product Owner

---

**END OF QUICK REFERENCE**

**Keep this handy during implementation!**

**For full details, see**: `DIVE-V3-IMPLEMENTATION-PLAYBOOK-README.md`

