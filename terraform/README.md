# DIVE V3 Terraform Infrastructure

This directory contains Terraform configurations for deploying DIVE V3 Keycloak instances with federation support for NATO countries.

## Directory Structure

```
terraform/
├── pilot/                     # USA pilot (hub) deployment
│   ├── main.tf               # Instance + MFA modules
│   ├── variables.tf          # Input variables
│   ├── provider.tf           # Keycloak provider config
│   └── backend.tf            # Local state backend
├── spoke/                     # NATO country spoke deployments
│   ├── main.tf               # Instance + MFA modules (generic)
│   ├── variables.tf          # Input variables
│   ├── provider.tf           # Keycloak provider config
│   └── backend.tf            # Local state with workspaces
├── countries/                 # Per-country tfvars (generated)
│   ├── pol.tfvars            # Poland
│   ├── fra.tfvars            # France
│   └── ...                   # Other NATO countries
├── modules/                   # Reusable Terraform modules
│   ├── federated-instance/   # Main realm/client/IdP module
│   └── realm-mfa/            # MFA authentication flows
├── tfvars-examples/          # Example variable files
├── archived/                  # Deprecated configurations
└── backend-gcs.tf.example    # GCS remote state example
```

## Quick Start

### Prerequisites

1. **Terraform** >= 1.5.0
2. **Keycloak** running and accessible
3. **GCP Secret Manager** access (for secrets)

### Environment Setup

```bash
# Export required secrets
export TF_VAR_test_user_password=$(gcloud secrets versions access latest --secret=dive-v3-test-user-password --project=dive25)
export TF_VAR_client_secret=$(gcloud secrets versions access latest --secret=dive-v3-keycloak-client-secret --project=dive25)
export TF_VAR_keycloak_admin_password=$(gcloud secrets versions access latest --secret=dive-v3-keycloak-usa --project=dive25)
```

### Pilot Deployment (USA Hub)

```bash
# Using CLI
./dive tf plan pilot
./dive tf apply pilot

# Or manually
cd terraform/pilot
terraform init
terraform plan -var-file=usa.tfvars
terraform apply -var-file=usa.tfvars
```

### Spoke Deployment (NATO Country)

```bash
# Generate tfvars for a country
./dive tf generate POL

# Deploy using CLI
./dive tf spoke init POL
./dive tf spoke plan POL
./dive tf spoke apply POL

# Or manually with workspaces
cd terraform/spoke
terraform init
terraform workspace new pol
terraform plan -var-file=../countries/pol.tfvars
terraform apply -var-file=../countries/pol.tfvars
```

## CLI Commands

The DIVE CLI provides simplified Terraform operations:

```bash
# Core Operations
./dive tf plan [dir]              # Show Terraform plan
./dive tf apply [dir]             # Apply configuration
./dive tf destroy [dir]           # Destroy resources
./dive tf validate                # Validate all configurations
./dive tf fmt                     # Format all Terraform files

# NATO Country tfvars
./dive tf generate <CODE>         # Generate tfvars for a country
./dive tf generate --all          # Generate all 32 NATO countries
./dive tf list-countries          # List generated tfvars

# Workspace Management
./dive tf workspace list          # List workspaces
./dive tf workspace new <CODE>    # Create workspace
./dive tf workspace select <CODE> # Select workspace
./dive tf workspace delete <CODE> # Delete workspace

# Spoke Deployment
./dive tf spoke init <CODE>       # Initialize spoke
./dive tf spoke plan <CODE>       # Plan spoke
./dive tf spoke apply <CODE>      # Apply spoke
./dive tf spoke destroy <CODE>    # Destroy spoke
```

## Modules

### federated-instance

Creates a complete DIVE V3 Keycloak realm with:

- Broker realm with NIST 800-63B security policies
- OIDC client with proper redirect URIs
- Protocol mappers (clearance, countryOfAffiliation, uniqueID, acpCOI)
- WebAuthn policies (AAL2 and AAL3)
- Federation clients for partner instances
- Admin user with super_admin role

See [modules/federated-instance/README.md](modules/federated-instance/README.md)

### realm-mfa

Adds MFA authentication flows to a realm:

- Classified Access Browser Flow (clearance-based MFA)
- Simple Post-Broker OTP Flow (for federated users)
- WebAuthn authenticator registration

See [modules/realm-mfa/README.md](modules/realm-mfa/README.md)

## Remote State (Production)

For production deployments, use GCS remote state:

```bash
# Create GCS bucket
gsutil mb -p dive25 -l us-central1 gs://dive25-terraform-state
gsutil versioning set on gs://dive25-terraform-state

# Update backend.tf to use GCS
terraform {
  backend "gcs" {
    bucket = "dive25-terraform-state"
    prefix = "dive-v3/pilot"  # or "dive-v3/spokes"
  }
}

# Reinitialize
terraform init -reconfigure
```

See [backend-gcs.tf.example](backend-gcs.tf.example) for full details.

## Provider Version

All modules use:

```hcl
terraform {
  required_version = ">= 1.5.0"
  
  required_providers {
    keycloak = {
      source  = "keycloak/keycloak"
      version = "~> 5.0"
    }
  }
}
```

## Archived Configurations

The `archived/` directory contains deprecated configurations that have been replaced by the modular architecture. These files are kept for historical reference and should not be used.

See [archived/README.md](archived/README.md) for details.

## Troubleshooting

### Provider Authentication Failed

Ensure the Keycloak admin password is set:

```bash
export TF_VAR_keycloak_admin_password=$(gcloud secrets versions access latest --secret=dive-v3-keycloak-usa --project=dive25)
```

### Module Not Found

Re-initialize Terraform:

```bash
terraform init -upgrade
```

### Workspace Issues

List and reset workspaces:

```bash
terraform workspace list
terraform workspace select default
```

### State Lock

Local backend doesn't have locking. If state is corrupted:

```bash
rm terraform.tfstate.backup
terraform refresh
```
