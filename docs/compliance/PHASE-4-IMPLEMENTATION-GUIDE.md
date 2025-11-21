# Phase 4 Implementation Guide - Attribute Authority & Policy

**Duration:** 3 weeks (December 30, 2025 - January 17, 2026)  
**Effort:** 23 working days  
**Status:** 🚧 Ready for Implementation  
**Compliance Improvement:** +7% ADatP-5663 (91% → 98%)

---

## OVERVIEW

Phase 4 delivers advanced attribute management: standalone Attribute Authority (AA) service with JWS-signed attributes, federation agreement enforcement, and client-specific attribute release policies. This phase completes the ADatP-5663 attribute exchange requirements.

### Prerequisites

- ✅ Phase 1 Complete (metadata, ACR/LoA, SAML)
- ✅ Phase 2 Complete (LDAP, caching, delegation)
- ✅ Phase 3 Complete (enterprise PKI, revocation)
- ✅ Redis operational (for attribute caching from Phase 2)
- ✅ MongoDB operational (for federation agreements)

### Success Criteria

- [ ] All 4 tasks completed and tested
- [ ] Attribute Authority service deployed
- [ ] JWS-signed attributes operational
- [ ] Federation agreements enforced
- [ ] **ADatP-5663: 98% compliance** ✅
- [ ] All CI/CD pipelines passing
- [ ] Phase 4 demo delivered to stakeholders

---

## TASK 4.1: DEPLOY ATTRIBUTE AUTHORITY SERVICE

**Owner:** Backend Developer  
**Effort:** 10 days  
**Priority:** Critical  
**ADatP-5663:** §3.4, §5.4.2 (Attribute Authority)

### Objective

Deploy standalone Attribute Authority (AA) microservice that provides JWS-signed attributes beyond token-based exchange.

### Implementation

**File:** `backend/src/services/attribute-authority.service.ts`

```typescript
/**
 * NATO Compliance: ADatP-5663 §3.4, §5.4.2 - Attribute Authority
 * Phase 4, Task 4.1
 * 
 * Standalone Attribute Authority service that:
 * 1. Fetches additional attributes (LDAP, database, computed)
 * 2. Signs attributes with JWS (RFC 7515)
 * 3. Returns signed attribute payload
 */

import axios from 'axios';
import * as jose from 'jose';
import { getDb } from '../config/mongodb';
import { logger } from '../utils/logger';
import { attributeCacheService } from './attribute-cache.service';

interface AttributeRequest {
  accessToken: string;
  attributeNames: string[];
}

interface SignedAttributes {
  attributes: Record<string, any>;
  signature: string;  // JWS Compact Serialization
  issuedAt: string;
  expiresAt: string;
}

export class AttributeAuthorityService {
  private aaPrivateKey?: jose.KeyLike;
  private aaPublicKey?: jose.KeyLike;

  constructor() {
    this.loadAAKeys();
  }

  /**
   * Loads Attribute Authority signing keys
   */
  private async loadAAKeys(): Promise<void> {
    try {
      // Generate or load AA key pair
      // In production, use HSM or key management service
      const { publicKey, privateKey } = await jose.generateKeyPair('RS256', {
        modulusLength: 4096,
      });

      this.aaPrivateKey = privateKey;
      this.aaPublicKey = publicKey;

      logger.info('✅ Attribute Authority keys loaded');
    } catch (error) {
      logger.error(`Failed to load AA keys: ${error}`);
      throw error;
    }
  }

  /**
   * Validates access token
   */
  private async validateAccessToken(
    accessToken: string
  ): Promise<jose.JWTPayload> {
    try {
      // Fetch JWKS from Keycloak
      const jwksUrl = `${process.env.KEYCLOAK_URL}/realms/dive-v3-broker/protocol/openid-connect/certs`;
      const JWKS = jose.createRemoteJWKSet(new URL(jwksUrl));

      // Verify token
      const { payload } = await jose.jwtVerify(accessToken, JWKS, {
        issuer: `${process.env.KEYCLOAK_URL}/realms/dive-v3-broker`,
        audience: 'dive-v3-client',
      });

      return payload;
    } catch (error) {
      throw new Error(`Access token validation failed: ${(error as Error).message}`);
    }
  }

  /**
   * Fetches attributes from multiple sources
   */
  private async fetchAttributes(
    userId: string,
    attributeNames: string[]
  ): Promise<Record<string, any>> {
    const attributes: Record<string, any> = {};

    // Try cache first (Phase 2)
    const cachedAttrs = await attributeCacheService.getMany(userId, attributeNames);

    // Fetch missing attributes
    const missingNames: string[] = [];
    for (const name of attributeNames) {
      if (cachedAttrs[name]) {
        attributes[name] = cachedAttrs[name];
      } else {
        missingNames.push(name);
      }
    }

    if (missingNames.length > 0) {
      // Fetch from LDAP (via Keycloak UserInfo) or database
      const additionalAttrs = await this.fetchFromLDAP(userId, missingNames);
      Object.assign(attributes, additionalAttrs);

      // Cache for future requests
      await attributeCacheService.setMany(userId, additionalAttrs);
    }

    return attributes;
  }

  /**
   * Fetches attributes from LDAP via Keycloak UserInfo
   */
  private async fetchFromLDAP(
    userId: string,
    attributeNames: string[]
  ): Promise<Record<string, any>> {
    // Placeholder: Call Keycloak Admin API or UserInfo endpoint
    // In production, directly query LDAP if more efficient
    return {};
  }

  /**
   * Signs attributes with JWS (RFC 7515)
   */
  private async signAttributes(
    attributes: Record<string, any>,
    subject: string
  ): Promise<string> {
    if (!this.aaPrivateKey) {
      throw new Error('AA private key not loaded');
    }

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      sub: subject,
      iss: 'dive-attribute-authority',
      iat: now,
      exp: now + 900, // 15 minutes validity
      attributes,
    };

    // Sign with JWS (RFC 7515)
    const jws = await new jose.SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuedAt(now)
      .setExpirationTime('15m')
      .sign(this.aaPrivateKey);

    return jws;
  }

  /**
   * Main AA endpoint: Get signed attributes
   * 
   * ADatP-5663 §5.4.2:
   * - AA retrieval requires valid access token
   * - Attributes digitally signed by AA for integrity
   */
  async getSignedAttributes(
    request: AttributeRequest
  ): Promise<SignedAttributes> {
    try {
      logger.info('Attribute Authority request received');

      // 1. Validate access token
      const tokenClaims = await this.validateAccessToken(request.accessToken);
      const subject = tokenClaims.sub as string;

      logger.info(`Access token valid for subject: ${subject}`);

      // 2. Fetch requested attributes
      const attributes = await this.fetchAttributes(
        subject,
        request.attributeNames
      );

      logger.info(
        `Fetched ${Object.keys(attributes).length} attributes for ${subject}`
      );

      // 3. Sign attributes with AA private key
      const signature = await this.signAttributes(attributes, subject);

      const now = new Date();
      const expires = new Date(now.getTime() + 15 * 60 * 1000); // 15 minutes

      logger.info(`✅ Signed attributes issued for ${subject}`);

      return {
        attributes,
        signature,
        issuedAt: now.toISOString(),
        expiresAt: expires.toISOString(),
      };
    } catch (error) {
      logger.error(`Attribute Authority error: ${error}`);
      throw error;
    }
  }

  /**
   * Verifies signed attributes
   */
  async verifySignedAttributes(jws: string): Promise<{
    valid: boolean;
    attributes?: Record<string, any>;
    error?: string;
  }> {
    try {
      if (!this.aaPublicKey) {
        throw new Error('AA public key not loaded');
      }

      const { payload } = await jose.jwtVerify(jws, this.aaPublicKey, {
        issuer: 'dive-attribute-authority',
      });

      return {
        valid: true,
        attributes: (payload as any).attributes,
      };
    } catch (error) {
      logger.error(`Attribute signature verification failed: ${error}`);
      return {
        valid: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Exports AA public key for SPs (JWKS format)
   */
  async getPublicJWKS(): Promise<jose.JSONWebKeySet> {
    if (!this.aaPublicKey) {
      throw new Error('AA public key not available');
    }

    const jwk = await jose.exportJWK(this.aaPublicKey);
    
    return {
      keys: [
        {
          ...jwk,
          use: 'sig',
          kid: 'dive-aa-signing-key',
          alg: 'RS256',
        },
      ],
    };
  }
}

export const attributeAuthorityService = new AttributeAuthorityService();
```

**File:** `backend/src/controllers/attribute-authority.controller.ts`

```typescript
/**
 * Attribute Authority API Endpoints
 */

import { Router } from 'express';
import { attributeAuthorityService } from '../services/attribute-authority.service';
import { validateAccessToken } from '../middleware/auth.middleware';
import { logger } from '../utils/logger';

const router = Router();

/**
 * POST /api/aa/attributes
 * Request signed attributes from Attribute Authority
 * 
 * ADatP-5663 §5.4.2: AA retrieval requires valid access token
 */
router.post('/attributes', validateAccessToken, async (req, res) => {
  try {
    const { accessToken, attributeNames } = req.body;

    if (!accessToken || !attributeNames) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'accessToken and attributeNames required',
      });
    }

    if (!Array.isArray(attributeNames)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'attributeNames must be an array',
      });
    }

    const result = await attributeAuthorityService.getSignedAttributes({
      accessToken,
      attributeNames,
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    logger.error(`Attribute Authority request failed: ${error}`);
    res.status(500).json({
      error: 'Internal Server Error',
      message: (error as Error).message,
    });
  }
});

/**
 * POST /api/aa/verify
 * Verifies signed attributes
 */
router.post('/verify', async (req, res) => {
  try {
    const { jws } = req.body;

    if (!jws) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'jws (signed attributes) required',
      });
    }

    const result = await attributeAuthorityService.verifySignedAttributes(jws);

    if (!result.valid) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid signature',
        details: result.error,
      });
    }

    res.json({
      success: true,
      valid: true,
      attributes: result.attributes,
    });
  } catch (error) {
    logger.error(`Attribute verification failed: ${error}`);
    res.status(500).json({
      error: 'Internal Server Error',
      message: (error as Error).message,
    });
  }
});

/**
 * GET /api/aa/.well-known/jwks.json
 * AA public key in JWKS format (for SPs to verify signatures)
 */
router.get('/.well-known/jwks.json', async (req, res) => {
  try {
    const jwks = await attributeAuthorityService.getPublicJWKS();
    res.json(jwks);
  } catch (error) {
    logger.error(`JWKS endpoint error: ${error}`);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to generate JWKS',
    });
  }
});

export default router;
```

### Testing

```bash
# 1. Install dependencies
cd backend
npm install jose

# 2. Start Attribute Authority service
npm run dev

# 3. Request signed attributes
curl -X POST http://localhost:4000/api/aa/attributes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -d '{
    "accessToken": "'${ACCESS_TOKEN}'",
    "attributeNames": ["clearance", "countryOfAffiliation", "acpCOI"]
  }'

# Expected response:
# {
#   "success": true,
#   "attributes": {
#     "clearance": "SECRET",
#     "countryOfAffiliation": "USA",
#     "acpCOI": ["NATO-COSMIC"]
#   },
#   "signature": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
#   "issuedAt": "2025-12-30T10:00:00.000Z",
#   "expiresAt": "2025-12-30T10:15:00.000Z"
# }

# 4. Verify signed attributes
SIGNATURE="eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."

curl -X POST http://localhost:4000/api/aa/verify \
  -H "Content-Type: application/json" \
  -d '{"jws": "'$SIGNATURE'"}'

# Expected: {"success": true, "valid": true, "attributes": {...}}

# 5. Get AA public JWKS
curl http://localhost:4000/api/aa/.well-known/jwks.json

# Expected: {"keys": [{"kty": "RSA", "use": "sig", "kid": "dive-aa-signing-key", ...}]}

# 6. Decode and verify JWS manually
echo $SIGNATURE | jwt decode -

# Expected: Payload with attributes and signature
```

### Acceptance Criteria

- [ ] Attribute Authority service implemented
- [ ] AA private/public key pair generated (RS256, 4096-bit)
- [ ] Attribute fetching from multiple sources (cache, LDAP, database)
- [ ] JWS signing implemented (RFC 7515)
- [ ] API endpoint: `POST /api/aa/attributes` (request signed attributes)
- [ ] API endpoint: `POST /api/aa/verify` (verify signature)
- [ ] API endpoint: `GET /api/aa/.well-known/jwks.json` (AA public key)
- [ ] Access token validation required
- [ ] Signed attributes valid for 15 minutes
- [ ] Integration with attribute cache (Phase 2)
- [ ] Performance: <200ms for attribute request (p95)

---

## TASK 4.2: ATTRIBUTE SIGNING (JWS)

**Owner:** Backend Developer  
**Effort:** 5 days  
**Priority:** High  
**ADatP-5663:** §5.4.2 (Signed Attributes)

### Objective

Enhance AA service with comprehensive JWS attribute signing, including nested attribute structures and batch operations.

### Implementation

**File:** `backend/src/services/attribute-signer.service.ts`

```typescript
/**
 * NATO Compliance: ADatP-5663 §5.4.2 - Attribute Signing
 * Phase 4, Task 4.2
 * 
 * JWS (RFC 7515) signing for attribute payloads.
 */

import * as jose from 'jose';
import { logger } from '../utils/logger';
import fs from 'fs/promises';
import path from 'path';

interface AttributePayload {
  sub: string;                        // Subject (uniqueID)
  iss: string;                        // Issuer (AA identifier)
  iat: number;                        // Issued at (Unix timestamp)
  exp: number;                        // Expiration (Unix timestamp)
  attributes: Record<string, any>;    // Attribute values
  attributeSources?: Record<string, string>; // Source per attribute (LDAP, DB, computed)
}

export class AttributeSignerService {
  private privateKey?: jose.KeyLike;
  private publicKey?: jose.KeyLike;
  private keyId = 'dive-aa-2025';

  constructor() {
    this.loadOrGenerateKeys();
  }

  /**
   * Loads or generates AA signing key pair
   */
  private async loadOrGenerateKeys(): Promise<void> {
    const keyPath = path.join(__dirname, '../../keys/aa-private-key.pem');
    const pubKeyPath = path.join(__dirname, '../../keys/aa-public-key.pem');

    try {
      // Try to load existing keys
      const privateKeyPem = await fs.readFile(keyPath, 'utf-8');
      const publicKeyPem = await fs.readFile(pubKeyPath, 'utf-8');

      this.privateKey = await jose.importPKCS8(privateKeyPem, 'RS256');
      this.publicKey = await jose.importSPKI(publicKeyPem, 'RS256');

      logger.info('✅ AA signing keys loaded from disk');
    } catch (error) {
      // Generate new key pair
      logger.info('Generating new AA signing key pair...');

      const { publicKey, privateKey } = await jose.generateKeyPair('RS256', {
        modulusLength: 4096,
      });

      this.privateKey = privateKey;
      this.publicKey = publicKey;

      // Export and save keys
      const privateKeyPem = await jose.exportPKCS8(privateKey);
      const publicKeyPem = await jose.exportSPKI(publicKey);

      await fs.mkdir(path.dirname(keyPath), { recursive: true });
      await fs.writeFile(keyPath, privateKeyPem, { mode: 0o600 });
      await fs.writeFile(pubKeyPath, publicKeyPem, { mode: 0o644 });

      logger.info('✅ AA signing keys generated and saved');
    }
  }

  /**
   * Signs attribute payload with JWS Compact Serialization
   */
  async signPayload(payload: AttributePayload): Promise<string> {
    if (!this.privateKey) {
      throw new Error('AA private key not initialized');
    }

    try {
      const jws = await new jose.SignJWT({ ...payload })
        .setProtectedHeader({
          alg: 'RS256',
          typ: 'JWT',
          kid: this.keyId,
        })
        .setIssuer(payload.iss)
        .setSubject(payload.sub)
        .setIssuedAt(payload.iat)
        .setExpirationTime(payload.exp)
        .sign(this.privateKey);

      logger.debug(`Signed attribute payload for ${payload.sub}`);
      return jws;
    } catch (error) {
      logger.error(`JWS signing failed: ${error}`);
      throw new Error(`Failed to sign attributes: ${(error as Error).message}`);
    }
  }

  /**
   * Verifies JWS signature
   */
  async verifySignature(jws: string): Promise<{
    valid: boolean;
    payload?: AttributePayload;
    error?: string;
  }> {
    if (!this.publicKey) {
      return { valid: false, error: 'AA public key not initialized' };
    }

    try {
      const { payload, protectedHeader } = await jose.jwtVerify(
        jws,
        this.publicKey,
        {
          issuer: 'dive-attribute-authority',
        }
      );

      // Verify key ID matches
      if (protectedHeader.kid !== this.keyId) {
        return {
          valid: false,
          error: `Key ID mismatch: ${protectedHeader.kid} != ${this.keyId}`,
        };
      }

      return {
        valid: true,
        payload: payload as unknown as AttributePayload,
      };
    } catch (error) {
      return {
        valid: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Exports public key as JWK
   */
  async exportPublicJWK(): Promise<jose.JWK> {
    if (!this.publicKey) {
      throw new Error('AA public key not initialized');
    }

    const jwk = await jose.exportJWK(this.publicKey);
    
    return {
      ...jwk,
      use: 'sig',
      kid: this.keyId,
      alg: 'RS256',
    };
  }
}

export const attributeSignerService = new AttributeSignerService();
```

### Testing

```bash
# 1. Test AA key generation
cd backend
npm run dev

# Expected logs:
# ✅ AA signing keys generated and saved
# Keys stored in: backend/keys/aa-private-key.pem

# 2. Verify key permissions
ls -la backend/keys/
# Expected: aa-private-key.pem (600 - owner read/write only)

# 3. Test attribute signing
curl -X POST http://localhost:4000/api/aa/attributes \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -d '{"accessToken": "'${ACCESS_TOKEN}'", "attributeNames": ["clearance"]}'

# Decode JWS
echo $JWS | jwt decode -

# Expected payload:
# {
#   "sub": "user-123",
#   "iss": "dive-attribute-authority",
#   "iat": 1703934000,
#   "exp": 1703934900,
#   "attributes": {"clearance": "SECRET"}
# }

# 4. Test signature verification
curl -X POST http://localhost:4000/api/aa/verify \
  -d '{"jws": "'$JWS'"}'

# Expected: {"success": true, "valid": true}

# 5. Get AA public JWKS
curl http://localhost:4000/api/aa/.well-known/jwks.json

# Expected: {"keys": [{"kty": "RSA", "kid": "dive-aa-2025", ...}]}
```

### Acceptance Criteria

- [ ] AA key pair generated or loaded (RS256, 4096-bit)
- [ ] Private key stored securely (0600 permissions)
- [ ] JWS signing implemented (RFC 7515)
- [ ] Signature verification implemented
- [ ] Key ID (`kid`) in JWS header
- [ ] Signed attributes expire after 15 minutes
- [ ] Public JWKS endpoint available
- [ ] Integration with AA service (Task 4.1)
- [ ] Performance: Signing <50ms, Verification <20ms

---

## TASK 4.3: FEDERATION AGREEMENT ENFORCEMENT

**Owner:** Backend Developer  
**Effort:** 5 days  
**Priority:** High  
**ADatP-5663:** §3.10, §6.8 (Federation Agreements)

### Objective

Implement federation agreement validation to enforce allowed countries, classifications, and COIs per Service Provider.

### Implementation

**File:** `backend/src/models/federation-agreement.model.ts`

```typescript
/**
 * NATO Compliance: ADatP-5663 §3.10, §6.8 - Federation Agreements
 * Phase 4, Task 4.3
 */

import { Schema, model } from 'mongoose';

export interface IFederationAgreement {
  spId: string;                           // Service Provider ID
  spName: string;                         // Human-readable name
  agreementId: string;                    // Unique agreement identifier
  
  // Allowed identity providers
  allowedIdPs: string[];                  // Realm IDs or aliases
  
  // Allowed countries (ISO 3166-1 alpha-3)
  allowedCountries: string[];             // ["USA", "GBR", "CAN", ...]
  
  // Allowed classification levels
  allowedClassifications: string[];       // ["UNCLASSIFIED", "CONFIDENTIAL", "SECRET"]
  maxClassification: string;              // Maximum classification
  
  // Allowed Communities of Interest
  allowedCOIs: string[];                  // ["NATO-COSMIC", "FVEY", ...]
  
  // Authentication requirements
  minAAL: number;                         // Minimum AAL (1, 2, or 3)
  maxAuthAge: number;                     // Maximum auth age (seconds)
  
  // Attribute release policy
  releaseAttributes: string[];            // Attributes to release to this SP
  
  // Agreement metadata
  effectiveDate: Date;
  expirationDate?: Date;
  status: 'active' | 'suspended' | 'expired';
  
  createdAt: Date;
  updatedAt: Date;
}

const federationAgreementSchema = new Schema<IFederationAgreement>({
  spId: { type: String, required: true, unique: true, index: true },
  spName: { type: String, required: true },
  agreementId: { type: String, required: true, unique: true },
  
  allowedIdPs: [{ type: String }],
  allowedCountries: [{ type: String }],
  allowedClassifications: [{ type: String }],
  maxClassification: { type: String },
  allowedCOIs: [{ type: String }],
  
  minAAL: { type: Number, min: 1, max: 3, default: 1 },
  maxAuthAge: { type: Number, default: 3600 }, // 1 hour default
  
  releaseAttributes: [{ type: String }],
  
  effectiveDate: { type: Date, required: true },
  expirationDate: { type: Date },
  status: {
    type: String,
    enum: ['active', 'suspended', 'expired'],
    default: 'active',
  },
}, {
  timestamps: true,
});

export const FederationAgreement = model<IFederationAgreement>(
  'FederationAgreement',
  federationAgreementSchema
);
```

**File:** `backend/src/middleware/federation-agreement.middleware.ts`

```typescript
/**
 * Federation Agreement Enforcement Middleware
 */

import { Request, Response, NextFunction } from 'express';
import { FederationAgreement, IFederationAgreement } from '../models/federation-agreement.model';
import { logger } from '../utils/logger';

interface FederationValidationResult {
  valid: boolean;
  agreement?: IFederationAgreement;
  violations: string[];
}

export async function enforceFederationAgreement(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const user = (req as any).user;
  const resource = (req as any).resource;
  const spId = req.headers['x-sp-id'] as string; // SP identifier from header

  if (!spId) {
    // No SP ID - internal request (no federation agreement required)
    return next();
  }

  try {
    const result = await validateFederationAgreement(user, resource, spId);

    if (!result.valid) {
      logger.warn(
        `Federation agreement violation for SP ${spId}: ${result.violations.join(', ')}`
      );

      res.status(403).json({
        error: 'Forbidden',
        message: 'Federation agreement violation',
        violations: result.violations,
      });
      return;
    }

    // Store agreement in request for later use
    (req as any).federationAgreement = result.agreement;
    
    logger.info(`✅ Federation agreement validated for SP ${spId}`);
    next();
  } catch (error) {
    logger.error(`Federation agreement check error: ${error}`);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Federation agreement validation failed',
    });
  }
}

/**
 * Validates request against federation agreement
 */
async function validateFederationAgreement(
  user: any,
  resource: any,
  spId: string
): Promise<FederationValidationResult> {
  const violations: string[] = [];

  // Fetch federation agreement
  const agreement = await FederationAgreement.findOne({
    spId,
    status: 'active',
  });

  if (!agreement) {
    return {
      valid: false,
      violations: [`No active federation agreement found for SP ${spId}`],
    };
  }

  // Check expiration
  if (agreement.expirationDate && new Date() > agreement.expirationDate) {
    return {
      valid: false,
      violations: ['Federation agreement expired'],
    };
  }

  // Validate IdP
  if (
    agreement.allowedIdPs.length > 0 &&
    !agreement.allowedIdPs.includes(user.iss)
  ) {
    violations.push(
      `IdP ${user.iss} not allowed (permitted: ${agreement.allowedIdPs.join(', ')})`
    );
  }

  // Validate country
  if (
    agreement.allowedCountries.length > 0 &&
    !agreement.allowedCountries.includes(user.countryOfAffiliation)
  ) {
    violations.push(
      `Country ${user.countryOfAffiliation} not allowed (permitted: ${agreement.allowedCountries.join(', ')})`
    );
  }

  // Validate classification
  const classificationLevels = ['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'];
  const resourceLevel = classificationLevels.indexOf(resource.classification);
  const maxLevel = classificationLevels.indexOf(agreement.maxClassification);

  if (resourceLevel > maxLevel) {
    violations.push(
      `Classification ${resource.classification} exceeds agreement max ${agreement.maxClassification}`
    );
  }

  // Validate COI (if resource has COI requirement)
  if (resource.COI && resource.COI.length > 0) {
    const userCOIs = user.acpCOI || [];
    const hasCOI = resource.COI.some((coi: string) => userCOIs.includes(coi));

    if (!hasCOI && agreement.allowedCOIs.length > 0) {
      const agreementHasCOI = resource.COI.some((coi: string) =>
        agreement.allowedCOIs.includes(coi)
      );

      if (!agreementHasCOI) {
        violations.push(
          `Resource COI ${resource.COI.join(', ')} not covered by agreement`
        );
      }
    }
  }

  // Validate AAL
  const currentAAL = parseInt(user.acr || '0', 10);
  if (currentAAL < agreement.minAAL) {
    violations.push(
      `AAL ${currentAAL} below agreement minimum ${agreement.minAAL}`
    );
  }

  // Validate auth age
  const authTime = user.auth_time || 0;
  const authAge = Math.floor(Date.now() / 1000) - authTime;

  if (authAge > agreement.maxAuthAge) {
    violations.push(
      `Authentication age ${authAge}s exceeds agreement max ${agreement.maxAuthAge}s`
    );
  }

  return {
    valid: violations.length === 0,
    agreement,
    violations,
  };
}

/**
 * Filters attributes based on federation agreement release policy
 */
export function filterAttributesForSP(
  attributes: Record<string, any>,
  agreement: IFederationAgreement
): Record<string, any> {
  const filtered: Record<string, any> = {};

  for (const attrName of agreement.releaseAttributes) {
    if (attributes[attrName] !== undefined) {
      filtered[attrName] = attributes[attrName];
    }
  }

  logger.debug(
    `Filtered ${Object.keys(filtered).length}/${Object.keys(attributes).length} attributes for SP ${agreement.spId}`
  );

  return filtered;
}
```

**File:** `backend/src/scripts/seed-federation-agreements.ts`

```typescript
/**
 * Seed sample federation agreements
 */

import { FederationAgreement } from '../models/federation-agreement.model';
import { connectDB } from '../config/mongodb';

async function seedFederationAgreements() {
  await connectDB();

  const agreements = [
    {
      spId: 'uk-coalition-portal',
      spName: 'United Kingdom Coalition Portal',
      agreementId: 'USA-GBR-2025-001',
      
      allowedIdPs: ['dive-v3-usa', 'dive-v3-gbr', 'dive-v3-can'],
      allowedCountries: ['USA', 'GBR', 'CAN'], // FVEY partners
      allowedClassifications: ['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET'],
      maxClassification: 'SECRET',
      allowedCOIs: ['NATO-COSMIC', 'FVEY'],
      
      minAAL: 2, // AAL2 required
      maxAuthAge: 1800, // 30 minutes
      
      releaseAttributes: [
        'uniqueID',
        'clearance',
        'countryOfAffiliation',
        'acpCOI',
        'givenName',
        'surname',
      ],
      
      effectiveDate: new Date('2025-01-01'),
      expirationDate: new Date('2026-12-31'),
      status: 'active',
    },
    {
      spId: 'france-defense-system',
      spName: 'France Ministry of Defense System',
      agreementId: 'USA-FRA-2025-002',
      
      allowedIdPs: ['dive-v3-usa', 'dive-v3-fra'],
      allowedCountries: ['USA', 'FRA'],
      allowedClassifications: ['UNCLASSIFIED', 'CONFIDENTIAL'],
      maxClassification: 'CONFIDENTIAL',
      allowedCOIs: ['NATO-COSMIC'],
      
      minAAL: 2,
      maxAuthAge: 3600, // 1 hour
      
      releaseAttributes: [
        'uniqueID',
        'clearance',
        'countryOfAffiliation',
        'acpCOI',
      ],
      
      effectiveDate: new Date('2025-06-01'),
      expirationDate: new Date('2026-05-31'),
      status: 'active',
    },
    {
      spId: 'industry-contractor-portal',
      spName: 'Industry Contractor Portal',
      agreementId: 'USA-IND-2025-003',
      
      allowedIdPs: ['dive-v3-industry'],
      allowedCountries: ['USA'],
      allowedClassifications: ['UNCLASSIFIED'],
      maxClassification: 'UNCLASSIFIED',
      allowedCOIs: [],
      
      minAAL: 1, // AAL1 for unclassified
      maxAuthAge: 7200, // 2 hours
      
      // Limited attribute release (pseudonymized)
      releaseAttributes: ['uniqueID'], // Only pseudonymous ID
      
      effectiveDate: new Date('2025-01-01'),
      status: 'active',
    },
  ];

  for (const agreement of agreements) {
    await FederationAgreement.findOneAndUpdate(
      { spId: agreement.spId },
      agreement,
      { upsert: true, new: true }
    );
    console.log(`✅ Federation agreement seeded: ${agreement.spId}`);
  }

  console.log(`✅ ${agreements.length} federation agreements created`);
  process.exit(0);
}

seedFederationAgreements();
```

### Testing

```bash
# 1. Seed federation agreements
cd backend
npm run seed:federation-agreements

# Expected: ✅ 3 federation agreements created

# 2. Verify agreements in MongoDB
mongo dive_v3
> db.federationagreements.find().pretty()

# Expected: 3 agreements (UK, France, Industry)

# 3. Test agreement enforcement - ALLOW scenario
curl -X GET http://localhost:4000/api/resources/doc-123 \
  -H "Authorization: Bearer ${UK_USER_TOKEN}" \
  -H "X-SP-ID: uk-coalition-portal"

# Expected: 200 OK (UK user, SECRET resource, valid agreement)

# 4. Test agreement enforcement - DENY scenario (country)
curl -X GET http://localhost:4000/api/resources/doc-123 \
  -H "Authorization: Bearer ${GERMAN_USER_TOKEN}" \
  -H "X-SP-ID: uk-coalition-portal"

# Expected: 403 Forbidden
# Violation: "Country DEU not allowed (permitted: USA, GBR, CAN)"

# 5. Test agreement enforcement - DENY scenario (classification)
curl -X GET http://localhost:4000/api/resources/top-secret-doc \
  -H "Authorization: Bearer ${UK_USER_TOKEN}" \
  -H "X-SP-ID: uk-coalition-portal"

# Expected: 403 Forbidden
# Violation: "Classification TOP_SECRET exceeds agreement max SECRET"

# 6. Test attribute filtering
# Request with industry SP → Should only receive uniqueID (pseudonymous)
curl -X POST http://localhost:4000/api/aa/attributes \
  -H "X-SP-ID: industry-contractor-portal" \
  -d '{"accessToken": "'${TOKEN}'", "attributeNames": ["clearance", "uniqueID"]}'

# Expected: Only uniqueID returned (clearance filtered)
```

### Acceptance Criteria

- [ ] Federation agreement model defined (Mongoose schema)
- [ ] 3 sample agreements seeded (UK, France, Industry)
- [ ] Federation agreement enforcement middleware implemented
- [ ] Country validation enforced
- [ ] Classification level validation enforced
- [ ] COI validation enforced
- [ ] AAL validation enforced
- [ ] Auth age validation enforced
- [ ] Attribute filtering per SP release policy
- [ ] Agreement violations logged (audit trail)
- [ ] Test coverage: All validation scenarios

---

## TASK 4.4: CLIENT-SPECIFIC ATTRIBUTE RELEASE

**Owner:** Backend Developer  
**Effort:** 3 days  
**Priority:** Medium  
**ADatP-5663:** §5.2 (SP Requirements)

### Objective

Implement client-specific attribute release policies using Keycloak client scopes and conditional mappers.

### Implementation

**File:** `terraform/modules/client-attribute-release/main.tf`

```hcl
# NATO Compliance: ADatP-5663 §5.2 - Client-Specific Attribute Release
# Phase 4, Task 4.4

terraform {
  required_providers {
    keycloak = {
      source  = "mrparkers/keycloak"
      version = "~> 4.0"
    }
  }
}

# Define client scopes for different attribute release levels

# Level 1: Minimal Attributes (Industry partners)
resource "keycloak_openid_client_scope" "minimal_attributes" {
  realm_id               = "dive-v3-broker"
  name                   = "minimal-attributes"
  description            = "Minimal attribute set for industry partners (pseudonymous)"
  include_in_token_scope = true

  # Only include: uniqueID (pseudonymous)
  # Exclude: clearance, countryOfAffiliation, acpCOI, realName
}

# Add mapper: uniqueID only (pseudonymous sub already included)
resource "keycloak_openid_user_attribute_protocol_mapper" "minimal_unique_id" {
  realm_id        = "dive-v3-broker"
  client_scope_id = keycloak_openid_client_scope.minimal_attributes.id
  name            = "uniqueID (pseudonymous)"

  user_attribute   = "uniqueID"
  claim_name       = "uniqueID"
  claim_value_type = "String"

  add_to_id_token     = true
  add_to_access_token = true
  add_to_userinfo     = true
}

# Level 2: Standard Attributes (NATO partners)
resource "keycloak_openid_client_scope" "standard_attributes" {
  realm_id               = "dive-v3-broker"
  name                   = "standard-attributes"
  description            = "Standard attribute set for NATO partners"
  include_in_token_scope = true

  # Include: uniqueID, clearance, countryOfAffiliation, acpCOI
  # Exclude: Personal information (givenName, surname, email)
}

# Add mappers for standard attributes (reuse from shared-mappers module)

# Level 3: Full Attributes (FVEY partners)
resource "keycloak_openid_client_scope" "full_attributes" {
  realm_id               = "dive-v3-broker"
  name                   = "full-attributes"
  description            = "Full attribute set for FVEY partners"
  include_in_token_scope = true

  # Include: All DIVE attributes + personal information
}

# Assign scopes to clients based on federation agreement

# Industry client: Minimal attributes
resource "keycloak_openid_client_default_scopes" "industry_scopes" {
  realm_id  = "dive-v3-broker"
  client_id = "dive-v3-industry-client"

  default_scopes = [
    "openid",
    "profile",
    "email",
    keycloak_openid_client_scope.minimal_attributes.name,
    keycloak_openid_client_scope.pseudonymous_subject.name, # From Phase 1
  ]
}

# UK SP: Full attributes
resource "keycloak_openid_client_default_scopes" "uk_sp_scopes" {
  realm_id  = "dive-v3-broker"
  client_id = "uk-coalition-portal"

  default_scopes = [
    "openid",
    "profile",
    "email",
    keycloak_openid_client_scope.full_attributes.name,
  ]
}

# Output client scope configuration
output "client_attribute_release" {
  description = "Client-specific attribute release configuration"
  value = {
    minimal  = "Industry partners (pseudonymous uniqueID only)"
    standard = "NATO partners (uniqueID, clearance, country, COI)"
    full     = "FVEY partners (all attributes + personal info)"
    compliance = "ADatP-5663 §5.2 - SP Attribute Requirements"
  }
}
```

### Testing

```bash
# 1. Apply Terraform configuration
cd terraform/modules/client-attribute-release
terraform apply

# 2. Test minimal attributes (industry client)
# Login as industry user → Obtain token → Decode
jwt decode $INDUSTRY_TOKEN

# Expected claims:
# - sub (pseudonymous)
# - uniqueID
# NO: clearance, countryOfAffiliation, givenName, surname

# 3. Test full attributes (UK SP)
jwt decode $UK_TOKEN

# Expected claims:
# - sub, uniqueID, clearance, countryOfAffiliation
# - acpCOI, dutyOrg, orgUnit
# - givenName, surname, email

# 4. Test scope enforcement
# Request token with unauthorized scope
curl -X POST "http://localhost:8081/realms/dive-v3-broker/protocol/openid-connect/token" \
  -d "client_id=dive-v3-industry-client" \
  -d "scope=openid full-attributes"  # Unauthorized scope

# Expected: Error (scope not allowed for this client)

# 5. Verify attribute filtering in AA endpoint
curl -X POST http://localhost:4000/api/aa/attributes \
  -H "X-SP-ID: industry-contractor-portal" \
  -d '{"accessToken": "'${TOKEN}'", "attributeNames": ["clearance", "uniqueID"]}'

# Expected: Only uniqueID returned (clearance filtered per agreement)
```

### Acceptance Criteria

- [ ] 3 client scopes defined (minimal, standard, full)
- [ ] Minimal scope: uniqueID (pseudonymous) only
- [ ] Standard scope: Security attributes (clearance, country, COI)
- [ ] Full scope: All attributes including personal information
- [ ] Client scope assignment per federation agreement
- [ ] Scope enforcement in token issuance
- [ ] Attribute filtering in AA service (Task 4.1)
- [ ] Test coverage: All scope levels
- [ ] Documentation: Attribute release policy guide

---

## PHASE 4 SUMMARY

**Total Effort:** 23 days  
**Total Tasks:** 4  
**Total Deliverables:** 15+ files created

### Deliverables Checklist

**Task 4.1: Attribute Authority**
- [ ] `backend/src/services/attribute-authority.service.ts`
- [ ] `backend/src/controllers/attribute-authority.controller.ts`
- [ ] API endpoints: `/api/aa/attributes`, `/api/aa/verify`, `/api/aa/.well-known/jwks.json`

**Task 4.2: Attribute Signing**
- [ ] `backend/src/services/attribute-signer.service.ts`
- [ ] AA signing key pair (RS256, 4096-bit)
- [ ] JWS signing and verification (RFC 7515)

**Task 4.3: Federation Agreements**
- [ ] `backend/src/models/federation-agreement.model.ts`
- [ ] `backend/src/middleware/federation-agreement.middleware.ts`
- [ ] `backend/src/scripts/seed-federation-agreements.ts`
- [ ] MongoDB `federationagreements` collection
- [ ] 3 sample agreements (UK, France, Industry)

**Task 4.4: Client Attribute Release**
- [ ] `terraform/modules/client-attribute-release/main.tf`
- [ ] 3 client scopes (minimal, standard, full)
- [ ] Scope assignments per client

### Compliance Impact

**Before Phase 4:**
- ACP-240: 100% ✅
- ADatP-5663: 91%

**After Phase 4:**
- **ACP-240: 100%** ✅ (maintained)
- **ADatP-5663: 98%** (+7%) ✅ **TARGET ACHIEVED!**

**ADatP-5663 Requirements Completed:**
- ✅ Attribute Authority integration (§3.4, §5.4.2)
- ✅ Signed attributes (§5.4.2)
- ✅ Federation agreements (§3.10, §6.8)
- ✅ Client-specific attribute release (§5.2)
- ✅ Attribute exchange mechanisms (§5.4)

**Remaining ADatP-5663 Gaps (2%):**
- ⚠️ OCSP support (optional "MAY" requirement - deferred)
- ⚠️ FAPI security profile (optional - deferred)

### Next Steps

1. **Week 1 (Dec 30 - Jan 3):** Task 4.1 (Attribute Authority service)
2. **Week 2 (Jan 6-10):** Tasks 4.2-4.3 (Signing + Federation agreements)
3. **Week 3 (Jan 13-17):** Task 4.4 (Client attribute release) + Integration testing
4. **Phase 4 Demo:** January 17, 2026
5. **Phase 5 Kickoff:** January 20, 2026

---

**Last Updated:** November 4, 2025  
**Status:** Ready for Implementation  
**Milestone:** Achieves 98% ADatP-5663 compliance (target exceeded!)



