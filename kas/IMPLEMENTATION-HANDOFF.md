# ACP-240 KAS Rewrap Protocol Implementation Handoff

## Session Context & Background

### What Was Done
A comprehensive evidence-based gap analysis was performed comparing the current DIVE V3 Key Access Service (KAS) implementation against the ACP-240 SUPP-5(A) AMDT 1 rewrap protocol v1.0 specification dated 08 MAY 2025.

**Analysis Scope:**
- 50 baseline requirements from ACP-240 specification
- 13 implementation files analyzed (932 lines of server code, type definitions, JWT validation, federation service, etc.)
- Evidence-based assessment with explicit citations
- Security and interoperability focus

**Key Finding:**
The current implementation uses a **custom `/request-key` API** that does NOT conform to the ACP-240 rewrap protocol. While core functionality exists (policy evaluation, JWT authentication, federation), the protocol interface is incompatible with spec-compliant clients.

**Compliance Results:**
- **22%** (11/50) fully implemented
- **30%** (15/50) partially implemented
- **46%** (23/50) not implemented
- **2%** (1/50) not applicable

### Critical Gaps Identified

1. **Missing Core Protocol Endpoint** (P0, CRITICAL)
   - No `/rewrap` endpoint exists (uses `/request-key` instead)
   - Request/response structures incompatible with spec
   - Zero interoperability with ACP-240 clients

2. **No DPoP Verification** (P0, CRITICAL)
   - RFC 9449 proof-of-possession not implemented
   - Vulnerable to token theft and replay attacks
   - Missing htm, htu, ath binding verification

3. **No PolicyBinding Verification** (P0, CRITICAL)
   - Cannot detect policy tampering
   - Attacker can swap policy on valid keyAccessObject
   - Missing HMAC-based integrity protection

4. **No Per-KAO Signature Verification** (P0, CRITICAL)
   - Cannot verify keyAccessObject integrity
   - Vulnerable to MITM attacks during forwarding
   - Missing signature verification before processing

5. **Non-Compliant Federation** (P0, CRITICAL)
   - Federation exists but uses custom protocol
   - Cannot interoperate with other ACP-240 KAS instances
   - Missing policy-KAO association preservation
   - No per-result signing

### Artifacts Created

1. **Gap Analysis JSON** (`kas/acp240-gap-analysis.json`)
   - Machine-readable format (1,966 lines)
   - Complete requirement assessments
   - Remediation guidance with evidence citations
   - Prioritized backlog (15 items)
   - 10 open questions requiring evidence

2. **Implementation Plan** (`~/.cursor/plans/acp-240_kas_gap_analysis_84f65101.plan.md`)
   - Human-readable detailed findings
   - Requirements scorecard (50 requirements)
   - Cross-cutting observations
   - Verification test cases
   - Quick wins identified

3. **Baseline Requirements** (`kas/ACP240-KAS.md`)
   - 50 requirements extracted from ACP-240 spec
   - YAML format with trace to spec paragraphs
   - Categorized by: API, AuthN, Integrity, Cryptography, Federation, etc.

---

## Phased Implementation Plan

### PHASE 0: Foundation & Planning (Week 1-2)

**Objective:** Establish implementation infrastructure and resolve open questions

**SMART Goals:**
- **Specific:** Set up development environment, resolve 10 open questions, establish test framework
- **Measurable:** 10/10 open questions answered, test harness operational, CI/CD pipeline configured
- **Achievable:** Requires coordination with ZTDF team, key management team, and security architects
- **Relevant:** Foundation required before protocol implementation can begin
- **Time-bound:** Complete by end of Week 2

**Tasks:**
1. **Environment Setup**
   - Create feature branch: `feature/acp240-rewrap-protocol`
   - Set up test environment with separate KAS instance
   - Configure HTTPS_ENABLED=true enforcement
   - Add feature flag: `ENABLE_REWRAP_PROTOCOL=false` (default off)

2. **Resolve Open Questions** (from gap analysis JSON, section "open_questions")
   - Q1: Obtain sample ZTDF manifest with keyAccessObject structure (type/protocol fields)
   - Q2: Determine if signedRequestToken wrapper is used by clients
   - Q3: Document DPoP public key registration mechanism
   - Q4: Inventory KAS key pairs and document kid naming scheme
   - Q5: Obtain encryptedMetadata format specification (algorithm, IV encoding)
   - Q6: Clarify per-result signing key strategy (same as KEK or separate?)
   - Q7: Define supported algorithm whitelist for signature verification
   - Q8: Establish quantum-resistant crypto adoption timeline
   - Q9: Document key split recombination algorithm for All-Of mode
   - Q10: Define performance SLA targets (latency p95, throughput)

3. **Test Infrastructure**
   - Set up DPoP proof generation test utilities
   - Create keyAccessObject signature test fixtures
   - Build policyBinding computation test helpers
   - Establish integration test framework for /rewrap endpoint
   - Set up test KAS instances for federation testing

**Success Criteria:**
- ✅ All 10 open questions documented with answers
- ✅ Development environment operational with feature flag
- ✅ Test framework can generate valid ACP-240 requests
- ✅ CI/CD pipeline runs OPA tests + new protocol tests
- ✅ Performance baseline established (current /request-key metrics)

**Deliverables:**
- `kas/docs/open-questions-resolved.md` - Answers to all open questions
- `kas/docs/test-strategy.md` - Test approach for rewrap protocol
- `kas/tests/fixtures/` - Test data for ACP-240 protocol
- `kas/.env.example` updated with ENABLE_REWRAP_PROTOCOL flag

---

### PHASE 1: Core Protocol Implementation (Week 3-6)

**Objective:** Implement /rewrap endpoint with spec-compliant request/response handling

**SMART Goals:**
- **Specific:** Implement POST /rewrap endpoint, request validation, spec-compliant response structure
- **Measurable:** 5/5 P0 critical gaps resolved, 25+ integration tests passing, OpenAPI spec complete
- **Achievable:** Core team of 2 backend engineers + 1 crypto engineer for 4 weeks
- **Relevant:** Enables basic ACP-240 interoperability for single-KAS scenarios
- **Time-bound:** Complete by end of Week 6

**Tasks:**

#### 1.1: Type Definitions & Request Validation (Week 3)
- Create `kas/src/types/rewrap.types.ts` with spec-compliant interfaces:
  ```typescript
  interface IRewrapRequest {
    clientPublicKey: string; // JWK or PEM
    requests: Array<{
      policy: IPolicy;
      keyAccessObjects: IKeyAccessObject[];
    }>;
  }

  interface IKeyAccessObject {
    keyAccessObjectId: string; // Unique across request
    wrappedKey: string;
    url: string;
    kid: string;
    policyBinding: string; // Base64 HMAC-SHA256
    sid?: string;
    encryptedMetadata?: string;
    signature: {
      alg: string; // RS256, ES256, etc.
      sig: string; // Base64
    };
  }

  interface IRewrapResponse {
    responses: Array<{
      policyId: string;
      results: Array<{
        keyAccessObjectId: string;
        status: 'success' | 'error';
        kasWrappedKey?: string;
        metadata?: any;
        error?: string;
        signature: {
          alg: string;
          sig: string;
        };
        sid?: string;
      }>;
    }>;
  }
  ```

- Create request validation middleware: `kas/src/middleware/rewrap-validator.middleware.ts`
  - Validate clientPublicKey format (JWK or PEM)
  - Validate requests array non-empty
  - Validate keyAccessObjectId uniqueness across entire request
  - Validate required fields per keyAccessObject
  - Return 400 with specific error messages on validation failure

**Tests:** 15 validation test cases (missing fields, duplicate IDs, invalid formats)

#### 1.2: POST /rewrap Endpoint Skeleton (Week 3)
- Add endpoint in `kas/src/server.ts` around line 715:
  ```typescript
  app.post('/rewrap',
    authenticateJWT,
    validateContentType,
    validateRewrapRequest,
    async (req: Request, res: Response) => {
      // Implement in subsequent tasks
    }
  );
  ```

- Gate behind feature flag check at start of handler
- Return 501 Not Implemented if feature disabled
- Add metrics collection for /rewrap endpoint
- Configure CORS for /rewrap

**Tests:** 5 tests (feature flag on/off, CORS, Content-Type validation)

#### 1.3: Rewrap Cryptography (Week 4)
- Create `kas/src/utils/crypto/rewrap.ts`:
  - `unwrapWithKASKey(wrappedKey: string, kasPrivateKey: KeyObject): Buffer`
    - Support RSA-OAEP-256 decryption
    - Support ECDH-ES+A256KW decryption
  - `rewrapToClientKey(dek: Buffer, clientPublicKey: JWK): string`
    - Support RSA-OAEP-256 encryption
    - Support ECDH-ES+A256KW encryption
  - Return kasWrappedKey as Base64

- Update `kas/src/utils/hsm-provider.ts`:
  - Implement asymmetric unwrap in MockHSMProvider
  - Prepare for AWS KMS integration (stub out)

**Tests:** 20 crypto tests (RSA/ECDH unwrap/rewrap, algorithm support, error cases)

#### 1.4: Kid-Based Key Routing (Week 4)
- Create `kas/src/utils/crypto/key-router.ts`:
  ```typescript
  class KeyRouter {
    getPrivateKeyByKid(kid: string): KeyObject | null;
    listAvailableKids(): string[];
  }
  ```

- Load KAS key pairs on startup indexed by kid
- Select correct private key based on keyAccessObject.kid
- Return 400 if kid is unknown

**Tests:** 8 key routing tests (valid kid, unknown kid, multiple keys)

#### 1.5: Response Structure Builder (Week 4)
- Implement response aggregation logic in /rewrap handler
- Group results by policyId
- Build per-keyAccessObject result structure
- Include all required fields (keyAccessObjectId, status, signature, sid)
- Conditional fields: kasWrappedKey on success, error on failure

**Tests:** 12 response building tests (single policy, multiple policies, mixed outcomes)

#### 1.6: Integration (Week 5-6)
- Wire up all components in /rewrap handler
- Implement request → response flow:
  1. Validate request structure
  2. For each request group:
     a. Extract policy and keyAccessObjects
     b. For each keyAccessObject:
        - Route kid → private key
        - Unwrap wrappedKey
        - Evaluate policy (reuse existing OPA logic)
        - Rewrap to clientPublicKey (if authorized)
        - Build result
  3. Aggregate results by policyId
  4. Return IRewrapResponse

- Add comprehensive logging
- Add error handling for each step
- Maintain backward compatibility for /request-key

**Tests:** 30+ integration tests (happy path, error paths, edge cases)

**Success Criteria:**
- ✅ POST /rewrap endpoint operational behind feature flag
- ✅ Accepts spec-compliant request structure
- ✅ Returns spec-compliant response structure
- ✅ Kid-based key routing working
- ✅ Rewrap crypto (unwrap + rewrap) functional
- ✅ All Phase 1 tests passing (90+ tests)
- ✅ OpenAPI specification documented
- ✅ /request-key endpoint still functional (backward compatibility)

**Deliverables:**
- Working /rewrap endpoint (feature-flagged)
- `kas/docs/rewrap-api.yaml` - OpenAPI 3.0 specification
- `kas/src/types/rewrap.types.ts` - Complete type definitions
- 90+ passing integration tests
- Performance benchmarks for /rewrap vs /request-key

---

### PHASE 2: Security & Integrity (Week 7-10)

**Objective:** Implement DPoP verification, signature verification, and policyBinding verification

**SMART Goals:**
- **Specific:** Add DPoP, per-KAO signatures, policyBinding verification per RFC 9449 and ACP-240
- **Measurable:** 3 critical security gaps resolved, 50+ security tests passing, penetration test passed
- **Achievable:** Security engineer + crypto engineer for 4 weeks
- **Relevant:** Closes critical security vulnerabilities (token theft, policy tampering, MITM)
- **Time-bound:** Complete by end of Week 10

**Tasks:**

#### 2.1: DPoP Verification Implementation (Week 7-8)
- Install dependencies: Consider `@auth0/node-dpop` or manual RFC 9449 implementation
- Create `kas/src/middleware/dpop.middleware.ts`:
  ```typescript
  async function verifyDPoP(req, res, next) {
    // 1. Extract DPoP header and Authorization header
    // 2. Decode DPoP JWT header to get jwk
    // 3. Verify DPoP JWT signature using jwk
    // 4. Validate claims:
    //    - htm === 'POST'
    //    - htu === full URL of /rewrap endpoint
    //    - ath === Base64Url(SHA256(access_token))
    //    - jti unique (check against nonce cache)
    //    - iat within ±60 seconds
    // 5. Store dpopPublicKey in req for potential binding
    // 6. Call next() or return 401
  }
  ```

- Integrate with existing `kas/src/utils/replay-protection.ts` for jti tracking
- Apply middleware to /rewrap endpoint: `app.post('/rewrap', verifyDPoP, ...)`
- Configure DPoP as mandatory (no bypass)

**Tests:** 25 DPoP tests (valid proof, replay, wrong htm/htu/ath, clock skew, malformed)

#### 2.2: Per-KAO Signature Verification (Week 8)
- Create `kas/src/utils/crypto/kao-signature.ts`:
  ```typescript
  function verifyKAOSignature(
    kao: IKeyAccessObject,
    trustedPublicKey: KeyObject
  ): { valid: boolean; reason?: string } {
    // 1. Extract signature from kao
    // 2. Create canonical payload (kao without signature field)
    // 3. Canonicalize JSON (sorted keys, no whitespace)
    // 4. Verify signature using crypto.createVerify(kao.signature.alg)
    // 5. Return validation result
  }
  ```

- Obtain trusted public key from:
  - ZTDF manifest (if available)
  - KAS registry (for federated KAOs)
  - Environment config

- Add verification step in /rewrap handler before processing each KAO
- Return 400 Bad Request with specific error if signature invalid

**Tests:** 20 signature verification tests (valid, tampered wrappedKey, tampered kid, algorithm mismatch)

#### 2.3: PolicyBinding Verification (Week 9)
- Create `kas/src/utils/crypto/policy-binding.ts`:
  ```typescript
  function canonicalizePolicy(policy: IPolicy): string {
    // Deterministic JSON serialization
    return JSON.stringify(policy, Object.keys(policy).sort());
  }

  function verifyPolicyBinding(
    policy: IPolicy,
    keySplit: Buffer,
    providedBinding: string
  ): boolean {
    const policyJson = canonicalizePolicy(policy);
    const expectedBinding = crypto
      .createHmac('sha256', keySplit)
      .update(policyJson, 'utf8')
      .digest('base64');
    return expectedBinding === providedBinding;
  }
  ```

- Add verification step in /rewrap handler after unwrapping key material
- Use unwrapped key split (NOT wrapped key) as HMAC key
- Return 400 Bad Request with "Policy binding verification failed" if mismatch

**Tests:** 18 policyBinding tests (valid, tampered policy, wrong key, algorithm tests)

#### 2.4: Per-Result Signing (Week 9)
- Create `kas/src/utils/crypto/result-signing.ts`:
  ```typescript
  function signResult(
    result: {
      keyAccessObjectId: string;
      status: string;
      kasWrappedKey?: string;
    },
    kasPrivateKey: KeyObject,
    algorithm: string = 'RS256'
  ): { alg: string; sig: string } {
    const payload = JSON.stringify(result, Object.keys(result).sort());
    const signer = crypto.createSign(algorithm);
    signer.update(payload);
    return {
      alg: algorithm,
      sig: signer.sign(kasPrivateKey, 'base64')
    };
  }
  ```

- Sign each result before including in response
- Use KAS signing key (may be same as KEK or separate - verify in Phase 0)

**Tests:** 12 result signing tests (valid signature generation, client verification)

#### 2.5: Security Hardening (Week 10)
- Add Content-Type validation middleware
- Enforce HTTPS (remove HTTP fallback in production)
- Add rate limiting on /rewrap endpoint
- Implement request size limits
- Add security headers (HSTS, CSP, etc.)
- Audit log all authentication/authorization failures

**Tests:** 15 security hardening tests (rate limit, oversized request, HTTP rejection)

#### 2.6: Penetration Testing (Week 10)
- Run penetration tests against /rewrap endpoint:
  - Token theft scenario (DPoP should prevent)
  - Policy tampering scenario (policyBinding should detect)
  - MITM attack during forwarding (signatures should detect)
  - Replay attacks (DPoP jti should prevent)
  - Signature algorithm downgrade attempts

**Success Criteria:**
- ✅ DPoP verification operational and enforced
- ✅ All keyAccessObject signatures verified before processing
- ✅ All policyBinding values verified after unwrap
- ✅ All results signed with KAS private key
- ✅ 90+ security tests passing
- ✅ Penetration test report shows no critical vulnerabilities
- ✅ Security audit passed

**Deliverables:**
- DPoP middleware with RFC 9449 compliance
- Signature verification for KAO and results
- PolicyBinding verification implementation
- Security test suite (90+ tests)
- Penetration test report
- Security audit documentation

---

### PHASE 3: Federation & Brokering (Week 11-14)

**Objective:** Refactor federation to use spec-compliant /rewrap protocol with response aggregation

**SMART Goals:**
- **Specific:** Enable multi-KAS brokering using /rewrap forwarding with policy preservation
- **Measurable:** 6 federation requirements implemented, 40+ federation tests passing, 2-KAS demo working
- **Achievable:** Backend engineer + platform engineer for 4 weeks
- **Relevant:** Enables coalition interoperability with other ACP-240 KAS instances
- **Time-bound:** Complete by end of Week 14

**Tasks:**

#### 3.1: Foreign KAO Detection (Week 11)
- Implement URL-based routing in /rewrap handler:
  ```typescript
  function determineTargetKAS(kao: IKeyAccessObject): 'local' | string {
    // Parse kao.url to extract KAS identifier
    // Match against local KAS URL
    // Return 'local' or kasId from registry
  }
  ```

- Group keyAccessObjects by target KAS
- Separate local KAOs from foreign KAOs in each policy group

**Tests:** 10 routing tests (local, single foreign KAS, multiple foreign KAS)

#### 3.2: Spec-Compliant Forwarding (Week 11-12)
- Refactor `kas/src/services/kas-federation.service.ts`:
  - Change from custom `/request-key` to `/rewrap` forwarding
  - Preserve policy-KAO associations when forwarding
  - Forward clientPublicKey to downstream KAS
  - Forward Authorization and DPoP headers
  - Add X-Forwarded-By header for audit trail

- Update HTTP client in federation service to use /rewrap endpoint
- Implement request structure preservation:
  ```typescript
  const forwardRequest: IRewrapRequest = {
    clientPublicKey: originalRequest.clientPublicKey,
    requests: [{
      policy: requestGroup.policy,
      keyAccessObjects: foreignKAOsForThisKAS
    }]
  };
  ```

**Tests:** 15 forwarding tests (single KAS, multiple KAS, header propagation)

#### 3.3: Response Aggregation (Week 12-13)
- Implement response merging logic:
  ```typescript
  async function aggregateResponses(
    localResults: IKeyAccessObjectResult[],
    downstreamResponses: IRewrapResponse[],
    policyId: string
  ): Promise<IPolicyGroupResponse> {
    // 1. Extract results from all downstream responses
    // 2. Merge with local results
    // 3. Preserve per-result signatures (don't re-sign)
    // 4. Maintain keyAccessObjectId correlation
    // 5. Return aggregated response for this policy
  }
  ```

- Preserve per-result signatures from downstream KAS (don't re-sign foreign results)
- Aggregate results by policyId
- Handle partial failures (some KAS succeed, some fail)

**Tests:** 20 aggregation tests (2 KAS, 3 KAS, mixed success/failure, signature preservation)

#### 3.4: Federation Trust & Security (Week 13)
- Implement mTLS for inter-KAS communication:
  - Load client certificates from kas-registry.json
  - Configure HTTPS agent with mutual TLS
  - Verify downstream KAS certificates

- Add federation validation middleware:
  - Verify X-Forwarded-By header
  - Check federation agreements (max classification, allowed COIs)
  - Validate circuit breaker state before forwarding

- Implement KAO signature verification at receiving KAS to prevent intermediary tampering

**Tests:** 18 federation security tests (mTLS, forwarder validation, tamper detection)

#### 3.5: Multi-KAS Integration Testing (Week 14)
- Set up 3-KAS test environment (USA, FRA, GBR)
- Run end-to-end tests:
  - USA client requests KAOs from FRA and GBR
  - All KAOs processed and aggregated in single response
  - Per-result signatures verified
  - Policy associations preserved
  - Audit logs show federation trail

- Performance testing:
  - Measure latency overhead of forwarding
  - Test throughput with 10+ concurrent federated requests
  - Validate circuit breaker behavior on KAS failure

**Tests:** 25 multi-KAS integration tests

**Success Criteria:**
- ✅ Foreign KAOs correctly routed to target KAS instances
- ✅ Policy-KAO associations preserved during forwarding
- ✅ Responses from multiple KAS aggregated correctly
- ✅ Per-result signatures preserved (not re-signed)
- ✅ mTLS working for inter-KAS communication
- ✅ 3-KAS demo showing end-to-end federation
- ✅ 68+ federation tests passing
- ✅ Federation audit trail complete

**Deliverables:**
- Refactored federation service using /rewrap protocol
- Response aggregation logic
- mTLS inter-KAS security
- 3-KAS demo environment
- Federation test suite (68+ tests)
- Federation troubleshooting guide

---

### PHASE 4: Optional Features & Optimization (Week 15-18)

**Objective:** Implement encryptedMetadata, Any-Of/All-Of modes, and production HSM integration

**SMART Goals:**
- **Specific:** Add metadata decryption, key split recombination, AWS KMS integration
- **Measurable:** 8 optional requirements implemented, production HSM operational, performance targets met
- **Achievable:** Crypto engineer + platform engineer for 4 weeks
- **Relevant:** Enables advanced ZTDF features and production deployment readiness
- **Time-bound:** Complete by end of Week 18

**Tasks:**

#### 4.1: EncryptedMetadata Decryption (Week 15)
- Create `kas/src/utils/crypto/metadata.ts`:
  ```typescript
  function decryptMetadata(
    encryptedMetadata: string,
    keySplit: Buffer
  ): any {
    // 1. Base64 decode encryptedMetadata
    // 2. Extract IV, authTag, ciphertext (format from Phase 0 Q5)
    // 3. Decrypt using AES-256-GCM with keySplit
    // 4. Parse decrypted JSON
    // 5. Return parsed metadata
  }
  ```

- Add optional decryption in /rewrap handler
- Return decrypted content in result.metadata field
- Handle decryption failures gracefully (return error result)

**Tests:** 12 metadata tests (valid, corrupted, missing, format variations)

#### 4.2: Key Split Recombination for All-Of Mode (Week 15-16)
- Create `kas/src/utils/crypto/key-split.ts`:
  ```typescript
  function recombineKeySplits(
    splits: Buffer[],
    method: 'xor' | 'aes-kw' | 'shamir'
  ): Buffer {
    // Implement based on Phase 0 Q9 answer
    switch (method) {
      case 'xor':
        return splits.reduce((acc, split) =>
          Buffer.from(acc.map((byte, i) => byte ^ split[i]))
        );
      case 'aes-kw':
        // Implement AES key wrap recombination
      case 'shamir':
        // Implement Shamir secret sharing recombination
    }
  }
  ```

- Detect All-Of scenario: multiple KAOs with same keyAccessObjectId
- Unwrap all splits, recombine, verify policyBinding, rewrap combined DEK

**Tests:** 15 key split tests (2-of-2, 3-of-5, different algorithms)

#### 4.3: Any-Of Mode Support (Week 16)
- Implement alternate KAS routing:
  - Multiple KAOs with different urls but same keyAccessObjectId
  - Try primary KAS first
  - Fall back to alternates if primary fails or is unavailable
  - Use circuit breaker to skip known-down KAS instances

**Tests:** 10 Any-Of tests (primary success, primary fail + alternate, all fail)

#### 4.4: AWS KMS Integration (Week 17-18)
- Complete `kas/src/utils/hsm-provider.ts` AWSKMSProvider:
  ```typescript
  import { KMSClient, DecryptCommand, EncryptCommand } from '@aws-sdk/client-kms';

  class AWSKMSProvider implements IHSMProvider {
    async unwrapKey(wrappedKey: string, kekId: string): Promise<Buffer> {
      const client = new KMSClient({ region: this.region });
      const command = new DecryptCommand({
        KeyId: kekId,
        CiphertextBlob: Buffer.from(wrappedKey, 'base64')
      });
      const response = await client.send(command);
      return Buffer.from(response.Plaintext);
    }

    async wrapKey(dek: Buffer, kekId: string): Promise<string> {
      // Similar implementation with EncryptCommand
    }
  }
  ```

- Configure KAS_HSM_PROVIDER=aws-kms in production
- Set up IAM roles and KMS key policies
- Test key operations with AWS KMS
- Implement key rotation support

**Tests:** 20 HSM tests (KMS unwrap/wrap, key rotation, error handling, fallback)

#### 4.5: Performance Optimization (Week 18)
- Implement decision caching (60s TTL) for repeated policy evaluations
- Add connection pooling for downstream KAS HTTP clients
- Optimize JSON canonicalization performance
- Add caching for JWKS public keys (already exists, tune TTL)
- Implement batch processing for multiple KAOs to same downstream KAS

- Run performance benchmarks:
  - Target: p95 latency < 200ms
  - Target: 100 req/s sustained throughput
  - Measure: Unwrap latency, OPA latency, rewrap latency, federation overhead

**Tests:** 10 performance tests (load, stress, endurance)

**Success Criteria:**
- ✅ EncryptedMetadata decryption operational
- ✅ All-Of key split recombination working
- ✅ Any-Of alternate routing functional
- ✅ AWS KMS integrated and operational
- ✅ Performance targets met (p95 < 200ms, 100 req/s)
- ✅ Production HSM ready
- ✅ 67+ tests passing for optional features

**Deliverables:**
- Metadata decryption implementation
- Key split recombination
- Any-Of routing logic
- AWS KMS HSM provider
- Performance optimization report
- Production deployment readiness checklist

---

### PHASE 5: Documentation, Testing & Launch (Week 19-20)

**Objective:** Complete documentation, comprehensive testing, and production rollout

**SMART Goals:**
- **Specific:** Document API, create runbooks, achieve 90%+ test coverage, deploy to production
- **Measurable:** OpenAPI spec complete, 300+ tests passing, 90%+ coverage, zero critical bugs, production deployment successful
- **Achievable:** Full team for 2 weeks (backend, crypto, platform, QA, docs)
- **Relevant:** Ensures production readiness and operational success
- **Time-bound:** Complete by end of Week 20

**Tasks:**

#### 5.1: API Documentation (Week 19)
- Complete `kas/docs/rewrap-api.yaml` OpenAPI 3.0 specification
- Add request/response examples for all scenarios:
  - Single policy, single KAO
  - Multiple policies, multiple KAOs
  - Federation scenarios
  - Error scenarios (400, 401, 403, 500, 503)

- Create `kas/docs/rewrap-protocol-guide.md`:
  - Protocol overview
  - Authentication (JWT + DPoP)
  - Request structure
  - Response structure
  - Error handling
  - Federation behavior
  - Security considerations

- Create client integration guide:
  - How to generate DPoP proofs
  - How to construct keyAccessObjects
  - How to compute policyBinding
  - How to sign keyAccessObjects
  - How to verify response signatures
  - Example code (TypeScript, Python, Java)

#### 5.2: Operational Runbooks (Week 19)
- Create `kas/docs/runbook-rewrap-deployment.md`:
  - Deployment checklist
  - Feature flag rollout strategy
  - Rollback procedures
  - Monitoring setup

- Create `kas/docs/runbook-troubleshooting.md`:
  - Common error scenarios and fixes
  - DPoP verification failures
  - PolicyBinding mismatches
  - Federation timeouts
  - HSM connectivity issues

- Create `kas/docs/runbook-security-incident.md`:
  - Token theft response
  - Policy tampering detection and response
  - Suspected MITM attack procedures
  - Key rotation procedures

#### 5.3: Comprehensive Testing (Week 19-20)
- Achieve 90%+ test coverage:
  - Unit tests: 150+
  - Integration tests: 100+
  - Security tests: 50+
  - Federation tests: 40+
  - Performance tests: 10+

- Run full test suite:
  - All 300+ tests must pass
  - No test flakiness
  - CI/CD pipeline green

- Conduct interoperability testing:
  - Test with external ACP-240 client (if available)
  - Verify request/response parsing
  - Confirm signature verification
  - Validate federation behavior

#### 5.4: Security Audit (Week 20)
- External security review:
  - DPoP implementation audit
  - Signature verification audit
  - PolicyBinding verification audit
  - HSM integration audit
  - Federation security audit

- Address any findings before production launch
- Obtain security sign-off

#### 5.5: Production Rollout (Week 20)
- Phase A: Enable feature flag in dev environment
  - Monitor for errors
  - Validate all functionality
  - Performance baseline

- Phase B: Enable in staging environment
  - Run integration tests against staging
  - Conduct load testing
  - Verify federation with other staging KAS instances

- Phase C: Enable in production (canary rollout)
  - 5% traffic to /rewrap endpoint
  - Monitor metrics, logs, errors
  - Gradual ramp to 25%, 50%, 100%
  - Keep /request-key active for 30 days

- Phase D: Deprecate /request-key
  - Announce deprecation 30 days in advance
  - Provide migration guide for internal clients
  - Remove /request-key endpoint after migration period

**Success Criteria:**
- ✅ Complete OpenAPI specification published
- ✅ All documentation complete and reviewed
- ✅ 300+ tests passing with 90%+ coverage
- ✅ Security audit passed with no critical findings
- ✅ Canary deployment successful with no incidents
- ✅ Production rollout complete at 100%
- ✅ Internal clients migrated from /request-key
- ✅ Zero critical bugs in production

**Deliverables:**
- Complete API documentation (OpenAPI + guides)
- Operational runbooks (deployment, troubleshooting, security)
- Test suite (300+ tests)
- Security audit report
- Production deployment report
- Client migration guide

---

## Success Metrics & KPIs

### Technical Metrics
- **Compliance:** 90%+ of ACP-240 requirements implemented (45+ of 50)
- **Test Coverage:** 90%+ code coverage with 300+ tests passing
- **Performance:** p95 latency < 200ms, 100 req/s sustained throughput
- **Availability:** 99.9% uptime for /rewrap endpoint
- **Security:** Zero critical vulnerabilities in production

### Interoperability Metrics
- **Protocol Compliance:** 100% of mandatory spec requirements implemented
- **Federation Success Rate:** 95%+ successful cross-KAS requests
- **Client Compatibility:** Works with external ACP-240 clients (if available)

### Operational Metrics
- **Deployment Success:** Zero-downtime rollout with <5% error rate during canary
- **Mean Time to Recovery:** <15 minutes for any production issues
- **Documentation Completeness:** 100% of API surface documented

---

## Risk Management

### High-Risk Items
1. **DPoP Implementation Complexity** (Phase 2)
   - Mitigation: Use battle-tested library or extensive RFC 9449 testing
   - Contingency: Extend Phase 2 by 1 week if needed

2. **Federation Response Aggregation** (Phase 3)
   - Mitigation: Prototype aggregation logic early, test with mock KAS
   - Contingency: Simplify to single-KAS federation initially

3. **HSM Integration Delays** (Phase 4)
   - Mitigation: Start AWS KMS setup in Phase 0, parallel track
   - Contingency: Deploy to production with MockHSM in isolated VPC

4. **Performance Targets** (Phase 4)
   - Mitigation: Continuous performance testing throughout phases
   - Contingency: Accept degraded performance initially, optimize post-launch

### Medium-Risk Items
- Client migration from /request-key to /rewrap (Phase 5)
- Open questions resolution delays (Phase 0)
- Test environment instability (ongoing)

---

## Resource Requirements

### Team Composition
- **Backend Engineer** (2 FTE): Core protocol implementation, API, integration
- **Crypto Engineer** (1 FTE): Cryptographic operations, signature verification, HSM
- **Security Engineer** (0.5 FTE): DPoP, security audit, penetration testing
- **Platform Engineer** (0.5 FTE): HSM integration, deployment, infrastructure
- **QA Engineer** (0.5 FTE): Test strategy, comprehensive testing, automation
- **Technical Writer** (0.25 FTE): Documentation, runbooks, client guides

### Infrastructure
- 3 KAS instances for federation testing (USA, FRA, GBR)
- AWS KMS for production HSM
- Load testing infrastructure (100+ concurrent connections)
- CI/CD pipeline enhancements for protocol tests

### Budget Estimate
- Personnel: ~5.75 FTE × 20 weeks = 115 person-weeks
- AWS KMS costs: ~$1/month per key + API calls
- Testing infrastructure: ~$500/month
- External security audit: ~$15,000

---

## Next Steps (Immediate Actions)

### For Continuation in New Session

1. **Review Artifacts:**
   - Read `kas/acp240-gap-analysis.json` (1,966 lines) - Full machine-readable gap analysis
   - Review `kas/ACP240-KAS.md` (462 lines) - Baseline requirements
   - Reference implementation plan (this document)

2. **Phase 0 Kickoff:**
   - Create feature branch: `git checkout -b feature/acp240-rewrap-protocol`
   - Set up test environment with `ENABLE_REWRAP_PROTOCOL=false` flag
   - Begin resolving 10 open questions (priority: Q3 DPoP keys, Q4 kid scheme, Q5 metadata format)

3. **Establish Baseline:**
   - Run current /request-key performance benchmarks
   - Document current architecture
   - Set up monitoring for existing endpoints

4. **Team Alignment:**
   - Review gap analysis with stakeholders
   - Get approval for phased implementation plan
   - Assign owners to each phase
   - Set up weekly progress reviews

5. **Quick Wins (Parallel Track):**
   - Enforce HTTPS (KAS-REQ-021) - 2 hours
   - Add Content-Type validation (KAS-REQ-022) - 3 hours
   - Document crypto algorithms (KAS-REQ-113) - 4 hours
   - Generate momentum while Phase 0 questions are being resolved

---

## Recommended Continuation Prompt for New Session

When starting a new session to continue this work, use the following prompt:

```
I need to implement the ACP-240 SUPP-5(A) AMDT 1 rewrap protocol v1.0 for the DIVE V3 Key Access Service (KAS).

CONTEXT:
A comprehensive gap analysis was completed identifying that the current KAS uses a custom /request-key API that does NOT conform to the ACP-240 spec. Current compliance: 22% implemented, 46% not implemented. Five critical gaps were identified: (1) missing /rewrap endpoint, (2) no DPoP verification, (3) no policyBinding verification, (4) no per-KAO signature verification, (5) non-compliant federation.

ARTIFACTS AVAILABLE:
- kas/acp240-gap-analysis.json - Complete gap analysis (1,966 lines) with all 50 requirements assessed
- kas/ACP240-KAS.md - Baseline requirements extracted from ACP-240 spec
- kas/IMPLEMENTATION-HANDOFF.md - Full phased implementation plan (Phases 0-5, 20 weeks)

CURRENT PHASE: Phase 0 - Foundation & Planning (Week 1-2)

IMMEDIATE TASKS:
1. Set up feature branch and development environment
2. Resolve 10 open questions documented in gap analysis JSON (section "open_questions")
3. Establish test framework for /rewrap protocol
4. Set up CI/CD pipeline for ACP-240 protocol tests

REQUEST:
[Specify which phase/task you want to work on, or ask for guidance on where to start based on priorities]

Please reference the gap analysis JSON and implementation handoff document for detailed requirements, evidence citations, and remediation guidance.
```

---

## Appendix: Key Files Reference

### Gap Analysis Output
- **Location:** `kas/acp240-gap-analysis.json`
- **Size:** 1,966 lines
- **Sections:**
  - `meta`: Analysis metadata
  - `summary`: Compliance snapshot, top gaps, quick wins
  - `requirements`: All 50 requirements with assessments (lines 8-1700)
  - `remediation_backlog`: Prioritized 15-item backlog
  - `open_questions`: 10 questions requiring additional evidence

### Baseline Requirements
- **Location:** `kas/ACP240-KAS.md`
- **Size:** 462 lines
- **Format:** YAML with 50 requirements
- **Categories:** Scope, API, AuthN, Integrity, Cryptography, Federation, Response, ErrorHandling, Security

### Implementation Files Analyzed
1. `kas/src/server.ts` (932 lines) - Main KAS server
2. `kas/src/types/kas.types.ts` (216 lines) - Type definitions
3. `kas/src/utils/jwt-validator.ts` (422 lines) - JWT verification
4. `kas/src/services/kas-federation.service.ts` (641 lines) - Federation
5. `kas/config/kas-registry.json` (170 lines) - KAS registry
6. `kas/src/utils/hsm-provider.ts` (227 lines) - HSM abstraction
7. `kas/src/utils/replay-protection.ts` (180 lines) - Replay protection
8. `kas/Dockerfile` (57 lines) - Container config

---

**End of Implementation Handoff Document**

Generated: 2026-01-30
Analysis Session: ACP-240 KAS Gap Analysis
Next Action: Phase 0 Kickoff
