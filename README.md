# DIVE V3 - Coalition ICAM Pilot

> **USA/NATO Identity & Access Management Demonstration**
> 
> Federated Authentication • Policy-Driven Authorization • Secure Document Sharing

## 🎯 Project Overview

DIVE V3 is a 4-week pilot demonstrating coalition-friendly Identity, Credential, and Access Management (ICAM) for USA/NATO partners. The system showcases:

- **Federated Identity:** Multi-IdP authentication (U.S., France, Canada, Industry) via Keycloak broker
- **ABAC Authorization:** Policy-driven access control using OPA/Rego with ACP-240 alignment
- **PEP/PDP Pattern:** Backend API enforces authorization decisions from OPA policy engine
- **Secure Document Sharing:** Clearance-based and releasability-based access to classified resources

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
git clone https://github.com/<your-username>/DIVE-V3.git
cd DIVE-V3

# 2. Start infrastructure services
./scripts/dev-start.sh

# 3. In new terminal - Start backend
cd backend && npm install && npm run seed-database && npm run dev

# 4. In new terminal - Start frontend
cd frontend && npm install --legacy-peer-deps && npm run dev

# 5. Open browser
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
| KAS | http://localhost:8080 | Key service (stub) |
| MongoDB | localhost:27017 | Resource metadata |
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

### 🔄 Week 2: Authorization (Oct 17-23, 2025) - IN PROGRESS
- [ ] OPA integration with PEP/PDP pattern
- [ ] Core Rego policies (clearance, releasability, COI)
- [ ] Decision UI showing allow/deny reasons
- [ ] 15+ OPA unit tests

### ⏳ Week 3: Multi-IdP (Oct 24-30, 2025)
- [ ] France IdP (SAML)
- [ ] Canada IdP (OIDC)
- [ ] Industry IdP (OIDC)
- [ ] Claim enrichment
- [ ] Embargo rules

### ⏳ Week 4: KAS & Demo (Oct 31-Nov 6, 2025)
- [ ] KAS integration
- [ ] E2E testing
- [ ] Performance validation
- [ ] Demo video
- [ ] Pilot report

## 🧪 Testing

### Policy Tests (Week 2+)
```bash
# Run all OPA tests
opa test policies/ -v

# Test specific scenario
opa eval --data policies/fuel_inventory_abac_policy.rego \
  --input test-data/us-secret-user.json \
  'data.dive.authorization.decision'
```

### E2E Test Scenarios (Week 4)
1. U.S. SECRET user accesses SECRET/USA resource → ✅ ALLOW
2. U.S. SECRET user accesses TOP_SECRET resource → ❌ DENY (clearance)
3. FRA user accesses USA-only resource → ❌ DENY (releasability)
4. User without FVEY COI accesses FVEY resource → ❌ DENY (COI)
5. Any user accesses embargoed resource → ❌ DENY (embargo)
6. Encrypted resource triggers KAS flow → 🔐 KEY GATING

## 📚 Documentation

- **[Implementation Plan](dive-v3-implementation-plan.md)** - Complete 4-week plan with architecture
- **[Requirements](dive-v3-requirements.md)** - Project requirements and scope
- **[Backend Spec](dive-v3-backend.md)** - API endpoints and controllers
- **[Frontend Spec](dive-v3-frontend.md)** - UI pages and components
- **[Security Guidelines](dive-v3-security.md)** - Security best practices
- **[Tech Stack](dive-v3-techStack.md)** - Technology choices

## 🔒 Security Features

- **Default Deny:** All access denied unless explicitly authorized
- **JWT Validation:** All API requests verify Keycloak-signed tokens
- **Audit Logging:** Every authorization decision logged for 90 days
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

**Week 1 Progress:** ✅ Complete

- [x] Project structure initialized
- [x] Docker Compose configuration
- [x] Keycloak Terraform setup
- [x] Next.js app with IdP selection
- [x] Backend API skeleton
- [x] MongoDB seeded with resources
- [x] Dev start script

**Next Steps:**
- Week 2: Implement PEP middleware and OPA policies
- Test U.S. IdP authentication flow
- Verify MongoDB seed data

## 📞 Support

For issues or questions:
1. Check `docker-compose logs [service]`
2. Review implementation plan Section 10 (Test Plan)
3. Verify `.env.local` has correct secrets

## 📄 License

MIT License - See LICENSE file for details.

---

**DIVE V3** • Coalition ICAM Pilot • October 2025

