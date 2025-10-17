# ZTDF Compliance Audit & Implementation Status

**Date**: October 17, 2025  
**Criticality**: HIGH - ACP-240 Compliance Requirements

---

## 🔍 Current Implementation Status

### ✅ **IMPLEMENTED (Working)**

1. **ZTDF Structure** ✅
   - Policy section with STANAG 4774 labels ✅
   - Payload section with encrypted chunks ✅
   - KAOs (Key Access Objects) ✅
   - Manifest section ✅

2. **Cryptographic Binding (STANAG 4778)** ✅
   - Policy hash computed (SHA-384) ✅
   - Payload hash computed (SHA-384) ✅
   - Chunk integrity hashes (SHA-384) ✅
   - `validateZTDFIntegrity()` function exists ✅
   - Comprehensive test suite (41+ tests) ✅

3. **Hybrid Encryption** ⚠️ PARTIAL
   - Symmetric encryption (AES-256-GCM) ✅
   - DEK wrapping in KAO ✅ (pilot mode: plaintext)
   - KAS key brokerage ✅

### ❌ **CRITICAL GAPS**

#### 1. **Integrity Validation NOT ENFORCED Before Decryption** ❌

**Problem**: `validateZTDFIntegrity()` exists but is NEVER called before decryption!

**Evidence**:
```typescript
// backend/src/controllers/resource.controller.ts - requestKeyHandler
// Line 552: decryptContent() called WITHOUT validation!
const decryptedContent = decryptContent({
    encryptedData: encryptedChunk.encryptedData,
    iv: resource.ztdf.payload.iv,
    authTag: resource.ztdf.payload.authTag,
    dek: kasResponse.data.dek
});
// ❌ NO validateZTDFIntegrity() call!
```

**Impact**: 
- Attacker could modify policy labels (downgrade SECRET to UNCLASSIFIED)
- Tampered payloads would still decrypt
- Violates STANAG 4778 cryptographic binding requirement

**ACP-240 Requirement**:
> "When a ZTDF object is opened, the system must verify these signatures; if the policy metadata was altered or is invalid, the object must not be decrypted."

---

#### 2. **Multi-KAS Mode NOT IMPLEMENTED** ❌

**Problem**: Only single KAS support. No attribute-specified keys.

**Current**:
```typescript
// Only ONE KAS per resource
keyAccessObjects: [kao]  // Single KAO
```

**ACP-240 Requirement**:
> "Multiple KAS / Attribute-Specified Keys. A data object can be encrypted in a way that multiple KASs (e.g. one per nation or per community) each hold a portion of the key"

**Missing Features**:
- ❌ Multiple KAOs per resource
- ❌ Each KAO pointing to different KAS
- ❌ Attribute-based KAO selection (by nation/COI)
- ❌ Coalition scalability (add new members without re-encrypting)

**Example Use Case**:
```
Resource: NATO-FVEY Intelligence Report
KAO[0]: USA-KAS (for USA users)
KAO[1]: GBR-KAS (for UK users)  
KAO[2]: CAN-KAS (for Canadian users)
KAO[3]: FVEY-Community-KAS (for all FVEY)
```

---

#### 3. **Community Keys vs National Keys** ❌

**Problem**: Currently using per-resource DEK, not COI-based keys.

**ACP-240 Requirement**:
> "Community-of-Interest (COI) keys (e.g. one keypair per coalition or mission group) rather than per-nation encryption. If a new country joins a COI, you can give them access via the COI's KAS without needing to re-encrypt historical data."

**Current Implementation**:
```typescript
// Each resource gets unique DEK
const dek = crypto.randomBytes(32);  // ❌ Resource-specific

// Should be:
const dek = getCOIKey('FVEY');  // ✅ COI-based
const dek = getCOIKey('NATO-COSMIC');  // ✅ COI-based
```

---

#### 4. **Wrappedkey NOT Deterministick** ⚠️

**Problem**: Seeded resources have different wrappedKeys than deterministic DEK.

**Evidence**:
```
Seeded resource wrappedKey:  5UIvOerUNJjsOaEY... (long base64)
Expected deterministic DEK:  1hnwBLS5KcDzz9OP... (32-byte hash)
Match? ❌
```

**Issue**: Either:
1. Seeded resources are using wrapped keys (good!)
2. But KAS fallback won't work (needs investigation)

---

#### 5. **Policy Signature Verification NOT IMPLEMENTED** ⚠️

**Current**:
```typescript
// backend/src/utils/ztdf.utils.ts:159
if (ztdf.policy.policySignature) {
    // TODO: Implement X.509 signature verification
    warnings.push('Policy signature present but verification not yet implemented');
}
```

**ACP-240 Requirement**:
> "ACP‑240 specifies using strong hashes (SHA-384 or better) and digital signatures (X.509 PKI or HMAC for symmetric scenarios) to sign the metadata."

---

#### 6. **Tampering Alerts NOT IMPLEMENTED** ❌

**ACP-240 Requirement**:
> "Any such integrity failure should also trigger alerts to security operations centers."

**Missing**:
- ❌ No audit event for integrity failures
- ❌ No SOC alerting
- ❌ No suspicious activity tracking

---

## 🔧 **REQUIRED FIXES** (Priority Order)

### CRITICAL - Fix Immediately:

#### Fix 1: Enforce Integrity Validation Before Decryption
```typescript
// backend/src/controllers/resource.controller.ts

// BEFORE decryption:
const integrityResult = validateZTDFIntegrity(resource.ztdf);

if (!integrityResult.valid) {
    // FAIL-CLOSED: Deny access
    logger.error('ZTDF integrity violation', {
        requestId,
        resourceId,
        errors: integrityResult.errors,
        issues: integrityResult.issues
    });
    
    // ❗ ALERT SOC
    auditSecurityEvent({
        eventType: 'INTEGRITY_VIOLATION',
        severity: 'CRITICAL',
        resourceId,
        subject: uniqueID,
        details: integrityResult
    });
    
    res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Resource integrity check failed',
        reason: 'Cryptographic binding violation - possible tampering'
    });
    return;
}

// THEN decrypt
const decryptedContent = decryptContent({...});
```

#### Fix 2: Ensure Seeded Resources Work with KAS

Current KAS logic should work because it:
1. Fetches wrappedKey from resource
2. Falls back to deterministic DEK if not found
3. Both seeded and uploaded resources have wrappedKey

**Verification needed**: Test that seeded resources decrypt successfully.

---

### HIGH PRIORITY - Implement for Full Compliance:

#### Fix 3: Multi-KAS Support

**Add support for multiple KAOs**:
```typescript
interface IKeyAccessObject {
    kaoId: string;
    kasUrl: string;  // Different KAS for different nations/COIs
    kasId: string;   // 'usa-kas', 'gbr-kas', 'fvey-community-kas'
    wrappedKey: string;
    
    // Attribute binding
    policyBinding: {
        clearanceRequired: string;
        countriesAllowed: string[];  // Empty = all countries in COI
        coiRequired: string[];        // Which COI this KAO serves
    };
}

// Usage:
payload.keyAccessObjects = [
    { kaoId: 'kao-usa', kasUrl: 'https://usa.kas.mil:8080', coiRequired: ['US-ONLY'] },
    { kaoId: 'kao-fvey', kasUrl: 'https://fvey.kas.nato:8080', coiRequired: ['FVEY'] },
    { kaoId: 'kao-nato', kasUrl: 'https://nato.kas.nato:8080', coiRequired: ['NATO-COSMIC'] }
];
```

**KAS Selection Logic**:
```typescript
// Client selects appropriate KAO based on user's attributes
const userCOI = ['FVEY', 'NATO-COSMIC'];
const matchingKAO = resource.ztdf.payload.keyAccessObjects.find(kao => 
    kao.policyBinding.coiRequired.some(coi => userCOI.includes(coi))
);

// Request key from the matched KAS
const kasResponse = await axios.post(matchingKAO.kasUrl + '/request-key', {...});
```

---

#### Fix 4: Community Keys (COI-Based DEKs)

**Implement COI key management**:
```typescript
// Key registry per COI
const COI_KEYS: Record<string, string> = {
    'FVEY': 'base64_encoded_fvey_community_key',
    'NATO-COSMIC': 'base64_encoded_nato_key',
    'US-ONLY': 'base64_encoded_us_national_key',
    'CAN-US': 'base64_encoded_can_us_key'
};

// When encrypting, use COI key instead of random DEK
function encryptWithCOIKey(content: string, coi: string[]): IEncryptionResult {
    // Use first matching COI key
    const coiKey = coi[0] ? COI_KEYS[coi[0]] : crypto.randomBytes(32);
    const dek = Buffer.from(coiKey, 'base64');
    
    // Encrypt with COI-specific key
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);
    // ... rest of encryption
}
```

**Benefits**:
- ✅ New coalition members get instant access to historical data
- ✅ No re-encryption needed when membership changes
- ✅ Scalable for large coalitions

---

#### Fix 5: Implement X.509 Policy Signature Verification

```typescript
import * as crypto from 'crypto';
import { X509Certificate } from 'crypto';

function verifyPolicySignature(policy: IZTDFPolicy, cert: X509Certificate): boolean {
    if (!policy.policySignature) return false;
    
    const verify = crypto.createVerify('SHA384');
    const policyForSigning = { ...policy };
    delete policyForSigning.policySignature;
    
    verify.update(JSON.stringify(policyForSigning, Object.keys(policyForSigning).sort()));
    
    return verify.verify(cert.publicKey, policy.policySignature.value, 'base64');
}
```

---

#### Fix 6: SOC Alerting for Tampering

```typescript
// backend/src/services/security-alert.service.ts

export async function alertIntegrityViolation(details: {
    resourceId: string;
    subject: string;
    violationType: 'POLICY_HASH_MISMATCH' | 'PAYLOAD_TAMPERED' | 'CHUNK_CORRUPTED';
    errors: string[];
}) {
    // Log to security audit trail
    logger.error('SECURITY ALERT: ZTDF Integrity Violation', {
        alertLevel: 'CRITICAL',
        ...details
    });
    
    // Send to SOC (implement based on infrastructure)
    // Examples:
    // - SIEM integration (Splunk, ELK)
    // - Alerting system (PagerDuty, Opsgenie)
    // - Email/SMS to security team
    
    // For pilot: Write to dedicated alert log
    fs.appendFileSync('/var/log/dive-v3/security-alerts.log', JSON.stringify({
        timestamp: new Date().toISOString(),
        alertType: 'INTEGRITY_VIOLATION',
        severity: 'CRITICAL',
        ...details
    }) + '\n');
}
```

---

## 📊 Compliance Matrix

| ACP-240 Requirement | Status | Priority |
|---------------------|--------|----------|
| ZTDF Structure | ✅ Implemented | - |
| Policy Section | ✅ Implemented | - |
| Payload Section | ✅ Implemented | - |
| KAOs | ✅ Implemented | - |
| Cryptographic Hashes (SHA-384) | ✅ Implemented | - |
| **Integrity Validation Enforcement** | ❌ **NOT ENFORCED** | **🔴 CRITICAL** |
| **Multi-KAS Support** | ❌ **Missing** | **🟠 HIGH** |
| **COI-Based Keys** | ❌ **Missing** | **🟠 HIGH** |
| X.509 Signatures | ⚠️ Partial (TODO) | 🟡 MEDIUM |
| SOC Alerting | ❌ **Missing** | **🟠 HIGH** |
| Fail-Closed Enforcement | ✅ Implemented | - |

---

## 🎯 Implementation Roadmap

### Phase 1: Critical Security Fixes (Now)
1. Enforce integrity validation before decryption ⏱️ 30 min
2. Add SOC alerting for tampering ⏱️ 20 min
3. Verify seeded resources work with KAS ⏱️ 10 min

### Phase 2: Multi-KAS Support (Week 4)
4. Add support for multiple KAOs ⏱️ 2 hours
5. Implement KAO selection logic ⏱️ 1 hour
6. Test multi-KAS scenarios ⏱️ 1 hour

### Phase 3: COI Key Management (Week 4)
7. Implement COI key registry ⏱️ 1.5 hours
8. Modify encryption to use COI keys ⏱️ 1 hour
9. Test coalition scalability ⏱️ 30 min

### Phase 4: Production Hardening (Future)
10. Implement X.509 signature verification ⏱️ 2 hours
11. HSM integration for key custody ⏱️ 4 hours
12. Full audit trail implementation ⏱️ 2 hours

---

## 🔒 Security Impact Assessment

**Current Risk Level**: 🟠 **MEDIUM-HIGH**

**Vulnerabilities**:
1. ❌ Policy downgrade attacks possible (no integrity check enforcement)
2. ❌ Payload tampering undetected until decryption
3. ❌ No SOC visibility into integrity violations
4. ⚠️ Limited scalability (single KAS only)

**Mitigation**:
- Fix 1 (integrity enforcement) addresses vulnerabilities 1-3
- Fixes 2-6 improve compliance and scalability

---

**END OF AUDIT**

