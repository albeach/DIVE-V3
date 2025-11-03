# DIVE V3 SP Registry API Documentation

**Version**: 1.0.0  
**Last Updated**: November 3, 2025  
**Base URL**: `https://localhost:3000` (Development with mkcert) / `https://api.dive-v3.mil` (Production - future)

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [API Endpoints](#api-endpoints)
4. [Data Models](#data-models)
5. [Error Handling](#error-handling)
6. [Rate Limiting](#rate-limiting)
7. [Examples](#examples)
8. [Postman Collection](#postman-collection)

---

## Overview

The DIVE V3 SP Registry API enables administrators to manage external Service Providers (SPs) that integrate with DIVE V3 as a federated authorization server. This API provides complete CRUD operations for SP management, including registration, approval workflows, credential management, and activity monitoring.

### Local Development with HTTPS

This project uses **mkcert** for local HTTPS development. All API endpoints use `https://localhost` URLs:
- **Frontend**: `https://localhost:3000`
- **Backend API**: `https://localhost:4000`
- **Keycloak**: `https://localhost:8443`

Your SSL certificates are located in: `keycloak/certs/certificate.pem` and `keycloak/certs/key.pem`

### Key Features

- **SP Registration**: Register new external Service Providers
- **Approval Workflow**: Approve or reject pending SP registrations
- **Credential Management**: View and regenerate OAuth client credentials
- **Status Management**: Suspend or reactivate SPs
- **Activity Monitoring**: Track SP usage and requests
- **Search & Filter**: Find SPs by various criteria

### API Standards

- **Protocol**: REST over HTTPS
- **Authentication**: NextAuth Session-based (Admin-only)
- **Content Type**: `application/json`
- **Character Encoding**: UTF-8
- **Date Format**: ISO 8601 (`YYYY-MM-DDTHH:mm:ss.sssZ`)

---

## Authentication

All SP Registry API endpoints require **admin authentication** via NextAuth session.

### Session Requirements

```http
Cookie: next-auth.session-token=<session_token>
```

### Authorization

Only users with the `admin` role can access these endpoints.

### Authentication Errors

| Status Code | Error | Description |
|-------------|-------|-------------|
| `401` | Unauthorized | No valid session found |
| `403` | Forbidden | User does not have admin role |

---

## API Endpoints

### 1. List Service Providers

Retrieve a paginated list of all registered Service Providers with optional filtering.

**Endpoint**: `GET /api/admin/sp-registry`

**Authentication**: Admin session required

**Query Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `status` | string | No | Filter by status: `PENDING`, `ACTIVE`, `SUSPENDED`, `REVOKED` |
| `country` | string | No | Filter by country (ISO 3166-1 alpha-3, e.g., `USA`, `FRA`) |
| `organizationType` | string | No | Filter by type: `GOVERNMENT`, `MILITARY`, `CONTRACTOR`, `ACADEMIC` |
| `search` | string | No | Search by name, client ID, or technical contact |
| `page` | integer | No | Page number (default: 1) |
| `limit` | integer | No | Results per page (default: 20, max: 100) |

**Response**: `200 OK`

```json
{
  "sps": [
    {
      "spId": "SP-1730678400000-A1B2C3D4",
      "name": "France Defense Ministry",
      "description": "French Ministry of Defense - Coalition Partner",
      "organizationType": "GOVERNMENT",
      "country": "FRA",
      "technicalContact": {
        "name": "Jean Dupont",
        "email": "jean.dupont@defense.gouv.fr",
        "phone": "+33123456789"
      },
      "clientId": "sp-fra-1730678400000",
      "clientType": "confidential",
      "redirectUris": [
        "https://fra-sp.defense.mil/callback",
        "https://fra-sp.defense.mil/oauth/callback"
      ],
      "postLogoutRedirectUris": [
        "https://fra-sp.defense.mil/logout"
      ],
      "jwksUri": "https://fra-sp.defense.mil/.well-known/jwks.json",
      "tokenEndpointAuthMethod": "client_secret_post",
      "requirePKCE": true,
      "allowedScopes": [
        "openid",
        "profile",
        "email",
        "resource:read",
        "resource:search"
      ],
      "allowedGrantTypes": [
        "authorization_code",
        "refresh_token"
      ],
      "attributeRequirements": {
        "clearance": true,
        "country": true,
        "coi": true,
        "customAttributes": []
      },
      "rateLimit": {
        "requestsPerMinute": 100,
        "burstSize": 20,
        "quotaPerDay": 50000
      },
      "federationAgreements": [
        {
          "agreementId": "FA-2025-001",
          "countries": ["USA", "FRA"],
          "classifications": ["UNCLASSIFIED", "CONFIDENTIAL", "SECRET"],
          "validUntil": "2026-12-31T23:59:59.999Z"
        }
      ],
      "status": "ACTIVE",
      "approvedBy": "admin@dive-v3.mil",
      "approvedAt": "2025-11-03T10:30:00.000Z",
      "createdAt": "2025-11-03T10:00:00.000Z",
      "updatedAt": "2025-11-03T10:30:00.000Z",
      "lastActivity": "2025-11-03T14:25:00.000Z"
    }
  ],
  "total": 45,
  "page": 1,
  "limit": 20,
  "totalPages": 3
}
```

**Errors**:
- `401 Unauthorized`: Not authenticated
- `403 Forbidden`: Not authorized (admin role required)
- `500 Internal Server Error`: Backend error

---

### 2. Register New Service Provider

Create a new Service Provider registration (status: PENDING).

**Endpoint**: `POST /api/admin/sp-registry`

**Authentication**: Admin session required

**Request Body**:

```json
{
  "name": "France Defense Ministry",
  "description": "French Ministry of Defense - Coalition Partner",
  "organizationType": "GOVERNMENT",
  "country": "FRA",
  "technicalContact": {
    "name": "Jean Dupont",
    "email": "jean.dupont@defense.gouv.fr",
    "phone": "+33123456789"
  },
  "clientType": "confidential",
  "redirectUris": [
    "https://fra-sp.defense.mil/callback"
  ],
  "postLogoutRedirectUris": [
    "https://fra-sp.defense.mil/logout"
  ],
  "jwksUri": "https://fra-sp.defense.mil/.well-known/jwks.json",
  "tokenEndpointAuthMethod": "client_secret_post",
  "requirePKCE": true,
  "allowedScopes": [
    "openid",
    "profile",
    "resource:read"
  ],
  "allowedGrantTypes": [
    "authorization_code",
    "refresh_token"
  ],
  "attributeRequirements": {
    "clearance": true,
    "country": true,
    "coi": false
  },
  "rateLimit": {
    "requestsPerMinute": 100,
    "burstSize": 20,
    "quotaPerDay": 50000
  }
}
```

**Validation Rules**:
- `name`: 3-100 characters, required
- `description`: max 500 characters, optional
- `organizationType`: one of `GOVERNMENT`, `MILITARY`, `CONTRACTOR`, `ACADEMIC`
- `country`: ISO 3166-1 alpha-3 code (e.g., `USA`, `FRA`, `GBR`)
- `technicalContact.email`: valid email format
- `technicalContact.phone`: E.164 format (e.g., `+33123456789`)
- `redirectUris`: HTTPS required (except localhost), max 10 URIs
- `jwksUri`: valid HTTPS URL, accessible
- `allowedScopes`: valid scope names only
- `allowedGrantTypes`: valid grant types only
- `rateLimit.requestsPerMinute`: 1-1000
- `rateLimit.burstSize`: 1-100

**Response**: `201 Created`

```json
{
  "spId": "SP-1730678400000-A1B2C3D4",
  "name": "France Defense Ministry",
  "clientId": "sp-fra-1730678400000",
  "clientSecret": "5Up3rS3cr3tK3y123456789ABCDEF",
  "status": "PENDING",
  "message": "SP registered successfully. Client secret will only be shown once.",
  "createdAt": "2025-11-03T10:00:00.000Z"
}
```

**Important**: The `clientSecret` is only returned in this response. It cannot be retrieved later (only regenerated).

**Errors**:
- `400 Bad Request`: Validation error, invalid request body
- `401 Unauthorized`: Not authenticated
- `403 Forbidden`: Not authorized
- `409 Conflict`: SP with same name or client ID already exists
- `500 Internal Server Error`: Backend error

---

### 3. Get Service Provider Details

Retrieve detailed information about a specific Service Provider.

**Endpoint**: `GET /api/admin/sp-registry/{spId}`

**Authentication**: Admin session required

**Path Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `spId` | string | Yes | SP ID (e.g., `SP-1730678400000-A1B2C3D4`) |

**Response**: `200 OK`

```json
{
  "spId": "SP-1730678400000-A1B2C3D4",
  "name": "France Defense Ministry",
  "description": "French Ministry of Defense - Coalition Partner",
  "organizationType": "GOVERNMENT",
  "country": "FRA",
  "technicalContact": {
    "name": "Jean Dupont",
    "email": "jean.dupont@defense.gouv.fr",
    "phone": "+33123456789"
  },
  "clientId": "sp-fra-1730678400000",
  "clientType": "confidential",
  "redirectUris": [
    "https://fra-sp.defense.mil/callback"
  ],
  "allowedScopes": [
    "openid",
    "profile",
    "resource:read"
  ],
  "status": "ACTIVE",
  "createdAt": "2025-11-03T10:00:00.000Z",
  "updatedAt": "2025-11-03T10:30:00.000Z",
  "lastActivity": "2025-11-03T14:25:00.000Z"
}
```

**Note**: `clientSecret` is never returned in GET responses (security measure).

**Errors**:
- `401 Unauthorized`: Not authenticated
- `403 Forbidden`: Not authorized
- `404 Not Found`: SP not found
- `500 Internal Server Error`: Backend error

---

### 4. Update Service Provider

Update an existing Service Provider's configuration.

**Endpoint**: `PUT /api/admin/sp-registry/{spId}`

**Authentication**: Admin session required

**Path Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `spId` | string | Yes | SP ID to update |

**Request Body** (all fields optional):

```json
{
  "name": "France Defense Ministry - Updated",
  "description": "Updated description",
  "technicalContact": {
    "name": "Jean Dupont",
    "email": "jean.dupont@defense.gouv.fr",
    "phone": "+33123456789"
  },
  "redirectUris": [
    "https://fra-sp.defense.mil/callback",
    "https://fra-sp.defense.mil/oauth/callback"
  ],
  "allowedScopes": [
    "openid",
    "profile",
    "resource:read",
    "resource:write"
  ],
  "rateLimit": {
    "requestsPerMinute": 150,
    "burstSize": 30,
    "quotaPerDay": 100000
  }
}
```

**Response**: `200 OK`

```json
{
  "spId": "SP-1730678400000-A1B2C3D4",
  "name": "France Defense Ministry - Updated",
  "status": "ACTIVE",
  "updatedAt": "2025-11-03T15:00:00.000Z",
  "message": "SP updated successfully"
}
```

**Errors**:
- `400 Bad Request`: Validation error
- `401 Unauthorized`: Not authenticated
- `403 Forbidden`: Not authorized
- `404 Not Found`: SP not found
- `409 Conflict`: Duplicate name or client ID
- `500 Internal Server Error`: Backend error

---

### 5. Delete Service Provider

Delete a Service Provider (soft delete - status changes to REVOKED).

**Endpoint**: `DELETE /api/admin/sp-registry/{spId}`

**Authentication**: Admin session required

**Path Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `spId` | string | Yes | SP ID to delete |

**Response**: `200 OK`

```json
{
  "message": "SP deleted successfully",
  "spId": "SP-1730678400000-A1B2C3D4"
}
```

**Errors**:
- `401 Unauthorized`: Not authenticated
- `403 Forbidden`: Not authorized
- `404 Not Found`: SP not found
- `500 Internal Server Error`: Backend error

---

### 6. Approve/Reject Service Provider

Approve or reject a pending Service Provider registration.

**Endpoint**: `POST /api/admin/sp-registry/{spId}/approve`

**Authentication**: Admin session required

**Path Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `spId` | string | Yes | SP ID to approve/reject |

**Request Body**:

```json
{
  "action": "approve",
  "reason": "Verified SP credentials and federation agreement"
}
```

**Fields**:
- `action`: `"approve"` or `"reject"` (required)
- `reason`: Reason for approval/rejection (optional, max 500 chars)

**Response**: `200 OK`

```json
{
  "spId": "SP-1730678400000-A1B2C3D4",
  "status": "ACTIVE",
  "approvedBy": "admin@dive-v3.mil",
  "approvedAt": "2025-11-03T10:30:00.000Z",
  "message": "SP approved successfully"
}
```

**Errors**:
- `400 Bad Request`: Invalid action, SP not in PENDING status
- `401 Unauthorized`: Not authenticated
- `403 Forbidden`: Not authorized
- `404 Not Found`: SP not found
- `500 Internal Server Error`: Backend error

---

### 7. Suspend Service Provider

Suspend an active Service Provider (blocks all OAuth requests).

**Endpoint**: `POST /api/admin/sp-registry/{spId}/suspend`

**Authentication**: Admin session required

**Path Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `spId` | string | Yes | SP ID to suspend |

**Request Body**:

```json
{
  "reason": "Security incident - suspected credential compromise"
}
```

**Fields**:
- `reason`: Reason for suspension (required, 10-500 chars)

**Response**: `200 OK`

```json
{
  "spId": "SP-1730678400000-A1B2C3D4",
  "status": "SUSPENDED",
  "suspendedBy": "admin@dive-v3.mil",
  "suspendedAt": "2025-11-03T16:00:00.000Z",
  "reason": "Security incident - suspected credential compromise",
  "message": "SP suspended successfully"
}
```

**Note**: To reactivate, use the approve endpoint with action="approve".

**Errors**:
- `400 Bad Request`: Missing or invalid reason, SP not in ACTIVE status
- `401 Unauthorized`: Not authenticated
- `403 Forbidden`: Not authorized
- `404 Not Found`: SP not found
- `500 Internal Server Error`: Backend error

---

### 8. Regenerate Client Secret

Regenerate the OAuth client secret for a confidential client.

**Endpoint**: `POST /api/admin/sp-registry/{spId}/credentials`

**Authentication**: Admin session required

**Path Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `spId` | string | Yes | SP ID to regenerate credentials for |

**Request Body**: Empty `{}`

**Response**: `200 OK`

```json
{
  "clientId": "sp-fra-1730678400000",
  "clientSecret": "N3wS3cr3tK3y987654321FEDCBA",
  "regeneratedBy": "admin@dive-v3.mil",
  "regeneratedAt": "2025-11-03T16:30:00.000Z",
  "message": "Client secret regenerated successfully. This secret will only be shown once."
}
```

**Important**: 
- The new `clientSecret` is only returned in this response
- The old client secret is immediately invalidated
- Only works for `confidential` clients (not `public`)

**Errors**:
- `400 Bad Request`: SP is public client (no secret)
- `401 Unauthorized`: Not authenticated
- `403 Forbidden`: Not authorized
- `404 Not Found`: SP not found
- `500 Internal Server Error`: Backend error

---

### 9. Get Service Provider Activity

Retrieve recent activity logs for a Service Provider.

**Endpoint**: `GET /api/admin/sp-registry/{spId}/activity`

**Authentication**: Admin session required

**Path Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `spId` | string | Yes | SP ID |

**Query Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `limit` | integer | No | Number of logs to return (default: 50, max: 500) |
| `offset` | integer | No | Pagination offset (default: 0) |

**Response**: `200 OK`

```json
{
  "spId": "SP-1730678400000-A1B2C3D4",
  "activities": [
    {
      "timestamp": "2025-11-03T14:25:00.000Z",
      "action": "OAuth Token Request",
      "actorId": "sp-fra-1730678400000",
      "actorName": "France Defense Ministry",
      "details": {
        "grantType": "authorization_code",
        "scope": "openid profile resource:read",
        "result": "SUCCESS"
      },
      "ipAddress": "203.0.113.45"
    },
    {
      "timestamp": "2025-11-03T10:30:00.000Z",
      "action": "SP Approved",
      "actorId": "admin@dive-v3.mil",
      "actorName": "Admin User",
      "details": {
        "previousStatus": "PENDING",
        "newStatus": "ACTIVE"
      },
      "ipAddress": "192.0.2.10"
    }
  ],
  "total": 127,
  "limit": 50,
  "offset": 0
}
```

**Errors**:
- `401 Unauthorized`: Not authenticated
- `403 Forbidden`: Not authorized
- `404 Not Found`: SP not found
- `500 Internal Server Error`: Backend error

---

## Data Models

### IExternalSP

Complete Service Provider model.

```typescript
interface IExternalSP {
  spId: string;                    // Unique SP identifier
  name: string;                    // SP name (3-100 chars)
  description?: string;            // Optional description (max 500 chars)
  organizationType: 'GOVERNMENT' | 'MILITARY' | 'CONTRACTOR' | 'ACADEMIC';
  country: string;                 // ISO 3166-1 alpha-3 (USA, FRA, GBR, etc.)
  
  technicalContact: {
    name: string;                  // Contact name
    email: string;                 // Contact email
    phone?: string;                // Optional phone (E.164 format)
  };
  
  clientId: string;                // OAuth client ID
  clientSecret?: string;           // OAuth client secret (only returned on creation/regeneration)
  clientType: 'confidential' | 'public';
  redirectUris: string[];          // HTTPS URIs (except localhost)
  postLogoutRedirectUris?: string[];
  
  jwksUri?: string;                // Optional JWKS URI for JWT validation
  tokenEndpointAuthMethod: 'client_secret_basic' | 'client_secret_post' | 'private_key_jwt';
  requirePKCE: boolean;            // PKCE requirement flag
  
  allowedScopes: string[];         // Allowed OAuth scopes
  allowedGrantTypes: string[];     // Allowed grant types
  
  attributeRequirements: {
    clearance: boolean;            // Require clearance attribute
    country: boolean;              // Require country attribute
    coi?: boolean;                 // Require COI attribute
    customAttributes?: string[];   // Custom attribute requirements
  };
  
  rateLimit: {
    requestsPerMinute: number;     // 1-1000
    burstSize: number;             // 1-100
    quotaPerDay?: number;          // Optional daily quota
  };
  
  federationAgreements: Array<{
    agreementId: string;
    countries: string[];           // ISO 3166-1 alpha-3 codes
    classifications: string[];     // UNCLASSIFIED, CONFIDENTIAL, SECRET, TOP_SECRET
    validUntil: Date;              // Agreement expiration
  }>;
  
  status: 'PENDING' | 'APPROVED' | 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
  approvedBy?: string;             // Admin who approved
  approvedAt?: Date;               // Approval timestamp
  
  createdAt: Date;
  updatedAt: Date;
  lastActivity?: Date;             // Last OAuth/SCIM request
}
```

### Valid Values

**Organization Types**:
- `GOVERNMENT`
- `MILITARY`
- `CONTRACTOR`
- `ACADEMIC`

**Client Types**:
- `confidential`: Server-side clients with client secret
- `public`: Client-side clients (SPAs, mobile apps) without secret

**Token Endpoint Auth Methods**:
- `client_secret_post`: Client credentials in POST body
- `client_secret_basic`: Client credentials in Basic Auth header
- `private_key_jwt`: JWT assertion with private key

**Allowed Scopes**:
- `openid`: OpenID Connect
- `profile`: User profile information
- `email`: Email address
- `offline_access`: Refresh token support
- `resource:read`: Read access to resources
- `resource:write`: Write access to resources
- `resource:search`: Search federated resources
- `scim:read`: Read user provisioning data
- `scim:write`: Write user provisioning data

**Allowed Grant Types**:
- `authorization_code`: Authorization code flow with PKCE
- `refresh_token`: Refresh token grant
- `client_credentials`: Machine-to-machine authentication

**Status Values**:
- `PENDING`: Awaiting admin approval
- `APPROVED`: Approved (same as ACTIVE)
- `ACTIVE`: Active and operational
- `SUSPENDED`: Temporarily suspended
- `REVOKED`: Permanently revoked (deleted)

**Classifications**:
- `UNCLASSIFIED`
- `CONFIDENTIAL`
- `SECRET`
- `TOP_SECRET`

**Countries** (NATO members, ISO 3166-1 alpha-3):
- `USA`: United States
- `GBR`: United Kingdom
- `FRA`: France
- `DEU`: Germany
- `ITA`: Italy
- `CAN`: Canada
- `ESP`: Spain
- `POL`: Poland
- `NLD`: Netherlands
- `TUR`: Turkey

---

## Error Handling

### Error Response Format

All errors follow a consistent JSON format:

```json
{
  "error": "Error Type",
  "message": "Human-readable error message",
  "details": {
    "field": "Specific error details"
  }
}
```

### HTTP Status Codes

| Code | Meaning | Description |
|------|---------|-------------|
| `200` | OK | Request succeeded |
| `201` | Created | Resource created successfully |
| `400` | Bad Request | Invalid request (validation error) |
| `401` | Unauthorized | Authentication required |
| `403` | Forbidden | Insufficient permissions |
| `404` | Not Found | Resource not found |
| `409` | Conflict | Resource already exists |
| `429` | Too Many Requests | Rate limit exceeded |
| `500` | Internal Server Error | Server-side error |

### Common Error Examples

**Validation Error (400)**:
```json
{
  "error": "Validation Error",
  "message": "Invalid request body",
  "details": {
    "name": "Name must be at least 3 characters",
    "redirectUris": "At least one redirect URI is required"
  }
}
```

**Authentication Error (401)**:
```json
{
  "error": "Unauthorized",
  "message": "Authentication required"
}
```

**Authorization Error (403)**:
```json
{
  "error": "Forbidden",
  "message": "Admin access required"
}
```

**Not Found Error (404)**:
```json
{
  "error": "Not Found",
  "message": "SP not found with ID: SP-1730678400000-A1B2C3D4"
}
```

**Conflict Error (409)**:
```json
{
  "error": "Conflict",
  "message": "SP with name 'France Defense Ministry' already exists"
}
```

---

## Rate Limiting

### Admin API Rate Limits

| Endpoint | Rate Limit | Burst |
|----------|------------|-------|
| All SP Registry endpoints | 100 req/min | 20 |

### Rate Limit Headers

Responses include rate limit information in headers:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 85
X-RateLimit-Reset: 1730678460
```

### Rate Limit Exceeded Response

**Status**: `429 Too Many Requests`

```json
{
  "error": "Rate Limit Exceeded",
  "message": "Too many requests. Please try again in 45 seconds.",
  "retryAfter": 45
}
```

---

## Examples

### Example 1: Complete SP Registration Flow

```bash
# Step 1: Register new SP
curl -k -X POST https://localhost:3000/api/admin/sp-registry \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=<session_token>" \
  -d '{
    "name": "France Defense Ministry",
    "organizationType": "GOVERNMENT",
    "country": "FRA",
    "technicalContact": {
      "name": "Jean Dupont",
      "email": "jean.dupont@defense.gouv.fr",
      "phone": "+33123456789"
    },
    "clientType": "confidential",
    "redirectUris": ["https://fra-sp.defense.mil/callback"],
    "tokenEndpointAuthMethod": "client_secret_post",
    "requirePKCE": true,
    "allowedScopes": ["openid", "profile", "resource:read"],
    "allowedGrantTypes": ["authorization_code", "refresh_token"],
    "attributeRequirements": {
      "clearance": true,
      "country": true,
      "coi": false
    },
    "rateLimit": {
      "requestsPerMinute": 100,
      "burstSize": 20,
      "quotaPerDay": 50000
    }
  }'

# Response:
# {
#   "spId": "SP-1730678400000-A1B2C3D4",
#   "clientId": "sp-fra-1730678400000",
#   "clientSecret": "5Up3rS3cr3tK3y123456789ABCDEF",
#   "status": "PENDING"
# }

# Step 2: Approve SP
curl -k -X POST https://localhost:3000/api/admin/sp-registry/SP-1730678400000-A1B2C3D4/approve \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=<session_token>" \
  -d '{
    "action": "approve",
    "reason": "Verified credentials and federation agreement"
  }'

# Response:
# {
#   "spId": "SP-1730678400000-A1B2C3D4",
#   "status": "ACTIVE",
#   "message": "SP approved successfully"
# }

# Step 3: Get SP details
curl -k https://localhost:3000/api/admin/sp-registry/SP-1730678400000-A1B2C3D4 \
  -H "Cookie: next-auth.session-token=<session_token>"
```

### Example 2: Search and Filter

```bash
# Note: -k flag allows self-signed certificates (mkcert) in development

# Get all active SPs from France
curl -k "https://localhost:3000/api/admin/sp-registry?status=ACTIVE&country=FRA" \
  -H "Cookie: next-auth.session-token=<session_token>"

# Search for SPs by name
curl -k "https://localhost:3000/api/admin/sp-registry?search=France" \
  -H "Cookie: next-auth.session-token=<session_token>"

# Get pending SPs (for approval queue)
curl -k "https://localhost:3000/api/admin/sp-registry?status=PENDING&limit=50" \
  -H "Cookie: next-auth.session-token=<session_token>"
```

### Example 3: Credential Management

```bash
# Regenerate client secret
curl -k -X POST https://localhost:3000/api/admin/sp-registry/SP-1730678400000-A1B2C3D4/credentials \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=<session_token>"

# Response:
# {
#   "clientId": "sp-fra-1730678400000",
#   "clientSecret": "N3wS3cr3tK3y987654321FEDCBA",
#   "message": "Client secret regenerated successfully"
# }
```

### Example 4: Suspend and Reactivate

```bash
# Suspend SP
curl -k -X POST https://localhost:3000/api/admin/sp-registry/SP-1730678400000-A1B2C3D4/suspend \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=<session_token>" \
  -d '{
    "reason": "Security incident - credential compromise suspected"
  }'

# Reactivate SP (use approve endpoint)
curl -k -X POST https://localhost:3000/api/admin/sp-registry/SP-1730678400000-A1B2C3D4/approve \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=<session_token>" \
  -d '{
    "action": "approve",
    "reason": "Security incident resolved, credentials rotated"
  }'
```

---

## Postman Collection

### Import Collection

A Postman collection is available for easy testing:

```json
{
  "info": {
    "name": "DIVE V3 SP Registry API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "List SPs",
      "request": {
        "method": "GET",
        "url": "{{baseUrl}}/api/admin/sp-registry"
      }
    },
    {
      "name": "Register SP",
      "request": {
        "method": "POST",
        "url": "{{baseUrl}}/api/admin/sp-registry",
        "body": {
          "mode": "raw",
          "raw": "{\n  \"name\": \"Test SP\",\n  \"organizationType\": \"GOVERNMENT\",\n  \"country\": \"USA\"\n}"
        }
      }
    },
    {
      "name": "Get SP Details",
      "request": {
        "method": "GET",
        "url": "{{baseUrl}}/api/admin/sp-registry/{{spId}}"
      }
    },
    {
      "name": "Approve SP",
      "request": {
        "method": "POST",
        "url": "{{baseUrl}}/api/admin/sp-registry/{{spId}}/approve",
        "body": {
          "mode": "raw",
          "raw": "{\n  \"action\": \"approve\"\n}"
        }
      }
    }
  ],
  "variable": [
    {
      "key": "baseUrl",
      "value": "http://localhost:3000"
    },
    {
      "key": "spId",
      "value": "SP-1730678400000-A1B2C3D4"
    }
  ]
}
```

---

## Support

**Documentation**: See `docs/` directory for additional guides  
**Issues**: Open GitHub issue for bugs or feature requests  
**Contact**: DIVE V3 development team

---

**Last Updated**: November 3, 2025  
**Version**: 1.0.0  
**Status**: Production Ready

