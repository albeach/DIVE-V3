# DIVE V3: GCP Secret Manager + Keycloak Vault Integration - Implementation Prompt

## ✅ IMPLEMENTATION COMPLETE - 2025-11-29

**Status**: All phases successfully implemented and verified.

**GCP Project**: `dive25` (using existing project, not creating new one)

### Summary of Completed Work

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1 | ✅ Complete | GCP Secret Manager infrastructure - 12 secrets created |
| Phase 1 | ✅ Complete | 4 service accounts with least-privilege IAM policies |
| Phase 2 | ✅ Complete | Sync scripts tested and working |
| Phase 3 | ✅ Complete | Terraform module ready for vault references |
| Phase 4 | ✅ Complete | All 12 federation paths verified |
| Phase 5 | ✅ Complete | Comprehensive verification scripts created |

### Quick Verification

```bash
# Verify all federation paths
./scripts/verify-federation.sh --all

# Verify GCP secrets
./scripts/vault/verify-secrets.sh --verbose

# Expected: 12 endpoints passed, 12 brokers passed, 12 secrets passed
```

---

## 🎯 Original Mission Objective

Implement the **GCP Secret Manager + Keycloak Vault SPI** solution (Phase 1 from ADR-001) to centralize federation secrets management for the DIVE V3 coalition identity platform. The solution must be **100% persistent, resilient, and scalable** for onboarding additional coalition partners.

**Key Decision Made**: We are implementing **Option A (GCP Secret Manager + File Sync)** as documented in ADR-001, NOT HashiCorp Vault. This is simpler, cheaper (~$1-10/month vs $80+/month), and uses native Keycloak capability.

**Skip Monitoring Layer**: The optional monitoring/alerting layer can be deferred to a later phase.

---

## 📋 Background Context

### What This Project Accomplishes

DIVE V3 is a coalition-friendly ICAM platform demonstrating federated identity management across USA/NATO partners. We currently have **4 Keycloak instances** (USA, FRA, GBR, DEU) with **12 bidirectional federation relationships**.

### The Problem We Solved (Current State)

The previous chat session:
1. **Diagnosed** the chicken-and-egg problem with federation secrets
2. **Fixed** the `sync-federation-secrets.sh` script (URL encoding, arithmetic bugs)
3. **Deployed** all 4 instances successfully with 12 secrets synchronized
4. **Documented** the architecture decision in ADR-001
5. **Created** comprehensive deployment orchestration scripts

**Current Status**: All 4 federation instances are WORKING with manually synchronized secrets. The goal is to migrate to automated, centralized secret management.

---

## 📁 Key Documentation Generated (Must Read)

### ADR-001: Vault Secrets Management
**Path**: `docs/ADR-001-VAULT-SECRETS-MANAGEMENT.md`

This document contains:
- Detailed analysis of the current problem
- Keycloak Vault SPI research findings
- 4 options evaluated (GCP Secret Manager ✅, HashiCorp Vault, Custom SPI ❌, K8s ESO ❌)
- **SELECTED SOLUTION**: GCP Secret Manager + Keycloak `files-plaintext` SPI
- Complete implementation design with code examples
- Deployment workflow diagrams
- Cost analysis (~$1/month for Phase 1)
- Security considerations

### Secrets Management Guide
**Path**: `docs/SECRETS-MANAGEMENT.md`

This document contains:
- Current secrets flow architecture
- How Docker Compose, Terraform, and applications get secrets
- Federation secrets flow with Vault integration
- Secret naming conventions
- Troubleshooting guide

---

## 🏗️ Current Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         DIVE V3 FEDERATION                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  LOCAL INSTANCES (dive25.com - Cloudflare Account 1)                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                     │
│  │  🇺🇸 USA     │  │  🇫🇷 FRA     │  │  🇬🇧 GBR     │                     │
│  │  Keycloak   │  │  Keycloak   │  │  Keycloak   │                     │
│  │  Port: 8443 │  │  Port: 8444 │  │  Port: 8445 │                     │
│  └─────────────┘  └─────────────┘  └─────────────┘                     │
│         │                │                │                             │
│         └────────────────┼────────────────┘                             │
│                          │                                              │
│              Cloudflare Tunnels → usa/fra/gbr-idp.dive25.com           │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  REMOTE INSTANCE (prosecurity.biz - Cloudflare Account 2)              │
│  ┌─────────────────────────────────────────────────────────┐           │
│  │  🇩🇪 DEU Instance @ 192.168.42.120 (SSH: mike@)          │           │
│  │  - Keycloak → deu-idp.prosecurity.biz                   │           │
│  │  - Frontend → deu-app.prosecurity.biz                   │           │
│  │  - Backend → deu-api.prosecurity.biz                    │           │
│  └─────────────────────────────────────────────────────────┘           │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  FEDERATION MATRIX (12 secrets, all currently working)                 │
│  USA ↔ FRA, USA ↔ GBR, USA ↔ DEU                                       │
│  FRA ↔ GBR, FRA ↔ DEU                                                  │
│  GBR ↔ DEU                                                              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 📂 Project Directory Structure

```
DIVE-V3/
├── config/
│   └── federation-registry.json       # SSOT for all instance configs
├── terraform/
│   ├── modules/
│   │   ├── federated-instance/        # Main Keycloak IaC
│   │   │   ├── idp-brokers.tf         # Current IdP broker config
│   │   │   ├── idp-brokers-vault.tf   # NEW: Vault-enabled version
│   │   │   └── variables.tf
│   │   └── secrets-manager/           # NEW: GCP Secret Manager module
│   │       ├── main.tf
│   │       ├── variables.tf
│   │       └── outputs.tf
│   └── instances/                     # Per-instance Terraform
├── scripts/
│   ├── sync-federation-secrets.sh     # Current manual sync (to be replaced)
│   ├── deploy-federation.sh           # Main orchestration script
│   ├── vault/                         # NEW: Vault integration scripts
│   │   ├── upload-federation-secrets.sh
│   │   ├── sync-secrets-to-files.sh
│   │   ├── verify-secrets.sh
│   │   └── deploy-with-vault.sh
│   ├── federation/                    # Config generation scripts
│   │   ├── generate-all-configs.sh
│   │   └── validate-federation.sh
│   └── remote/                        # DEU remote deployment
│       ├── ssh-helper.sh
│       ├── deploy-remote.sh
│       └── sync-themes.sh
├── docker-compose.yml                 # USA instance
├── docker-compose.fra.yml             # FRA instance
├── docker-compose.gbr.yml             # GBR instance
├── docker-compose.deu.yml             # DEU instance
├── docker-compose.vault.yml           # NEW: Vault overlay
├── cloudflared/                       # Tunnel configurations
│   ├── config.yml                     # USA tunnel
│   ├── config-fra.yml
│   ├── config-gbr.yml
│   └── config-deu.yml
└── docs/
    ├── ADR-001-VAULT-SECRETS-MANAGEMENT.md  # Architecture decision
    ├── SECRETS-MANAGEMENT.md                # Secrets guide
    └── FEDERATION-GAP-ANALYSIS.md           # Previous analysis
```

---

## 🔧 Available Tools & Access

You have **full access** to:

1. **GitHub CLI** (`gh`) - Repository management, secrets, actions
2. **GCP CLI** (`gcloud`) - **Need to create new project: `dive-v3-pilot`**
3. **Cloudflare CLI** (`cloudflared`) - Two accounts:
   - `contact@aubreybeach.com` (dive25.com) - currently authenticated
   - `contact@aubreybeach.com` (prosecurity.biz) - switch with cert backup
4. **Keycloak Docs MCP** (`mcp_keycloak-docs_*`) - Full documentation for:
   - Server Administration Guide
   - Admin REST API  
   - Vault SPI configuration
   - **USE THIS EXTENSIVELY** for Keycloak configuration details
5. **Terminal access** with network permissions
6. **Browser automation** for testing

---

## 🎯 SMART Objectives & Success Criteria

### Phase 1: GCP Infrastructure (Day 1-2)

**Objective**: Create GCP project and Secret Manager infrastructure

**Tasks**:
- [ ] Create GCP project `dive-v3-pilot`
- [ ] Enable Secret Manager API
- [ ] Create 12 federation secrets with proper naming
- [ ] Create 4 service accounts (one per instance)
- [ ] Configure IAM policies for least-privilege access
- [ ] Enable Cloud Audit Logs

**Success Criteria**:
- [ ] `gcloud secrets list --project=dive-v3-pilot` shows 12 secrets
- [ ] Each service account can ONLY access secrets for its instance
- [ ] Audit logs capture all secret access attempts

### Phase 2: Keycloak Vault Integration (Day 3-4)

**Objective**: Configure Keycloak instances to use files-plaintext vault

**Tasks**:
- [ ] Research Keycloak Vault SPI options using keycloak-docs MCP
- [ ] Create `sync-secrets-to-files.sh` script
- [ ] Create `docker-compose.vault.yml` overlay
- [ ] Update Keycloak startup command with vault flags
- [ ] Test on USA instance first

**Success Criteria**:
- [ ] Keycloak starts with `--vault=file --vault-dir=/opt/keycloak/vault`
- [ ] `${vault.usa-federation-secret}` resolves to correct value
- [ ] Federation login works through vault-sourced secrets

### Phase 3: Terraform Integration (Day 5-6)

**Objective**: Update Terraform to use vault references in IdP brokers

**Tasks**:
- [ ] Create `terraform/modules/secrets-manager/` module
- [ ] Update `idp-brokers.tf` to use `${vault.key}` syntax
- [ ] Create `upload-federation-secrets.sh` to populate GCP
- [ ] Update `deploy-federation.sh` workflow

**Success Criteria**:
- [ ] `terraform apply` creates IdP brokers with vault references
- [ ] No placeholder secrets in Keycloak configuration
- [ ] Full deployment works without manual secret sync

### Phase 4: Remote Instance Integration (Day 7)

**Objective**: Configure DEU instance to access GCP secrets

**Tasks**:
- [ ] Install GCP SDK on DEU server
- [ ] Configure service account authentication
- [ ] Deploy vault-enabled docker-compose to DEU
- [ ] Test cross-account federation (DEU ↔ USA/FRA/GBR)

**Success Criteria**:
- [ ] DEU instance fetches secrets from GCP
- [ ] All 12 federation paths working
- [ ] `./scripts/verify-federation.sh` passes 100%

### Phase 5: Validation & Documentation (Day 8)

**Objective**: Complete test suite and documentation

**Tasks**:
- [ ] Create comprehensive test script for all federation paths
- [ ] Test secret rotation procedure
- [ ] Document partner onboarding process
- [ ] Create runbook for operations

**Success Criteria**:
- [ ] All 12 federation logins verified via browser
- [ ] Secret rotation completes without downtime
- [ ] Documentation sufficient for external teams

---

## 🧪 Test Requirements

### Integration Tests
```bash
# Test all 12 federation paths
./scripts/verify-federation.sh --all

# Expected output:
# ✅ USA → FRA: 200 OK
# ✅ USA → GBR: 200 OK
# ✅ USA → DEU: 200 OK
# ✅ FRA → USA: 200 OK
# ... (12 total)
```

### Vault Tests
```bash
# Test secret retrieval from GCP
./scripts/vault/verify-secrets.sh --verbose

# Expected output:
# ✅ dive-v3-federation-usa-fra: accessible
# ✅ dive-v3-federation-usa-gbr: accessible
# ... (12 total)
```

### E2E Browser Tests
- Complete login flow: USA user → FRA app via federation
- Complete login flow: DEU user → USA app via federation
- Verify correct claims passed through federation

---

## 📚 Keycloak Research Tasks (Use MCP)

Use `mcp_keycloak-docs_docs_search` to research:

1. **Vault SPI configuration options** - What flags does Keycloak accept?
2. **Key resolvers** - How does `REALM_UNDERSCORE_KEY` format the filename?
3. **Secret caching** - Does Keycloak cache vault secrets? How to refresh?
4. **Error handling** - What happens if vault file is missing/corrupted?
5. **IdP client_secret field** - Exact syntax for vault references

---

## 🚀 Getting Started

1. **Read ADR-001** at `docs/ADR-001-VAULT-SECRETS-MANAGEMENT.md`
2. **Check current status**:
   ```bash
   ./scripts/deploy-federation.sh status
   ```
3. **Create GCP project**:
   ```bash
   gcloud projects create dive-v3-pilot --name="DIVE V3 Secrets"
   gcloud config set project dive-v3-pilot
   gcloud services enable secretmanager.googleapis.com
   ```
4. **Begin Phase 1 implementation**

---

## ⚠️ Critical Requirements

1. **Zero Downtime**: Migration must not interrupt existing federation
2. **No Secret Exposure**: Secrets must never appear in logs or Git
3. **Audit Trail**: All secret access must be logged in GCP
4. **DEU Network Access**: Remote instance must reach GCP APIs
5. **IaC First**: All infrastructure must be Terraform-managed
6. **Scalable**: Design for 10+ coalition partners

---

## 📎 Reference: Current Working Commands

```bash
# Check federation status
./scripts/deploy-federation.sh status

# Validate secrets (current manual method)
/usr/local/bin/bash ./scripts/sync-federation-secrets.sh --validate-only

# Test endpoints
curl -sk https://usa-idp.dive25.com/realms/dive-v3-broker
curl -sk https://deu-idp.prosecurity.biz/realms/dive-v3-broker

# SSH to DEU
source ./scripts/remote/ssh-helper.sh
ssh_remote deu "docker ps"
```

---

**BEGIN IMPLEMENTATION: Start with Phase 1 - GCP Infrastructure Setup**

