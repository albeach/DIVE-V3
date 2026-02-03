# DIVE V3 Key Access Service (KAS)

**Version**: 1.0.0-acp240  
**Status**: Production-Ready  
**Compliance**: ACP-240 SUPP-5(A) AMDT 1 (partial)

---

## Overview

The DIVE V3 Key Access Service (KAS) provides policy-based key management for ZTDF (Zero Trust Data Format) encrypted resources. It implements a rewrap protocol that enables authorized clients to obtain decryption key material based on ABAC policy evaluation.

**Key Features:**
- Policy re-evaluation via OPA before key release
- DEK/KEK management with HSM support (GCP KMS in production, MockHSM in dev)
- ACP-240 compliant audit logging
- Fail-closed enforcement (default deny)
- Multi-KAS federation for cross-organization key access
- Prometheus metrics and observability

---

## Local Development with DIVE CLI

### Hub Deployment

Deploy the hub including KAS:

```bash
./dive hub deploy
```

**What happens:**
1. KAS container builds from `kas/Dockerfile`
2. KAS starts after dependencies (OPA, MongoDB, Redis) are healthy
3. Phase 6.75: KAS automatically registers as `usa-kas` in MongoDB
4. Phase 7.5: KAS health verification (waits up to 60s for healthy status)
5. KAS becomes available at `https://localhost:8085`

**Verify deployment:**

```bash
# Check KAS container status
docker ps | grep kas

# Check health endpoint
curl -k https://localhost:8085/health

# Check MongoDB registration
curl -k https://localhost:4000/api/kas/registry | jq '.kasServers[] | select(.kasId=="usa-kas")'
```

**Expected results:**
- Container: `dive-hub-kas` with status "healthy"
- Health endpoint returns: `{"status":"healthy","service":"dive-v3-kas",...}`
- MongoDB shows: `{"kasId":"usa-kas","status":"active",...}`

---

### Spoke Deployment

Deploy a spoke including KAS:

```bash
./dive spoke deploy fra
```

**What happens:**
1. KAS container builds from `../../kas/Dockerfile` (relative to spoke instance)
2. KAS starts after dependencies (OPA, MongoDB, Redis) are healthy
3. Phase 2.5: KAS automatically registers as `fra-kas` in Hub MongoDB
4. Auto-approval for local development deployments
5. KAS becomes available at calculated port (9000 + offset)

**Verify deployment:**

```bash
# Check KAS container status
docker ps | grep "dive-spoke-fra-kas"

# Get KAS port from spoke config
SPOKE_KAS_PORT=$(cat instances/fra/.env | grep KAS_HOST_PORT | cut -d= -f2)
echo "FRA KAS Port: $SPOKE_KAS_PORT"

# Check health endpoint
curl -k https://localhost:${SPOKE_KAS_PORT}/health

# Check MongoDB registration (via Hub backend)
curl -k https://localhost:4000/api/kas/registry | jq '.kasServers[] | select(.kasId=="fra-kas")'
```

**Port allocation:**
- Internal port: Always 8080 (standard KAS port)
- External port: Base 9000 + spoke offset
  - FRA (offset 10): 9010
  - GBR (offset 27): 9027
  - DEU (offset 7): 9007

---

## Troubleshooting

### KAS Container Not Starting

**Symptom:** `docker ps` doesn't show KAS container

**Check:**
```bash
# 1. Check if container exists but stopped
docker ps -a | grep kas

# 2. Check logs for errors
docker logs dive-hub-kas 2>&1 | tail -50

# 3. Check dependencies
docker ps --filter "health=healthy" | grep -E "(opa|mongodb|redis)"
```

**Common causes:**
- Missing dependencies: OPA, MongoDB, or Redis not healthy
- Certificate issues: Check `kas/certs/` directory exists with valid certs
- Build failures: Check `docker images | grep kas`

**Fix:**
```bash
# Rebuild KAS
docker compose -f docker-compose.hub.yml build kas

# Start with dependency check
docker compose -f docker-compose.hub.yml up kas
```

---

### Healthcheck Fails

**Symptom:** Container shows "unhealthy" status

**Check:**
```bash
# 1. Check healthcheck configuration
docker inspect dive-hub-kas --format='{{json .State.Health}}' | jq

# 2. Test health endpoint manually from inside container
docker exec dive-hub-kas curl -kfs https://localhost:8080/health

# 3. Check if HTTPS certificates are valid
docker exec dive-hub-kas ls -la /opt/app/certs/
```

**Common causes:**
- Missing curl in container (fixed in Dockerfile)
- HTTPS certificate issues
- Health endpoint not responding (check logs)
- Dependencies not accessible (OPA, MongoDB)

**Fix:**
- Healthcheck uses `curl -kfs` (not `wget`)
- Start period: 30s (gives KAS time to initialize)
- Retries: 5 (allows transient failures)

---

### Not Registered in MongoDB

**Symptom:** KAS running but not in registry

**Check:**
```bash
# Check all registered KAS instances
curl -k https://localhost:4000/api/kas/registry | jq '.kasServers[].kasId'

# Check backend logs for registration attempts
docker logs dive-hub-backend 2>&1 | grep -i "kas.*regist"
```

**Common causes:**
- Backend not healthy during Phase 6.75 (hub) or Phase 2.5 (spoke)
- API endpoints missing or authentication failed
- MongoDB connection issues

**Fix (Hub):**
```bash
# Manual registration via backend container
docker exec dive-hub-backend npm run seed:hub-kas
```

**Fix (Spoke):**
```bash
# Manual registration via CLI
./dive spoke kas register-mongodb fra
./dive spoke kas approve fra-kas
```

---

### Federation Not Working

**Symptom:** Hub KAS cannot reach spoke KAS (or vice versa)

**Check:**
```bash
# 1. Verify both KAS on dive-shared network
docker network inspect dive-shared --format '{{range .Containers}}{{.Name}} {{end}}'

# 2. Test connectivity from hub KAS to spoke KAS
docker exec dive-hub-kas ping -c 2 dive-spoke-fra-kas

# 3. Check federation registry
curl -k https://localhost:4000/api/kas/registry | jq '.kasServers[] | {kasId, kasUrl, status}'
```

**Common causes:**
- Missing `dive-shared` network in compose configuration
- Spoke KAS not registered in federation registry
- Circuit breaker open due to previous failures

**Fix:**
- Both hub and spoke KAS must have `networks: [dive-internal/hub-internal, dive-shared]`
- Verify registration: KAS must be in MongoDB with `status:"active"`
- Reset circuit breaker: Restart KAS containers

---

## CLI Commands

### Hub KAS Management

```bash
# KAS is automatically managed during hub deployment
./dive hub deploy      # Deploys and registers KAS
./dive hub down        # Stops all hub services including KAS
./dive hub logs kas    # View KAS logs (if CLI supports)
```

### Spoke KAS Management

```bash
# Initialize KAS configuration (usually automatic)
./dive spoke kas init <CODE>

# Register spoke KAS in MongoDB (automatic during spoke deploy)
./dive spoke kas register-mongodb <CODE>

# Approve pending KAS registration
./dive spoke kas approve <kas-id>

# Check KAS status
./dive spoke kas status <CODE>

# Detailed health check
./dive spoke kas health <CODE>

# View KAS logs
./dive spoke kas logs <CODE>
./dive spoke kas logs <CODE> -f  # Follow logs
```

---

## Architecture

### KAS in DIVE V3 Stack

```
┌─────────────────────────────────────────┐
│  Client (Browser/API)                   │
│  - JWT from Keycloak                    │
│  - DPoP proof (for /rewrap endpoint)    │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  Backend API (PEP)                      │
│  - Validates JWT                        │
│  - Extracts resource metadata           │
│  - Calls KAS for key release            │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  KAS (Key Access Service)               │
│  ┌───────────────────────────────────┐  │
│  │ 1. Validate JWT + DPoP            │  │
│  │ 2. Re-evaluate policy via OPA     │  │
│  │ 3. Unwrap DEK from HSM            │  │
│  │ 4. Rewrap for client public key   │  │
│  │ 5. Log audit event                │  │
│  │ 6. Return wrapped key or deny     │  │
│  └───────────────────────────────────┘  │
│  Dependencies:                          │
│  - OPA: Policy decisions                │
│  - MongoDB: Registry + metadata         │
│  - Redis: Cache + rate limiting         │
│  - Keycloak: JWT validation             │
└─────────────────────────────────────────┘
```

### Federation Architecture

```
┌──────────────┐      ┌──────────────┐
│  Hub KAS     │◄────►│  Spoke KAS   │
│  (usa-kas)   │      │  (fra-kas)   │
└──────────────┘      └──────────────┘
        │                     │
        └──────┬──────────────┘
               │
        dive-shared network
        (federation communication)
```

**Federation Flow:**
1. Client requests resource with KAOs from multiple KAS instances
2. Hub KAS detects foreign KAOs (by URL)
3. Hub KAS forwards requests to appropriate spoke KAS
4. Spoke KAS processes locally and returns results
5. Hub KAS aggregates responses and returns to client
6. Each KAS signs its own results (no re-signing)

---

## Configuration

### Environment Variables

**Required:**
- `MONGODB_URL`: MongoDB connection string
- `REDIS_URL`: Redis connection string (for cache and rate limiting)
- `OPA_URL`: OPA policy decision point endpoint
- `KEYCLOAK_URL`: Keycloak URL for JWT validation
- `KEYCLOAK_REALM`: Keycloak realm name

**Optional:**
- `KAS_INSTANCE_ID`: Unique identifier for this KAS instance (default: `usa-kas`)
- `LOG_LEVEL`: Logging level (default: `info`, options: `debug`, `warn`, `error`)
- `USE_MOCK_HSM`: Use MockHSM for development (default: `true`)
- `USE_GCP_KMS`: Use GCP KMS for production (default: `false`)
- `HTTPS_ENABLED`: Enable HTTPS (default: `true`)
- `CERT_PATH`: Path to TLS certificates (default: `/opt/app/certs`)

### Dependencies

**Hard dependencies** (must be healthy before KAS starts):
- ✅ OPA (policy decisions)
- ✅ MongoDB (registry and metadata)
- ✅ Redis (cache and rate limiting)

**Soft dependencies** (KAS can start but won't be fully functional):
- ⚠️ Keycloak (JWT validation - KAS will deny all requests without it)
- ⚠️ Backend (for federated registry queries)

### Network Configuration

**Hub KAS:**
- Networks: `hub-internal` (hub services) + `dive-shared` (federation)
- Ports: 8080 internal, 8085 external

**Spoke KAS:**
- Networks: `dive-internal` (spoke services) + `dive-shared` (federation)
- Ports: 8080 internal, calculated external (9000 + offset)

---

## Deployment Models

### Local Development (Docker Compose)

- Uses `kas/Dockerfile` (standard Node.js build)
- MockHSM for key operations (no external HSM required)
- Hot-reload with volume mount (`./kas/src:/app/src`)
- Comprehensive logging for debugging

**Start:**
```bash
./dive hub deploy              # Hub with KAS
./dive spoke deploy fra        # Spoke with KAS
```

### Production (Cloud Run)

- Uses `kas/Dockerfile.cloudrun` (optimized for serverless)
- GCP Cloud KMS for FIPS 140-2 Level 3 HSM
- In-memory cache (no Redis needed)
- Cost-optimized: $5-10/month for pilot workload

**Deploy:**
```bash
cd kas
./scripts/deploy-cloudrun.sh
```

See [`QUICK-START.md`](./QUICK-START.md) for Cloud Run deployment details.

---

## Testing

### Manual Testing

**Hub KAS:**
```bash
# Health check
curl -k https://localhost:8085/health | jq

# Request key (requires valid JWT)
curl -k -X POST https://localhost:8085/request-key \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "resourceId": "doc-123",
    "resourceMetadata": {
      "classification": "SECRET",
      "releasabilityTo": ["USA"],
      "COI": ["FVEY"]
    }
  }' | jq
```

**Spoke KAS (FRA):**
```bash
# Get port
SPOKE_KAS_PORT=$(cat instances/fra/.env | grep KAS_HOST_PORT | cut -d= -f2)

# Health check
curl -k https://localhost:${SPOKE_KAS_PORT}/health | jq
```

### Automated Testing

KAS includes comprehensive test suites:

```bash
cd kas

# Unit tests
npm test

# Integration tests (requires Docker services)
npm run test:integration

# Performance benchmarks
npm run test:performance

# All tests
npm run test:all
```

**Test Coverage:**
- 68+ federation tests (Phase 3.5)
- 10+ performance tests
- 10+ audit trail tests
- Unit tests for all critical paths

---

## Monitoring

### Health Endpoint

```bash
curl -k https://localhost:8085/health
```

**Response:**
```json
{
  "status": "healthy",
  "service": "dive-v3-kas",
  "version": "1.0.0-acp240",
  "timestamp": "2026-02-03T01:31:14.357Z",
  "features": [
    "Policy re-evaluation via OPA",
    "DEK/KEK management (mock)",
    "ACP-240 audit logging",
    "Multi-KAS federation"
  ],
  "dekCacheSize": 0
}
```

### Logs

**View logs:**
```bash
# Hub KAS
docker logs dive-hub-kas --tail 50
docker logs dive-hub-kas -f  # Follow

# Spoke KAS
docker logs dive-spoke-fra-kas --tail 50
```

**Log levels:**
- `error`: Authentication/authorization failures, HSM errors
- `warn`: Missing attributes, federation fallbacks
- `info`: Key requests, policy decisions, audit events
- `debug`: Detailed request/response, OPA inputs/outputs

### Metrics

KAS exposes Prometheus metrics at `/metrics`:

```bash
curl -k https://localhost:8085/metrics
```

**Key metrics:**
- `kas_requests_total`: Total key requests by outcome
- `kas_request_duration_seconds`: Request latency histogram
- `kas_dek_cache_hits/misses`: Cache performance
- `kas_federation_requests`: Federated request counts
- `kas_circuit_breaker_state`: Circuit breaker status

---

## Security

### HSM Providers

**Development (MockHSM):**
- In-memory key storage
- No external HSM required
- Fast for testing
- ⚠️ NOT PRODUCTION-SAFE (keys not persisted)

**Production (GCP KMS):**
- FIPS 140-2 Level 3 certified
- Hardware-backed key storage
- Audit logging to Cloud Logging
- Key rotation support

**Environment configuration:**
```bash
# Development
USE_MOCK_HSM=true
USE_GCP_KMS=false

# Production
USE_MOCK_HSM=false
USE_GCP_KMS=true
GCP_KMS_KEY_RING=kas-keyring
GCP_KMS_KEY_NAME=kas-usa
```

### Authentication

**JWT Validation:**
- Validates signature using Keycloak JWKS
- Checks `exp`, `iat`, `iss`, `aud` claims
- Extracts user attributes for policy evaluation

**DPoP (Proof-of-Possession):**
- RFC 9449 compliant (for `/rewrap` endpoint)
- Binds access token to client's public key
- Prevents token theft and replay attacks
- Currently implemented, not yet enforced on `/request-key`

### Audit Logging

All key access attempts are logged:

```json
{
  "eventType": "KEY_REQUEST",
  "timestamp": "2026-02-03T01:30:00.000Z",
  "kasId": "usa-kas",
  "requestId": "req-abc-123",
  "subject": "john.doe@mil",
  "resourceId": "doc-456",
  "outcome": "ALLOW",
  "reason": "Policy evaluation passed",
  "latencyMs": 45
}
```

**Audit storage:**
- MongoDB collection: `kas_audit_log`
- Retention: 90 days minimum
- Indexed by: timestamp, subject, resourceId, outcome

---

## Known Issues & Limitations

### Current Limitations

1. **Custom /request-key API** (not ACP-240 compliant)
   - Current implementation uses custom protocol
   - ⚠️ Not interoperable with spec-compliant clients
   - Planned: Implement `/rewrap` endpoint per ACP-240 specification
   - See: `kas/IMPLEMENTATION-HANDOFF.md` for full gap analysis

2. **MockHSM in Development**
   - Keys stored in memory only
   - Not persisted across restarts
   - Suitable for development only

3. **Federation Registry Loading**
   - KAS may fail to load registry from MongoDB on first start
   - Falls back to empty registry with warning
   - Federation works after KAS restarts or registry reloads

### Upcoming Enhancements

Per ACP-240 gap analysis (see `kas/IMPLEMENTATION-HANDOFF.md`):
- ✅ Implement `/rewrap` endpoint (Phase 1)
- ✅ Add DPoP verification to all endpoints (Phase 2)
- ✅ Implement policyBinding verification (Phase 2)
- ✅ Add per-KAO signature verification (Phase 2)
- ✅ Refactor federation to use `/rewrap` protocol (Phase 3)
- ⏳ EncryptedMetadata decryption (Phase 4)
- ⏳ Key split recombination for All-Of mode (Phase 4)
- ⏳ AWS KMS integration (Phase 4)

---

## References

- **Cloud Run Deployment:** [`QUICK-START.md`](./QUICK-START.md)
- **ACP-240 Gap Analysis:** [`acp240-gap-analysis.json`](./acp240-gap-analysis.json)
- **Implementation Plan:** [`IMPLEMENTATION-HANDOFF.md`](./IMPLEMENTATION-HANDOFF.md)
- **Federation Testing:** [`tests/README.md`](./tests/README.md)
- **KAS Registry Config:** [`config/kas-registry.json`](../config/kas-registry.json)
- **Federation Registry:** [`config/federation-registry.json`](../config/federation-registry.json)

---

## Support

**Issues?**
- Check logs: `docker logs <kas-container>`
- Check health: `curl -k https://localhost:<port>/health`
- Check dependencies: `docker ps --filter "health=healthy"`
- Review troubleshooting section above

**For development:**
- Phase summaries in `kas/PHASE*.md` files
- Implementation details in KAS source code comments
- Federation testing guide in `kas/tests/README.md`
