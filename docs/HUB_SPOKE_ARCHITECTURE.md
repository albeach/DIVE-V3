# DIVE V3 Hub-Spoke Federation Architecture

**Version**: 2.0  
**Date**: 2025-12-05  
**Status**: Production Ready  

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture Concepts](#architecture-concepts)
3. [Component Deep Dive](#component-deep-dive)
4. [Data Flows](#data-flows)
5. [CLI Reference](#cli-reference)
6. [Configuration Reference](#configuration-reference)
7. [Security Model](#security-model)
8. [Resilience & Failover](#resilience--failover)
9. [Troubleshooting](#troubleshooting)

---

## Overview

### What is Hub-Spoke Federation?

DIVE V3 implements a **hub-spoke federation model** for distributed identity and authorization management across coalition partners. This architecture enables:

- **Centralized Policy Management**: A single hub distributes policies to all spokes
- **Decentralized Enforcement**: Each spoke enforces policies locally with its own OPA instance
- **Data Sovereignty**: Partners maintain control of their own data and identity providers
- **Resilience**: Spokes continue operating even when disconnected from the hub

### Architecture at a Glance

```
                              ┌────────────────────────────────────────────────┐
                              │                   DIVE HUB                      │
                              │         (Policy Authority + Registry)           │
                              │                                                 │
                              │  ┌─────────────┐     ┌──────────────────────┐  │
                              │  │ OPAL Server │     │  Hub-Spoke Registry  │  │
                              │  │  (Primary)  │     │  - Spoke Authorization│  │
                              │  └──────┬──────┘     │  - Token Management   │  │
                              │         │            │  - Health Monitoring  │  │
                              │         │            └──────────────────────┘  │
                              │  ┌──────▼───────────────────────────────────┐  │
                              │  │           Policy Git Repository          │  │
                              │  │  - Rego policies (source of truth)       │  │
                              │  │  - Signed policy bundles                 │  │
                              │  └───────────────────────────────────────────┘  │
                              └───────────────────────┬────────────────────────┘
                                                      │
                              Policy + Data Push (mTLS / JWT-authenticated)
                                                      │
          ┌───────────────────────────────────────────┼───────────────────────────────────────────┐
          │                                           │                                           │
          ▼                                           ▼                                           ▼
   ┌────────────────┐                        ┌────────────────┐                        ┌────────────────┐
   │  SPOKE: USA    │                        │  SPOKE: FRA    │                        │  SPOKE: GBR    │
   │                │                        │                │                        │                │
   │ ┌────────────┐ │                        │ ┌────────────┐ │                        │ ┌────────────┐ │
   │ │OPAL Client │ │ ◄──── WebSocket ────── │ │OPAL Client │ │ ◄──── WebSocket ────── │ │OPAL Client │ │
   │ └─────┬──────┘ │                        │ └─────┬──────┘ │                        │ └─────┬──────┘ │
   │       ▼        │                        │       ▼        │                        │       ▼        │
   │ ┌────────────┐ │                        │ ┌────────────┐ │                        │ ┌────────────┐ │
   │ │  OPA Local │ │                        │ │  OPA Local │ │                        │ │  OPA Local │ │
   │ │ + Policies │ │                        │ │ + Policies │ │                        │ │ + Policies │ │
   │ └────────────┘ │                        │ └────────────┘ │                        │ └────────────┘ │
   │                │                        │                │                        │                │
   │ ┌────────────┐ │   Federation Trust     │ ┌────────────┐ │   Federation Trust     │ ┌────────────┐ │
   │ │ Keycloak   │◄├───────────────────────►│ │ Keycloak   │◄├───────────────────────►│ │ Keycloak   │ │
   │ └────────────┘ │                        │ └────────────┘ │                        │ └────────────┘ │
   │                │                        │                │                        │                │
   │ ┌────────────┐ │                        │ ┌────────────┐ │                        │ ┌────────────┐ │
   │ │    KAS     │ │                        │ │    KAS     │ │                        │ │    KAS     │ │
   │ │ (Local)    │ │                        │ │ (Local)    │ │                        │ │ (Local)    │ │
   │ └────────────┘ │                        │ └────────────┘ │                        │ └────────────┘ │
   │                │                        │                │                        │                │
   │ Data Sovereign │                        │ Data Sovereign │                        │ Data Sovereign │
   └────────────────┘                        └────────────────┘                        └────────────────┘
```

### Key Terminology

| Term | Definition |
|------|------------|
| **Hub** | Central authority that manages policy distribution, spoke registration, and federation coordination |
| **Spoke** | A partner's DIVE instance that receives policies from the hub and enforces them locally |
| **SP Client** | Service Provider Client - A lightweight OAuth/OIDC client that authenticates users via the hub without deploying a full spoke |
| **OPAL** | Open Policy Administration Layer - Real-time policy and data distribution system |
| **OPA** | Open Policy Agent - Policy decision engine that evaluates authorization requests |
| **Pilot Mode** | Configuration where partners register as SP Clients instead of full Spokes |

---

## Architecture Concepts

### 1. Hub Responsibilities

The Hub serves as the central authority for the federation:

| Responsibility | Implementation |
|----------------|----------------|
| **Policy Authority** | Maintains source-of-truth Rego policies in Git |
| **Policy Distribution** | Pushes signed policy bundles via OPAL Server |
| **Spoke Registry** | Tracks registered spokes, their status, and permissions |
| **Token Issuance** | Issues scoped JWTs for spoke authentication |
| **Health Monitoring** | Receives heartbeats and tracks spoke connectivity |
| **Audit Aggregation** | Collects audit logs from all spokes |

### 2. Spoke Responsibilities

Each Spoke operates as an independent enforcement point:

| Responsibility | Implementation |
|----------------|----------------|
| **Policy Enforcement** | Local OPA evaluates authorization requests |
| **Policy Sync** | OPAL Client subscribes to hub for updates |
| **Identity Management** | Local Keycloak handles authentication |
| **Key Access** | Local KAS enforces data-centric security |
| **Audit Logging** | Records decisions, queues for hub sync |
| **Offline Operation** | Continues with cached policies when disconnected |

### 3. SP Client Mode (Pilot Mode)

For partners who don't need a full spoke deployment:

```
                     ┌─────────────────┐
                     │   Partner App   │
                     │  (SP Client)    │
                     └────────┬────────┘
                              │
                    OAuth/OIDC Flow
                              │
                              ▼
                     ┌─────────────────┐
                     │    DIVE Hub     │
                     │  - Keycloak     │
                     │  - Backend API  │
                     │  - OPA          │
                     └─────────────────┘
```

SP Clients:
- Register via `./dive sp register`
- Receive OAuth client credentials
- Redirect users to hub for authentication
- Call hub API for authorization decisions

---

## Component Deep Dive

### Hub Components

#### 1. OPAL Server

The OPAL Server is the heart of policy distribution:

```yaml
# docker/opal-server-tls.yml
opal-server:
  image: permitio/opal-server:latest
  environment:
    OPAL_POLICY_REPO_URL: https://github.com/dive25/policies.git
    OPAL_POLICY_REPO_MAIN_BRANCH: main
    OPAL_DATA_CONFIG_SOURCES: '{"config":{"entries":[{"url":"http://backend:4000/api/opal/data","topics":["policy_data"]}]}}'
    OPAL_AUTH_JWT_AUDIENCE: opal
    OPAL_AUTH_JWT_ISSUER: dive25-hub
  ports:
    - "7002:7002"
```

**Key Features:**
- Git-based policy source of truth
- WebSocket connections to all OPAL Clients
- JWT authentication for spoke connections
- Real-time policy push notifications

#### 2. Hub-Spoke Registry Service

Manages spoke lifecycle and authorization:

```typescript
// Key interfaces
interface ISpokeRegistration {
  spokeId: string;           // Unique identifier
  instanceCode: string;      // ISO 3166-1 alpha-3 (USA, FRA, GBR)
  name: string;              // Human-readable name
  status: SpokeStatus;       // pending | approved | suspended | revoked
  publicKeyPEM?: string;     // X.509 certificate for mTLS
  allowedScopes: string[];   // policy:base, data:federation_matrix
  trustLevel: TrustLevel;    // bilateral | multilateral | restricted
}

interface ISpokeToken {
  token: string;             // JWT for OPAL authentication
  expiresAt: Date;
  scopes: string[];
}
```

**Spoke Lifecycle:**

```
   ┌──────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐
   │ pending  │ ───► │ approved │ ───► │suspended │ ───► │ revoked  │
   └──────────┘      └──────────┘      └──────────┘      └──────────┘
        │                  │                                   ▲
        │                  └───────────────────────────────────┘
        │                            (can be revoked)
        └──────────────────────────────────────────────────────┘
                         (can be rejected)
```

#### 3. Policy Bundle Builder

Creates signed, scoped policy bundles:

```bash
# Build and sign a policy bundle
./dive policy build --sign

# Output:
#   Bundle ID:   bundle-2025-12-05-abc123
#   Version:     1.0.5
#   Hash:        sha256:7f3c2d...
#   Files:       42
#   Signed:      true
```

### Spoke Components

#### 1. OPAL Client

Maintains connection to hub and keeps local OPA updated:

```yaml
# instances/usa/docker-compose.yml
opal-client-usa:
  image: permitio/opal-client:latest
  environment:
    # Hub connection
    OPAL_SERVER_URL: ${HUB_OPAL_URL:-https://hub.dive25.com:7002}
    OPAL_CLIENT_TOKEN: ${SPOKE_OPAL_TOKEN}
    
    # Local OPA
    OPAL_INLINE_OPA_ENABLED: "false"
    OPAL_OPA_URL: http://opa-usa:8181
    
    # Spoke identity
    OPAL_SUBSCRIPTION_ID: ${SPOKE_ID:-spoke-usa-default}
    
    # Resilience
    OPAL_KEEP_ALIVE_TIMEOUT: "60"
    OPAL_RECONNECT_INTERVAL: "5"
    OPAL_RECONNECT_MAX_INTERVAL: "300"
    
    # Data topics
    OPAL_DATA_TOPICS: policy:base,policy:usa,data:federation_matrix
```

**Resilience Features:**
- Automatic reconnection with exponential backoff
- Policy caching to disk
- Continues enforcement during disconnection

#### 2. Local OPA

Each spoke has its own OPA instance:

```yaml
opa-usa:
  image: openpolicyagent/opa:0.68.0
  command: run --server --addr :8181 /policies
  volumes:
    - ../../policies:/policies:ro      # Initial policies
    - usa_opa_cache:/var/opa/cache     # Cache for updates
```

#### 3. Spoke Configuration

Each spoke has a `config.json` defining its identity and endpoints:

```json
{
  "identity": {
    "spokeId": "spoke-usa-7f3c",
    "instanceCode": "USA",
    "name": "United States",
    "country": "USA",
    "organizationType": "government"
  },
  "endpoints": {
    "hubUrl": "https://hub.dive25.com",
    "hubApiUrl": "https://hub.dive25.com/api",
    "hubOpalUrl": "https://hub.dive25.com:7002",
    "baseUrl": "https://usa-app.dive25.com",
    "apiUrl": "https://usa-api.dive25.com",
    "idpUrl": "https://usa-idp.dive25.com"
  },
  "federation": {
    "status": "approved",
    "requestedScopes": [
      "policy:base",
      "policy:usa",
      "data:federation_matrix"
    ]
  },
  "operational": {
    "heartbeatIntervalMs": 30000,
    "policyCachePath": "./cache/policies",
    "auditQueuePath": "./cache/audit"
  }
}
```

---

## Data Flows

### 1. Spoke Registration Flow

```
 Partner Admin                        Hub Admin                          Hub System
      │                                   │                                   │
      │ 1. ./dive spoke init NZL "NZ Defence"                                 │
      │    Creates config.json, docker-compose.yml                            │
      │                                   │                                   │
      │ 2. ./dive spoke generate-certs                                        │
      │    Creates spoke.key, spoke.crt, spoke.csr                            │
      │                                   │                                   │
      │ 3. ./dive spoke register ─────────┼──────────────────────────────────►│
      │    POST /api/federation/register  │                                   │
      │    {instanceCode, name, cert}     │                                   │
      │                                   │                                   │
      │◄──────────────────────────────────┼─ 4. {spokeId, status:"pending"} ──│
      │                                   │                                   │
      │                                   │◄──── 5. Email notification ───────│
      │                                   │                                   │
      │                                   │ 6. Review in admin UI              │
      │                                   │                                   │
      │                                   │ 7. POST /admin/spokes/{id}/approve│
      │                                   │ ──────────────────────────────────►│
      │                                   │                                   │
      │◄──────────────────────────────────┼─ 8. Email with spoke token ───────│
      │                                   │                                   │
      │ 9. Add SPOKE_OPAL_TOKEN to .env   │                                   │
      │                                   │                                   │
      │ 10. ./dive spoke up               │                                   │
      │     Starts all services           │                                   │
      │                                   │                                   │
```

### 2. Policy Distribution Flow

```
  Policy Author          Hub OPAL Server         Spoke OPAL Client          Spoke OPA
       │                       │                        │                       │
       │ 1. git push policies  │                        │                       │
       │ ─────────────────────►│                        │                       │
       │                       │                        │                       │
       │                       │ 2. Detect changes      │                       │
       │                       │    Build bundle        │                       │
       │                       │    Sign with X.509     │                       │
       │                       │                        │                       │
       │                       │ 3. Push via WebSocket  │                       │
       │                       │ ──────────────────────►│                       │
       │                       │                        │                       │
       │                       │                        │ 4. Validate signature │
       │                       │                        │    Download bundle    │
       │                       │                        │                       │
       │                       │                        │ 5. PUT /v1/policies   │
       │                       │                        │ ─────────────────────►│
       │                       │                        │                       │
       │                       │                        │ 6. Cache to disk      │
       │                       │                        │                       │
       │                       │◄─────────────────────── 7. ACK: version=1.0.5 │
       │                       │                        │                       │
```

### 3. Authorization Decision Flow

```
  User Browser         Spoke Frontend       Spoke Backend        Spoke OPA
       │                     │                    │                   │
       │ 1. GET /resources   │                    │                   │
       │ ───────────────────►│                    │                   │
       │                     │                    │                   │
       │                     │ 2. GET /api/resources                  │
       │                     │ ──────────────────►│                   │
       │                     │                    │                   │
       │                     │                    │ 3. POST /v1/data/dive/authorization
       │                     │                    │ ─────────────────►│
       │                     │                    │                   │
       │                     │                    │                   │ 4. Evaluate
       │                     │                    │                   │    against
       │                     │                    │                   │    local policy
       │                     │                    │                   │
       │                     │                    │◄─ 5. {allow: true}│
       │                     │                    │                   │
       │                     │                    │ 6. Log decision   │
       │                     │                    │    Queue for hub  │
       │                     │                    │                   │
       │                     │◄──────────────────── 7. Resources ─────│
       │                     │                    │                   │
       │◄────────────────────│                    │                   │
       │    Resources UI     │                    │                   │
```

### 4. Heartbeat & Health Flow

```
  Spoke Backend              Hub API                  Hub Registry
       │                        │                          │
       │ 1. POST /federation/heartbeat                     │
       │   {spokeId, timestamp, opaHealthy, metrics}       │
       │ ──────────────────────►│                          │
       │                        │                          │
       │                        │ 2. Validate token        │
       │                        │    Update lastSeen       │
       │                        │ ────────────────────────►│
       │                        │                          │
       │                        │◄───────────────────────── 3. Status │
       │                        │                          │
       │◄─────────────────────── 4. {syncStatus, actions}  │
       │                        │                          │
       │ 5. Execute actions     │                          │
       │    (sync policies,     │                          │
       │     flush audit queue) │                          │
       │                        │                          │
```

---

## CLI Reference

### Hub Commands

```bash
# Start hub services
./dive hub start

# Check hub status
./dive hub status

# List registered instances
./dive hub instances

# Push policy update to all spokes
./dive hub push-policy
```

### Spoke Commands

```bash
# Initialize a new spoke
./dive spoke init <CODE> "<NAME>"
# Example: ./dive spoke init NZL "New Zealand Defence Force"

# Generate X.509 certificates
./dive spoke generate-certs

# Rotate certificates (with backup)
./dive spoke rotate-certs

# Register with hub
./dive spoke register

# Check spoke status
./dive spoke status

# Check service health
./dive spoke health

# Start spoke services
./dive spoke up

# Stop spoke services
./dive spoke down

# View logs
./dive spoke logs [service]

# Force policy sync from hub
./dive spoke sync

# Send manual heartbeat
./dive spoke heartbeat
```

### Spoke Resilience Commands (Phase 5)

```bash
# Failover management
./dive spoke failover status        # Show circuit breaker state
./dive spoke failover force-open    # Force offline mode
./dive spoke failover force-closed  # Resume normal operation
./dive spoke failover reset         # Reset metrics

# Maintenance mode
./dive spoke maintenance status     # Show maintenance status
./dive spoke maintenance enter "reason"  # Enter maintenance
./dive spoke maintenance exit       # Exit maintenance

# Audit queue status
./dive spoke audit-status           # Show queued audit logs
```

### SP Client Commands (Pilot Mode)

```bash
# Register as SP Client
./dive sp register

# Check registration status
./dive sp status [sp-id]

# List registered SP Clients
./dive sp list

# Show credentials
./dive sp credentials <sp-id>
```

### Federation Commands

```bash
# Show federation status
./dive federation status

# Register instance with hub
./dive federation register <url>

# Sync policies from hub
./dive federation sync-policies

# Sync IdP metadata from hub
./dive federation sync-idps

# Push audit logs to hub
./dive federation push-audit
```

### Policy Commands

```bash
# Build policy bundle
./dive policy build [--sign] [--scopes <scopes>]

# Push bundle to OPAL
./dive policy push

# Show distribution status
./dive policy status

# Run OPA tests
./dive policy test [pattern]

# Show current version
./dive policy version

# Trigger policy refresh
./dive policy refresh
```

---

## Configuration Reference

### Environment Variables

#### Hub Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `OPAL_SERVER_URL` | `https://hub.dive25.com:7002` | OPAL Server WebSocket URL |
| `OPAL_POLICY_REPO_URL` | - | Git repository for policies |
| `OPAL_AUTH_JWT_ISSUER` | `dive25-hub` | JWT issuer for spoke auth |

#### Spoke Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `HUB_URL` | `https://hub.dive25.com` | Hub API URL |
| `HUB_OPAL_URL` | `https://hub.dive25.com:7002` | Hub OPAL Server URL |
| `SPOKE_ID` | Generated | Unique spoke identifier |
| `SPOKE_OPAL_TOKEN` | - | JWT for OPAL authentication |
| `INSTANCE_CODE` | `USA` | ISO 3166-1 alpha-3 country code |
| `SPOKE_MODE` | `true` | Enable spoke federation features |

#### CLI Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DIVE_PILOT_MODE` | `true` | Enable pilot mode (disables spoke deployment) |
| `DIVE_HUB_URL` | `https://usa-api.dive25.com` | Hub API for SP registration |
| `DIVE_INSTANCE` | `usa` | Default instance code |
| `DIVE_ENV` | `local` | Environment: local, gcp, pilot |

### Spoke config.json Schema

```json
{
  "identity": {
    "spokeId": "string (required)",
    "instanceCode": "string (required, 3 chars)",
    "name": "string (required)",
    "description": "string (optional)",
    "country": "string (required)",
    "organizationType": "government|military|defense_contractor|research",
    "contactEmail": "string (required for registration)"
  },
  "endpoints": {
    "hubUrl": "string (required)",
    "hubApiUrl": "string (required)",
    "hubOpalUrl": "string (required)",
    "baseUrl": "string (required)",
    "apiUrl": "string (required)",
    "idpUrl": "string (required)",
    "kasUrl": "string (optional)"
  },
  "certificates": {
    "certificatePath": "string",
    "privateKeyPath": "string",
    "csrPath": "string",
    "caBundlePath": "string"
  },
  "authentication": {
    "opalToken": "string (set after approval)"
  },
  "federation": {
    "status": "unregistered|pending|approved|suspended|revoked",
    "registeredAt": "ISO 8601 timestamp",
    "approvedAt": "ISO 8601 timestamp",
    "requestedScopes": ["policy:base", "policy:{code}", "data:*"]
  },
  "operational": {
    "heartbeatIntervalMs": 30000,
    "tokenRefreshBufferMs": 300000,
    "offlineGracePeriodMs": 3600000,
    "policyCachePath": "string",
    "auditQueuePath": "string",
    "maxAuditQueueSize": 10000,
    "auditFlushIntervalMs": 60000
  },
  "metadata": {
    "version": "semver",
    "createdAt": "ISO 8601",
    "lastModified": "ISO 8601",
    "configHash": "sha256"
  }
}
```

---

## Security Model

### 1. Authentication Layers

| Layer | Mechanism | Purpose |
|-------|-----------|---------|
| **Spoke → Hub** | JWT (RS256) | Authenticate spoke to OPAL Server |
| **Hub → Spoke** | mTLS (optional) | Verify spoke certificate |
| **User → Spoke** | OIDC/SAML | User authentication via Keycloak |
| **Service → OPA** | Network policy | Internal service mesh |

### 2. Spoke Token Structure

```json
{
  "sub": "spoke-fra-abc123",
  "iss": "hub.dive25.com",
  "aud": "opal.dive25.com",
  "iat": 1733340000,
  "exp": 1733426400,
  "scopes": [
    "policy:base",
    "policy:fra",
    "data:federation_matrix"
  ],
  "trust_level": "bilateral",
  "max_classification": "SECRET"
}
```

### 3. Certificate Management

```bash
# Generate certificates (RSA 4096-bit, 365 days)
./dive spoke generate-certs

# Files created:
# - instances/{code}/certs/spoke.key   (private key, chmod 600)
# - instances/{code}/certs/spoke.crt   (self-signed certificate)
# - instances/{code}/certs/spoke.csr   (CSR for hub signing)

# For production:
# 1. Submit CSR to hub during registration
# 2. Hub signs with federation CA
# 3. Replace spoke.crt with hub-signed certificate
```

### 4. Trust Levels

| Level | Description | Allowed Classifications |
|-------|-------------|------------------------|
| `full` | Full federation partner | All levels |
| `bilateral` | Bilateral agreement | Up to SECRET |
| `multilateral` | Multilateral coalition | Up to CONFIDENTIAL |
| `restricted` | Limited access | UNCLASSIFIED only |

---

## Resilience & Failover

### Circuit Breaker States

The spoke implements a circuit breaker pattern for hub connectivity:

```
   ┌──────────┐                    ┌──────────────┐                    ┌────────┐
   │  CLOSED  │ ── 5 failures ──► │  OPEN        │ ── 60s timeout ──► │HALF_OPEN│
   │ (normal) │                    │ (offline)    │                    │(testing)│
   └──────────┘                    └──────────────┘                    └─────────┘
        ▲                                                                   │
        │                                                                   │
        └──────────────────── success ──────────────────────────────────────┘
                                    │
                              failure ──────┐
                                            ▼
                                     ┌────────────┐
                                     │   OPEN     │
                                     └────────────┘
```

### Degraded Mode Operation

When the hub is unavailable, spokes continue operating:

| Feature | Normal Mode | Degraded Mode |
|---------|-------------|---------------|
| Policy Enforcement | ✅ Latest policies | ✅ Cached policies |
| Policy Updates | ✅ Real-time | ❌ Pending |
| User Authentication | ✅ Full federation | ✅ Cached IdP metadata |
| Authorization Decisions | ✅ Full | ✅ Local OPA |
| Audit Logging | ✅ Real-time sync | 📦 Queued locally |
| KAS Key Release | ✅ Full | ✅ Local policy |

### Maintenance Mode

Enter maintenance mode for planned operations:

```bash
# Enter maintenance
./dive spoke maintenance enter "Scheduled upgrade to v2.0"

# During maintenance:
# - Hub heartbeats paused
# - Policy updates suspended
# - Authorization continues with cached policies
# - Audit logs queued

# Exit maintenance
./dive spoke maintenance exit
```

### Audit Queue Management

During disconnection, audit logs are queued locally:

```bash
# Check queue status
./dive spoke audit-status

# Output:
#   Pending Entries:   1,234
#   Queue Size:        2.5 MB
#   Max Queue Size:    10000 entries
#   Queue Health:      ✓ Healthy (12% full)
#   
#   Total Synced:      45,678
#   Total Failed:      12
#   Last Sync:         2025-12-05T10:30:00Z
#   Last Status:       ✓ Success

# Force sync (when hub reconnects)
curl -X POST localhost:4000/api/spoke/audit/sync
```

---

## Troubleshooting

### Common Issues

#### 1. Spoke Can't Connect to Hub

**Symptoms:**
- `./dive spoke health` shows OPAL Client unhealthy
- Logs show WebSocket connection errors

**Diagnosis:**
```bash
# Check hub connectivity
curl -kv https://hub.dive25.com:7002/healthcheck

# Check OPAL client logs
./dive spoke logs opal-client

# Verify token
echo $SPOKE_OPAL_TOKEN | base64 -d | jq .
```

**Solutions:**
- Verify `HUB_OPAL_URL` in `.env`
- Check `SPOKE_OPAL_TOKEN` is set and not expired
- Verify network connectivity to hub
- Check firewall allows WebSocket on port 7002

#### 2. Policies Not Syncing

**Symptoms:**
- `./dive policy status` shows outdated version
- Authorization decisions use stale policies

**Diagnosis:**
```bash
# Check OPAL client status
./dive spoke health

# Query OPA directly
curl http://localhost:8181/v1/data/dive/base/guardrails/metadata

# Force sync
./dive spoke sync
```

**Solutions:**
- Verify OPAL client is connected
- Check spoke has correct scopes for policy topics
- Restart OPAL client: `docker restart dive-v3-opal-client-usa`

#### 3. Registration Fails

**Symptoms:**
- `./dive spoke register` returns error
- Status remains "pending" indefinitely

**Diagnosis:**
```bash
# Check config
cat instances/usa/config.json | jq .

# Verify certificate
openssl x509 -in instances/usa/certs/spoke.crt -text -noout

# Check hub API
curl -kv https://hub.dive25.com/api/federation/health
```

**Solutions:**
- Ensure `contactEmail` is set in config.json
- Verify certificates are generated
- Contact hub admin for approval status

#### 4. Circuit Breaker Stuck Open

**Symptoms:**
- `./dive spoke failover status` shows OPEN state
- Spoke not attempting reconnection

**Diagnosis:**
```bash
# Check failover status
./dive spoke failover status

# View metrics
curl localhost:4000/api/spoke/failover/status | jq .
```

**Solutions:**
```bash
# Force circuit closed (if hub is healthy)
./dive spoke failover force-closed

# Or reset metrics and retry
./dive spoke failover reset
```

### Log Locations

| Component | Log Command |
|-----------|-------------|
| All services | `./dive spoke logs` |
| OPAL Client | `./dive spoke logs opal-client` |
| OPA | `./dive spoke logs opa` |
| Backend | `./dive spoke logs backend` |
| Keycloak | `./dive spoke logs keycloak` |

### Health Check Endpoints

| Service | Endpoint | Expected |
|---------|----------|----------|
| OPA | `http://localhost:8181/health` | `{}` |
| OPAL Client | `http://localhost:7000/health` | `200 OK` |
| Backend | `http://localhost:4000/health` | `{"status":"ok"}` |
| Keycloak | `http://localhost:8080/health` | `200 OK` |

---

## Next Steps

- [Hub-Spoke 101 Deployment Guide](./HUB_SPOKE_101_DEPLOYMENT.md) - Step-by-step deployment tutorial
- [Partner Onboarding Guide](./PARTNER-ONBOARDING-GUIDE.md) - Full partner onboarding process
- [Distributed Architecture](./DISTRIBUTED-ARCHITECTURE.md) - Deep dive on distribution patterns
- [Federation Gap Analysis](./HUB_SPOKE_GAP_ANALYSIS.md) - Implementation roadmap


