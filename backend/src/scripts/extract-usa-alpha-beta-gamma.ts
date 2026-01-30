#!/usr/bin/env node
/**
 * Extract Encrypted ZTDF Documents - USA with Alpha, Beta, Gamma COI
 *
 * Extracts encrypted ZTDF documents from MongoDB that match:
 * - releasabilityTo includes USA
 * - COI includes only Alpha, Beta, or Gamma
 * - All clearance levels (UNCLASSIFIED, CONFIDENTIAL, SECRET, TOP_SECRET)
 *
 * Includes encryption details and decryption instructions
 */

import { MongoClient } from 'mongodb';
import * as fs from 'fs';
import * as path from 'path';

// MongoDB connection
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = 'dive-v3';
const COLLECTION_NAME = 'resources';

interface IExtractedDocument {
  resourceId: string;
  title: string;
  classification: string;
  releasabilityTo: string[];
  COI: string[];
  coiOperator: string;
  encryptionDetails: {
    algorithm: string;
    keyDerivation: string;
    ivBase64: string;
    authTagBase64: string;
    encryptedContentBase64: string;
    encryptedContentSize: number;
    coi: string;
  };
  decryptionInstructions: string;
  ztdfMetadata: {
    version: string;
    objectId: string;
    owner: string;
    createdAt: string;
    displayMarking: string;
  };
}

/**
 * Check if COI array contains only Alpha, Beta, or Gamma
 */
function hasOnlyAlphaBetaGamma(coi: string[]): boolean {
  if (coi.length === 0) return false;

  const allowedCOIs = ['Alpha', 'Beta', 'Gamma'];
  return coi.every(c => allowedCOIs.includes(c));
}

/**
 * Check if releasability includes USA
 */
function isReleasableToUSA(releasabilityTo: string[]): boolean {
  return releasabilityTo.includes('USA');
}

/**
 * Extract encryption details from ZTDF document
 */
function extractEncryptionDetails(ztdfDoc: any): IExtractedDocument {
  const ztdf = ztdfDoc.ztdf;
  const legacy = ztdfDoc.legacy;

  // Get encrypted chunk (first chunk)
  const encryptedChunk = ztdf.payload.encryptedChunks[0];

  // Determine which COI was used for encryption
  const coiArray = ztdf.policy.securityLabel.COI || [];
  const selectedCOI = coiArray.length > 0 ? coiArray[0] : 'DEFAULT';

  return {
    resourceId: ztdfDoc.resourceId,
    title: ztdfDoc.title,
    classification: ztdf.policy.securityLabel.classification,
    releasabilityTo: ztdf.policy.securityLabel.releasabilityTo,
    COI: ztdf.policy.securityLabel.COI,
    coiOperator: ztdf.policy.securityLabel.coiOperator || 'ALL',
    encryptionDetails: {
      algorithm: ztdf.payload.encryptionAlgorithm,
      keyDerivation: 'COI-based community key',
      ivBase64: ztdf.payload.iv,
      authTagBase64: ztdf.payload.authTag,
      encryptedContentBase64: encryptedChunk.encryptedData,
      encryptedContentSize: Buffer.from(encryptedChunk.encryptedData, 'base64').length,
      coi: selectedCOI
    },
    decryptionInstructions: generateDecryptionInstructions(selectedCOI, ztdf.payload.iv, ztdf.payload.authTag),
    ztdfMetadata: {
      version: ztdf.manifest.version,
      objectId: ztdf.manifest.objectId,
      owner: ztdf.manifest.owner,
      createdAt: ztdf.manifest.createdAt,
      displayMarking: ztdf.policy.securityLabel.displayMarking
    }
  };
}

/**
 * Generate decryption instructions
 */
function generateDecryptionInstructions(coi: string, iv: string, authTag: string): string {
  return `
DECRYPTION INSTRUCTIONS
=======================

Algorithm: AES-256-GCM
Key Type: COI-based Community Key

Step 1: Get the COI Community Key
----------------------------------
COI: ${coi}

The DEK (Data Encryption Key) is derived from the COI community key.
In the DIVE V3 system, COI keys are stored in the COI Key Registry.

For this COI (${coi}), retrieve the key using:
- Service: coi-key-registry.ts
- Function: getCOIKey('${coi}')
- Key Size: 256 bits (32 bytes)

Step 2: Extract Encryption Parameters
--------------------------------------
IV (Initialization Vector):
  Base64: ${iv}
  Hex: ${Buffer.from(iv, 'base64').toString('hex')}
  Size: 12 bytes (96 bits)

Auth Tag (GCM Authentication Tag):
  Base64: ${authTag}
  Hex: ${Buffer.from(authTag, 'base64').toString('hex')}
  Size: 16 bytes (128 bits)

Step 3: Decrypt with AES-256-GCM
---------------------------------
Pseudocode:
  dek = getCOIKey('${coi}')
  iv = base64Decode(IV)
  authTag = base64Decode(AuthTag)
  encryptedData = base64Decode(EncryptedContent)

  decipher = AES_256_GCM_Decrypt(dek, iv)
  decipher.setAuthTag(authTag)
  plaintext = decipher.update(encryptedData) + decipher.final()

Node.js Code:
  const crypto = require('crypto');
  const { getCOIKey } = require('./services/coi-key-registry');

  const dek = getCOIKey('${coi}');
  const iv = Buffer.from('${iv}', 'base64');
  const authTag = Buffer.from('${authTag}', 'base64');
  const encryptedData = '...'; // From encryptedContentBase64

  const decipher = crypto.createDecipheriv('aes-256-gcm', dek, iv);
  decipher.setAuthTag(authTag);
  let plaintext = decipher.update(encryptedData, 'base64', 'utf8');
  plaintext += decipher.final('utf8');
  console.log(plaintext);

Python Code:
  from cryptography.hazmat.primitives.ciphers.aead import AESGCM
  import base64

  dek = get_coi_key('${coi}')  # 32 bytes
  iv = base64.b64decode('${iv}')
  auth_tag = base64.b64decode('${authTag}')
  encrypted_data = base64.b64decode(encrypted_content_base64)

  aesgcm = AESGCM(dek)
  plaintext = aesgcm.decrypt(iv, encrypted_data + auth_tag, None)
  print(plaintext.decode('utf-8'))

Step 4: Verify Integrity
-------------------------
After decryption, verify the authentication tag matches.
If auth tag verification fails, the content has been tampered with.

Security Notes:
- Never expose the DEK in logs
- DEK should only exist in memory during decryption
- Verify payload hash matches ZTDF manifest
- Check policy binding before releasing DEK
`;
}

/**
 * Main extraction function
 */
async function extractDocuments(): Promise<void> {
  console.log('🔍 Extracting Encrypted ZTDF Documents');
  console.log('='.repeat(60));
  console.log('Criteria:');
  console.log('  - Releasability: USA');
  console.log('  - COI: Only Alpha, Beta, or Gamma');
  console.log('  - Clearance: All levels');
  console.log('='.repeat(60));
  console.log();

  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');

    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    // Query for documents matching criteria
    const query = {
      'ztdf.policy.securityLabel.releasabilityTo': 'USA',
      'ztdf.policy.securityLabel.COI': {
        $exists: true,
        $not: { $size: 0 }
      }
    };

    const documents = await collection.find(query).toArray();

    console.log(`📄 Found ${documents.length} documents matching base criteria`);
    console.log();

    // Filter to only Alpha/Beta/Gamma (no other COIs)
    const filtered = documents.filter(doc => {
      const coi = doc.legacy?.COI || [];
      return hasOnlyAlphaBetaGamma(coi) && isReleasableToUSA(doc.legacy?.releasabilityTo || []);
    });

    console.log(`✅ Filtered to ${filtered.length} documents with only Alpha/Beta/Gamma`);
    console.log();

    // Group by classification and COI
    const byClassification: Record<string, IExtractedDocument[]> = {};
    const byCOI: Record<string, IExtractedDocument[]> = {};

    const extracted: IExtractedDocument[] = [];

    for (const doc of filtered) {
      try {
        const extractedDoc = extractEncryptionDetails(doc);
        extracted.push(extractedDoc);

        // Group by classification
        if (!byClassification[extractedDoc.classification]) {
          byClassification[extractedDoc.classification] = [];
        }
        byClassification[extractedDoc.classification].push(extractedDoc);

        // Group by COI
        const coiKey = extractedDoc.COI.sort().join('+');
        if (!byCOI[coiKey]) {
          byCOI[coiKey] = [];
        }
        byCOI[coiKey].push(extractedDoc);
      } catch (error) {
        console.error(`❌ Error extracting ${doc.resourceId}:`, error);
      }
    }

    // Print summary
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Documents Extracted: ${extracted.length}`);
    console.log();

    console.log('By Classification:');
    for (const [classification, docs] of Object.entries(byClassification)) {
      console.log(`  ${classification}: ${docs.length} documents`);
    }
    console.log();

    console.log('By COI:');
    for (const [coi, docs] of Object.entries(byCOI)) {
      console.log(`  ${coi}: ${docs.length} documents`);
    }
    console.log();

    // Save to output directory
    const outputDir = path.join(__dirname, '../../output/extracted-ztdf-documents');
    fs.mkdirSync(outputDir, { recursive: true });

    // Save full JSON
    const fullOutputPath = path.join(outputDir, 'usa-alpha-beta-gamma-full.json');
    fs.writeFileSync(fullOutputPath, JSON.stringify(extracted, null, 2));
    console.log(`✅ Saved full dataset to: ${fullOutputPath}`);

    // Save samples by classification
    for (const [classification, docs] of Object.entries(byClassification)) {
      const sample = docs.slice(0, 5); // First 5 of each
      const samplePath = path.join(outputDir, `sample-${classification.toLowerCase()}.json`);
      fs.writeFileSync(samplePath, JSON.stringify(sample, null, 2));
      console.log(`✅ Saved ${classification} sample to: ${samplePath}`);
    }

    // Save encryption/decryption guide
    const guidePath = path.join(outputDir, 'ENCRYPTION-DECRYPTION-GUIDE.md');
    const guide = generateFullGuide(extracted);
    fs.writeFileSync(guidePath, guide);
    console.log(`✅ Saved encryption guide to: ${guidePath}`);

    console.log();
    console.log('='.repeat(60));
    console.log('✅ EXTRACTION COMPLETE');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ Extraction failed:', error);
    throw error;
  } finally {
    await client.close();
    console.log('✅ MongoDB connection closed');
  }
}

/**
 * Generate full encryption/decryption guide
 */
function generateFullGuide(documents: IExtractedDocument[]): string {
  const sample = documents[0];

  return `# ZTDF Encryption/Decryption Guide

## Overview

This guide explains how documents in the DIVE V3 system are encrypted and how to decrypt them.

**Extraction Criteria:**
- Releasability: USA
- COI: Only Alpha, Beta, or Gamma
- Clearance Levels: All (UNCLASSIFIED, CONFIDENTIAL, SECRET, TOP_SECRET)
- Total Documents: ${documents.length}

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

\`\`\`
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
\`\`\`

### ZTDF Structure

\`\`\`json
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
\`\`\`

## Decryption Process

### Prerequisites

1. Access to COI Key Registry
2. Valid ZTDF document
3. Node.js or Python with crypto libraries

### Step-by-Step Decryption

#### Step 1: Extract Components from ZTDF

\`\`\`javascript
const ztdf = JSON.parse(fs.readFileSync('document.json'));
const payload = ztdf.payload;
const coi = ztdf.policy.securityLabel.COI[0]; // First COI

const iv = payload.iv;
const authTag = payload.authTag;
const encryptedData = payload.encryptedChunks[0].encryptedData;
\`\`\`

#### Step 2: Get COI Community Key

\`\`\`javascript
const { getCOIKey } = require('./services/coi-key-registry');
const dek = getCOIKey(coi); // Returns 32-byte Buffer
\`\`\`

#### Step 3: Decrypt with AES-256-GCM

**Node.js:**

\`\`\`javascript
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
\`\`\`

**Python:**

\`\`\`python
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
\`\`\`

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

\`\`\`javascript
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

console.log(\`Decrypting: \${resourceId}\`);
console.log(\`Classification: \${classification}\`);
console.log(\`COI: \${coi}\`);

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

  console.log('\\n✅ Decryption successful!');
  console.log('\\nContent:');
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
\`\`\`

## Sample Document Details

Here's an example from the extracted dataset:

\`\`\`json
${JSON.stringify(sample, null, 2)}
\`\`\`

## References

- **ZTDF Spec**: Zero Trust Data Format specification
- **ACP-240**: NATO Data-Centric Security standard
- **STANAG 4778**: Cryptographic binding requirements
- **NIST SP 800-38D**: GCM mode specification

## Support

For questions or issues:
1. Check encryption parameters match
2. Verify COI key is correct
3. Ensure ZTDF structure is valid
4. Review security logs for errors
`;
}

// Run extraction
extractDocuments()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
