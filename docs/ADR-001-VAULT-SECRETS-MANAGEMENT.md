# ADR-001: HashiCorp Vault Integration for Federation Secrets Management

**Date**: 2025-11-29  
**Status**: PROPOSED  
**Author**: AI Assistant / Architecture Team  
**Deciders**: DIVE V3 Ops Team  

---

## Executive Summary

This Architecture Decision Record (ADR) documents the decision to migrate DIVE V3's federation secrets management from the current manual script-based approach to a **HashiCorp Vault-based centralized secrets management solution**.

### Key Findings

| Aspect | Current State | Target State |
|--------|--------------|--------------|
| Secrets Storage | Scattered in `.env` files, Keycloak DB | Centralized in HashiCorp Vault |
| Secret Sync | Manual `sync-federation-secrets.sh` | Automated via Vault Agent |
| Validation | Impossible (Keycloak masks secrets) | Vault audit log + health checks |
| Scalability | O(n²) manual work for n partners | O(1) per partner onboarding |
| Cost | $0 (manual labor not counted) | ~$50-80/month (GCP) |

---

## Context

### The Problem

DIVE V3's federation architecture requires **12 bidirectional trust relationships** across 4 coalition partners (USA, FRA, GBR, DEU). Each relationship requires:

1. **Instance A** creates OIDC client `dive-v3-b-federation` for Instance B
2. **Instance B's** IdP broker needs Instance A's client secret to authenticate
3. **Terraform** creates the IdP broker before the secret is known

This creates a **chicken-and-egg problem**:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    CURRENT SECRET FLOW (PROBLEMATIC)                          │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Step 1: Terraform creates client on USA for FRA                           │
│   ┌─────────────┐                                                           │
│   │ USA         │  →  Client: dive-v3-fra-federation                        │
│   │ Keycloak    │  →  Secret: abc123... (generated)                         │
│   └─────────────┘                                                           │
│                                                                              │
│   Step 2: Terraform creates IdP broker on FRA (needs USA's secret!)         │
│   ┌─────────────┐                                                           │
│   │ FRA         │  →  IdP: usa-federation                                   │
│   │ Keycloak    │  →  Secret: ??? (placeholder-sync-after-terraform)        │
│   └─────────────┘                                                           │
│                                                                              │
│   Step 3: Manual script fetches and syncs secrets                           │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │ ./scripts/sync-federation-secrets.sh                                │   │
│   │   - GET USA client secret via Admin API                             │   │
│   │   - PUT FRA IdP broker with actual secret                           │   │
│   │   - PROBLEM: Cannot validate! Keycloak returns **********           │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Current Implementation Files

| File | Purpose | Issue |
|------|---------|-------|
| `config/federation-registry.json` | Single Source of Truth | No secrets, good |
| `terraform/modules/federated-instance/idp-brokers.tf` | Creates IdP brokers | Uses placeholder secrets |
| `scripts/sync-federation-secrets.sh` | Post-Terraform sync | Manual, can't validate |
| `docs/SECRETS-MANAGEMENT.md` | Current secrets guide | Documents manual process |

### Problems with Current Approach

1. **Chicken-and-egg**: Terraform creates IdP before secret exists
2. **No validation**: Keycloak masks secrets in GET responses (`**********`)
3. **Manual sync required**: Must run script after every Terraform apply
4. **No audit trail**: No logging of secret access
5. **Race conditions**: Parallel deployments can fail
6. **Not scalable**: Adding partners requires manual secret distribution
7. **Inconsistent state**: Secrets can drift between instances

---

## Decision Drivers

1. **Zero Downtime**: Migration must not interrupt existing federation
2. **No Secret Exposure**: Secrets must never be logged or exposed in Git
3. **Audit Trail**: All secret access must be logged
4. **Disaster Recovery**: Solution must survive single-region failure
5. **Cost Effective**: Target < $100/month for secrets infrastructure
6. **IaC First**: All infrastructure must be Terraform-managed
7. **Scalable**: Must support 10+ coalition partners without redesign

---

## Keycloak Vault SPI Research

### Key Findings from Keycloak Documentation

**Keycloak 26.x provides two built-in vault providers:**

1. **`files-plaintext`**: Reads secrets from plain text files in a directory
2. **`java-keystore`**: Reads secrets from a Java KeyStore file

**Vault reference syntax:**
```
${vault.key}
```

**Supported fields that can use Vault references:**
- ✅ SMTP password (realm email settings)
- ✅ LDAP bind credential (LDAP federation)
- ✅ **OIDC Identity Provider client secret** ← This is what we need!

**Key Resolvers (how realm + key → filename):**

| Resolver | Format | Example |
|----------|--------|---------|
| `KEY_ONLY` | `{key}` | `usa-federation-secret` |
| `REALM_UNDERSCORE_KEY` | `{realm}_{key}` | `dive-v3-broker_usa-federation-secret` |
| `REALM_FILESEPARATOR_KEY` | `{realm}/{key}` | `dive-v3-broker/usa-federation-secret` |

**Important Limitation**: Keycloak does NOT have a native HashiCorp Vault provider!

The "vault" in Keycloak's SPI is a generic abstraction, not HashiCorp Vault. We need a bridge.

---

## Options Considered

### Option A: GCP Secret Manager + File Sync + Keycloak files-plaintext ✅ RECOMMENDED

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         OPTION A: GCP SECRET MANAGER                          │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    GCP SECRET MANAGER                                │   │
│   │   (Single Source of Truth - Replicated, HA, Audited)                │   │
│   │                                                                      │   │
│   │   dive-v3/federation/usa-fra-secret                                 │   │
│   │   dive-v3/federation/usa-gbr-secret                                 │   │
│   │   dive-v3/federation/usa-deu-secret                                 │   │
│   │   dive-v3/federation/fra-usa-secret                                 │   │
│   │   ... (12 total)                                                    │   │
│   └────────────────────────────┬────────────────────────────────────────┘   │
│                                │                                             │
│            ┌───────────────────┼───────────────────┐                        │
│            │                   │                   │                        │
│            ▼                   ▼                   ▼                        │
│   ┌────────────────┐  ┌────────────────┐  ┌────────────────┐               │
│   │ Init Container │  │ Init Container │  │  Vault Agent   │               │
│   │ (local inst.)  │  │ (local inst.)  │  │  (DEU remote)  │               │
│   │                │  │                │  │                │               │
│   │ gcloud secrets │  │ gcloud secrets │  │ vault-agent    │               │
│   │ versions       │  │ versions       │  │ auto-sync      │               │
│   │ access...      │  │ access...      │  │                │               │
│   └───────┬────────┘  └───────┬────────┘  └───────┬────────┘               │
│           │                   │                   │                        │
│           ▼                   ▼                   ▼                        │
│   ┌────────────────────────────────────────────────────────────────────┐   │
│   │                    KEYCLOAK VAULT DIRECTORY                         │   │
│   │   /opt/keycloak/vault/                                             │   │
│   │   ├── dive-v3-broker_usa-federation-secret                         │   │
│   │   ├── dive-v3-broker_fra-federation-secret                         │   │
│   │   ├── dive-v3-broker_gbr-federation-secret                         │   │
│   │   └── dive-v3-broker_deu-federation-secret                         │   │
│   └────────────────────────────────────────────────────────────────────┘   │
│                                │                                             │
│                                ▼                                             │
│   ┌────────────────────────────────────────────────────────────────────┐   │
│   │                    KEYCLOAK files-plaintext SPI                     │   │
│   │   --vault=file                                                      │   │
│   │   --vault-dir=/opt/keycloak/vault                                  │   │
│   │   --spi-vault-file-key-resolvers=REALM_UNDERSCORE_KEY              │   │
│   └────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Pros:**
- Uses native Keycloak capability
- GCP Secret Manager is simple, audited, cost-effective (~$6/month for 12 secrets)
- No custom code required
- Works with existing Docker Compose setup
- Terraform can manage secrets

**Cons:**
- Requires init container or sidecar to sync files
- Secrets cached in files (acceptable with proper permissions)
- DEU instance needs network access to GCP

**Cost**: ~$10-20/month (GCP Secret Manager + Cloud Run for sync)

---

### Option B: HashiCorp Vault on GCP

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                      OPTION B: HASHICORP VAULT ON GCP                         │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    HASHICORP VAULT (HA Cluster)                      │   │
│   │   Running on: GKE Autopilot / Cloud Run / GCE                       │   │
│   │                                                                      │   │
│   │   KV Engine: dive-v3/federation/*                                   │   │
│   │   Auth Methods: GCP IAM, AppRole                                    │   │
│   │   Policies: Per-instance access control                             │   │
│   └────────────────────────────┬────────────────────────────────────────┘   │
│                                │                                             │
│                     Vault Agent (Sidecar)                                   │
│            ┌───────────────────┼───────────────────┐                        │
│            │                   │                   │                        │
│            ▼                   ▼                   ▼                        │
│   ┌────────────────┐  ┌────────────────┐  ┌────────────────┐               │
│   │ Vault Agent    │  │ Vault Agent    │  │ Vault Agent    │               │
│   │ (USA)          │  │ (FRA/GBR)      │  │ (DEU)          │               │
│   │                │  │                │  │                │               │
│   │ Template:      │  │ Template:      │  │ Template:      │               │
│   │ vault/*.secret │  │ vault/*.secret │  │ vault/*.secret │               │
│   └───────┬────────┘  └───────┬────────┘  └───────┬────────┘               │
│           │                   │                   │                        │
│           ▼                   ▼                   ▼                        │
│   ┌────────────────────────────────────────────────────────────────────┐   │
│   │                    KEYCLOAK files-plaintext SPI                     │   │
│   │   (Same as Option A - uses file-based vault)                       │   │
│   └────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Pros:**
- Industry-standard secrets management
- Rich policy language (ACL, Sentinel)
- Dynamic secrets capability (future)
- Built-in audit logging

**Cons:**
- Higher operational complexity
- Cost: $50-150/month (GKE + storage + network)
- Requires Vault expertise
- Still needs files-plaintext bridge

**Cost**: ~$80-150/month (depending on HA configuration)

---

### Option C: Custom Keycloak Vault SPI for HashiCorp Vault

**Pros:**
- Direct Vault integration without files

**Cons:**
- Requires Java development
- Must maintain custom extension
- Complex deployment
- Keycloak upgrades may break extension

**Cost**: Development time + maintenance

**Decision**: ❌ Rejected (too complex for pilot)

---

### Option D: Kubernetes External Secrets Operator

**Pros:**
- Cloud-native approach
- Works with any secret backend

**Cons:**
- Requires Kubernetes migration
- Doesn't work with current Docker Compose setup

**Decision**: ❌ Rejected (out of scope for pilot)

---

## Recommended Solution: Hybrid Approach

After analysis, I recommend a **phased hybrid approach**:

### Phase 1: GCP Secret Manager + Init Script (Immediate)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                   PHASE 1: GCP SECRET MANAGER + INIT SCRIPT                   │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Complexity: LOW    Cost: ~$10/month    Time: 1-2 days                     │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    GCP SECRET MANAGER                                │   │
│   │                                                                      │   │
│   │   Project: dive25                                            │   │
│   │   Secret Names:                                                      │   │
│   │   ├── dive-v3-federation-usa-fra                                    │   │
│   │   ├── dive-v3-federation-usa-gbr                                    │   │
│   │   ├── dive-v3-federation-usa-deu                                    │   │
│   │   ├── dive-v3-federation-fra-usa                                    │   │
│   │   ├── dive-v3-federation-fra-gbr                                    │   │
│   │   ├── dive-v3-federation-fra-deu                                    │   │
│   │   ├── dive-v3-federation-gbr-usa                                    │   │
│   │   ├── dive-v3-federation-gbr-fra                                    │   │
│   │   ├── dive-v3-federation-gbr-deu                                    │   │
│   │   ├── dive-v3-federation-deu-usa                                    │   │
│   │   ├── dive-v3-federation-deu-fra                                    │   │
│   │   └── dive-v3-federation-deu-gbr                                    │   │
│   │                                                                      │   │
│   │   IAM: Service accounts for each instance                           │   │
│   │   Audit: Cloud Audit Logs enabled                                   │   │
│   └────────────────────────────┬────────────────────────────────────────┘   │
│                                │                                             │
│                                ▼                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    DEPLOYMENT ORCHESTRATION                          │   │
│   │                                                                      │   │
│   │   1. Terraform creates federation clients (secrets generated)       │   │
│   │   2. Script uploads secrets to GCP Secret Manager                   │   │
│   │   3. Pre-start script syncs secrets to vault directory              │   │
│   │   4. Keycloak starts with files-plaintext provider                  │   │
│   │   5. IdP brokers use ${vault.partner-secret} references             │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Phase 2: HashiCorp Vault (Optional Enhancement)

If the pilot scales beyond 10 partners or requires advanced features:

- Deploy HCP Vault (HashiCorp Cloud Platform) for managed Vault
- Use Vault Agent sidecars for automatic secret sync
- Migrate from GCP Secret Manager to Vault KV

---

## Detailed Design: Phase 1

### 1. GCP Secret Manager Structure

```bash
# Secret naming convention:
# dive-v3-federation-{source}-{target}
# 
# Source instance creates the client, target needs the secret

gcloud secrets create dive-v3-federation-usa-fra \
  --replication-policy="user-managed" \
  --locations="us-east4,us-west1" \
  --labels="project=dive-v3,type=federation,source=usa,target=fra"

# Total: 12 secrets (4 instances × 3 partners each)
```

### 2. IAM Configuration

```hcl
# terraform/modules/secrets/iam.tf

# Service account for each instance
resource "google_service_account" "keycloak" {
  for_each = toset(["usa", "fra", "gbr", "deu"])
  
  account_id   = "dive-v3-keycloak-${each.key}"
  display_name = "DIVE V3 Keycloak ${upper(each.key)} Instance"
  project      = "dive25"
}

# Each instance can read its own secrets
resource "google_secret_manager_secret_iam_member" "keycloak_access" {
  for_each = local.federation_secrets_map
  
  project   = "dive25"
  secret_id = each.value.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.keycloak[each.value.target].email}"
}
```

### 3. Secret Sync Script

```bash
#!/bin/bash
# scripts/vault/sync-secrets-to-files.sh
# 
# Syncs secrets from GCP Secret Manager to Keycloak vault directory

set -euo pipefail

VAULT_DIR="${VAULT_DIR:-/opt/keycloak/vault}"
REALM="${REALM:-dive-v3-broker}"
INSTANCE="${INSTANCE:-usa}"

log() { echo "[$(date -Iseconds)] $*"; }

# Create vault directory
mkdir -p "$VAULT_DIR"
chmod 700 "$VAULT_DIR"

# Get list of federation partners from federation-registry.json
PARTNERS=$(jq -r ".federation.matrix.${INSTANCE}[]" /config/federation-registry.json)

for PARTNER in $PARTNERS; do
  SECRET_NAME="dive-v3-federation-${PARTNER}-${INSTANCE}"
  FILE_NAME="${REALM}_${PARTNER}-federation-secret"
  
  log "Fetching secret: $SECRET_NAME"
  
  if gcloud secrets versions access latest --secret="$SECRET_NAME" > "$VAULT_DIR/$FILE_NAME" 2>/dev/null; then
    chmod 600 "$VAULT_DIR/$FILE_NAME"
    log "✓ Synced: $FILE_NAME"
  else
    log "✗ Failed to fetch: $SECRET_NAME"
    exit 1
  fi
done

log "All secrets synced successfully"
```

### 4. Docker Compose Integration

```yaml
# docker-compose.yml (modified)

services:
  keycloak-vault-sync:
    image: google/cloud-sdk:slim
    container_name: dive-v3-vault-sync
    volumes:
      - keycloak_vault:/opt/keycloak/vault
      - ./config:/config:ro
      - ./scripts/vault/sync-secrets-to-files.sh:/sync.sh:ro
    environment:
      INSTANCE: usa
      REALM: dive-v3-broker
      GOOGLE_APPLICATION_CREDENTIALS: /gcp/service-account.json
    volumes:
      - ./gcp/service-account.json:/gcp/service-account.json:ro
    command: ["/bin/bash", "/sync.sh"]
    restart: "no"

  keycloak:
    # ... existing config ...
    depends_on:
      keycloak-vault-sync:
        condition: service_completed_successfully
    volumes:
      - keycloak_vault:/opt/keycloak/vault:ro
    command: >
      start-dev
      --vault=file
      --vault-dir=/opt/keycloak/vault
      --spi-vault-file-key-resolvers=REALM_UNDERSCORE_KEY

volumes:
  keycloak_vault:
```

### 5. Terraform IdP Broker Update

```hcl
# terraform/modules/federated-instance/idp-brokers.tf (modified)

resource "keycloak_oidc_identity_provider" "federation_partner" {
  for_each = var.federation_partners

  realm        = keycloak_realm.broker.id
  alias        = "${lower(each.value.instance_code)}-federation"
  display_name = "DIVE V3 - ${each.value.instance_name}"
  enabled      = each.value.enabled

  # ... existing config ...
  
  # CHANGED: Use vault reference instead of placeholder
  # The key format is: {partner}-federation-secret
  # Keycloak will look for file: {realm}_{key} in vault directory
  client_secret = "$${vault.${lower(each.value.instance_code)}-federation-secret}"

  # ... rest of config ...
}
```

### 6. Secret Generation and Upload

```bash
#!/bin/bash
# scripts/vault/upload-federation-secrets.sh
#
# After Terraform creates clients, upload secrets to GCP Secret Manager

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-dive25}"

# For each instance, get its federation client secrets and upload
for SOURCE in usa fra gbr deu; do
  IDP_URL=$(jq -r ".instances.${SOURCE}.urls.idp" config/federation-registry.json)
  PARTNERS=$(jq -r ".federation.matrix.${SOURCE}[]" config/federation-registry.json)
  
  # Get admin token
  TOKEN=$(get_admin_token "$SOURCE")
  
  for TARGET in $PARTNERS; do
    CLIENT_ID="dive-v3-${TARGET}-federation"
    SECRET_NAME="dive-v3-federation-${SOURCE}-${TARGET}"
    
    # Get client UUID
    CLIENT_UUID=$(curl -sk "${IDP_URL}/admin/realms/dive-v3-broker/clients?clientId=${CLIENT_ID}" \
      -H "Authorization: Bearer $TOKEN" | jq -r '.[0].id')
    
    # Get client secret
    SECRET=$(curl -sk "${IDP_URL}/admin/realms/dive-v3-broker/clients/${CLIENT_UUID}/client-secret" \
      -H "Authorization: Bearer $TOKEN" | jq -r '.value')
    
    # Upload to GCP Secret Manager
    if gcloud secrets describe "$SECRET_NAME" --project="$PROJECT_ID" &>/dev/null; then
      echo "$SECRET" | gcloud secrets versions add "$SECRET_NAME" \
        --data-file=- --project="$PROJECT_ID"
    else
      echo "$SECRET" | gcloud secrets create "$SECRET_NAME" \
        --data-file=- --project="$PROJECT_ID" \
        --replication-policy="automatic"
    fi
    
    echo "✓ Uploaded: $SECRET_NAME"
  done
done
```

---

## Deployment Workflow

### New Workflow with Vault Integration

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         NEW DEPLOYMENT WORKFLOW                               │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Step 1: Terraform Apply (All Instances)                                   │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │ terraform apply -target=module.keycloak_clients                     │   │
│   │                                                                      │   │
│   │ Creates:                                                             │   │
│   │ - USA: dive-v3-fra-federation, dive-v3-gbr-federation, ...         │   │
│   │ - FRA: dive-v3-usa-federation, dive-v3-gbr-federation, ...         │   │
│   │ - GBR: dive-v3-usa-federation, dive-v3-fra-federation, ...         │   │
│   │ - DEU: dive-v3-usa-federation, dive-v3-fra-federation, ...         │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                │                                             │
│                                ▼                                             │
│   Step 2: Extract and Upload Secrets                                        │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │ ./scripts/vault/upload-federation-secrets.sh                        │   │
│   │                                                                      │   │
│   │ For each source→target:                                             │   │
│   │   - GET client secret from source Keycloak                          │   │
│   │   - PUT secret to GCP Secret Manager                                │   │
│   │                                                                      │   │
│   │ Result: 12 secrets in GCP Secret Manager                            │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                │                                             │
│                                ▼                                             │
│   Step 3: Terraform Apply (IdP Brokers)                                     │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │ terraform apply -target=module.keycloak_idp_brokers                 │   │
│   │                                                                      │   │
│   │ Creates IdP brokers with vault references:                          │   │
│   │ - client_secret = "${vault.usa-federation-secret}"                  │   │
│   │ - Keycloak will resolve from /opt/keycloak/vault/                   │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                │                                             │
│                                ▼                                             │
│   Step 4: Start/Restart Keycloak                                            │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │ docker compose up -d keycloak                                       │   │
│   │                                                                      │   │
│   │ Pre-start:                                                           │   │
│   │ 1. keycloak-vault-sync container runs                               │   │
│   │ 2. Fetches secrets from GCP Secret Manager                          │   │
│   │ 3. Writes to /opt/keycloak/vault/                                   │   │
│   │ 4. Exits successfully                                               │   │
│   │                                                                      │   │
│   │ Keycloak start:                                                      │   │
│   │ 1. --vault=file --vault-dir=/opt/keycloak/vault                     │   │
│   │ 2. IdP brokers resolve ${vault.xxx-secret} at runtime               │   │
│   │ 3. Federation works!                                                │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                │                                             │
│                                ▼                                             │
│   Step 5: Verify                                                            │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │ ./scripts/verify-federation.sh                                      │   │
│   │                                                                      │   │
│   │ Test all 12 federation paths                                        │   │
│   │ ✓ USA→FRA, USA→GBR, USA→DEU                                        │   │
│   │ ✓ FRA→USA, FRA→GBR, FRA→DEU                                        │   │
│   │ ✓ GBR→USA, GBR→FRA, GBR→DEU                                        │   │
│   │ ✓ DEU→USA, DEU→FRA, DEU→GBR                                        │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Security Considerations

### Threat Model

| Threat | Mitigation |
|--------|------------|
| Secret exposure in Git | Secrets stored in GCP, not files |
| Unauthorized access to secrets | IAM policies, audit logging |
| Secret interception in transit | TLS for GCP API, Cloudflare tunnels |
| Stale secrets after rotation | Re-run sync script, restart Keycloak |
| Vault directory tampering | Read-only volume mount, file permissions |

### Audit Trail

GCP Secret Manager provides built-in audit logging:

```json
{
  "protoPayload": {
    "methodName": "google.cloud.secretmanager.v1.SecretManagerService.AccessSecretVersion",
    "resourceName": "projects/dive25/secrets/dive-v3-federation-usa-fra/versions/1",
    "authenticationInfo": {
      "principalEmail": "dive-v3-keycloak-fra@dive25.iam.gserviceaccount.com"
    }
  },
  "timestamp": "2025-11-29T12:00:00Z"
}
```

---

## Cost Analysis

### Phase 1: GCP Secret Manager

| Resource | Unit Cost | Quantity | Monthly Cost |
|----------|-----------|----------|--------------|
| Secret Manager (active secrets) | $0.06/secret | 12 | $0.72 |
| Secret Manager (access operations) | $0.03/10K ops | ~1000 | $0.03 |
| Cloud Audit Logs | Included | - | $0 |
| IAM Service Accounts | Free | 4 | $0 |
| **Total** | | | **~$1/month** |

### Phase 2: HashiCorp Vault (if needed)

| Resource | Monthly Cost |
|----------|--------------|
| HCP Vault Starter | $50/month |
| GKE Autopilot (alternative) | $40-80/month |
| Network egress | $5-10/month |
| **Total** | **$50-100/month** |

---

## Implementation Timeline

```
Week 1: Phase 1 Foundation
├── Day 1-2: GCP Secret Manager setup + IAM
├── Day 3-4: Sync scripts development
├── Day 5: Docker Compose integration
└── Day 6-7: Testing + documentation

Week 2: Terraform Integration
├── Day 1-2: Update idp-brokers.tf for vault references
├── Day 3-4: Update deploy-federation.sh workflow
├── Day 5: End-to-end testing
└── Day 6-7: Production deployment

Week 3: Validation + Hardening (if needed)
├── Secret rotation testing
├── Disaster recovery testing
└── Performance optimization

Week 4: Phase 2 Evaluation (optional)
├── Evaluate need for HashiCorp Vault
├── Pilot HCP Vault if needed
└── Document lessons learned
```

---

## Decision

**Selected Option**: **Phase 1 (GCP Secret Manager + File Sync)**

**Rationale**:
1. Meets all requirements (audit, security, scalability)
2. Lowest complexity and cost
3. Uses native Keycloak capability (files-plaintext)
4. Can evolve to HashiCorp Vault if needed
5. Works with existing Docker Compose infrastructure

---

## Consequences

### Positive
- Eliminates chicken-and-egg problem
- Provides audit trail for all secret access
- Enables automated secret rotation
- Scales to N partners without manual work
- Cost-effective (~$1-10/month)

### Negative
- Requires GCP account and authentication
- Adds init container to startup sequence
- Secrets cached in files (acceptable risk)
- DEU instance needs network access to GCP

### Neutral
- Migration requires Keycloak restart
- Need to maintain sync script
- Learning curve for GCP Secret Manager

---

## References

1. [Keycloak Vault Administration Guide](https://www.keycloak.org/docs/latest/server_admin/index.html#_vault-administration)
2. [GCP Secret Manager Documentation](https://cloud.google.com/secret-manager/docs)
3. [HashiCorp Vault Agent](https://developer.hashicorp.com/vault/docs/agent)
4. Current: `scripts/sync-federation-secrets.sh`
5. Current: `terraform/modules/federated-instance/idp-brokers.tf`

---

## Appendix A: Alternative HashiCorp Vault Architecture

If Phase 2 is needed, here's the HCP Vault deployment option:

```hcl
# HCP Vault configuration
resource "hcp_vault_cluster" "dive_v3" {
  cluster_id      = "dive-v3-secrets"
  hvn_id          = hcp_hvn.dive_v3.hvn_id
  tier            = "starter_small"
  public_endpoint = true
}

# Vault Agent config for each Keycloak instance
# agent.hcl
vault {
  address = "https://dive-v3-secrets.vault.hashicorp.cloud:8200"
}

auto_auth {
  method "approle" {
    mount_path = "auth/approle"
    config = {
      role_id_file_path   = "/vault/role-id"
      secret_id_file_path = "/vault/secret-id"
    }
  }
}

template {
  source      = "/vault/templates/federation.ctmpl"
  destination = "/opt/keycloak/vault/dive-v3-broker_{{.Key}}"
}
```

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-11-29 | AI Assistant | Initial ADR |

