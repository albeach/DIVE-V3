# ZTDF Format Visual Comparison

**OpenTDF Spec 4.3.0 vs DIVE V3 Current Implementation**

---

## File Structure Comparison

### OpenTDF Spec 4.3.0 ✅
```
document.ztdf (ZIP Archive)
│
├── 0.manifest.json (2,056 bytes)
│   ├── tdf_spec_version: "4.3.0"
│   ├── payload: { type, url, protocol, isEncrypted, mimeType }
│   ├── encryptionInformation:
│   │   ├── type: "split"
│   │   ├── method: { algorithm, isStreamable, iv }
│   │   ├── keyAccess: [ { type, protocol, url, wrappedKey, ... } ]
│   │   ├── policy: "base64-encoded-json"
│   │   └── integrityInformation:
│   │       ├── rootSignature: { alg, sig }
│   │       ├── segmentSizeDefault: 2097152
│   │       └── segments: [ { hash, segmentSize, encryptedSegmentSize } ]
│   └── assertions: [ { id, type, scope, statement, binding } ]
│
└── 0.payload (9,120 bytes)
    └── [Binary encrypted data - AES-256-GCM]
```

### DIVE V3 Current ❌
```
MongoDB Document
│
├── resourceId: "doc-upload-1731847891234-abc123"
├── title: "Fuel Inventory Report"
├── ztdf: { ← Single JSON object
│   ├── manifest:
│   │   ├── version: "1.0" ← NOT spec version
│   │   ├── objectId
│   │   ├── objectType
│   │   ├── contentType
│   │   ├── owner
│   │   ├── ownerOrganization
│   │   ├── createdAt
│   │   └── payloadSize
│   ├── policy:
│   │   ├── policyId
│   │   ├── policyVersion
│   │   ├── securityLabel: { ← STANAG 4774 (custom)
│   │   │   ├── classification
│   │   │   ├── originalClassification
│   │   │   ├── originalCountry
│   │   │   ├── natoEquivalent
│   │   │   ├── releasabilityTo
│   │   │   ├── COI
│   │   │   ├── caveats
│   │   │   └── displayMarking
│   │   ├── assertions: [ ... ] ← Nested under policy
│   │   ├── policyHash
│   │   └── policySignature
│   └── payload:
│       ├── encryptionAlgorithm
│       ├── iv
│       ├── authTag
│       ├── keyAccessObjects: [ ... ] ← Custom structure
│       ├── encryptedChunks: [ ← Embedded in JSON
│       │   {
│       │     chunkId: 0,
│       │     encryptedData: "base64string..." ← Should be binary file
│       │   }
│       ]
│       └── payloadHash
└── legacy: { ... }
```

---

## Side-by-Side JSON Structure Comparison

### OpenTDF `0.manifest.json`

```json
{
  "tdf_spec_version": "4.3.0",
  
  "payload": {
    "type": "reference",
    "url": "0.payload",
    "protocol": "zip",
    "isEncrypted": true,
    "mimeType": "application/pdf"
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
        "url": "https://kas.example.com",
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
    
    "policy": "eyJ1dWlkIjoiYmNhYzk4ZWUtYjk...",
    
    "integrityInformation": {
      "rootSignature": {
        "alg": "HS256",
        "sig": "4qIvsG7gsj..."
      },
      "segmentSizeDefault": 2097152,
      "encryptedSegmentSizeDefault": 2097180,
      "segmentHashAlg": "GMAC",
      "segments": [
        {
          "hash": "zxQ/DmBg9ZVN...",
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
            "Classification": "SECRET",
            "PolicyIdentifier": "NATO-COSMIC",
            "Category": {
              "Type": "COI",
              "TagName": "FVEY",
              "GenericValues": ["USA", "GBR", "CAN", "AUS", "NZL"]
            }
          }
        }
      },
      "binding": {
        "method": "jws",
        "signature": "eyJhbGciOiJIUzI1..."
      }
    }
  ]
}
```

### DIVE V3 ZTDF Object (Stored in MongoDB)

```json
{
  "resourceId": "doc-upload-1731847891234-abc123",
  "title": "Fuel Inventory Report",
  
  "ztdf": {
    "manifest": {
      "version": "1.0",
      "objectId": "doc-upload-1731847891234-abc123",
      "objectType": "uploaded-document",
      "contentType": "application/pdf",
      "owner": "john.doe@mil",
      "ownerOrganization": "DIVE-V3",
      "createdAt": "2025-11-17T10:30:00.000Z",
      "payloadSize": 9120
    },
    
    "policy": {
      "policyId": "policy-1731847891234",
      "policyVersion": "1.0",
      
      "securityLabel": {
        "classification": "SECRET",
        "originalClassification": "SECRET",
        "originalCountry": "USA",
        "natoEquivalent": "NATO_SECRET",
        "releasabilityTo": ["USA", "GBR", "CAN"],
        "COI": ["FVEY"],
        "coiOperator": "ALL",
        "caveats": ["NOFORN"],
        "originatingCountry": "USA",
        "creationDate": "2025-11-17T10:30:00.000Z",
        "displayMarking": "SECRET//NOFORN//FVEY//REL USA, GBR, CAN"
      },
      
      "assertions": [
        {
          "assertionId": "assertion-1",
          "type": "handling",
          "scope": "payload",
          "statement": {
            "Xmlns": "urn:nato:stanag:4774:confidentialitymetadatalabel:1:0",
            "Classification": "SECRET",
            "ReleasabilityTo": ["USA", "GBR", "CAN"],
            "COI": ["FVEY"]
          },
          "binding": {
            "algorithm": "HS256",
            "signature": "abc123..."
          }
        }
      ],
      
      "policyHash": "94d1bdb3ee275d6db4e251d999bbe26d...",
      "policySignature": {
        "algorithm": "RS256",
        "value": "signature...",
        "signerId": "john.doe@mil",
        "timestamp": "2025-11-17T10:30:00.000Z"
      }
    },
    
    "payload": {
      "encryptionAlgorithm": "AES-256-GCM",
      "iv": "abc123def456...",
      "authTag": "xyz789...",
      
      "keyAccessObjects": [
        {
          "kaoId": "kao-1",
          "kasUrl": "https://kas.dive25.com",
          "wrappedKey": "j4WYdwAe...",
          "policyBinding": {
            "algorithm": "HS256",
            "hash": "MDJkNzhl..."
          },
          "attributes": {
            "classification": "SECRET",
            "releasabilityTo": ["USA", "GBR", "CAN"],
            "COI": ["FVEY"]
          }
        }
      ],
      
      "encryptedChunks": [
        {
          "chunkId": 0,
          "encryptedData": "iVBORw0KGgoAAAANSUhEUgAA... (9120 bytes base64)",
          "chunkHash": "zxQ/DmBg9ZVN0458ifkwog=="
        }
      ],
      
      "payloadHash": "4qIvsG7gsj9527k9//U7I2/mTbkz46yZ6UQleToLLcA="
    },
    
    "ztdfSignature": {
      "algorithm": "RS256",
      "value": "signature...",
      "signerId": "john.doe@mil",
      "timestamp": "2025-11-17T10:30:00.000Z"
    }
  },
  
  "legacy": {
    "classification": "SECRET",
    "releasabilityTo": ["USA", "GBR", "CAN"],
    "COI": ["FVEY"],
    "coiOperator": "ALL",
    "encrypted": true,
    "encryptedContent": "iVBORw0KGgoAAAANSUhEUgAA..."
  },
  
  "createdAt": "2025-11-17T10:30:00.000Z",
  "updatedAt": "2025-11-17T10:30:00.000Z"
}
```

---

## Field Mapping Table

| OpenTDF Field | DIVE V3 Field | Status | Notes |
|---------------|---------------|--------|-------|
| `tdf_spec_version` | N/A | ❌ Missing | Required by spec |
| `payload.type` | N/A | ❌ Missing | Should be "reference" |
| `payload.url` | N/A | ❌ Missing | Should be "0.payload" |
| `payload.protocol` | N/A | ❌ Missing | Should be "zip" |
| `payload.isEncrypted` | `payload.encryptedChunks` | ⚠️ Implicit | Not explicit boolean |
| `payload.mimeType` | `manifest.contentType` | ✅ Present | Different location |
| `encryptionInformation.type` | N/A | ❌ Missing | Should be "split" |
| `encryptionInformation.method.algorithm` | `payload.encryptionAlgorithm` | ✅ Present | Different location |
| `encryptionInformation.method.iv` | `payload.iv` | ✅ Present | Different location |
| `encryptionInformation.keyAccess[]` | `payload.keyAccessObjects[]` | ✅ Present | Different structure |
| `encryptionInformation.keyAccess[].type` | N/A | ❌ Missing | Should be "wrapped" |
| `encryptionInformation.keyAccess[].protocol` | N/A | ❌ Missing | Should be "kas" |
| `encryptionInformation.keyAccess[].url` | `keyAccessObjects[].kasUrl` | ✅ Present | Different field name |
| `encryptionInformation.keyAccess[].wrappedKey` | `keyAccessObjects[].wrappedKey` | ✅ Present | Same |
| `encryptionInformation.keyAccess[].policyBinding` | `keyAccessObjects[].policyBinding` | ✅ Present | Same |
| `encryptionInformation.policy` | `policy` (full object) | ⚠️ Different format | Should be base64 string |
| `encryptionInformation.integrityInformation` | `payload.payloadHash` | ⚠️ Simplified | Missing segments array |
| `assertions[]` | `policy.assertions[]` | ✅ Present | Different location |
| `assertions[].appliesToState` | N/A | ❌ Missing | Should be "unencrypted" |
| `assertions[].binding.method` | `assertions[].binding.algorithm` | ⚠️ Different field | Should be "jws" |

**Summary**:
- ✅ Present: 8 fields
- ⚠️ Partial: 6 fields
- ❌ Missing: 12 fields

---

## Data Flow Comparison

### OpenTDF Upload → Download → Decrypt

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. UPLOAD                                                        │
├─────────────────────────────────────────────────────────────────┤
│ Original File (document.pdf)                                     │
│         ↓                                                        │
│ OpenTDF Client Encryption                                        │
│         ↓                                                        │
│ document.ztdf (ZIP Archive)                                      │
│   ├── 0.manifest.json                                            │
│   └── 0.payload (binary)                                         │
│         ↓                                                        │
│ Store in Object Storage (S3)                                     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 2. DOWNLOAD                                                      │
├─────────────────────────────────────────────────────────────────┤
│ GET /api/resources/123/download                                  │
│         ↓                                                        │
│ Retrieve from Object Storage                                     │
│         ↓                                                        │
│ Return document.ztdf (ZIP)                                       │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 3. DECRYPT (OpenTDF CLI)                                         │
├─────────────────────────────────────────────────────────────────┤
│ $ opentdf decrypt --input document.ztdf --output out.pdf        │
│         ↓                                                        │
│ Unzip document.ztdf                                              │
│   ├── Read 0.manifest.json                                       │
│   └── Read 0.payload                                             │
│         ↓                                                        │
│ Extract keyAccess[0] from manifest                               │
│         ↓                                                        │
│ Request DEK from KAS (POST /rewrap)                              │
│   Body: { wrappedKey, policy }                                   │
│         ↓                                                        │
│ KAS evaluates policy → returns DEK                               │
│         ↓                                                        │
│ Decrypt 0.payload with DEK (AES-256-GCM)                         │
│         ↓                                                        │
│ Verify integrity (segments[].hash)                               │
│         ↓                                                        │
│ Output: document.pdf (plaintext)                                 │
└─────────────────────────────────────────────────────────────────┘
```

### DIVE V3 Upload → Download → Decrypt (Current)

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. UPLOAD                                                        │
├─────────────────────────────────────────────────────────────────┤
│ Original File (document.pdf)                                     │
│         ↓                                                        │
│ DIVE V3 Backend Encryption                                       │
│   - encryptContent() in ztdf.utils.ts                            │
│   - AES-256-GCM with COI-based key                               │
│         ↓                                                        │
│ IZTDFObject (JSON)                                               │
│   ├── manifest: { version, objectId, ... }                       │
│   ├── policy: { securityLabel, assertions, ... }                 │
│   └── payload: {                                                 │
│         encryptedChunks: [                                       │
│           { chunkId: 0, encryptedData: "base64..." }             │
│         ]                                                        │
│       }                                                          │
│         ↓                                                        │
│ Store in MongoDB (BSON)                                          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 2. DOWNLOAD (NOT IMPLEMENTED)                                    │
├─────────────────────────────────────────────────────────────────┤
│ GET /api/resources/123/download                                  │
│         ↓                                                        │
│ ❌ ERROR 404 - Route not found                                   │
│                                                                  │
│ Frontend references this endpoint:                               │
│   - frontend/src/app/resources/[id]/ztdf/page.tsx:318           │
│   - docs/ZTDF_INSPECTOR_VISUAL_GUIDE.md:115                      │
│                                                                  │
│ But backend doesn't implement it:                                │
│   - backend/src/routes/resource.routes.ts (no /download)        │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 3. DECRYPT (OpenTDF CLI - WOULD FAIL)                            │
├─────────────────────────────────────────────────────────────────┤
│ $ opentdf decrypt --input dive-resource.json --output out.pdf   │
│         ↓                                                        │
│ ❌ ERROR: Expected ZIP archive, got JSON                         │
│                                                                  │
│ Even if we manually convert:                                     │
│   - Create 0.manifest.json from IZTDFObject                      │
│   - Extract 0.payload from encryptedChunks[0].encryptedData     │
│   - ZIP them together                                            │
│         ↓                                                        │
│ OpenTDF CLI reads manifest                                       │
│         ↓                                                        │
│ ❌ ERROR: Missing required field "tdf_spec_version"              │
│ ❌ ERROR: Missing "payload.type"                                 │
│ ❌ ERROR: Missing "encryptionInformation"                        │
│                                                                  │
│ → Not compatible with OpenTDF tools                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Storage Efficiency Comparison

### OpenTDF Format
```
Original File: 10 MB
    ↓
AES-256-GCM Encrypt
    ↓
0.payload: 10.001 MB (includes auth tag)
    ↓
ZIP with 0.manifest.json (2 KB)
    ↓
document.ztdf: 10.003 MB

Overhead: 0.03% (3 KB)
```

### DIVE V3 Current Format
```
Original File: 10 MB
    ↓
AES-256-GCM Encrypt → 10.001 MB
    ↓
Base64 Encode → 13.335 MB (+33%)
    ↓
Embed in JSON Object
    ├── manifest: 0.5 KB
    ├── policy: 2 KB
    └── payload: { encryptedChunks: [ "base64..." ] }
    ↓
Store in MongoDB (BSON) → 13.338 MB
    ↓
MongoDB indexes, metadata → 13.5 MB

Overhead: 35% (3.5 MB)
```

**Storage Impact for 1,000 files**:
- OpenTDF: 10 GB + 30 MB = **10.03 GB**
- DIVE V3: 10 GB + 3.5 GB = **13.5 GB**
- **Difference: 3.47 GB wasted** (35% more storage required)

---

## Migration Path Visualization

```
┌───────────────────────────────────────────────────────────────────────┐
│ PHASE 1: EXPORT BRIDGE (Week 4 - Immediate)                           │
├───────────────────────────────────────────────────────────────────────┤
│                                                                        │
│ MongoDB (DIVE V3 Format)                                               │
│        ↓                                                               │
│ GET /api/resources/:id/download                                        │
│        ↓                                                               │
│ ┌────────────────────────────────────┐                                 │
│ │ convertToOpenTDFFormat()           │                                 │
│ │  - Map manifest                    │                                 │
│ │  - Map policy → base64             │                                 │
│ │  - Extract payload → binary        │                                 │
│ │  - Create ZIP                      │                                 │
│ └────────────────────────────────────┘                                 │
│        ↓                                                               │
│ document.ztdf (ZIP Archive)                                            │
│   ├── 0.manifest.json ✅                                                │
│   └── 0.payload ✅                                                      │
│        ↓                                                               │
│ Compatible with OpenTDF CLI ✅                                          │
│                                                                        │
└───────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────┐
│ PHASE 2: DUAL STORAGE (Post-Pilot)                                    │
├───────────────────────────────────────────────────────────────────────┤
│                                                                        │
│ Upload                                                                 │
│    ↓                                                                   │
│ ┌────────────────────┬──────────────────────┐                          │
│ │                    │                      │                          │
│ │ MongoDB            │  Object Storage      │                          │
│ │ (DIVE V3 format)   │  (OpenTDF ZIP)       │                          │
│ │ - Fast queries     │  - Fast downloads    │                          │
│ │ - Searchable       │  - Standard format   │                          │
│ │                    │                      │                          │
│ └────────────────────┴──────────────────────┘                          │
│                                                                        │
└───────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────┐
│ PHASE 3: NATIVE OPENTDF (Future)                                      │
├───────────────────────────────────────────────────────────────────────┤
│                                                                        │
│ Upload → @opentdf/client.encrypt() → Object Storage                   │
│    ↓                                                                   │
│ MongoDB stores only metadata + S3 reference                            │
│    ↓                                                                   │
│ Download → Serve from S3 directly                                      │
│    ↓                                                                   │
│ Decrypt → @opentdf/client.decrypt() or OpenTDF CLI                    │
│                                                                        │
│ ✅ 100% spec compliant                                                  │
│ ✅ Automatic updates                                                    │
│ ✅ Community ecosystem                                                  │
│                                                                        │
└───────────────────────────────────────────────────────────────────────┘
```

---

## Quick Reference: Key Differences Summary

| Aspect | OpenTDF | DIVE V3 |
|--------|---------|---------|
| **File Format** | ZIP archive | JSON object |
| **Storage** | Object storage (S3) | MongoDB (BSON) |
| **Manifest** | Separate file (`0.manifest.json`) | Embedded field (`ztdf.manifest`) |
| **Payload** | Binary file (`0.payload`) | Base64 string in JSON |
| **Spec Version** | `tdf_spec_version: "4.3.0"` | `manifest.version: "1.0"` |
| **Policy Format** | Base64-encoded JSON | Full nested object |
| **Key Access** | `encryptionInformation.keyAccess[]` | `payload.keyAccessObjects[]` |
| **Integrity** | Per-segment hashes + root signature | Single payload hash |
| **Assertions** | Top-level array | Nested under `policy` |
| **STANAG Labels** | In `assertions[].statement.value` | In `policy.securityLabel` |
| **Download Endpoint** | Standard | ❌ Not implemented |
| **CLI Compatibility** | ✅ Works with `@opentdf/cli` | ❌ Incompatible |
| **Storage Overhead** | ~0.03% | ~35% |

---

**For full gap analysis details, see**: `ZTDF_FORMAT_GAP_ANALYSIS.md`

