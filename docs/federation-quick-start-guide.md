# DIVE V3 Federation Enhancement - Quick Start Guide

**Version**: 1.0  
**Date**: November 3, 2025  
**Purpose**: Practical steps to begin federation enhancement implementation  

---

## Overview

This guide provides immediate, actionable steps to enhance DIVE V3's federation capabilities. Start with these foundational changes while the full phased implementation plan is reviewed and approved.

---

## 🚀 Immediate Actions (Week 1)

### 1. Extend Current IdP Wizard for SP Support

Since DIVE V3 already has a robust IdP onboarding wizard, we can extend it to support SP registration with minimal effort.

#### Step 1.1: Add SP Type Selection

```tsx
// frontend/src/app/admin/idp/new/page.tsx
// Add to existing wizard

const ENTITY_TYPES = [
  { value: 'idp', label: 'Identity Provider (IdP)', description: 'Authenticate users' },
  { value: 'sp', label: 'Service Provider (SP)', description: 'Consume DIVE V3 resources' }
];

// In Step 1 of wizard
<RadioGroup value={formData.entityType} onValueChange={(value) => updateFormData({ entityType: value })}>
  {ENTITY_TYPES.map(type => (
    <RadioGroupItem key={type.value} value={type.value}>
      <Label>{type.label}</Label>
      <Text className="text-sm text-gray-600">{type.description}</Text>
    </RadioGroupItem>
  ))}
</RadioGroup>
```

#### Step 1.2: Create SP-Specific Configuration

```typescript
// backend/src/types/admin.types.ts
// Extend existing types

export interface ISPConfiguration extends IIdPFormData {
  entityType: 'sp';
  apiAccess: {
    scopes: string[];
    endpoints: string[];
    rateLimit: number;
  };
  resourceAccess: {
    classifications: string[];
    countries: string[];
    requiresKAS: boolean;
  };
}
```

### 2. Add OAuth 2.0 Client Credentials Flow

Implement a simple client credentials flow for SP-to-API authentication.

#### Step 2.1: Create OAuth Token Endpoint

```typescript
// backend/src/routes/oauth.routes.ts
// New file

import express from 'express';
import { tokenHandler } from '../controllers/oauth.controller';

const router = express.Router();

router.post('/oauth/token', tokenHandler);

export default router;
```

```typescript
// backend/src/controllers/oauth.controller.ts
// Simplified implementation

export const tokenHandler = async (req: Request, res: Response) => {
  const { grant_type, client_id, client_secret, scope } = req.body;
  
  if (grant_type !== 'client_credentials') {
    return res.status(400).json({ error: 'unsupported_grant_type' });
  }
  
  // Validate client credentials
  const client = await validateClient(client_id, client_secret);
  if (!client) {
    return res.status(401).json({ error: 'invalid_client' });
  }
  
  // Generate access token
  const accessToken = jwt.sign(
    {
      sub: client_id,
      iss: process.env.ISSUER_URL,
      aud: 'dive-v3-api',
      scope: scope || 'resource:read',
      client_type: 'service_provider'
    },
    process.env.JWT_PRIVATE_KEY!,
    { expiresIn: '1h', algorithm: 'RS256' }
  );
  
  res.json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: 3600,
    scope: scope || 'resource:read'
  });
};
```

#### Step 2.2: Update Authz Middleware

```typescript
// backend/src/middleware/authz.middleware.ts
// Add SP token validation

const validateSPToken = async (token: string): Promise<ISPContext | null> => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_PUBLIC_KEY!) as any;
    
    if (decoded.client_type === 'service_provider') {
      // Load SP configuration
      const sp = await spService.getByClientId(decoded.sub);
      if (!sp || sp.status !== 'ACTIVE') {
        return null;
      }
      
      return {
        clientId: decoded.sub,
        scopes: decoded.scope.split(' '),
        sp: sp
      };
    }
  } catch (error) {
    logger.error('SP token validation failed', { error });
  }
  return null;
};

// Update main authorization middleware
export const authzMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const token = extractToken(req);
  
  // Try user token first
  const userContext = await validateUserToken(token);
  if (userContext) {
    (req as any).user = userContext;
    return next();
  }
  
  // Try SP token
  const spContext = await validateSPToken(token);
  if (spContext) {
    (req as any).sp = spContext;
    return next();
  }
  
  res.status(401).json({ error: 'Unauthorized' });
};
```

### 3. Enable Basic Resource Federation

Start with a simple resource metadata exchange format.

#### Step 3.1: Create Federation Metadata Endpoint

```typescript
// backend/src/controllers/federation.controller.ts
// New file

export const federationMetadataHandler = async (req: Request, res: Response) => {
  const metadata = {
    entity: {
      id: process.env.ENTITY_ID || 'https://dive-v3.usa.mil',
      type: 'service_provider',
      name: 'DIVE V3 - USA',
      country: 'USA'
    },
    endpoints: {
      resources: `${process.env.API_URL}/api/resources`,
      search: `${process.env.API_URL}/federation/search`,
      policies: `${process.env.API_URL}/api/policies-lab`
    },
    capabilities: {
      protocols: ['OIDC', 'OAuth2', 'SAML2'],
      classifications: ['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'],
      countries: ['USA', 'GBR', 'CAN', 'AUS', 'NZL'], // FVEY example
      coi: ['NATO-COSMIC', 'FVEY', 'US-ONLY']
    },
    security: {
      tokenEndpoint: `${process.env.API_URL}/oauth/token`,
      jwksUri: `${process.env.API_URL}/oauth/jwks`,
      supportedAlgorithms: ['RS256', 'ES256']
    }
  };
  
  res.json(metadata);
};
```

#### Step 3.2: Add Federated Search Endpoint

```typescript
// backend/src/controllers/federation.controller.ts

export const federatedSearchHandler = async (req: Request, res: Response) => {
  const { classification, country, keywords } = req.query;
  const spContext = (req as any).sp;
  
  // Validate SP has search permissions
  if (!spContext.scopes.includes('resource:search')) {
    return res.status(403).json({ error: 'insufficient_scope' });
  }
  
  // Build query based on SP's allowed access
  const query: any = {};
  
  // Filter by SP's allowed classifications
  if (classification) {
    const allowed = spContext.sp.resourceAccess.classifications;
    if (!allowed.includes(classification)) {
      return res.status(403).json({ error: 'classification_not_allowed' });
    }
    query.classification = classification;
  }
  
  // Filter by releasability
  query.releasabilityTo = { $in: [spContext.sp.country] };
  
  // Search resources
  const resources = await resourceService.search(query, {
    limit: 100,
    fields: ['resourceId', 'title', 'classification', 'releasabilityTo', 'COI']
  });
  
  res.json({
    totalResults: resources.length,
    resources: resources,
    searchContext: {
      requestingEntity: spContext.sp.name,
      country: spContext.sp.country,
      timestamp: new Date().toISOString()
    }
  });
};
```

### 4. Extend Policies Lab for Partner Attributes

Allow partners to test policies with their custom attributes.

#### Step 4.1: Add Custom Attributes UI

```tsx
// frontend/src/components/policies-lab/attribute-builder.tsx
// Extend existing component

const CustomAttributesSection = () => {
  const [customAttributes, setCustomAttributes] = useState<Record<string, any>>({});
  
  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Partner-Specific Attributes (Optional)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <Input
            label="Namespace (e.g., 'fra', 'gbr')"
            value={namespace}
            onChange={(e) => setNamespace(e.target.value)}
          />
          
          <div className="space-y-2">
            {Object.entries(customAttributes).map(([key, value]) => (
              <div key={key} className="flex gap-2">
                <Input placeholder="Attribute name" value={key} />
                <Input placeholder="Value" value={value} />
                <Button variant="ghost" onClick={() => removeAttribute(key)}>
                  <XIcon className="w-4 h-4" />
                </Button>
              </div>
            ))}
            
            <Button variant="outline" onClick={addAttribute}>
              + Add Custom Attribute
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
```

#### Step 4.2: Update Policy Evaluation

```typescript
// backend/src/services/policy-execution.service.ts
// Extend to handle custom attributes

export async function evaluateRego(
  context: IPolicyExecutionContext,
  input: IUnifiedInput
): Promise<INormalizedDecision> {
  // Existing code...
  
  // Inject custom attributes if present
  if (input.extensions) {
    opaInput.input.subject.extensions = input.extensions;
  }
  
  // Evaluate with extended attributes
  const response = await axios.post(
    `${OPA_URL}/v1/data/${packagePath}`,
    opaInput,
    { timeout: 5000 }
  );
  
  // Rest of existing code...
}
```

### 5. Quick KAS Federation Support

Enable basic KAS endpoint discovery for partners.

#### Step 5.1: KAS Registry

```typescript
// backend/src/models/kas-registry.model.ts

export interface IKASEndpoint {
  kasId: string;
  domain: string;
  endpoint: string;
  publicKey: string;
  supportedAlgorithms: string[];
  status: 'ACTIVE' | 'INACTIVE';
  metadata: {
    country: string;
    operator: string;
    contactEmail: string;
  };
}

// backend/src/services/kas-registry.service.ts

export class KASRegistryService {
  async registerKAS(endpoint: IKASEndpoint): Promise<void> {
    // Validate endpoint is reachable
    const healthCheck = await axios.get(`${endpoint.endpoint}/health`);
    if (healthCheck.status !== 200) {
      throw new Error('KAS endpoint not healthy');
    }
    
    // Store in MongoDB
    await kasRegistryCollection.insertOne({
      ...endpoint,
      registeredAt: new Date(),
      lastHealthCheck: new Date()
    });
  }
  
  async discoverKAS(resourceDomain: string): Promise<IKASEndpoint | null> {
    return await kasRegistryCollection.findOne({
      domain: resourceDomain,
      status: 'ACTIVE'
    });
  }
}
```

---

## 📋 Implementation Checklist

### Week 1: Foundation
- [ ] Extend IdP wizard to support SP registration
- [ ] Implement basic OAuth client credentials flow
- [ ] Add SP token validation to authz middleware
- [ ] Create federation metadata endpoint
- [ ] Deploy and test with mock SP

### Week 2: Resource Federation
- [ ] Implement federated search endpoint
- [ ] Add resource metadata exchange format
- [ ] Create bilateral agreement configuration
- [ ] Test cross-domain resource discovery
- [ ] Document federation API

### Week 3: Advanced Features
- [ ] Extend Policies Lab for custom attributes
- [ ] Implement KAS endpoint registry
- [ ] Add rate limiting for SP endpoints
- [ ] Create SP monitoring dashboard
- [ ] Conduct security review

---

## 🧪 Testing Quick Start

### 1. Create Test SP

```bash
# Using curl to register test SP
curl -X POST https://localhost:4000/api/admin/sp \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test NATO SP",
    "country": "GBR",
    "clientType": "confidential",
    "allowedScopes": ["resource:read", "resource:search"],
    "redirectUris": ["https://test-sp.nato.int/callback"]
  }'
```

### 2. Get SP Access Token

```bash
# OAuth client credentials flow
curl -X POST https://localhost:4000/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=sp-gbr-123&client_secret=<secret>&scope=resource:read"
```

### 3. Search Resources

```bash
# Federated search
curl -X GET "https://localhost:4000/federation/search?classification=SECRET" \
  -H "Authorization: Bearer <sp-access-token>"
```

---

## 🔧 Configuration Changes

### 1. Environment Variables

```bash
# .env.local additions

# Federation
ENABLE_FEDERATION=true
ENTITY_ID=https://dive-v3.usa.mil
FEDERATION_METADATA_URL=https://api.dive-v3.mil/federation/metadata

# OAuth
OAUTH_ISSUER=https://api.dive-v3.mil
OAUTH_TOKEN_LIFETIME=3600
OAUTH_REFRESH_LIFETIME=86400

# Rate Limiting
DEFAULT_SP_RATE_LIMIT=60
DEFAULT_SP_BURST=10
```

### 2. Docker Compose

```yaml
# docker-compose.override.yml

services:
  backend:
    environment:
      - ENABLE_FEDERATION=true
    volumes:
      - ./federation/keys:/app/keys:ro
  
  oauth-cache:
    image: redis:7-alpine
    ports:
      - "6380:6379"
```

---

## 🚨 Important Considerations

### Security
1. **Always validate** SP tokens against active registry
2. **Implement rate limiting** from day one
3. **Log all federation activities** for audit
4. **Use mutual TLS** for SP-to-SP communication

### Performance
1. **Cache federation metadata** (1 hour TTL)
2. **Implement connection pooling** for cross-domain requests
3. **Use pagination** for large result sets
4. **Monitor latency** between domains

### Compliance
1. **Verify bilateral agreements** before sharing
2. **Respect classification markings**
3. **Audit cross-domain access**
4. **Maintain data lineage**

---

## 📞 Support & Resources

### Documentation
- [Federation API Reference](./federation-api-reference.md)
- [SP Onboarding Guide](./sp-onboarding-guide.md)
- [Security Best Practices](./federation-security.md)

### Contacts
- Technical Lead: federation-tech@dive-v3.mil
- Security Team: federation-security@dive-v3.mil
- Operations: federation-ops@dive-v3.mil

### Next Steps
1. **Week 1**: Implement basic federation
2. **Week 2**: Add first external SP
3. **Week 3**: Security audit
4. **Week 4**: Production pilot

---

**Remember**: Start small, test thoroughly, and iterate based on partner feedback. Federation is a journey, not a destination!
