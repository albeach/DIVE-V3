# DIVE V3 Policy Engine Infrastructure

This directory contains Terraform configuration for deploying the OPA + OPAL policy engine infrastructure.

## Prerequisites

- Terraform >= 1.5.0
- GCP CLI (`gcloud`) authenticated
- Access to GCP project `dive25`
- Docker installed (for container deployment)

## Quick Start

```bash
# Navigate to policy-engine directory
cd terraform/policy-engine

# Initialize Terraform
terraform init

# Select environment (dev, staging, or prod)
terraform workspace select dev  # or: terraform workspace new dev

# Plan changes
terraform plan -var-file=environments/dev/terraform.tfvars

# Apply changes
terraform apply -var-file=environments/dev/terraform.tfvars
```

## Directory Structure

```
policy-engine/
├── backend.tf           # GCS backend configuration
├── providers.tf         # Provider configuration
├── main.tf              # Main module configuration
├── variables.tf         # Root variables
├── environments/
│   ├── dev/
│   │   ├── main.tf              # Dev environment overrides
│   │   └── terraform.tfvars     # Dev variables
│   ├── staging/
│   │   ├── main.tf              # Staging environment overrides
│   │   └── terraform.tfvars     # Staging variables
│   └── prod/
│       ├── main.tf              # Production environment overrides
│       └── terraform.tfvars     # Production variables
└── README.md
```

## Modules

### policy-engine (`../modules/policy-engine`)

Deploys OPA and OPAL infrastructure:

- **OPA**: Open Policy Agent for policy evaluation
- **OPAL Server**: Central hub for policy/data distribution
- **OPAL Client**: Sidecar for OPA, receives updates from OPAL Server

#### Key Features

- Supports standalone OPA or OPAL-managed mode
- Generates Docker Compose override files
- Health check scripts included
- Configurable per-tenant settings

#### Inputs

| Variable | Description | Default |
|----------|-------------|---------|
| `environment` | Deployment environment | Required |
| `tenant_code` | ISO 3166-1 alpha-3 code | Required |
| `enable_opal` | Enable OPAL for dynamic updates | `true` |
| `opa_log_level` | OPA log level | `info` |
| `opal_log_level` | OPAL log level | `INFO` |

### policy-rollout (`../modules/policy-rollout`)

Manages canary deployments for policy updates:

- **Canary deployments**: Gradual traffic shifting
- **Blue/Green**: Instant slot switching
- **Rollback**: Automated rollback scripts

#### Inputs

| Variable | Description | Default |
|----------|-------------|---------|
| `environment` | Deployment environment | Required |
| `tenant_code` | ISO 3166-1 alpha-3 code | Required |
| `policy_version` | Semver version | Required |
| `canary_percentage` | Traffic to canary (0-100) | `0` |
| `deployment_strategy` | canary, blue-green, rolling | `canary` |

## Canary Deployment Workflow

```bash
# 1. Deploy to canary slot (0% traffic)
terraform apply -var-file=environments/prod/terraform.tfvars \
  -var='canary_percentage=0' \
  -var='policy_version=v1.2.0'

# 2. Start canary rollout (10% traffic)
terraform apply -var-file=environments/prod/terraform.tfvars \
  -var='canary_percentage=10'

# 3. Monitor health
./scripts/policy-rollout-health.sh

# 4. Gradually increase traffic
terraform apply -var='canary_percentage=25'
terraform apply -var='canary_percentage=50'
terraform apply -var='canary_percentage=100'

# 5. If issues, rollback
terraform apply -var='canary_percentage=0'
```

## Generated Scripts

After `terraform apply`, these scripts are generated:

| Script | Purpose |
|--------|---------|
| `scripts/policy-engine-health.sh` | Check OPA/OPAL health |
| `scripts/policy-rollout-validate.sh` | Pre-deployment validation |
| `scripts/policy-rollout-deploy.sh` | Deployment initiation |
| `scripts/policy-rollout-promote.sh` | Canary promotion |
| `scripts/policy-rollout-rollback.sh` | Rollback deployment |
| `scripts/policy-rollout-health.sh` | Rollout health check |

## Docker Compose Integration

Terraform generates `docker-compose.policy-engine.yml` that can be used with the main stack:

```bash
# Start policy engine with main stack
docker-compose -f docker-compose.yml \
  -f docker-compose.policy-engine.yml up -d
```

## State Management

State is stored in GCS bucket `dive25-terraform-state`:

```
dive-v3/policy-engine/
├── dev/default.tfstate
├── staging/default.tfstate
└── prod/default.tfstate
```

## Environment-Specific Configuration

### Development (`dev`)
- Verbose logging (debug level)
- OPAL enabled for local development
- No resource limits

### Staging (`staging`)
- Info level logging
- Production-like configuration
- Used for validation

### Production (`prod`)
- Minimal logging (warn level)
- Resource limits applied
- TLS enabled
- Canary deployments recommended

## Outputs

| Output | Description |
|--------|-------------|
| `policy_engine` | Policy engine configuration |
| `policy_rollout` | Rollout configuration (sensitive) |
| `environment` | Current environment |
| `deployment_info` | Summary of deployment |

## Troubleshooting

### Terraform init fails

Ensure GCP authentication:
```bash
gcloud auth application-default login
gcloud config set project dive25
```

### Module validation errors

Re-initialize modules:
```bash
terraform init -upgrade
```

### Docker network not found

Create the network or ensure main stack is running:
```bash
docker network create dive-v3_dive-network
```

## Related Documentation

- [DIVE V3 Policy Spec](../../docs/)
- [OPA Documentation](https://www.openpolicyagent.org/docs/)
- [OPAL Documentation](https://docs.opal.ac/)
- [Phase 2 Implementation](../../docs/PHASE-2-IMPLEMENTATION-PROMPT.md)




