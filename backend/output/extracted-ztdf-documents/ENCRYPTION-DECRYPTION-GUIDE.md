# ZTDF Encryption/Decryption Guide

## Overview

This guide explains how documents in the DIVE V3 system are encrypted and how to decrypt them.

**Extraction Criteria:**
- Releasability: USA
- COI: Only Alpha, Beta, or Gamma
- Clearance Levels: All (UNCLASSIFIED, CONFIDENTIAL, SECRET, TOP_SECRET)
- Total Documents: 1569

## Encryption Method

### Algorithm: AES-256-GCM

DIVE V3 uses **AES-256-GCM** (Galois/Counter Mode) for content encryption:
- **AES-256**: Advanced Encryption Standard with 256-bit keys
- **GCM**: Provides both encryption and authentication
- **Authenticated Encryption**: Prevents tampering

### Key Derivation: COI-Based Community Keys

Documents are encrypted using **Community of Interest (COI) keys**:

1. **Community Key Registry**: Each COI has a shared symmetric key
2. **Key Selection**: System selects the appropriate COI key based on the document's COI tags
3. **Key Size**: 256 bits (32 bytes)

**Available COI Keys:**
- Alpha: Shared key for Alpha community
- Beta: Shared key for Beta community  
- Gamma: Shared key for Gamma community

### Encryption Process

```
Document Content (Plaintext)
     ↓
Select COI Key (e.g., 'Alpha')
     ↓
Generate Random IV (12 bytes)
     ↓
AES-256-GCM Encrypt
     ↓
Encrypted Content + Auth Tag
     ↓
Store in ZTDF Format
```

### ZTDF Structure

```json
{
  "manifest": {
    "version": "1.0",
    "objectId": "doc-xyz-123",
    "objectType": "document"
  },
  "policy": {
    "securityLabel": {
      "classification": "SECRET",
      "releasabilityTo": ["USA"],
      "COI": ["Alpha"]
    }
  },
  "payload": {
    "encryptionAlgorithm": "AES-256-GCM",
    "iv": "base64-encoded-iv",
    "authTag": "base64-encoded-auth-tag",
    "encryptedChunks": [
      {
        "chunkId": 0,
        "encryptedData": "base64-encoded-ciphertext"
      }
    ],
    "keyAccessObjects": [
      {
        "kaoId": "kao-xyz-123",
        "kasUrl": "http://localhost:8080",
        "wrappedKey": "base64-encoded-wrapped-dek"
      }
    ]
  }
}
```

## Decryption Process

### Prerequisites

1. Access to COI Key Registry
2. Valid ZTDF document
3. Node.js or Python with crypto libraries

### Step-by-Step Decryption

#### Step 1: Extract Components from ZTDF

```javascript
const ztdf = JSON.parse(fs.readFileSync('document.json'));
const payload = ztdf.payload;
const coi = ztdf.policy.securityLabel.COI[0]; // First COI

const iv = payload.iv;
const authTag = payload.authTag;
const encryptedData = payload.encryptedChunks[0].encryptedData;
```

#### Step 2: Get COI Community Key

```javascript
const { getCOIKey } = require('./services/coi-key-registry');
const dek = getCOIKey(coi); // Returns 32-byte Buffer
```

#### Step 3: Decrypt with AES-256-GCM

**Node.js:**

```javascript
const crypto = require('crypto');

function decryptZTDF(ztdf) {
  const payload = ztdf.payload;
  const coi = ztdf.policy.securityLabel.COI[0];
  
  // Get COI key
  const { getCOIKey } = require('./services/coi-key-registry');
  const dek = getCOIKey(coi);
  
  // Extract components
  const iv = Buffer.from(payload.iv, 'base64');
  const authTag = Buffer.from(payload.authTag, 'base64');
  const encryptedData = payload.encryptedChunks[0].encryptedData;
  
  // Decrypt
  const decipher = crypto.createDecipheriv('aes-256-gcm', dek, iv);
  decipher.setAuthTag(authTag);
  
  let plaintext = decipher.update(encryptedData, 'base64', 'utf8');
  plaintext += decipher.final('utf8');
  
  return plaintext;
}
```

**Python:**

```python
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import base64
import json

def decrypt_ztdf(ztdf_path, coi_keys):
    # Load ZTDF
    with open(ztdf_path, 'r') as f:
        ztdf = json.load(f)
    
    payload = ztdf['payload']
    coi = ztdf['policy']['securityLabel']['COI'][0]
    
    # Get COI key
    dek = coi_keys[coi]  # 32 bytes
    
    # Extract components
    iv = base64.b64decode(payload['iv'])
    auth_tag = base64.b64decode(payload['authTag'])
    encrypted_data = base64.b64decode(
        payload['encryptedChunks'][0]['encryptedData']
    )
    
    # Decrypt with AESGCM
    aesgcm = AESGCM(dek)
    plaintext = aesgcm.decrypt(
        iv, 
        encrypted_data + auth_tag,
        None  # No additional authenticated data
    )
    
    return plaintext.decode('utf-8')
```

## Security Considerations

### Authentication Tag Verification

GCM mode provides **authenticated encryption**. If the auth tag doesn't match:
- Content has been tampered with
- Decryption will fail with an error
- **Never** ignore auth tag failures

### Key Security

COI keys must be protected:
- ❌ Never log keys
- ❌ Never commit keys to git
- ❌ Never expose keys in API responses
- ✅ Store in secure key management system
- ✅ Rotate keys periodically
- ✅ Use HSM for production

### Policy Binding

Before decrypting, verify:
1. User has required clearance
2. User's country is in releasabilityTo
3. User has required COI membership
4. Document policy hasn't been tampered with

## Example: Full Decryption Script

```javascript
#!/usr/bin/env node
const fs = require('fs');
const crypto = require('crypto');
const { getCOIKey } = require('./services/coi-key-registry');

// Load ZTDF document
const ztdfPath = process.argv[2];
if (!ztdfPath) {
  console.error('Usage: decrypt-ztdf.js <ztdf-file.json>');
  process.exit(1);
}

const ztdf = JSON.parse(fs.readFileSync(ztdfPath, 'utf8'));

// Extract metadata
const resourceId = ztdf.manifest.objectId;
const classification = ztdf.policy.securityLabel.classification;
const coi = ztdf.policy.securityLabel.COI[0];

console.log(`Decrypting: ${resourceId}`);
console.log(`Classification: ${classification}`);
console.log(`COI: ${coi}`);

// Get COI key
const dek = getCOIKey(coi);

// Extract encryption parameters
const payload = ztdf.payload;
const iv = Buffer.from(payload.iv, 'base64');
const authTag = Buffer.from(payload.authTag, 'base64');
const encryptedData = payload.encryptedChunks[0].encryptedData;

// Decrypt
try {
  const decipher = crypto.createDecipheriv('aes-256-gcm', dek, iv);
  decipher.setAuthTag(authTag);
  
  let plaintext = decipher.update(encryptedData, 'base64', 'utf8');
  plaintext += decipher.final('utf8');
  
  console.log('\n✅ Decryption successful!');
  console.log('\nContent:');
  console.log('=' .repeat(60));
  console.log(plaintext);
  console.log('=' .repeat(60));
  
} catch (error) {
  console.error('❌ Decryption failed:', error.message);
  console.error('Possible reasons:');
  console.error('  - Wrong COI key');
  console.error('  - Content tampered with');
  console.error('  - Corrupted ciphertext');
  process.exit(1);
}
```

## Sample Document Details

Here's an example from the extracted dataset:

```json
{
  "resourceId": "doc-generated-1762442084102-0003",
  "title": "Intelligence Report - Eastern Border 3",
  "classification": "SECRET",
  "releasabilityTo": [
    "USA",
    "GBR",
    "CAN"
  ],
  "COI": [
    "Alpha"
  ],
  "coiOperator": "ALL",
  "encryptionDetails": {
    "algorithm": "AES-256-GCM",
    "keyDerivation": "COI-based community key",
    "ivBase64": "WGucMlJCu9H58rZs",
    "authTagBase64": "0of+VgNB9w0bem7nTOlpMw==",
    "encryptedContentBase64": "gtK6311LUiKIdR1G5fNqQE7A+dFAVy6GsRvmcf8vnskzZjcT+TSpJonYo9uSNeoJljAPu82RVS+Z1g9DsCvlZPAdBAwxHVCQTGWmV8WisylTn+fiBp5E5hPgxxd0H3xqaFbxpzOAw+YR8a8QG1Du8rMQ73BM1bUWD+uRFILeD3Ram7zoFa4doDjXLUz8WZ+VpZNNT6jVrE7Dd9MyRR0Ot//r50qBGN3U1cj46mXbgtFGdYTeyPGradZCMlk2CMWyvy7p/vvJDHoPHx5h4pa6iPNEBF7ThroZpPoB4SyFeBniRlFmRtocdO2ClQ4CsPfXDsWUBZOGWobEX+ciYYhzMZMEb/rnHHvGpprTHNMpQGyI+QftGGcs8o6mSwSIQdvRq1BgSqAehQNTq9+3C3JNfDI9fWZ4dYC+9IfV6ArbGWky7Lxdpu/0iyoQfc2IM5MGiHzDsERyAjodoTMePQRe37OyvrSfJ8E8K8EWO3W2+vxVhrHf7YGVsBqVooWZQJkw3KblAB1kSOkK/Lik",
    "encryptedContentSize": 396,
    "coi": "Alpha"
  },
  "decryptionInstructions": "\nDECRYPTION INSTRUCTIONS\n=======================\n\nAlgorithm: AES-256-GCM\nKey Type: COI-based Community Key\n\nStep 1: Get the COI Community Key\n----------------------------------\nCOI: Alpha\n\nThe DEK (Data Encryption Key) is derived from the COI community key.\nIn the DIVE V3 system, COI keys are stored in the COI Key Registry.\n\nFor this COI (Alpha), retrieve the key using:\n- Service: coi-key-registry.ts\n- Function: getCOIKey('Alpha')\n- Key Size: 256 bits (32 bytes)\n\nStep 2: Extract Encryption Parameters\n--------------------------------------\nIV (Initialization Vector):\n  Base64: WGucMlJCu9H58rZs\n  Hex: 586b9c325242bbd1f9f2b66c\n  Size: 12 bytes (96 bits)\n\nAuth Tag (GCM Authentication Tag):\n  Base64: 0of+VgNB9w0bem7nTOlpMw==\n  Hex: d287fe560341f70d1b7a6ee74ce96933\n  Size: 16 bytes (128 bits)\n\nStep 3: Decrypt with AES-256-GCM\n---------------------------------\nPseudocode:\n  dek = getCOIKey('Alpha')\n  iv = base64Decode(IV)\n  authTag = base64Decode(AuthTag)\n  encryptedData = base64Decode(EncryptedContent)\n  \n  decipher = AES_256_GCM_Decrypt(dek, iv)\n  decipher.setAuthTag(authTag)\n  plaintext = decipher.update(encryptedData) + decipher.final()\n\nNode.js Code:\n  const crypto = require('crypto');\n  const { getCOIKey } = require('./services/coi-key-registry');\n  \n  const dek = getCOIKey('Alpha');\n  const iv = Buffer.from('WGucMlJCu9H58rZs', 'base64');\n  const authTag = Buffer.from('0of+VgNB9w0bem7nTOlpMw==', 'base64');\n  const encryptedData = '...'; // From encryptedContentBase64\n  \n  const decipher = crypto.createDecipheriv('aes-256-gcm', dek, iv);\n  decipher.setAuthTag(authTag);\n  let plaintext = decipher.update(encryptedData, 'base64', 'utf8');\n  plaintext += decipher.final('utf8');\n  console.log(plaintext);\n\nPython Code:\n  from cryptography.hazmat.primitives.ciphers.aead import AESGCM\n  import base64\n  \n  dek = get_coi_key('Alpha')  # 32 bytes\n  iv = base64.b64decode('WGucMlJCu9H58rZs')\n  auth_tag = base64.b64decode('0of+VgNB9w0bem7nTOlpMw==')\n  encrypted_data = base64.b64decode(encrypted_content_base64)\n  \n  aesgcm = AESGCM(dek)\n  plaintext = aesgcm.decrypt(iv, encrypted_data + auth_tag, None)\n  print(plaintext.decode('utf-8'))\n\nStep 4: Verify Integrity\n-------------------------\nAfter decryption, verify the authentication tag matches.\nIf auth tag verification fails, the content has been tampered with.\n\nSecurity Notes:\n- Never expose the DEK in logs\n- DEK should only exist in memory during decryption\n- Verify payload hash matches ZTDF manifest\n- Check policy binding before releasing DEK\n",
  "ztdfMetadata": {
    "version": "1.0",
    "objectId": "doc-generated-1762442084102-0003",
    "owner": "550e8400-e29b-41d4-a716-446655440001",
    "createdAt": "2025-11-06T15:14:44.562Z",
    "displayMarking": "SECRET//Alpha//REL USA, GBR, CAN"
  }
}
```

## References

- **ZTDF Spec**: Zero Trust Data Format specification
- **ACP-240**: NATO Data-Centric Security standard
- **STANAG 4778**: Cryptographic binding requirements
- **NIST SP 800-38D**: GCM mode specification
