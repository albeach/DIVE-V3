# DIVE V3 Target Architecture

**Version**: 1.2
**Date**: December 18, 2025
**Updated**: December 19, 2025 (Phase 3 Complete)
**Status**: ✅ Phase 1-3 Implemented | Phase 4+ Pending

---

## Executive Summary

This document defines the target architecture for automated, repeatable deployments of DIVE V3 across Local and GCP Compute Engine environments. The design prioritizes:

- **One-command deployment** - ✅ Single command for full stack provisioning
- **Idempotency** - ✅ Safe to re-run without side effects
- **Rollback capability** - ✅ Recovery from any failure state
- **CI/CD integration** - ✅ Automated quality gates via `dive-pr-checks.yml`

### Implementation Status

| Capability | Status | Evidence |
|------------|--------|----------|
| Idempotent nuke | ✅ Implemented | `./dive nuke --confirm` runs 3x without errors |
| Deploy checkpoint | ✅ Implemented | `./dive checkpoint create/list/rollback` |
| Health JSON output | ✅ Implemented | `./dive health --json` |
| Dynamic IdP creation | ✅ Implemented | `./dive federation link <CODE>` |
| User profile automation | ✅ Implemented | `scripts/spoke-init/apply-user-profile.sh` |
| CI deploy gate | ✅ Implemented | `.github/workflows/dive-pr-checks.yml` |
| GCP pilot rollback | ✅ Implemented | `./dive --env gcp pilot rollback` |
| Terraform GCS backend | ✅ Implemented | `terraform/*/backend.tf` uses `dive25-tfstate` |
| Compute VM module | ✅ Implemented | `terraform/modules/compute-vm/` |
| GCP pilot deploy | ✅ Implemented | `./dive --env gcp pilot deploy --provision` |
| VM health with JSON | ✅ Implemented | `./dive --env gcp pilot health --json` |

---

## Reference Documentation

| Document | Path | Description |
|----------|------|-------------|
| **AUDIT** | `docs/AUDIT.md` | Security audit and compliance requirements |
| **GAP_ANALYSIS** | `docs/GAP_ANALYSIS.md` | Gap analysis with outstanding items |
| **TARGET_ARCHITECTURE** | `docs/TARGET_ARCHITECTURE.md` | Target system architecture (this document) |
| **IMPLEMENTATION_PLAN** | `docs/IMPLEMENTATION_PLAN.md` | Phased implementation plan |
| **BACKLOG** | `docs/BACKLOG.md` | Detailed backlog items (DIVE-0xx tasks) |
| **CI_CD_PLAN** | `docs/CI_CD_PLAN.md` | CI/CD pipeline configuration |

---

## 1. System Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DIVE V3 Federation                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│    ┌─────────────────────────────────────────────────────────────────┐     │
│    │                         HUB (USA)                                │     │
│    │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │     │
│    │  │Keycloak │ │ Backend │ │Frontend │ │   OPA   │ │  OPAL   │   │     │
│    │  │  :8443  │ │  :4000  │ │  :3000  │ │  :8181  │ │  :7002  │   │     │
│    │  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘   │     │
│    │       │           │           │           │           │         │     │
│    │  ┌────┴───────────┴───────────┴───────────┴───────────┴────┐   │     │
│    │  │              dive-v3-network (internal)                  │   │     │
│    │  └────┬───────────┬───────────┬───────────┬────────────────┘   │     │
│    │       │           │           │           │                     │     │
│    │  ┌────┴────┐ ┌────┴────┐ ┌────┴────┐ ┌────┴────┐              │     │
│    │  │Postgres │ │ MongoDB │ │  Redis  │ │   KAS   │              │     │
│    │  │  :5432  │ │  :27017 │ │  :6379  │ │  :8080  │              │     │
│    │  └─────────┘ └─────────┘ └─────────┘ └─────────┘              │     │
│    └───────────────────────────────┬─────────────────────────────────┘     │
│                                    │                                        │
│                    dive-v3-shared-network (federation)                      │
│                                    │                                        │
│    ┌───────────────────────────────┼─────────────────────────────────┐     │
│    │                               │                                  │     │
│    ▼                               ▼                                  ▼     │
│ ┌──────────┐                 ┌──────────┐                      ┌──────────┐│
│ │SPOKE GBR │                 │SPOKE FRA │        ...           │SPOKE DEU ││
│ │  :3003   │                 │  :3025   │                      │  :3004   ││
│ └──────────┘                 └──────────┘                      └──────────┘│
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Deployment Targets

| Environment | Infrastructure | Automation Level | Use Case |
|-------------|---------------|------------------|----------|
| Local | Docker Desktop | Full | Development, testing |
| Dev (GCP) | Compute Engine VM | Full | Integration testing |
| Staging | Compute Engine VM | Full | Pre-production |
| Production | Compute Engine VM | Gated | Live system |

---

## 2. Local Deployment Architecture

### Target Commands

```bash
# Clean-slate deployment (full reset)
./dive nuke --confirm && ./dive deploy

# Idempotent deployment (safe to re-run)
./dive deploy

# Quick restart (preserve data)
./dive restart

# Rollback to last checkpoint
./dive rollback
```

### Deployment Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ./dive deploy                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐                 │
│  │   VALIDATE   │────▶│    BACKUP    │────▶│   SECRETS    │                 │
│  │ Prerequisites│     │  Checkpoint  │     │   Load GCP   │                 │
│  └──────────────┘     └──────────────┘     └──────────────┘                 │
│         │                    │                    │                          │
│         ▼                    ▼                    ▼                          │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐                 │
│  │    CERTS     │────▶│   COMPOSE    │────▶│    WAIT      │                 │
│  │   Generate   │     │   docker up  │     │  Health OK   │                 │
│  └──────────────┘     └──────────────┘     └──────────────┘                 │
│         │                    │                    │                          │
│         ▼                    ▼                    ▼                          │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐                 │
│  │  TERRAFORM   │────▶│    SEED      │────▶│   VERIFY     │                 │
│  │  Apply IaC   │     │  Test Data   │     │  All Healthy │                 │
│  └──────────────┘     └──────────────┘     └──────────────┘                 │
│                                                   │                          │
│                              ┌────────────────────┘                          │
│                              ▼                                               │
│                       ┌──────────────┐                                       │
│                       │   SUCCESS    │                                       │
│                       │  Endpoints:  │                                       │
│                       │  :3000 :4000 │                                       │
│                       │  :8443       │                                       │
│                       └──────────────┘                                       │
│                                                                              │
│  On Failure:  ────────────────────────────────────────────────────────────▶ │
│                       ┌──────────────┐                                       │
│                       │   ROLLBACK   │                                       │
│                       │  Checkpoint  │                                       │
│                       └──────────────┘                                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Checkpoint System

```
.dive-checkpoint/
├── timestamp                    # ISO 8601 checkpoint time
├── compose-state.json           # docker compose ps --format json
├── volumes/
│   ├── postgres_data.tar.gz     # PostgreSQL backup
│   ├── mongo_data.tar.gz        # MongoDB backup
│   └── redis_data.tar.gz        # Redis backup
├── secrets.env                  # Exported secrets (encrypted)
└── terraform.tfstate            # Terraform state snapshot
```

### Nuke Command (Full Reset)

```bash
./dive nuke --confirm
```

**Actions**:
1. Prompt for confirmation (unless `--force`)
2. Stop all containers
3. Remove all containers
4. Remove named volumes
5. Prune dangling volumes
6. Remove custom networks
7. Optionally remove images (`--images`)
8. Clear checkpoint directory

```bash
# Implementation in deploy.sh
cmd_nuke() {
    if [ "$FORCE" != true ]; then
        echo "This will destroy ALL DIVE data including:"
        echo "  - Containers: $(docker ps -aq --filter 'name=dive' | wc -l)"
        echo "  - Volumes: $(docker volume ls -q --filter 'name=dive' | wc -l)"
        echo "  - Networks: $(docker network ls -q --filter 'name=dive' | wc -l)"
        read -p "Type 'yes' to confirm: " confirm
        [ "$confirm" != "yes" ] && exit 1
    fi

    docker compose -f docker-compose.yml down -v --remove-orphans
    docker compose -f docker-compose.hub.yml down -v --remove-orphans
    docker system prune -af --volumes --filter 'label=com.dive.managed=true'
    docker network rm dive-v3-shared-network shared-network 2>/dev/null || true
    rm -rf .dive-checkpoint/

    log_success "Clean slate achieved"
}
```

---

## 3. GCP Compute Engine Architecture

### Infrastructure Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          GCP Project: dive25                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     Compute Engine                                    │   │
│  │  ┌─────────────────────────────────────────────────────────────┐    │   │
│  │  │                   dive-v3-pilot                              │    │   │
│  │  │                   (e2-standard-4)                            │    │   │
│  │  │                                                               │    │   │
│  │  │   ┌─────────────────────────────────────────────────────┐    │    │   │
│  │  │   │                Docker Host                           │    │    │   │
│  │  │   │                                                       │    │    │   │
│  │  │   │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐    │    │    │   │
│  │  │   │  │Keycloak │ │ Backend │ │Frontend │ │   OPA   │    │    │    │   │
│  │  │   │  └─────────┘ └─────────┘ └─────────┘ └─────────┘    │    │    │   │
│  │  │   │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐    │    │    │   │
│  │  │   │  │Postgres │ │ MongoDB │ │  Redis  │ │   KAS   │    │    │    │   │
│  │  │   │  └─────────┘ └─────────┘ └─────────┘ └─────────┘    │    │    │   │
│  │  │   │                                                       │    │    │   │
│  │  │   └─────────────────────────────────────────────────────┘    │    │   │
│  │  │                                                               │    │   │
│  │  │   OS: Ubuntu 22.04 LTS                                       │    │   │
│  │  │   Zone: us-east4-c                                            │    │   │
│  │  │   Disk: 100GB SSD                                             │    │   │
│  │  └───────────────────────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │ Secret Manager  │  │  Cloud Storage  │  │ Artifact Reg    │             │
│  │                 │  │                 │  │                 │             │
│  │ dive-v3-*       │  │ dive25-tfstate  │  │ dive-v3-images  │             │
│  │ (40+ secrets)   │  │ (terraform)     │  │ (Docker images) │             │
│  │                 │  │                 │  │                 │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     Cloud DNS / Cloudflare                           │   │
│  │                                                                       │   │
│  │   usa-app.dive25.com  ──▶  VM:3000                                   │   │
│  │   usa-api.dive25.com  ──▶  VM:4000                                   │   │
│  │   usa-idp.dive25.com  ──▶  VM:8443                                   │   │
│  │                                                                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Target Commands

```bash
# Full deployment to GCP
./dive --env gcp pilot deploy

# Idempotent re-deploy
./dive --env gcp pilot deploy

# Check status
./dive --env gcp pilot status

# View logs
./dive --env gcp pilot logs backend -f

# SSH access
./dive --env gcp pilot ssh

# Rollback to checkpoint
./dive --env gcp pilot rollback

# Destroy (with confirmation)
./dive --env gcp pilot destroy --confirm
```

### GCP Deployment Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ./dive --env gcp pilot deploy                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                          Phase 1: Provision                             │ │
│  │                                                                          │ │
│  │   ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐      │ │
│  │   │  gcloud  │────▶│ Terraform│────▶│   Wait   │────▶│   SSH    │      │ │
│  │   │   auth   │     │  apply   │     │  VM boot │     │  ready   │      │ │
│  │   └──────────┘     └──────────┘     └──────────┘     └──────────┘      │ │
│  │                                                                          │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                         │                                    │
│                                         ▼                                    │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                          Phase 2: Configure                             │ │
│  │                                                                          │ │
│  │   ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐      │ │
│  │   │   Sync   │────▶│  Secrets │────▶│  Docker  │────▶│ Compose  │      │ │
│  │   │   code   │     │   load   │     │  install │     │    up    │      │ │
│  │   └──────────┘     └──────────┘     └──────────┘     └──────────┘      │ │
│  │                                                                          │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                         │                                    │
│                                         ▼                                    │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                          Phase 3: Verify                                │ │
│  │                                                                          │ │
│  │   ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐      │ │
│  │   │  Health  │────▶│ Keycloak │────▶│   Seed   │────▶│  Report  │      │ │
│  │   │  checks  │     │  config  │     │   data   │     │  status  │      │ │
│  │   └──────────┘     └──────────┘     └──────────┘     └──────────┘      │ │
│  │                                                                          │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Terraform Structure

```
terraform/
├── modules/
│   ├── compute-vm/              # VM provisioning module
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   └── startup-script.sh    # Docker installation
│   ├── federated-instance/      # Keycloak realm/client
│   └── realm-mfa/               # MFA flows
├── pilot/                       # Hub deployment
│   ├── main.tf
│   ├── variables.tf
│   ├── pilot.tfvars
│   └── backend.tf               # GCS remote state
├── spoke/                       # Spoke deployments
│   ├── main.tf
│   └── backend.tf
└── countries/                   # Generated tfvars
    ├── gbr.tfvars
    ├── fra.tfvars
    └── ...
```

### Remote State Configuration

```hcl
# terraform/pilot/backend.tf
terraform {
  backend "gcs" {
    bucket  = "dive25-tfstate"
    prefix  = "pilot"
  }
}

# terraform/spoke/backend.tf
terraform {
  backend "gcs" {
    bucket  = "dive25-tfstate"
    prefix  = "spoke/${terraform.workspace}"
  }
}
```

---

## 4. Keycloak Bootstrap Architecture

### ✅ Implemented State (Phase 2)

```
Realm JSON Import ──▶ Realm Created ──▶ Federation Link ──▶ IdPs Created
       │                      │                │                 │
       │                      │                │                 │
       ▼                      ▼                ▼                 ▼
  Base Realm            No Hardcoded       Dynamic IdP      User Profile
  Template               IdPs in JSON       Creation         Templates
```

**Key Changes in Phase 2**:
1. Removed hardcoded IdPs from `keycloak/realms/dive-v3-broker.json`
2. IdPs now created dynamically via `./dive federation link <CODE>`
3. User profile templates applied via `scripts/spoke-init/apply-user-profile.sh`
4. Localized mappers configured via `scripts/spoke-init/configure-localized-mappers.sh`

### Original Target State (Reference)

```
Realm JSON Import ──▶ Realm + IdPs Created ──▶ Secrets Injected ──▶ Ready
       │                      │                       │
       │                      │                       │
       ▼                      ▼                       ▼
  Environment              JSON with              GCP Secret
  Substitution           IdP Definitions          Manager
```

### Realm JSON Structure (Target)

```json
{
  "realm": "dive-v3-broker",
  "enabled": true,
  "clients": [
    {
      "clientId": "dive-v3-client-broker",
      "secret": "${KEYCLOAK_CLIENT_SECRET}",
      "redirectUris": ["${APP_URL}/*"],
      "webOrigins": ["${APP_URL}", "${API_URL}"]
    }
  ],
  "identityProviders": [
    {
      "alias": "usa-idp",
      "providerId": "oidc",
      "enabled": true,
      "config": {
        "clientId": "dive-v3-usa-idp-client",
        "clientSecret": "${USA_IDP_CLIENT_SECRET}",
        "authorizationUrl": "${USA_IDP_URL}/realms/master/protocol/openid-connect/auth",
        "tokenUrl": "${USA_IDP_URL}/realms/master/protocol/openid-connect/token",
        "userInfoUrl": "${USA_IDP_URL}/realms/master/protocol/openid-connect/userinfo",
        "jwksUrl": "${USA_IDP_URL}/realms/master/protocol/openid-connect/certs"
      }
    },
    {
      "alias": "gbr-idp",
      "providerId": "oidc",
      "enabled": true,
      "config": {
        "clientId": "dive-v3-gbr-idp-client",
        "clientSecret": "${GBR_IDP_CLIENT_SECRET}",
        "authorizationUrl": "${GBR_IDP_URL}/realms/dive-v3-broker/protocol/openid-connect/auth",
        "tokenUrl": "${GBR_IDP_URL}/realms/dive-v3-broker/protocol/openid-connect/token"
      }
    }
  ],
  "identityProviderMappers": [
    {
      "name": "clearance-mapper",
      "identityProviderAlias": "usa-idp",
      "identityProviderMapper": "oidc-user-attribute-idp-mapper",
      "config": {
        "claim": "clearance",
        "user.attribute": "clearance"
      }
    }
  ]
}
```

### Import Script Enhancement

```bash
# keycloak/scripts/import-realm.sh (enhanced)

#!/bin/bash
set -e

REALM_DIR=/opt/keycloak/realms
PROCESSED_DIR=/tmp/processed-realms

mkdir -p $PROCESSED_DIR

# Process each realm JSON with environment substitution
for realm_file in $REALM_DIR/*.json; do
    filename=$(basename "$realm_file")

    # Substitute environment variables
    envsubst < "$realm_file" > "$PROCESSED_DIR/$filename"

    echo "Processed: $filename"
done

# Start Keycloak with processed realms
exec /opt/keycloak/bin/kc.sh "$@" --import-realm --dir=$PROCESSED_DIR
```

---

## 5. CI/CD Architecture

### Pipeline Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           GitHub Actions Pipeline                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                         On Pull Request                               │  │
│  │                                                                        │  │
│  │   ┌────────┐   ┌────────┐   ┌────────┐   ┌────────┐   ┌────────┐    │  │
│  │   │  Lint  │──▶│  Unit  │──▶│  OPA   │──▶│ Compose│──▶│Deploy  │    │  │
│  │   │        │   │ Tests  │   │ Tests  │   │Validate│   │Dry-Run │    │  │
│  │   └────────┘   └────────┘   └────────┘   └────────┘   └────────┘    │  │
│  │                                                                        │  │
│  │   Target: < 5 minutes                                                  │  │
│  │   Gate: All must pass to merge                                         │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│                                    ▼ (merge to main)                        │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                         On Push to Main                               │  │
│  │                                                                        │  │
│  │   ┌────────┐   ┌────────┐   ┌────────┐   ┌────────┐   ┌────────┐    │  │
│  │   │ Build  │──▶│  Push  │──▶│ Deploy │──▶│  E2E   │──▶│Rollback│    │  │
│  │   │ Images │   │Registry│   │  Dev   │   │ Tests  │   │on Fail │    │  │
│  │   └────────┘   └────────┘   └────────┘   └────────┘   └────────┘    │  │
│  │                                                                        │  │
│  │   Target: < 15 minutes                                                 │  │
│  │   Gate: E2E must pass, auto-rollback on failure                       │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Workflow Configuration

```yaml
# .github/workflows/dive-deploy.yml
name: DIVE Deployment Pipeline

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

env:
  GCP_PROJECT: dive25
  GCP_ZONE: us-east4-c
  PILOT_VM: dive-v3-pilot

jobs:
  # ═══════════════════════════════════════════════════════════════════════
  # PR Checks (Fast Gate)
  # ═══════════════════════════════════════════════════════════════════════

  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: ShellCheck
        run: shellcheck scripts/dive-modules/*.sh
      - name: Terraform Validate
        run: |
          cd terraform/pilot && terraform init -backend=false && terraform validate
          cd ../spoke && terraform init -backend=false && terraform validate

  test-deploy-dry-run:
    runs-on: ubuntu-latest
    needs: lint
    steps:
      - uses: actions/checkout@v4
      - name: Deploy Dry Run
        run: ./dive deploy --dry-run
        env:
          POSTGRES_PASSWORD: test
          KEYCLOAK_ADMIN_PASSWORD: test
          MONGO_PASSWORD: test
          AUTH_SECRET: test
          KEYCLOAK_CLIENT_SECRET: test
          REDIS_PASSWORD: test

  docker-phase-tests:
    runs-on: ubuntu-latest
    needs: lint
    steps:
      - uses: actions/checkout@v4
      - name: Phase 0 Tests
        run: ./tests/docker/phase0-baseline-tests.sh --skip-lifecycle
      - name: Phase 1 Tests
        run: ./tests/docker/phase1-compose-tests.sh

  # ═══════════════════════════════════════════════════════════════════════
  # Main Branch (Deploy Gate)
  # ═══════════════════════════════════════════════════════════════════════

  deploy-dev:
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    needs: [lint, test-deploy-dry-run, docker-phase-tests]
    steps:
      - uses: actions/checkout@v4
      - uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}
      - name: Deploy to Dev
        run: ./dive --env gcp pilot deploy
      - name: Create Checkpoint
        run: ./dive --env gcp pilot checkpoint

  e2e-dev:
    runs-on: ubuntu-latest
    needs: deploy-dev
    steps:
      - uses: actions/checkout@v4
      - name: Run E2E Tests
        run: ./dive test federation
      - name: Run Playwright Tests
        run: ./dive test playwright

  rollback-on-failure:
    if: failure() && needs.e2e-dev.result == 'failure'
    runs-on: ubuntu-latest
    needs: e2e-dev
    steps:
      - uses: actions/checkout@v4
      - uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}
      - name: Rollback Dev
        run: ./dive --env gcp pilot rollback
```

---

## 6. Rollback Architecture

### Local Rollback

```bash
./dive rollback [--to-checkpoint <name>]
```

**Actions**:
1. Verify checkpoint exists
2. Stop current containers
3. Restore volumes from checkpoint
4. Restore Terraform state
5. Start containers
6. Verify health

### GCP Rollback

```bash
./dive --env gcp pilot rollback [--to-checkpoint <name>]
```

**Actions**:
1. SSH to pilot VM
2. Stop current containers
3. Restore Docker volumes from GCS
4. Restore Terraform state from GCS
5. Start containers
6. Verify health

### Checkpoint Storage

| Environment | Location | Retention |
|-------------|----------|-----------|
| Local | `.dive-checkpoint/` | Until nuke |
| GCP | `gs://dive25-checkpoints/` | 30 days |

---

## 7. Secrets Architecture

### Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Secrets Flow                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────────┐                                                       │
│   │  GCP Secret     │                                                       │
│   │  Manager        │                                                       │
│   │                 │                                                       │
│   │ dive-v3-*       │                                                       │
│   └────────┬────────┘                                                       │
│            │                                                                 │
│            ▼                                                                 │
│   ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐      │
│   │  ./dive secrets │────▶│   Environment   │────▶│  Docker Compose │      │
│   │      load       │     │   Variables     │     │   Substitution  │      │
│   └─────────────────┘     └─────────────────┘     └─────────────────┘      │
│                                   │                         │               │
│                                   ▼                         ▼               │
│                           ┌─────────────────┐     ┌─────────────────┐      │
│                           │    Terraform    │     │   Containers    │      │
│                           │   TF_VAR_*      │     │   runtime env   │      │
│                           └─────────────────┘     └─────────────────┘      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Secret Naming Convention

| Pattern | Example | Purpose |
|---------|---------|---------|
| `dive-v3-postgres-<inst>` | `dive-v3-postgres-usa` | Database password |
| `dive-v3-keycloak-<inst>` | `dive-v3-keycloak-gbr` | Admin password |
| `dive-v3-auth-secret-<inst>` | `dive-v3-auth-secret-fra` | NextAuth secret |
| `dive-v3-<service>-<inst>` | `dive-v3-redis-deu` | Service-specific |

---

## 8. Health Monitoring Architecture

### Health Check Endpoints

| Service | Endpoint | Expected | Timeout |
|---------|----------|----------|---------|
| Keycloak | `/realms/master` | 200 | 5s |
| Backend | `/health` | 200 | 3s |
| Frontend | `/` | 200 | 3s |
| OPA | `/health` | 200 | 3s |
| OPAL | `/healthcheck` | 200 | 3s |
| MongoDB | `db.adminCommand('ping')` | ok:1 | 3s |
| Redis | `PING` | PONG | 3s |

### Aggregated Health Response

```json
{
  "status": "healthy",
  "timestamp": "2025-12-18T12:00:00Z",
  "services": {
    "keycloak": { "healthy": true, "latency_ms": 45 },
    "backend": { "healthy": true, "latency_ms": 12 },
    "frontend": { "healthy": true, "latency_ms": 8 },
    "opa": { "healthy": true, "latency_ms": 5 },
    "opal": { "healthy": true, "latency_ms": 15 },
    "mongodb": { "healthy": true, "latency_ms": 3 },
    "redis": { "healthy": true, "latency_ms": 1 }
  },
  "version": {
    "cli": "1.0.0",
    "backend": "1.2.3",
    "frontend": "1.2.3"
  }
}
```

---

## 9. Success Metrics

### Deployment SLOs

| Metric | Target | Measurement |
|--------|--------|-------------|
| Local deploy time | < 5 min | Cold start to healthy |
| GCP deploy time | < 15 min | Provision to healthy |
| Rollback time | < 3 min | Trigger to healthy |
| Nuke time | < 30 sec | Command to clean |
| Health check | < 10 sec | Command to report |

### Reliability SLOs

| Metric | Target | Measurement |
|--------|--------|-------------|
| Deploy success rate | > 99% | First attempt success |
| Idempotency | 100% | Re-run produces same result |
| Rollback success | > 99% | Recovery to healthy |
| CI pipeline success | > 95% | Non-flaky passes |

---

## 10. Migration Path

### ✅ Phase 1: Local Foundation (Complete)
- ✅ Implement idempotent nuke - `deploy.sh:cmd_nuke()`
- ✅ Add checkpoint/restore - `./dive checkpoint create/rollback`
- ✅ Add health JSON output - `./dive health --json`
- ✅ Increase Keycloak timeout - 180s with backoff
- ✅ Add `--confirm` flag - Destructive ops require confirmation

### ✅ Phase 2: Keycloak IdP Automation (Complete)
- ✅ Dynamic IdP creation - `./dive federation link <CODE>`
- ✅ Remove hardcoded IdPs - Cleaned `dive-v3-broker.json`
- ✅ User profile templates - `scripts/spoke-init/apply-user-profile.sh`
- ✅ Localized mappers - `scripts/spoke-init/configure-localized-mappers.sh`
- ✅ IdP verification - `scripts/verify-idps.sh`
- ✅ 36 automated tests - `tests/docker/phase2-idp-automation.sh`

### ✅ Phase 3: Hub Enhanced Spoke Management (Complete)
- ✅ Terraform GCS backend - `terraform/*/backend.tf`
- ✅ Compute VM module - `terraform/modules/compute-vm/`
- ✅ Pilot deploy with Terraform - `./dive --env gcp pilot deploy`
- ✅ GCS checkpoint storage - `gs://dive25-checkpoints/`
- ✅ VM health with JSON - `./dive --env gcp pilot health --json`
- ✅ Phase 3 tests - `tests/gcp/phase3-pilot.sh` (10 tests)

### 🔲 Phase 4: GCP Production Deploy (Pending)
- 🔲 Production VM deployment workflow
- 🔲 Multi-spoke deployment automation
- 🔲 Load balancer configuration

### 🔲 Phase 5: CI/CD (Pending)
- ✅ Add deploy dry-run to PRs - `dive-pr-checks.yml`
- ✅ Create deploy workflow - `dive-deploy.yml`
- 🔲 Implement full auto-rollback

### 🔲 Phase 6: Testing (Pending)
- ✅ Create deploy E2E tests - `tests/e2e/local-deploy.test.sh`
- 🔲 Fill remaining test fixtures
- 🔲 Achieve 95% pass rate
