# ACP-240 KAS Phase 3.5: Multi-KAS Testing Guide

## Overview

This guide covers the 3-KAS integration testing environment for validating ACP-240 compliant federation between USA, FRA, and GBR Key Access Service instances.

## Test Environment Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  KAS-USA    │────▶│  KAS-FRA    │────▶│  KAS-GBR    │
│  :8081      │     │  :8082      │     │  :8083      │
│  (Hub)      │◀────│  (Spoke)    │◀────│  (Spoke)    │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       └───────────────────┴───────────────────┘
                           │
                  ┌────────▼────────┐
                  │  MongoDB Shared │
                  │  Federation     │
                  │  Registry       │
                  └─────────────────┘
```

## Prerequisites

### System Requirements
- **Docker**: 20.10+ with Compose v2
- **Node.js**: 20.x LTS
- **OpenSSL**: 3.0+ (for certificate generation)
- **Memory**: 4GB+ available RAM
- **Disk**: 2GB+ free space

### Network Requirements
- Ports 8081-8083 available (KAS instances)
- Port 27018 available (MongoDB)
- Docker internal networking enabled

## Quick Start

### 1. Generate Certificates

```bash
cd /path/to/DIVE-V3
chmod +x kas/scripts/generate-test-certs.sh
kas/scripts/generate-test-certs.sh
```

**Expected Output:**
```
✅ CA certificate generated
✅ Certificates ready for KAS-USA
✅ Certificates ready for KAS-FRA
✅ Certificates ready for KAS-GBR
```

**Verification:**
```bash
ls -la certs/kas-federation/
# Should show: ca/, usa/, fra/, gbr/ directories
```

### 2. Start 3-KAS Environment

```bash
docker compose -f docker-compose.3kas.yml up -d
```

**Expected Output:**
```
✅ Network kas-federation-network Created
✅ Volume mongo-kas-federation-data Created
✅ Container mongodb-kas-federation Started
✅ Container kas-usa Started
✅ Container kas-fra Started
✅ Container kas-gbr Started
```

### 3. Verify Health

```bash
# Check container status
docker ps --filter "name=kas-"

# Check health endpoints
curl -k https://localhost:8081/health  # USA
curl -k https://localhost:8082/health  # FRA
curl -k https://localhost:8083/health  # GBR
```

**Expected Response (each KAS):**
```json
{
  "status": "healthy",
  "service": "dive-v3-kas",
  "version": "1.0.0-acp240",
  "features": [
    "Policy re-evaluation via OPA",
    "DEK/KEK management (mock)",
    "ACP-240 audit logging",
    "Fail-closed enforcement",
    "Prometheus metrics",
    "Multi-KAS federation"
  ]
}
```

### 4. Run Tests

```bash
cd kas

# Run all integration tests
npm test -- tests/integration/

# Run performance benchmarks
npm test -- tests/performance/

# Run audit trail tests
npm test -- tests/integration/audit-trail.test.ts

# Run specific test suites
npm test -- tests/integration/federation.test.ts
npm test -- tests/performance/federation-benchmark.test.ts
```

## Test Suites

### Integration Tests (68+ tests)
**File:** `tests/integration/federation.test.ts`

**Categories:**
1. **Single KAS Operations** (10 tests)
   - Local KAO processing
   - Result signing
   - Policy evaluation
   - DPoP verification
   - PolicyBinding validation
   - Signature verification
   - Classification caps
   - COI restrictions
   - Audit logging
   - Error handling

2. **2-KAS Federation** (15 tests)
   - Foreign KAO forwarding
   - Policy association preservation
   - Response aggregation
   - Downstream signature preservation
   - X-Forwarded-By header
   - Federation agreement validation
   - Classification caps
   - Partial failures
   - Circuit breaker
   - Audit trail correlation
   - Timeout handling
   - Retry logic
   - mTLS validation
   - Untrusted forwarder rejection
   - Max federation depth

3. **3-KAS Federation** (10 tests)
   - Multi-KAS forwarding
   - Result aggregation from all KAS
   - Mixed success/failure
   - All signatures preserved
   - Policy grouping maintained
   - Federation ID correlation
   - Complex forwarding chains
   - Loop detection
   - Depth enforcement
   - Complete audit trail

4. **Failure Scenarios** (15 tests)
   - KAS unavailability
   - Circuit breaker triggering
   - Circuit breaker recovery
   - Network timeouts
   - Connection refused
   - TLS handshake failures
   - Invalid certificates
   - Malformed responses
   - Partial KAO failures
   - Graceful degradation
   - Failure audit logging
   - Error metrics
   - MongoDB unavailability
   - OPA unavailability
   - Fail-closed security

5. **Signature Preservation** (8 tests)
   - No re-signing of downstream results
   - Signature metadata preservation
   - Client verification capability
   - Signing KAS tracking
   - Signature verification failures
   - Algorithm validation
   - Multiple signature formats
   - Signature audit trail

6. **Policy Association** (10 tests)
   - KAO grouping by policy
   - Policy forwarding
   - Response grouping maintenance
   - Multiple policies per request
   - Independent policy evaluation
   - Result grouping by policyId
   - Policy translations
   - Policy conflicts
   - PolicyBinding per group
   - Policy evaluation audit

### Performance Tests (10+ tests)
**File:** `tests/performance/federation-benchmark.test.ts`

**Metrics Measured:**
- **Latency**: p50, p95, p99, mean, min, max
- **Throughput**: requests/second, concurrent connections
- **Federation Overhead**: local vs federated latency
- **Error Rates**: timeouts, failures

**Performance Targets:**
| Scenario | p95 Latency | Throughput | Error Rate |
|----------|-------------|------------|------------|
| Single KAS | < 200ms | 100 req/s | < 5% |
| 2-KAS | < 350ms | 75 req/s | < 10% |
| 3-KAS | < 500ms | 50 req/s | < 15% |

### Audit Trail Tests (10 tests)
**File:** `tests/integration/audit-trail.test.ts`

**Verification Areas:**
1. X-Forwarded-By logging across all KAS
2. Federation request ID correlation
3. Forwarding decision logging
4. Security check auditing
5. Audit trail completeness
6. Audit log rotation
7. SIEM export compatibility
8. Compliance report generation
9. Suspicious pattern detection
10. 90-day retention verification

## Environment Configuration

### Environment Variables

**Core Configuration:**
```bash
KAS_PORT=8080
HTTPS_ENABLED=true
KAS_ID=kas-usa  # or kas-fra, kas-gbr
KAS_URL=https://kas-usa:8080
```

**Feature Flags:**
```bash
ENABLE_REWRAP_PROTOCOL=true
ENABLE_FEDERATION=true
ENABLE_DPOP=true
ENABLE_SIGNATURE_VERIFICATION=true
ENABLE_POLICY_BINDING=true
```

**Federation Settings:**
```bash
FEDERATION_TIMEOUT_MS=10000
FEDERATION_MAX_RETRIES=3
FEDERATION_MAX_DEPTH=3
FEDERATION_MTLS_ENABLED=true
```

**mTLS Configuration:**
```bash
# Per-KAS certificates
MTLS_CLIENT_CERT_KAS_FRA=/certs/usa/client.crt
MTLS_CLIENT_KEY_KAS_FRA=/certs/usa/client.key
MTLS_CA_CERT_KAS_FRA=/certs/ca/ca.crt

# Shared certificates
MTLS_CLIENT_CERT=/certs/usa/client.crt
MTLS_CLIENT_KEY=/certs/usa/client.key
MTLS_CA_CERT=/certs/ca/ca.crt
```

**Database Configuration:**
```bash
MONGODB_URL=mongodb://admin:DiveMongoTest2025!@mongodb-shared:27017/dive-v3-kas-test?authSource=admin
MONGODB_DATABASE=dive-v3-kas-test
```

## Troubleshooting

### Certificate Issues

**Problem:** Certificate generation fails
```bash
# Clean and regenerate
rm -rf certs/kas-federation
kas/scripts/generate-test-certs.sh
```

**Problem:** mTLS handshake fails
```bash
# Verify certificate validity
openssl verify -CAfile certs/kas-federation/ca/ca.crt \
  certs/kas-federation/usa/client.crt

# Check certificate dates
openssl x509 -in certs/kas-federation/usa/client.crt -noout -dates
```

### Container Issues

**Problem:** Containers won't start
```bash
# Check logs
docker logs kas-usa
docker logs kas-fra
docker logs kas-gbr
docker logs mongodb-kas-federation

# Restart environment
docker compose -f docker-compose.3kas.yml down -v
docker compose -f docker-compose.3kas.yml up -d
```

**Problem:** Health checks failing
```bash
# Check container status
docker ps --filter "name=kas-"

# Inspect health check
docker inspect kas-usa | grep -A 10 "Health"

# Manual health check
curl -k https://localhost:8081/health
```

### Network Issues

**Problem:** KAS instances can't reach each other
```bash
# Verify network
docker network inspect kas-federation-network

# Test connectivity
docker exec kas-usa ping kas-fra
docker exec kas-usa curl -k https://kas-fra:8080/health
```

**Problem:** Federation requests timing out
```bash
# Increase timeout
# Edit docker-compose.3kas.yml:
# FEDERATION_TIMEOUT_MS=20000  # increase from 10000

# Check circuit breaker
curl -k https://localhost:8081/metrics | grep circuit_breaker
```

### MongoDB Issues

**Problem:** Federation registry not loading
```bash
# Check MongoDB
docker exec mongodb-kas-federation mongosh

# Verify seed data
use dive-v3-kas-test
db.federation_spokes.find().pretty()

# Re-seed if needed
docker exec -i mongodb-kas-federation mongosh < kas/tests/fixtures/federation-seed.js
```

### Test Failures

**Problem:** Tests fail with connection errors
```bash
# Ensure containers are healthy
docker ps --filter "name=kas-" --format "{{.Names}}: {{.Status}}"

# Wait for services to be ready
sleep 30 && npm test
```

**Problem:** Performance tests fail targets
```bash
# Check system load
docker stats --no-stream

# Reduce concurrency or increase timeouts
# Edit test files to adjust expectations based on hardware
```

## Performance Optimization

### Docker Resource Limits

```yaml
# Add to docker-compose.3kas.yml services
resources:
  limits:
    cpus: '2.0'
    memory: 2G
  reservations:
    cpus: '0.5'
    memory: 512M
```

### Connection Pooling

KAS instances use connection pooling for inter-KAS communication:
- **Max Sockets**: 100 per host
- **Keep-Alive**: Enabled
- **Timeout**: 10 seconds

### Circuit Breaker Settings

```javascript
{
  errorThreshold: 50,      // % errors to trigger open
  timeout: 60000,          // ms before considering slow
  resetTimeout: 30000      // ms before attempting half-open
}
```

## Monitoring

### Prometheus Metrics

Access metrics endpoints:
```bash
curl -k https://localhost:8081/metrics  # USA
curl -k https://localhost:8082/metrics  # FRA
curl -k https://localhost:8083/metrics  # GBR
```

**Key Metrics:**
- `kas_key_requests_total{status}` - Total key requests
- `kas_federation_requests_total{target_kas,status}` - Federation requests
- `kas_circuit_breaker_state{target_kas}` - Circuit breaker status
- `kas_dek_cache_size` - DEK cache size
- `kas_request_duration_milliseconds` - Request latency

### Logs

```bash
# View live logs
docker logs -f kas-usa
docker logs -f kas-fra
docker logs -f kas-gbr

# Search for errors
docker logs kas-usa 2>&1 | grep ERROR

# Filter by request ID
docker logs kas-usa 2>&1 | grep "requestId=req-abc-123"
```

## Cleanup

### Stop Environment

```bash
# Stop containers (preserve volumes)
docker compose -f docker-compose.3kas.yml down

# Stop and remove volumes
docker compose -f docker-compose.3kas.yml down -v
```

### Remove Certificates

```bash
rm -rf certs/kas-federation
```

### Clean Docker Resources

```bash
# Remove all DIVE V3 KAS images
docker images | grep dive-v3-kas | awk '{print $3}' | xargs docker rmi

# Prune dangling images
docker image prune -f
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: KAS Phase 3.5 Tests

on: [push, pull_request]

jobs:
  integration-tests:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Generate Certificates
        run: kas/scripts/generate-test-certs.sh
      
      - name: Start 3-KAS Environment
        run: docker compose -f docker-compose.3kas.yml up -d
      
      - name: Wait for Services
        run: sleep 30
      
      - name: Run Integration Tests
        run: cd kas && npm test -- tests/integration/
      
      - name: Run Performance Tests
        run: cd kas && npm test -- tests/performance/
      
      - name: Cleanup
        if: always()
        run: docker compose -f docker-compose.3kas.yml down -v
```

## Additional Resources

### Documentation
- **ACP-240 Specification**: `/kas/ACP240-KAS.md`
- **Gap Analysis**: `/kas/acp240-gap-analysis.json`
- **Implementation Plan**: `/kas/IMPLEMENTATION-HANDOFF.md`
- **Phase 3.4 Summary**: `/kas/PHASE3.4-SUMMARY.md`

### Scripts
- **Certificate Generation**: `/kas/scripts/generate-test-certs.sh`
- **Health Verification**: `/kas/scripts/verify-3kas-health.sh`

### Test Fixtures
- **MongoDB Seed**: `/kas/tests/fixtures/federation-seed.js`
- **Test Utilities**: Exported from `federation.test.ts`

## Support

For issues or questions:
1. Check this README troubleshooting section
2. Review test output and logs
3. Consult Phase 3.5 documentation
4. Check Docker and system logs

---

**Last Updated**: 2026-01-30  
**Version**: Phase 3.5 (75% ACP-240 Compliant)  
**Status**: Integration Testing Ready ✅
