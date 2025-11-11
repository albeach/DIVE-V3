# Extracted Encrypted ZTDF Documents - Summary

## Extraction Complete ✅

**Date:** November 7, 2025  
**Location:** `/home/mike/Desktop/DIVE-V3/DIVE-V3/backend/output/extracted-ztdf-documents/`

## Extraction Criteria

- **Releasability:** USA
- **COI:** Only Alpha, Beta, or Gamma (no other COIs)
- **Clearance Levels:** All (UNCLASSIFIED, CONFIDENTIAL, SECRET, TOP_SECRET, RESTRICTED)

## Results Summary

### Total Documents Extracted: **1,569**

### By Classification:
| Classification | Count |
|----------------|-------|
| SECRET | 335 documents |
| TOP_SECRET | 305 documents |
| RESTRICTED | 335 documents |
| UNCLASSIFIED | 290 documents |
| CONFIDENTIAL | 304 documents |

### By COI:
| COI Combination | Count |
|----------------|-------|
| Alpha only | 396 documents |
| Beta only | 408 documents |
| Gamma only | 353 documents |
| Alpha+Beta | 412 documents |

## Extracted Files

### 1. Full Dataset (6.1 MB)
**File:** `usa-alpha-beta-gamma-full.json`

Contains all 1,569 documents with complete encryption details:
- Resource metadata (ID, title, classification)
- Security labels (releasability, COI, caveats)
- Encryption parameters (IV, auth tag, encrypted content)
- ZTDF metadata (version, owner, timestamps)
- Decryption instructions

### 2. Sample Files (5 files, ~20KB each)
**Files:**
- `sample-unclassified.json` - 5 UNCLASSIFIED documents
- `sample-confidential.json` - 5 CONFIDENTIAL documents
- `sample-restricted.json` - 5 RESTRICTED documents
- `sample-secret.json` - 5 SECRET documents
- `sample-top_secret.json` - 5 TOP_SECRET documents

Each sample contains the first 5 documents of that classification level for testing and validation.

### 3. Encryption/Decryption Guide (11 KB)
**File:** `ENCRYPTION-DECRYPTION-GUIDE.md`

Comprehensive guide including:
- Encryption algorithm details (AES-256-GCM)
- COI-based key derivation explained
- Step-by-step decryption process
- Code examples (Node.js and Python)
- Security considerations
- Full working decryption script

## Encryption Method

### Algorithm: **AES-256-GCM**

**Components:**
- **AES-256:** Advanced Encryption Standard with 256-bit keys
- **GCM Mode:** Galois/Counter Mode (provides authenticated encryption)
- **IV Size:** 12 bytes (96 bits) - randomly generated per document
- **Auth Tag:** 16 bytes (128 bits) - ensures integrity

### Key Derivation: **COI-Based Community Keys**

Documents are encrypted using shared symmetric keys based on Community of Interest (COI):

**Available COI Keys:**
- **Alpha:** Shared 256-bit key for Alpha community
- **Beta:** Shared 256-bit key for Beta community
- **Gamma:** Shared 256-bit key for Gamma community

**Key Location:** `backend/src/services/coi-key-registry.ts`

### How It Was Encrypted

```javascript
// 1. Select COI key based on document's COI tags
const selectedCOI = document.COI[0]; // First COI (Alpha, Beta, or Gamma)
const dek = getCOIKey(selectedCOI);  // Get 32-byte community key

// 2. Generate random IV (12 bytes)
const iv = crypto.randomBytes(12);

// 3. Encrypt content with AES-256-GCM
const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);
let encrypted = cipher.update(plaintextContent, 'utf8', 'base64');
encrypted += cipher.final('base64');

// 4. Get authentication tag
const authTag = cipher.getAuthTag(); // 16 bytes

// 5. Store in ZTDF format
const ztdf = {
  payload: {
    encryptionAlgorithm: 'AES-256-GCM',
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    encryptedChunks: [{
      chunkId: 0,
      encryptedData: encrypted
    }]
  }
};
```

## How to Decrypt

### Prerequisites

1. Access to DIVE V3 backend codebase
2. COI key registry (`backend/src/services/coi-key-registry.ts`)
3. Node.js or Python with crypto libraries

### Quick Decryption (Node.js)

```javascript
const crypto = require('crypto');
const { getCOIKey } = require('./services/coi-key-registry');
const fs = require('fs');

// Load extracted document
const doc = JSON.parse(fs.readFileSync('sample-secret.json'))[0];

// Get COI key
const coi = doc.encryptionDetails.coi;
const dek = getCOIKey(coi);

// Extract encryption parameters
const iv = Buffer.from(doc.encryptionDetails.ivBase64, 'base64');
const authTag = Buffer.from(doc.encryptionDetails.authTagBase64, 'base64');
const encryptedData = doc.encryptionDetails.encryptedContentBase64;

// Decrypt
const decipher = crypto.createDecipheriv('aes-256-gcm', dek, iv);
decipher.setAuthTag(authTag);
let plaintext = decipher.update(encryptedData, 'base64', 'utf8');
plaintext += decipher.final('utf8');

console.log('Decrypted content:', plaintext);
```

### Quick Decryption (Python)

```python
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import base64
import json

# Load extracted document
with open('sample-secret.json', 'r') as f:
    doc = json.load(f)[0]

# Get COI key (you need to implement this)
coi = doc['encryptionDetails']['coi']
dek = get_coi_key(coi)  # Returns 32 bytes

# Extract encryption parameters
iv = base64.b64decode(doc['encryptionDetails']['ivBase64'])
auth_tag = base64.b64decode(doc['encryptionDetails']['authTagBase64'])
encrypted_data = base64.b64decode(doc['encryptionDetails']['encryptedContentBase64'])

# Decrypt with AESGCM
aesgcm = AESGCM(dek)
plaintext = aesgcm.decrypt(iv, encrypted_data + auth_tag, None)
print('Decrypted content:', plaintext.decode('utf-8'))
```

## Example Decryption Script

A complete ready-to-use decryption script is included in the guide:

**Location:** See `ENCRYPTION-DECRYPTION-GUIDE.md` section "Example: Full Decryption Script"

**Usage:**
```bash
cd backend
node decrypt-ztdf.js ../output/extracted-ztdf-documents/sample-secret.json
```

## Sample Document Structure

Each extracted document contains:

```json
{
  "resourceId": "doc-generated-1762442084102-0003",
  "title": "Intelligence Report - Eastern Border 3",
  "classification": "SECRET",
  "releasabilityTo": ["USA", "GBR", "CAN"],
  "COI": ["Alpha"],
  "coiOperator": "ALL",
  "encryptionDetails": {
    "algorithm": "AES-256-GCM",
    "keyDerivation": "COI-based community key",
    "ivBase64": "WGucMlJCu9H58rZs",
    "authTagBase64": "0of+VgNB9w0bem7nTOlpMw==",
    "encryptedContentBase64": "gtK6311LUiKIdR1G5fNqQE7A...",
    "encryptedContentSize": 396,
    "coi": "Alpha"
  },
  "decryptionInstructions": "...(full instructions)...",
  "ztdfMetadata": {
    "version": "1.0",
    "objectId": "doc-generated-1762442084102-0003",
    "owner": "550e8400-e29b-41d4-a716-446655440001",
    "createdAt": "2025-11-06T15:14:44.562Z",
    "displayMarking": "SECRET//Alpha//REL USA, GBR, CAN"
  }
}
```

## Security Notes

### Key Security
- ❌ **Never log DEK values** - only log key hashes
- ❌ **Never expose keys in API responses**
- ✅ **Store keys in secure key management system**
- ✅ **Rotate COI keys periodically**
- ✅ **Use HSM for production deployments**

### Authentication Tag Verification
- GCM mode provides **authenticated encryption**
- Auth tag **must** match or decryption fails
- Tampered content will fail auth tag verification
- **Never ignore auth tag failures**

### Policy Binding
Before decrypting, verify:
1. User has required clearance level
2. User's country is in `releasabilityTo`
3. User has required COI membership
4. Document policy hasn't been tampered with (check ZTDF integrity)

## COI Key Registry

The COI keys used for encryption are managed in:

**File:** `backend/src/services/coi-key-registry.ts`

**Function:** `getCOIKey(coi: string): Buffer`

**Keys Available:**
- Alpha (32 bytes, 256 bits)
- Beta (32 bytes, 256 bits)
- Gamma (32 bytes, 256 bits)
- DEFAULT (fallback key)

## ZTDF Compliance

Documents follow **Zero Trust Data Format (ZTDF)** specification:

- **STANAG 4774:** Security labeling
- **STANAG 5636:** Display markings
- **STANAG 4778:** Cryptographic binding
- **ACP-240:** Data-centric security

## Verification

To verify extraction was successful:

```bash
cd /home/mike/Desktop/DIVE-V3/DIVE-V3/backend/output/extracted-ztdf-documents

# Count documents
cat usa-alpha-beta-gamma-full.json | jq '. | length'
# Should output: 1569

# List unique classifications
cat usa-alpha-beta-gamma-full.json | jq -r '.[].classification' | sort | uniq -c

# List unique COI combinations
cat usa-alpha-beta-gamma-full.json | jq -r '.[].COI | join("+")' | sort | uniq -c

# Verify encryption algorithm
cat usa-alpha-beta-gamma-full.json | jq -r '.[0].encryptionDetails.algorithm'
# Should output: AES-256-GCM
```

## Next Steps

### For Testing:
1. Pick a sample document from any classification level
2. Extract the encryption parameters (IV, auth tag, encrypted content)
3. Get the COI key from the registry
4. Run decryption with provided code examples
5. Verify plaintext content

### For Integration:
1. Review `ENCRYPTION-DECRYPTION-GUIDE.md` for detailed instructions
2. Implement COI key retrieval in your environment
3. Test decryption with sample documents
4. Implement policy verification before decryption
5. Add audit logging for all decryption attempts

## Support

For questions or issues:
1. Check `ENCRYPTION-DECRYPTION-GUIDE.md` for detailed documentation
2. Verify COI key is correct for the document's COI
3. Ensure ZTDF structure matches expected format
4. Check that IV and auth tag are properly base64-decoded

## Files Reference

All files located in: `/home/mike/Desktop/DIVE-V3/DIVE-V3/backend/output/extracted-ztdf-documents/`

| File | Size | Description |
|------|------|-------------|
| usa-alpha-beta-gamma-full.json | 6.1 MB | All 1,569 documents |
| sample-unclassified.json | 20 KB | 5 UNCLASSIFIED samples |
| sample-confidential.json | 20 KB | 5 CONFIDENTIAL samples |
| sample-restricted.json | 20 KB | 5 RESTRICTED samples |
| sample-secret.json | 20 KB | 5 SECRET samples |
| sample-top_secret.json | 20 KB | 5 TOP_SECRET samples |
| ENCRYPTION-DECRYPTION-GUIDE.md | 11 KB | Full documentation |

---

**Extraction Script:** `backend/src/scripts/extract-usa-alpha-beta-gamma.ts`  
**Execution Date:** November 7, 2025, 04:06 AM  
**Database:** MongoDB `dive-v3` database, `resources` collection  
**Total Runtime:** ~2 seconds  
**Status:** ✅ Complete





