# DIVE V3 Hub-Spoke 101: Step-by-Step Deployment Guide

**Version**: 1.0  
**Date**: 2025-12-05  
**Audience**: Operators deploying DIVE V3 federation  
**Time Required**: ~2-3 hours for complete hub + spoke deployment

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Part 1: Understanding the Model](#part-1-understanding-the-model)
3. [Part 2: Deploying the Hub](#part-2-deploying-the-hub)
4. [Part 3: Deploying a Spoke](#part-3-deploying-a-spoke)
5. [Part 4: Registering the Spoke with the Hub](#part-4-registering-the-spoke-with-the-hub)
6. [Part 5: Verifying the Federation](#part-5-verifying-the-federation)
7. [Part 6: Operating the Federation](#part-6-operating-the-federation)
8. [Quick Reference](#quick-reference)

---

## Prerequisites

### Required Software

| Software | Version | Check Command |
|----------|---------|---------------|
| Docker | 24.0+ | `docker --version` |
| Docker Compose | 2.20+ | `docker compose version` |
| Git | 2.30+ | `git --version` |
| Bash | 4.0+ | `bash --version` |
| curl | 7.0+ | `curl --version` |
| openssl | 1.1+ | `openssl version` |

### Recommended

| Software | Purpose |
|----------|---------|
| `jq` | JSON parsing |
| `gcloud` CLI | GCP secrets management |
| `terraform` | Infrastructure as code |

### Network Requirements

| Port | Protocol | Purpose |
|------|----------|---------|
| 3000 | HTTPS | Frontend |
| 4000 | HTTPS | Backend API |
| 7002 | WSS | OPAL Server (Hub only) |
| 8080/8443 | HTTP/HTTPS | Keycloak |
| 8181 | HTTP | OPA |

### Clone the Repository

```bash
git clone https://github.com/dive25/DIVE-V3.git
cd DIVE-V3
```

---

## Part 1: Understanding the Model

### What You're Building

```
┌────────────────────────────────────────────────────────────────────────────┐
│                              YOUR DEPLOYMENT                                │
│                                                                            │
│  ┌────────────────────────────────────────────────────────────────────┐   │
│  │                           HUB (USA)                                  │   │
│  │                                                                      │   │
│  │  • Policy Authority (OPAL Server)                                   │   │
│  │  • Spoke Registry (tracks all partners)                             │   │
│  │  • Central IdP (Keycloak broker)                                    │   │
│  │  • Reference implementation                                          │   │
│  │                                                                      │   │
│  └───────────────────────────────┬──────────────────────────────────────┘   │
│                                  │                                          │
│                      Policy Distribution                                    │
│                       (WebSocket/HTTPS)                                     │
│                                  │                                          │
│  ┌────────────────────────────────┴───────────────────────────────────┐    │
│  │                                                                     │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐│    │
│  │  │ SPOKE: FRA  │  │ SPOKE: GBR  │  │ SPOKE: DEU  │  │ SPOKE: NZL  ││    │
│  │  │ (France)    │  │ (UK)        │  │ (Germany)   │  │ (NZ)        ││    │
│  │  │             │  │             │  │             │  │             ││    │
│  │  │ • Local OPA │  │ • Local OPA │  │ • Local OPA │  │ • Local OPA ││    │
│  │  │ • Local KC  │  │ • Local KC  │  │ • Local KC  │  │ • Local KC  ││    │
│  │  │ • Local KAS │  │ • Local KAS │  │ • Local KAS │  │ • Local KAS ││    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘│    │
│  │                                                                     │    │
│  │                         PARTNER SPOKES                              │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

### Key Concepts

#### The Hub
- **What**: Central coordinator for the federation
- **Who runs it**: The primary federation operator (e.g., USA)
- **Responsibilities**:
  - Distribute authorization policies to all spokes
  - Register and approve new spokes
  - Maintain the policy source of truth
  - Aggregate audit logs from spokes

#### The Spoke
- **What**: A partner's instance of DIVE
- **Who runs it**: Each coalition partner (e.g., France, UK, Germany)
- **Responsibilities**:
  - Enforce authorization policies locally
  - Authenticate users via local Keycloak
  - Protect local data with KAS
  - Operate independently when disconnected from hub

#### The Connection
- **OPAL Server (Hub)**: Publishes policy updates
- **OPAL Client (Spoke)**: Subscribes to policy updates
- **Protocol**: WebSocket over TLS
- **Authentication**: JWT tokens issued by hub

---

## Part 2: Deploying the Hub

The hub is typically the USA instance in DIVE V3. Let's deploy it step by step.

### Step 2.1: Verify the Repository Structure

```bash
cd DIVE-V3

# Verify the dive CLI exists
ls -la dive

# Make it executable if needed
chmod +x dive

# Verify modules exist
ls scripts/dive-modules/
```

Expected output:
```
common.sh    core.sh      db.sh        deploy.sh    federation.sh
help.sh      pilot.sh     policy.sh    secrets.sh   sp.sh
spoke.sh     status.sh    terraform.sh
```

### Step 2.2: Check Prerequisites

```bash
# Run the validation check
./dive validate
```

This checks:
- Docker is running
- Required ports are available
- SSL certificates exist
- Configuration is valid

### Step 2.3: Generate SSL Certificates

If certificates don't exist:

```bash
# Generate development certificates
./scripts/generate-dev-certs.sh

# Verify certificates
ls -la keycloak/certs/
```

Expected files:
```
certificate.pem
key.pem
```

### Step 2.4: Configure Environment

```bash
# For local development (uses default passwords)
export DIVE_ENV=local
export DIVE_INSTANCE=usa

# For GCP (uses Secret Manager)
# export DIVE_ENV=gcp
# ./dive secrets load
```

### Step 2.5: Start the Hub

```bash
# Preview what will happen (dry-run)
./dive --dry-run up

# Actually start services
./dive up
```

This starts:
1. **PostgreSQL** - Keycloak database
2. **MongoDB** - Resource metadata
3. **Redis** - Session cache
4. **Keycloak** - Identity provider
5. **OPA** - Policy engine
6. **Backend** - API server
7. **Frontend** - Web UI

### Step 2.6: Wait for Services to Start

```bash
# Watch the startup progress
./dive logs -f

# Or check status periodically
./dive status

# Check health
./dive health
```

Wait until all services show healthy (typically 2-3 minutes).

### Step 2.7: Verify Hub is Running

```bash
# Check all services
./dive ps

# Expected output:
# NAME                    STATUS         PORTS
# dive-v3-postgres-usa    Up (healthy)   5433->5432
# dive-v3-mongodb-usa     Up (healthy)   27017->27017
# dive-v3-redis-usa       Up (healthy)   6379->6379
# dive-v3-keycloak-usa    Up (healthy)   8443->8443, 8080->8080
# dive-v3-opa-usa         Up (healthy)   8181->8181
# dive-v3-backend-usa     Up (healthy)   4000->4000
# dive-v3-frontend-usa    Up             3000->3000
```

### Step 2.8: Access the Hub

| Service | URL | Credentials |
|---------|-----|-------------|
| Frontend | http://localhost:3000 | Login via Keycloak |
| Keycloak Admin | http://localhost:8080/admin | admin / admin |
| Backend API | http://localhost:4000/health | N/A |
| OPA | http://localhost:8181/health | N/A |

### Step 2.9: Verify Hub Components

```bash
# Check Keycloak is responding
curl -s http://localhost:8080/health | jq .

# Check OPA is loaded with policies
curl -s http://localhost:8181/v1/policies | jq '.result | length'

# Check backend API
curl -s http://localhost:4000/health | jq .
```

### 🎉 Hub Deployment Complete!

You now have a functioning DIVE hub. Next, we'll deploy a spoke.

---

## Part 3: Deploying a Spoke

Let's deploy a spoke for New Zealand (NZL) as an example.

### Step 3.1: Initialize the Spoke

```bash
# Create spoke configuration
./dive spoke init NZL "New Zealand Defence Force"
```

This creates:
```
instances/nzl/
├── config.json           # Spoke identity and configuration
├── docker-compose.yml    # Docker services for this spoke
├── .env.template         # Environment template
├── certs/                # SSL certificates (to be generated)
├── cache/
│   ├── policies/         # Cached OPA policies
│   └── audit/            # Queued audit logs
├── cloudflared/          # Cloudflare tunnel config
└── logs/                 # Service logs
```

### Step 3.2: Review the Configuration

```bash
# View the generated config
cat instances/nzl/config.json | jq .
```

Key fields to note:
```json
{
  "identity": {
    "spokeId": "spoke-nzl-7f3c2d1e",
    "instanceCode": "NZL",
    "name": "New Zealand Defence Force"
  },
  "endpoints": {
    "hubUrl": "https://hub.dive25.com",
    "baseUrl": "https://nzl-app.dive25.com"
  },
  "federation": {
    "status": "unregistered"
  }
}
```

### Step 3.3: Generate Certificates

```bash
# Generate X.509 certificates for the spoke
./dive spoke generate-certs
```

This creates:
```
instances/nzl/certs/
├── spoke.key    # Private key (keep secure!)
├── spoke.crt    # Self-signed certificate
└── spoke.csr    # Certificate Signing Request
```

Output:
```
✅ Certificates generated successfully!

Certificate Details:
  Subject:     CN=spoke-nzl-7f3c2d1e
  Fingerprint: SHA256:AB:CD:12:34:...
  Valid For:   365 days

Files Created:
  - instances/nzl/certs/spoke.key (private key - keep secure!)
  - instances/nzl/certs/spoke.crt (self-signed certificate)
  - instances/nzl/certs/spoke.csr (CSR for Hub signing)
```

### Step 3.4: Configure Environment Variables

```bash
# Copy the template
cp instances/nzl/.env.template instances/nzl/.env

# Edit the .env file
nano instances/nzl/.env
```

Required values:
```bash
# Database Passwords (generate secure passwords!)
POSTGRES_PASSWORD=NZL-Postgres-2025!SecurePass
MONGO_PASSWORD=NZL-Mongo-2025!SecurePass

# Keycloak Admin
KEYCLOAK_ADMIN_PASSWORD=NZL-Keycloak-2025!Admin

# Auth Secrets (generate with: openssl rand -base64 32)
AUTH_SECRET=<generated-secret>
KEYCLOAK_CLIENT_SECRET=<from-keycloak-after-setup>

# Hub Connection (will be filled after registration)
HUB_URL=https://hub.dive25.com
HUB_OPAL_URL=https://hub.dive25.com:7002
SPOKE_OPAL_TOKEN=<received-after-registration-approval>

# Instance Configuration
INSTANCE_CODE=NZL
SPOKE_ID=spoke-nzl-7f3c2d1e
```

### Step 3.5: Update Contact Email

Edit the config.json to add your contact email:

```bash
# Edit config.json
nano instances/nzl/config.json
```

Add:
```json
{
  "identity": {
    ...
    "contactEmail": "admin@nzdf.mil.nz"
  }
}
```

### Step 3.6: Review the Docker Compose File

```bash
# View the generated docker-compose.yml
cat instances/nzl/docker-compose.yml
```

Key services defined:
- `postgres-nzl` - Keycloak database
- `mongodb-nzl` - Resource metadata
- `redis-nzl` - Session cache
- `keycloak-nzl` - Local identity provider
- `opa-nzl` - Local policy engine
- `opal-client-nzl` - Policy sync from hub
- `backend-nzl` - API server
- `frontend-nzl` - Web UI

### Step 3.7: Check Spoke Status

```bash
# View current spoke status
./dive --instance nzl spoke status
```

Output:
```
╔════════════════════════════════════════════════════════════════════════╗
║                         DIVE V3 CLI                                    ║
║          Environment: LOCAL  | Instance: NZL                           ║
╚════════════════════════════════════════════════════════════════════════╝

Spoke Federation Status: NZL

Identity:
  Spoke ID:        spoke-nzl-7f3c2d1e
  Instance Code:   NZL
  Name:            New Zealand Defence Force
  Created:         2025-12-05T10:30:00Z

Federation:
  Status:          unregistered
  Hub URL:         https://hub.dive25.com
  Token:           Not Set

Certificates:
  Certificate:     Present
  Expires:         Dec 05 2026
  Fingerprint:     SHA256:AB:CD:12:34...
```

---

## Part 4: Registering the Spoke with the Hub

Now we need to register the spoke with the hub and wait for approval.

### Step 4.1: Submit Registration

```bash
# Register the spoke with the hub
./dive --instance nzl spoke register
```

The command:
1. Reads the spoke configuration
2. Extracts the certificate
3. Sends registration request to hub
4. Receives a pending status

Output:
```
╔════════════════════════════════════════════════════════════════════════╗
║                         DIVE V3 CLI                                    ║
║          Environment: LOCAL  | Instance: NZL                           ║
╚════════════════════════════════════════════════════════════════════════╝

Registering Spoke with Hub

  Spoke ID:     spoke-nzl-7f3c2d1e
  Instance:     NZL
  Name:         New Zealand Defence Force
  Hub URL:      https://hub.dive25.com

ℹ Certificate found: instances/nzl/certs/spoke.crt
→ Submitting registration to: https://hub.dive25.com/api/federation/register

✅ Registration request submitted!

Registration Details:
  Spoke ID:  spoke-nzl-7f3c2d1e
  Status:    pending

⏳ Waiting for Hub admin approval...
   You will receive notification at: admin@nzdf.mil.nz

   Once approved:
   1. You'll receive a spoke token
   2. Add it to .env: SPOKE_OPAL_TOKEN=<token>
   3. Start services: ./dive spoke up
```

### Step 4.2: Hub Admin Approval (Hub Side)

On the hub system, an administrator reviews and approves the registration:

```bash
# View pending registrations (on hub)
./dive hub instances --pending

# Or via the admin API
curl -X GET https://hub.dive25.com/api/admin/spokes?status=pending \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq .

# Approve the spoke
curl -X POST https://hub.dive25.com/api/admin/spokes/spoke-nzl-7f3c2d1e/approve \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "scopes": ["policy:base", "policy:nzl", "data:federation_matrix"],
    "trustLevel": "bilateral",
    "maxClassification": "SECRET"
  }'
```

### Step 4.3: Receive the Token

After approval, the spoke operator receives:
1. Email notification
2. Spoke token (JWT)

```bash
# Add the token to your .env file
echo "SPOKE_OPAL_TOKEN=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..." >> instances/nzl/.env
```

### Step 4.4: Verify Token

```bash
# Decode the token (don't share the actual token!)
echo $SPOKE_OPAL_TOKEN | cut -d'.' -f2 | base64 -d | jq .
```

Expected claims:
```json
{
  "sub": "spoke-nzl-7f3c2d1e",
  "iss": "hub.dive25.com",
  "aud": "opal.dive25.com",
  "scopes": [
    "policy:base",
    "policy:nzl",
    "data:federation_matrix"
  ],
  "trust_level": "bilateral",
  "max_classification": "SECRET",
  "exp": 1733426400
}
```

### Step 4.5: Start the Spoke

```bash
# Start all spoke services
./dive --instance nzl spoke up
```

Output:
```
╔════════════════════════════════════════════════════════════════════════╗
║                         DIVE V3 CLI                                    ║
║          Environment: LOCAL  | Instance: NZL                           ║
╚════════════════════════════════════════════════════════════════════════╝

Starting Spoke Services: NZL

[+] Building 0.0s (0/0)
[+] Running 7/7
 ✔ Container dive-v3-postgres-nzl    Healthy
 ✔ Container dive-v3-mongodb-nzl     Healthy
 ✔ Container dive-v3-redis-nzl       Healthy
 ✔ Container dive-v3-keycloak-nzl    Healthy
 ✔ Container dive-v3-opa-nzl         Healthy
 ✔ Container dive-v3-opal-client-nzl Healthy
 ✔ Container dive-v3-backend-nzl     Healthy
 ✔ Container dive-v3-frontend-nzl    Started

✅ Spoke services started

  View logs:    ./dive spoke logs
  Check health: ./dive spoke health
```

### Step 4.6: Verify OPAL Connection

```bash
# Check that OPAL client connected to hub
./dive --instance nzl spoke health
```

Output:
```
Spoke Service Health: NZL

Services:
  OPA:            ✓ Healthy
  OPAL-Client:    ✓ Healthy
  Backend:        ✓ Healthy
  Keycloak:       ✓ Healthy
  MongoDB:        ✓ Healthy
  Redis:          ✓ Healthy

✓ All services healthy
```

---

## Part 5: Verifying the Federation

### Step 5.1: Check Policy Sync

```bash
# On the spoke, verify policies were received
curl -s http://localhost:8181/v1/policies | jq '.result | length'

# Should return a number > 0 indicating policies are loaded
```

### Step 5.2: Test Authorization Decision

```bash
# Send a test authorization request to the spoke's OPA
curl -s -X POST http://localhost:8181/v1/data/dive/authorization/allow \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "subject": {
        "uniqueID": "test.user@nzdf.mil.nz",
        "clearance": "SECRET",
        "countryOfAffiliation": "NZL"
      },
      "resource": {
        "resourceId": "doc-001",
        "classification": "CONFIDENTIAL",
        "releasabilityTo": ["NZL", "USA", "GBR"]
      },
      "action": "read"
    }
  }' | jq .
```

Expected response:
```json
{
  "result": true
}
```

### Step 5.3: Verify Heartbeat

```bash
# Send a heartbeat to the hub
./dive --instance nzl spoke heartbeat
```

Output:
```
→ Sending heartbeat to Hub: https://hub.dive25.com
✅ Heartbeat sent successfully
  Sync Status: in_sync
```

### Step 5.4: Check Federation Status

```bash
# On the hub, verify the spoke is showing as connected
./dive federation status
```

Output:
```
Federation Status:

  Registered Instances:
    USA: https://usa-app.dive25.com (hub)
    FRA: https://fra-app.dive25.com (connected)
    GBR: https://gbr-app.dive25.com (connected)
    DEU: https://deu-app.dive25.com (connected)
    NZL: https://nzl-app.dive25.com (connected) ← NEW!
```

### Step 5.5: Test User Flow (End-to-End)

1. Navigate to `https://nzl-app.dive25.com` (or `http://localhost:3000` for local)
2. Click "Login"
3. Select identity provider
4. Authenticate
5. Navigate to "Resources"
6. Verify you can see resources based on your clearance

---

## Part 6: Operating the Federation

### Daily Operations

#### Check Health

```bash
# Hub
./dive health

# Spoke
./dive --instance nzl spoke health
```

#### View Logs

```bash
# Hub - all services
./dive logs

# Hub - specific service
./dive logs backend

# Spoke - all services
./dive --instance nzl spoke logs

# Spoke - specific service
./dive --instance nzl spoke logs opal-client
```

#### Force Policy Sync

```bash
# On hub - push to all spokes
./dive hub push-policy

# On spoke - pull from hub
./dive --instance nzl spoke sync
```

### Policy Updates

When policies change:

```bash
# 1. Build new bundle (on hub)
./dive policy build --sign

# 2. Push to OPAL Server
./dive policy push

# 3. Spokes automatically receive updates via WebSocket

# 4. Verify on spoke
./dive --instance nzl policy status
```

### Handling Disconnection

If the spoke loses connection to the hub:

```bash
# Check failover status
./dive --instance nzl spoke failover status

# Output:
# Circuit Breaker State:
#   State:             ⚠ HALF_OPEN
#   
# Connection Health:
#   Hub Connection:    ✗ Unhealthy
#   OPAL Connection:   ✗ Unhealthy
#
# The spoke is testing Hub connectivity.
# If successful, will transition to CLOSED.
```

The spoke continues operating with cached policies.

### Planned Maintenance

```bash
# Enter maintenance mode before upgrades
./dive --instance nzl spoke maintenance enter "Scheduled upgrade to v2.1"

# Perform maintenance...

# Exit maintenance mode
./dive --instance nzl spoke maintenance exit
```

### Stopping Services

```bash
# Spoke
./dive --instance nzl spoke down

# Hub
./dive down
```

### Restarting Services

```bash
# Hub
./dive restart

# Spoke
./dive --instance nzl spoke down
./dive --instance nzl spoke up

# Or restart specific service
docker restart dive-v3-opal-client-nzl
```

---

## Quick Reference

### Cheat Sheet

```bash
# ═══════════════════════════════════════════════════════════════════════════
# HUB COMMANDS
# ═══════════════════════════════════════════════════════════════════════════

./dive up                          # Start hub
./dive down                        # Stop hub
./dive status                      # Check status
./dive health                      # Health check
./dive logs [service]              # View logs
./dive hub push-policy             # Push policies to all spokes

# ═══════════════════════════════════════════════════════════════════════════
# SPOKE COMMANDS (use --instance <code> for each spoke)
# ═══════════════════════════════════════════════════════════════════════════

./dive spoke init NZL "Name"       # Initialize spoke
./dive spoke generate-certs        # Generate certificates
./dive spoke register              # Register with hub
./dive spoke up                    # Start spoke
./dive spoke down                  # Stop spoke
./dive spoke status                # Federation status
./dive spoke health                # Service health
./dive spoke logs [service]        # View logs
./dive spoke sync                  # Force policy sync
./dive spoke heartbeat             # Send heartbeat

# ═══════════════════════════════════════════════════════════════════════════
# RESILIENCE COMMANDS
# ═══════════════════════════════════════════════════════════════════════════

./dive spoke failover status       # Circuit breaker state
./dive spoke failover force-open   # Force offline mode
./dive spoke failover force-closed # Force normal mode
./dive spoke maintenance enter "reason"  # Enter maintenance
./dive spoke maintenance exit      # Exit maintenance
./dive spoke audit-status          # Audit queue status

# ═══════════════════════════════════════════════════════════════════════════
# POLICY COMMANDS
# ═══════════════════════════════════════════════════════════════════════════

./dive policy build --sign         # Build signed bundle
./dive policy push                 # Push to OPAL
./dive policy status               # Distribution status
./dive policy test                 # Run OPA tests
```

### Default Ports

| Service | Hub Port | Spoke Port |
|---------|----------|------------|
| Frontend | 3000 | 3000 |
| Backend | 4000 | 4000 |
| Keycloak HTTPS | 8443 | 8443 |
| Keycloak HTTP | 8080 | 8080 |
| OPA | 8181 | 8181 |
| OPAL Server | 7002 | N/A |
| OPAL Client | N/A | 7000 |
| MongoDB | 27017 | 27017 |
| PostgreSQL | 5432 | 5432 |
| Redis | 6379 | 6379 |

### Configuration Files

| File | Purpose |
|------|---------|
| `dive` | Main CLI entry point |
| `docker-compose.yml` | Hub services |
| `instances/<code>/docker-compose.yml` | Spoke services |
| `instances/<code>/config.json` | Spoke configuration |
| `instances/<code>/.env` | Spoke secrets |
| `policies/` | OPA/Rego policies |

### Troubleshooting Quick Guide

| Symptom | Check | Fix |
|---------|-------|-----|
| Can't start | `./dive validate` | Fix prerequisites |
| Services unhealthy | `./dive logs <svc>` | Check logs |
| Policies not syncing | `./dive spoke health` | Check OPAL client |
| Auth failing | Keycloak admin console | Check realm config |
| Hub unreachable | `curl hub:7002/healthcheck` | Check network/firewall |

---

## Next Steps

Now that you have a working hub and spoke:

1. **Add more spokes**: Repeat Part 3-4 for additional partners
2. **Configure policies**: Edit files in `policies/` directory
3. **Set up monitoring**: Deploy Grafana dashboards
4. **Enable production security**: Use GCP secrets, proper certificates
5. **Configure Cloudflare tunnels**: For public access

### Related Documentation

- [Hub-Spoke Architecture](./HUB_SPOKE_ARCHITECTURE.md) - Detailed architecture
- [Partner Onboarding Guide](./PARTNER-ONBOARDING-GUIDE.md) - Full onboarding process
- [Security Model](./SECURE-DEPLOYMENT.md) - Production security
- [Pilot Runbook](./PILOT-RUNBOOK.md) - Operations guide

