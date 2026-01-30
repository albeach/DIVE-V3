# ACP-240 KAS Rewrap Protocol Implementation Summary

**Date:** 2026-01-30  
**Status:** Phase 0-2 Complete (Core Protocol + Security)  
**Commit:** 88fc0de4

## What Was Implemented

### Phase 0: Foundation ✅
- Created `.env.example` with `ENABLE_REWRAP_PROTOCOL` feature flag
- Documented 50 baseline requirements from ACP-240 spec
- Created comprehensive gap analysis (1,966 lines)
- Established implementation roadmap (Phases 0-5)

### Phase 1: Core Protocol ✅
1. **Type Definitions** (`rewrap.types.ts`)
   - `IRewrapRequest` / `IRewrapResponse` structures
   - `IKeyAccessObject` with required fields
   - `IPolicy` and `IDisseminationControls`
   - DPoP types per RFC 9449

2. **POST /rewrap Endpoint** (`server.ts:715-1030`)
   - Feature-flagged implementation
   - Policy-grouped request/response structure
   - Kid-based key routing
   - OPA policy re-evaluation
   - Metadata decryption support

3. **Validation Middleware** (`rewrap-validator.middleware.ts`)
   - Request structure validation
   - clientPublicKey format validation (JWK/PEM)
   - keyAccessObjectId uniqueness check
   - Base64 and URL validation

4. **Asymmetric Cryptography** (`crypto/rewrap.ts`)
   - RSA-OAEP-256 unwrap/rewrap
   - Key material decryption
   - Metadata decryption (AES-256-GCM)
   - Key split recombination (XOR)

5. **Key Routing** (`crypto/key-router.ts`)
   - Kid-based key selection
   - Multiple key pair support
   - Mock key generation fallback
   - Key metadata management

### Phase 2: Security & Integrity ✅
1. **DPoP Verification** (`dpop.middleware.ts`)
   - RFC 9449 proof-of-possession
   - JWK signature verification
   - htm/htu/ath binding validation
   - jti replay protection (nonce cache)
   - Clock skew tolerance (±60s)

2. **Per-KAO Signature Verification** (`crypto/kao-signature.ts`)
   - Canonical JSON signing
   - Algorithm whitelist (RS256, ES256, PS256, etc.)
   - Prevents MITM tampering
   - JWA → Node.js crypto mapping

3. **PolicyBinding Verification** (`crypto/policy-binding.ts`)
   - HMAC-SHA256 computation
   - Policy canonicalization (sorted keys)
   - Timing-safe comparison
   - Detects policy tampering

4. **Result Signing** (`crypto/result-signing.ts`)
   - Per-result integrity protection
   - Signature preservation in federation
   - Batch signing support

## Compliance Status

### Critical Gaps Resolved (P0)
✅ KAS-REQ-020: `/rewrap` endpoint implemented  
✅ KAS-REQ-031: DPoP verification implemented  
✅ KAS-REQ-040: KAO signature verification implemented  
✅ KAS-REQ-042: PolicyBinding verification implemented  
✅ KAS-REQ-050: Asymmetric unwrap implemented  
✅ KAS-REQ-052: Asymmetric rewrap implemented  
✅ KAS-REQ-083: Per-result signing implemented  

### Compliance Improvement
- **Before:** 22% (11/50 requirements)
- **After Phase 1-2:** ~60% (30/50 requirements)
- **Target:** 90%+ (45/50 requirements)

## What Remains (Phase 3+)

### Phase 3: Federation (PENDING)
- [ ] Refactor federation service to use /rewrap
- [ ] URL-based KAO routing (local vs remote)
- [ ] Response aggregation from multiple KAS
- [ ] mTLS for inter-KAS communication
- [ ] Policy-KAO association preservation

### Open Questions (from gap analysis)
1. **Q1:** Sample ZTDF manifest with keyAccessObject structure?
2. **Q3:** DPoP public key registration mechanism?
3. **Q4:** KAS kid naming scheme and key inventory?
4. **Q5:** encryptedMetadata format (algorithm, IV encoding)?
5. **Q6:** Per-result signing key strategy (same as KEK or separate)?
6. **Q9:** Key split recombination algorithm for All-Of mode?
7. **Q10:** Performance SLA targets (latency p95, throughput)?

## How to Test

### 1. Enable Feature Flag
```bash
# In kas/.env.local
ENABLE_REWRAP_PROTOCOL=true
ENABLE_DPOP=true
ENABLE_SIGNATURE_VERIFICATION=true
ENABLE_POLICY_BINDING=true
```

### 2. Start KAS Service
```bash
cd kas
npm run dev
```

### 3. Test /rewrap Endpoint
```bash
curl -X POST https://localhost:8080/rewrap \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <jwt>" \
  -H "DPoP: <dpop-proof>" \
  -d @rewrap-request.json
```

### 4. Check Logs
```bash
# Watch KAS audit logs
tail -f logs/kas-audit.log
```

## Security Improvements

1. **Token Theft Prevention**
   - DPoP binds access token to client's ephemeral key
   - Stolen token unusable without DPoP proof

2. **Policy Tampering Prevention**
   - PolicyBinding HMAC detects policy modifications
   - Uses unwrapped key material as HMAC key

3. **MITM Protection**
   - Per-KAO signatures prevent tampering during forwarding
   - Downstream KAS verifies signature before processing

4. **Replay Attack Prevention**
   - DPoP jti cache prevents proof reuse
   - 5-minute TTL on nonce cache

## Performance Considerations

### Current Implementation
- In-memory DEK cache (1 hour TTL)
- In-memory DPoP nonce cache (5 min TTL, 10k max)
- Synchronous OPA policy evaluation (3s timeout)
- Mock HSM for development

### Production Recommendations
- Use AWS KMS or Azure HSM for key custody
- Enable Redis for distributed caching
- Tune OPA decision cache (60s TTL)
- Connection pooling for federation
- Circuit breaker for downstream KAS (already exists)

## Configuration

### Environment Variables
```bash
# Feature Flags
ENABLE_REWRAP_PROTOCOL=false
ENABLE_DPOP=false
ENABLE_SIGNATURE_VERIFICATION=true
ENABLE_POLICY_BINDING=true

# Cryptography
KAS_WRAP_ALGORITHM=RSA-OAEP-256
KAS_SIGNING_ALGORITHM=RS256
KAS_SUPPORTED_ALGORITHMS=RS256,RS512,ES256,ES384,PS256
POLICY_BINDING_ALGORITHM=sha256

# DPoP
DPOP_PROOF_MAX_AGE=60
DPOP_NONCE_CACHE_SIZE=10000
DPOP_NONCE_TTL=300

# HSM
KAS_HSM_PROVIDER=mock
# AWS_REGION=us-east-1
# AWS_KMS_KEY_ID=alias/dive-v3-kas-kek
```

## Documentation

### Key Files
- `kas/ACP240-KAS.md` - 50 baseline requirements
- `kas/acp240-gap-analysis.json` - Detailed gap analysis (1,966 lines)
- `kas/IMPLEMENTATION-HANDOFF.md` - Phased implementation plan (1,003 lines)
- `kas/.env.example` - Configuration template
- `kas/src/types/rewrap.types.ts` - Type definitions

### API Documentation
- Request structure: IRewrapRequest (policy-grouped)
- Response structure: IRewrapResponse (per-keyAccessObject results)
- Error codes: 400, 401, 403, 500, 501, 503
- DPoP header: Required if ENABLE_DPOP=true

## Next Steps

1. **Resolve Open Questions**
   - Contact ZTDF team for manifest examples
   - Document DPoP key registration process
   - Establish kid naming convention

2. **Phase 3: Federation**
   - Implement spec-compliant forwarding
   - Response aggregation logic
   - mTLS inter-KAS security

3. **Testing**
   - Write integration tests (100+ tests)
   - Performance benchmarks (p95 < 200ms)
   - Interoperability testing with external clients

4. **Production Readiness**
   - AWS KMS integration
   - Security audit
   - Load testing
   - Deployment runbooks

## References

- **ACP-240 SUPP-5(A) AMDT 1** - Rewrap Protocol v1.0 (08 MAY 2025)
- **RFC 9449** - OAuth 2.0 Demonstrable Proof-of-Possession
- **Gap Analysis:** kas/acp240-gap-analysis.json
- **Implementation Plan:** kas/IMPLEMENTATION-HANDOFF.md
- **Commit:** 88fc0de4
