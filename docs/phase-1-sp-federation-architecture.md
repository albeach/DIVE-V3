# Phase 1: SP Federation Foundation - Technical Architecture

**Version**: 1.0  
**Date**: November 3, 2025  
**Phase Duration**: 3 weeks  
**Dependencies**: Existing DIVE V3 infrastructure  

---

## Overview

Phase 1 implements the foundation for external Service Providers (SPs) to authenticate users and access DIVE V3 resources. This phase focuses on OAuth 2.0/OIDC integration, SCIM provisioning, and SP registration capabilities.

---

## Architecture Components

### 1. OAuth 2.0 Authorization Server Extension

#### 1.1 Keycloak Realm Configuration

```typescript
// New Keycloak realm for external SPs
const externalSPRealm = {
  realm: "dive-v3-external-sp",
  enabled: true,
  displayName: "DIVE V3 External Service Providers",
  
  // OAuth 2.0 specific settings
  accessTokenLifespan: 900,        // 15 minutes
  ssoSessionIdleTimeout: 1800,     // 30 minutes
  offlineSessionIdleTimeout: 2592000, // 30 days
  
  // Security settings
  bruteForceProtected: true,
  passwordPolicy: "upperCase(2) and length(12) and specialChars(2) and digits(2)",
  
  // Token settings
  defaultSignatureAlgorithm: "RS256",
  accessCodeLifespan: 60,
  accessCodeLifespanUserAction: 300,
  
  // Client authentication
  clientAuthenticationFlow: "clients",
  directGrantFlow: "direct grant",
  registrationFlow: "registration"
};
```

#### 1.2 OAuth 2.0 Endpoints

```typescript
// backend/src/controllers/oauth.controller.ts

/**
 * OAuth 2.0 Authorization Endpoint
 * Supports authorization_code flow with PKCE
 */
export const authorizeHandler = async (req: Request, res: Response) => {
  const {
    response_type,
    client_id,
    redirect_uri,
    scope,
    state,
    code_challenge,
    code_challenge_method,
    nonce
  } = req.query;
  
  // Validate client
  const client = await validateClient(client_id as string);
  if (!client) {
    return res.status(400).json({ error: "invalid_client" });
  }
  
  // Validate redirect URI
  if (!client.redirectUris.includes(redirect_uri as string)) {
    return res.status(400).json({ error: "invalid_redirect_uri" });
  }
  
  // PKCE validation
  if (client.requirePKCE && !code_challenge) {
    return res.status(400).json({ error: "code_challenge_required" });
  }
  
  // Generate authorization code
  const authCode = await generateAuthorizationCode({
    clientId: client_id as string,
    userId: req.user.id,
    scope: scope as string,
    codeChallenge: code_challenge as string,
    codeChallengeMethod: code_challenge_method as string || "S256",
    nonce: nonce as string
  });
  
  // Redirect back to client
  const redirectUrl = new URL(redirect_uri as string);
  redirectUrl.searchParams.set("code", authCode);
  redirectUrl.searchParams.set("state", state as string);
  
  res.redirect(redirectUrl.toString());
};

/**
 * Token Exchange Endpoint
 */
export const tokenHandler = async (req: Request, res: Response) => {
  const {
    grant_type,
    code,
    redirect_uri,
    client_id,
    client_secret,
    code_verifier,
    refresh_token
  } = req.body;
  
  try {
    let tokenResponse;
    
    switch (grant_type) {
      case "authorization_code":
        tokenResponse = await handleAuthorizationCodeGrant({
          code,
          redirect_uri,
          client_id,
          client_secret,
          code_verifier
        });
        break;
        
      case "refresh_token":
        tokenResponse = await handleRefreshTokenGrant({
          refresh_token,
          client_id,
          client_secret
        });
        break;
        
      case "client_credentials":
        tokenResponse = await handleClientCredentialsGrant({
          client_id,
          client_secret,
          scope: req.body.scope
        });
        break;
        
      default:
        return res.status(400).json({ error: "unsupported_grant_type" });
    }
    
    res.json(tokenResponse);
  } catch (error) {
    logger.error("Token exchange error", { error, grant_type, client_id });
    res.status(400).json({ error: "invalid_request" });
  }
};
```

#### 1.3 Discovery Endpoints

```typescript
// backend/src/controllers/discovery.controller.ts

/**
 * OpenID Connect Discovery Endpoint
 */
export const wellKnownHandler = async (req: Request, res: Response) => {
  const baseUrl = process.env.PUBLIC_URL || "https://api.dive-v3.mil";
  
  const discoveryDoc = {
    issuer: `${baseUrl}`,
    authorization_endpoint: `${baseUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/oauth/token`,
    userinfo_endpoint: `${baseUrl}/oauth/userinfo`,
    jwks_uri: `${baseUrl}/oauth/jwks`,
    registration_endpoint: `${baseUrl}/oauth/register`,
    introspection_endpoint: `${baseUrl}/oauth/introspect`,
    revocation_endpoint: `${baseUrl}/oauth/revoke`,
    
    // Supported features
    scopes_supported: [
      "openid", "profile", "email", "offline_access",
      "resource:read", "resource:write", "resource:search"
    ],
    response_types_supported: ["code", "token", "id_token", "code id_token"],
    grant_types_supported: ["authorization_code", "refresh_token", "client_credentials"],
    subject_types_supported: ["public", "pairwise"],
    id_token_signing_alg_values_supported: ["RS256", "ES256"],
    token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic", "private_key_jwt"],
    claims_supported: [
      "sub", "iss", "aud", "exp", "iat", "auth_time", "nonce",
      "uniqueID", "clearance", "countryOfAffiliation", "acpCOI",
      "email", "email_verified", "name", "preferred_username"
    ],
    code_challenge_methods_supported: ["plain", "S256"],
    
    // DIVE V3 specific
    dive_v3_endpoints: {
      resource_api: `${baseUrl}/api/resources`,
      policy_lab: `${baseUrl}/api/policies-lab`,
      federation: `${baseUrl}/federation`
    }
  };
  
  res.json(discoveryDoc);
};
```

### 2. SCIM 2.0 Implementation

#### 2.1 SCIM User Resource

```typescript
// backend/src/models/scim-user.model.ts

export interface ISCIMUser {
  schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"];
  id: string;
  externalId?: string;
  userName: string;
  name: {
    formatted?: string;
    familyName?: string;
    givenName?: string;
  };
  emails: Array<{
    value: string;
    type?: string;
    primary?: boolean;
  }>;
  active: boolean;
  
  // DIVE V3 extensions
  "urn:dive:params:scim:schemas:extension:2.0:User": {
    clearance: string;
    countryOfAffiliation: string;
    acpCOI?: string[];
    dutyOrg?: string;
  };
  
  meta: {
    resourceType: "User";
    created: string;
    lastModified: string;
    version: string;
  };
}
```

#### 2.2 SCIM Endpoints

```typescript
// backend/src/controllers/scim.controller.ts

/**
 * SCIM User Search/List
 */
export const scimUsersHandler = async (req: Request, res: Response) => {
  const {
    filter,
    startIndex = 1,
    count = 20,
    attributes,
    excludedAttributes
  } = req.query;
  
  try {
    // Parse SCIM filter
    const parsedFilter = parseSCIMFilter(filter as string);
    
    // Query users
    const users = await scimService.searchUsers({
      filter: parsedFilter,
      startIndex: Number(startIndex),
      count: Number(count),
      attributes: attributes as string,
      excludedAttributes: excludedAttributes as string
    });
    
    const response = {
      schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
      totalResults: users.total,
      itemsPerPage: users.items.length,
      startIndex: Number(startIndex),
      Resources: users.items
    };
    
    res.json(response);
  } catch (error) {
    logger.error("SCIM search error", { error, filter });
    res.status(400).json({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      status: "400",
      detail: "Invalid filter"
    });
  }
};

/**
 * SCIM User Creation
 */
export const scimCreateUserHandler = async (req: Request, res: Response) => {
  const scimUser = req.body as ISCIMUser;
  
  try {
    // Validate required DIVE V3 attributes
    const diveExtension = scimUser["urn:dive:params:scim:schemas:extension:2.0:User"];
    if (!diveExtension?.clearance || !diveExtension?.countryOfAffiliation) {
      return res.status(400).json({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        status: "400",
        detail: "Missing required DIVE V3 attributes"
      });
    }
    
    // Create user in Keycloak
    const keycloakUser = await keycloakService.createUser({
      username: scimUser.userName,
      email: scimUser.emails[0]?.value,
      firstName: scimUser.name.givenName,
      lastName: scimUser.name.familyName,
      enabled: scimUser.active,
      attributes: {
        uniqueID: scimUser.userName,
        clearance: diveExtension.clearance,
        countryOfAffiliation: diveExtension.countryOfAffiliation,
        acpCOI: JSON.stringify(diveExtension.acpCOI || []),
        dutyOrg: diveExtension.dutyOrg
      }
    });
    
    // Return SCIM response
    const createdUser: ISCIMUser = {
      ...scimUser,
      id: keycloakUser.id,
      meta: {
        resourceType: "User",
        created: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        version: "1"
      }
    };
    
    res.status(201)
       .header("Location", `/scim/v2/Users/${keycloakUser.id}`)
       .json(createdUser);
       
  } catch (error) {
    logger.error("SCIM user creation error", { error, userName: scimUser.userName });
    res.status(409).json({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      status: "409",
      detail: "User already exists"
    });
  }
};
```

### 3. External SP Registration

#### 3.1 SP Registration API

```typescript
// backend/src/models/external-sp.model.ts

export interface IExternalSP {
  spId: string;
  name: string;
  description?: string;
  organizationType: 'GOVERNMENT' | 'MILITARY' | 'CONTRACTOR' | 'ACADEMIC';
  country: string;  // ISO 3166-1 alpha-3
  
  // Technical configuration
  technicalContact: {
    name: string;
    email: string;
    phone?: string;
  };
  
  // OAuth/OIDC configuration
  clientId: string;
  clientSecret?: string;  // Only for confidential clients
  clientType: 'confidential' | 'public';
  redirectUris: string[];
  postLogoutRedirectUris?: string[];
  
  // Security configuration
  jwksUri?: string;              // For JWT validation
  tokenEndpointAuthMethod: 'client_secret_basic' | 'client_secret_post' | 'private_key_jwt';
  requirePKCE: boolean;
  
  // Authorization configuration
  allowedScopes: string[];
  allowedGrantTypes: string[];
  attributeRequirements: {
    clearance: boolean;
    country: boolean;
    coi?: boolean;
    customAttributes?: string[];
  };
  
  // Operational limits
  rateLimit: {
    requestsPerMinute: number;
    burstSize: number;
    quotaPerDay?: number;
  };
  
  // Federation agreements
  federationAgreements: {
    agreementId: string;
    countries: string[];
    classifications: string[];
    validUntil: Date;
  }[];
  
  // Status
  status: 'PENDING' | 'APPROVED' | 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
  approvedBy?: string;
  approvedAt?: Date;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
  lastActivity?: Date;
}
```

#### 3.2 SP Management Service

```typescript
// backend/src/services/sp-management.service.ts

export class SPManagementService {
  
  /**
   * Register new external SP
   */
  async registerSP(request: ISPRegistrationRequest): Promise<IExternalSP> {
    // Validate technical requirements
    await this.validateTechnicalRequirements(request);
    
    // Generate OAuth client
    const client = await this.createOAuthClient(request);
    
    // Create SP record
    const sp: IExternalSP = {
      spId: generateSPId(),
      name: request.name,
      description: request.description,
      organizationType: request.organizationType,
      country: request.country,
      technicalContact: request.technicalContact,
      clientId: client.clientId,
      clientSecret: client.clientSecret,
      clientType: request.clientType,
      redirectUris: request.redirectUris,
      jwksUri: request.jwksUri,
      tokenEndpointAuthMethod: request.tokenEndpointAuthMethod,
      requirePKCE: request.requirePKCE || true,
      allowedScopes: request.allowedScopes,
      allowedGrantTypes: request.allowedGrantTypes,
      attributeRequirements: request.attributeRequirements,
      rateLimit: request.rateLimit || {
        requestsPerMinute: 60,
        burstSize: 10,
        quotaPerDay: 10000
      },
      federationAgreements: [],
      status: 'PENDING',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Save to database
    await this.saveSP(sp);
    
    // Notify approvers
    await this.notifyApprovers(sp);
    
    return sp;
  }
  
  /**
   * Validate SP technical requirements
   */
  private async validateTechnicalRequirements(request: ISPRegistrationRequest): Promise<void> {
    // Validate JWKS URI is accessible
    if (request.jwksUri) {
      try {
        const response = await axios.get(request.jwksUri, { timeout: 5000 });
        if (!response.data.keys || !Array.isArray(response.data.keys)) {
          throw new Error("Invalid JWKS format");
        }
      } catch (error) {
        throw new ValidationError("JWKS URI is not accessible or invalid");
      }
    }
    
    // Validate redirect URIs
    for (const uri of request.redirectUris) {
      const url = new URL(uri);
      if (url.protocol !== 'https:' && !url.hostname.includes('localhost')) {
        throw new ValidationError("Redirect URIs must use HTTPS");
      }
    }
    
    // Validate scopes
    const validScopes = ['openid', 'profile', 'email', 'resource:read', 'resource:write', 'resource:search'];
    for (const scope of request.allowedScopes) {
      if (!validScopes.includes(scope)) {
        throw new ValidationError(`Invalid scope: ${scope}`);
      }
    }
  }
  
  /**
   * Create OAuth client in Keycloak
   */
  private async createOAuthClient(request: ISPRegistrationRequest): Promise<IOAuthClient> {
    const client = {
      clientId: `sp-${request.country.toLowerCase()}-${Date.now()}`,
      clientSecret: request.clientType === 'confidential' ? generateSecureSecret() : undefined,
      enabled: false, // Start disabled until approved
      clientAuthenticatorType: this.mapAuthMethod(request.tokenEndpointAuthMethod),
      redirectUris: request.redirectUris,
      webOrigins: request.redirectUris.map(uri => new URL(uri).origin),
      standardFlowEnabled: true,
      implicitFlowEnabled: false,
      directAccessGrantsEnabled: false,
      serviceAccountsEnabled: request.allowedGrantTypes.includes('client_credentials'),
      authorizationServicesEnabled: false,
      publicClient: request.clientType === 'public',
      protocol: "openid-connect",
      attributes: {
        "pkce.code.challenge.method": request.requirePKCE ? "S256" : "",
        "use.refresh.tokens": "true",
        "client.secret.creation.time": String(Date.now())
      },
      defaultClientScopes: ["openid", "profile", "email"],
      optionalClientScopes: request.allowedScopes.filter(s => !["openid", "profile", "email"].includes(s))
    };
    
    return await keycloakAdmin.clients.create(client);
  }
}
```

### 4. Frontend SP Management UI

#### 4.1 SP Registration Wizard

```tsx
// frontend/src/app/admin/sp/new/page.tsx

export default function SPRegistrationWizard() {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<ISPRegistrationForm>({
    name: '',
    organizationType: 'GOVERNMENT',
    country: '',
    technicalContact: { name: '', email: '' },
    clientType: 'confidential',
    redirectUris: [''],
    tokenEndpointAuthMethod: 'client_secret_post',
    requirePKCE: true,
    allowedScopes: ['openid', 'profile', 'email', 'resource:read'],
    allowedGrantTypes: ['authorization_code', 'refresh_token'],
    attributeRequirements: {
      clearance: true,
      country: true,
      coi: false
    },
    rateLimit: {
      requestsPerMinute: 60,
      burstSize: 10
    }
  });
  
  const steps = [
    { title: 'Basic Information', component: <BasicInfoStep /> },
    { title: 'Technical Configuration', component: <TechnicalConfigStep /> },
    { title: 'Security Settings', component: <SecuritySettingsStep /> },
    { title: 'Attribute Requirements', component: <AttributeRequirementsStep /> },
    { title: 'Rate Limits', component: <RateLimitsStep /> },
    { title: 'Review & Submit', component: <ReviewStep /> }
  ];
  
  return (
    <PageLayout title="Register External Service Provider">
      <div className="max-w-4xl mx-auto">
        <WizardSteps currentStep={step} steps={steps} />
        
        <Card className="mt-8">
          <CardContent>
            {steps[step - 1].component}
          </CardContent>
          
          <CardFooter className="flex justify-between">
            <Button
              variant="outline"
              onClick={() => setStep(step - 1)}
              disabled={step === 1}
            >
              Previous
            </Button>
            
            {step < steps.length ? (
              <Button onClick={() => setStep(step + 1)}>
                Next
              </Button>
            ) : (
              <Button onClick={handleSubmit} variant="primary">
                Submit Registration
              </Button>
            )}
          </CardFooter>
        </Card>
      </div>
    </PageLayout>
  );
}
```

#### 4.2 SP Dashboard

```tsx
// frontend/src/app/admin/sp/dashboard/page.tsx

export default function SPDashboard() {
  const { data: sps, isLoading } = useQuery({
    queryKey: ['external-sps'],
    queryFn: fetchExternalSPs
  });
  
  return (
    <PageLayout title="External Service Providers">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <MetricCard
          title="Active SPs"
          value={sps?.filter(sp => sp.status === 'ACTIVE').length || 0}
          icon={<CheckCircleIcon />}
          trend="+12%"
        />
        <MetricCard
          title="Pending Approval"
          value={sps?.filter(sp => sp.status === 'PENDING').length || 0}
          icon={<ClockIcon />}
        />
        <MetricCard
          title="Total API Calls Today"
          value="45,231"
          icon={<ChartBarIcon />}
          trend="+8%"
        />
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Service Provider Registry</CardTitle>
          <Button onClick={() => router.push('/admin/sp/new')}>
            Register New SP
          </Button>
        </CardHeader>
        <CardContent>
          <SPDataTable sps={sps || []} />
        </CardContent>
      </Card>
    </PageLayout>
  );
}
```

### 5. Rate Limiting & Security

#### 5.1 Rate Limiting Middleware

```typescript
// backend/src/middleware/sp-rate-limit.middleware.ts

export const createSPRateLimiter = () => {
  const limiters = new Map<string, RateLimiter>();
  
  return async (req: Request, res: Response, next: NextFunction) => {
    // Extract client ID from request
    const clientId = extractClientId(req);
    if (!clientId) {
      return res.status(401).json({ error: "unauthorized_client" });
    }
    
    // Get SP configuration
    const sp = await spService.getByClientId(clientId);
    if (!sp || sp.status !== 'ACTIVE') {
      return res.status(403).json({ error: "inactive_client" });
    }
    
    // Get or create rate limiter for this SP
    if (!limiters.has(clientId)) {
      limiters.set(clientId, new RateLimiter({
        windowMs: 60 * 1000, // 1 minute
        max: sp.rateLimit.requestsPerMinute,
        burst: sp.rateLimit.burstSize
      }));
    }
    
    const limiter = limiters.get(clientId)!;
    const allowed = await limiter.check(req.ip);
    
    if (!allowed) {
      logger.warn("Rate limit exceeded", {
        clientId,
        ip: req.ip,
        limit: sp.rateLimit.requestsPerMinute
      });
      
      return res.status(429).json({
        error: "rate_limit_exceeded",
        retry_after: 60
      });
    }
    
    // Add rate limit headers
    res.setHeader('X-RateLimit-Limit', sp.rateLimit.requestsPerMinute);
    res.setHeader('X-RateLimit-Remaining', limiter.remaining(req.ip));
    res.setHeader('X-RateLimit-Reset', limiter.resetTime());
    
    next();
  };
};
```

#### 5.2 Security Validations

```typescript
// backend/src/utils/sp-security.utils.ts

/**
 * Validate JWT from external SP
 */
export async function validateSPToken(token: string, sp: IExternalSP): Promise<IJWTPayload> {
  try {
    // Get JWKS
    const jwks = await getJWKS(sp.jwksUri!);
    
    // Verify JWT
    const payload = await jose.jwtVerify(token, jwks, {
      issuer: sp.clientId,
      audience: process.env.DIVE_V3_AUDIENCE,
      algorithms: ['RS256', 'ES256']
    });
    
    // Validate required claims
    if (!payload.uniqueID || !payload.clearance || !payload.countryOfAffiliation) {
      throw new Error("Missing required DIVE V3 claims");
    }
    
    // Validate clearance format
    if (!isValidClearance(payload.clearance)) {
      throw new Error("Invalid clearance format");
    }
    
    // Validate country code
    if (!isValidCountryCode(payload.countryOfAffiliation)) {
      throw new Error("Invalid country code");
    }
    
    return payload;
  } catch (error) {
    logger.error("SP token validation failed", { error, spId: sp.spId });
    throw new UnauthorizedError("Invalid token");
  }
}

/**
 * Validate SP request signature
 */
export async function validateRequestSignature(
  req: Request,
  sp: IExternalSP
): Promise<boolean> {
  const signature = req.headers['x-dive-signature'] as string;
  if (!signature) {
    return false;
  }
  
  // Reconstruct canonical request
  const canonicalRequest = [
    req.method,
    req.path,
    req.headers['x-dive-timestamp'],
    req.headers['x-dive-nonce'],
    crypto.createHash('sha256').update(JSON.stringify(req.body)).digest('hex')
  ].join('\n');
  
  // Get SP's public key
  const publicKey = await getSPPublicKey(sp);
  
  // Verify signature
  const verify = crypto.createVerify('RSA-SHA256');
  verify.update(canonicalRequest);
  
  return verify.verify(publicKey, signature, 'base64');
}
```

### 6. Testing Strategy

#### 6.1 Integration Tests

```typescript
// backend/src/__tests__/sp-federation.integration.test.ts

describe('SP Federation Integration Tests', () => {
  let testSP: IExternalSP;
  let accessToken: string;
  
  beforeAll(async () => {
    // Register test SP
    testSP = await spService.registerSP({
      name: 'Test NATO SP',
      organizationType: 'MILITARY',
      country: 'GBR',
      // ... other fields
    });
    
    // Approve SP
    await spService.approveSP(testSP.spId, 'test-admin');
  });
  
  describe('OAuth 2.0 Flow', () => {
    it('should complete authorization code flow with PKCE', async () => {
      // Step 1: Authorization request
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = generateCodeChallenge(codeVerifier);
      
      const authResponse = await request(app)
        .get('/oauth/authorize')
        .query({
          response_type: 'code',
          client_id: testSP.clientId,
          redirect_uri: testSP.redirectUris[0],
          scope: 'openid profile resource:read',
          state: 'test-state',
          code_challenge: codeChallenge,
          code_challenge_method: 'S256'
        });
      
      expect(authResponse.status).toBe(302);
      const redirectUrl = new URL(authResponse.headers.location);
      const authCode = redirectUrl.searchParams.get('code');
      expect(authCode).toBeTruthy();
      
      // Step 2: Token exchange
      const tokenResponse = await request(app)
        .post('/oauth/token')
        .send({
          grant_type: 'authorization_code',
          code: authCode,
          redirect_uri: testSP.redirectUris[0],
          client_id: testSP.clientId,
          client_secret: testSP.clientSecret,
          code_verifier: codeVerifier
        });
      
      expect(tokenResponse.status).toBe(200);
      expect(tokenResponse.body).toHaveProperty('access_token');
      expect(tokenResponse.body).toHaveProperty('id_token');
      expect(tokenResponse.body).toHaveProperty('refresh_token');
      
      accessToken = tokenResponse.body.access_token;
    });
    
    it('should access protected resources with token', async () => {
      const resourceResponse = await request(app)
        .get('/api/resources')
        .set('Authorization', `Bearer ${accessToken}`);
      
      expect(resourceResponse.status).toBe(200);
      expect(resourceResponse.body).toHaveProperty('resources');
    });
  });
  
  describe('SCIM Provisioning', () => {
    it('should create user via SCIM', async () => {
      const scimUser = {
        schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
        userName: "test.user@nato.int",
        name: {
          givenName: "Test",
          familyName: "User"
        },
        emails: [{
          value: "test.user@nato.int",
          primary: true
        }],
        active: true,
        "urn:dive:params:scim:schemas:extension:2.0:User": {
          clearance: "SECRET",
          countryOfAffiliation: "GBR",
          acpCOI: ["NATO-COSMIC"]
        }
      };
      
      const response = await request(app)
        .post('/scim/v2/Users')
        .set('Authorization', `Bearer ${testSP.clientSecret}`)
        .send(scimUser);
      
      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.headers.location).toContain('/scim/v2/Users/');
    });
  });
});
```

### 7. Deployment Configuration

#### 7.1 Docker Services

```yaml
# docker-compose.federation.yml

services:
  oauth-cache:
    image: redis:7-alpine
    container_name: dive-v3-oauth-cache
    restart: unless-stopped
    networks:
      - dive-network
    volumes:
      - oauth_cache_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 30s
      timeout: 3s
      retries: 3
  
  scim-sync:
    build:
      context: ./federation/scim-sync
      dockerfile: Dockerfile
    container_name: dive-v3-scim-sync
    restart: unless-stopped
    networks:
      - dive-network
    environment:
      - KEYCLOAK_URL=http://keycloak:8080
      - SYNC_INTERVAL=300
    depends_on:
      - keycloak
      - postgres

volumes:
  oauth_cache_data:
```

#### 7.2 Nginx Configuration

```nginx
# nginx/federation.conf

upstream oauth_backend {
    server backend:4000;
}

server {
    listen 443 ssl http2;
    server_name api.dive-v3.mil;
    
    ssl_certificate /etc/nginx/certs/server.crt;
    ssl_certificate_key /etc/nginx/certs/server.key;
    
    # OAuth endpoints
    location /oauth/ {
        proxy_pass http://oauth_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # CORS for OAuth
        add_header Access-Control-Allow-Origin "*" always;
        add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Authorization, Content-Type" always;
    }
    
    # SCIM endpoints
    location /scim/ {
        proxy_pass http://oauth_backend;
        
        # Rate limiting for SCIM
        limit_req zone=scim_limit burst=20 nodelay;
        limit_req_status 429;
    }
    
    # Discovery endpoints
    location /.well-known/ {
        proxy_pass http://oauth_backend;
        proxy_cache discovery_cache;
        proxy_cache_valid 200 1h;
    }
}
```

---

## Implementation Timeline

### Week 1: OAuth 2.0 Foundation
- Day 1-2: Keycloak realm setup and OAuth endpoints
- Day 3-4: Token management and PKCE implementation  
- Day 5: Discovery endpoints and JWKS

### Week 2: SCIM Implementation
- Day 1-2: SCIM user resource and endpoints
- Day 3-4: Attribute mapping and validation
- Day 5: Bulk operations and sync service

### Week 3: SP Management & Testing
- Day 1-2: SP registration API and UI
- Day 3: Rate limiting and security
- Day 4-5: Integration testing and documentation

---

## Success Criteria

1. **OAuth Flow**: Complete authorization code flow with PKCE in < 2 seconds
2. **SCIM Provisioning**: Create/update 1000 users in < 5 minutes
3. **SP Onboarding**: Register and approve new SP in < 30 minutes
4. **Security**: Pass OWASP OAuth 2.0 security checklist
5. **Performance**: Handle 1000 concurrent OAuth sessions

---

## Next Steps

After Phase 1 completion:
1. Begin Phase 2: Extended Policy Framework
2. Pilot with 2-3 NATO partner SPs
3. Security audit of OAuth implementation
4. Performance testing with realistic load
