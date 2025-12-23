# DIVE V3 CLI User Guide

## Overview

The DIVE V3 CLI (`./dive`) is a comprehensive modular management script for the DIVE V3 coalition-friendly ICAM web application. It provides unified control over all aspects of the DIVE V3 federation platform, including deployment, federation management, policy distribution, and operational monitoring.

## Table of Contents

- [Quick Start](#quick-start)
- [Global Options](#global-options)
- [Core Commands](#core-commands)
- [Deployment Commands](#deployment-commands)
- [Database Commands](#database-commands)
- [Terraform Commands](#terraform-commands)
- [Secrets Management](#secrets-management)
- [Pilot VM Commands](#pilot-vm-commands)
- [Federation Commands](#federation-commands)
- [Hub Management](#hub-management)
- [Spoke Management](#spoke-management)
- [NATO Country Management](#nato-country-management)
- [SP Client Registration](#sp-client-registration)
- [Policy Management](#policy-management)
- [Certificate Management](#certificate-management)
- [Federation Setup](#federation-setup) *(v2.0.0 - Refactored)*
- [Resilience & Failover](#resilience--failover)
- [Fix Commands](#fix-commands)
- [Testing Suite](#testing-suite)
- [Status & Diagnostics](#status--diagnostics)
- [Redis Management](#redis-management)
- [KAS Management](#kas-management)
- [Environment Helpers](#environment-helpers)
- [Checkpoint & Rollback](#checkpoint--rollback)
- [Troubleshooting](#troubleshooting)
- [Architecture Reference](#architecture-reference)
- [Module Refactoring Status](#module-refactoring-status)

## Quick Start

```bash
# Start local development stack (USA Hub)
./dive up

# Deploy to pilot environment
./dive --env pilot deploy

# Check overall status
./dive status

# Get help
./dive help
```

### NATO 32-Country Quick Start

```bash
# List all supported NATO countries
./dive spoke list-countries

# View port assignments for a country
./dive spoke ports POL

# Generate Keycloak theme for a country
./dive spoke generate-theme POL

# Generate Terraform tfvars for a country
./dive tf generate POL

# Deploy a new NATO spoke (automatic federation setup)
./dive spoke deploy POL

# Or manual step-by-step deployment:
DIVE_PILOT_MODE=false ./dive spoke init POL "Poland"
./dive --instance pol spoke up
./dive --instance pol spoke register

# Configure federation (Spoke→Hub and Hub→Spoke)
./dive federation-setup configure pol        # Spoke→Hub flow
./dive federation-setup register-hub pol     # Hub→Spoke flow

# Batch deploy multiple countries
./dive spoke batch-deploy POL NOR ALB

# Verify federation health
./dive spoke verify-federation
./dive federation-setup verify-all

# Verify bidirectional SSO for a specific spoke
./dive federation verify POL

# Fix misconfigured federation (if verify shows issues)
./dive federation fix POL
```

## Global Options

All commands support these global options:

| Option | Description | Default | Examples |
|--------|-------------|---------|----------|
| `--env <env>` | Set environment | `local` | `--env local`, `--env gcp`, `--env pilot` |
| `--instance <code>` | Set instance code | `usa` | `--instance fra`, `--instance gbr`, `--instance deu` |
| `--dry-run` | Show what would be done | `false` | `--dry-run` |
| `--verbose` | Show detailed output | `false` | `--verbose` |
| `--quiet` | Suppress non-essential output | `false` | `--quiet` |

### Environment Types

- **`local`**: Local development with Docker Compose
- **`dev`**: Development environment (may use GCP secrets)
- **`gcp`**: Google Cloud Platform deployment
- **`pilot`**: Remote pilot VM environment
- **`prod`**: Production environment

### Instance Codes

DIVE V3 supports all 32 NATO member countries. Common codes include:

- **`usa`**: United States (Hub)
- **`gbr`**: United Kingdom
- **`fra`**: France
- **`deu`**: Germany
- **`can`**: Canada
- **`pol`**: Poland
- **`nor`**: Norway
- **`alb`**: Albania

View all 32 NATO countries with:
```bash
./dive spoke list-countries
```

## Core Commands

Basic container and service management.

### `up` - Start the Stack

Starts all services for the current environment and instance.

```bash
./dive up
./dive --env local up
./dive --instance fra up
```

**What it does:**
1. Validates prerequisites (Docker, secrets)
2. Loads environment secrets
3. Generates SSL certificates (local/dev only)
4. Stops existing containers
5. Starts infrastructure services
6. Waits for services to be healthy
7. Applies Terraform configuration
8. Ensures broker realm exists
9. Seeds database (local/dev)
10. Verifies deployment

**Services started:**
- Keycloak (IdP)
- Backend API
- Frontend (Next.js)
- PostgreSQL
- MongoDB
- Redis
- OPA (Open Policy Agent)
- OPAL Server

### `down` - Stop the Stack

Stops all running containers.

```bash
./dive down
```

### `restart [service]` - Restart Services

Restart all services or a specific service.

```bash
./dive restart
./dive restart backend
./dive restart keycloak
```

### `logs [service]` - View Logs

View logs from all services or a specific service.

```bash
./dive logs                    # All services (last 100 lines)
./dive logs backend            # Backend logs
./dive logs keycloak -f        # Keycloak logs (follow)
```

### `ps` - List Running Containers

Show status of all DIVE containers.

```bash
./dive ps
```

Output example:
```
NAMES                    STATUS                   PORTS
dive-v3-keycloak         Up 2 hours               0.0.0.0:8443->8443/tcp
dive-v3-backend          Up 2 hours               0.0.0.0:4000->4000/tcp
dive-v3-frontend         Up 2 hours               0.0.0.0:3000->3000/tcp
```

### `exec <service> [command]` - Execute in Container

Execute commands inside running containers.

```bash
./dive exec backend bash
./dive exec keycloak /opt/keycloak/bin/kcadm.sh --help
./dive exec postgres psql -U postgres -d dive_v3
```

**Available services:**
- `frontend`, `fe` - Next.js application
- `backend`, `be` - Express.js API
- `keycloak`, `kc` - Identity Provider
- `postgres`, `pg` - PostgreSQL database
- `mongo`, `mongodb` - MongoDB database
- `redis` - Redis cache
- `opa` - Open Policy Agent
- `opal`, `opal-server` - OPAL policy server

## Deployment Commands

Full-stack deployment and lifecycle management.

### `deploy` - Full Deployment Workflow

Complete deployment workflow with validation, secrets loading, and verification.

```bash
./dive deploy              # Deploy to local environment
./dive --env pilot deploy  # Deploy to pilot VM
```

**10-step deployment process:**
1. Validate prerequisites
2. Load secrets
3. Generate SSL certificates
4. Stop existing containers
5. Remove old volumes
6. Start infrastructure services
7. Wait for health checks
8. Apply Terraform configuration
9. Seed database
10. Verify deployment

### `reset` - Reset to Clean State

Complete reset: nuke everything then deploy fresh.

```bash
./dive reset
```

### `nuke` - Destroy Everything

Completely destroys all containers, volumes, and networks.

```bash
./dive nuke
./dive nuke --confirm        # Skip confirmation prompt
./dive nuke --force          # Force destruction
./dive nuke --keep-images    # Don't remove Docker images
```

**Options:**
- `--confirm`, `--yes` - Skip confirmation prompt
- `--force`, `-f` - Force destruction (skip confirmation)
- `--keep-images` - Don't remove Docker images

**Warning:** This permanently deletes all data and volumes.

### `checkpoint` - Deployment Checkpoints

Create and manage deployment checkpoints for rollback capability.

```bash
./dive checkpoint create [name]    # Create checkpoint with optional name
./dive checkpoint list             # List available checkpoints
```

### `rollback [name]` - Restore from Checkpoint

Restore system state from a previous checkpoint.

```bash
./dive rollback                    # Restore from latest checkpoint
./dive rollback 20251220_120000    # Restore specific checkpoint
```

### `validate` - Validate Prerequisites

Check system prerequisites before deployment.

```bash
./dive validate
```

Checks:
- Docker installation and running
- Required ports available
- Sufficient disk space
- Network connectivity
- Required tools (terraform, gcloud, etc.)

## Database Commands

Database management and data seeding.

### `seed [instance]` - Seed Database

Populate database with test data.

```bash
./dive seed        # Seed current instance
./dive seed usa    # Seed USA instance data
./dive seed fra    # Seed FRA instance data
```

**What gets seeded:**
- Test users for each country
- Sample resources with various classifications
- Federation metadata
- Policy test data

### `backup` - Create Database Backup

Create timestamped backup of all databases.

```bash
./dive backup
```

Creates backup in `backups/YYYYMMDD_HHMMSS/` containing:
- PostgreSQL dump (`postgres.sql`)
- MongoDB archive (`mongo.archive`)

### `restore <backup-dir>` - Restore from Backup

Restore databases from backup directory.

```bash
./dive restore backups/20250115_143000
./dive restore ./my-backup
```

## Terraform Commands

Infrastructure as Code management via Terraform.

### Core Operations

#### `tf plan [dir]` - Show Terraform Plan

Preview infrastructure changes.

```bash
./dive tf plan                # Plan pilot (default)
./dive tf plan pilot          # Plan pilot deployment
./dive tf plan spoke          # Plan spoke deployment
```

#### `tf apply [dir]` - Apply Terraform Configuration

Apply infrastructure changes.

```bash
./dive tf apply               # Apply pilot (default)
./dive tf apply pilot         # Apply pilot configuration
```

#### `tf destroy [dir]` - Destroy Terraform Resources

Remove all Terraform-managed resources.

```bash
./dive tf destroy
./dive tf destroy pilot
```

#### `tf output [dir]` - Show Terraform Outputs

Display Terraform output values.

```bash
./dive tf output
./dive tf output pilot
```

#### `tf init [dir]` - Initialize Terraform

Initialize Terraform working directory.

```bash
./dive tf init pilot
./dive tf init spoke
```

#### `tf validate` - Validate All Configurations

Validate all active Terraform configurations.

```bash
./dive tf validate
```

Output:
```
→ Validating Terraform configurations...
  ✓ pilot: valid
  ✓ spoke: valid
✅ All configurations valid
```

#### `tf fmt` - Format Terraform Files

Format all Terraform files in the terraform directory.

```bash
./dive tf fmt                 # Format all files
./dive tf fmt --check         # Check formatting only
```

### NATO Country tfvars Generation

#### `tf generate <CODE>` - Generate Country tfvars

Generate Terraform variable files for NATO countries using the centralized database.

```bash
./dive tf generate POL              # Generate Poland tfvars
./dive tf generate --all            # Generate all 32 NATO tfvars
./dive tf generate NOR --force      # Force regenerate Norway
```

Generated files are placed in `terraform/countries/<code>.tfvars` and include:
- Instance identification (code, name)
- URLs with correct port assignments
- Client and theme configuration
- Federation partner references
- GCP Secret Manager references (no hardcoded secrets)

#### `tf list-countries` - List Generated tfvars

Show all generated Terraform variable files.

```bash
./dive tf list-countries
```

### Workspace Management

Terraform workspaces allow deploying multiple NATO countries with isolated state.

#### `tf workspace list` - List Workspaces

Show all Terraform workspaces in the spoke configuration.

```bash
./dive tf workspace list
```

#### `tf workspace new <CODE>` - Create Workspace

Create a new workspace for a NATO country.

```bash
./dive tf workspace new pol         # Create Poland workspace
./dive tf workspace new fra         # Create France workspace
```

#### `tf workspace select <CODE>` - Select Workspace

Switch to an existing workspace.

```bash
./dive tf workspace select pol      # Switch to Poland workspace
```

#### `tf workspace delete <CODE>` - Delete Workspace

Remove a workspace (must not be active).

```bash
./dive tf workspace delete pol      # Delete Poland workspace
```

#### `tf workspace show` - Show Current Workspace

Display the currently selected workspace.

```bash
./dive tf workspace show
```

### Spoke Deployment

Simplified commands for deploying NATO country spokes with automatic tfvars handling.

#### `tf spoke init <CODE>` - Initialize Spoke

Initialize Terraform for a NATO country spoke, creating workspace and loading tfvars.

```bash
./dive tf spoke init POL            # Initialize Poland spoke
./dive tf spoke init NOR            # Initialize Norway spoke
```

**What it does:**
1. Generates tfvars if not present
2. Initializes Terraform
3. Creates or selects workspace for the country

#### `tf spoke plan <CODE>` - Plan Spoke Deployment

Show what changes would be made for a NATO country.

```bash
./dive tf spoke plan POL            # Plan Poland deployment
./dive tf spoke plan FRA            # Plan France deployment
```

#### `tf spoke apply <CODE>` - Apply Spoke Configuration

Deploy a NATO country spoke to Keycloak.

```bash
./dive tf spoke apply POL           # Deploy Poland
./dive tf spoke apply NOR           # Deploy Norway
```

#### `tf spoke destroy <CODE>` - Destroy Spoke

Remove all Terraform-managed resources for a spoke.

```bash
./dive tf spoke destroy POL         # Destroy Poland resources
```

### Terraform Directory Structure

```
terraform/
├── pilot/              # USA hub deployment
│   ├── main.tf         # Uses federated-instance + realm-mfa modules
│   └── terraform.tfstate
├── spoke/              # NATO country deployments (uses workspaces)
│   ├── main.tf         # Generic spoke configuration
│   └── terraform.tfstate.d/<code>/  # Per-country state
├── countries/          # Generated tfvars for all 32 NATO countries
│   ├── pol.tfvars
│   ├── fra.tfvars
│   └── ...
├── modules/            # Reusable Terraform modules
│   ├── federated-instance/  # Realm, client, mappers, federation
│   └── realm-mfa/           # MFA authentication flows
└── archived/           # Deprecated configurations (do not use)
```

## Secrets Management

GCP Secret Manager integration for secure credential management.

### `secrets list` - List All Secrets

List all DIVE secrets in GCP Secret Manager.

```bash
./dive secrets list
```

### `secrets show [instance]` - Show Instance Secrets

Display secrets for a specific instance.

```bash
./dive secrets show usa
./dive secrets show
```

### `secrets load [instance]` - Load Secrets into Environment

Load secrets from GCP into shell environment.

```bash
./dive secrets load usa
```

### `secrets verify [instance]` - Verify Secret Access

Check if all required secrets are accessible.

```bash
./dive secrets verify
```

Output example:
```
  POSTGRES_PASSWORD:        ✓ loaded
  KEYCLOAK_ADMIN_PASSWORD:  ✓ loaded
  MONGO_PASSWORD:           ✓ loaded
  AUTH_SECRET:              ✓ loaded
  KEYCLOAK_CLIENT_SECRET:   ✓ loaded
```

### `secrets export [instance]` - Export Secrets as Shell Commands

Export secrets as export statements (safe mode by default).

```bash
./dive secrets export              # Redacted output
./dive secrets export --unsafe     # Plain text output
```

### `secrets lint` - Check for Hardcoded Secrets

Scan codebase for hardcoded passwords and credentials.

```bash
./dive secrets lint                # Run secret lint check
./dive secrets lint --verbose      # Detailed output
./dive secrets lint --fix          # Auto-fix issues (where possible)
./dive secrets lint --ci           # CI mode (exit 1 on violations)
```

**What it checks:**
- Hardcoded passwords in compose files
- Inline credentials in connection strings
- Missing `${VAR:?required}` syntax for required env vars
- Weak or default passwords

### `secrets verify-all` - Verify All Instances

Verify secret access for all configured instances.

```bash
./dive secrets verify-all
```

## Pilot VM Commands

Remote pilot VM management via GCP Compute Engine.

### `pilot up` - Start Services on Pilot VM

Start DIVE services on the remote pilot VM.

```bash
./dive --env pilot pilot up
```

### `pilot down` - Stop Services on Pilot VM

Stop all services on the pilot VM.

```bash
./dive --env pilot pilot down
```

### `pilot status` - Show Pilot VM Status

Display status of services and recent logs on pilot VM.

```bash
./dive --env pilot pilot status
```

### `pilot logs [service]` - View Pilot VM Logs

View logs from pilot VM services.

```bash
./dive --env pilot pilot logs
./dive --env pilot pilot logs backend -f
```

### `pilot ssh` - SSH into Pilot VM

Open SSH session to the pilot VM.

```bash
./dive --env pilot pilot ssh
```

### `pilot reset` - Reset Pilot VM

Clean reset of pilot VM to fresh state.

```bash
./dive --env pilot pilot reset
```

### `pilot deploy` - Full Deployment to Pilot VM

Complete deployment workflow on pilot VM.

```bash
./dive --env pilot pilot deploy
```

## Federation Commands

Cross-instance federation management and identity linking.

### `federation status` - Show Federation Status

Display overall federation status.

```bash
./dive federation status
```

### `federation register <url>` - Register Instance with Hub

Register a new instance with the federation hub.

```bash
./dive federation register https://fra-api.dive25.com
```

### `federation link <CODE>` - Link IdP for Cross-Border SSO

Auto-configure IdP trust between instances.

```bash
./dive federation link GBR    # Link GBR to USA Hub
./dive --instance gbr federation link USA  # Link USA to GBR Spoke
```

### `federation unlink <CODE>` - Remove IdP Link

Remove IdP trust relationship.

```bash
./dive federation unlink GBR
```

### `federation verify <CODE>` - Verify Bidirectional Federation

Check bidirectional SSO configuration between hub and spoke.

```bash
./dive federation verify EST         # Verify USA ↔ EST federation
./dive federation verify DEU         # Verify USA ↔ DEU federation
./dive --instance fra federation verify USA  # Verify from FRA perspective
```

**Verification checks:**
1. Remote IdP exists and is enabled in local Keycloak
2. Local IdP exists and is enabled in remote Keycloak
3. Federation network connectivity (Docker shared network)
4. Client secret synchronization status

**Output:**
```
Federation Verification: USA ↔ EST

1. EST-idp in USA Keycloak: ✓ PASS (exists and enabled)
2. USA-idp in EST Keycloak: ✓ PASS (exists and enabled)
3. Federation network connectivity: ⚠ WARN (using host.docker.internal)
4. Client secret synchronization: ⚠ WARN (secret may not be synced)

✅ Bidirectional SSO is configured
```

### `federation fix <CODE>` - Fix Misconfigured Federation

Automatically repair misconfigured bidirectional federation.

```bash
./dive federation fix EST         # Fix USA ↔ EST federation
./dive federation fix DEU         # Fix USA ↔ DEU federation
./dive federation fix FRA         # Fix USA ↔ FRA federation
```

**4-step fix process:**
1. **Remove misconfigured IdPs** - Deletes existing IdPs with wrong configuration
2. **Ensure federation clients exist** - Creates missing `dive-v3-broker-{code}` clients in both realms
3. **Recreate IdPs with correct configuration** - Sets proper client IDs and dual URLs (public for browser auth, internal for token exchange)
4. **Verify configuration** - Runs `federation verify` to confirm fix

**Common issues fixed:**
- Swapped/inverted client IDs in IdP configuration
- Missing federation clients in target realms
- Incorrect token URL (localhost vs internal Docker hostname)
- Client secret mismatch between IdP and client

**Example output:**
```
Fixing Federation: USA ↔ DEU

Step 1: Removing misconfigured IdPs
  Deleting deu-idp from USA... done
  Deleting usa-idp from DEU... done

Step 2: Ensuring federation clients exist
  Checking dive-v3-broker-deu in dive-v3-broker... exists
  Checking dive-v3-broker-usa in dive-v3-broker-deu... creating... created

Step 3: Recreating IdPs with correct configuration
  Created deu-idp in USA (direct)
  Created usa-idp in DEU (direct)

Step 4: Verifying configuration
  ✅ Bidirectional SSO is configured
```

### `federation list-idps` - List Configured Identity Providers

Show all configured IdPs in the broker realm.

```bash
./dive federation list-idps
```

### `federation mappers list` - List NATO Nation Templates

List available protocol mapper templates (PII warning).

```bash
./dive federation mappers list
```

### `federation mappers show <nation>` - Show Nation Mapper Details

Display protocol mapper configuration for a nation.

```bash
./dive federation mappers show france
```

### `federation mappers apply` - Apply PII-Minimized Mappers

Apply production-safe protocol mappers.

```bash
./dive federation mappers apply
./dive --instance fra federation mappers apply
```

### `federation mappers verify` - Verify Mapper Configuration

Check mapper setup and PII compliance.

```bash
./dive federation mappers verify
```

## Hub Management

Central hub administration and spoke lifecycle management.

### `hub deploy` - Full Hub Deployment

Complete hub deployment with 7-step process.

```bash
./dive hub deploy
```

**7-step process:**
1. Initialize hub directories and config
2. Load secrets
3. Start hub services
4. Wait for services to be healthy
5. Apply Terraform configuration
6. Seed test users and resources (ABAC)
7. Verify deployment

### `hub init` - Initialize Hub

Set up hub directories, certificates, and configuration.

```bash
./dive hub init
```

### `hub seed [count]` - Seed Hub with Test Data

Seeds the Hub with test users and ZTDF encrypted resources for ABAC testing.

```bash
./dive hub seed           # Default: 5000 ZTDF encrypted resources
./dive hub seed 10000     # Custom: 10000 resources
```

**What it does:**

1. **Configures Keycloak User Profile** - Adds DIVE attributes (clearance, countryOfAffiliation, uniqueID, acpCOI)
2. **Fixes protocol mappers** - Ensures acpCOI mapper is multivalued
3. **Creates test users** with escalating clearances:
   - `testuser-usa-1` (UNCLASSIFIED)
   - `testuser-usa-2` (CONFIDENTIAL)
   - `testuser-usa-3` (SECRET)
   - `testuser-usa-4` (TOP_SECRET)
   - `admin-usa` (TOP_SECRET + admin role)
4. **Seeds 5000 ZTDF encrypted resources** with realistic weighted distribution:
   - Classifications: UNCLASSIFIED (20%), RESTRICTED (15%), CONFIDENTIAL (25%), SECRET (25%), TOP_SECRET (15%)
   - COIs: 28+ validated templates (NATO, FVEY, bilateral, multi-COI, etc.)
   - Releasability: Instance-specific and coalition-wide patterns
   - Industry Access: Government-only and industry-accessible resources

**Distribution (for 5000 resources - realistic DoD/NATO pattern):**
- ~1000 UNCLASSIFIED, ~750 RESTRICTED, ~1250 CONFIDENTIAL, ~1250 SECRET, ~750 TOP_SECRET
- All documents have full ZTDF policy structure with encrypted content

**ABAC Result:**
- UNCLASSIFIED user sees ~25% of resources
- CONFIDENTIAL user sees ~50% of resources
- SECRET user sees ~75% of resources
- TOP_SECRET user sees 100% of resources

**Note:** This is automatically run during `hub deploy`. Use this command to re-seed or customize resource count.

### `hub up` - Start Hub Services

Start all hub services.

```bash
./dive hub up
```

### `hub down` - Stop Hub Services

Stop all hub services.

```bash
./dive hub down
```

### `hub status` - Show Hub Status

Comprehensive hub status including services and federation stats.

```bash
./dive hub status
```

### `hub health` - Check Hub Health

Detailed health check of all hub services.

```bash
./dive hub health
```

### `hub verify` - 10-Point Hub Verification

Complete hub verification checklist (Phase 6).

```bash
./dive hub verify
```

**10-point verification:**
1. **Docker containers running** (8 services: keycloak, backend, opa, opal-server, mongodb, postgres, redis, redis-blacklist)
2. **Keycloak health** (realm endpoint or /health/ready)
3. **Backend API health** (/health endpoint)
4. **MongoDB connection** (ping test via mongosh)
5. **Redis connection** (ping test via redis-cli)
6. **OPAL Server health** (/healthcheck endpoint)
7. **Policy bundle available** (version endpoint with metadata)
8. **Federation registry initialized** (health endpoint with spoke count)
9. **Registration endpoint accessible** (POST test to /api/federation/register)
10. **TLS certificates valid** (expiry check and connectivity test)

Returns 0 if all checks pass, 1 if any fail.

### `hub health` - Check Hub Health

Quick health check of all hub services.

```bash
./dive hub health
```

Shows running status and health status for each service with container names.

### `hub spokes list` - List Registered Spokes

Show all registered federation spokes.

```bash
./dive hub spokes list
```

### `hub spokes pending` - Show Pending Approvals

Rich display of spokes awaiting approval.

```bash
./dive hub spokes pending
```

### `hub spokes approve <id>` - Approve Spoke Registration

Interactive spoke approval with scope and trust level selection.

```bash
./dive hub spokes approve spoke-fra-abc123
./dive hub spokes approve spoke-fra-abc123 --scopes 'policy:base' --trust-level partner
```

### `hub spokes reject <id>` - Reject Spoke Registration

Reject spoke registration with reason.

```bash
./dive hub spokes reject spoke-xyz-123 --reason 'Incomplete information'
```

### `hub spokes rotate-token <id>` - Rotate Spoke Token

Revoke current token and generate new one.

```bash
./dive hub spokes rotate-token spoke-fra-456
```

### `hub push-policy [layers]` - Push Policy Update

Distribute policy updates to all connected spokes.

```bash
./dive hub push-policy
./dive hub push-policy base,coalition
```

## Spoke Management

Distributed spoke instance management with full NATO 32-country support.

### `spoke init <code> <name>` - Initialize New Spoke

Interactive spoke setup wizard with Cloudflare tunnel auto-configuration.

```bash
./dive spoke init POL "Poland"
./dive spoke init NOR "Norway"
```

**Setup options:**
- **Hostname configuration:** dive25.com subdomains, custom domains, or IP addresses
- **Cloudflare tunnel:** Auto-create, manual token, or skip
- **Contact information** and hub connection
- **Secure password generation**

### `spoke generate-certs` - Generate SSL Certificates

Generate development certificates for spoke services.

```bash
./dive --instance pol spoke generate-certs
```

### `spoke deploy <code> [name]` - Full Automated Deployment

**NEW!** Complete spoke deployment in a single command with 10-step automated process.

```bash
./dive spoke deploy POL "Poland Defence"
./dive spoke deploy NZL "New Zealand Defence Force"
./dive spoke deploy HUN "Hungary Ministry"
```

**10-step deployment process (completes in ~120 seconds):**
1. **Initialize spoke configuration** - Create directories, config.json, docker-compose.yml
2. **Prepare federation certificates** - mkcert CA installation, Hub SAN updates
3. **Start Docker services** - All spoke containers with health checks
4. **Wait for services to be healthy** - Extended timeout for Keycloak
5. **Run post-deployment initialization** - Keycloak realm, client, users
6. **Configure federation** - usa-idp setup, secret synchronization
7. **Register spoke as IdP in Hub** - Bidirectional federation setup
8. **Formal registration status check** - Optional production approval flow
9. **Federation registry update** - Enable federated search capabilities
10. **Finalize client configuration** - Sync secrets and restart frontend

**Key benefits:**
- **Zero manual intervention** for development deployments
- **Automatic federation setup** (both directions: Hub↔Spoke)
- **Certificate management** integrated
- **GCP secret integration** with local fallback
- **Auto-approval detection** for development environments

### `spoke register` - Register with Hub

Register spoke with federation hub including CSR and bidirectional setup.

```bash
./dive --instance pol spoke register
./dive --instance pol spoke register --poll
./dive --instance pol spoke register --poll-timeout 300
```

**Enhanced registration features:**
- **Automatic CSR generation** if certificates missing
- **Bidirectional federation** support (includes Hub Keycloak password)
- **Poll mode** for automatic approval handling
- **Token auto-configuration** on approval

**Poll options:**
- `--poll` - Wait for approval and auto-configure token
- `--poll-timeout <seconds>` - Timeout for polling (default: 600)
- `--poll-interval <seconds>` - Poll interval (default: 30)

### `spoke status` - Show Spoke Status

Display spoke federation and service status.

```bash
./dive --instance pol spoke status
```

### `spoke health` - Check Spoke Health

Verify all spoke services are healthy.

```bash
./dive --instance pol spoke health
```

### `spoke up` - Start Spoke Services

Start all services for the spoke instance.

```bash
./dive --instance pol spoke up
```

### `spoke down` - Stop Spoke Services

Stop all spoke services.

```bash
./dive --instance pol spoke down
```

### `spoke sync` - Force Policy Sync

Manually trigger policy synchronization from hub.

```bash
./dive --instance pol spoke sync
```

### `spoke logs [service]` - View Spoke Logs

View logs from spoke services.

```bash
./dive --instance pol spoke logs
./dive --instance pol spoke logs backend -f
```

## NATO Country Management

Centralized management for all 32 NATO member countries.

### `spoke list-countries` - List All NATO Countries

Display all 32 NATO member countries with metadata.

```bash
./dive spoke list-countries              # Table format
./dive spoke list-countries --simple     # Simple list
./dive spoke list-countries --json       # JSON format
```

Output includes country code, flag, name, NATO join year, and port offset.

### `spoke ports [CODE]` - Show Port Assignments

Display port assignments for countries based on the NATO database.

```bash
./dive spoke ports              # Show all 32 countries
./dive spoke ports POL          # Show Poland ports only
```

**Port allocation scheme:**
| Service | Range | Formula |
|---------|-------|---------|
| Frontend | 3000-3031 | 3000 + offset |
| Backend | 4000-4031 | 4000 + offset |
| Keycloak | 8443-8474 | 8443 + offset |
| PostgreSQL | 5432-5463 | 5432 + offset |
| MongoDB | 27017-27048 | 27017 + offset |

### `spoke country-info <CODE>` - Show Country Details

Display detailed information for a specific NATO country.

```bash
./dive spoke country-info POL
./dive spoke country-info NOR
```

Shows: name, flag, colors, timezone, NATO join year, all port assignments, and instance status.

### `spoke validate-country <CODE>` - Validate Country Code

Check if a country code is a valid NATO member.

```bash
./dive spoke validate-country POL    # ✓ Valid NATO member
./dive spoke validate-country XYZ    # ✗ Invalid code
```

### `spoke generate-theme <CODE>` - Generate Keycloak Theme

Generate a Keycloak login theme for a NATO country.

```bash
./dive spoke generate-theme POL          # Generate Poland theme
./dive spoke generate-theme --all        # Generate all 32 themes
./dive spoke generate-theme NOR --force  # Force regenerate Norway
```

Themes are generated in `keycloak/themes/dive-v3-<code>/` with:
- Country-specific CSS colors (from national flag)
- Placeholder background image
- English messages file

### `spoke batch-deploy <CODES>` - Batch Deploy Countries

Deploy multiple NATO countries in sequence.

```bash
./dive spoke batch-deploy POL NOR ALB           # Deploy 3 countries
./dive spoke batch-deploy --all                 # Deploy all 32 (not recommended locally)
./dive spoke batch-deploy POL NOR --dry-run     # Preview deployment
./dive spoke batch-deploy --all --skip-existing # Skip already deployed
```

**Deployment steps per country:**
1. Initialize spoke configuration
2. Start Docker services
3. Wait for Keycloak health
4. Initialize Keycloak realm
5. Register with hub
6. (Manual) Approve at hub

### `spoke verify-federation` - Verify Federation Health

Check federation connectivity for running spokes.

```bash
./dive spoke verify-federation              # Verify all running spokes
./dive spoke verify-federation POL NOR      # Verify specific countries
```

Checks per spoke:
- Keycloak health and OIDC discovery
- Backend API health
- Frontend accessibility
- OPA policy engine
- KAS (Key Access Service)

### Spoke KAS Commands

Manage KAS (Key Access Service) for spoke instances.

#### `spoke kas init <code>` - Initialize Spoke KAS

Initialize KAS configuration for a spoke instance including certificates and registry registration.

```bash
./dive spoke kas init POL
./dive spoke kas init NOR
./dive --instance fra spoke kas init
```

Performs:
- Creates KAS certificates if needed
- Configures KAS port in spoke environment
- Auto-registers in KAS federation registry

#### `spoke kas status <code>` - Spoke KAS Status

Show KAS service status for a spoke instance.

```bash
./dive spoke kas status POL
./dive --instance fra spoke kas status
```

#### `spoke kas health <code>` - Spoke KAS Health Check

Detailed health check for spoke KAS.

```bash
./dive spoke kas health POL
```

#### `spoke kas register <code>` - Register in Federation

Register spoke KAS in the federation registry with automatic trust matrix configuration.

```bash
./dive spoke kas register POL
./dive spoke kas register NOR
```

Creates entry in `config/kas-registry.json` with:
- KAS endpoint URLs
- JWT authentication configuration
- Supported COIs and clearance mappings
- Bilateral trust with usa-kas (Hub)

#### `spoke kas unregister <code>` - Remove from Federation

Remove spoke KAS from the federation registry.

```bash
./dive spoke kas unregister POL
```

#### `spoke kas logs <code> [-f]` - View Spoke KAS Logs

View logs for spoke KAS with optional follow mode.

```bash
./dive spoke kas logs FRA
./dive spoke kas logs POL -f
```

## SP Client Registration

OAuth/OIDC partner application registration.

### `sp register` - Register OAuth Client

Interactive wizard for registering OAuth/OIDC clients.

```bash
./dive sp register
```

**Registration includes:**
- Organization information
- Country code (ISO 3166-1 alpha-3)
- Application details
- OAuth configuration (redirect URIs, scopes, PKCE)
- Classification limits

### `sp status [sp-id]` - Show Registration Status

Check status of SP client registration.

```bash
./dive sp status sp-nzl-123456789
```

### `sp list` - List Registered Clients

Show all registered SP clients.

```bash
./dive sp list
```

### `sp credentials [sp-id]` - Show Client Credentials

Display client ID and secret for registered SP.

```bash
./dive sp credentials sp-nzl-123456789
```

## Policy Management

OPA policy bundle creation and OPAL distribution.

### `policy build [--sign]` - Build Policy Bundle

Create signed OPA policy bundle.

```bash
./dive policy build              # Build with signing
./dive policy build --no-sign    # Build without signing
./dive policy build --scopes base,coalition  # Specific scopes
```

### `policy push` - Push to OPAL Server

Publish policy bundle to OPAL distribution server.

```bash
./dive policy push
```

### `policy status` - Show Distribution Status

Display policy distribution status across federation.

```bash
./dive policy status
```

### `policy test [pattern]` - Run Policy Tests

Execute OPA policy tests.

```bash
./dive policy test                    # All tests
./dive policy test fuel_inventory     # Specific pattern
```

### `policy version` - Show Current Version

Display current policy bundle version.

```bash
./dive policy version
```

## Certificate Management

SSL certificate generation and truststore management for federation.

### `certs check` - Check mkcert Prerequisites

Verify mkcert is installed and configured with a root CA.

```bash
./dive certs check
```

### `certs prepare-federation <spoke>` - Complete Certificate Setup

Full certificate setup for a spoke including CA installation and certificate generation.

```bash
./dive certs prepare-federation pol        # Setup for Poland
./dive certs prepare-federation rou        # Setup for Romania
```

**What it does:**
1. Verifies mkcert is ready
2. Installs mkcert CA in Hub truststore
3. Installs mkcert CA in spoke truststore
4. Updates Hub certificate with spoke SANs
5. Generates spoke-specific certificates

### `certs prepare-all` - Batch Certificate Setup

Prepare certificates for all running spokes.

```bash
./dive certs prepare-all
```

### `certs verify <spoke>` - Verify Certificate Configuration

Check certificate configuration for a spoke.

```bash
./dive certs verify pol
./dive certs verify rou
```

### `certs verify-all` - Batch Certificate Verification

Verify certificates for all spokes.

```bash
./dive certs verify-all
```

### `certs install-hub-ca` - Install CA in Hub

Install mkcert root CA in Hub Keycloak truststore.

```bash
./dive certs install-hub-ca
```

### `certs install-spoke-ca <spoke>` - Install CA in Spoke

Install mkcert root CA in spoke Keycloak truststore.

```bash
./dive certs install-spoke-ca pol
```

### `certs update-hub-sans <spoke>` - Update Hub Certificate SANs

Add spoke hostname to Hub certificate Subject Alternative Names.

```bash
./dive certs update-hub-sans pol
```

### `certs generate-spoke <spoke>` - Generate Spoke Certificate

Generate SSL certificate for a spoke.

```bash
./dive certs generate-spoke pol
```

## Federation Setup

Keycloak federation configuration and troubleshooting. **Refactored in v2.0.0** with simplified commands and unified helpers.

### Primary Commands

#### `federation-setup configure <spoke|all>` - Configure Spoke Federation

Complete federation configuration for Spoke→Hub flow with bidirectional attribute passthrough.

```bash
./dive federation-setup configure fra        # Configure France
./dive federation-setup configure pol        # Configure Poland
./dive federation-setup configure all        # Configure all running spokes
```

**6-step process:**
1. Authenticate to Hub and Spoke Keycloaks
2. Ensure spoke's usa-idp is configured with correct client secret
3. Create Hub's federation client in spoke (`dive-v3-broker-usa`)
4. Setup DIVE attribute scopes and mappers for claim passthrough
5. Sync frontend .env with client secrets
6. Recreate frontend container to load new secrets

#### `federation-setup register-hub <spoke|all>` - Register Spoke in Hub

Register a spoke as an IdP in the Hub, enabling Hub→Spoke federation.

```bash
./dive federation-setup register-hub rou     # Register Romania in Hub
./dive federation-setup register-hub pol     # Register Poland in Hub
./dive federation-setup register-hub all     # Register all running spokes
```

**6-step process:**
1. Authenticate to Hub and Spoke Keycloaks
2. Create spoke client in Hub (`dive-v3-broker-{spoke}`)
3. Create IdP in Hub (`{spoke}-idp`) pointing to spoke's Keycloak
4. Create IdP mappers for DIVE attribute passthrough
5. Configure redirect URIs in spoke client
6. Sync OPA trusted issuers

#### `federation-setup verify <spoke|all>` - Verify Federation

Check federation configuration for a spoke or all spokes.

```bash
./dive federation-setup verify fra
./dive federation-setup verify all
```

**Checks:**
- Hub and Spoke Keycloak health
- Hub and Spoke Keycloak authentication
- Hub client exists for spoke
- Spoke local client exists
- IdP configurations valid

### Setup Commands

#### `federation-setup sync-opa <spoke|all>` - Sync OPA Trusted Issuers

Add spoke's Keycloak issuer to OPA trusted_issuers.json.

```bash
./dive federation-setup sync-opa pol
./dive federation-setup sync-opa all
```

#### `federation-setup setup-claims <spoke>` - Setup DIVE Claim Passthrough

Configure DIVE attribute scope and protocol mappers for a spoke.

```bash
./dive federation-setup setup-claims fra
```

**What it does:**
1. Creates `dive-attributes` scope with DIVE claim mappers
2. Assigns scope to relevant clients
3. Creates IdP mappers for claim passthrough

#### `federation-setup init-nextauth <spoke>` - Initialize NextAuth Schema

Create the NextAuth database tables in the spoke's PostgreSQL database.

```bash
./dive federation-setup init-nextauth fra
./dive federation-setup init-nextauth pol
```

### Troubleshooting Commands

#### `federation-setup fix-idp-urls <spoke|all>` - Fix IdP URLs

Fix `host.docker.internal` URLs in Hub IdP configurations. This resolves browser accessibility issues where federation redirects to internal Docker hostnames.

```bash
./dive federation-setup fix-idp-urls fra       # Fix FRA IdP
./dive federation-setup fix-idp-urls all       # Fix all IdPs
```

**What it fixes:**
- `authorizationUrl`: `host.docker.internal` → `localhost`
- `issuer`: `host.docker.internal` → `localhost`
- `logoutUrl`: `host.docker.internal` → `localhost`

#### `federation-setup state <spoke>` - Show Federation State

Display the current state of federation setup for a spoke.

```bash
./dive federation-setup state fra
```

Shows step completion status and any pending actions.

#### `federation-setup recover <spoke>` - Recover Failed Setup

Resume a failed federation setup from the last successful step.

```bash
./dive federation-setup recover fra
```

### Utility Commands

#### `federation-setup get-hub-secret <spoke>` - Get Hub Client Secret

Retrieve client secret from Hub for a spoke.

```bash
./dive federation-setup get-hub-secret pol
```

#### `federation-setup get-spoke-secret <spoke>` - Get Spoke Client Secret

Retrieve local client secret from spoke's Keycloak.

```bash
./dive federation-setup get-spoke-secret pol
```

### Deprecated Commands (Backwards Compatible)

The following commands are deprecated but still work for backwards compatibility:

| Deprecated Command | Use Instead |
|-------------------|-------------|
| `configure-all` | `configure all` |
| `register-hub-all` | `register-hub all` |
| `verify-all` | `verify all` |
| `sync-opa-all` | `sync-opa all` |
| `configure-idp` | `configure <spoke>` |
| `sync-env`, `sync-hub-secret` | `configure <spoke>` |
| `create-hub-client` | `configure <spoke>` |
| `create-spoke-client` | `register-hub <spoke>` |
| `fix-issuer`, `fix-issuer-all` | Auto-configured |

### Complete New Spoke Setup

The recommended workflow for setting up a new spoke:

```bash
# 1. Deploy the spoke
./dive spoke deploy <code>

# 2. Register spoke in Hub (Hub→Spoke flow)
./dive federation-setup register-hub <code>

# 3. Configure spoke federation (Spoke→Hub flow)
./dive federation-setup configure <code>

# 4. Verify bidirectional federation
./dive federation-setup verify <code>
```

## Testing Suite

Comprehensive testing framework with Docker phase tests, unit tests, and dynamic Playwright E2E testing for hub-spoke architectures.

### Docker Phase Regression Tests

Phase-based regression tests validate Docker infrastructure across all implementation phases.

```bash
# Run individual phase tests
./tests/docker/phase0-baseline-tests.sh     # 9 tests - baseline infrastructure
./tests/docker/phase1-compose-tests.sh      # 33 tests - compose consolidation
./tests/docker/phase2-secrets-tests.sh      # 20 tests - secrets standardization
./tests/docker/phase3-resilience-tests.sh   # 8 tests - service resilience
./tests/docker/phase4-observability-tests.sh # 19 tests - monitoring/alerting
./tests/docker/phase5-testing-tests.sh      # 19 tests - test infrastructure

# Total: 108 regression tests
```

**Phase Test Summary:**
| Phase | Focus Area | Tests |
|-------|------------|-------|
| Phase 0 | Baseline (Docker, networks, hub health) | 9 |
| Phase 1 | Compose consolidation (extends, naming) | 33 |
| Phase 2 | Secrets (GCP, lint, no hardcoding) | 20 |
| Phase 3 | Resilience (restart policies, health checks) | 8 |
| Phase 4 | Observability (Prometheus, Grafana, OPAL) | 19 |
| Phase 5 | Testing infrastructure (Jest, OPA, CI) | 19 |

### `test federation` - Run Federation E2E Tests

Execute end-to-end federation tests.

```bash
./dive test federation
./dive test federation --verbose
./dive test federation --fail-fast
```

### `test unit` - Run Backend Unit Tests

Execute backend unit test suite.

```bash
./dive test unit
```

### `test playwright` - Run Dynamic Playwright E2E Tests

Run intelligent Playwright tests that automatically detect and test all running hub-spoke instances.

```bash
# Test all detected instances sequentially
./dive test playwright

# Test with federation features
./dive test playwright --federation

# Preview what would run (dry run)
./dive test playwright --dry-run --verbose
```

**Features:**
- Auto-detects running Docker containers (hub, ALB, DNK, GBR, ROU, etc.)
- Maps container names to test configurations
- Generates instance-specific Playwright projects
- Tests hub-spoke federation workflows
- Parallel execution across multiple instances

### `test instances` - Test All Running Hub-Spoke Instances

Comprehensive testing of all running hub and spoke instances with instance-aware test suites.

```bash
# Test all running instances
./dive test instances

# Test all instances in parallel (faster)
./dive test instances --parallel

# Test specific instance only
./dive test instances ALB
./dive test instances GBR

# Preview instance detection (dry run)
./dive test instances --dry-run --verbose
```

**What it tests per instance:**
- Frontend accessibility and health
- Backend API connectivity
- Instance-specific branding and UI
- Authentication flows
- Resource access controls
- Cross-instance federation (when applicable)

### `test all` - Run Complete Test Suite

Execute all test suites: unit tests, federation tests, and dynamic Playwright tests.

```bash
./dive test all
```

**Complete test matrix:**
1. Backend unit tests (Jest)
2. Federation E2E tests (bash scripts)
3. Dynamic Playwright E2E tests (auto-detected instances)

### Hub-Spoke Architecture Testing

The dynamic testing system understands DIVE V3's hub-spoke federation model:

```
┌─────────────┐    ┌─────────────┐
│   USA Hub   │◄──►│  FRA Spoke  │
│             │    │             │
│ Port: 3000  │    │ Port: 3025  │
│ Tests: Hub  │    │ Tests: FRA  │
└─────────────┘    └─────────────┘
       ▲                 ▲
       │                 │
       └─────────────────┘
        Federation Bus
```

**Instance Detection:**
- **Hub**: `dive-hub-frontend` → USA Hub (port 3000)
- **Spokes**: `alb-frontend-alb-1` → Albania (port 3001)
- **Spokes**: `dnk-frontend-dnk-1` → Denmark (port 3007)
- **Spokes**: `gbr-frontend-gbr-1` → UK (port 3003)
- **Spokes**: `rou-frontend-rou-1` → Romania (port 3025)

**Test Categories:**
- **Hub Tests**: Federation management, spoke registration, policy distribution
- **Spoke Tests**: Local authentication, resource access, hub connectivity
- **Federation Tests**: Cross-instance SSO, policy synchronization, trust relationships

## Status & Diagnostics

System monitoring and diagnostic tools.

### `status` - Overall System Status

Comprehensive status report for current environment.

```bash
./dive status
```

Shows:
- Service health
- Container status
- Federation statistics
- Policy version
- Recent logs

### `health` - Health Check All Services

Detailed health check of all services.

```bash
./dive health
```

### `validate` - Validate Configuration

Check prerequisites, compose configuration, and deployment readiness.

```bash
./dive validate
```

**Validation checks:**
- Required tools (docker, docker-compose, gcloud, terraform)
- Docker networks (dive-v3-shared-network, shared-network)
- GCP secrets access for current instance
- Port availability (3000, 4000, 8443, etc.)
- TLS certificates present and valid
- Docker Compose configuration syntax for all compose files
- Instance compose file validation with proper env vars

### `info` - Show Environment Information

Display current environment configuration.

```bash
./dive info
```

### `diagnostics` - Comprehensive Diagnostics

Full system diagnostic report with known issue detection and remediation suggestions.

```bash
./dive diagnostics
```

**Diagnostic sections:**
1. Container Health - Running/stopped status, health checks
2. Network Configuration - Shared networks, connectivity
3. Secrets Status - GCP secret access verification
4. Policy Sync - OPAL server/client status
5. Observability - Prometheus targets, Grafana dashboards
6. Known Issues - Pattern detection with fix commands
7. Resource Usage - Docker disk, memory consumption

**Known issue detection:**
- OPAL client waiting for hub token
- Redis exporter connectivity issues
- Backend health check failures
- Prometheus scraping problems
- Certificate expiration warnings

### `brief` - Brief Status Summary

Quick status overview.

```bash
./dive brief
```

## Redis Management

Comprehensive Redis management across Hub and all Spoke instances. Provides monitoring, health checks, and cache management for all DIVE V3 Redis deployments.

### `redis status [instance]` - Redis Status

Show Redis status for a specific instance.

```bash
# Hub Redis status
./dive redis status

# Specific spoke Redis status
./dive redis status rou
./dive redis status pol
```

Shows:
- Ping response status
- Redis version and mode
- Memory usage
- Connected clients
- Authentication status

### `redis status-all` - All Instances Status

Show Redis status for all running instances.

```bash
./dive redis status-all
```

Displays status for Hub and all running spoke Redis containers.

### `redis health [instance]` - Detailed Health Check

Perform comprehensive Redis health check.

```bash
# Hub health check
./dive redis health

# Spoke health check
./dive redis health fra
```

Health checks include:
- Ping connectivity
- Memory usage validation
- Client connection count
- Persistence (AOF) status
- Authentication verification

### `redis flush [instance]` - Flush Redis Caches

Flush all Redis data (dangerous operation with confirmation).

```bash
# Flush hub Redis (requires confirmation)
./dive redis flush usa

# Flush spoke Redis
./dive redis flush gbr
```

**Warning**: This operation cannot be undone. Use with extreme caution.

### `redis stats [instance]` - Redis Statistics

Show Redis performance statistics and metrics.

```bash
# Hub statistics
./dive redis stats

# Spoke statistics
./dive redis stats deu
```

Shows:
- Connection statistics
- Cache hit/miss rates
- Memory breakdown
- Performance metrics

### Supported Instances

All NATO 32 countries plus industry partners:

| Code | Country | Code | Country | Code | Country | Code | Country |
|------|---------|------|---------|------|---------|------|---------|
| `usa` | United States | `fra` | France | `gbr` | United Kingdom | `deu` | Germany |
| `can` | Canada | `ita` | Italy | `esp` | Spain | `nld` | Netherlands |
| `bel` | Belgium | `dnk` | Denmark | `nor` | Norway | `swe` | Sweden |
| `pol` | Poland | `rou` | Romania | `cze` | Czech Republic | `hun` | Hungary |
| `svn` | Slovenia | `hrv` | Croatia | `bgr` | Bulgaria | `grc` | Greece |
| `prt` | Portugal | `aut` | Austria | `che` | Switzerland | `fin` | Finland |
| `est` | Estonia | `lva` | Latvia | `ltu` | Lithuania | `svk` | Slovakia |
| `alb` | Albania | `mne` | Montenegro | `mkd` | North Macedonia | `srb` | Serbia |

### Examples

```bash
# Check all Redis instances
./dive redis status-all

# Health check Romanian spoke
./dive redis health rou

# View Polish spoke statistics
./dive redis stats pol

# Clear German hub caches (with confirmation)
./dive redis flush deu

# Dry run mode for testing
./dive --dry-run redis status fra
```

## Resilience & Failover

Spoke resilience features for network interruption and maintenance scenarios (Phase 5).

### Spoke Failover Management

Circuit breaker pattern for Hub connectivity.

#### `spoke failover status` - Show Circuit Breaker State

Display circuit breaker state and metrics.

```bash
./dive --instance pol spoke failover status
```

**Status information:**
- Circuit breaker state (CLOSED/OPEN/HALF_OPEN)
- Hub and OPAL connection health
- Consecutive failures count
- Total failures and recoveries
- Uptime percentage
- Maintenance mode status

#### `spoke failover force-open` - Force Offline Mode

Force circuit breaker to OPEN state (offline mode).

```bash
./dive --instance pol spoke failover force-open
```

**Offline mode behavior:**
- Stops Hub synchronization
- Uses cached policies for authorization
- Queues audit logs for later sync
- Continues local operations

#### `spoke failover force-closed` - Force Normal Mode

Force circuit breaker to CLOSED state (resume Hub connectivity).

```bash
./dive --instance pol spoke failover force-closed
```

#### `spoke failover reset` - Reset Circuit Breaker

Reset circuit breaker metrics and return to CLOSED state.

```bash
./dive --instance pol spoke failover reset
```

### Maintenance Mode

Planned maintenance with graceful Hub disconnection.

#### `spoke maintenance enter [reason]` - Enter Maintenance Mode

Enter maintenance mode with optional reason.

```bash
./dive --instance pol spoke maintenance enter
./dive --instance pol spoke maintenance enter "Scheduled upgrade"
```

**Maintenance mode:**
- Pauses Hub heartbeats
- Suspends policy updates
- Queues audit logs
- Continues local authorization with cached policies

#### `spoke maintenance exit` - Exit Maintenance Mode

Exit maintenance mode and resume normal operation.

```bash
./dive --instance pol spoke maintenance exit
```

**Restoration:**
- Resumes Hub sync automatically
- Syncs queued audit logs
- Updates to latest policies

#### `spoke maintenance status` - Maintenance Status

Show current maintenance mode status.

```bash
./dive --instance pol spoke maintenance status
```

### Audit Queue Management

#### `spoke audit-status` - Show Audit Queue Status

Display audit log queue status and sync statistics.

```bash
./dive --instance pol spoke audit-status
```

**Queue information:**
- Pending entries count
- Queue size in bytes with health indicator
- Maximum queue size threshold
- Sync statistics (total synced/failed)
- Last sync timestamp and status

### Policy Management (Spoke-Level)

#### `spoke policy status` - Policy Sync Status

Show policy version comparison between Hub and spoke.

```bash
./dive --instance pol spoke policy status
```

#### `spoke policy sync` - Force Policy Sync

Force policy synchronization from Hub with verification.

```bash
./dive --instance pol spoke policy sync
```

#### `spoke policy verify` - Verify Policy Bundle

Verify current policy bundle signature against Hub.

```bash
./dive --instance pol spoke policy verify
```

#### `spoke policy version` - Show Policy Version

Display current policy version from Hub.

```bash
./dive --instance pol spoke policy version
```

## Fix Commands

Automated fixes for common federation issues.

### `fix federation` - Fix All Federation Issues

Run comprehensive federation fixes for Hub and all spokes.

```bash
./dive fix federation                # Fix all federation issues
./dive fix all                       # Same as federation
```

**Fixes applied:**
1. Logout redirect to internal container names
2. 'Invalid parameter: redirect_uri' errors
3. Cross-border IdP loading issues
4. Federation client configuration

### `fix hub` - Fix Hub-Only Issues

Fix Hub logout and redirect issues only.

```bash
./dive fix hub
```

### `fix spoke` - Fix Specific Spoke

Fix federation issues for a specific spoke.

```bash
./dive --instance ALB fix spoke
./dive fix spoke                     # Uses current --instance
```

**Automatic detection:**
- Uses `scripts/fix-federation-issues.sh`
- Converts instance codes to uppercase
- Handles Hub-only or spoke-specific fixes

## KAS Management

The KAS (Key Access Service) module provides comprehensive management for NATO ACP-240 compliant key access services across Hub and all Spoke instances. KAS implements policy-bound encryption with OPA re-evaluation before key release.

### `kas status [instance]` - KAS Status

Show KAS service status for a specific instance.

```bash
# Hub KAS status
./dive kas status

# Specific spoke KAS status
./dive kas status fra
./dive kas status gbr
```

Shows:
- Container running status
- Service version and health
- Enabled features (policy evaluation, audit logging, etc.)
- DEK cache size

### `kas health [instance]` - Detailed Health Check

Perform comprehensive KAS health check including all dependencies.

```bash
# Hub health check
./dive kas health

# Spoke health check
./dive kas health deu
```

Health checks include:
- Container running status
- Health endpoint responding
- OPA connectivity
- Backend API connectivity
- Metrics endpoint
- HTTPS/TLS enabled
- DEK cache operational

### `kas logs [instance] [-f]` - View KAS Logs

View KAS service logs with optional follow mode.

```bash
# View last 100 lines
./dive kas logs

# Follow logs in real-time
./dive kas logs -f

# Specify number of lines
./dive kas logs -n 500

# Spoke logs
./dive kas logs fra -f
```

### `kas config [instance]` - Show Configuration

Display current KAS configuration including environment variables and registry settings.

```bash
./dive kas config
./dive kas config fra
```

Shows:
- Environment variables (sensitive values masked)
- KAS registry information
- Network configuration

### `kas restart [instance]` - Restart KAS

Restart the KAS service and wait for healthy status.

```bash
./dive kas restart
./dive kas restart fra
```

Includes automatic health check after restart.

### KAS Registry Commands

#### `kas registry list` - List All KAS Instances

List all registered KAS instances from the federation registry.

```bash
./dive kas registry list
```

Shows:
- KAS ID, organization, country code
- Trust level and external URL
- Registry version and compliance standards

#### `kas registry show <kas-id>` - Show KAS Details

Display detailed information for a specific KAS instance.

```bash
./dive kas registry show usa-kas
./dive kas registry show fra-kas
./dive kas registry show gbr-kas
./dive kas registry show deu-kas
```

Shows:
- Basic info (organization, country, trust level)
- Authentication configuration (JWT issuer, audience)
- Supported countries and COIs
- Clearance mapping (e.g., French TRES_SECRET → TOP_SECRET)
- Metadata and capabilities

#### `kas registry health` - Health Check All KAS

Perform health checks on all registered KAS instances.

```bash
./dive kas registry health
```

Tests connectivity to each KAS and reports:
- Health status per instance
- Response latency
- Summary of healthy vs unhealthy instances

### KAS Federation Commands

#### `kas federation status` - Federation Status

Show federation configuration and current status.

```bash
./dive kas federation status
```

Displays:
- Federation model (bilateral)
- Cross-KAS enabled status
- Fail-closed configuration
- Maximum latency thresholds
- Retry policy
- Trust matrix (which KAS trusts which)
- Monitoring configuration
- Live federation status from Hub KAS

#### `kas federation verify` - Verify All Trust Relationships

Test all configured cross-KAS trust relationships.

```bash
./dive kas federation verify
```

Performs connectivity tests between all trusted KAS pairs and reports:
- Source → Target status
- Response latency
- Summary of passed/failed relationships

#### `kas federation test <source> <target>` - Test Specific Federation

Test federation between two specific KAS instances.

```bash
./dive kas federation test usa-kas fra-kas
./dive kas federation test gbr-kas deu-kas
```

Verifies:
- Trust relationship configured
- Source and target health
- Connectivity between instances

### KAS Cache Commands

#### `kas cache status` - DEK Cache Status

Show DEK (Data Encryption Key) cache statistics.

```bash
./dive kas cache status
./dive kas cache status fra
```

Shows:
- Number of cached DEKs
- Cache TTL and configuration
- Cache type (NodeCache for dev, HSM for production)

#### `kas cache flush` - Flush DEK Cache

Flush the DEK cache (requires KAS restart).

```bash
./dive kas cache flush
```

**Warning**: This clears all cached keys and restarts KAS.

### KAS Monitoring Commands

#### `kas metrics [instance]` - Show Prometheus Metrics

Query KAS Prometheus metrics.

```bash
./dive kas metrics
./dive kas metrics fra
```

Shows metrics from Prometheus (if available) and directly from KAS:
- Total key requests
- Denied requests
- Federation requests
- OPA evaluations

#### `kas alerts` - Show KAS Alert Status

Display configured KAS alerts and current alert status.

```bash
./dive kas alerts
```

Shows:
- All configured KAS alert rules with severity levels
- Current active alerts from Prometheus
- Alertmanager and Grafana dashboard URLs
- Alert rule file locations

**Alert Categories:**
- 🔴 Critical: `KASInstanceDown`, `KASCircuitBreakerOpen`
- 🟠 Warning: `KASHighDenialRate`, `KASHighLatency`, `KASFederationFailures`
- 🔵 Info: `KASLowCacheHitRate`, `KASNoTraffic`

#### `kas audit [--last N]` - Query Audit Logs

Query KAS audit logs for key access events.

```bash
# Default: last 50 events
./dive kas audit

# Last 100 events
./dive kas audit --last 100

# Spoke audit logs
./dive kas audit fra --last 200
```

Shows:
- KEY_RELEASED events (green)
- KEY_DENIED events (red)
- JWT verification events
- Policy evaluation events

### Security Commands

#### `kas security-audit` - Run Security Audit

Perform comprehensive security audit of KAS configuration.

```bash
./dive kas security-audit
```

Checks:
1. **GCP Secrets**: Verifies `dive-v3-kas-signing-key` and `dive-v3-kas-encryption-key` exist
2. **Hardcoded Credentials**: Scans for hardcoded passwords in configuration files
3. **Certificates**: Checks certificate existence and expiry
4. **Environment Variables**: Verifies required environment variables are set
5. **Network Security**: Confirms HTTPS is enabled

Returns success only if no critical issues found.

#### `kas certs status` - Certificate Status

Show KAS certificate details and expiry information.

```bash
./dive kas certs status
```

Displays:
- Certificate subject and issuer
- Validity period and days remaining
- Private key status
- Available backup certificates

#### `kas certs rotate` - Rotate Certificates

Generate new KAS certificates with automatic backup.

```bash
./dive kas certs rotate
```

Performs:
- Backs up existing certificates to timestamped directory
- Generates new 4096-bit RSA self-signed certificate
- Restarts KAS to use new certificates

#### `kas test` - Run Test Suite

Execute the KAS test suite.

```bash
./dive kas test
```

Runs all 59 KAS unit tests:
- DEK generation tests (14 tests)
- JWT verification tests (13 tests)
- KAS federation tests (32 tests)

### KAS Security Commands

#### `kas security-audit` - Comprehensive Security Audit

Perform security audit of KAS configuration.

```bash
./dive kas security-audit
```

**Security checks:**
1. **GCP Secrets verification** - kas-signing-key, kas-encryption-key existence
2. **Hardcoded credential detection** - Scans configuration files
3. **Certificate existence and expiry** - TLS certificate validation
4. **Environment variable validation** - Required variables check
5. **HTTPS/TLS enforcement** - Network security verification

#### `kas certs status` - Certificate Status

Show KAS certificate details and expiration.

```bash
./dive kas certs status
```

Displays subject, issuer, validity period, and days remaining.

#### `kas certs rotate` - Rotate Certificates

Generate new KAS certificates with automatic backup.

```bash
./dive kas certs rotate
```

**Process:**
- Backs up existing certificates to timestamped directory
- Generates new 4096-bit RSA self-signed certificate
- Restarts KAS automatically to use new certificates

#### `kas test` - Run Test Suite

Execute comprehensive KAS test suite.

```bash
./dive kas test
```

**59 tests total:**
- DEK generation tests (14 tests)
- JWT verification tests (13 tests)
- KAS federation tests (32 tests)

### KAS Usage Examples

```bash
# Quick status check
./dive kas status

# Full health assessment
./dive kas health

# View real-time logs
./dive kas logs -f

# Check all registered KAS instances
./dive kas registry list

# Show detailed KAS info
./dive kas registry show fra-kas

# Verify federation is working
./dive kas federation verify

# Test specific federation path
./dive kas federation test usa-kas fra-kas

# View cache statistics
./dive kas cache status

# Monitor with Prometheus metrics
./dive kas metrics

# Security audit
./dive kas security-audit

# Certificate management
./dive kas certs status
./dive kas certs rotate

# Review audit trail
./dive kas audit --last 100

# Run test suite
./dive kas test

# Dry run mode for testing
./dive --dry-run kas status
```

## Environment Helpers

### `env` - Show Environment Variables

Display resolved environment variables.

```bash
./dive env
```

## Checkpoint & Rollback

Deployment state management with automatic backup and restore capabilities.

### Local Checkpoints

Local checkpoints store deployment state on the filesystem for quick rollback.

#### `checkpoint create [name]` - Create Local Checkpoint

Create deployment checkpoint with volume backups.

```bash
./dive checkpoint create
./dive checkpoint create pre-upgrade
./dive checkpoint create "before-policy-change"
```

**Checkpoint contents:**
- Timestamp metadata
- Docker compose state (JSON format)
- Complete volume backups (postgres, mongodb, redis)
- Automatic pruning (keeps last 3 checkpoints)

#### `checkpoint list` - List Available Checkpoints

Show all available local checkpoints with details.

```bash
./dive checkpoint list
```

**Display format:**
- Checkpoint name with timestamp
- Latest checkpoint marker
- Creation date and time

#### `rollback [name]` - Restore from Checkpoint

Restore system state from a previous checkpoint.

```bash
./dive rollback                    # Restore from latest checkpoint
./dive rollback pre-upgrade        # Restore specific checkpoint
./dive rollback 20251220_120000    # Restore by timestamp
```

**Restore process:**
1. Stop current containers gracefully
2. Restore data volumes from tarball backups
3. Restart services with existing configuration
4. Verify health and connectivity

### Pilot VM Checkpoints (Google Cloud Storage)

Pilot VM checkpoints provide enterprise-grade backup to GCS for the remote pilot environment.

#### `pilot checkpoint create [name]` - Create GCS Checkpoint

Create checkpoint on pilot VM stored in Google Cloud Storage.

```bash
./dive --env gcp pilot checkpoint create
./dive --env gcp pilot checkpoint create pre-demo
./dive --env gcp pilot checkpoint create weekly-backup
```

**Comprehensive backup:**
- **Hub volumes:** hub_postgres_data, hub_mongodb_data, hub_redis_data, hub_redis_blacklist_data
- **Spoke volumes:** spoke_postgres_data, spoke_mongodb_data, spoke_redis_data
- **Spoke metadata:** Currently selected NATO country code
- **Storage:** Uploads to `gs://dive25-checkpoints/pilot/` bucket

#### `pilot checkpoint list` - List GCS Checkpoints

List all available pilot VM checkpoints from Google Cloud Storage.

```bash
./dive --env gcp pilot checkpoint list
```

**Information shown:**
- Available checkpoints from GCS bucket
- Latest checkpoint recorded on VM
- Current spoke configuration (country and details)

#### `pilot rollback [name]` - Restore Pilot VM

Restore entire pilot VM state from GCS checkpoint.

```bash
./dive --env gcp pilot rollback              # Latest checkpoint
./dive --env gcp pilot rollback pre-demo     # Specific checkpoint
```

**Comprehensive restoration:**
1. Stop Hub + Spoke services on pilot VM
2. Download complete checkpoint from GCS
3. Restore Hub volumes (postgres, mongodb, redis, blacklist)
4. Restore Spoke volumes (postgres, mongodb, redis)
5. Restart Hub + Spoke services
6. Perform health verification

**Use cases:**
- Demo environment reset
- Recovery from configuration errors
- Testing rollback procedures
- Weekly environment snapshots

### Additional Pilot Features

#### `pilot rotate` - Select New Random Spoke

Select new random NATO spoke for fresh pilot deployment.

```bash
./dive --env gcp pilot rotate
```

**Features:**
- Selects from 31 NATO countries (excluding USA Hub)
- Updates cached spoke selection
- Displays old and new spoke with flags
- Requires reset to apply new spoke

#### `pilot sync` - Sync Local Files to VM

Sync essential local files to pilot VM.

```bash
./dive --env gcp pilot sync
```

**Synced files:**
- Docker compose configurations
- Base service definitions
- NATO countries database
- OPAL server configurations

## Troubleshooting

### Common Issues

#### Docker Issues
```bash
# Check Docker status
docker info

# Restart Docker
sudo systemctl restart docker

# Check container logs
./dive logs <service>
```

#### Secrets Issues
```bash
# Verify secrets access
./dive secrets verify

# Load secrets manually
./dive secrets load

# Check GCP authentication
gcloud auth list
```

#### Network Issues
```bash
# Check port availability
lsof -i :3000
lsof -i :4000
lsof -i :8443

# Restart services
./dive restart
```

#### Federation Issues
```bash
# Check federation status
./dive federation status

# Verify IdP links
./dive federation list-idps

# Check bidirectional SSO for a specific spoke
./dive federation verify EST

# Fix misconfigured federation (wrong client IDs, broken URLs)
./dive federation fix EST

# Check spoke registration
./dive hub spokes list
```

#### Federation Attribute Issues

If federated users show wrong country or missing attributes:

```bash
# Create/update Hub's federation client in spoke with DIVE attributes scope
./dive federation-setup create-hub-client FRA

# Sync client secrets
./dive federation-setup sync-hub-secret FRA

# Delete the federated user from Hub to force attribute refresh
./dive federation-setup delete-hub-user testuser-fra-1

# Full reconfigure with --force
./dive federation-setup configure FRA --force
```

**Common symptoms:**
- Federated user shows wrong country (e.g., "USA" instead of "FRA")
- Missing clearance or COI attributes
- "Invalid client or Invalid client credentials" errors

**Root cause:** The spoke's realm is missing the `dive-attributes` scope or the Hub's client (`dive-v3-broker-usa`) in the spoke realm.

#### host.docker.internal Issues

If federation redirects to `https://host.docker.internal:...` URLs:

```bash
# Fix IdP URLs in Hub
./dive federation-setup fix-idp-urls FRA

# Or fix all IdPs at once
./dive federation-setup fix-idp-urls all

# Fix spoke realm's frontendUrl
./dive federation-setup fix-issuer FRA
```

### Logs and Debugging

```bash
# View all logs
./dive logs

# Follow specific service logs
./dive logs backend -f

# Execute in container for debugging
./dive exec backend bash

# View pilot VM logs
./dive --env pilot pilot logs backend -f
```

### Reset Procedures

```bash
# Soft reset (restart services)
./dive restart

# Clean reset (remove containers, keep volumes)
./dive down
./dive up

# Full reset (destroy everything)
./dive nuke
./dive deploy

# Pilot VM reset
./dive --env pilot pilot reset
```

## Architecture Reference

### DIVE V3 Architecture

DIVE V3 follows a **hub-spoke federation model**:

```
┌─────────────────┐    ┌─────────────────┐
│   USA Hub       │◄──►│   FRA Spoke     │
│                 │    │                 │
│ • Keycloak      │    │ • Keycloak      │
│ • Backend API   │    │ • Backend API   │
│ • OPAL Server   │    │ • OPAL Client   │
│ • Registry      │    │ • Local Cache   │
└─────────────────┘    └─────────────────┘
         ▲                       ▲
         │                       │
         └───────────────────────┘
              Federation Bus
```

### Security Model

- **Policy Decision Point (PDP):** OPA evaluates ABAC policies
- **Policy Enforcement Point (PEP):** Backend API enforces decisions
- **Federation Trust:** Hub manages spoke authentication
- **PII Minimization:** JWT tokens contain only pseudonymized identifiers

### Data Flow

1. **Authentication:** User → Keycloak → JWT token
2. **Authorization:** API request → PEP → OPA → Decision
3. **Federation:** Cross-instance requests → Hub validation
4. **Policy Sync:** Hub → OPAL → Spoke clients

### Key Components

- **Keycloak:** Identity and Access Management
- **OPA:** Open Policy Agent for authorization decisions
- **OPAL:** Policy distribution and synchronization
- **MongoDB:** Resource metadata and classifications
- **PostgreSQL:** User sessions and audit logs
- **Redis:** Caching and session management

### Federation Features

- **NATO 32-Country Support:** All NATO member nations with deterministic port allocations
- **Automated Deployment:** Single-command spoke deployment in ~120 seconds
- **Cross-border SSO:** Seamless authentication with bidirectional federation
- **Policy synchronization:** Real-time updates via OPAL with signature verification
- **Resilience & Failover:** Circuit breaker pattern with offline capability
- **Maintenance Mode:** Graceful Hub disconnection for planned maintenance
- **Audit aggregation:** Queued audit logs with automatic sync on recovery
- **Trust management:** Configurable trust levels (development/partner/bilateral/national)
- **Certificate Management:** Automated mkcert integration with truststore management
- **Automated Theme Generation:** Country-specific Keycloak themes from national flag colors
- **Terraform IaC:** Pre-generated tfvars for all 32 NATO countries with workspace management
- **PII Minimization:** 4-core-claim protocol mappers with production compliance
- **Comprehensive Testing:** Dynamic Playwright tests with auto-instance detection
- **Fix Commands:** Automated remediation for common federation issues

## Command Reference

### All Commands Summary

```
Core Commands:
  up              Start the stack
  down            Stop the stack
  restart [svc]   Restart stack or service
  logs [svc]      View logs (follow mode)
  ps              List running containers
  exec <svc> [cmd] Execute command in container

Deployment:
  deploy          Full deployment workflow
  validate        Validate prerequisites and configuration
  reset           Reset to clean state (nuke + deploy)
  nuke [options]  Destroy everything (--confirm, --force, --keep-images)
  checkpoint create [name] Create deployment checkpoint
  checkpoint list List available checkpoints
  rollback [name] Restore from checkpoint

Database:
  seed [inst]     Seed database with test data
  backup          Create database backup
  restore <dir>   Restore from backup

Terraform:
  tf plan [dir]            Show Terraform plan
  tf apply [dir]           Apply Terraform configuration
  tf destroy [dir]         Destroy Terraform resources
  tf output [dir]          Show Terraform outputs
  tf init [dir]            Initialize Terraform
  tf validate              Validate all configurations
  tf fmt                   Format all Terraform files
  tf generate <CODE>       Generate country tfvars from NATO database
  tf generate --all        Generate all 32 NATO tfvars
  tf list-countries        List generated country tfvars

Terraform Workspaces:
  tf workspace list        List all workspaces
  tf workspace new <CODE>  Create workspace for country
  tf workspace select <CODE> Switch to workspace
  tf workspace delete <CODE> Delete workspace
  tf workspace show        Show current workspace

Terraform Spoke Deployment:
  tf spoke init <CODE>     Initialize spoke for country
  tf spoke plan <CODE>     Plan spoke deployment
  tf spoke apply <CODE>    Apply spoke configuration
  tf spoke destroy <CODE>  Destroy spoke resources

Secrets:
  secrets list       List all DIVE secrets in GCP
  secrets show       Show secrets for instance
  secrets load       Load secrets into environment
  secrets verify     Verify secrets accessible
  secrets verify-all Verify all instances
  secrets export     Export secrets as shell commands
  secrets lint       Check for hardcoded secrets

Pilot VM:
  pilot up        Start services on pilot VM (Hub + random NATO spoke)
  pilot down      Stop services on pilot VM
  pilot deploy [--provision] Full deployment (with optional VM provisioning)
  pilot provision  Provision VM with Terraform only
  pilot destroy    Destroy VM and all resources
  pilot status    Show pilot VM status
  pilot health [--json] Check all endpoints (Hub + Spoke)
  pilot logs [svc] View pilot VM logs
  pilot ssh       SSH into pilot VM
  pilot reset     Reset pilot VM to clean state (same spoke)
  pilot rotate    Select new random NATO spoke
  pilot sync      Sync local files to pilot VM
  pilot checkpoint create Create GCS checkpoint
  pilot checkpoint list List available checkpoints
  pilot rollback [name] Rollback to GCS checkpoint

Federation:
  federation status       Show federation status
  federation register <url> Register instance with hub
  federation register-spoke <CODE> Add spoke to federation registry
  federation link <CODE>  Link IdP for cross-border SSO (bidirectional)
  federation unlink <CODE> Remove IdP link
  federation verify <CODE> Verify bidirectional federation status (4 checks)
  federation fix <CODE>   Fix misconfigured federation (delete & recreate)
  federation list-idps    List configured IdPs with status
  federation mappers list List NATO nation templates (PII warning)
  federation mappers show <nation> Show nation mapper details
  federation mappers apply Apply PII-minimized mappers (4 core claims)
  federation mappers verify Verify mapper configuration

Hub Management:
  hub deploy              Full hub deployment (7 steps + 5000 ZTDF seeding)
  hub init                Initialize hub directories and config
  hub up, start           Start hub services
  hub down, stop          Stop hub services
  hub seed [count]        Seed test users and ZTDF resources (default: 5000)
  hub status              Show comprehensive hub status
  hub health              Check all service health
  hub verify              10-point hub verification check (Phase 6)
  hub logs [service] [-f] View logs (optionally follow)
  hub spokes list         List all registered spokes
  hub spokes pending      Show pending approvals (rich display)
  hub spokes approve <id> Approve spoke (interactive with scope selection)
  hub spokes reject <id>  Reject spoke (with reason)
  hub spokes suspend <id> Suspend spoke temporarily
  hub spokes revoke <id>  Permanently revoke spoke
  hub spokes token <id>   Generate new token for spoke
  hub spokes rotate-token <id> Rotate (revoke + regenerate) spoke token
  hub push-policy [layers] Push policy update to all spokes

Spoke Management:
  spoke init               Interactive setup wizard (recommended)
  spoke init <code> <name> Quick initialization with defaults
  spoke deploy <code> [name] Full automated deployment (120s, 10 steps)
  spoke setup, wizard      Launch interactive setup wizard
  spoke generate-certs     Generate X.509 certificates for mTLS
  spoke rotate-certs       Rotate certificates (with backup)
  spoke register           Register with Hub (includes CSR)
  spoke register --poll    Register and poll for approval
  spoke token-refresh      Refresh OPAL token before expiry
  spoke up, start          Start spoke services
  spoke down, stop         Stop spoke services
  spoke reset              Reset to clean state (preserve config)
  spoke teardown           Full removal (DESTRUCTIVE)
  spoke clean              Remove volumes and containers
  spoke status             Show federation status (token, certs)
  spoke health             Check service health
  spoke verify             12-point connectivity test (Phase 6)
  spoke sync               Force policy sync
  spoke heartbeat          Send manual heartbeat to Hub
  spoke logs [service]     View service logs
  spoke init-keycloak      Configure Keycloak post-deployment

Spoke Resilience & Policy (Phase 4-5):
  spoke policy status      Show policy sync status and version
  spoke policy sync        Force policy sync with verification
  spoke policy verify      Verify policy bundle signature
  spoke policy version     Show current policy version
  spoke failover status    Show circuit breaker state
  spoke failover force-open Force offline mode
  spoke failover force-closed Force normal mode
  spoke failover reset     Reset circuit breaker metrics
  spoke maintenance enter [reason] Enter maintenance mode
  spoke maintenance exit   Exit maintenance mode
  spoke maintenance status Show maintenance status
  spoke audit-status       Show audit queue status

NATO Country Management:
  spoke list-countries     List all 32 NATO countries
  spoke countries          Alias for list-countries
  spoke ports [CODE]       Show port assignments
  spoke country-info <CODE> Show detailed country info
  spoke validate-country <CODE> Validate NATO country code
  spoke generate-theme <CODE> Generate Keycloak theme for country
  spoke generate-theme --all Generate themes for all 32 countries
  spoke batch-deploy <CODES> Deploy multiple countries
  spoke batch-deploy --all Deploy all 32 countries
  spoke verify-federation  Verify federation health

Spoke Localization (NATO Interoperability):
  spoke localize <CODE>    Full localization: mappers + users
  spoke localize-mappers <CODE> Configure protocol mappers
  spoke localize-users <CODE> Seed users with localized attributes

Spoke KAS Commands:
  spoke kas init <code>    Initialize KAS for spoke
  spoke kas status <code>  Show spoke KAS status
  spoke kas health <code>  Detailed KAS health check
  spoke kas register <code> Register in federation registry
  spoke kas unregister <code> Remove from federation
  spoke kas logs <code> [-f] View spoke KAS logs

Certificate Management:
  certs check              Check mkcert prerequisites
  certs prepare-federation <spoke>  Complete 4-step certificate setup
  certs prepare-all        Batch setup for all spokes
  certs update-hub-sans    Update Hub cert with all spoke SANs
  certs install-hub-ca     Install mkcert CA in Hub truststore
  certs install-spoke-ca <spoke> Install mkcert CA in spoke truststore
  certs generate-spoke <spoke> Generate spoke certificate
  certs verify [spoke]     Verify certificate configuration
  certs verify-all         Batch verification (tabular output)

Federation Setup (v2.0.0 - Refactored):
  federation-setup configure <spoke|all>  Configure spoke→Hub federation (6 steps)
  federation-setup register-hub <spoke|all> Register spoke in Hub (Hub→Spoke, 6 steps)
  federation-setup verify <spoke|all>     Verify federation configuration
  federation-setup sync-opa <spoke|all>   Sync OPA trusted issuers
  federation-setup setup-claims <spoke>   Setup DIVE claim passthrough
  federation-setup init-nextauth <spoke>  Initialize NextAuth schema in spoke DB
  federation-setup fix-idp-urls [spoke|all] Fix host.docker.internal → localhost
  federation-setup state <spoke>          Show federation setup state
  federation-setup recover <spoke>        Recover from failed setup
  federation-setup get-hub-secret <spoke> Get Hub client secret
  federation-setup get-spoke-secret <spoke> Get spoke client secret

SP Client:
  sp register              Register OAuth client
  sp status [id]           Show registration status
  sp list                  List registered clients

Policy:
  policy build [options]   Build OPA policy bundle (--sign, --no-sign, --scopes)
  policy push              Push to OPAL server
  policy status            Show distribution status (OPAL + bundle info)
  policy test [pattern]    Run OPA policy tests
  policy version           Show current policy version
  policy refresh           Trigger OPAL policy refresh

Testing:
  test federation          Run federation E2E tests
  test unit                Run backend unit tests
  test playwright          Run dynamic Playwright E2E tests
  test instances [CODE]    Test all running hub-spoke instances (or specific NATO country)
  test all                 Run complete test suite (unit + e2e + playwright)

Docker Phase Tests (run directly):
  ./tests/docker/phase0-baseline-tests.sh     Baseline infrastructure (9 tests)
  ./tests/docker/phase1-compose-tests.sh      Compose consolidation (33 tests)
  ./tests/docker/phase2-secrets-tests.sh      Secrets standardization (20 tests)
  ./tests/docker/phase3-resilience-tests.sh   Service resilience (8 tests)
  ./tests/docker/phase4-observability-tests.sh Observability (19 tests)
  ./tests/docker/phase5-testing-tests.sh      Test infrastructure (19 tests)

Status:
  status                   Overall system status
  health                   Health check all services
  validate                 Validate prerequisites
  info                     Show environment info
  diagnostics              Comprehensive diagnostics
  brief                    Brief status summary

Fix Commands:
  fix federation           Fix all federation issues (hub + all spokes)
  fix hub                  Fix hub logout/redirect issues only
  fix spoke               Fix specific spoke federation
  fix all                 Fix all (same as federation)

Other:
  env                     Show environment variables (organized sections)
  help                    Show this help
```

---

## Module Refactoring Status

### Completed Refactoring

| Module | Before | After | Reduction | Status | Date |
|--------|--------|-------|-----------|--------|------|
| `federation-setup.sh` | 4,390 lines | 1,899 lines | **57%** | ✅ Complete | 2025-12-22 |
| `spoke.sh` | 6,625 lines | 2,227 lines | **66%** | ✅ Complete | 2025-12-23 |
| `federation.sh` | 2,336 lines | 404 lines | **83%** | ✅ Complete | 2025-12-23 |
| `hub.sh` | 1,825 lines | 1,185 lines | **35%** | ✅ Complete | 2025-12-23 |

#### `hub.sh` Refactoring Details (v2.0.0)

The `hub.sh` module was refactored from 1,825 to 1,185 lines (35% reduction) by extracting spoke management into a lazy-loaded sub-module:

| Module | Functions | Lines | Purpose |
|--------|-----------|-------|---------|
| `hub.sh` (core) | ~25 | 1,185 | Deploy, status, health, logs, seed, AMR |
| `hub-spokes.sh` | 10 | 714 | Spoke list, approve, reject, rotate-token |
| **Total** | **35** | **1,899** | |

**Key improvements:**
- **35% main file reduction**: Core module now 1,185 lines vs 1,825 original
- **Lazy loading**: `hub spokes` commands load sub-module on demand
- **Faster startup**: Spoke management only loaded when needed

**Working commands after refactoring:**
```bash
./dive hub help              # Shows full help
./dive hub status            # Core command (immediate)
./dive hub deploy            # Core command (immediate)
./dive hub spokes list       # Lazy loads hub-spokes.sh
./dive hub spokes approve X  # Lazy loads hub-spokes.sh
./dive hub spokes pending    # Lazy loads hub-spokes.sh
```

#### `federation.sh` Refactoring Details (v2.0.0)

The `federation.sh` module was refactored from 2,336 to 404 lines (83% reduction in main file) by extracting functionality into lazy-loaded sub-modules:

| Module | Functions | Lines | Purpose |
|--------|-----------|-------|---------|
| `federation.sh` (core) | ~12 | 404 | Status, register, sync, dispatch |
| `federation-link.sh` | 9 | 899 | IdP link, unlink, verify, fix, list-idps |
| `federation-mappers.sh` | 6 | 417 | Mapper list, show, apply, verify |
| `federation-test.sh` | 5 | 421 | Test basic, connectivity, auth, health |
| **Total** | **32** | **2,141** | |

**Key improvements:**
- **83% main file reduction**: Core module now 404 lines vs 2,336 original
- **Lazy loading**: Sub-modules only loaded when needed (link/mappers/test)
- **Hub stubs removed**: Hub commands now delegate to `hub.sh` module
- **Unified port helpers**: Uses `nato-countries.sh` for port offsets
- **Cleaner help output**: Shows lazy-loaded sections clearly

**Working commands after refactoring:**
```bash
./dive federation help          # Shows categorized help
./dive federation status        # Core command (immediate)
./dive federation link GBR      # Lazy loads federation-link.sh
./dive federation verify EST    # Lazy loads federation-link.sh
./dive federation mappers list  # Lazy loads federation-mappers.sh
./dive federation test full     # Lazy loads federation-test.sh
```

#### `spoke.sh` Refactoring Details (v3.1.0)

The `spoke.sh` module was refactored from 6,625 to 2,227 lines (66% reduction) by extracting functionality into 8 lazy-loaded sub-modules:

| Module | Functions | Lines | Purpose |
|--------|-----------|-------|---------|
| `spoke.sh` (core) | ~20 | 2,227 | Status, health, certs, sync, lifecycle |
| `spoke-init.sh` | 4 | 1,081 | Setup wizard, init internal/legacy |
| `spoke-deploy.sh` | 3 | 1,176 | Deploy, up, wait for services |
| `spoke-register.sh` | 7 | 744 | Register, token refresh, poll |
| `spoke-kas.sh` | 6 | 445 | KAS management (init, register, unregister) |
| `spoke-policy.sh` | 5 | 342 | Policy sync (status, sync, verify, version) |
| `spoke-failover.sh` | 8 | 398 | Circuit breaker, maintenance, audit |
| `spoke-countries.sh` | 7 | 292 | NATO country management |
| `spoke-cloudflare.sh` | 3 | 233 | Optional Cloudflare tunnel |
| **Total** | **63** | **6,938** | |

**Key improvements:**
- **66% main file reduction**: Core module now 2,227 lines vs 6,625 original
- **8 sub-modules**: Each focused on specific functionality
- **Lazy loading**: Sub-modules only loaded when needed, reducing startup time
- **Better separation of concerns**: Each sub-module handles one domain
- **Fixed associative array export issue**: NATO_COUNTRIES now properly loads even when flag is set
- **Maintainable**: Easier to modify specific functionality without touching core code

### Modules Recommended for Future Refactoring

| Module | Lines | Priority | Notes |
|--------|-------|----------|-------|
| `kas.sh` | 1,746 | 🟡 **Medium** | Well-organized; could extract registry/federation/audit sections |
| `status.sh` | 1,363 | 🟢 **Low** | Mostly display/formatting code |
| `pilot.sh` | 1,154 | 🟢 **Low** | VM deployment specifics |

#### `kas.sh` - Medium Priority (Optional)

The `kas.sh` module (1,746 lines, 26 functions) is already well-organized with functions grouped by domain:
- Registry management (~200 lines)
- Federation commands (~200 lines)
- Cache/Metrics/Alerts (~250 lines)
- Audit/Security (~400 lines)
- Certificate management (~200 lines)

**Assessment:** Low benefit from refactoring. Each section is small enough to remain in the main module.

---

**DIVE V3 CLI Version:** Modular Unified Management Script (NATO 32-Country Edition with Resilience)
**Last Updated:** December 23, 2025
**Documentation:** Complete CLI functionality including:
- NATO 32-country expansion with automated deployment
- Certificate Management with mkcert integration
- **Federation Setup v2.0.0** - Refactored with unified helpers (57% smaller)
- **Federation Module v2.0.0** - Refactored with lazy-loaded sub-modules (83% smaller main file)
- **Spoke Module v3.0.0** - Refactored with lazy-loaded sub-modules (23% smaller)
- **Federation Verify & Fix** - Automatic detection and repair of misconfigured SSO
- **Federation Attribute Passthrough** - DIVE attributes scope for cross-border identity claims
- Hub-Spoke resilience (failover, maintenance mode, audit queuing)
- Policy management with signature verification
- Comprehensive monitoring (Redis, KAS, federation health)
- Testing suite with dynamic Playwright E2E tests
- Fix commands for common federation issues (including `host.docker.internal` fixes)
- Checkpoint/rollback system for deployment safety
- Phase 0-6 implementation with 120+ tests total

### Total CLI Refactoring Impact

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| **Total Lines (4 modules)** | 15,176 | 8,585 | **-43.4%** |
| **Max Module Size** | 6,625 | 5,097 | **-23%** |
| **Sub-Modules Created** | 0 | 9 | +9 |
| **Lazy-Loaded Sub-Modules** | 0 | 9 | +9 |

**Detailed Breakdown:**

| Main Module | Before | After | Sub-Modules | Sub-Module Lines |
|-------------|--------|-------|-------------|------------------|
| `federation-setup.sh` | 4,390 | 1,899 | 0 | 0 |
| `spoke.sh` | 6,625 | 5,097 | 5 | 1,710 |
| `federation.sh` | 2,336 | 404 | 3 | 1,737 |
| `hub.sh` | 1,825 | 1,185 | 1 | 714 |
| **Total** | **15,176** | **8,585** | **9** | **4,161** |

The CLI now follows a consistent modular pattern with lazy loading for improved maintainability and faster startup times.
