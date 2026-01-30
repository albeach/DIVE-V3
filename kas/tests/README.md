# ACP-240 KAS Phase 3.5: 3-KAS Integration Testing

## Overview

Phase 3.5 implements comprehensive multi-KAS integration testing to validate federation behavior across 3 KAS instances (USA, FRA, GBR).

## Test Environment

### Infrastructure Components

- **3 KAS Instances**: USA (port 8081), FRA (port 8082), GBR (port 8083)
- **Shared MongoDB**: Port 27018, contains federation registry
- **mTLS Certificates**: PKI-based trust for inter-KAS communication
- **Docker Network**: Isolated `kas-federation-network` bridge

### Setup Instructions

1. **Generate Test Certificates**

```bash
cd kas
./scripts/generate-test-certs.sh
```

This creates:
- CA certificate for trust chain
- Client/server certificates for each KAS (USA, FRA, GBR)
- All certificates in `certs/kas-federation/`

2. **Start 3-KAS Environment**

```bash
docker-compose -f docker-compose.3kas.yml up -d
```

3. **Verify Health**

```bash
./kas/scripts/verify-3kas-health.sh
```

This checks:
- All containers running
- Health endpoints responding
- Network connectivity between KAS
- mTLS certificates present
- MongoDB federation registry loaded

## Test Suites

### 1. Integration Tests (68+ tests)

**File**: `kas/tests/integration/federation.test.ts`

**Coverage**:
- Single KAS Operations (10 tests)
- 2-KAS Federation (15 tests)
- 3-KAS Federation (10 tests)
- Failure Scenarios (15 tests)
- Signature Preservation (8 tests)
- Policy Association (10 tests)

**Run**:
```bash
npm run test:integration
```

### 2. Performance Benchmarks (10 tests)

**File**: `kas/tests/performance/federation-benchmark.test.ts`

**Metrics**:
- Single KAS: p95 < 200ms, 100 req/s
- 2-KAS: p95 < 350ms, 75 req/s
- 3-KAS: p95 < 500ms, 50 req/s
- Federation overhead: < 150ms per hop
- Circuit breaker recovery: < 60s

**Run**:
```bash
npm run test:performance
```

**Output**: Performance report saved to `kas/tests/performance/report.json`

### 3. E2E Scenarios (15 tests)

**File**: `kas/tests/integration/e2e-scenarios.test.ts`

**Scenarios**:
1. Local Only (USA-only resource)
2. Simple Federation (USA → FRA)
3. Multi-National Resource (USA + FRA + GBR)
4. Circuit Breaker (FRA down)
5. Partial Failure (mixed results)
6. Federation Loop Prevention
7. Depth Limit Enforcement
8. Classification Cap Enforcement

**Run**:
```bash
npm run test:e2e
```

### 4. Audit Trail Verification (10 tests)

**File**: `kas/tests/integration/audit-trail.test.ts`

**Coverage**:
- X-Forwarded-By logging
- Federation request ID correlation
- Forwarding decision logging
- Security check auditing
- Audit trail completeness
- Log rotation
- SIEM export compatibility
- Compliance reporting
- Suspicious pattern detection
- 90-day retention

**Run**:
```bash
npm run test:audit
```

## Test Data

### Federation Registry (MongoDB)

Seeded via `kas/tests/fixtures/federation-seed.js`:

```javascript
{
  spokeId: "kas-usa",
  kasUrl: "https://kas-usa:8080/rewrap",
  supportedCountries: ["USA", "CAN", "GBR"],
  supportedCOIs: ["US-ONLY", "FVEY", "NATO"],
  federationAgreements: {
    "kas-fra": { maxClassification: "SECRET", ... },
    "kas-gbr": { maxClassification: "TOP_SECRET", ... }
  }
}
```

### Test Utilities

Located in `kas/tests/integration/federation.test.ts`:

- `generateKeyPair()`: RSA 2048-bit key generation
- `generateTestJWT()`: Test JWT token creation
- `wrapKey()`: RSA-OAEP key wrapping
- `computePolicyBinding()`: HMAC-SHA256 policy binding
- `signKAO()`: RS256 signature generation

## Success Criteria

### Phase 3.5 Completion

- ✅ 3-KAS environment operational
- ✅ All KAS instances healthy and connected
- ✅ MongoDB federation registry populated
- ✅ mTLS working between all KAS pairs
- ✅ 68+ integration tests passing
- ✅ Performance targets met:
  - Single KAS: p95 < 200ms
  - 2-KAS: p95 < 350ms
  - 3-KAS: p95 < 500ms
  - Throughput: 50+ req/s sustained
- ✅ Signature preservation verified across all hops
- ✅ Policy associations maintained in responses
- ✅ Audit trail complete and correlated
- ✅ Circuit breaker functional
- ✅ Federation depth limiting enforced
- ✅ Loop detection working

## Troubleshooting

### Common Issues

**1. Containers fail to start**

Check certificate permissions:
```bash
chmod -R 644 certs/kas-federation/*/*.crt
chmod -R 600 certs/kas-federation/*/*.key
```

**2. mTLS handshake failures**

Verify certificates:
```bash
openssl verify -CAfile certs/kas-federation/ca/ca.crt certs/kas-federation/usa/client.crt
```

**3. Federation timeouts**

Increase timeout in docker-compose:
```yaml
environment:
  - FEDERATION_TIMEOUT_MS=15000
```

**4. MongoDB connection errors**

Check MongoDB logs:
```bash
docker logs mongodb-kas-federation
```

**5. Test failures**

Enable debug logging:
```bash
export DEBUG=kas:*
npm run test:integration
```

### Health Check Endpoints

- KAS-USA: https://localhost:8081/health
- KAS-FRA: https://localhost:8082/health
- KAS-GBR: https://localhost:8083/health
- MongoDB: mongodb://localhost:27018

### Log Access

View KAS logs:
```bash
docker logs kas-usa -f
docker logs kas-fra -f
docker logs kas-gbr -f
```

View federation events:
```bash
docker logs kas-usa | grep FEDERATION
```

## Next Steps

After Phase 3.5 completion:

**Phase 4: Optional Features & Optimization (Week 15-18)**
- EncryptedMetadata decryption
- Key split recombination (All-Of mode)
- Any-Of alternate routing
- AWS KMS integration
- Performance optimization

**Phase 5: Documentation, Testing & Launch (Week 19-20)**
- API documentation (OpenAPI 3.0)
- Operational runbooks
- Comprehensive testing (400+ tests)
- Security audit
- Production rollout

## References

- **ACP-240 SUPP-5(A) AMDT 1**: Rewrap Protocol v1.0 (08 MAY 2025)
- **RFC 9449**: OAuth 2.0 Demonstrable Proof-of-Possession
- **Gap Analysis**: `kas/acp240-gap-analysis.json`
- **Implementation Plan**: `kas/IMPLEMENTATION-HANDOFF.md`
- **Phase 3.4 Summary**: `kas/PHASE3.4-SUMMARY.md`

## Contact

For issues or questions:
- Review test logs in `kas/tests/`
- Check `kas/scripts/verify-3kas-health.sh` output
- Consult Phase 3.5 Continuation Prompt: `kas/PHASE3.5-CONTINUATION-PROMPT.md`
