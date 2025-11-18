# ZTDF Format Gap Analysis

**Date**: November 17, 2025  
**Status**: CRITICAL - Implementation diverges from OpenTDF spec  
**Impact**: High - ZTDF files not interoperable with OpenTDF tools

---

## Executive Summary

The DIVE V3 implementation creates ZTDF objects as **single static JSON structures** stored in MongoDB. However, the correct OpenTDF ZTDF format is a **ZIP archive containing separate `manifest.json` and `payload` files**. This gap prevents interoperability with OpenTDF CLI tools and violates the TDF 4.3.0 specification.

---

## 1. Correct ZTDF Format (OpenTDF Spec 4.3.0)

### 1.1 File Structure

```
document.ztdf (ZIP archive)
├── 0.manifest.json      (JSON metadata)
└── 0.payload            (Binary encrypted content)
```

**Key Characteristics**:
- File extension: `.ztdf`
- Format: ZIP archive (compression method: store)
- Contains exactly 2 files with numeric prefix (`0.`)
- Can be extracted with standard ZIP tools

### 1.2 Manifest Structure (`0.manifest.json`)

```json
{
  "tdf_spec_version": "4.3.0",
  
  "payload": {
    "type": "reference",
    "url": "0.payload",
    "protocol": "zip",
    "isEncrypted": true,
    "mimeType": "application/vnd.oasis.opendocument.text"
  },
  
  "encryptionInformation": {
    "type": "split",
    "method": {
      "algorithm": "AES-256-GCM",
      "isStreamable": true,
      "iv": ""
    },
    "keyAccess": [
      {
        "type": "wrapped",
        "protocol": "kas",
        "url": "https://opentdf.nscdemo.lab.nscdev.io",
        "kid": "r1",
        "sid": "1",
        "wrappedKey": "j4WYdwAe...",
        "policyBinding": {
          "alg": "HS256",
          "hash": "MDJkNzhl..."
        },
        "tdf_spec_version": "1.0"
      }
    ],
    "policy": "eyJ1dWlkIjoiYmNhYzk4ZWUtYjk4MS0xMWYwLTlkNzUtOTY0NzM1NDYwNzFjIiwiYm9keSI6eyJkYXRhQXR0cmlidXRlcyI6bnVsbCwiZGlzc2VtIjpudWxsfX0=",
    "integrityInformation": {
      "rootSignature": {
        "alg": "HS256",
        "sig": "4qIvsG7gsj9527k9//U7I2/mTbkz46yZ6UQleToLLcA="
      },
      "segmentSizeDefault": 2097152,
      "encryptedSegmentSizeDefault": 2097180,
      "segmentHashAlg": "GMAC",
      "segments": [
        {
          "hash": "zxQ/DmBg9ZVN0458ifkwog==",
          "segmentSize": 9092,
          "encryptedSegmentSize": 9120
        }
      ]
    }
  },
  
  "assertions": [
    {
      "id": "1",
      "type": "handling",
      "scope": "payload",
      "appliesToState": "unencrypted",
      "statement": {
        "format": "json-structured",
        "value": {
          "Xmlns": "urn:nato:stanag:4774:confidentialitymetadatalabel:1:0",
          "CreationTime": "2025-11-04T13:25:31Z",
          "ConfidentialityInformation": {
            "Classification": "",
            "PolicyIdentifier": "",
            "Category": {
              "Type": "",
              "TagName": "",
              "GenericValues": []
            }
          }
        }
      },
      "binding": {
        "method": "jws",
        "signature": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
      }
    }
  ]
}
```

### 1.3 Payload Structure (`0.payload`)

- **Format**: Binary (encrypted)
- **Content**: AES-256-GCM encrypted data
- **Segments**: Can be split into multiple segments (2MB default)
- **Integrity**: Each segment has GMAC hash

---

## 2. Current DIVE V3 Implementation

### 2.1 Storage Model

**MongoDB Document Structure**:
```typescript
interface IZTDFResource {
  resourceId: string;
  title: string;
  ztdf: IZTDFObject;  // ← Single JSON object
  legacy?: { ... };
  createdAt?: Date;
  updatedAt?: Date;
}
```

**Problem**: Entire ZTDF stored as nested JSON in MongoDB, not as separate files.

### 2.2 ZTDF Object Structure

```typescript
interface IZTDFObject {
  manifest: IZTDFManifest;      // ← Custom structure
  policy: IZTDFPolicy;           // ← Custom structure
  payload: IZTDFPayload;         // ← Custom structure
  ztdfSignature?: { ... };
}
```

### 2.3 Current Manifest (DIVE V3)

```typescript
interface IZTDFManifest {
  version: string;              // "1.0" (not "4.3.0")
  objectId: string;
  objectType: string;
  contentType: string;
  owner: string;
  ownerOrganization?: string;
  createdAt: string;
  payloadSize: number;
}
```

**Missing**:
- `tdf_spec_version` (required by OpenTDF)
- Top-level `payload` reference structure
- Top-level `encryptionInformation` structure
- Top-level `assertions` array

### 2.4 Current Policy Structure (DIVE V3)

```typescript
interface IZTDFPolicy {
  policyId: string;
  policyVersion: string;
  securityLabel: ISTANAG4774Label;  // ← Custom NATO/STANAG structure
  assertions: IPolicyAssertion[];   // ← Nested under policy, not top-level
  policyHash?: string;
  policySignature?: { ... };
}
```

**Problem**: Policy structure doesn't match OpenTDF format:
- OpenTDF: Policy is base64-encoded string in `encryptionInformation.policy`
- DIVE V3: Policy is full JSON object with STANAG labels

### 2.5 Current Payload Structure (DIVE V3)

```typescript
interface IZTDFPayload {
  encryptionAlgorithm: string;     // ← Different field names
  iv: string;
  authTag: string;
  keyAccessObjects: IKeyAccessObject[];  // ← Different structure
  encryptedChunks: IEncryptedPayloadChunk[];  // ← Embedded, not separate file
  payloadHash: string;
}
```

**Problem**: Encrypted content embedded in JSON, not separate binary file.

---

## 3. Gap Analysis Matrix

| Feature | OpenTDF Spec 4.3.0 | DIVE V3 Current | Status | Severity |
|---------|-------------------|-----------------|--------|----------|
| **File Format** | ZIP archive | JSON object (MongoDB) | ❌ Missing | CRITICAL |
| **Manifest File** | `0.manifest.json` | N/A (embedded) | ❌ Missing | CRITICAL |
| **Payload File** | `0.payload` (binary) | JSON field | ❌ Missing | CRITICAL |
| **Top-level Structure** | `payload`, `encryptionInformation`, `assertions` | `manifest`, `policy`, `payload` | ❌ Mismatch | HIGH |
| **Spec Version** | `tdf_spec_version: "4.3.0"` | `manifest.version: "1.0"` | ❌ Mismatch | HIGH |
| **Policy Format** | Base64-encoded JSON | Full JSON object | ❌ Mismatch | HIGH |
| **Payload Reference** | `payload.url: "0.payload"` | Embedded chunks | ❌ Missing | HIGH |
| **Key Access** | `encryptionInformation.keyAccess[]` | `payload.keyAccessObjects[]` | ⚠️ Different location | MEDIUM |
| **Integrity Info** | `integrityInformation` with segments | `payload.payloadHash` (simple) | ⚠️ Partial | MEDIUM |
| **Assertions** | Top-level array | Under `policy.assertions` | ⚠️ Different location | MEDIUM |
| **STANAG 4774 Labels** | In `assertions[].statement.value` | In `policy.securityLabel` | ✅ Present but different location | LOW |
| **Multiple Segments** | Supported (2MB chunks) | Single chunk | ⚠️ Not implemented | LOW |

---

## 4. Functional Impact

### 4.1 Interoperability Issues

**Problem**: DIVE V3 ZTDF files cannot be decrypted by OpenTDF tools.

```bash
# This will FAIL with current DIVE V3 format:
$ opentdf decrypt \
    --input dive-v3-resource.json \
    --output decrypted.txt \
    --auth-token YOUR_TOKEN

# Error: Expected ZIP archive, got JSON
```

**Expected**: Files should be decryptable by `@opentdf/cli` or Python `opentdf` tools.

### 4.2 Missing Download Endpoint

**Current State**:
- No `/api/resources/:id/download` endpoint exists
- Frontend references non-existent download endpoint in offline decryption guide
- Users cannot export ZTDF files

**Files Referencing Download**:
- `frontend/src/app/resources/[id]/ztdf/page.tsx:318` - Shows curl command for `/download`
- `docs/ZTDF_INSPECTOR_VISUAL_GUIDE.md:115` - References download endpoint
- No actual implementation in `backend/src/routes/resource.routes.ts`

### 4.3 Storage Inefficiency

**Problem**: Large encrypted payloads stored as base64 strings in JSON/MongoDB.

- **OpenTDF**: Binary payload stored efficiently in ZIP
- **DIVE V3**: Binary → base64 → JSON → BSON (MongoDB) = ~33% overhead

**Example**:
- 10 MB file → 13.3 MB base64 → stored in MongoDB
- Should be: 10 MB file → ZIP archive with binary payload

---

## 5. Compliance Gaps

### 5.1 TDF Specification Compliance

| Requirement | OpenTDF Spec | DIVE V3 | Compliant |
|-------------|-------------|---------|-----------|
| ZIP archive format | Required | No | ❌ |
| Separate manifest.json | Required | No | ❌ |
| Separate payload file | Required | No | ❌ |
| `tdf_spec_version` field | Required | Missing | ❌ |
| `payload.type: "reference"` | Required | N/A | ❌ |
| `payload.url` pointing to payload file | Required | N/A | ❌ |
| AES-256-GCM encryption | Required | ✅ Present | ✅ |
| Policy binding hash | Required | ✅ Present | ✅ |
| Segment integrity hashes | Required | Partial | ⚠️ |

**Overall Compliance**: ~30% (3/10 requirements met)

### 5.2 NATO/STANAG Requirements

| Requirement | DIVE V3 | Compliant |
|-------------|---------|-----------|
| STANAG 4774 security labels | ✅ Present | ✅ |
| Classification equivalency (ACP-240 4.3) | ✅ Present | ✅ |
| Display marking generation | ✅ Present | ✅ |
| COI handling | ✅ Present | ✅ |
| Releasability controls | ✅ Present | ✅ |

**Overall Compliance**: 100% (within custom structure)

**Problem**: STANAG compliance exists but in non-standard location (should be in `assertions`).

---

## 6. Recommended Remediation

### 6.1 Immediate Fixes (Week 4 - High Priority)

#### A. Implement ZTDF Export/Download Endpoint

**New Backend Route**:
```typescript
// backend/src/routes/resource.routes.ts
router.get('/:id/download', authenticateJWT, downloadZTDFHandler);
```

**New Controller**:
```typescript
// backend/src/controllers/resource.controller.ts
export const downloadZTDFHandler = async (req, res, next) => {
  const { id } = req.params;
  const resource = await getResourceById(id);
  
  // Convert DIVE V3 format → OpenTDF ZIP
  const ztdfZip = await convertToOpenTDFFormat(resource.ztdf);
  
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${id}.ztdf"`);
  res.send(ztdfZip);
};
```

#### B. Create Conversion Service

**New File**: `backend/src/services/ztdf-export.service.ts`

```typescript
export async function convertToOpenTDFFormat(ztdf: IZTDFObject): Promise<Buffer> {
  // 1. Build 0.manifest.json
  const manifest = {
    tdf_spec_version: "4.3.0",
    payload: {
      type: "reference",
      url: "0.payload",
      protocol: "zip",
      isEncrypted: true,
      mimeType: ztdf.manifest.contentType
    },
    encryptionInformation: {
      type: "split",
      method: {
        algorithm: ztdf.payload.encryptionAlgorithm,
        isStreamable: true,
        iv: ztdf.payload.iv
      },
      keyAccess: mapKeyAccessObjects(ztdf.payload.keyAccessObjects),
      policy: encodePolicyToBase64(ztdf.policy),
      integrityInformation: buildIntegrityInfo(ztdf.payload)
    },
    assertions: mapAssertionsToOpenTDF(ztdf.policy.assertions, ztdf.policy.securityLabel)
  };
  
  // 2. Extract 0.payload (encrypted binary)
  const payload = Buffer.from(ztdf.payload.encryptedChunks[0].encryptedData, 'base64');
  
  // 3. Create ZIP archive
  const zip = new JSZip();
  zip.file("0.manifest.json", JSON.stringify(manifest, null, 2));
  zip.file("0.payload", payload);
  
  return await zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' });
}
```

### 6.2 Medium-Term Improvements (Post-Pilot)

#### A. Dual Storage Model

**Approach**: Store both formats
```typescript
interface IZTDFResource {
  resourceId: string;
  title: string;
  
  // DIVE V3 custom format (for MongoDB queries)
  ztdf: IZTDFObject;
  
  // OpenTDF-compliant export (pre-generated ZIP)
  ztdfExport?: {
    manifestJson: string;      // Pre-serialized 0.manifest.json
    payloadBuffer: Buffer;     // Binary payload
    zipHash: string;           // Integrity check
  };
}
```

**Benefits**:
- Fast MongoDB queries (keep custom structure)
- Fast downloads (pre-generated ZIP)
- Interoperability with OpenTDF tools

#### B. Align Internal Structure with OpenTDF

**Refactor** `IZTDFObject` to match spec:
```typescript
interface IZTDFObject {
  tdf_spec_version: string;      // "4.3.0"
  payload: {
    type: "reference";
    url: string;
    protocol: "zip";
    isEncrypted: boolean;
    mimeType: string;
  };
  encryptionInformation: {
    type: "split";
    method: { algorithm: string; isStreamable: boolean; iv: string };
    keyAccess: IKeyAccessObject[];
    policy: string;  // base64-encoded
    integrityInformation: IIntegrityInformation;
  };
  assertions: IAssertion[];
}
```

**Migration**: Convert existing MongoDB documents to new structure.

### 6.3 Long-Term Architecture (Post-Pilot)

#### A. Object Storage for ZTDF Files

**Instead of MongoDB**:
- Store ZTDF ZIP files in S3/MinIO
- MongoDB stores only metadata + reference
- Download directly from object storage

```typescript
interface IZTDFResourceMetadata {
  resourceId: string;
  title: string;
  classification: string;
  releasabilityTo: string[];
  
  // Reference to object storage
  ztdfStorageUrl: string;  // s3://dive-v3-ztdf/doc-123.ztdf
  ztdfHash: string;        // SHA-256 of ZIP file
  ztdfSize: number;        // bytes
}
```

#### B. Native OpenTDF Integration

**Replace custom encryption** with OpenTDF SDK:
```typescript
import { TDFClient } from '@opentdf/client';

export async function createZTDFFromFile(file: Buffer, policy: Policy): Promise<Buffer> {
  const client = new TDFClient({ kasUrl: KAS_URL });
  return await client.encrypt({ data: file, policy });
}
```

**Benefits**:
- Guaranteed spec compliance
- Automatic updates with OpenTDF releases
- Leverage OpenTDF community tools

---

## 7. Testing Requirements

### 7.1 OpenTDF CLI Interoperability Test

```bash
# Test 1: Download ZTDF from DIVE V3
curl -H "Authorization: Bearer $TOKEN" \
  https://dev-app.dive25.com/api/resources/doc-123/download \
  -o test.ztdf

# Test 2: Verify ZIP structure
unzip -l test.ztdf
# Expected:
#   0.manifest.json
#   0.payload

# Test 3: Decrypt with OpenTDF CLI
opentdf decrypt \
  --input test.ztdf \
  --output decrypted.txt \
  --auth-token $TOKEN

# Test 4: Verify content matches original
diff decrypted.txt original.txt
```

### 7.2 Format Validation Tests

```typescript
describe('ZTDF Export Format', () => {
  it('should create valid ZIP archive', async () => {
    const zip = await convertToOpenTDFFormat(mockZTDF);
    const isZip = zip[0] === 0x50 && zip[1] === 0x4B; // PK magic number
    expect(isZip).toBe(true);
  });

  it('should include 0.manifest.json', async () => {
    const zip = await JSZip.loadAsync(buffer);
    expect(zip.files['0.manifest.json']).toBeDefined();
  });

  it('should include 0.payload', async () => {
    const zip = await JSZip.loadAsync(buffer);
    expect(zip.files['0.payload']).toBeDefined();
  });

  it('should have tdf_spec_version 4.3.0', async () => {
    const manifest = JSON.parse(await zip.file('0.manifest.json').async('text'));
    expect(manifest.tdf_spec_version).toBe('4.3.0');
  });
});
```

---

## 8. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Breaking existing UI** | Medium | High | Implement as new `/download` endpoint; keep existing `/ztdf` API |
| **MongoDB migration failure** | Low | High | Run dual-write mode during migration; validate before cutover |
| **OpenTDF CLI incompatibility** | High | Medium | Implement comprehensive interop tests before GA |
| **Performance degradation** | Low | Medium | Pre-generate ZIPs asynchronously; cache in object storage |
| **Spec changes in OpenTDF** | Medium | Low | Pin to TDF spec 4.3.0; plan upgrade path for 5.x |

---

## 9. Implementation Checklist

### Phase 1: Export Functionality (Week 4 - Immediate)
- [ ] Create `backend/src/services/ztdf-export.service.ts`
- [ ] Implement `convertToOpenTDFFormat()` function
- [ ] Add `/api/resources/:id/download` route
- [ ] Map DIVE V3 structure → OpenTDF manifest format
- [ ] Map STANAG labels → OpenTDF assertions
- [ ] Create ZIP archive with JSZip
- [ ] Add Content-Disposition header for downloads
- [ ] Test with OpenTDF CLI decryption
- [ ] Update frontend download links to use new endpoint

### Phase 2: Validation & Testing (Week 4)
- [ ] Add unit tests for format conversion
- [ ] Add E2E test with OpenTDF CLI
- [ ] Validate ZIP structure programmatically
- [ ] Test with multiple file types (PDF, DOCX, ODT)
- [ ] Test with large files (>10MB)
- [ ] Document any OpenTDF incompatibilities

### Phase 3: Storage Optimization (Post-Pilot)
- [ ] Evaluate object storage vs MongoDB for ZTDF files
- [ ] Design dual-storage architecture
- [ ] Implement migration script
- [ ] Performance benchmarks (storage size, query speed, download speed)

### Phase 4: Native OpenTDF Integration (Future)
- [ ] Evaluate `@opentdf/client` SDK
- [ ] Proof-of-concept: Replace custom encryption with SDK
- [ ] Migration plan from custom ZTDF → native OpenTDF
- [ ] Deprecation timeline for custom format

---

## 10. Conclusion

### Key Findings

1. **CRITICAL GAP**: DIVE V3 creates ZTDF as single JSON objects, not ZIP archives
2. **NO DOWNLOAD**: No endpoint exists to export ZTDF files
3. **SPEC MISMATCH**: Structure diverges significantly from TDF 4.3.0 spec
4. **INTEROPERABILITY**: Files cannot be decrypted by OpenTDF tools

### Recommended Action

**Implement Phase 1 immediately** (before Week 4 demo):
- Add `/download` endpoint
- Implement format conversion service
- Test with OpenTDF CLI

**Success Criteria**:
```bash
# This should work after Phase 1:
curl -H "Authorization: Bearer $TOKEN" \
  https://dev-app.dive25.com/api/resources/doc-123/download \
  -o test.ztdf

opentdf decrypt --input test.ztdf --output decrypted.txt --auth-token $TOKEN
# ✅ File successfully decrypted
```

### Long-Term Vision

Transition from **custom ZTDF implementation** → **native OpenTDF SDK** for:
- Guaranteed spec compliance
- Reduced maintenance burden
- Community tool compatibility
- Automatic security updates

---

**END OF GAP ANALYSIS**

