# DIVE V3 - New Session Handoff Prompt

Copy this entire document into a new chat session for full context.

---

## Project Overview

**DIVE V3** is a coalition-friendly ICAM (Identity, Credential, and Access Management) web application demonstrating federated identity management across USA/NATO partners with policy-driven ABAC authorization.

### Current State (as of Nov 25, 2025)

```
INST   FRONTEND   BACKEND    KEYCLOAK   IdPs   EXTERNAL URL
────   ────────   ───────    ────────   ────   ─────────────────────────
USA     ✓ 200     ✓ 200     ✓ 200     13     https://usa-app.dive25.com
FRA     ✓ 200     ✓ 200     ✓ 200     2      https://fra-app.dive25.com
DEU     ✓ 200     ✓ 200     ✓ 200     2      https://deu-app.dive25.com
```

All 3 instances are running and accessible via:
- **Localhost**: https://localhost:3000 (USA), :3001 (FRA), :3002 (DEU)
- **Cloudflare Tunnels**: https://{code}-app.dive25.com

### Tech Stack
- **Frontend**: Next.js 15+ (App Router), NextAuth.js v5, TypeScript, Tailwind CSS
- **Backend**: Node.js 20+, Express.js 4.18, TypeScript
- **Auth**: Keycloak 26.x (IdP broker), NextAuth.js, JWT (RS256)
- **Authorization**: OPA (Open Policy Agent) v0.68.0+, Rego policies
- **Database**: PostgreSQL 15 (Keycloak), MongoDB 7 (resource metadata)
- **Infrastructure**: Docker Compose, Terraform (Keycloak IaC)
- **Tunnels**: Cloudflare Zero Trust

---

## Architecture Pattern (CRITICAL FOR SCALABILITY)

### Multi-Instance Federation Model

```
┌─────────────────────────────────────────────────────────────────┐
│                    DIVE V3 Federation                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │  USA        │◄──►│  FRA        │◄──►│  DEU        │         │
│  │  Instance   │    │  Instance   │    │  Instance   │         │
│  ├─────────────┤    ├─────────────┤    ├─────────────┤         │
│  │ Keycloak    │    │ Keycloak    │    │ Keycloak    │         │
│  │ Backend     │    │ Backend     │    │ Backend     │         │
│  │ Frontend    │    │ Frontend    │    │ Frontend    │         │
│  │ OPA         │    │ OPA         │    │ OPA         │         │
│  │ MongoDB     │    │ MongoDB     │    │ MongoDB     │         │
│  │ Redis       │    │ Redis       │    │ Redis       │         │
│  │ KAS         │    │ KAS         │    │ KAS         │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
│        │                  │                  │                  │
│        └──────────────────┴──────────────────┘                  │
│                    Cloudflare Tunnels                           │
└─────────────────────────────────────────────────────────────────┘
```

### Instance Directory Structure (Isolated Architecture)

```
instances/
├── usa/
│   ├── instance.json          # Instance configuration
│   ├── docker-compose.yml     # Self-contained compose
│   ├── .env                   # Environment variables
│   ├── certs/                 # TLS certificates
│   └── cloudflared/
│       └── config.yml         # Tunnel config
├── fra/
│   └── (same structure)
├── deu/
│   └── (same structure)
└── {NEW_INSTANCE}/            # Pattern for new partners
```

### Port Allocation Pattern

| Instance | Frontend | Backend | Keycloak HTTP | Keycloak HTTPS | MongoDB | Redis | OPA | KAS |
|----------|----------|---------|---------------|----------------|---------|-------|-----|-----|
| USA      | 3000     | 4000    | 8081          | 8443           | 27017   | 6379  | 8181| 8080|
| FRA      | 3001     | 4001    | 8082          | 8444           | 27018   | 6380  | 8182| 8091|
| DEU      | 3002     | 4002    | 8083          | 8445           | 27019   | 6381  | 8183| 8092|
| {N+1}    | 300{N}   | 400{N}  | 808{N}        | 844{N}         | 2701{N} | 638{N}| 818{N}|...  |

---

## Adding a New Coalition Partner (e.g., GBR, CAN, ITA)

### Step 1: Create Instance Configuration

```bash
# Example: Adding Italy (ITA)
./scripts/generate-instance.sh ITA "Italy"
```

This creates `instances/ita/` with:
- `instance.json` - Configuration schema
- `docker-compose.yml` - Services definition
- `.env` - Environment variables
- `certs/` - TLS certificates (via mkcert)
- `cloudflared/config.yml` - Tunnel routing

### Step 2: Create Cloudflare Tunnel

```bash
cloudflared tunnel create dive-v3-ita
# Copy credentials to instances/ita/cloudflared/credentials.json
cloudflared tunnel route dns dive-v3-ita ita-app.dive25.com
cloudflared tunnel route dns dive-v3-ita ita-api.dive25.com
cloudflared tunnel route dns dive-v3-ita ita-idp.dive25.com
```

### Step 3: Apply Terraform

```bash
cd terraform/instances
terraform workspace new ita
terraform apply -var-file=ita.tfvars -auto-approve
```

### Step 4: Start Instance

```bash
cd instances/ita
docker-compose up -d
```

### Step 5: Verify

```bash
./scripts/dive status
```

---

## Key Files and Scripts

### Management
- `scripts/dive` - Main CLI for instance management
  - `./scripts/dive status` - Health dashboard
  - `./scripts/dive up [instance]` - Start instance(s)
  - `./scripts/dive down [instance]` - Stop instance(s)
  - `./scripts/dive logs <instance>` - View logs

### Terraform
- `terraform/instances/` - Root Terraform configuration
- `terraform/modules/federated-instance/` - Reusable module for each instance
- `terraform/instances/{code}.tfvars` - Instance-specific variables

### Docker Compose
- `docker-compose.yml` - USA (primary) instance
- `instances/{code}/docker-compose.yml` - Partner instances

---

## Critical Configuration Patterns

### Environment Variables (Backend)

```yaml
environment:
  NODE_ENV: development
  PORT: "4000"
  INSTANCE_CODE: {CODE}
  INSTANCE_NAME: "{Country Name}"
  # Database
  MONGODB_URI: mongodb://admin:admin@mongodb-{code}:27017/dive-v3-{code}?authSource=admin
  MONGODB_URL: mongodb://admin:admin@mongodb-{code}:27017/dive-v3-{code}?authSource=admin
  REDIS_URL: redis://redis-{code}:6379
  REDIS_HOST: redis-{code}
  # Keycloak
  KEYCLOAK_URL: https://keycloak-{code}:8443
  KEYCLOAK_REALM: dive-v3-broker
  KEYCLOAK_ADMIN_USER: admin
  KEYCLOAK_ADMIN_PASSWORD: admin
  # OPA
  OPA_URL: http://opa-{code}:8181
  # CORS - CRITICAL
  FEDERATION_ALLOWED_ORIGINS: https://{code}-app.dive25.com,https://localhost:{frontend_port}
  CORS_ALLOWED_ORIGINS: https://{code}-app.dive25.com,https://{code}-api.dive25.com
  # SSL - CRITICAL for dev with self-signed certs
  SSL_CERT_PATH: /app/certs
  NODE_TLS_REJECT_UNAUTHORIZED: "0"
```

### Environment Variables (Frontend)

```yaml
environment:
  NODE_ENV: development
  NEXT_PUBLIC_INSTANCE: {CODE}
  NEXT_PUBLIC_INSTANCE_NAME: "{Country Name}"
  NEXT_PUBLIC_API_URL: https://{code}-api.dive25.com
  NEXT_PUBLIC_BACKEND_URL: https://{code}-api.dive25.com
  BACKEND_URL: https://backend-{code}:4000  # CRITICAL: Internal Docker communication
  NEXT_PUBLIC_BASE_URL: https://{code}-app.dive25.com
  NEXT_PUBLIC_KEYCLOAK_URL: https://{code}-idp.dive25.com
  NEXTAUTH_URL: https://{code}-app.dive25.com
  KEYCLOAK_URL: https://keycloak-{code}:8443
  KEYCLOAK_REALM: dive-v3-broker
```

### Health Checks

```yaml
# Keycloak (has curl)
healthcheck:
  test: ["CMD-SHELL", "curl -f http://localhost:8080/realms/master || exit 1"]
  interval: 30s
  timeout: 10s
  retries: 5
  start_period: 60s

# OPA (scratch image, only has /opa binary)
healthcheck:
  test: ["CMD", "/opa", "version"]
  interval: 10s
  timeout: 5s
  retries: 5

# Backend (Node.js, no curl)
healthcheck:
  test: ["CMD-SHELL", "NODE_TLS_REJECT_UNAUTHORIZED=0 node -e \"fetch('https://localhost:4000/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))\""]
  interval: 30s
  timeout: 10s
  retries: 5
  start_period: 30s
```

---

## Phased Implementation Plan for New Features

### Phase Template

Each phase MUST include:

1. **SMART Objectives**
   - **S**pecific: Exactly what will be delivered
   - **M**easurable: Quantifiable success criteria
   - **A**chievable: Realistic within timeframe
   - **R**elevant: Aligned with project goals
   - **T**ime-bound: Clear deadline

2. **Test Suite**
   - Unit tests for new code
   - Integration tests for service interactions
   - E2E tests for user flows
   - All tests must pass before phase completion

3. **Documentation**
   - Update relevant docs
   - Add comments to complex code
   - Update this handoff document if architecture changes

4. **Git Workflow**
   - Feature branch from main
   - Commit with conventional commits format
   - PR with passing CI
   - Squash merge to main

### Example Phase Structure

```markdown
## Phase X: [Feature Name]

### SMART Objectives
- [ ] Objective 1: [Specific deliverable] by [date]
- [ ] Objective 2: ...

### Success Criteria
- [ ] All services return 200 on health check
- [ ] Test suite passes (>80% coverage)
- [ ] No console errors in browser
- [ ] Federation authentication works across instances

### Test Cases
1. Test Case A: [Description]
   - Input: ...
   - Expected: ...
2. Test Case B: ...

### Deliverables
- [ ] Code changes committed
- [ ] Tests passing
- [ ] Documentation updated
```

---

## Test User Credentials

All instances have standardized test users:

| Username | Password | Clearance | Description |
|----------|----------|-----------|-------------|
| testuser-{code}-1 | DiveDemo2025! | UNCLASSIFIED | Public affairs |
| testuser-{code}-2 | DiveDemo2025! | CONFIDENTIAL | Ministry staff |
| testuser-{code}-3 | DiveDemo2025! | SECRET | Intelligence |
| testuser-{code}-4 | DiveDemo2025! | TOP_SECRET | Defense ministry |

Example: `testuser-usa-3` has SECRET clearance in USA instance.

---

## CLI Permissions Required

### GitHub CLI (`gh`)
```bash
gh auth status  # Verify authentication
gh secret set CLOUDFLARE_API_TOKEN  # Store secrets
```

### Cloudflare CLI (`cloudflared`, `wrangler`)
```bash
cloudflared tunnel list  # List tunnels
cloudflared tunnel create dive-v3-{code}  # Create tunnel
cloudflared tunnel route dns {tunnel-id} {hostname}  # Add DNS route
wrangler whoami  # Verify auth (for API operations)
```

### Terraform
```bash
terraform workspace list  # Show workspaces
terraform workspace new {code}  # Create workspace
terraform apply -var-file={code}.tfvars  # Apply configuration
```

### Docker
```bash
docker-compose -f instances/{code}/docker-compose.yml up -d
docker logs dive-v3-{service}-{code}
```

---

## Known Issues & Fixes

### Issue 1: "fetch failed" in backend logs
**Cause**: TLS certificate validation failing
**Fix**: Ensure `NODE_TLS_REJECT_UNAUTHORIZED=0` in backend environment

### Issue 2: Frontend slow (>10s response)
**Cause**: Missing `BACKEND_URL` for internal Docker communication
**Fix**: Add `BACKEND_URL: https://backend-{code}:4000` to frontend environment

### Issue 3: "Realm does not exist"
**Cause**: Terraform not applied for instance
**Fix**: `terraform workspace select {code} && terraform apply -var-file={code}.tfvars`

### Issue 4: IdP selector shows "No identity providers"
**Cause**: Backend can't auth to Keycloak Admin API
**Fix**: Verify `KEYCLOAK_ADMIN_USER`, `KEYCLOAK_ADMIN_PASSWORD`, and `NODE_TLS_REJECT_UNAUTHORIZED=0`

### Issue 5: Container health check failing
**Cause**: Health check command not available in container
**Fix**: Use container-native tools (curl for Keycloak, /opa for OPA, node for backend)

---

## MCP Tools Available

- **Keycloak Docs MCP**: `mcp_keycloak-docs_docs_search` - Search Keycloak documentation
- **Stripe MCP**: Available but not primary for this project
- **Browser MCP**: `mcp_cursor-ide-browser_*` - For E2E testing in browser

---

## Current TODOs

- [ ] Browser verification - test login flows on all instances
- [ ] Federation testing - cross-instance authentication
- [ ] Create comprehensive test script for all scenarios
- [ ] Update PILOT-ARCHITECTURE.md with final state

---

## Quick Start Commands

```bash
# Check status of all instances
./scripts/dive status

# Start all instances
./scripts/dive up all

# View logs for specific instance
./scripts/dive logs fra

# Test IdP endpoint
curl -sk https://localhost:4001/api/idps/public | jq

# Test authentication
curl -sk -X POST "https://localhost:8444/realms/master/protocol/openid-connect/token" \
  -d "client_id=admin-cli" -d "username=admin" -d "password=admin" -d "grant_type=password"

# Apply Terraform for new instance
cd terraform/instances
terraform workspace select {code}
terraform apply -var-file={code}.tfvars -auto-approve
```

---

## Session Context

This is a **PILOT/POC/EXPERIMENT** with dummy data. Priorities:

1. **Scalability** - Easy to add new coalition partners
2. **Federation** - Cross-instance authentication
3. **Frictionless Demo** - Quick onboarding for demonstrations
4. **Best Practices** - No shortcuts or workarounds

Standards acknowledged (not fully enforced in pilot):
- ACP-240 (NATO access control)
- STANAG 4774/5636 (NATO labeling)
- ISO 3166-1 alpha-3 (country codes: USA, FRA, DEU, not US, FR, DE)

---

*Generated: November 25, 2025*
*Last Updated By: AI Assistant*


