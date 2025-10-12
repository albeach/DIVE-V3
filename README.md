# DIVE V3 - Coalition ICAM Pilot

> **USA/NATO Identity & Access Management Demonstration**
> 
> Federated Authentication • Policy-Driven Authorization • Secure Document Sharing

## 🎯 Project Overview

DIVE V3 is a 4-week pilot demonstrating coalition-friendly Identity, Credential, and Access Management (ICAM) for USA/NATO partners. The system showcases:

- **Federated Identity:** Multi-IdP authentication (U.S., France, Canada, Industry) via Keycloak broker
- **ABAC Authorization:** Policy-driven access control using OPA/Rego with NATO ACP-240 compliance
- **PEP/PDP Pattern:** Backend API enforces authorization decisions from OPA policy engine
- **Data-Centric Security:** ZTDF format with STANAG 4774/4778 cryptographic binding
- **Key Access Service:** Policy-bound encryption with KAS mediation
- **Secure Document Sharing:** Clearance-based, releasability-based, and COI-based access control

## 🏗️ Architecture

```
IdPs (US/FRA/CAN) → Keycloak Broker → Next.js + NextAuth
                                              ↓
                                    Backend API (PEP)
                                      ↓         ↓
                                    OPA (PDP)  MongoDB
                                              ↓
                                        KAS (Stretch)
```

**Components:**
- **Keycloak:** IdP broker with claim normalization
- **Next.js 15:** Frontend UI with NextAuth.js v5
- **Express.js:** Backend API with PEP (Policy Enforcement Point)
- **OPA:** Policy Decision Point with Rego policies
- **MongoDB:** Resource metadata store
- **PostgreSQL:** Keycloak session store
- **KAS:** Key Access Service (Week 4 stretch goal)

## 🚀 Quick Start

### Prerequisites

- **Docker** & **Docker Compose**
- **Node.js 20+**
- **Terraform** (will be installed automatically)
- **OpenSSL** (for secret generation)

### Installation

```bash
# 1. Clone repository
git clone https://github.com/albeach/DIVE-V3.git
cd DIVE-V3

# 2. Start infrastructure services
./scripts/dev-start.sh

# 3. Verify all services healthy (IMPORTANT!)
./scripts/preflight-check.sh

# 4. In new terminal - Start backend
cd backend && npm install && npm run seed-database && npm run dev

# 5. In new terminal - Start frontend
cd frontend && npm install --legacy-peer-deps && npm run dev

# NOTE: --legacy-peer-deps required due to Next.js 15 + React 19 peer dependency resolution

# 6. Verify application ready
./scripts/preflight-check.sh

# 7. Open browser
open http://localhost:3000
```

The setup script will:
- ✅ Start Docker services (Keycloak, PostgreSQL, MongoDB, OPA)
- ✅ Configure Keycloak realm and client via Terraform
- ✅ Generate secrets and update `.env.local`

### Manual Setup (if preferred)

```bash
# 1. Create .env.local
cp .env.example .env.local
# Edit .env.local and set AUTH_SECRET=$(openssl rand -base64 32)

# 2. Start services
docker-compose up -d

# 3. Wait for Keycloak (check http://localhost:8081/health/ready)

# 4. Configure Keycloak
cd terraform
terraform init
terraform apply -auto-approve

# Get client secret
CLIENT_SECRET=$(terraform output -raw client_secret)
# Update KEYCLOAK_CLIENT_SECRET in .env.local

# 5. Seed database
cd ../backend
npm install
npm run seed-database

# 6. Start frontend
cd ../frontend
npm install
npm run dev
```

## 📋 Test Credentials

### U.S. IdP (Simulated - Keycloak Users)

| Username | Password | Clearance | Country | COI |
|----------|----------|-----------|---------|-----|
| `testuser-us` | `Password123!` | SECRET | USA | NATO-COSMIC, FVEY |
| `testuser-us-confid` | `Password123!` | CONFIDENTIAL | USA | FVEY |
| `testuser-us-unclass` | `Password123!` | UNCLASSIFIED | USA | None |

### Sample Resources

| Resource ID | Classification | Releasability | COI | Encrypted |
|-------------|---------------|---------------|-----|-----------|
| `doc-nato-ops-001` | SECRET | USA, GBR, FRA, DEU, CAN | NATO-COSMIC | No |
| `doc-us-only-tactical` | SECRET | USA only | US-ONLY | No |
| `doc-fvey-intel` | TOP_SECRET | USA, GBR, CAN, AUS, NZL | FVEY | Yes |
| `doc-fra-defense` | CONFIDENTIAL | FRA only | None | No |
| `doc-future-embargo` | SECRET | USA, GBR, CAN | FVEY | No (embargoed until Nov 1) |

## 🔧 Development

### Project Structure

```
dive-v3/
├── frontend/           # Next.js 15 + NextAuth
├── backend/            # Express.js API + PEP
├── kas/                # Key Access Service (Week 4)
├── policies/           # OPA Rego policies
├── terraform/          # Keycloak IaC
├── scripts/            # Setup and utility scripts
├── docs/               # Documentation
├── docker-compose.yml  # Full stack orchestration
└── .cursorrules        # AI coding assistant rules
```

### Available Services

| Service | URL | Purpose |
|---------|-----|---------|
| Next.js App | http://localhost:3000 | User interface |
| Backend API | http://localhost:4000 | PEP + resource API |
| Keycloak | http://localhost:8081 | IdP broker |
| OPA | http://localhost:8181 | Policy engine |
| KAS | http://localhost:8080 | Key Access Service (ACP-240) |
| MongoDB | localhost:27017 | Resource metadata (ZTDF) |
| PostgreSQL | localhost:5433 | Keycloak sessions |

### Commands

```bash
# View logs
docker-compose logs -f [service-name]
docker-compose logs -f keycloak
docker-compose logs -f backend

# Restart a service
docker-compose restart [service-name]

# Stop all services
docker-compose down

# Complete reset (including data)
docker-compose down -v
./scripts/dev-start.sh

# Run OPA policy tests (Week 2)
opa test policies/fuel_inventory_abac_policy.rego policies/tests/

# Run backend tests
cd backend && npm test

# Run frontend linting
cd frontend && npm run lint
```

## 📅 Implementation Timeline

### ✅ Week 1: Foundation (Oct 10-16, 2025) - COMPLETE
- [x] Keycloak federation with U.S. IdP
- [x] Next.js UI with IdP selection
- [x] MongoDB with sample resources
- [x] Backend API skeleton
- [x] Authentication flow working
- [x] Session management functional

### ✅ Week 2: Authorization (Oct 11, 2025) - COMPLETE
- [x] OPA integration with PEP/PDP pattern
- [x] Complete Rego policies (5 rules: clearance, releasability, COI, embargo, attributes)
- [x] Decision UI with detailed allow/deny reasons and policy evaluation
- [x] 53 OPA unit tests (130% of target, 100% passing)
- [x] PEP middleware with JWT validation, JWKS verification, decision caching
- [x] Database session management with OAuth 2.0 token refresh
- [x] All 8 manual test scenarios verified working
- [x] Structured audit logging for compliance

### ✅ Week 3: Multi-IdP Federation (Oct 11, 2025) - COMPLETE
- [x] France IdP (SAML) with URN attribute mapping
- [x] Canada IdP (OIDC) with protocol mappers
- [x] Industry IdP (OIDC) for contractor authentication
- [x] Claim enrichment middleware (email domain → country, default clearance)
- [x] Embargo rules (already implemented in Week 2, 6 tests)
- [x] 22 negative OPA test cases for edge cases
- [x] Country code validation (ISO 3166-1 alpha-3)
- [x] 78/78 OPA tests passing (53 comprehensive + 22 negative + 3 validation)

### ✅ Week 3.1: NATO ACP-240 Data-Centric Security (Oct 12, 2025) - COMPLETE
- [x] ZTDF (Zero Trust Data Format) implementation with manifest, policy, payload sections
- [x] STANAG 4774 security labels with prominent display markings
- [x] STANAG 4778 cryptographic binding (SHA-384 integrity hashes)
- [x] KAS (Key Access Service) with policy re-evaluation and audit logging
- [x] Enhanced audit logging (5 ACP-240 event types: ENCRYPT, DECRYPT, DENIED, MODIFIED, SHARED)
- [x] OPA policy updates with ZTDF integrity validation and enhanced KAS obligations
- [x] Migration script: 8/8 resources converted to ZTDF (100% success)
- [x] 87/87 OPA tests passing (78 existing + 9 ACP-240 = 100% coverage)
- [x] GitHub Actions CI/CD with 6 automated jobs
- [x] Repository cleanup (45+ temporary files removed)

### ⏳ Week 4: E2E Testing & Demo (Oct 31-Nov 6, 2025)
- [ ] Manual E2E testing with all 4 IdPs
- [ ] Performance validation
- [ ] Demo video preparation
- [ ] Pilot report documentation

## 🧪 Testing

### Pre-Flight Check (ALWAYS RUN FIRST)
```bash
# Verify all services healthy before testing
./scripts/preflight-check.sh
```

### Policy Tests (Week 2)
```bash
# Run all OPA tests (53 tests)
docker-compose exec opa opa test /policies/ -v

# Check policy syntax
docker-compose exec opa opa check /policies/fuel_inventory_abac_policy.rego

# Test OPA decision directly
curl -X POST http://localhost:8181/v1/data/dive/authorization \
  -H "Content-Type: application/json" \
  -d @test-data/allow-scenario.json | jq
```

### Manual Test Scenarios (Week 2) - ✅ ALL VERIFIED
1. ✅ U.S. SECRET user accesses SECRET/USA resource → ALLOW
2. ✅ UNCLASSIFIED user accesses UNCLASSIFIED resource → ALLOW
3. ✅ SECRET user accesses CONFIDENTIAL resource → ALLOW
4. ✅ CONFIDENTIAL user accesses TOP_SECRET resource → DENY (insufficient clearance)
5. ✅ USA user accesses FRA-only resource → DENY (country mismatch)
6. ✅ User with FVEY COI accesses US-ONLY resource → DENY (COI + clearance)
7. ✅ Any user accesses future-embargoed resource → DENY (embargo date)
8. ✅ UNCLASSIFIED user without COI accesses NATO resource → DENY (clearance + COI)

**Detailed test guide:** See `WEEK2-MANUAL-TESTING-GUIDE.md`

## 📚 Documentation

### Core Documentation
- **[Implementation Plan](dive-v3-implementation-plan.md)** - Complete 4-week plan with architecture
- **[Requirements](dive-v3-requirements.md)** - Project requirements and scope
- **[Backend Spec](dive-v3-backend.md)** - API endpoints and controllers
- **[Frontend Spec](dive-v3-frontend.md)** - UI pages and components
- **[Security Guidelines](dive-v3-security.md)** - Security best practices
- **[Tech Stack](dive-v3-techStack.md)** - Technology choices
- **[CHANGELOG](CHANGELOG.md)** - All changes with dates and details

### Week 2 Deliverables
- **[WEEK2-STATUS.md](WEEK2-STATUS.md)** - Complete implementation status with all deliverables
- **[WEEK2-COMPLETE.md](WEEK2-COMPLETE.md)** - Final summary and statistics
- **[Testing Guide](docs/testing/WEEK2-MANUAL-TESTING-GUIDE.md)** - 8 manual test scenarios (all verified)
- **[Startup Guide](docs/testing/WEEK2-STARTUP-GUIDE.md)** - Service startup procedures

### Troubleshooting Guides
- **[Documentation Index](docs/README.md)** - Complete documentation index
- **[Troubleshooting](docs/troubleshooting/)** - 10 technical guides for common issues
- **[Scripts](scripts/)** - Diagnostic and utility scripts

## 🔒 Security Features

### ACP-240 Data-Centric Security (Week 3.1)
- **ZTDF Format:** Zero Trust Data Format with embedded security metadata
- **STANAG 4774 Labels:** NATO security labels with display markings
- **STANAG 4778 Binding:** SHA-384 cryptographic integrity hashes
- **KAS Integration:** Policy-bound encryption with key mediation
- **Fail-Closed Enforcement:** Deny on integrity failure or policy unavailable

### Core Security
- **Default Deny:** All access denied unless explicitly authorized
- **JWT Validation:** All API requests verify Keycloak-signed tokens
- **Enhanced Audit Logging:** 5 ACP-240 event types (ENCRYPT, DECRYPT, DENIED, MODIFIED, SHARED)
- **PII Minimization:** Only uniqueID logged, not full names
- **Token Rotation:** 15-minute access tokens, 8-hour refresh tokens
- **Rate Limiting:** 100 req/min per IP
- **CSP Headers:** Strict Content Security Policy

## 🤝 Contributing

This is a pilot project for demonstration purposes. Follow the [.cursorrules](.cursorrules) for coding conventions.

### Development Workflow
1. Feature branches from `main`
2. Conventional commits: `feat(auth):`, `fix(opa):`, `test(e2e):`
3. All tests must pass before PR merge

## 📊 Current Status

**Week 1:** ✅ Complete (Foundation - Keycloak, Next.js, MongoDB, Backend API)  
**Week 2:** ✅ Complete (Authorization - OPA, PEP/PDP, 78 tests passing)  
**Week 3:** ✅ Complete (Multi-IdP - SAML + OIDC, claim enrichment, 4 IdPs)  
**Week 3.1:** ✅ Complete (NATO ACP-240 - ZTDF, KAS, STANAG 4774/4778, 87 tests)  
**Week 4:** 🔄 In Progress (E2E testing, demos, pilot report)

### Latest Achievement: 100% Test Coverage ✅

- ✅ **87/87 OPA tests passing** (100%)
- ✅ **8/8 resources migrated to ZTDF** (100%)
- ✅ **0 TypeScript errors** (Backend, Frontend, KAS)
- ✅ **GitHub Actions CI/CD** (6 automated jobs)
- ✅ **NATO ACP-240 compliant** (ZTDF, STANAG 4774/4778)

**Next Steps:**
- Manual E2E testing with all 4 IdPs
- Performance benchmarking
- Demo video and pilot report

## 📞 Support

For issues or questions:
1. Check `docker-compose logs [service]`
2. Review implementation plan Section 10 (Test Plan)
3. Verify `.env.local` has correct secrets

## 📄 License

MIT License - See LICENSE file for details.

---

**DIVE V3** • Coalition ICAM Pilot • October 2025

