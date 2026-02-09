# DIVE V3 - Coalition-Friendly ICAM Web Application

**Version:** 3.0  
**Status:** Production Ready  
**Last Updated:** February 9, 2026

---

## 🚀 Overview

DIVE V3 is a coalition-friendly Identity, Credential, and Access Management (ICAM) web application demonstrating federated identity management across USA/NATO partners with policy-driven Attribute-Based Access Control (ABAC) authorization.

**Key Features:**
- 🔐 **Federated Identity**: Multi-IdP support (USA, France, Canada, Industry)
- 🛡️ **ABAC Authorization**: Policy-driven access control with Open Policy Agent (OPA)
- 🌐 **Hub-Spoke Architecture**: Distributed deployment model for coalition environments
- 🔑 **Key Access Service (KAS)**: Policy-bound encryption for sensitive resources
- ⚡ **Modern UI**: Phase 3 enhancements with micro-interactions and real-time collaboration
- ♿ **Accessible**: WCAG 2.1 AA compliant interface

---

## 🏗️ Architecture

### Tech Stack

**Frontend:**
- Next.js 15+ (App Router)
- NextAuth.js v5 (Authentication)
- TypeScript
- Tailwind CSS
- Framer Motion (Animations)

**Backend:**
- Node.js 20+
- Express.js 4.18
- TypeScript
- MongoDB 7 (Resource metadata)
- Redis (Session management, blacklist)

**Identity & Authorization:**
- Keycloak (IdP broker)
- Open Policy Agent (OPA) v0.68.0+
- JWT (RS256) tokens

**Infrastructure:**
- Docker Compose
- Terraform (Keycloak IaC)
- HashiCorp Vault 1.21 (Secrets management, primary)
- Google Cloud Platform (Secrets management, legacy fallback)

**Monitoring:**
- Grafana (Dashboards)
- Prometheus (Metrics)
- Loki (Logs)

### PEP/PDP Pattern

```
IdPs (USA/FRA/CAN) → Keycloak Broker → Next.js + NextAuth
                                           ↓
                                    Backend API (PEP)
                                           ↓
                                      OPA (PDP) ← Rego Policies
                                           ↓
                                    Authorization Decision
                                           ↓
                                    MongoDB (Resources)
                                           ↓
                                    KAS (Key Release)
```

---

## 🎨 What's New in Phase 3

Phase 3 introduced modern UI/UX enhancements across the entire admin interface:

- ✨ **100+ Animated Buttons** - Smooth micro-interactions on all admin pages
- 🎬 **Seamless Page Transitions** - Fade/slide animations for navigation
- 👥 **Real-Time Presence** - Live collaboration indicators on Analytics and Logs pages
- ♿ **Full Accessibility** - WCAG 2.1 AA compliant with `prefers-reduced-motion` support
- 🚀 **60fps Performance** - GPU-accelerated animations

### Phase 3 Components

#### AnimatedButton

Modern button component with micro-interactions using Framer Motion.

```typescript
import { AnimatedButton } from '@/components/admin/shared';

<AnimatedButton
  onClick={handleClick}
  className="px-4 py-2 bg-blue-600 text-white rounded-lg"
  intensity="normal"
>
  Click Me
</AnimatedButton>
```

**Features:**
- 3 intensity levels: `subtle`, `normal`, `strong`
- Respects `prefers-reduced-motion` automatically
- Full TypeScript support
- Variants: `AnimatedIconButton`, `AnimatedLinkButton`, `AnimatedCardButton`

#### AdminPageTransition

Page-level transition wrapper for smooth navigation between admin pages.

```typescript
import { AdminPageTransition } from '@/components/admin/shared';

<AdminPageTransition pageKey="/admin/dashboard">
  {/* Your page content */}
</AdminPageTransition>
```

**Features:**
- 3 animation variants: `slideUp`, `fadeIn`, `scale`
- Automatic focus management
- GPU-accelerated transitions
- Zero layout shift

#### PresenceIndicator

Real-time user presence tracking for collaborative admin pages.

```typescript
import { PresenceIndicator } from '@/components/admin/shared';

<PresenceIndicator page="analytics" />
```

**Features:**
- Cross-tab synchronization (Broadcast Channel API)
- Avatar stacking with tooltips
- Automatic heartbeat and cleanup
- Glassmorphism design

### Documentation

- **[Component API Reference](./docs/PHASE3_COMPONENTS.md)** - Complete documentation with examples
- **[Testing Guide](./docs/PHASE3_TESTING_GUIDE.md)** - Comprehensive testing strategy
- **[Phase 3 Summary](./docs/PHASE3_FINAL_SUMMARY.md)** - Accomplishments and lessons learned

---

## 📦 Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 20+
- Git

### Installation

```bash
# Clone repository
git clone https://github.com/dive25/DIVE-V3.git
cd DIVE-V3

# Start all services
./scripts/dive-start.sh

# Services will be available at:
# Frontend: http://localhost:3000
# Backend: http://localhost:4000
# Keycloak: http://localhost:8081
# Grafana: http://localhost:3001
```

### Configuration

DIVE V3 uses HashiCorp Vault for secrets management. No cloud provider account required.

```bash
# 1. Start Vault container
docker compose -f docker-compose.hub.yml up -d vault

# 2. Initialize and unseal Vault (one-time)
./dive vault init
./dive vault unseal

# 3. Configure mount points and policies
./dive vault setup

# 4. Deploy
./dive hub deploy
./dive spoke deploy deu
```

See [Vault Integration Guide](./docs/VAULT_INTEGRATION.md) for full documentation.

**⚠️ CRITICAL:** Never hardcode secrets! Always use Vault for secret storage.

---

## 🔐 Security Features

### Authentication

- **Multi-IdP Support**: USA (OIDC), France (SAML), Canada (OIDC), Industry (OIDC)
- **JWT Validation**: RS256 signature verification with Keycloak JWKS
- **Short Token Lifetime**: 15 minutes (access), 8 hours (refresh)
- **Single-Use Refresh Tokens**: Rotation prevents replay attacks
- **Token Blacklist**: Redis-backed revocation on logout

### Authorization (ABAC)

- **Default Deny**: OPA policies start with `default allow := false`
- **Fail-Secure Pattern**: Use `is_not_a_*` violation checks
- **Clearance-Based**: UNCLASSIFIED, CONFIDENTIAL, SECRET, TOP_SECRET
- **Country-Based**: ISO 3166-1 alpha-3 codes (USA, FRA, CAN, GBR)
- **COI-Based**: Community of Interest tags (NATO-COSMIC, FVEY)
- **Comprehensive Logging**: All decisions logged with reason

### Compliance

- **ACP-240**: NATO access control policy
- **STANAG 4774/5636**: NATO security labeling
- **ISO 3166-1 alpha-3**: Country codes
- **WCAG 2.1 AA**: Accessibility compliance
- **90-day Audit Trail**: All authorization decisions logged

---

## 🛠️ Development

### Project Structure

```
dive-v3/
├── frontend/              # Next.js application
│   ├── src/
│   │   ├── app/          # Next.js App Router pages
│   │   │   └── admin/    # Admin pages (16 total)
│   │   ├── components/   # React components
│   │   │   └── admin/shared/  # Phase 3 components
│   │   ├── lib/          # Utilities and helpers
│   │   └── types/        # TypeScript definitions
├── backend/              # Express.js API
│   ├── src/
│   │   ├── controllers/  # Route controllers
│   │   ├── middleware/   # PEP, logging, validation
│   │   ├── services/     # Business logic
│   │   ├── models/       # MongoDB schemas
│   │   └── utils/        # Helpers
├── kas/                  # Key Access Service
├── policies/             # OPA Rego policies
├── terraform/            # Keycloak IaC
├── scripts/              # Utility scripts
└── docs/                 # Documentation
```

### Running Tests

```bash
# Backend tests
cd backend && npm test

# OPA policy tests
opa test policies/

# Frontend tests
cd frontend && npm test

# E2E tests
cd frontend && npm run test:e2e
```

### Code Conventions

- **Files**: kebab-case (`authz.middleware.ts`)
- **Components**: PascalCase (`AnimatedButton.tsx`)
- **Functions/Variables**: camelCase (`getResourceMetadata`)
- **Constants**: UPPER_SNAKE_CASE (`OPA_URL`)
- **Commits**: Conventional Commits (`feat(auth): add France SAML IdP`)

See [.cursorrules](./.cursorrules) for complete conventions.

---

## 📚 Documentation

### Quick Start Guides

- **[Hub-Spoke 101 Deployment](./docs/HUB_SPOKE_101_DEPLOYMENT.md)** - Dynamic NATO coalition deployment
- **[Browser Access Guide](./docs/BROWSER_ACCESS_GUIDE.md)** - How to access services
- **[Pilot Quick Start](./docs/PILOT-QUICK-START.md)** - Quick start for pilot deployment

### Architecture

- **[Hub-Spoke Architecture](./docs/HUB_SPOKE_ARCHITECTURE.md)** - Comprehensive architecture guide
- **[Federation Implementation](./docs/FEDERATION-IMPLEMENTATION-RUNBOOK.md)** - Federation setup
- **[Security Architecture](./docs/SECURE-DEPLOYMENT.md)** - Production security guidelines

### Phase 3 Documentation

- **[Component Documentation](./docs/PHASE3_COMPONENTS.md)** - API reference with examples
- **[Testing Guide](./docs/PHASE3_TESTING_GUIDE.md)** - Testing strategy and results
- **[Final Summary](./docs/PHASE3_FINAL_SUMMARY.md)** - Phase 3 accomplishments

### Complete Documentation Index

See [docs/README.md](./docs/README.md) for the complete documentation index organized by topic.

---

## 🎯 Admin Pages (Phase 3 Enhanced)

All 16 admin pages feature modern micro-interactions and seamless transitions:

| Page | Route | Features |
|------|-------|----------|
| Dashboard | `/admin/dashboard` | Overview, metrics, quick actions |
| Users | `/admin/users` | User management, CRUD operations |
| Analytics | `/admin/analytics` | Real-time analytics + PresenceIndicator |
| Security & Compliance | `/admin/security-compliance` | Security posture, compliance status |
| Logs | `/admin/logs` | System logs + PresenceIndicator (23 animated buttons) |
| Clearance Management | `/admin/clearance-management` | Clearance level administration |
| Approvals | `/admin/approvals` | Workflow approvals |
| IdP Management | `/admin/idp` | Identity provider configuration |
| Certificates | `/admin/certificates` | SSL/TLS certificate management (11 buttons) |
| OPA Policy | `/admin/opa-policy` | Policy editor and testing |
| Compliance | `/admin/compliance` | Compliance reporting |
| Spoke | `/admin/spoke` | Spoke instance management |
| SP Registry | `/admin/sp-registry` | Service provider registry |
| Tenants | `/admin/tenants` | Multi-tenant administration |
| Debug | `/admin/debug` | System diagnostics |
| Onboarding | `/admin/onboarding` | New user onboarding wizard |

---

## 🚀 Deployment

### Hub Deployment

```bash
# Deploy USA hub instance
cd terraform/hub
terraform init
terraform apply -var="instance=usa"

# Start services
./scripts/dive-start.sh
```

### Spoke Deployment

```bash
# Deploy France spoke instance
cd templates/spoke
./scripts/spoke-init/spoke-init.sh fra

# Start spoke services
cd ../../spoke-instances/fra
docker-compose up -d
```

### Production Checklist

- [ ] All secrets stored in HashiCorp Vault (or GCP Secret Manager)
- [ ] SSL/TLS certificates configured
- [ ] Monitoring and logging enabled
- [ ] OPA policies tested and deployed
- [ ] Federation links established
- [ ] Backup and disaster recovery configured
- [ ] Security scanning completed
- [ ] Load testing performed

See [Deployment Runbook](./docs/RUNBOOK-DEPLOYMENT.md) for complete procedures.

---

## 📊 Monitoring

### Grafana Dashboards

Access Grafana at `http://localhost:3001`:

- **System Overview**: CPU, memory, disk usage
- **Application Metrics**: Request rates, response times, error rates
- **Authorization Metrics**: OPA decisions, policy evaluation times
- **Session Metrics**: Active sessions, token lifecycle

### Logs

View aggregated logs with Loki:

```bash
# View backend logs
docker-compose logs -f backend

# View frontend logs
docker-compose logs -f frontend

# View OPA decision logs
docker-compose logs -f opa
```

---

## 🧪 Testing

### Comprehensive Test Coverage

- **Unit Tests**: Jest (backend), React Testing Library (frontend)
- **Integration Tests**: API endpoint tests, OPA policy tests
- **E2E Tests**: Playwright (user flows, federation scenarios)
- **Accessibility Tests**: axe DevTools, keyboard navigation
- **Performance Tests**: Lighthouse, Chrome DevTools profiling

### Test Results (Phase 3)

| Metric | Target | Achieved |
|--------|--------|----------|
| Lighthouse Performance | ≥90 | 90-95 ✅ |
| Lighthouse Accessibility | ≥95 | 95-100 ✅ |
| Animation FPS | 60 | 58-60 ✅ |
| WCAG 2.1 AA Compliance | 100% | 100% ✅ |
| Cross-Browser Support | 4 browsers | 4/4 ✅ |

---

## 🤝 Contributing

### Workflow

1. Create feature branch: `git checkout -b feat/my-feature`
2. Make changes following [code conventions](./.cursorrules)
3. Write tests for new features
4. Run linters: `npm run lint`
5. Commit with conventional commit message
6. Push and create pull request
7. Wait for CI checks to pass
8. Request review

### Code Review Checklist

- [ ] Tests pass
- [ ] TypeScript compilation succeeds
- [ ] Accessibility validated (WCAG 2.1 AA)
- [ ] Documentation updated
- [ ] No hardcoded secrets
- [ ] OPA policies tested
- [ ] Performance impact assessed

---

## 🎓 Training Resources

### New Developer Onboarding

1. Read [Project Overview](./docs/ARCHITECTURE-GUIDE.md)
2. Review [Code Conventions](./.cursorrules)
3. Complete [Phase 3 Component Tutorial](./docs/PHASE3_COMPONENTS.md)
4. Run through [Quick Start](#quick-start)
5. Deploy local development environment
6. Complete "Hello World" PR (add test page)

### Advanced Topics

- **OPA Policy Development**: [OPA Policy Editor Quick Reference](./docs/opa-policy-editor-quick-reference.md)
- **Federation Setup**: [Federation Implementation Runbook](./docs/FEDERATION-IMPLEMENTATION-RUNBOOK.md)
- **KAS Integration**: [ZTDF KAS Federation](./docs/ZTDF-KAS-FEDERATION-QUICK-REFERENCE.md)
- **Hub-Spoke Deployment**: [Hub-Spoke 101](./docs/HUB_SPOKE_101_DEPLOYMENT.md)

---

## 📞 Support & Contact

### Issue Reporting

File issues on GitHub: [DIVE V3 Issues](https://github.com/dive25/DIVE-V3/issues)

**Include:**
- Environment details (OS, browser, Node version)
- Steps to reproduce
- Expected vs actual behavior
- Screenshots or logs
- Phase 3 component (if UI-related)

### Documentation Feedback

Found an error in documentation? Submit a PR or file an issue with:
- Document name and location
- Incorrect information
- Suggested correction

---

## 🏆 Acknowledgments

### Phase 3 Team

**Primary Contributors:**
- AI Assistant (Claude Sonnet 4.5) - Component implementation
- Aubrey Beach - Project oversight and requirements

**Technologies:**
- [Framer Motion](https://www.framer.com/motion/) - Animation library
- [Next.js](https://nextjs.org/) - React framework
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS
- [Open Policy Agent](https://www.openpolicyagent.org/) - Policy engine
- [Keycloak](https://www.keycloak.org/) - Identity broker

---

## 📜 License

**Classification:** UNCLASSIFIED  
**Distribution:** Public Release

DIVE V3 is developed for NATO coalition demonstration purposes. See [LICENSE](./LICENSE) for details.

---

## 🗺️ Roadmap

### Completed Phases

- ✅ **Phase 1**: Federation & Identity (Q4 2025)
- ✅ **Phase 2**: ABAC Authorization (Q4 2025)
- ✅ **Phase 3**: Modern UI/UX Enhancements (Q1 2026)

### Upcoming Phases

- 🔜 **Phase 4**: Enhanced Collaboration (Q1 2026)
  - Expand presence indicators to more pages
  - Real-time notifications
  - Storybook component library
  - Automated animation testing

- 🔮 **Phase 5**: Mobile Experience (Q2 2026)
  - Progressive Web App (PWA)
  - Mobile-optimized admin interface
  - Offline capability

- 🔮 **Phase 6**: Advanced Analytics (Q2 2026)
  - ML-powered access pattern detection
  - Anomaly detection
  - Predictive policy recommendations

---

## 🔗 Related Projects

- [Keycloak](https://github.com/keycloak/keycloak) - Open Source Identity and Access Management
- [Open Policy Agent](https://github.com/open-policy-agent/opa) - Policy-based control for cloud native environments
- [OPAL](https://github.com/permitio/opal) - Open Policy Administration Layer

---

## 📈 Statistics

**Project Metrics (as of February 6, 2026):**
- Lines of Code: ~50,000
- Components: 50+
- Admin Pages: 16 (all Phase 3 enhanced)
- OPA Policies: 10+ (with 41+ tests)
- Supported IdPs: 4 (USA, France, Canada, Industry)
- Deployment Targets: 7+ (Hub + Spokes)
- Documentation Files: 100+

---

## ❓ FAQ

### General

**Q: What is DIVE V3?**  
A: DIVE V3 is a coalition-friendly ICAM web application demonstrating federated identity and ABAC authorization for NATO environments.

**Q: Is DIVE V3 production-ready?**  
A: Yes, as of Phase 3 completion (February 2026), DIVE V3 is production-ready with full accessibility, performance validation, and comprehensive documentation.

### Phase 3

**Q: How do I use AnimatedButton in my page?**  
A: Import from shared components and use like a regular button. See [Component Documentation](./docs/PHASE3_COMPONENTS.md) for examples.

**Q: Do animations work on all browsers?**  
A: Yes, Phase 3 components are tested on Chrome, Firefox, Safari, and Edge. See [Testing Guide](./docs/PHASE3_TESTING_GUIDE.md).

**Q: What if users prefer reduced motion?**  
A: All Phase 3 components automatically respect the `prefers-reduced-motion` setting. Animations are disabled when users enable this preference.

### Technical

**Q: How do I add a new IdP?**  
A: See [Federation Implementation Runbook](./docs/FEDERATION-IMPLEMENTATION-RUNBOOK.md) for step-by-step instructions.

**Q: How do I modify OPA policies?**  
A: Edit `.rego` files in `policies/` directory. Run `opa test` to validate. See [OPA Policy Editor Quick Reference](./docs/opa-policy-editor-quick-reference.md).

**Q: Where are secrets stored?**
A: Secrets are stored in HashiCorp Vault (primary, `SECRETS_PROVIDER=vault`) or GCP Secret Manager (legacy fallback). Never hardcode secrets in code or config files. See [Vault Integration Guide](./docs/VAULT_INTEGRATION.md) and `.cursorrules` for complete guidelines.

---

**DIVE V3** - Demonstrating modern, accessible, and secure coalition identity management.

*Last Updated: February 9, 2026*
