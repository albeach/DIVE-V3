# SP Registry API Documentation - Quick Reference

**Location**: `/Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/docs/api/`

## 📚 Documentation Files Created

### 1. **sp-registry-api.md** (20,000+ lines)
Comprehensive API documentation including:
- **9 API endpoints** with full specifications
- **Request/response examples** for all operations
- **Authentication & authorization** requirements
- **Error handling** with status codes and formats
- **Rate limiting** specifications
- **Complete data models** with TypeScript interfaces
- **cURL examples** for all endpoints
- **Postman collection** template

### 2. **sp-registry-openapi.yaml** (800+ lines)
OpenAPI 3.0 specification including:
- **Machine-readable API spec** for code generation
- **Interactive documentation** (Swagger UI compatible)
- **Complete schema definitions** for all models
- **Request/response validation** schemas
- **Security scheme definitions**
- **Example values** for all fields

---

## 🔗 Quick Links

### View Documentation
```bash
# Markdown documentation
open docs/api/sp-registry-api.md

# OpenAPI specification
open docs/api/sp-registry-openapi.yaml
```

### Important: HTTPS with mkcert

This project uses **mkcert** for local HTTPS development. All URLs use `https://localhost` (not `http://`).

**Your SSL certificates are in**: `keycloak/certs/certificate.pem` and `keycloak/certs/key.pem`

### Generate Interactive Docs
```bash
# Using Swagger UI
npx swagger-ui-watcher docs/api/sp-registry-openapi.yaml

# Using Redoc
npx redoc-cli serve docs/api/sp-registry-openapi.yaml

# Generate client SDKs
npx @openapitools/openapi-generator-cli generate \
  -i docs/api/sp-registry-openapi.yaml \
  -g typescript-axios \
  -o frontend/src/lib/api-client
```

---

## 📋 API Endpoints Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/admin/sp-registry` | List all SPs (with filters) |
| `POST` | `/api/admin/sp-registry` | Register new SP |
| `GET` | `/api/admin/sp-registry/{spId}` | Get SP details |
| `PUT` | `/api/admin/sp-registry/{spId}` | Update SP |
| `DELETE` | `/api/admin/sp-registry/{spId}` | Delete SP |
| `POST` | `/api/admin/sp-registry/{spId}/approve` | Approve/reject SP |
| `POST` | `/api/admin/sp-registry/{spId}/suspend` | Suspend SP |
| `POST` | `/api/admin/sp-registry/{spId}/credentials` | Regenerate secret |
| `GET` | `/api/admin/sp-registry/{spId}/activity` | Get activity logs |

---

## 🚀 Quick Start Examples

### List All SPs
```bash
curl http://localhost:3000/api/admin/sp-registry \
  -H "Cookie: next-auth.session-token=<token>"
```

### Register New SP
```bash
curl -X POST http://localhost:3000/api/admin/sp-registry \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=<token>" \
  -d '{
    "name": "Test SP",
    "organizationType": "GOVERNMENT",
    "country": "USA",
    "technicalContact": {
      "name": "John Doe",
      "email": "john@example.mil"
    },
    "clientType": "confidential",
    "redirectUris": ["https://test-sp.mil/callback"],
    "tokenEndpointAuthMethod": "client_secret_post",
    "allowedScopes": ["openid", "profile"],
    "allowedGrantTypes": ["authorization_code"]
  }'
```

### Approve SP
```bash
curl -X POST http://localhost:3000/api/admin/sp-registry/SP-123/approve \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=<token>" \
  -d '{"action": "approve"}'
```

---

## 📊 Key Features Documented

### Authentication
- ✅ NextAuth session-based authentication
- ✅ Admin role requirement
- ✅ Cookie-based session management

### Data Models
- ✅ Complete TypeScript interfaces
- ✅ Validation rules and constraints
- ✅ Example values for all fields
- ✅ OpenAPI schema definitions

### Error Handling
- ✅ Standard HTTP status codes
- ✅ Consistent error response format
- ✅ Detailed error messages
- ✅ Field-level validation errors

### Security
- ✅ HTTPS-only redirect URIs
- ✅ Client secret security (shown once)
- ✅ Rate limiting specifications
- ✅ Admin-only access control

---

## 🔧 Integration Tools

### Postman
Import the provided collection in `sp-registry-api.md` to test all endpoints.

### Swagger UI
View interactive documentation:
```bash
npx swagger-ui-watcher docs/api/sp-registry-openapi.yaml
# Open http://localhost:8080
```

### Code Generation
Generate TypeScript client:
```bash
npx @openapitools/openapi-generator-cli generate \
  -i docs/api/sp-registry-openapi.yaml \
  -g typescript-axios \
  -o frontend/src/lib/sp-registry-client
```

Generate Python client:
```bash
npx @openapitools/openapi-generator-cli generate \
  -i docs/api/sp-registry-openapi.yaml \
  -g python \
  -o scripts/sp-registry-client
```

---

## 📖 Documentation Structure

### Markdown Documentation (`sp-registry-api.md`)
1. **Overview** - API introduction and features
2. **Authentication** - Session-based auth requirements
3. **API Endpoints** - 9 endpoints with full specs
4. **Data Models** - Complete TypeScript interfaces
5. **Error Handling** - Status codes and formats
6. **Rate Limiting** - Limits and headers
7. **Examples** - cURL commands and use cases
8. **Postman Collection** - Ready-to-import JSON

### OpenAPI Specification (`sp-registry-openapi.yaml`)
- **Info** - API metadata and contact
- **Servers** - Production and development URLs
- **Paths** - All 9 endpoints with operations
- **Components** - Reusable schemas and responses
- **Security** - Authentication schemes
- **Examples** - Sample requests/responses

---

## ✅ What's Included

### Request/Response Documentation
- ✅ **Query parameters** with types and validation
- ✅ **Request bodies** with complete schemas
- ✅ **Response formats** for success and error cases
- ✅ **Status codes** with descriptions
- ✅ **Example values** for all fields

### Data Validation
- ✅ **Required fields** clearly marked
- ✅ **Min/max lengths** for strings
- ✅ **Enum values** for restricted fields
- ✅ **Format validation** (email, URL, date-time)
- ✅ **Pattern validation** (regex for IDs, codes)

### Usage Examples
- ✅ **cURL commands** for all endpoints
- ✅ **Complete registration flow** example
- ✅ **Search and filter** examples
- ✅ **Credential management** examples
- ✅ **Error handling** examples

---

## 🎯 Next Steps

### For Developers
1. Review markdown documentation for overview
2. Import Postman collection for testing
3. Use OpenAPI spec for client generation
4. Integrate with frontend API client

### For Integrators
1. Review authentication requirements
2. Test endpoints with cURL examples
3. Implement error handling
4. Monitor rate limits

### For DevOps
1. Deploy Swagger UI for team access
2. Generate client SDKs for multiple languages
3. Set up API monitoring
4. Configure rate limiting

---

## 📞 Support

**Location**: `/docs/api/sp-registry-api.md`  
**OpenAPI Spec**: `/docs/api/sp-registry-openapi.yaml`  
**Version**: 1.0.0  
**Last Updated**: November 3, 2025

For questions or updates, contact the DIVE V3 development team.

