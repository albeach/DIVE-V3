# Changelog

All notable changes to the DIVE V3 project will be documented in this file.

## [Week 1] - 2025-10-10

### Added
- Complete 4-week implementation plan (dive-v3-implementation-plan.md)
- Docker Compose orchestration for 7 services
- Keycloak realm configuration via Terraform (15 resources)
- Next.js 15 frontend with NextAuth.js v5
- Express.js backend API with resource endpoints
- MongoDB seed script with 8 sample resources
- OPA policy engine integration
- KAS service stub
- Automated setup script (scripts/dev-start.sh)
- GitHub Actions CI/CD pipeline
- Comprehensive documentation (.cursorrules, README, START-HERE)

### Fixed
- AUTH_SECRET missing in frontend (.env.local created)
- NextAuth database tables (created manually)
- MongoDB connection string (simplified for dev)
- Tailwind CSS version conflict (downgraded to v3.4)
- React peer dependency conflicts (--legacy-peer-deps)
- Frontend cache corruption (cleared .next directory)
- Logout functionality (server-side cookie clearing)

### Security
- Custom protocol mappers for DIVE attributes (uniqueID, clearance, countryOfAffiliation, acpCOI)
- Security headers (CSP, HSTS, X-Frame-Options)
- JWT-based authentication
- httpOnly session cookies
- Rate limiting configuration

## Week 1 Acceptance Criteria - ✅ ALL MET

- [x] Keycloak realm 'dive-v3-pilot' configured
- [x] 3 test users (SECRET, CONFIDENTIAL, UNCLASSIFIED clearances)
- [x] Next.js IdP selection page (4 options)
- [x] Authentication flow functional
- [x] Dashboard displays DIVE attributes
- [x] Logout and session management working
- [x] MongoDB with 8 resources
- [x] Backend API serving resources
- [x] OPA service ready

## [Unreleased] - Week 2 (Oct 17-23, 2025)

### Planned
- PEP middleware (authz.middleware.ts)
- Core OPA/Rego policies
- 41+ OPA unit tests
- Authorization decision UI
- Structured audit logging

