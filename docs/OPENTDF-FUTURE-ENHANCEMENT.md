# OpenTDF Integration - Future Enhancement

**Status**: DEFERRED to Phase 5+  
**Reason**: `@opentdf/client` SDK requires additional infrastructure (OpenTDF Platform deployment)  
**Current Solution**: ZTDF custom implementation with STANAG 4778 cryptographic binding

## Overview

OpenTDF (Open Trusted Data Format) is a vendor-neutral standard for data-centric security. Phase 4 originally planned a pilot integration, but given:

1. **Infrastructure Requirements**: OpenTDF requires platform deployment (KAS, Attribute Authority, etc.)
2. **SDK Maturity**: `@opentdf/client` is in active development
3. **Current Capability**: DIVE-V3 already has ZTDF implementation with cryptographic binding

**Decision**: Document OpenTDF integration path for future enhancement (Phase 5+)

## Current ZTDF Implementation (Phase 4)

DIVE-V3 has implemented data-centric security using custom ZTDF format:

- **Cryptographic Binding**: RSA-SHA256 metadata signing (STANAG 4778)
- **Key Wrapping**: AES-256-GCM for DEK/KEK management
- **Policy Enforcement**: OPA-based ABAC with policy re-evaluation
- **Audit Logging**: 90-day retention of access decisions and key releases

See: `backend/src/services/ztdf-crypto.service.ts`

## OpenTDF Benefits (Future)

| Feature | Current ZTDF | OpenTDF | Benefit |
|---------|--------------|---------|---------|
| **Format** | Custom JSON | Standardized ZIP | Industry standard, tool compatibility |
| **Policy** | OPA Rego | XACML + TDF Policy | Vendor-neutral policy exchange |
| **SDK** | Custom | @opentdf/client | Reduced maintenance, community support |
| **Splitting** | Single file | Support splitting | Enhanced security for large files |
| **Offline Access** | No | Limited | Policy-bound decryption offline |

## Future Integration Path

### Phase 5.1: OpenTDF Platform Deployment

```bash
# Deploy OpenTDF services
docker-compose -f docker-compose.opentdf.yml up -d

Services:
- OpenTDF KAS (replaces custom KAS)
- Attribute Authority (maps Keycloak claims)
- Policy Decision Point (replaces OPA for TDF)
```

### Phase 5.2: SDK Installation

```bash
cd backend
npm install @opentdf/client --save
```

### Phase 5.3: Dual-Format Service

```typescript
// backend/src/services/opentdf.service.ts

import { NanoTDFClient } from '@opentdf/client';

export class OpenTDFService {
    private client: NanoTDFClient;

    constructor() {
        this.client = new NanoTDFClient({
            kasEndpoint: process.env.OPENTDF_KAS_URL,
            oidcOrigin: process.env.KEYCLOAK_URL,
            clientId: process.env.OPENTDF_CLIENT_ID
        });
    }

    /**
     * Encrypt file with OpenTDF (.tdf format)
     */
    async encrypt(plaintext: Buffer, policy: TDFPolicy): Promise<Buffer> {
        const tdf = await this.client.encrypt({
            plaintext,
            policy: this.convertOPAToTDF(policy),
            mimeType: 'application/octet-stream'
        });

        return Buffer.from(tdf);
    }

    /**
     * Decrypt .tdf file
     */
    async decrypt(tdf: Buffer): Promise<Buffer> {
        const plaintext = await this.client.decrypt(tdf);
        return Buffer.from(plaintext);
    }

    /**
     * Convert OPA Rego policy to OpenTDF format
     */
    private convertOPAToTDF(opaPolicy: any): TDFPolicy {
        return {
            uuid: crypto.randomUUID(),
            body: {
                dataAttributes: [
                    {
                        attribute: 'classification',
                        displayName: opaPolicy.classification
                    },
                    {
                        attribute: 'releasability',
                        displayName: opaPolicy.releasabilityTo.join(', ')
                    }
                ],
                dissem: opaPolicy.releasabilityTo
            }
        };
    }
}
```

### Phase 5.4: Resource Upload Enhancement

```typescript
// Dual-format upload (backward compatible)

async function uploadResource(req, res) {
    const { file, classification, releasabilityTo } = req.body;

    // 1. Create ZTDF version (current)
    const ztdf = await ztdfCryptoService.encrypt(file, policy);

    // 2. Create OpenTDF version (new)
    const opentdf = await opentdfService.encrypt(file, policy);

    // 3. Store both formats
    await resourceService.create({
        resourceId,
        ztdfContent: ztdf.toString('base64'),   // Current format
        tdfContent: opentdf.toString('base64'),  // New format
        format: 'dual',  // Supports both
        // ...
    });
}
```

### Phase 5.5: Policy Mapping

```typescript
// Map OPA Rego to OpenTDF XACML

interface TDFPolicyMapping {
    from: 'OPA';
    to: 'OpenTDF';
    rules: {
        clearance: 'classification attribute',
        releasability: 'dissemination controls',
        COI: 'entity attributes (COI)'
    };
}

// Example mapping
const opaPolicy = {
    classification: 'SECRET',
    releasabilityTo: ['USA', 'GBR'],
    COI: ['FVEY']
};

const tdfPolicy = {
    uuid: '...',
    body: {
        dataAttributes: [
            { attribute: 'classification:SECRET' },
            { attribute: 'releaseTo:USA' },
            { attribute: 'releaseTo:GBR' },
            { attribute: 'coi:FVEY' }
        ]
    }
};
```

## Migration Strategy

### Phase 5.6: Gradual Migration

1. **Week 1**: Deploy OpenTDF platform alongside existing KAS
2. **Week 2**: Dual-format upload (all new resources get both formats)
3. **Week 3**: Clients can download either format
4. **Week 4**: Monitor usage, validate performance
5. **Week 5**: Gradual migration of existing resources to .tdf
6. **Week 6+**: Deprecate custom ZTDF (when 100% migrated)

### Backward Compatibility

```typescript
// Download endpoint supports both formats

app.get('/api/resources/:id/download', async (req, res) => {
    const resource = await resourceService.findById(req.params.id);
    const format = req.query.format || 'auto';  // 'ztdf', 'tdf', 'auto'

    if (format === 'tdf' && resource.tdfContent) {
        // Decrypt with OpenTDF
        const plaintext = await opentdfService.decrypt(
            Buffer.from(resource.tdfContent, 'base64')
        );
        res.send(plaintext);
    } else {
        // Fallback to ZTDF (current)
        const plaintext = await ztdfCryptoService.decrypt(
            Buffer.from(resource.ztdfContent, 'base64')
        );
        res.send(plaintext);
    }
});
```

## Testing Requirements

### OpenTDF Integration Tests

```typescript
describe('OpenTDF Integration', () => {
    it('should encrypt file as .tdf', async () => {
        const plaintext = Buffer.from('Secret data');
        const tdf = await opentdfService.encrypt(plaintext, policy);

        expect(tdf).toBeDefined();
        expect(tdf.length).toBeGreaterThan(plaintext.length);  // Overhead
    });

    it('should decrypt .tdf file', async () => {
        const plaintext = Buffer.from('Secret data');
        const tdf = await opentdfService.encrypt(plaintext, policy);
        const decrypted = await opentdfService.decrypt(tdf);

        expect(decrypted).toEqual(plaintext);
    });

    it('should enforce policy on .tdf access', async () => {
        const tdf = await opentdfService.encrypt(secretData, { clearance: 'SECRET' });

        // User with CONFIDENTIAL clearance
        await expect(opentdfService.decrypt(tdf, confidentialUser)).rejects.toThrow('Insufficient clearance');

        // User with SECRET clearance
        const plaintext = await opentdfService.decrypt(tdf, secretUser);
        expect(plaintext).toEqual(secretData);
    });
});
```

## OpenTDF Platform Deployment

### Docker Compose

```yaml
# docker-compose.opentdf.yml

version: '3.8'

services:
  opentdf-kas:
    image: opentdf/kas:latest
    ports:
      - "8085:8080"
    environment:
      - OIDC_URL=${KEYCLOAK_URL}
      - OIDC_CLIENT_ID=opentdf-kas
      - DATABASE_URL=postgresql://postgres:password@postgres:5432/opentdf
    depends_on:
      - postgres

  opentdf-attributes:
    image: opentdf/attributes:latest
    ports:
      - "8086:8080"
    environment:
      - OIDC_URL=${KEYCLOAK_URL}
      - DATABASE_URL=postgresql://postgres:password@postgres:5432/opentdf

  opentdf-frontend:
    image: opentdf/frontend:latest
    ports:
      - "3001:3000"
    environment:
      - KAS_URL=http://opentdf-kas:8080
      - ATTRIBUTES_URL=http://opentdf-attributes:8080
```

## References

- [OpenTDF Documentation](https://opentdf.io)
- [OpenTDF GitHub](https://github.com/opentdf)
- [TDF Specification](https://github.com/opentdf/spec)
- [STANAG 4778 (NATO)](https://nso.nato.int/nso/nsdd/listpromulg.html?_STANAG_4778)

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2025-10-29 | Defer OpenTDF to Phase 5+ | Focus Phase 4 on cryptographic binding with proven tech |
| 2025-10-29 | Implement custom ZTDF with STANAG 4778 | Proven approach, no external dependencies |
| Future | Evaluate OpenTDF adoption | When platform is production-ready |

---

**Phase 4 Status**: ✅ Cryptographic binding complete (custom ZTDF)  
**Phase 5 Goal**: Migrate to OpenTDF standard (when infrastructure ready)  
**Current Capability**: Full data-centric security with STANAG 4778 compliance

