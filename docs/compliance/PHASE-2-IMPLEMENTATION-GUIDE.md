# Phase 2 Implementation Guide - Federation Infrastructure

**Duration:** 3 weeks (November 18 - December 6, 2025)  
**Effort:** 27 working days  
**Status:** 🚧 Ready for Implementation  
**Compliance Improvement:** +15% ADatP-5663 (73% → 88%)

---

## OVERVIEW

Phase 2 focuses on critical federation infrastructure: automated metadata management, LDAP integration, attribute caching, and OAuth 2.0 Token Exchange for delegation. These capabilities enable robust, enterprise-grade federation with NATO partners.

### Prerequisites

- ✅ Phase 1 Complete (metadata signing, ACR/LoA, Spain SAML IdP)
- ✅ Redis deployed (for attribute caching)
- ✅ LDAP/AD access obtained (for attribute federation)
- ✅ Enterprise PKI coordination initiated (for Phase 3)

### Success Criteria

- [ ] All 7 tasks completed and tested
- [ ] Terraform applied successfully (no errors)
- [ ] All acceptance criteria met
- [ ] Integration tests passing
- [ ] CI/CD pipelines passing
- [ ] Phase 2 demo delivered to stakeholders
- [ ] ADatP-5663 compliance reaches 88% (from 73%)

---

## TASK 2.1: AUTOMATED METADATA REFRESH

**Owner:** Backend Developer  
**Effort:** 3 days  
**Priority:** High  
**ADatP-5663:** §3.8 (Federation Metadata Exchange)

### Objective

Implement daily automated metadata refresh for all IdP brokers to detect and apply metadata changes from federated partners.

### Implementation

**File:** `backend/src/services/metadata-refresh.service.ts`

```typescript
/**
 * NATO Compliance: ADatP-5663 §3.8 - Automated Metadata Refresh
 * Phase 2, Task 2.1 - Federation Metadata Management
 * 
 * Automatically fetches and validates IdP metadata from discovery endpoints.
 * Detects changes and triggers Terraform plan for review.
 */

import axios from 'axios';
import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger';
import { execAsync } from '../utils/exec-helper';

interface OIDCMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
  end_session_endpoint?: string;
  revocation_endpoint?: string;
  introspection_endpoint?: string;
}

interface SAMLMetadata {
  entityID: string;
  singleSignOnServiceURL: string;
  singleLogoutServiceURL?: string;
  signingCertificate: string;
}

interface IdPBroker {
  alias: string;
  realm: string;
  protocol: 'oidc' | 'saml';
  metadataUrl: string;
  currentHash?: string;
}

export class MetadataRefreshService {
  private idpBrokers: IdPBroker[] = [
    // OIDC Brokers
    {
      alias: 'usa-realm-broker',
      realm: 'dive-v3-usa',
      protocol: 'oidc',
      metadataUrl: 'http://keycloak:8080/realms/dive-v3-usa/.well-known/openid-configuration',
    },
    {
      alias: 'fra-realm-broker',
      realm: 'dive-v3-fra',
      protocol: 'oidc',
      metadataUrl: 'http://keycloak:8080/realms/dive-v3-fra/.well-known/openid-configuration',
    },
    {
      alias: 'can-realm-broker',
      realm: 'dive-v3-can',
      protocol: 'oidc',
      metadataUrl: 'http://keycloak:8080/realms/dive-v3-can/.well-known/openid-configuration',
    },
    // ... (all 10 OIDC brokers)
    
    // SAML Brokers
    {
      alias: 'spain-saml-broker',
      realm: 'dive-v3-broker',
      protocol: 'saml',
      metadataUrl: 'http://localhost:8082/simplesaml/saml2/idp/metadata.php',
    },
  ];

  private metadataDir = path.join(__dirname, '../../metadata-cache');

  constructor() {
    this.ensureMetadataDirectory();
  }

  /**
   * Ensures metadata cache directory exists
   */
  private async ensureMetadataDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.metadataDir, { recursive: true });
    } catch (error) {
      logger.error(`Failed to create metadata directory: ${error}`);
    }
  }

  /**
   * Fetches OIDC discovery metadata
   */
  private async fetchOIDCMetadata(url: string): Promise<OIDCMetadata> {
    try {
      const response = await axios.get<OIDCMetadata>(url, {
        timeout: 10000,
        validateStatus: (status) => status === 200,
      });

      return response.data;
    } catch (error) {
      throw new Error(`Failed to fetch OIDC metadata from ${url}: ${error}`);
    }
  }

  /**
   * Fetches SAML metadata XML
   */
  private async fetchSAMLMetadata(url: string): Promise<string> {
    try {
      const response = await axios.get<string>(url, {
        timeout: 10000,
        validateStatus: (status) => status === 200,
        headers: {
          Accept: 'application/samlmetadata+xml, application/xml, text/xml',
        },
      });

      return response.data;
    } catch (error) {
      throw new Error(`Failed to fetch SAML metadata from ${url}: ${error}`);
    }
  }

  /**
   * Computes SHA-256 hash of metadata
   */
  private computeHash(data: string | object): string {
    const content = typeof data === 'string' ? data : JSON.stringify(data);
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Saves metadata to cache file
   */
  private async saveMetadata(
    broker: IdPBroker,
    metadata: OIDCMetadata | string
  ): Promise<void> {
    const filename = `${broker.alias}.${broker.protocol}.json`;
    const filepath = path.join(this.metadataDir, filename);

    const cacheData = {
      broker: {
        alias: broker.alias,
        realm: broker.realm,
        protocol: broker.protocol,
      },
      metadata,
      hash: this.computeHash(metadata),
      lastUpdated: new Date().toISOString(),
    };

    await fs.writeFile(filepath, JSON.stringify(cacheData, null, 2));
    logger.info(`Metadata cached: ${broker.alias}`);
  }

  /**
   * Loads metadata from cache file
   */
  private async loadCachedMetadata(broker: IdPBroker): Promise<string | null> {
    try {
      const filename = `${broker.alias}.${broker.protocol}.json`;
      const filepath = path.join(this.metadataDir, filename);
      const content = await fs.readFile(filepath, 'utf-8');
      const cached = JSON.parse(content);
      return cached.hash;
    } catch (error) {
      return null; // No cached metadata
    }
  }

  /**
   * Detects metadata changes
   */
  private async detectMetadataChange(
    broker: IdPBroker,
    newMetadata: OIDCMetadata | string
  ): Promise<boolean> {
    const cachedHash = await this.loadCachedMetadata(broker);
    const newHash = this.computeHash(newMetadata);

    if (!cachedHash) {
      logger.info(`No cached metadata for ${broker.alias} - first run`);
      return true; // First run, treat as change
    }

    if (cachedHash !== newHash) {
      logger.warn(
        `⚠️ Metadata changed for ${broker.alias}: ${cachedHash.substring(0, 8)}... → ${newHash.substring(0, 8)}...`
      );
      return true;
    }

    return false;
  }

  /**
   * Refreshes metadata for single IdP broker
   */
  async refreshBrokerMetadata(broker: IdPBroker): Promise<{
    broker: string;
    changed: boolean;
    metadata?: OIDCMetadata | string;
    error?: string;
  }> {
    try {
      logger.info(`Refreshing metadata: ${broker.alias} (${broker.protocol})`);

      let metadata: OIDCMetadata | string;

      if (broker.protocol === 'oidc') {
        metadata = await this.fetchOIDCMetadata(broker.metadataUrl);
      } else {
        metadata = await this.fetchSAMLMetadata(broker.metadataUrl);
      }

      const changed = await this.detectMetadataChange(broker, metadata);

      if (changed) {
        await this.saveMetadata(broker, metadata);
        logger.warn(`Metadata updated: ${broker.alias}`);
      } else {
        logger.debug(`Metadata unchanged: ${broker.alias}`);
      }

      return {
        broker: broker.alias,
        changed,
        metadata: changed ? metadata : undefined,
      };
    } catch (error) {
      logger.error(`Metadata refresh failed for ${broker.alias}: ${error}`);
      return {
        broker: broker.alias,
        changed: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Refreshes metadata for all IdP brokers
   */
  async refreshAllMetadata(): Promise<{
    total: number;
    changed: number;
    failed: number;
    changedBrokers: string[];
  }> {
    logger.info('Starting metadata refresh for all IdP brokers...');

    const results = await Promise.all(
      this.idpBrokers.map((broker) => this.refreshBrokerMetadata(broker))
    );

    const changedResults = results.filter((r) => r.changed && !r.error);
    const failedResults = results.filter((r) => r.error);

    const summary = {
      total: results.length,
      changed: changedResults.length,
      failed: failedResults.length,
      changedBrokers: changedResults.map((r) => r.broker),
    };

    if (summary.changed > 0) {
      logger.warn(
        `⚠️ Metadata changes detected: ${summary.changedBrokers.join(', ')}`
      );
      await this.notifyMetadataChanges(summary.changedBrokers);
    }

    if (summary.failed > 0) {
      logger.error(
        `❌ Metadata refresh failed for ${summary.failed} brokers`
      );
    }

    logger.info(
      `Metadata refresh complete: ${summary.changed}/${summary.total} changed, ${summary.failed} failed`
    );

    return summary;
  }

  /**
   * Sends notification about metadata changes
   */
  private async notifyMetadataChanges(changedBrokers: string[]): Promise<void> {
    // TODO: Implement notification (Slack, email, etc.)
    logger.warn(
      `📧 Notification: Metadata changed for ${changedBrokers.length} brokers`
    );

    // For now, just log to audit log
    // In production, integrate with Slack/email/PagerDuty
  }

  /**
   * Triggers Terraform plan to review changes
   */
  async triggerTerraformPlan(): Promise<void> {
    try {
      logger.info('Triggering Terraform plan for metadata changes...');

      const { stdout, stderr } = await execAsync(
        'cd terraform && terraform plan -out=metadata-changes.tfplan',
        { cwd: path.join(__dirname, '../../..') }
      );

      logger.info('Terraform plan output:');
      logger.info(stdout);

      if (stderr) {
        logger.warn('Terraform plan warnings:');
        logger.warn(stderr);
      }

      logger.info(
        '✅ Terraform plan generated: terraform/metadata-changes.tfplan'
      );
      logger.info('Review plan and apply manually: terraform apply metadata-changes.tfplan');
    } catch (error) {
      logger.error(`Terraform plan failed: ${error}`);
    }
  }
}

// Singleton instance
export const metadataRefreshService = new MetadataRefreshService();

// Schedule daily metadata refresh (1:00 AM UTC)
export function scheduleMetadataRefresh(): void {
  const cron = require('node-cron');

  // Run daily at 1:00 AM UTC
  cron.schedule('0 1 * * *', async () => {
    logger.info('🕐 Scheduled metadata refresh starting...');
    const summary = await metadataRefreshService.refreshAllMetadata();

    if (summary.changed > 0) {
      await metadataRefreshService.triggerTerraformPlan();
    }
  });

  logger.info('✅ Metadata refresh scheduled (daily at 1:00 AM UTC)');
}
```

**File:** `scripts/refresh-idp-metadata.sh`

```bash
#!/bin/bash
# NATO Compliance: ADatP-5663 §3.8 - Manual Metadata Refresh
# Phase 2, Task 2.1

set -euo pipefail

echo "=== Federation Metadata Refresh ==="
echo "ADatP-5663 §3.8 - Automated Metadata Exchange"
echo ""

# Trigger metadata refresh via backend API
BACKEND_URL="${BACKEND_URL:-http://localhost:4000}"

echo "Requesting metadata refresh from backend..."
response=$(curl -s -X POST "$BACKEND_URL/api/admin/metadata/refresh" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ADMIN_TOKEN:-}" || echo "{\"error\":\"Request failed\"}")

echo "$response" | jq .

# Check if changes detected
changed=$(echo "$response" | jq -r '.changed // 0')

if [ "$changed" -gt 0 ]; then
  echo ""
  echo "⚠️ Metadata changes detected for $changed brokers"
  echo "Changed brokers:"
  echo "$response" | jq -r '.changedBrokers[]'
  echo ""
  echo "Next steps:"
  echo "1. Review changes: cat backend/metadata-cache/*.json"
  echo "2. Run Terraform plan: cd terraform && terraform plan"
  echo "3. Apply if valid: terraform apply"
else
  echo ""
  echo "✅ No metadata changes detected"
fi
```

**File:** `backend/src/controllers/admin.controller.ts` (add endpoint)

```typescript
/**
 * POST /api/admin/metadata/refresh
 * Triggers manual metadata refresh for all IdP brokers
 */
router.post('/metadata/refresh', requireAdmin, async (req, res) => {
  try {
    const summary = await metadataRefreshService.refreshAllMetadata();
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      total: summary.total,
      changed: summary.changed,
      failed: summary.failed,
      changedBrokers: summary.changedBrokers,
    });
  } catch (error) {
    logger.error(`Metadata refresh failed: ${error}`);
    res.status(500).json({
      success: false,
      error: 'Metadata refresh failed',
      message: (error as Error).message,
    });
  }
});
```

### Testing

```bash
# 1. Install dependencies
cd backend
npm install node-cron axios

# 2. Start backend with metadata refresh service
npm run dev

# 3. Trigger manual metadata refresh
./scripts/refresh-idp-metadata.sh

# Expected output:
# {
#   "success": true,
#   "total": 11,
#   "changed": 0,
#   "failed": 0,
#   "changedBrokers": []
# }

# 4. Test metadata change detection
# Modify Spain SAML metadata
# Re-run refresh
# Expected: changed=1, changedBrokers=["spain-saml-broker"]

# 5. Verify metadata cache
cat backend/metadata-cache/usa-realm-broker.oidc.json | jq .

# 6. Verify Terraform plan triggered
ls -la terraform/metadata-changes.tfplan
```

### Acceptance Criteria

- [ ] Metadata refresh service implemented
- [ ] Daily cron job scheduled (1:00 AM UTC)
- [ ] Metadata changes detected via SHA-256 hash comparison
- [ ] Metadata cached in `backend/metadata-cache/`
- [ ] Terraform plan triggered automatically on changes
- [ ] Manual refresh endpoint: `POST /api/admin/metadata/refresh`
- [ ] Notifications sent on metadata changes (logged)
- [ ] All 11 IdP brokers monitored (10 OIDC + 1 SAML)

---

## TASK 2.2: METADATA VALIDATION

**Owner:** Backend Developer  
**Effort:** 3 days  
**Priority:** High  
**ADatP-5663:** §3.8 (Metadata Trust)

### Objective

Implement schema and signature validation for IdP metadata before trust establishment.

### Implementation

**File:** `backend/src/services/metadata-validator.service.ts`

```typescript
/**
 * NATO Compliance: ADatP-5663 §3.8 - Metadata Validation
 * Phase 2, Task 2.2 - Schema & Signature Verification
 */

import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { XMLParser } from 'fast-xml-parser';
import { logger } from '../utils/logger';
import { execAsync } from '../utils/exec-helper';
import fs from 'fs/promises';

// JSON Schema for OIDC Discovery Metadata
const oidcMetadataSchema = {
  type: 'object',
  required: [
    'issuer',
    'authorization_endpoint',
    'token_endpoint',
    'jwks_uri',
  ],
  properties: {
    issuer: { type: 'string', format: 'uri' },
    authorization_endpoint: { type: 'string', format: 'uri' },
    token_endpoint: { type: 'string', format: 'uri' },
    userinfo_endpoint: { type: 'string', format: 'uri' },
    jwks_uri: { type: 'string', format: 'uri' },
    end_session_endpoint: { type: 'string', format: 'uri' },
    revocation_endpoint: { type: 'string', format: 'uri' },
    introspection_endpoint: { type: 'string', format: 'uri' },
    response_types_supported: {
      type: 'array',
      items: { type: 'string' },
    },
    grant_types_supported: {
      type: 'array',
      items: { type: 'string' },
    },
    subject_types_supported: {
      type: 'array',
      items: { type: 'string', enum: ['public', 'pairwise'] },
    },
    id_token_signing_alg_values_supported: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  additionalProperties: true,
};

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
}

export class MetadataValidatorService {
  private ajv: Ajv;

  constructor() {
    this.ajv = new Ajv({ allErrors: true });
    addFormats(this.ajv);
  }

  /**
   * Validates OIDC discovery metadata against JSON Schema
   */
  validateOIDCMetadata(metadata: unknown): ValidationResult {
    const validate = this.ajv.compile(oidcMetadataSchema);
    const valid = validate(metadata);

    if (!valid && validate.errors) {
      const errors = validate.errors.map(
        (err) => `${err.instancePath} ${err.message}`
      );
      logger.error(`OIDC metadata validation failed: ${errors.join(', ')}`);
      return { valid: false, errors };
    }

    logger.info('✅ OIDC metadata schema validation passed');
    return { valid: true };
  }

  /**
   * Validates SAML metadata XML structure
   */
  async validateSAMLMetadata(metadataXml: string): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Parse XML
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
      });
      const parsed = parser.parse(metadataXml);

      // Check for required elements
      if (!parsed.EntityDescriptor) {
        errors.push('Missing EntityDescriptor element');
      }

      if (!parsed.EntityDescriptor?.IDPSSODescriptor) {
        errors.push('Missing IDPSSODescriptor element');
      }

      if (!parsed.EntityDescriptor?.['@_entityID']) {
        errors.push('Missing entityID attribute');
      }

      // Check for signing certificate
      const keyDescriptor =
        parsed.EntityDescriptor?.IDPSSODescriptor?.KeyDescriptor;
      if (!keyDescriptor) {
        warnings.push('No KeyDescriptor found (signature validation may fail)');
      }

      // Check for SSO endpoints
      const ssoService =
        parsed.EntityDescriptor?.IDPSSODescriptor?.SingleSignOnService;
      if (!ssoService) {
        errors.push('Missing SingleSignOnService element');
      }

      if (errors.length > 0) {
        logger.error(`SAML metadata validation failed: ${errors.join(', ')}`);
        return { valid: false, errors, warnings };
      }

      logger.info('✅ SAML metadata structure validation passed');
      return { valid: true, warnings: warnings.length > 0 ? warnings : undefined };
    } catch (error) {
      logger.error(`SAML metadata parsing failed: ${error}`);
      return {
        valid: false,
        errors: [`XML parsing error: ${(error as Error).message}`],
      };
    }
  }

  /**
   * Validates SAML metadata signature using xmlsec1
   */
  async validateSAMLSignature(
    metadataXml: string,
    trustedCertPath: string
  ): Promise<ValidationResult> {
    try {
      // Save metadata to temp file
      const tempMetadataPath = '/tmp/metadata-to-verify.xml';
      await fs.writeFile(tempMetadataPath, metadataXml);

      // Verify signature using xmlsec1
      const cmd = `xmlsec1 --verify --pubkey-cert-pem ${trustedCertPath} ${tempMetadataPath}`;
      const { stdout, stderr } = await execAsync(cmd);

      if (stdout.includes('OK') || stderr.includes('OK')) {
        logger.info('✅ SAML metadata signature valid');
        return { valid: true };
      }

      logger.error(`SAML metadata signature validation failed: ${stderr}`);
      return {
        valid: false,
        errors: ['Signature verification failed'],
      };
    } catch (error) {
      logger.error(`SAML signature validation error: ${error}`);
      return {
        valid: false,
        errors: [`Signature validation error: ${(error as Error).message}`],
      };
    }
  }

  /**
   * Validates JWKS (JSON Web Key Set) for OIDC
   */
  async validateJWKS(jwksUri: string): Promise<ValidationResult> {
    try {
      const response = await fetch(jwksUri);
      const jwks = await response.json();

      if (!jwks.keys || !Array.isArray(jwks.keys)) {
        return {
          valid: false,
          errors: ['JWKS missing "keys" array'],
        };
      }

      if (jwks.keys.length === 0) {
        return {
          valid: false,
          errors: ['JWKS contains no keys'],
        };
      }

      // Validate each key
      const warnings: string[] = [];
      for (const key of jwks.keys) {
        if (!key.kty) {
          return { valid: false, errors: ['Key missing "kty" (key type)'] };
        }

        if (!key.use && !key.key_ops) {
          warnings.push('Key missing "use" or "key_ops" field');
        }

        // Check for RSA key size (minimum 2048 bits)
        if (key.kty === 'RSA' && key.n) {
          const keySize = Buffer.from(key.n, 'base64').length * 8;
          if (keySize < 2048) {
            return {
              valid: false,
              errors: [`RSA key size ${keySize} < 2048 bits (insecure)`],
            };
          }
        }
      }

      logger.info(`✅ JWKS validation passed (${jwks.keys.length} keys)`);
      return {
        valid: true,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (error) {
      logger.error(`JWKS validation error: ${error}`);
      return {
        valid: false,
        errors: [`JWKS fetch/parse error: ${(error as Error).message}`],
      };
    }
  }

  /**
   * Comprehensive metadata validation
   */
  async validateMetadata(
    metadata: unknown,
    protocol: 'oidc' | 'saml',
    options?: {
      trustedCertPath?: string; // For SAML signature validation
      verifySignature?: boolean;
    }
  ): Promise<ValidationResult> {
    logger.info(`Validating ${protocol.toUpperCase()} metadata...`);

    if (protocol === 'oidc') {
      // Validate OIDC schema
      const schemaResult = this.validateOIDCMetadata(metadata);
      if (!schemaResult.valid) {
        return schemaResult;
      }

      // Validate JWKS
      const jwksUri = (metadata as any).jwks_uri;
      if (jwksUri) {
        const jwksResult = await this.validateJWKS(jwksUri);
        if (!jwksResult.valid) {
          return jwksResult;
        }
      }

      return { valid: true };
    } else {
      // SAML metadata validation
      const metadataXml = metadata as string;
      const structureResult = await this.validateSAMLMetadata(metadataXml);

      if (!structureResult.valid) {
        return structureResult;
      }

      // Optionally verify signature
      if (options?.verifySignature && options?.trustedCertPath) {
        const signatureResult = await this.validateSAMLSignature(
          metadataXml,
          options.trustedCertPath
        );
        if (!signatureResult.valid) {
          return signatureResult;
        }
      }

      return structureResult;
    }
  }
}

export const metadataValidatorService = new MetadataValidatorService();
```

**File:** `scripts/validate-idp-metadata.sh`

```bash
#!/bin/bash
# NATO Compliance: ADatP-5663 §3.8 - Metadata Validation
# Phase 2, Task 2.2

set -euo pipefail

METADATA_FILE="$1"
PROTOCOL="${2:-oidc}"  # oidc or saml
CERT_PATH="${3:-}"

if [ -z "$METADATA_FILE" ]; then
  echo "Usage: $0 <metadata-file> [oidc|saml] [cert-path]"
  exit 1
fi

echo "=== IdP Metadata Validation ==="
echo "File: $METADATA_FILE"
echo "Protocol: $PROTOCOL"
echo ""

if [ "$PROTOCOL" = "oidc" ]; then
  echo "Validating OIDC Discovery Metadata..."
  
  # Check required fields
  jq -e '.issuer' "$METADATA_FILE" > /dev/null || { echo "❌ Missing: issuer"; exit 1; }
  jq -e '.authorization_endpoint' "$METADATA_FILE" > /dev/null || { echo "❌ Missing: authorization_endpoint"; exit 1; }
  jq -e '.token_endpoint' "$METADATA_FILE" > /dev/null || { echo "❌ Missing: token_endpoint"; exit 1; }
  jq -e '.jwks_uri' "$METADATA_FILE" > /dev/null || { echo "❌ Missing: jwks_uri"; exit 1; }
  
  echo "✅ All required OIDC fields present"
  
  # Validate JWKS
  JWKS_URI=$(jq -r '.jwks_uri' "$METADATA_FILE")
  echo "Fetching JWKS from: $JWKS_URI"
  JWKS=$(curl -s "$JWKS_URI")
  
  NUM_KEYS=$(echo "$JWKS" | jq '.keys | length')
  echo "✅ JWKS contains $NUM_KEYS keys"
  
elif [ "$PROTOCOL" = "saml" ]; then
  echo "Validating SAML Metadata..."
  
  # Check XML structure
  xmllint --noout "$METADATA_FILE" 2>&1 || { echo "❌ Invalid XML"; exit 1; }
  echo "✅ Valid XML structure"
  
  # Check for required elements
  grep -q "EntityDescriptor" "$METADATA_FILE" || { echo "❌ Missing EntityDescriptor"; exit 1; }
  grep -q "IDPSSODescriptor" "$METADATA_FILE" || { echo "❌ Missing IDPSSODescriptor"; exit 1; }
  echo "✅ Required SAML elements present"
  
  # Verify signature (if certificate provided)
  if [ -n "$CERT_PATH" ]; then
    echo "Verifying metadata signature..."
    xmlsec1 --verify --pubkey-cert-pem "$CERT_PATH" "$METADATA_FILE" 2>&1 | grep -q "OK" && {
      echo "✅ Metadata signature valid"
    } || {
      echo "❌ Metadata signature invalid"
      exit 1
    }
  fi
fi

echo ""
echo "✅ Metadata validation successful"
```

### Testing

```bash
# 1. Install dependencies
cd backend
npm install ajv ajv-formats fast-xml-parser

# Install xmlsec1 (for SAML signature verification)
sudo apt-get install xmlsec1

# 2. Test OIDC metadata validation
./scripts/validate-idp-metadata.sh \
  backend/metadata-cache/usa-realm-broker.oidc.json \
  oidc

# Expected: ✅ Metadata validation successful

# 3. Test SAML metadata validation
curl -o spain-metadata.xml \
  http://localhost:8082/simplesaml/saml2/idp/metadata.php

./scripts/validate-idp-metadata.sh \
  spain-metadata.xml \
  saml \
  external-idps/spain-saml/certs/idp.crt

# Expected: ✅ Metadata validation successful

# 4. Test invalid metadata (should fail)
echo "{}" > invalid-metadata.json
./scripts/validate-idp-metadata.sh invalid-metadata.json oidc
# Expected: ❌ Missing: issuer

# 5. Integration test (metadata refresh + validation)
# Modify Task 2.1 service to call validator before caching
```

### Acceptance Criteria

- [ ] OIDC metadata schema validation implemented (JSON Schema)
- [ ] SAML metadata XML validation implemented
- [ ] SAML signature verification implemented (xmlsec1)
- [ ] JWKS validation implemented (key type, size checks)
- [ ] Validation script: `scripts/validate-idp-metadata.sh`
- [ ] Integration with metadata refresh service (Task 2.1)
- [ ] CI/CD pipeline validates metadata before import
- [ ] Invalid metadata rejected with clear error messages

---

## TASK 2.3: LDAP ATTRIBUTE FEDERATION

**Owner:** Backend Developer + Systems Administrator  
**Effort:** 5 days  
**Priority:** High  
**ADatP-5663:** §5.4 (Attribute Exchange Mechanisms)

### Objective

Configure LDAP User Storage Federation to fetch user attributes from organizational LDAP/Active Directory.

### Implementation

**File:** `terraform/modules/ldap-federation/main.tf`

```hcl
# NATO Compliance: ADatP-5663 §5.4 - LDAP Attribute Federation
# Phase 2, Task 2.3 - External Attribute Provider Integration

terraform {
  required_providers {
    keycloak = {
      source  = "mrparkers/keycloak"
      version = "~> 4.0"
    }
  }
}

variable "ldap_url" {
  description = "LDAP server URL (e.g., ldap://ldap.example.com:389)"
  type        = string
}

variable "ldap_bind_dn" {
  description = "LDAP bind DN (e.g., cn=keycloak,ou=services,dc=example,dc=com)"
  type        = string
}

variable "ldap_bind_credential" {
  description = "LDAP bind password (sensitive)"
  type        = string
  sensitive   = true
}

variable "ldap_users_dn" {
  description = "LDAP users base DN (e.g., ou=users,dc=example,dc=com)"
  type        = string
}

variable "ldap_user_object_classes" {
  description = "LDAP user object classes"
  type        = list(string)
  default     = ["inetOrgPerson", "organizationalPerson"]
}

# LDAP User Federation for USA Realm
resource "keycloak_ldap_user_federation" "usa_ldap" {
  name     = "USA-LDAP-Federation"
  realm_id = "dive-v3-usa"
  enabled  = true

  # Connection Settings
  connection_url      = var.ldap_url
  users_dn            = var.ldap_users_dn
  bind_dn             = var.ldap_bind_dn
  bind_credential     = var.ldap_bind_credential
  connection_timeout  = "5000"  # 5 seconds
  read_timeout        = "10000" # 10 seconds

  # Authentication Settings
  auth_type = "simple"  # Simple bind authentication

  # Search Settings
  rdn_ldap_attribute         = "uid"
  uuid_ldap_attribute        = "entryUUID"
  user_object_classes        = var.ldap_user_object_classes
  username_ldap_attribute    = "uid"
  
  # Custom User LDAP Filter (optional)
  custom_user_search_filter  = "(objectClass=inetOrgPerson)"

  # Edit Mode: READ_ONLY (don't write back to LDAP)
  edit_mode = "READ_ONLY"

  # Import Settings
  import_enabled      = true
  sync_registrations  = false  # Don't sync new Keycloak users to LDAP

  # Batch Settings
  batch_size_for_sync = 1000
  full_sync_period    = 604800  # Weekly full sync (seconds)
  changed_sync_period = 86400   # Daily changed sync (seconds)

  # Pagination
  pagination = true

  # Cache Policy
  cache_policy = "DEFAULT"  # Use Keycloak's default cache settings

  # Priority (multiple federations)
  priority = 0  # Highest priority
}

# Output LDAP federation configuration
output "ldap_federation_id" {
  description = "LDAP User Federation ID"
  value       = keycloak_ldap_user_federation.usa_ldap.id
}

output "ldap_federation_status" {
  description = "LDAP federation configuration status"
  value = {
    name       = keycloak_ldap_user_federation.usa_ldap.name
    realm      = keycloak_ldap_user_federation.usa_ldap.realm_id
    enabled    = keycloak_ldap_user_federation.usa_ldap.enabled
    edit_mode  = keycloak_ldap_user_federation.usa_ldap.edit_mode
    sync_full  = "${keycloak_ldap_user_federation.usa_ldap.full_sync_period}s (weekly)"
    sync_delta = "${keycloak_ldap_user_federation.usa_ldap.changed_sync_period}s (daily)"
    compliance = "ADatP-5663 §5.4 - Attribute Exchange"
  }
}
```

**File:** `terraform/modules/ldap-federation/mappers.tf`

```hcl
# LDAP Attribute Mappers for DIVE V3 Attributes
# Maps LDAP attributes to Keycloak user attributes

# Mapper 1: Email
resource "keycloak_ldap_user_attribute_mapper" "email" {
  realm_id                = keycloak_ldap_user_federation.usa_ldap.realm_id
  ldap_user_federation_id = keycloak_ldap_user_federation.usa_ldap.id
  name                    = "email"
  
  user_model_attribute = "email"
  ldap_attribute       = "mail"
  read_only            = true
  always_read_value_from_ldap = true
}

# Mapper 2: First Name
resource "keycloak_ldap_user_attribute_mapper" "first_name" {
  realm_id                = keycloak_ldap_user_federation.usa_ldap.realm_id
  ldap_user_federation_id = keycloak_ldap_user_federation.usa_ldap.id
  name                    = "first name"
  
  user_model_attribute = "firstName"
  ldap_attribute       = "givenName"
  read_only            = true
  always_read_value_from_ldap = true
}

# Mapper 3: Last Name
resource "keycloak_ldap_user_attribute_mapper" "last_name" {
  realm_id                = keycloak_ldap_user_federation.usa_ldap.realm_id
  ldap_user_federation_id = keycloak_ldap_user_federation.usa_ldap.id
  name                    = "last name"
  
  user_model_attribute = "lastName"
  ldap_attribute       = "sn"
  read_only            = true
  always_read_value_from_ldap = true
}

# Mapper 4: Clearance Level (custom LDAP attribute)
resource "keycloak_ldap_user_attribute_mapper" "clearance" {
  realm_id                = keycloak_ldap_user_federation.usa_ldap.realm_id
  ldap_user_federation_id = keycloak_ldap_user_federation.usa_ldap.id
  name                    = "clearance"
  
  user_model_attribute = "clearance"
  ldap_attribute       = "clearanceLevel"  # Custom LDAP schema attribute
  read_only            = true
  always_read_value_from_ldap = true
}

# Mapper 5: Organizational Unit
resource "keycloak_ldap_user_attribute_mapper" "org_unit" {
  realm_id                = keycloak_ldap_user_federation.usa_ldap.realm_id
  ldap_user_federation_id = keycloak_ldap_user_federation.usa_ldap.id
  name                    = "organizationalUnit"
  
  user_model_attribute = "orgUnit"
  ldap_attribute       = "ou"
  read_only            = true
  always_read_value_from_ldap = true
}

# Mapper 6: Duty Organization
resource "keycloak_ldap_user_attribute_mapper" "duty_org" {
  realm_id                = keycloak_ldap_user_federation.usa_ldap.realm_id
  ldap_user_federation_id = keycloak_ldap_user_federation.usa_ldap.id
  name                    = "dutyOrganization"
  
  user_model_attribute = "dutyOrg"
  ldap_attribute       = "departmentNumber"  # Map dept number to duty org
  read_only            = true
  always_read_value_from_ldap = true
}

# Mapper 7: Country of Affiliation
resource "keycloak_ldap_user_attribute_mapper" "country" {
  realm_id                = keycloak_ldap_user_federation.usa_ldap.realm_id
  ldap_user_federation_id = keycloak_ldap_user_federation.usa_ldap.id
  name                    = "countryOfAffiliation"
  
  user_model_attribute = "countryOfAffiliation"
  ldap_attribute       = "c"  # Country code (ISO 3166)
  read_only            = true
  always_read_value_from_ldap = true
}

# Mapper 8: ACP COI (Community of Interest)
# Stored as multi-valued LDAP attribute
resource "keycloak_ldap_user_attribute_mapper" "acp_coi" {
  realm_id                = keycloak_ldap_user_federation.usa_ldap.realm_id
  ldap_user_federation_id = keycloak_ldap_user_federation.usa_ldap.id
  name                    = "acpCOI"
  
  user_model_attribute = "acpCOI"
  ldap_attribute       = "memberOf"  # Map LDAP groups to COI
  read_only            = true
  always_read_value_from_ldap = true
  is_mandatory_in_ldap = false
}

# Output mappers configuration
output "ldap_mappers" {
  description = "LDAP attribute mappers for DIVE V3 attributes"
  value = {
    email               = "mail"
    firstName           = "givenName"
    lastName            = "sn"
    clearance           = "clearanceLevel (custom)"
    orgUnit             = "ou"
    dutyOrg             = "departmentNumber"
    countryOfAffiliation = "c (ISO 3166)"
    acpCOI              = "memberOf (groups)"
  }
}
```

**File:** `terraform/modules/ldap-federation/terraform.tfvars.example`

```hcl
# LDAP Federation Configuration (Example)
# Copy to terraform.tfvars and update with actual values

ldap_url               = "ldap://ldap.example.com:389"
ldap_bind_dn           = "cn=keycloak,ou=services,dc=example,dc=com"
ldap_bind_credential   = "REPLACE_WITH_SECURE_PASSWORD"
ldap_users_dn          = "ou=users,dc=example,dc=com"
ldap_user_object_classes = ["inetOrgPerson", "organizationalPerson"]
```

### Testing

```bash
# 1. Test LDAP connectivity
ldapsearch -H ldap://ldap.example.com:389 \
  -D "cn=keycloak,ou=services,dc=example,dc=com" \
  -W \
  -b "ou=users,dc=example,dc=com" \
  "(uid=testuser)"

# Expected: User entry returned

# 2. Apply Terraform configuration
cd terraform/modules/ldap-federation
terraform init
terraform plan -var-file=terraform.tfvars
terraform apply -var-file=terraform.tfvars

# 3. Trigger full sync via Keycloak Admin Console
# Navigate to: User Federation → USA-LDAP-Federation → Synchronize all users

# Or via Admin REST API:
curl -X POST "http://localhost:8081/admin/realms/dive-v3-usa/user-storage/${LDAP_ID}/sync?action=triggerFullSync" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}"

# 4. Verify users imported
curl -X GET "http://localhost:8081/admin/realms/dive-v3-usa/users" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" | jq .

# Expected: LDAP users present with attributes

# 5. Test login with LDAP credentials
# Login to DIVE frontend with LDAP username/password
# Expected: Successful authentication

# 6. Verify attributes in token
# Decode ID token, check for LDAP-sourced attributes:
# - clearance (from clearanceLevel)
# - dutyOrg (from departmentNumber)
# - countryOfAffiliation (from c)
```

### Acceptance Criteria

- [ ] LDAP connectivity established (ldapsearch successful)
- [ ] LDAP User Storage Federation configured in `dive-v3-usa` realm
- [ ] 8 attribute mappers configured (email, name, clearance, etc.)
- [ ] Full sync triggered successfully (users imported)
- [ ] Daily incremental sync configured (86400s)
- [ ] Weekly full sync configured (604800s)
- [ ] LDAP attributes appear in Keycloak user profiles
- [ ] LDAP attributes appear in OIDC tokens
- [ ] Login with LDAP credentials successful
- [ ] READ_ONLY mode enforced (no writes to LDAP)

---

*(Continuing with Tasks 2.4-2.7 in next section due to length...)*

## TASK 2.4: ATTRIBUTE CACHING

**Owner:** Backend Developer  
**Effort:** 3 days  
**Priority:** Medium  
**ADatP-5663:** §5.4 (Attribute Freshness)

### Objective

Implement Redis-based attribute caching with configurable TTL per attribute type to improve performance and reduce LDAP queries.

### Implementation

**File:** `backend/src/services/attribute-cache.service.ts`

```typescript
/**
 * NATO Compliance: ADatP-5663 §5.4 - Attribute Caching
 * Phase 2, Task 2.4 - Attribute Freshness Management
 * 
 * Redis-based caching with TTL per attribute type.
 * ACP-240 requires <60s cache for authorization decisions.
 */

import Redis from 'ioredis';
import { logger } from '../utils/logger';

interface AttributeCacheConfig {
  ttl: number; // Seconds
  description: string;
}

export class AttributeCacheService {
  private redis: Redis;
  
  // TTL Configuration per attribute type (ADatP-5663 §5.4: Attribute Freshness)
  private readonly ATTRIBUTE_TTL: Record<string, AttributeCacheConfig> = {
    uniqueID: {
      ttl: 86400, // 24 hours (rarely changes)
      description: 'User unique identifier',
    },
    clearance: {
      ttl: 900, // 15 minutes (security-sensitive, refresh frequently)
      description: 'User clearance level',
    },
    countryOfAffiliation: {
      ttl: 28800, // 8 hours (rarely changes)
      description: 'User country affiliation',
    },
    acpCOI: {
      ttl: 1800, // 30 minutes (COI membership may change)
      description: 'Community of Interest memberships',
    },
    dutyOrg: {
      ttl: 3600, // 1 hour (organizational changes)
      description: 'Duty organization',
    },
    orgUnit: {
      ttl: 3600, // 1 hour
      description: 'Organizational unit',
    },
    email: {
      ttl: 7200, // 2 hours
      description: 'Email address',
    },
    givenName: {
      ttl: 86400, // 24 hours (rarely changes)
      description: 'First name',
    },
    surname: {
      ttl: 86400, // 24 hours (rarely changes)
      description: 'Last name',
    },
  };

  constructor(redisUrl?: string) {
    this.redis = new Redis(redisUrl || process.env.REDIS_URL || 'redis://localhost:6379');
    
    this.redis.on('connect', () => {
      logger.info('✅ Redis connected for attribute caching');
    });

    this.redis.on('error', (error) => {
      logger.error(`Redis error: ${error}`);
    });
  }

  /**
   * Generates cache key for user attribute
   */
  private getCacheKey(userId: string, attributeName: string): string {
    return `attr:${userId}:${attributeName}`;
  }

  /**
   * Gets TTL for attribute type
   */
  private getTTL(attributeName: string): number {
    return this.ATTRIBUTE_TTL[attributeName]?.ttl || 3600; // Default 1 hour
  }

  /**
   * Gets single attribute from cache
   */
  async get(userId: string, attributeName: string): Promise<string | null> {
    try {
      const key = this.getCacheKey(userId, attributeName);
      const value = await this.redis.get(key);
      
      if (value) {
        logger.debug(`Cache HIT: ${attributeName} for user ${userId}`);
        return value;
      }
      
      logger.debug(`Cache MISS: ${attributeName} for user ${userId}`);
      return null;
    } catch (error) {
      logger.error(`Cache get error: ${error}`);
      return null; // Fail gracefully
    }
  }

  /**
   * Gets multiple attributes from cache
   */
  async getMany(
    userId: string,
    attributeNames: string[]
  ): Promise<Record<string, string | null>> {
    const pipeline = this.redis.pipeline();
    
    attributeNames.forEach((name) => {
      const key = this.getCacheKey(userId, name);
      pipeline.get(key);
    });

    try {
      const results = await pipeline.exec();
      const attributes: Record<string, string | null> = {};

      attributeNames.forEach((name, index) => {
        if (results && results[index]) {
          const [error, value] = results[index];
          attributes[name] = error ? null : (value as string);
        }
      });

      const hits = Object.values(attributes).filter((v) => v !== null).length;
      logger.debug(
        `Cache batch: ${hits}/${attributeNames.length} hits for user ${userId}`
      );

      return attributes;
    } catch (error) {
      logger.error(`Cache getMany error: ${error}`);
      return attributeNames.reduce((acc, name) => ({ ...acc, [name]: null }), {});
    }
  }

  /**
   * Sets single attribute in cache with appropriate TTL
   */
  async set(
    userId: string,
    attributeName: string,
    value: string
  ): Promise<void> {
    try {
      const key = this.getCacheKey(userId, attributeName);
      const ttl = this.getTTL(attributeName);
      
      await this.redis.setex(key, ttl, value);
      
      logger.debug(
        `Cache SET: ${attributeName} for user ${userId} (TTL: ${ttl}s)`
      );
    } catch (error) {
      logger.error(`Cache set error: ${error}`);
      // Don't throw - caching is not critical path
    }
  }

  /**
   * Sets multiple attributes in cache
   */
  async setMany(
    userId: string,
    attributes: Record<string, string>
  ): Promise<void> {
    const pipeline = this.redis.pipeline();

    Object.entries(attributes).forEach(([name, value]) => {
      const key = this.getCacheKey(userId, name);
      const ttl = this.getTTL(name);
      pipeline.setex(key, ttl, value);
    });

    try {
      await pipeline.exec();
      logger.debug(
        `Cache batch SET: ${Object.keys(attributes).length} attributes for user ${userId}`
      );
    } catch (error) {
      logger.error(`Cache setMany error: ${error}`);
    }
  }

  /**
   * Invalidates all cached attributes for user
   */
  async invalidate(userId: string): Promise<void> {
    try {
      const pattern = `attr:${userId}:*`;
      const keys = await this.redis.keys(pattern);

      if (keys.length > 0) {
        await this.redis.del(...keys);
        logger.info(`Cache invalidated: ${keys.length} attributes for user ${userId}`);
      }
    } catch (error) {
      logger.error(`Cache invalidation error: ${error}`);
    }
  }

  /**
   * Gets cache statistics
   */
  async getStats(): Promise<{
    totalKeys: number;
    memoryUsed: string;
    hitRate?: number;
  }> {
    try {
      const info = await this.redis.info('stats');
      const memoryInfo = await this.redis.info('memory');
      
      // Parse info response
      const keyspaceHits = parseInt(
        info.match(/keyspace_hits:(\d+)/)?.[1] || '0',
        10
      );
      const keyspaceMisses = parseInt(
        info.match(/keyspace_misses:(\d+)/)?.[1] || '0',
        10
      );
      const totalKeys = await this.redis.dbsize();
      const memoryUsed = memoryInfo.match(/used_memory_human:(.+)/)?.[1] || 'unknown';

      const total = keyspaceHits + keyspaceMisses;
      const hitRate = total > 0 ? (keyspaceHits / total) * 100 : undefined;

      return {
        totalKeys,
        memoryUsed,
        hitRate,
      };
    } catch (error) {
      logger.error(`Cache stats error: ${error}`);
      return {
        totalKeys: 0,
        memoryUsed: 'unknown',
      };
    }
  }

  /**
   * Closes Redis connection
   */
  async close(): Promise<void> {
    await this.redis.quit();
    logger.info('Redis connection closed');
  }
}

// Singleton instance
export const attributeCacheService = new AttributeCacheService();
```

**File:** `backend/src/middleware/authz.middleware.ts` (update to use cache)

```typescript
// Update authz middleware to use attribute cache

import { attributeCacheService } from '../services/attribute-cache.service';

/**
 * Extract user attributes with caching
 */
async function getUserAttributes(userId: string, token: DecodedToken): Promise<IUserAttributes> {
  // Define required attributes
  const attributeNames = [
    'uniqueID',
    'clearance',
    'countryOfAffiliation',
    'acpCOI',
    'dutyOrg',
    'orgUnit',
  ];

  // Try to get from cache
  const cachedAttrs = await attributeCacheService.getMany(userId, attributeNames);

  // Build attributes object
  const attributes: Partial<IUserAttributes> = {};
  const missingAttributes: string[] = [];

  for (const name of attributeNames) {
    if (cachedAttrs[name]) {
      attributes[name] = cachedAttrs[name] as any;
    } else {
      missingAttributes.push(name);
    }
  }

  // Fetch missing attributes from Keycloak UserInfo endpoint
  if (missingAttributes.length > 0) {
    logger.debug(`Fetching ${missingAttributes.length} missing attributes from UserInfo`);
    
    const userInfo = await fetchUserInfo(token.access_token);
    
    // Populate missing attributes
    for (const name of missingAttributes) {
      if (userInfo[name]) {
        attributes[name] = userInfo[name];
        // Cache for future requests
        await attributeCacheService.set(userId, name, userInfo[name]);
      }
    }
  }

  return attributes as IUserAttributes;
}
```

### Testing

```bash
# 1. Deploy Redis via Docker Compose
docker-compose up -d redis

# 2. Install Redis client
cd backend
npm install ioredis

# 3. Test cache operations
npm run test:integration -- attribute-cache.test.ts

# 4. Verify cache hit/miss
# Make authorization request → Cache MISS (fetch from UserInfo)
# Make same request → Cache HIT (use cached attributes)

# 5. Check Redis keys
redis-cli
> KEYS attr:*
> TTL attr:user-123:clearance
# Expected: 900 seconds (15 min for clearance)

# 6. Monitor cache hit rate
curl http://localhost:4000/api/admin/cache/stats
# Expected: {"totalKeys": 50, "hitRate": 85.5, ...}

# 7. Test cache invalidation
curl -X POST http://localhost:4000/api/admin/users/user-123/cache/invalidate
# Expected: All user attributes removed from cache
```

### Acceptance Criteria

- [ ] Redis deployed and accessible
- [ ] Attribute cache service implemented
- [ ] TTL configured per attribute type (ranging from 15min to 24h)
- [ ] Integration with authz middleware (cache-first strategy)
- [ ] Cache hit rate monitoring (Prometheus metric)
- [ ] Cache invalidation endpoint: `POST /api/admin/users/{userId}/cache/invalidate`
- [ ] Cache statistics endpoint: `GET /api/admin/cache/stats`
- [ ] Target cache hit rate: >80%

---

## TASKS 2.5-2.7: DELEGATION (Token Exchange, Actor Claims, Audit Logging)

**Combined Effort:** 13 days (4 + 5 + 4)  
**Priority:** High  
**ADatP-5663:** §4.5 (Delegation Support)

### Objective

Implement OAuth 2.0 Token Exchange (RFC 8693) for delegation with actor claims and comprehensive audit logging.

### Implementation Overview

Due to the integrated nature of delegation, Tasks 2.5-2.7 are implemented together:
- **Task 2.5:** Token Exchange configuration
- **Task 2.6:** Actor claims in delegated tokens
- **Task 2.7:** Delegation audit logging

**File:** `terraform/modules/token-exchange/main.tf`

```hcl
# NATO Compliance: ADatP-5663 §4.5 - Delegation Support
# Phase 2, Tasks 2.5-2.7 - OAuth 2.0 Token Exchange

terraform {
  required_providers {
    keycloak = {
      source  = "mrparkers/keycloak"
      version = "~> 4.0"
    }
  }
}

# Enable token exchange for dive-v3-client
resource "keycloak_openid_client" "dive_v3_client_with_token_exchange" {
  realm_id  = "dive-v3-broker"
  client_id = "dive-v3-client"
  
  # ... existing configuration ...
  
  # Enable token exchange (RFC 8693)
  extra_config = {
    "token.exchange.permission.enabled" = "true"
  }
}

# Token Exchange Policy (who can exchange tokens)
# NOTE: Keycloak 26.4 requires Admin Console configuration for token exchange permissions
# This is a placeholder for documentation - manual configuration required

# Output token exchange status
output "token_exchange_status" {
  description = "Token exchange configuration status"
  value = {
    client_id  = keycloak_openid_client.dive_v3_client_with_token_exchange.client_id
    enabled    = true
    grant_type = "urn:ietf:params:oauth:grant-type:token-exchange"
    compliance = "ADatP-5663 §4.5 - Delegation Support (RFC 8693)"
    manual_steps = [
      "1. Navigate to Keycloak Admin Console",
      "2. Clients → dive-v3-client → Permissions → Token Exchange",
      "3. Enable permissions and define policies"
    ]
  }
}
```

**File:** `backend/src/services/token-exchange.service.ts`

```typescript
/**
 * NATO Compliance: ADatP-5663 §4.5 - Token Exchange Service
 * Phase 2, Tasks 2.5-2.7
 * 
 * Implements OAuth 2.0 Token Exchange (RFC 8693) for delegation.
 */

import axios from 'axios';
import { logger } from '../utils/logger';
import { delegationLoggerService } from './delegation-logger.service';

interface TokenExchangeRequest {
  subjectToken: string;           // Access token of requesting user
  audience?: string;              // Target audience (optional)
  requestedSubject?: string;      // Subject to impersonate (optional - delegation only)
  requestedTokenType?: string;    // Token type (default: access_token)
}

interface TokenExchangeResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
  issued_token_type?: string;
}

interface ActorClaim {
  sub: string;  // Subject identifier
  iss: string;  // Issuer
}

export class TokenExchangeService {
  private readonly keycloakUrl = process.env.KEYCLOAK_URL || 'http://localhost:8081';
  private readonly realm = 'dive-v3-broker';
  private readonly clientId = process.env.CLIENT_ID || 'dive-v3-client';
  private readonly clientSecret = process.env.CLIENT_SECRET || '';

  /**
   * Requests delegated token via OAuth 2.0 Token Exchange (RFC 8693)
   * 
   * @param request - Token exchange request parameters
   * @returns Delegated access token with actor claim
   */
  async exchangeToken(request: TokenExchangeRequest): Promise<TokenExchangeResponse> {
    const tokenEndpoint = `${this.keycloakUrl}/realms/${this.realm}/protocol/openid-connect/token`;

    const params = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      subject_token: request.subjectToken,
      subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
    });

    // Optional: Specify audience
    if (request.audience) {
      params.append('audience', request.audience);
    }

    // Optional: Specify requested subject (delegation)
    if (request.requestedSubject) {
      params.append('requested_subject', request.requestedSubject);
    }

    // Optional: Requested token type
    if (request.requestedTokenType) {
      params.append('requested_token_type', request.requestedTokenType);
    }

    try {
      logger.info('Requesting token exchange (RFC 8693)...');
      
      const response = await axios.post<TokenExchangeResponse>(
        tokenEndpoint,
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      logger.info('✅ Token exchange successful');
      
      // Log delegation event (ADatP-5663 §4.5: Track delegation chain)
      await this.logDelegation(request.subjectToken, response.data.access_token);

      return response.data;
    } catch (error) {
      logger.error(`Token exchange failed: ${error}`);
      
      if (axios.isAxiosError(error) && error.response) {
        throw new Error(
          `Token exchange error: ${error.response.data.error_description || error.response.data.error}`
        );
      }
      
      throw new Error(`Token exchange failed: ${(error as Error).message}`);
    }
  }

  /**
   * Extracts delegation chain from token
   * 
   * ADatP-5663 §4.5: Track outermost actor (current) and innermost actor (original)
   */
  extractDelegationChain(token: any): {
    outermost: ActorClaim;
    innermost: ActorClaim;
    chain: ActorClaim[];
  } {
    const chain: ActorClaim[] = [];
    let current = token;

    // Build chain from current token to original subject
    while (current) {
      chain.push({
        sub: current.sub,
        iss: current.iss,
      });

      // Check for actor claim (nested delegation)
      current = current.act;
    }

    return {
      outermost: chain[0],              // Current actor (who's making the request)
      innermost: chain[chain.length - 1], // Original subject
      chain,
    };
  }

  /**
   * Logs delegation event for audit compliance
   */
  private async logDelegation(
    subjectToken: string,
    delegatedToken: string
  ): Promise<void> {
    try {
      // Decode tokens to extract delegation chain
      const subjectDecoded = this.decodeToken(subjectToken);
      const delegatedDecoded = this.decodeToken(delegatedToken);

      const subjectChain = this.extractDelegationChain(subjectDecoded);
      const delegatedChain = this.extractDelegationChain(delegatedDecoded);

      // Log to delegation logger service (Task 2.7)
      await delegationLoggerService.logDelegationEvent({
        delegatingSubject: subjectChain.outermost,
        delegatedSubject: delegatedChain.innermost,
        delegationChain: delegatedChain.chain,
        timestamp: new Date().toISOString(),
        decision: 'ALLOW',
        reason: 'Token exchange successful',
      });
    } catch (error) {
      logger.error(`Failed to log delegation: ${error}`);
      // Don't fail token exchange if logging fails
    }
  }

  /**
   * Decodes JWT token (simplified - use proper library in production)
   */
  private decodeToken(token: string): any {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid JWT format');
      }

      const payload = Buffer.from(parts[1], 'base64').toString('utf-8');
      return JSON.parse(payload);
    } catch (error) {
      logger.error(`Token decode error: ${error}`);
      return {};
    }
  }
}

export const tokenExchangeService = new TokenExchangeService();
```

**File:** `backend/src/services/delegation-logger.service.ts`

```typescript
/**
 * NATO Compliance: ADatP-5663 §4.5 - Delegation Audit Logging
 * Phase 2, Task 2.7
 */

import { getDb } from '../config/mongodb';
import { logger } from '../utils/logger';

interface DelegationEvent {
  delegatingSubject: {
    sub: string;
    iss: string;
  };
  delegatedSubject: {
    sub: string;
    iss: string;
  };
  delegationChain: Array<{ sub: string; iss: string }>;
  timestamp: string;
  decision: 'ALLOW' | 'DENY';
  reason: string;
  resource?: string;
  requestId?: string;
}

export class DelegationLoggerService {
  private readonly collection = 'delegation_logs';

  /**
   * Logs delegation event to MongoDB
   */
  async logDelegationEvent(event: DelegationEvent): Promise<void> {
    try {
      const db = await getDb();
      const collection = db.collection(this.collection);

      const logEntry = {
        ...event,
        eventType: 'DELEGATION',
        createdAt: new Date(),
      };

      await collection.insertOne(logEntry);

      logger.info(
        `Delegation logged: ${event.delegatingSubject.sub} → ${event.delegatedSubject.sub}`
      );
    } catch (error) {
      logger.error(`Delegation logging error: ${error}`);
      // Don't throw - logging is not critical path
    }
  }

  /**
   * Queries delegation events for audit
   */
  async queryDelegationEvents(filters: {
    delegatingSubject?: string;
    delegatedSubject?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<DelegationEvent[]> {
    try {
      const db = await getDb();
      const collection = db.collection(this.collection);

      const query: any = {};

      if (filters.delegatingSubject) {
        query['delegatingSubject.sub'] = filters.delegatingSubject;
      }

      if (filters.delegatedSubject) {
        query['delegatedSubject.sub'] = filters.delegatedSubject;
      }

      if (filters.startDate || filters.endDate) {
        query.createdAt = {};
        if (filters.startDate) {
          query.createdAt.$gte = filters.startDate;
        }
        if (filters.endDate) {
          query.createdAt.$lte = filters.endDate;
        }
      }

      const events = await collection
        .find(query)
        .sort({ createdAt: -1 })
        .limit(filters.limit || 100)
        .toArray();

      return events as any;
    } catch (error) {
      logger.error(`Delegation query error: ${error}`);
      return [];
    }
  }
}

export const delegationLoggerService = new DelegationLoggerService();
```

**File:** `policies/delegation_policy.rego`

```rego
# NATO Compliance: ADatP-5663 §4.5 - Delegation Policy
# Phase 2, Task 2.7

package dive.delegation

import rego.v1

# Default deny delegation
default allow := false

# Allow delegation within same organization
allow if {
  input.delegatingSubject.dutyOrg == input.delegatedSubject.dutyOrg
  not is_cross_country_delegation
  has_sufficient_clearance
}

# Allow delegation if delegating user has higher or equal clearance
has_sufficient_clearance if {
  clearance_level(input.delegatingSubject.clearance) >= clearance_level(input.delegatedSubject.clearance)
}

# Deny cross-country delegation (configurable)
is_cross_country_delegation if {
  input.delegatingSubject.countryOfAffiliation != input.delegatedSubject.countryOfAffiliation
}

# Clearance level mapping
clearance_level("UNCLASSIFIED") := 0
clearance_level("CONFIDENTIAL") := 1
clearance_level("SECRET") := 2
clearance_level("TOP_SECRET") := 3

# Violation checks
is_impersonation if {
  # ADatP-5663 §4.5: Impersonation SHALL NOT occur
  # If actor chain is missing, this might be impersonation
  not input.delegationChain
  input.delegatingSubject.sub != input.subject.sub
}

# Decision reason
reason := "Delegation approved: same organization and sufficient clearance" if allow
reason := "Delegation denied: insufficient clearance" if not has_sufficient_clearance
reason := "Delegation denied: cross-country delegation not allowed" if is_cross_country_delegation
reason := "Delegation denied: potential impersonation detected" if is_impersonation
```

### Testing

```bash
# 1. Enable token exchange in Keycloak Admin Console
# Navigate to: Clients → dive-v3-client → Permissions → Token Exchange
# Enable and configure policies

# 2. Test token exchange
./scripts/test-token-exchange.sh

# 3. Verify actor claim in delegated token
# Decode delegated token, check for:
# {
#   "sub": "delegated-user",
#   "act": {
#     "sub": "delegating-user",
#     "iss": "http://localhost:8081/realms/dive-v3-broker"
#   }
# }

# 4. Test delegation policy
opa test policies/delegation_policy.rego policies/tests/

# 5. Verify delegation audit logs
curl http://localhost:4000/api/admin/delegation/logs | jq .

# Expected: Delegation events with full actor chain

# 6. Test cross-country delegation (should deny)
# Attempt: USA user → FRA user
# Expected: DENY (cross-country delegation not allowed)
```

### Acceptance Criteria

- [ ] Token exchange enabled for `dive-v3-client`
- [ ] Token exchange service implemented (`token-exchange.service.ts`)
- [ ] Actor claims (`act`) in delegated tokens
- [ ] Delegation chain extraction functional
- [ ] Delegation logger service implemented
- [ ] MongoDB `delegation_logs` collection created
- [ ] OPA delegation policy deployed (`delegation_policy.rego`)
- [ ] Delegation audit logs queryable
- [ ] Policy enforcement: Same organization only
- [ ] Policy enforcement: No cross-country delegation
- [ ] Policy enforcement: No impersonation (actor chain required)
- [ ] All delegation events logged (allow & deny)

---

## PHASE 2 SUMMARY

**Total Effort:** 27 days  
**Total Tasks:** 7  
**Total Deliverables:** 25+ files created

### Deliverables Checklist

**Task 2.1: Metadata Refresh**
- [ ] `backend/src/services/metadata-refresh.service.ts`
- [ ] `scripts/refresh-idp-metadata.sh`
- [ ] Admin REST API endpoint: `POST /api/admin/metadata/refresh`
- [ ] Cron job scheduled (daily 1:00 AM UTC)

**Task 2.2: Metadata Validation**
- [ ] `backend/src/services/metadata-validator.service.ts`
- [ ] `scripts/validate-idp-metadata.sh`
- [ ] OIDC JSON Schema validation
- [ ] SAML XML Schema validation
- [ ] SAML signature verification (xmlsec1)

**Task 2.3: LDAP Federation**
- [ ] `terraform/modules/ldap-federation/main.tf`
- [ ] `terraform/modules/ldap-federation/mappers.tf`
- [ ] 8 LDAP attribute mappers
- [ ] Daily/weekly sync configuration

**Task 2.4: Attribute Caching**
- [ ] `backend/src/services/attribute-cache.service.ts`
- [ ] Redis deployment
- [ ] TTL configuration per attribute type
- [ ] Cache statistics endpoint

**Tasks 2.5-2.7: Delegation**
- [ ] `terraform/modules/token-exchange/main.tf`
- [ ] `backend/src/services/token-exchange.service.ts`
- [ ] `backend/src/services/delegation-logger.service.ts`
- [ ] `policies/delegation_policy.rego`
- [ ] Actor claims implementation
- [ ] Delegation audit logging

### Compliance Impact

**Before Phase 2:**
- ACP-240: 90%
- ADatP-5663: 73%

**After Phase 2:**
- ACP-240: 90% (unchanged - Phase 3 will complete)
- ADatP-5663: **88%** (+15%)

### Next Steps

1. **Week 1 (Nov 18-22):** Tasks 2.1-2.2 (metadata management)
2. **Week 2 (Nov 25-29):** Tasks 2.3-2.4 (LDAP + caching)
3. **Week 3 (Dec 2-6):** Tasks 2.5-2.7 (delegation)
4. **Phase 2 Demo:** December 6, 2025
5. **Phase 3 Kickoff:** December 9, 2025

---

**Last Updated:** November 4, 2025  
**Status:** Ready for Implementation  
**Approval Required:** Stakeholder review + LDAP access coordination



