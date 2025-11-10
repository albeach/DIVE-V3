# KAS Federation Integration Guide

## Overview

This guide explains how to integrate DIVE V3 with other organizations' KAS (Key Access Service) instances for cross-organizational key access.

## Architecture

DIVE V3 supports **Multi-KAS Architecture** per ACP-240 Section 5.3, allowing:

1. **Multiple KAOs per resource** - Each KAO can reference a different KAS endpoint
2. **Cross-organizational KAS** - KAOs can point to external KAS instances
3. **Trust relationships** - Secure authentication between KAS instances
4. **Policy translation** - Automatic policy attribute translation between organizations
5. **Audit correlation** - Cross-domain audit trail correlation

## Integration Patterns

### Pattern 1: Direct KAS Integration

Your organization's KAS is directly accessible to DIVE V3:

```
DIVE V3 Backend → Your KAS → Key Release
```

**Requirements**:
- Your KAS exposes `/request-key` endpoint
- Authentication configured (mTLS, API key, or OAuth2)
- Policy evaluation compatible with DIVE V3 attributes

### Pattern 2: Federated KAS Integration

Your organization participates in a federation:

```
DIVE V3 Backend → Federation Broker → Your KAS → Key Release
```

**Requirements**:
- Federation broker handles routing
- Trust relationships established
- Policy translation configured

### Pattern 3: Multi-KAS with Failover

Multiple KAS instances for redundancy:

```
DIVE V3 Backend → Primary KAS (failover) → Secondary KAS
```

**Benefits**:
- High availability
- Geographic distribution
- Sovereignty (each nation's KAS)

## Setup Instructions

### Step 1: Configure KAS Registry

Create a KAS registry configuration file:

```bash
# Create config directory
mkdir -p config

# Copy example config
cp config/kas-registry.json.example config/kas-registry.json

# Edit with your KAS details
nano config/kas-registry.json
```

### Step 2: Configure Authentication

Choose authentication method:

#### Option A: Mutual TLS (mTLS)

**Best for**: High-security environments, government/military

```json
{
  "kasId": "your-kas",
  "organization": "Your Organization",
  "kasUrl": "https://kas.yourorg.com/request-key",
  "authMethod": "mtls",
  "authConfig": {
    "clientCert": "/etc/kas/certs/your-kas-client.crt",
    "clientKey": "/etc/kas/certs/your-kas-client.key",
    "caCert": "/etc/kas/certs/your-kas-ca.crt"
  }
}
```

**Certificate Requirements**:
- Client certificate signed by trusted CA
- CA certificate for server verification
- Certificates in PEM format

#### Option B: API Key

**Best for**: Simple integrations, testing

```json
{
  "kasId": "your-kas",
  "organization": "Your Organization",
  "kasUrl": "https://kas.yourorg.com/request-key",
  "authMethod": "apikey",
  "authConfig": {
    "apiKey": "your-secret-api-key",
    "apiKeyHeader": "X-API-Key"
  }
}
```

#### Option C: OAuth2 Client Credentials

**Best for**: Cloud-based KAS, standard OAuth2

```json
{
  "kasId": "your-kas",
  "organization": "Your Organization",
  "kasUrl": "https://kas.yourorg.com/request-key",
  "authMethod": "oauth2",
  "authConfig": {
    "oauth2ClientId": "your-client-id",
    "oauth2ClientSecret": "your-client-secret",
    "oauth2TokenUrl": "https://auth.yourorg.com/oauth2/token"
  }
}
```

### Step 3: Configure Policy Translation

If your organization uses different attribute values, configure translation:

```json
{
  "policyTranslation": {
    "clearanceMapping": {
      "UNCLASSIFIED": "PUBLIC",
      "CONFIDENTIAL": "RESTRICTED",
      "SECRET": "SECRET",
      "TOP_SECRET": "TOP SECRET"
    },
    "countryMapping": {
      "USA": "US",
      "GBR": "UK"
    },
    "coiMapping": {
      "FVEY": "FIVE-EYES",
      "NATO-COSMIC": "NATO-COSMIC"
    }
  }
}
```

### Step 4: Environment Variables (Alternative)

Instead of JSON config, use environment variables:

```bash
# KAS Registry Entry 1
KAS_REGISTRY_USA_KAS_ID=usa-kas
KAS_REGISTRY_USA_ORG="United States"
KAS_REGISTRY_USA_KAS_URL=https://kas.usa.mil/request-key
KAS_REGISTRY_USA_AUTH_METHOD=mtls
KAS_REGISTRY_USA_CLIENT_CERT=/etc/kas/certs/usa-client.crt
KAS_REGISTRY_USA_CLIENT_KEY=/etc/kas/certs/usa-client.key
KAS_REGISTRY_USA_CA_CERT=/etc/kas/certs/usa-ca.crt
KAS_REGISTRY_USA_SUPPORTED_COUNTRIES=USA
KAS_REGISTRY_USA_SUPPORTED_COIS=FVEY,US-ONLY
KAS_REGISTRY_USA_TRUST_LEVEL=high

# KAS Registry Entry 2
KAS_REGISTRY_GBR_KAS_ID=gbr-kas
KAS_REGISTRY_GBR_ORG="United Kingdom"
KAS_REGISTRY_GBR_KAS_URL=https://kas.uk.gov/request-key
KAS_REGISTRY_GBR_AUTH_METHOD=apikey
KAS_REGISTRY_GBR_API_KEY=your-api-key-here
KAS_REGISTRY_GBR_SUPPORTED_COUNTRIES=GBR
KAS_REGISTRY_GBR_SUPPORTED_COIS=FVEY,NATO-COSMIC
```

### Step 5: Initialize Registry

The registry is automatically loaded on KAS startup. To manually initialize:

```typescript
import { initializeKASRegistry } from './utils/kas-registry-loader';

initializeKASRegistry();
```

## Using External KAS in Resources

### Creating Resources with External KAS

When uploading a resource, specify external KAS in KAOs:

```typescript
const kaos = [
  {
    kaoId: 'kao-usa-001',
    kasUrl: 'https://kas.usa.mil/request-key',  // External KAS
    kasId: 'usa-kas',
    wrappedKey: '...',
    policyBinding: {
      clearanceRequired: 'SECRET',
      countriesAllowed: ['USA'],
      coiRequired: ['FVEY']
    }
  },
  {
    kaoId: 'kao-dive-001',
    kasUrl: 'http://kas:8080/request-key',  // DIVE V3 KAS
    kasId: 'dive-v3-kas',
    wrappedKey: '...',
    policyBinding: {
      clearanceRequired: 'SECRET',
      countriesAllowed: ['USA', 'GBR'],
      coiRequired: ['FVEY']
    }
  }
];
```

### Requesting Keys from External KAS

The backend automatically routes to the correct KAS based on KAO:

```typescript
// Backend automatically uses KAO's kasUrl
const kasUrl = kao.kasUrl;  // Could be external KAS URL
const response = await axios.post(`${kasUrl}/request-key`, {
  resourceId,
  kaoId,
  wrappedKey,
  bearerToken
});
```

## API Compatibility

### Required Endpoints

Your KAS must implement:

1. **Health Check**: `GET /health`
   ```json
   {
     "status": "healthy",
     "service": "your-kas",
     "version": "1.0.0"
   }
   ```

2. **Key Request**: `POST /request-key`
   ```json
   {
     "resourceId": "doc-123",
     "kaoId": "kao-456",
     "wrappedKey": "base64-encoded-key",
     "bearerToken": "jwt-token",
     "requestId": "req-789",
     "requestTimestamp": "2025-01-15T10:00:00Z"
   }
   ```

### Required Response Format

**Success (200)**:
```json
{
  "success": true,
  "dek": "base64-decrypted-key",
  "kaoId": "kao-456",
  "auditEventId": "audit-123"
}
```

**Denial (403)**:
```json
{
  "success": false,
  "error": "Forbidden",
  "denialReason": "Insufficient clearance",
  "auditEventId": "audit-124"
}
```

### Required JWT Claims

Your KAS should accept JWT tokens with:

- `uniqueID` - Unique user identifier
- `clearance` - UNCLASSIFIED | CONFIDENTIAL | SECRET | TOP_SECRET
- `countryOfAffiliation` - ISO 3166-1 alpha-3 (USA, GBR, etc.)
- `acpCOI` - Array of COI tags (optional)

## Testing Integration

### 1. Test Health Check

```bash
curl https://kas.yourorg.com/health
```

### 2. Test Key Request

```bash
curl -X POST https://kas.yourorg.com/request-key \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "resourceId": "test-doc",
    "kaoId": "test-kao",
    "wrappedKey": "dGVzdC1rZXk=",
    "bearerToken": "eyJhbGci...",
    "requestId": "test-001",
    "requestTimestamp": "2025-01-15T10:00:00Z"
  }'
```

### 3. Verify in DIVE V3

1. Upload a resource with external KAS KAO
2. Request key through DIVE V3 UI
3. Verify key is retrieved from external KAS
4. Check audit logs for cross-KAS events

## Security Considerations

### 1. Certificate Management

- Use FIPS 140-2 Level 2+ certificates for production
- Rotate certificates regularly (90 days recommended)
- Store private keys securely (HSM preferred)

### 2. Network Security

- Use TLS 1.3 for all KAS communications
- Implement network segmentation
- Use VPN or private networks when possible

### 3. Authentication

- Prefer mTLS for high-security environments
- Rotate API keys regularly
- Use OAuth2 with short-lived tokens

### 4. Audit Logging

- Log all cross-KAS requests
- Correlate audit events across domains
- Retain logs per compliance requirements (90+ days)

## Troubleshooting

### Issue: KAS Not Found

**Solution**: Verify KAS is registered in registry:
```typescript
import { kasRegistry } from './utils/kas-federation';
console.log(kasRegistry.listAll());
```

### Issue: Authentication Failed

**Solution**: Check authentication configuration:
- Verify certificates are valid and not expired
- Check API key is correct
- Verify OAuth2 credentials

### Issue: Policy Translation Errors

**Solution**: Review policy translation rules:
- Ensure all clearance levels mapped
- Verify country code mappings
- Check COI mappings

### Issue: Network Timeout

**Solution**: 
- Increase timeout in HTTP client config
- Check network connectivity
- Verify firewall rules

## Best Practices

1. **Start with API Key** - Easiest for initial testing
2. **Upgrade to mTLS** - For production deployments
3. **Test Policy Translation** - Verify attribute mappings
4. **Monitor Audit Logs** - Track cross-KAS requests
5. **Implement Failover** - Multiple KAS instances for redundancy
6. **Document Agreements** - SLA, security requirements, contact info

## Example: USA KAS Integration

```json
{
  "kasId": "usa-kas",
  "organization": "United States Department of Defense",
  "kasUrl": "https://kas.dod.mil/request-key",
  "authMethod": "mtls",
  "authConfig": {
    "clientCert": "/etc/kas/certs/dod-client.crt",
    "clientKey": "/etc/kas/certs/dod-client.key",
    "caCert": "/etc/kas/certs/dod-ca.crt"
  },
  "trustLevel": "high",
  "supportedCountries": ["USA"],
  "supportedCOIs": ["FVEY", "US-ONLY"],
  "policyTranslation": {
    "clearanceMapping": {
      "UNCLASSIFIED": "UNCLASSIFIED",
      "CONFIDENTIAL": "CONFIDENTIAL",
      "SECRET": "SECRET",
      "TOP_SECRET": "TOP SECRET"
    }
  }
}
```

## Support

For integration support:
1. Review `KAS-PARTNER-TESTING-GUIDE.md` for API details
2. Check `kas-registry.json.example` for configuration format
3. Contact DIVE V3 team for federation setup assistance

