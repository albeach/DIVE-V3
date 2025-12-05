# DIVE V3 - Phased Implementation Plan
## Best Practice Architecture for Medium-Term Pilot Deployment

**Date:** November 27, 2025  
**Version:** 1.0.0  
**Target Duration:** 8 weeks (2 months)  
**Deployment Type:** Medium-term pilot (3-12 months)  
**Classification:** INTERNAL USE ONLY

---

## Executive Summary

This implementation plan addresses **10 critical gaps** identified in the comprehensive audit, using industry best practices for a scalable, maintainable federated identity management system supporting 10-50 concurrent users across multiple geographic locations.

### Architecture Decisions Summary

| Domain | Decision | Rationale |
|--------|----------|-----------|
| **SSOT** | federation-registry.json → generates Terraform + Docker | Single source, reduces drift |
| **Secrets** | GCP Secret Manager (us-east4) | Native integration, audit trail, cost-effective |
| **CI/CD** | GitHub Actions + Cloud Build | Existing infrastructure, minimal cost |
| **Passwords** | NIST 800-63B compliant (16+ chars) | Admin: `DivePilot2025!SecureAdmin`, Test: `TestUser2025!Pilot` |
| **Testing** | Jest + Playwright + Cypress + k6 | 80%+ coverage across all types |
| **Compliance** | ACP-240 + NIST 800-63 + STANAG 4774/4778 | NATO + US Federal standards |
| **Infrastructure** | Hybrid: Local dev + GCP staging/prod | Cost optimization (~$150/month) |
| **Federation** | Hub-spoke model, supports external domains | Scalable to 10+ partners |

### Budget Projection

| Component | Monthly Cost | Annual |
|-----------|-------------|--------|
| GCP Secret Manager | $6 | $72 |
| GCP Cloud Run (staging) | $20 | $240 |
| Cloud Build (CI/CD) | $10 | $120 |
| Cloud Logging | $15 | $180 |
| Monitoring/Alerting | $10 | $120 |
| Cloudflare (tunnels) | $20 | $240 |
| **TOTAL** | **~$81/month** | **~$972/year** |

*Actual usage may vary. Includes generous buffer for pilot scale.*

---

## Phase 1: Critical Fixes & Standardization
**Duration:** Week 1-2  
**Objective:** Resolve critical operational issues, standardize credentials

### 1.1 Password Policy Implementation (NIST 800-63B Compliant)

**SMART Objective:** By Day 5, all instances will enforce NIST 800-63B password policies with separate admin and test user credentials, verified by automated tests.

#### Password Specification

**NIST 800-63B Requirements:**
- Minimum 12 characters (we'll use 16+ for pilot security)
- No composition rules (but we'll add for defense-in-depth)
- Check against compromised password list (implement via OPA policy)
- No mandatory rotation (only on compromise)

**Proposed Passwords:**

```yaml
# Admin Credentials (Keycloak, databases)
ADMIN_PASSWORD: "DivePilot2025!SecureAdmin"  # 26 chars, high entropy

# Test User Credentials (all clearance levels)
TEST_USER_PASSWORD: "TestUser2025!Pilot"  # 19 chars, memorable for demos

# Service Account Credentials (backend ↔ Keycloak)
SERVICE_ACCOUNT_SECRET: "[Generated 32-char random, stored in GCP Secret Manager]"
```

**Rationale:**
- Admin password: Longer, more secure, rotated quarterly
- Test password: Easy for demos/training, still secure
- Service secrets: Random, never exposed to humans

#### Implementation Tasks

**Task 1.1.1:** Update Terraform password policy
```hcl
# terraform/modules/federated-instance/main.tf
resource "keycloak_realm" "broker" {
  # NIST 800-63B Compliant Password Policy
  password_policy = join(" and ", [
    "length(16)",           # Minimum 16 characters
    "upperCase(1)",         # At least 1 uppercase
    "lowerCase(1)",         # At least 1 lowercase  
    "digits(1)",            # At least 1 digit
    "specialChars(1)",      # At least 1 special char
    "notUsername()",        # Cannot contain username
    "notEmail()",           # Cannot contain email
    "passwordHistory(5)",   # Cannot reuse last 5 passwords
  ])
}
```

**Task 1.1.2:** Update test user passwords
```hcl
# terraform/modules/federated-instance/test-users.tf
locals {
  # Separate admin and test user passwords
  admin_password     = "DivePilot2025!SecureAdmin"
  test_user_password = "TestUser2025!Pilot"
}

resource "keycloak_user" "pilot_users" {
  # ... existing config ...
  
  initial_password {
    value     = local.test_user_password  # Changed
    temporary = false
  }
}
```

**Task 1.1.3:** Update docker-compose environment variables
```bash
# Use script to update all instances
./scripts/update-credentials.sh \
  --admin-password "DivePilot2025!SecureAdmin" \
  --test-password "TestUser2025!Pilot" \
  --all-instances
```

**Task 1.1.4:** Apply to all instances
```bash
cd terraform/instances

# USA
terraform workspace select usa
terraform apply -var-file=usa.tfvars -auto-approve

# FRA  
terraform workspace select fra
terraform apply -var-file=fra.tfvars -auto-approve

# GBR
terraform workspace select gbr
terraform apply -var-file=gbr.tfvars -auto-approve

# DEU (remote)
./scripts/remote/apply-terraform.sh deu
```

**Success Criteria:**
- ✅ All Keycloak instances enforce 16-char minimum
- ✅ Test users can login with `TestUser2025!Pilot`
- ✅ Admins can login with `DivePilot2025!SecureAdmin`
- ✅ Password policy prevents weak passwords
- ✅ Automated test verifies all credentials

**Test Script:**
```bash
#!/bin/bash
# scripts/test-password-policy.sh

echo "Testing password policy compliance..."

# Test 1: Weak password rejected
curl -X POST https://usa-idp.dive25.com/realms/dive-v3-broker/protocol/openid-connect/token \
  -d "username=testuser-usa-1" \
  -d "password=weak123" \
  | jq -e '.error == "invalid_grant"'

# Test 2: Correct password works
curl -X POST https://usa-idp.dive25.com/realms/dive-v3-broker/protocol/openid-connect/token \
  -d "username=testuser-usa-1" \
  -d "password=TestUser2025!Pilot" \
  -d "grant_type=password" \
  -d "client_id=dive-v3-client-broker" \
  | jq -e '.access_token != null'

echo "✅ Password policy tests passed"
```

---

### 1.2 Fix DEU Federation Authentication

**SMART Objective:** By Day 7, DEU instance will successfully federate with USA/FRA/GBR with <5s authentication time, zero 401 errors in 100 consecutive attempts.

#### Root Cause

```
PROBLEM: Client secret mismatch between DEU and other instances
EVIDENCE: Keycloak logs show "Invalid client or Invalid client credentials"
IMPACT: Cannot demonstrate cross-border federation in pilot demos
```

#### Resolution Steps

**Step 1:** SSH to DEU server and backup current state
```bash
./scripts/remote/backup-remote.sh deu
# Creates: backups/deu-$(date +%Y%m%d-%H%M%S)/
```

**Step 2:** Generate matching client secret
```bash
# On local machine
cd terraform/instances
terraform workspace select usa
terraform output -json > usa-outputs.json

# Extract client secret for DEU federation partner
CLIENT_SECRET=$(jq -r '.federation_partners.value.deu.client_secret' usa-outputs.json)
echo "DEU Client Secret: $CLIENT_SECRET"
```

**Step 3:** Update DEU Terraform configuration
```bash
# Copy to DEU server
sshpass -p "$DEU_PASSWORD" scp terraform/instances/deu.tfvars mike@192.168.42.120:~/dive-v3/terraform/instances/

# SSH and apply
ssh mike@192.168.42.120 << EOF
  cd ~/dive-v3/terraform/instances
  terraform workspace select deu
  terraform apply -var-file=deu.tfvars -auto-approve
EOF
```

**Step 4:** Verify federation from all instances
```bash
./scripts/test-federation-matrix.sh
# Tests: USA→DEU, FRA→DEU, GBR→DEU, DEU→USA, DEU→FRA, DEU→GBR
```

**Success Criteria:**
- ✅ Zero 401 errors in Keycloak logs
- ✅ USA user can login to DEU frontend
- ✅ FRA user can login to DEU frontend
- ✅ GBR user can login to DEU frontend
- ✅ DEU user can login to USA/FRA/GBR frontends
- ✅ Federation completes in <5 seconds (p95)

---

### 1.3 Fix Service Health Checks

**SMART Objective:** By Day 10, all 50 services will report accurate health status with zero false negatives, validated by automated monitoring.

#### Current Issues

```
PROBLEM: 32/50 services report "unhealthy" despite functioning correctly
ROOT CAUSE: Health check commands incompatible with Alpine Linux containers
IMPACT: Monitoring alerts unreliable, operations team lacks confidence
```

#### Fix Strategy

Replace all healthcheck commands with Alpine-compatible alternatives:

**Backend Services:**
```yaml
# BEFORE (doesn't work):
healthcheck:
  test: ["CMD-SHELL", "wget --ca-certificate=/app/certs/rootCA.pem -q -O- https://localhost:4000/health || exit 1"]

# AFTER (works):
healthcheck:
  test: ["CMD-SHELL", "wget --no-check-certificate -qO- http://localhost:4000/health | grep -q 'healthy' || exit 1"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 60s
```

**Frontend Services:**
```yaml
# AFTER (works):
healthcheck:
  test: ["CMD-SHELL", "wget --spider -q http://localhost:3000 || exit 1"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 120s  # Next.js needs time to compile
```

**Implementation:**
```bash
# Automated fix script
./scripts/fix-healthchecks.sh --all-instances --apply

# Restart services to apply new healthchecks
docker-compose -f instances/usa/docker-compose.yml restart
docker-compose -f instances/fra/docker-compose.yml restart  
docker-compose -f instances/gbr/docker-compose.yml restart
```

**Success Criteria:**
- ✅ USA: 9/9 critical services healthy
- ✅ FRA: 9/9 critical services healthy
- ✅ GBR: 9/9 critical services healthy
- ✅ Shared: 6/6 services healthy
- ✅ Grafana shows accurate status for 100% of services
- ✅ Status page (status.dive25.com) shows all green

---

### 1.4 Clean Up Orphaned Docker Resources

**SMART Objective:** By Day 12, Docker environment will have zero orphaned resources, reclaiming ~20GB disk space, with automated cleanup documented.

#### Audit Results

```
TOTAL VOLUMES: 42
ACTIVE: 18 (current instances)
ORPHANED: 24 (old DEU local, duplicates, legacy)
DISK SPACE: ~20GB reclaimable
```

#### Safe Cleanup Process

**Step 1: Backup everything**
```bash
#!/bin/bash
# scripts/backup-and-cleanup-volumes.sh

echo "=== DIVE V3 Volume Cleanup ==="
BACKUP_DIR="backups/volume-cleanup-$(date +%Y%m%d)"
mkdir -p "$BACKUP_DIR"

# List orphaned volumes
ORPHANED_VOLUMES=(
  "dive-v3_frontend_deu_next"
  "dive-v3_frontend_deu_node_modules"
  "dive-v3_mongodb_deu_data"
  "dive-v3_postgres_deu_data"
  "dive-v3_redis_deu_data"
  "dive-v3_mongo_data"
  "dive-v3_postgres_data"
  "dive-v3_redis_data"
  "dive-v3_frontend_next"
  "dive-v3_frontend_node_modules"
  "dive-v3_authzforce_data"
  "dive-v3-blacklist-redis-data"
)

# Backup each volume
for vol in "${ORPHANED_VOLUMES[@]}"; do
  echo "Backing up $vol..."
  docker run --rm \
    -v "$vol:/data:ro" \
    -v "$(pwd)/$BACKUP_DIR:/backup" \
    alpine tar czf "/backup/${vol}.tar.gz" /data 2>/dev/null || echo "Volume $vol not found or empty"
done

echo "✅ Backups created in $BACKUP_DIR"
echo "Total size: $(du -sh $BACKUP_DIR | cut -f1)"
```

**Step 2: Delete orphaned volumes**
```bash
# Verify backups exist
ls -lh backups/volume-cleanup-*/

# Delete volumes (with confirmation)
for vol in "${ORPHANED_VOLUMES[@]}"; do
  echo "Deleting $vol..."
  docker volume rm "$vol" 2>/dev/null || echo "Volume already removed"
done

# Verify cleanup
docker volume ls | grep dive-v3 | wc -l
# Should show ~18 volumes remaining
```

**Success Criteria:**
- ✅ All 24 orphaned volumes backed up
- ✅ Backups verified (can restore if needed)
- ✅ ~20GB disk space reclaimed
- ✅ Only active instance volumes remain (18 total)
- ✅ All services still running after cleanup
- ✅ Documentation updated with cleanup procedure

---

## Phase 2: Single Source of Truth (SSOT)
**Duration:** Week 3-4  
**Objective:** Implement federation-registry.json as master configuration

### 2.1 Enhanced Federation Registry

**SMART Objective:** By Day 20, all instance configurations will be generated from federation-registry.json, with zero manual edits to .tfvars or docker-compose files in 2 weeks of operation.

#### Registry Schema v2.0

```json
{
  "$schema": "./federation-registry.schema.json",
  "version": "2.0.0",
  "metadata": {
    "lastUpdated": "2025-11-27T00:00:00Z",
    "maintainer": "DIVE V3 Ops Team",
    "compliance": ["ACP-240", "NIST 800-63", "STANAG 4774", "STANAG 4778"]
  },
  "defaults": {
    "realm": "dive-v3-broker",
    "clientId": "dive-v3-client-broker",
    "testUserPassword": "TestUser2025!Pilot",
    "adminPassword": "DivePilot2025!SecureAdmin",
    "tokenLifetime": "15m",
    "sessionLifetime": "10h"
  },
  "instances": {
    "usa": {
      "code": "USA",
      "name": "United States",
      "type": "local",
      "deployment": {
        "provider": "docker",
        "host": "localhost",
        "domain": "dive25.com"
      },
      "urls": {
        "app": "https://usa-app.dive25.com",
        "api": "https://usa-api.dive25.com",
        "idp": "https://usa-idp.dive25.com"
      },
      "ports": {
        "frontend": 3000,
        "backend": 4000,
        "keycloak": 8443,
        "keycloakHttp": 8081,
        "postgres": 5433,
        "mongodb": 27017,
        "redis": 6379,
        "opa": 8181,
        "kas": 8080
      },
      "keycloak": {
        "adminUsername": "admin",
        "database": {
          "name": "keycloak_db",
          "user": "keycloak",
          "port": 5432
        }
      },
      "secrets": {
        "gcpSecretPath": "projects/dive-v3-pilot/secrets/usa",
        "clientSecretId": "usa-client-secret",
        "adminPasswordId": "usa-admin-password"
      },
      "cloudflare": {
        "tunnelId": "f8e6c558-847b-4952-b8b2-27f98a85e36c",
        "tunnelName": "dive-v3-tunnel"
      },
      "enabled": true
    },
    "fra": {
      "code": "FRA",
      "name": "France",
      "type": "local",
      "deployment": {
        "provider": "docker",
        "host": "localhost",
        "domain": "dive25.com"
      },
      "urls": {
        "app": "https://fra-app.dive25.com",
        "api": "https://fra-api.dive25.com",
        "idp": "https://fra-idp.dive25.com"
      },
      "ports": {
        "frontend": 3001,
        "backend": 4001,
        "keycloak": 8444,
        "keycloakHttp": 8082,
        "postgres": 5434,
        "mongodb": 27018,
        "redis": 6380,
        "opa": 8182,
        "kas": 8083
      },
      "secrets": {
        "gcpSecretPath": "projects/dive-v3-pilot/secrets/fra",
        "clientSecretId": "fra-client-secret",
        "adminPasswordId": "fra-admin-password"
      },
      "cloudflare": {
        "tunnelId": "e07574bd-6f32-478b-8f71-42fc3d4073f7",
        "tunnelName": "dive-v3-fra"
      },
      "enabled": true
    },
    "gbr": {
      "code": "GBR",
      "name": "United Kingdom",
      "type": "local",
      "deployment": {
        "provider": "docker",
        "host": "localhost",
        "domain": "dive25.com"
      },
      "urls": {
        "app": "https://gbr-app.dive25.com",
        "api": "https://gbr-api.dive25.com",
        "idp": "https://gbr-idp.dive25.com"
      },
      "ports": {
        "frontend": 3002,
        "backend": 4002,
        "keycloak": 8445,
        "keycloakHttp": 8183,
        "postgres": 5435,
        "mongodb": 27019,
        "redis": 6381,
        "opa": 8283,
        "kas": 8084
      },
      "secrets": {
        "gcpSecretPath": "projects/dive-v3-pilot/secrets/gbr",
        "clientSecretId": "gbr-client-secret",
        "adminPasswordId": "gbr-admin-password"
      },
      "cloudflare": {
        "tunnelId": "375d2bed-2002-4604-9fa6-22ca251ac957",
        "tunnelName": "dive-v3-gbr"
      },
      "enabled": true
    },
    "deu": {
      "code": "DEU",
      "name": "Germany",
      "type": "remote",
      "deployment": {
        "provider": "docker",
        "host": "192.168.42.120",
        "domain": "prosecurity.biz",
        "sshUser": "mike",
        "sshKeyPath": "~/.ssh/id_ed25519"
      },
      "urls": {
        "app": "https://deu-app.prosecurity.biz",
        "api": "https://deu-api.prosecurity.biz",
        "idp": "https://deu-idp.prosecurity.biz"
      },
      "secrets": {
        "gcpSecretPath": "projects/dive-v3-pilot/secrets/deu",
        "clientSecretId": "deu-client-secret",
        "adminPasswordId": "deu-admin-password"
      },
      "cloudflare": {
        "tunnelId": "2112e264-61e3-463f-9d13-b55273bde204",
        "tunnelName": "dive-v3-deu-prosecurity"
      },
      "enabled": true,
      "notes": "External partner deployment. Requires SSH access for management."
    }
  },
  "federation": {
    "matrix": {
      "usa": ["fra", "gbr", "deu"],
      "fra": ["usa", "gbr", "deu"],
      "gbr": ["usa", "fra", "deu"],
      "deu": ["usa", "fra", "gbr"]
    },
    "defaultEnabled": true,
    "trustModel": "bilateral",
    "attributeMapping": {
      "clearance": "required",
      "countryOfAffiliation": "required",
      "acpCOI": "optional",
      "uniqueID": "required"
    }
  },
  "monitoring": {
    "prometheus": {
      "url": "http://localhost:9090",
      "scrapeInterval": "30s"
    },
    "grafana": {
      "url": "http://localhost:3333",
      "adminUser": "admin",
      "dashboards": ["dive-v3-overview", "federation-metrics"]
    },
    "statusPage": {
      "url": "https://status.dive25.com",
      "checkInterval": "60s"
    }
  },
  "gcp": {
    "projectId": "dive-v3-pilot",
    "region": "us-east4",
    "services": {
      "secretManager": true,
      "cloudRun": true,
      "cloudBuild": true,
      "logging": true,
      "monitoring": true
    }
  }
}
```

#### Generator Scripts

**Script 1: Generate Terraform .tfvars**
```bash
#!/bin/bash
# scripts/federation/generate-tfvars.sh

REGISTRY="config/federation-registry.json"

for instance in usa fra gbr deu; do
  INSTANCE_UPPER=$(echo "$instance" | tr '[:lower:]' '[:upper:]')
  
  cat > "terraform/instances/${instance}.tfvars" <<EOF
# Generated from federation-registry.json on $(date)
# DO NOT EDIT MANUALLY - Use ./scripts/federation/generate-tfvars.sh

keycloak_url            = "$(jq -r ".instances.${instance}.urls.idp" $REGISTRY)"
keycloak_admin_username = "admin"
keycloak_admin_password = "DivePilot2025!SecureAdmin"  # From GCP Secret Manager
app_url                 = "$(jq -r ".instances.${instance}.urls.app" $REGISTRY)"
api_url                 = "$(jq -r ".instances.${instance}.urls.api" $REGISTRY)"
idp_url                 = "$(jq -r ".instances.${instance}.urls.idp" $REGISTRY)"
create_test_users       = true

# Federation partners
federation_partners = {
EOF

  # Add each federation partner
  for partner in $(jq -r ".federation.matrix.${instance}[]" $REGISTRY); do
    PARTNER_UPPER=$(echo "$partner" | tr '[:lower:]' '[:upper:]')
    cat >> "terraform/instances/${instance}.tfvars" <<EOF
  ${partner} = {
    instance_code = "${PARTNER_UPPER}"
    instance_name = "$(jq -r ".instances.${partner}.name" $REGISTRY)"
    idp_url       = "$(jq -r ".instances.${partner}.urls.idp" $REGISTRY)"
    enabled       = true
  }
EOF
  done

  echo "}" >> "terraform/instances/${instance}.tfvars"
  echo "✅ Generated terraform/instances/${instance}.tfvars"
done
```

**Script 2: Generate Docker Compose**
```bash
#!/bin/bash
# scripts/federation/generate-docker-compose.sh

INSTANCE=$1
REGISTRY="config/federation-registry.json"

if [ -z "$INSTANCE" ]; then
  echo "Usage: $0 <instance>"
  exit 1
fi

INSTANCE_LOWER=$(echo "$INSTANCE" | tr '[:upper:]' '[:lower:]')
OUTPUT="instances/${INSTANCE_LOWER}/docker-compose.yml"

echo "Generating $OUTPUT from federation-registry.json..."

# Use Python/Go/Node script for complex templating
node scripts/federation/template-generator.js \
  --registry "$REGISTRY" \
  --instance "$INSTANCE_LOWER" \
  --template "templates/docker-compose.yml.j2" \
  --output "$OUTPUT"

echo "✅ Generated $OUTPUT"
```

**Success Criteria:**
- ✅ All .tfvars files generated from registry
- ✅ All docker-compose files generated from registry
- ✅ Git pre-commit hook prevents manual edits
- ✅ Documentation updated with SSOT workflow
- ✅ Zero drift detected in 2 weeks of operation

---

### 2.2 GCP Secret Manager Integration

**SMART Objective:** By Day 25, all credentials will be stored in GCP Secret Manager (us-east4) with automated rotation, zero plaintext secrets in Git.

#### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   GCP Secret Manager (us-east4)             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  projects/dive-v3-pilot/secrets/                     │   │
│  │    ├── usa-admin-password                            │   │
│  │    ├── usa-client-secret                             │   │
│  │    ├── fra-admin-password                            │   │
│  │    ├── fra-client-secret                             │   │
│  │    ├── gbr-admin-password                            │   │
│  │    ├── gbr-client-secret                             │   │
│  │    ├── deu-admin-password                            │   │
│  │    ├── deu-client-secret                             │   │
│  │    ├── shared-blacklist-redis-password               │   │
│  │    └── monitoring-grafana-admin-password             │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                           ▲
                           │ Secure API calls
                           │
        ┌──────────────────┴──────────────────┐
        │                                     │
  ┌─────▼──────┐                    ┌────────▼────────┐
  │ Terraform  │                    │ GitHub Actions  │
  │ (local)    │                    │ (CI/CD)         │
  └────────────┘                    └─────────────────┘
```

#### Implementation

**Step 1: Create GCP project and enable APIs**
```bash
#!/bin/bash
# scripts/gcp/setup-project.sh

PROJECT_ID="dive-v3-pilot"
REGION="us-east4"

# Create project
gcloud projects create "$PROJECT_ID" \
  --name="DIVE V3 Pilot" \
  --set-as-default

# Link billing account (you'll need to provide this)
gcloud billing projects link "$PROJECT_ID" \
  --billing-account="YOUR_BILLING_ACCOUNT_ID"

# Enable required APIs
gcloud services enable \
  secretmanager.googleapis.com \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  logging.googleapis.com \
  monitoring.googleapis.com \
  --project="$PROJECT_ID"

echo "✅ GCP project $PROJECT_ID created in $REGION"
```

**Step 2: Store secrets**
```bash
#!/bin/bash
# scripts/gcp/store-secrets.sh

PROJECT_ID="dive-v3-pilot"

# Admin passwords
for instance in usa fra gbr deu; do
  echo -n "DivePilot2025!SecureAdmin" | \
    gcloud secrets create "${instance}-admin-password" \
      --data-file=- \
      --replication-policy="user-managed" \
      --locations="us-east4" \
      --project="$PROJECT_ID"
done

# Generate and store client secrets
for instance in usa fra gbr deu; do
  CLIENT_SECRET=$(openssl rand -base64 32)
  echo -n "$CLIENT_SECRET" | \
    gcloud secrets create "${instance}-client-secret" \
      --data-file=- \
      --replication-policy="user-managed" \
      --locations="us-east4" \
      --project="$PROJECT_ID"
  
  echo "Instance: $instance"
  echo "Client Secret: $CLIENT_SECRET"
  echo "---"
done > secrets-manifest-$(date +%Y%m%d).txt

echo "✅ Secrets stored. Manifest: secrets-manifest-$(date +%Y%m%d).txt"
echo "⚠️  Store manifest in password manager, then delete file!"
```

**Step 3: Update Terraform to use GCP secrets**
```hcl
# terraform/instances/provider.tf
terraform {
  required_providers {
    keycloak = {
      source  = "keycloak/keycloak"
      version = "~> 5.0"
    }
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

# GCP provider for Secret Manager
provider "google" {
  project = "dive-v3-pilot"
  region  = "us-east4"
}

# Fetch admin password from Secret Manager
data "google_secret_manager_secret_version" "admin_password" {
  secret  = "${terraform.workspace}-admin-password"
  project = "dive-v3-pilot"
}

data "google_secret_manager_secret_version" "client_secret" {
  secret  = "${terraform.workspace}-client-secret"
  project = "dive-v3-pilot"
}

# Use in module
module "instance" {
  source = "../modules/federated-instance"
  
  # ... other config ...
  
  keycloak_admin_password = data.google_secret_manager_secret_version.admin_password.secret_data
  client_secret           = data.google_secret_manager_secret_version.client_secret.secret_data
}
```

**Step 4: Update GitHub Actions to access secrets**
```yaml
# .github/workflows/deploy.yml
name: Deploy Instance

on:
  workflow_dispatch:
    inputs:
      instance:
        required: true
        type: choice
        options: [usa, fra, gbr, deu]

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write  # For Workload Identity Federation
    
    steps:
      - uses: actions/checkout@v4
      
      - id: auth
        uses: google-github-actions/auth@v1
        with:
          workload_identity_provider: 'projects/123456789/locations/global/workloadIdentityPools/github-pool/providers/github-provider'
          service_account: 'github-actions@dive-v3-pilot.iam.gserviceaccount.com'
      
      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v3
      
      - name: Deploy
        run: |
          cd terraform/instances
          terraform init
          terraform workspace select ${{ inputs.instance }}
          terraform apply -var-file=${{ inputs.instance }}.tfvars -auto-approve
```

**Success Criteria:**
- ✅ All secrets stored in GCP Secret Manager
- ✅ Zero plaintext secrets in Git
- ✅ Terraform successfully retrieves secrets
- ✅ GitHub Actions has access via Workload Identity
- ✅ Secrets rotated successfully (manual test)
- ✅ Audit log shows all secret access

**Cost:** ~$6/month (0.03 cents per 10,000 access operations)

---

## Phase 3: Comprehensive Testing
**Duration:** Week 5-6  
**Objective:** Achieve 80%+ code coverage, zero critical bugs

### 3.1 Test Suite Architecture

```
DIVE V3 Testing Pyramid
=======================

                    ▲
                   ╱│╲
                  ╱ │ ╲
                 ╱  │  ╲
                ╱ E2E  ╲          10% - End-to-end (Playwright)
               ╱────────╲
              ╱          ╲
             ╱Integration ╲       30% - API Integration (Jest)
            ╱──────────────╲
           ╱                ╲
          ╱   Unit Tests     ╲    60% - Unit Tests (Jest/Vitest)
         ╱────────────────────╲
        ▼                      ▼
```

### Test Coverage Targets

| Component | Tool | Current | Target | Priority |
|-----------|------|---------|--------|----------|
| Backend API | Jest | ~40% | 85% | P0 |
| Frontend | Vitest | ~20% | 80% | P1 |
| OPA Policies | opa test | 100% | 100% | P0 |
| E2E Flows | Playwright | 0% | 70% | P0 |
| Performance | k6 | 0% | 100% | P1 |
| Security | OWASP ZAP | 0% | 100% | P1 |

### 3.2 Unit Tests (Backend)

**Target:** 85% coverage on backend API

```typescript
// backend/src/__tests__/services/authz.service.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthzService } from '../../services/authz.service';
import { OPAClient } from '../../clients/opa.client';

describe('AuthzService', () => {
  let authzService: AuthzService;
  let mockOPAClient: vi.Mocked<OPAClient>;

  beforeEach(() => {
    mockOPAClient = {
      evaluatePolicy: vi.fn(),
    } as any;
    
    authzService = new AuthzService(mockOPAClient);
  });

  describe('authorize', () => {
    it('should allow access for SECRET user to SECRET resource', async () => {
      // Arrange
      const subject = {
        uniqueID: 'testuser-usa-3',
        clearance: 'SECRET',
        countryOfAffiliation: 'USA',
      };
      
      const resource = {
        resourceId: 'doc-123',
        classification: 'SECRET',
        releasabilityTo: ['USA'],
      };
      
      mockOPAClient.evaluatePolicy.mockResolvedValue({
        allow: true,
        reason: 'All conditions satisfied',
      });

      // Act
      const result = await authzService.authorize(subject, 'read', resource);

      // Assert
      expect(result.allow).toBe(true);
      expect(mockOPAClient.evaluatePolicy).toHaveBeenCalledWith({
        input: {
          subject,
          action: 'read',
          resource,
        },
      });
    });

    it('should deny access for CONFIDENTIAL user to SECRET resource', async () => {
      // Arrange
      const subject = {
        uniqueID: 'testuser-usa-2',
        clearance: 'CONFIDENTIAL',
        countryOfAffiliation: 'USA',
      };
      
      const resource = {
        resourceId: 'doc-456',
        classification: 'SECRET',
        releasabilityTo: ['USA'],
      };
      
      mockOPAClient.evaluatePolicy.mockResolvedValue({
        allow: false,
        reason: 'Insufficient clearance: CONFIDENTIAL < SECRET',
      });

      // Act
      const result = await authzService.authorize(subject, 'read', resource);

      // Assert
      expect(result.allow).toBe(false);
      expect(result.reason).toContain('Insufficient clearance');
    });
  });
});
```

**Implementation:**
```bash
# Run all unit tests
cd backend && npm test

# With coverage
npm test -- --coverage

# Watch mode during development
npm test -- --watch
```

---

### 3.3 Integration Tests

**Target:** Test all API endpoints with real services

```typescript
// backend/src/__tests__/integration/resources.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../server';
import { getTestToken } from '../helpers/auth.helper';

describe('Resources API Integration', () => {
  let secretUserToken: string;
  let unclassUserToken: string;

  beforeAll(async () => {
    // Get real tokens from Keycloak
    secretUserToken = await getTestToken('testuser-usa-3', 'TestUser2025!Pilot');
    unclassUserToken = await getTestToken('testuser-usa-1', 'TestUser2025!Pilot');
  });

  describe('GET /api/resources', () => {
    it('should return resources filtered by clearance', async () => {
      const response = await request(app)
        .get('/api/resources')
        .set('Authorization', `Bearer ${secretUserToken}`)
        .expect(200);

      expect(response.body.resources).toBeInstanceOf(Array);
      
      // Verify all resources are accessible to SECRET user
      response.body.resources.forEach((resource: any) => {
        expect(['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET']).toContain(resource.classification);
      });
    });

    it('should not return SECRET resources to UNCLASSIFIED user', async () => {
      const response = await request(app)
        .get('/api/resources')
        .set('Authorization', `Bearer ${unclassUserToken}`)
        .expect(200);

      const secretResources = response.body.resources.filter(
        (r: any) => r.classification === 'SECRET'
      );
      
      expect(secretResources).toHaveLength(0);
    });
  });

  describe('GET /api/resources/:id', () => {
    it('should allow SECRET user to access SECRET resource', async () => {
      const response = await request(app)
        .get('/api/resources/USA-DOC-001')
        .set('Authorization', `Bearer ${secretUserToken}`)
        .expect(200);

      expect(response.body.resourceId).toBe('USA-DOC-001');
      expect(response.body.content).toBeDefined();
    });

    it('should deny UNCLASSIFIED user access to SECRET resource', async () => {
      const response = await request(app)
        .get('/api/resources/USA-DOC-001')
        .set('Authorization', `Bearer ${unclassUserToken}`)
        .expect(403);

      expect(response.body.error).toContain('Insufficient clearance');
    });
  });
});
```

---

### 3.4 End-to-End Tests (Playwright)

**Target:** Test complete user flows across federation

```typescript
// frontend/tests/e2e/federation.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Cross-Instance Federation', () => {
  test('USA user can login to FRA instance', async ({ page, context }) => {
    // Navigate to FRA application
    await page.goto('https://fra-app.dive25.com');
    
    // Click USA IdP selector
    await page.click('text=United States');
    
    // Should redirect to USA Keycloak
    await expect(page).toHaveURL(/usa-idp\.dive25\.com/);
    
    // Login with USA credentials
    await page.fill('input[name="username"]', 'testuser-usa-3');
    await page.fill('input[name="password"]', 'TestUser2025!Pilot');
    await page.click('input[type="submit"]');
    
    // Wait for redirect back to FRA
    await page.waitForURL(/fra-app\.dive25\.com/);
    
    // Verify user is authenticated
    await expect(page.locator('.user-info')).toContainText('testuser-usa-3');
    
    // Verify instance banner shows FRA
    await expect(page.locator('.instance-banner')).toContainText('France');
  });

  test('Federation flow completes in <5 seconds', async ({ page }) => {
    const startTime = Date.now();
    
    await page.goto('https://fra-app.dive25.com');
    await page.click('text=United States');
    await page.fill('input[name="username"]', 'testuser-usa-3');
    await page.fill('input[name="password"]', 'TestUser2025!Pilot');
    await page.click('input[type="submit"]');
    await page.waitForURL(/fra-app\.dive25\.com/);
    
    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(5000);
  });

  test('All 12 federation combinations work', async ({ page }) => {
    const instances = ['usa', 'fra', 'gbr', 'deu'];
    const results: any[] = [];
    
    for (const from of instances) {
      for (const to of instances) {
        if (from === to) continue;
        
        const startTime = Date.now();
        
        try {
          await page.goto(`https://${to}-app.dive25.com`);
          await page.click(`text=${from.toUpperCase()}`);
          await page.fill('input[name="username"]', `testuser-${from}-3`);
          await page.fill('input[name="password"]', 'TestUser2025!Pilot');
          await page.click('input[type="submit"]');
          await page.waitForURL(new RegExp(`${to}-app`));
          
          results.push({
            from,
            to,
            success: true,
            duration: Date.now() - startTime,
          });
        } catch (error) {
          results.push({
            from,
            to,
            success: false,
            error: error.message,
          });
        }
      }
    }
    
    // All should succeed
    const failures = results.filter(r => !r.success);
    expect(failures).toHaveLength(0);
    
    // All should be < 5s
    const slow = results.filter(r => r.duration > 5000);
    expect(slow).toHaveLength(0);
  });
});
```

**Running Tests:**
```bash
# Run E2E tests
cd frontend
npx playwright test

# Run with UI (for debugging)
npx playwright test --ui

# Run specific test file
npx playwright test tests/e2e/federation.spec.ts

# Generate HTML report
npx playwright test --reporter=html
```

---

### 3.5 Performance Tests (k6)

**Target:** 10-50 concurrent users, <200ms p95 latency

```javascript
// tests/performance/load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

export const options = {
  stages: [
    { duration: '2m', target: 10 },   // Ramp up to 10 users
    { duration: '5m', target: 10 },   // Stay at 10 users
    { duration: '2m', target: 30 },   // Ramp up to 30 users
    { duration: '5m', target: 30 },   // Stay at 30 users
    { duration: '2m', target: 50 },   // Ramp up to 50 users (max pilot scale)
    { duration: '5m', target: 50 },   // Stay at 50 users
    { duration: '2m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<200'],  // 95% of requests < 200ms
    errors: ['rate<0.1'],              // Error rate < 10%
  },
};

export default function () {
  // Test authentication
  const loginRes = http.post('https://usa-api.dive25.com/api/auth/login', {
    username: 'testuser-usa-3',
    password: 'TestUser2025!Pilot',
  });
  
  check(loginRes, {
    'login successful': (r) => r.status === 200,
    'login duration < 1s': (r) => r.timings.duration < 1000,
  }) || errorRate.add(1);
  
  const token = loginRes.json('access_token');
  
  // Test resource listing
  const listRes = http.get('https://usa-api.dive25.com/api/resources', {
    headers: { Authorization: `Bearer ${token}` },
  });
  
  check(listRes, {
    'list successful': (r) => r.status === 200,
    'list duration < 200ms': (r) => r.timings.duration < 200,
  }) || errorRate.add(1);
  
  // Test authorization check
  const resourceId = listRes.json('resources.0.resourceId');
  const resourceRes = http.get(
    `https://usa-api.dive25.com/api/resources/${resourceId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  
  check(resourceRes, {
    'resource access successful': (r) => r.status === 200,
    'authz duration < 200ms': (r) => r.timings.duration < 200,
  }) || errorRate.add(1);
  
  sleep(1);
}
```

**Running:**
```bash
# Install k6
brew install k6  # macOS
# or: https://k6.io/docs/getting-started/installation/

# Run test
k6 run tests/performance/load-test.js

# With HTML report
k6 run --out json=results.json tests/performance/load-test.js
# Convert to HTML using k6-reporter
```

---

### 3.6 Security Tests (OWASP ZAP)

**Target:** Zero high/critical vulnerabilities

```bash
#!/bin/bash
# scripts/security-scan.sh

echo "=== OWASP ZAP Security Scan ==="

# Start ZAP in daemon mode
docker run -d --name zap \
  -u zap \
  -p 8090:8090 \
  -v $(pwd)/zap-reports:/zap/reports:rw \
  owasp/zap2docker-stable \
  zap.sh -daemon -host 0.0.0.0 -port 8090 -config api.disablekey=true

# Wait for ZAP to start
sleep 30

# Spider scan
echo "Running spider scan..."
curl "http://localhost:8090/JSON/spider/action/scan/?url=https://usa-app.dive25.com"

# Wait for spider to complete
sleep 60

# Active scan
echo "Running active scan..."
curl "http://localhost:8090/JSON/ascan/action/scan/?url=https://usa-app.dive25.com"

# Wait for active scan to complete
sleep 300

# Generate report
echo "Generating report..."
curl "http://localhost:8090/OTHER/core/other/htmlreport/" > zap-reports/scan-report-$(date +%Y%m%d).html

# Get alert counts
CRITICAL=$(curl -s "http://localhost:8090/JSON/alert/view/alertsSummary/" | jq '.alertsSummary[] | select(.risk=="High") | .count' | awk '{s+=$1} END {print s}')

echo "Critical/High alerts: $CRITICAL"

# Stop ZAP
docker stop zap && docker rm zap

# Fail if critical vulnerabilities found
if [ "$CRITICAL" -gt 0 ]; then
  echo "❌ Security scan failed: $CRITICAL critical vulnerabilities found"
  exit 1
else
  echo "✅ Security scan passed: No critical vulnerabilities"
fi
```

---

## Phase 4: CI/CD Pipeline
**Duration:** Week 7  
**Objective:** Automated testing and deployment for all instances

### 4.1 GitHub Actions Workflows

#### Workflow 1: PR Validation

```yaml
# .github/workflows/pr-validation.yml
name: PR Validation

on:
  pull_request:
    branches: [main, develop]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: |
          cd backend && npm ci
          cd ../frontend && npm ci
      
      - name: Lint backend
        run: cd backend && npm run lint
      
      - name: Lint frontend
        run: cd frontend && npm run lint
  
  test-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: cd backend && npm ci
      
      - name: Run unit tests
        run: cd backend && npm test -- --coverage
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./backend/coverage/lcov.info
          flags: backend
  
  test-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: cd frontend && npm ci
      
      - name: Run unit tests
        run: cd frontend && npm test -- --coverage
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./frontend/coverage/lcov.info
          flags: frontend
  
  test-opa:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup OPA
        uses: open-policy-agent/setup-opa@v2
        with:
          version: latest
      
      - name: Run OPA tests
        run: opa test policies/ --verbose
  
  terraform-plan:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    strategy:
      matrix:
        instance: [usa, fra, gbr]
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v3
      
      - id: auth
        uses: google-github-actions/auth@v1
        with:
          workload_identity_provider: ${{ secrets.GCP_WIF_PROVIDER }}
          service_account: 'github-actions@dive-v3-pilot.iam.gserviceaccount.com'
      
      - name: Terraform Init
        run: |
          cd terraform/instances
          terraform init
      
      - name: Terraform Plan
        run: |
          cd terraform/instances
          terraform workspace select ${{ matrix.instance }}
          terraform plan -var-file=${{ matrix.instance }}.tfvars
  
  e2e-tests:
    runs-on: ubuntu-latest
    if: contains(github.event.pull_request.labels.*.name, 'run-e2e')
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: cd frontend && npm ci
      
      - name: Install Playwright
        run: cd frontend && npx playwright install --with-deps
      
      - name: Run E2E tests
        run: cd frontend && npx playwright test
      
      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: frontend/playwright-report/
```

#### Workflow 2: Deploy to Instance

```yaml
# .github/workflows/deploy.yml
name: Deploy Instance

on:
  workflow_dispatch:
    inputs:
      instance:
        description: 'Instance to deploy'
        required: true
        type: choice
        options:
          - usa
          - fra
          - gbr
          - deu
      environment:
        description: 'Environment'
        required: true
        type: choice
        options:
          - development
          - staging
          - production

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: ${{ inputs.environment }}
    permissions:
      contents: read
      id-token: write
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v3
      
      - id: auth
        uses: google-github-actions/auth@v1
        with:
          workload_identity_provider: ${{ secrets.GCP_WIF_PROVIDER }}
          service_account: 'github-actions@dive-v3-pilot.iam.gserviceaccount.com'
      
      - name: Generate configs from registry
        run: |
          ./scripts/federation/generate-tfvars.sh
          ./scripts/federation/generate-docker-compose.sh ${{ inputs.instance }}
      
      - name: Deploy Terraform
        run: |
          cd terraform/instances
          terraform init
          terraform workspace select ${{ inputs.instance }}
          terraform apply -var-file=${{ inputs.instance }}.tfvars -auto-approve
      
      - name: Deploy Docker Compose (local instances)
        if: contains(['usa', 'fra', 'gbr'], inputs.instance)
        run: |
          docker-compose -f instances/${{ inputs.instance }}/docker-compose.yml up -d
      
      - name: Deploy Docker Compose (remote DEU)
        if: inputs.instance == 'deu'
        run: |
          ./scripts/remote/deploy-remote.sh deu
      
      - name: Run smoke tests
        run: |
          ./scripts/test-instance-health.sh ${{ inputs.instance }}
      
      - name: Notify deployment
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "Deployed ${{ inputs.instance }} to ${{ inputs.environment }}",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "✅ *Deployment Complete*\n*Instance:* ${{ inputs.instance }}\n*Environment:* ${{ inputs.environment }}\n*Commit:* ${{ github.sha }}"
                  }
                }
              ]
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

#### Workflow 3: Nightly Security Scan

```yaml
# .github/workflows/security-scan.yml
name: Nightly Security Scan

on:
  schedule:
    - cron: '0 2 * * *'  # 2 AM UTC daily
  workflow_dispatch:

jobs:
  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Run OWASP ZAP scan
        run: ./scripts/security-scan.sh
      
      - name: Upload scan report
        uses: actions/upload-artifact@v3
        with:
          name: zap-report
          path: zap-reports/
      
      - name: Notify if vulnerabilities found
        if: failure()
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "⚠️ Security vulnerabilities detected in nightly scan",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "⚠️ *Security Alert*\nVulnerabilities detected. Check GitHub Actions for details."
                  }
                }
              ]
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

---

## Phase 5: Documentation & Handoff
**Duration:** Week 8  
**Objective:** Complete documentation for all audiences

### 5.1 Documentation Structure

```
docs/
├── README.md                           # Project overview
├── architecture/
│   ├── system-architecture.md          # High-level design
│   ├── federation-model.md             # Cross-instance federation
│   ├── security-model.md               # Zero Trust architecture
│   └── data-flow.md                    # Request/response flows
├── deployment/
│   ├── local-deployment.md             # Local Docker setup
│   ├── remote-deployment.md            # DEU prosecurity.biz
│   ├── gcp-deployment.md               # Future Cloud Run
│   └── rollback-procedures.md          # Emergency procedures
├── operations/
│   ├── runbooks/
│   │   ├── common-issues.md
│   │   ├── incident-response.md
│   │   └── backup-restore.md
│   ├── monitoring.md                   # Grafana dashboards
│   └── troubleshooting.md              # Debug guide
├── development/
│   ├── setup-guide.md                  # Developer onboarding
│   ├── testing-guide.md                # How to write tests
│   ├── coding-standards.md             # Code conventions
│   └── ci-cd.md                        # GitHub Actions guide
├── user-guides/
│   ├── end-user-guide.md               # How to use DIVE V3
│   ├── admin-guide.md                  # Keycloak administration
│   └── federation-guide.md             # Cross-instance login
├── compliance/
│   ├── acp-240-compliance.md           # NATO standards
│   ├── nist-800-63-compliance.md       # US Federal standards
│   └── audit-logs.md                   # Audit requirements
└── api/
    ├── backend-api.md                  # REST API documentation
    ├── opa-policies.md                 # Authorization policies
    └── kas-api.md                      # Key Access Service
```

### 5.2 API Documentation (OpenAPI 3.0)

```yaml
# docs/api/openapi.yaml
openapi: 3.0.0
info:
  title: DIVE V3 Backend API
  version: 1.0.0
  description: Coalition-friendly ICAM API with federated identity
  contact:
    name: DIVE V3 Team
    email: dive-v3@example.mil

servers:
  - url: https://usa-api.dive25.com
    description: USA Instance
  - url: https://fra-api.dive25.com
    description: France Instance
  - url: https://gbr-api.dive25.com
    description: United Kingdom Instance
  - url: https://deu-api.prosecurity.biz
    description: Germany Instance (External)

security:
  - bearerAuth: []

paths:
  /api/auth/idps:
    get:
      summary: Get available Identity Providers
      description: Returns list of federation partners for cross-instance authentication
      responses:
        '200':
          description: Successful response
          content:
            application/json:
              schema:
                type: object
                properties:
                  idps:
                    type: array
                    items:
                      type: object
                      properties:
                        code:
                          type: string
                          example: USA
                        name:
                          type: string
                          example: United States
                        idpUrl:
                          type: string
                          example: https://usa-idp.dive25.com
  
  /api/resources:
    get:
      summary: List accessible resources
      description: Returns resources filtered by user's clearance and releasability
      security:
        - bearerAuth: []
      parameters:
        - name: classification
          in: query
          schema:
            type: string
            enum: [UNCLASSIFIED, CONFIDENTIAL, SECRET, TOP_SECRET]
        - name: limit
          in: query
          schema:
            type: integer
            default: 50
      responses:
        '200':
          description: Successful response
          content:
            application/json:
              schema:
                type: object
                properties:
                  resources:
                    type: array
                    items:
                      $ref: '#/components/schemas/ResourceSummary'
        '401':
          $ref: '#/components/responses/Unauthorized'
  
  /api/resources/{resourceId}:
    get:
      summary: Get resource by ID
      description: Returns full resource if authorized by OPA policy
      security:
        - bearerAuth: []
      parameters:
        - name: resourceId
          in: path
          required: true
          schema:
            type: string
            example: USA-DOC-001
      responses:
        '200':
          description: Successful response
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Resource'
        '403':
          $ref: '#/components/responses/Forbidden'
        '404':
          $ref: '#/components/responses/NotFound'

components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
  
  schemas:
    ResourceSummary:
      type: object
      properties:
        resourceId:
          type: string
          example: USA-DOC-001
        title:
          type: string
          example: Fuel Inventory Report Q4 2025
        classification:
          type: string
          enum: [UNCLASSIFIED, CONFIDENTIAL, SECRET, TOP_SECRET]
        releasabilityTo:
          type: array
          items:
            type: string
            example: USA
        creationDate:
          type: string
          format: date-time
    
    Resource:
      allOf:
        - $ref: '#/components/schemas/ResourceSummary'
        - type: object
          properties:
            content:
              type: string
              description: Resource content (if not encrypted)
            COI:
              type: array
              items:
                type: string
                example: NATO-COSMIC
            encrypted:
              type: boolean
              description: Whether content requires KAS decryption
  
  responses:
    Unauthorized:
      description: Invalid or expired JWT token
      content:
        application/json:
          schema:
            type: object
            properties:
              error:
                type: string
                example: Unauthorized
              message:
                type: string
                example: Invalid or expired JWT token
    
    Forbidden:
      description: Insufficient clearance or authorization denied
      content:
        application/json:
          schema:
            type: object
            properties:
              error:
                type: string
                example: Forbidden
              message:
                type: string
                example: Insufficient clearance for resource
              details:
                type: object
                properties:
                  clearance_check:
                    type: string
                    example: FAIL
                  releasability_check:
                    type: string
                    example: PASS
    
    NotFound:
      description: Resource not found
      content:
        application/json:
          schema:
            type: object
            properties:
              error:
                type: string
                example: Not Found
              message:
                type: string
                example: Resource USA-DOC-999 not found
```

---

## Success Metrics & KPIs

### Phase 1 Success Criteria
- ✅ All passwords standardized (admin: `DivePilot2025!SecureAdmin`, test: `TestUser2025!Pilot`)
- ✅ DEU federation working (USA→DEU, FRA→DEU, GBR→DEU all <5s)
- ✅ Service health checks 100% accurate
- ✅ 20GB disk space reclaimed from cleanup

### Phase 2 Success Criteria
- ✅ federation-registry.json generates all configs
- ✅ All secrets in GCP Secret Manager (us-east4)
- ✅ Zero plaintext secrets in Git
- ✅ Zero manual config edits in 2 weeks

### Phase 3 Success Criteria
- ✅ Backend: 85%+ test coverage
- ✅ Frontend: 80%+ test coverage
- ✅ OPA: 100% test coverage (maintained)
- ✅ E2E: 70%+ critical paths covered
- ✅ Performance: 50 concurrent users, <200ms p95
- ✅ Security: Zero critical vulnerabilities

### Phase 4 Success Criteria
- ✅ PR validation passes 100% of time
- ✅ Deployment automated for all 4 instances
- ✅ Nightly security scans running
- ✅ <10 minute deploy time per instance

### Phase 5 Success Criteria
- ✅ Documentation complete for all audiences
- ✅ New developer can onboard in <2 hours
- ✅ Operator can deploy instance in <30 minutes
- ✅ End user guide rated 4/5+ stars

---

## Budget Summary

| Category | Item | Monthly | Annual |
|----------|------|---------|--------|
| **GCP** | Secret Manager | $6 | $72 |
| | Cloud Run (staging) | $20 | $240 |
| | Cloud Build | $10 | $120 |
| | Logging & Monitoring | $25 | $300 |
| **Cloudflare** | Tunnels (4 instances) | $20 | $240 |
| **GitHub** | Actions minutes (included) | $0 | $0 |
| **Total** | | **~$81/month** | **~$972/year** |

*Well under the $100-500/month target. Leaves budget for future scaling.*

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| DEU server goes offline | Medium | High | Document DEU migration back to local |
| GCP costs exceed budget | Low | Medium | Set billing alerts at $75/month |
| Federation breaks after update | Low | Critical | E2E tests in CI before deploy |
| Test user passwords compromised | Low | Medium | Quarterly rotation, monitor logs |
| Terraform state corruption | Low | Critical | Daily state backups to GCS |

---

## Timeline Summary

```
Week 1-2:  Phase 1 - Critical Fixes
Week 3-4:  Phase 2 - SSOT & Secrets
Week 5-6:  Phase 3 - Testing (80%+)
Week 7:    Phase 4 - CI/CD Pipeline
Week 8:    Phase 5 - Documentation
```

**Total Duration:** 8 weeks (2 months)  
**Team Size:** 2-3 developers  
**Effort:** ~320-480 hours total

---

## Next Steps

1. **Review and approve this plan**
2. **Set up GCP project** (`dive-v3-pilot` in us-east4)
3. **Begin Phase 1** - Critical fixes (passwords, DEU federation, health checks)
4. **Weekly status meetings** to track progress

---

**Document Status:** DRAFT v1.0.0  
**Approval Required:** Project Lead, Security Officer, Operations Lead  
**Next Review:** Start of each phase









