# IdP Management API Documentation

**Version**: 1.0.0  
**Last Updated**: October 23, 2025  
**Base URL**: `http://localhost:4000` (dev) | `https://api.dive-v3.mil` (prod)

## Table of Contents

- [Authentication](#authentication)
- [MFA Configuration](#mfa-configuration)
- [Session Management](#session-management)
- [Theme Management](#theme-management)
- [Custom Login](#custom-login)
- [Error Codes](#error-codes)

---

## Authentication

All IdP Management API endpoints require:
- **JWT Token** in `Authorization: Bearer <token>` header
- **super_admin Role** in JWT claims
- **Valid Session** (not expired, not revoked)

### Example Request
```http
GET /api/admin/idps/usa-realm-broker/mfa-config
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## MFA Configuration

### Get MFA Configuration

**Endpoint**: `GET /api/admin/idps/:alias/mfa-config`  
**Description**: Retrieve MFA settings for a realm

#### Parameters
- `alias` (path, required): IdP alias (e.g., `usa-realm-broker`)

#### Response
```json
{
  "success": true,
  "data": {
    "flowId": "abc-123",
    "flowAlias": "browser",
    "builtIn": true,
    "topLevel": true
  },
  "requestId": "req-1234567890"
}
```

---

### Update MFA Configuration

**Endpoint**: `PUT /api/admin/idps/:alias/mfa-config`  
**Description**: Update MFA settings for a realm

#### Request Body
```json
{
  "required": true,
  "otp": {
    "type": "totp",
    "algorithm": "HmacSHA256",
    "digits": 6,
    "period": 30
  },
  "conditionalMFA": {
    "enabled": true,
    "clearanceLevels": ["SECRET", "TOP_SECRET"]
  }
}
```

#### Response
```json
{
  "success": true,
  "message": "MFA configuration updated successfully",
  "requestId": "req-1234567890"
}
```

---

### Test MFA Flow

**Endpoint**: `POST /api/admin/idps/:alias/mfa-config/test`  
**Description**: Test MFA authentication flow

#### Response
```json
{
  "success": true,
  "data": {
    "success": true,
    "message": "MFA flow test successful",
    "requiredActions": ["CONFIGURE_TOTP", "UPDATE_PASSWORD"],
    "otpEnabled": true
  },
  "requestId": "req-1234567890"
}
```

---

## Session Management

### Get Active Sessions

**Endpoint**: `GET /api/admin/idps/:alias/sessions`  
**Description**: Retrieve active user sessions for a realm

#### Query Parameters
- `username` (optional): Filter by username
- `clientId` (optional): Filter by client ID
- `ipAddress` (optional): Filter by IP address

#### Response
```json
{
  "success": true,
  "data": [
    {
      "id": "session-abc-123",
      "username": "john.doe",
      "userId": "user-456",
      "ipAddress": "192.168.1.100",
      "start": 1729692000000,
      "lastAccess": 1729695600000,
      "clients": {
        "dive-v3-client": "DIVE V3 Frontend"
      }
    }
  ],
  "requestId": "req-1234567890"
}
```

---

### Revoke Session

**Endpoint**: `DELETE /api/admin/idps/:alias/sessions/:sessionId`  
**Description**: Revoke a specific session

#### Parameters
- `alias` (path, required): IdP alias
- `sessionId` (path, required): Session ID

#### Response
```json
{
  "success": true,
  "message": "Session revoked successfully",
  "requestId": "req-1234567890"
}
```

---

### Revoke User Sessions

**Endpoint**: `DELETE /api/admin/idps/:alias/users/:username/sessions`  
**Description**: Revoke all sessions for a user

#### Parameters
- `alias` (path, required): IdP alias
- `username` (path, required): Username

#### Response
```json
{
  "success": true,
  "message": "Revoked 3 session(s) for user john.doe",
  "data": {
    "count": 3
  },
  "requestId": "req-1234567890"
}
```

---

### Get Session Statistics

**Endpoint**: `GET /api/admin/idps/:alias/sessions/stats`  
**Description**: Get session statistics for a realm

#### Response
```json
{
  "success": true,
  "data": {
    "totalActive": 12,
    "peakConcurrent24h": 25,
    "averageDuration": 3600,
    "byClient": {
      "dive-v3-client": 10,
      "kas-client": 2
    },
    "byUser": {
      "john.doe": 2,
      "jane.smith": 1
    }
  },
  "requestId": "req-1234567890"
}
```

---

## Theme Management

### Get Theme

**Endpoint**: `GET /api/admin/idps/:alias/theme`  
**Description**: Retrieve custom login theme for an IdP

#### Response
```json
{
  "success": true,
  "data": {
    "idpAlias": "usa-realm-broker",
    "enabled": true,
    "colors": {
      "primary": "#B22234",
      "secondary": "#FFFFFF",
      "accent": "#3C3B6E",
      "background": "#F9FAFB",
      "text": "#111827"
    },
    "background": {
      "type": "gradient",
      "blur": 0,
      "overlayOpacity": 0.1,
      "gradientDirection": "top-bottom"
    },
    "logo": {
      "url": "/uploads/idp-themes/usa-realm-broker/logo.png",
      "position": "top-center"
    },
    "layout": {
      "formPosition": "center",
      "formWidth": "400px",
      "cardStyle": "glassmorphism",
      "buttonStyle": "rounded",
      "inputStyle": "outlined"
    },
    "typography": {
      "fontFamily": "Inter, system-ui, sans-serif",
      "fontSize": "medium"
    },
    "localization": {
      "defaultLanguage": "en",
      "enableToggle": true,
      "supportedLanguages": ["en", "fr"]
    },
    "createdAt": "2025-10-23T10:00:00.000Z",
    "updatedAt": "2025-10-23T14:30:00.000Z",
    "createdBy": "admin@dive-v3.mil"
  },
  "requestId": "req-1234567890"
}
```

---

### Update Theme

**Endpoint**: `PUT /api/admin/idps/:alias/theme`  
**Description**: Update custom login theme

#### Request Body
```json
{
  "enabled": true,
  "colors": {
    "primary": "#B22234",
    "secondary": "#FFFFFF",
    "accent": "#3C3B6E",
    "background": "#F9FAFB",
    "text": "#111827"
  },
  "background": {
    "type": "gradient",
    "blur": 0,
    "overlayOpacity": 0.1
  },
  "layout": {
    "formPosition": "center",
    "cardStyle": "glassmorphism"
  }
}
```

#### Response
```json
{
  "success": true,
  "data": { /* Updated theme object */ },
  "message": "Theme updated successfully",
  "requestId": "req-1234567890"
}
```

---

### Upload Theme Asset

**Endpoint**: `POST /api/admin/idps/:alias/theme/upload`  
**Description**: Upload background image or logo

#### Request (multipart/form-data)
- `file` (file, required): Image file (JPG, PNG, WebP, max 5MB)
- `type` (string, required): "background" or "logo"

#### Response
```json
{
  "success": true,
  "data": {
    "url": "/uploads/idp-themes/usa-realm-broker/background.jpg"
  },
  "message": "Asset uploaded successfully",
  "requestId": "req-1234567890"
}
```

---

### Delete Theme

**Endpoint**: `DELETE /api/admin/idps/:alias/theme`  
**Description**: Delete custom theme (revert to default)

#### Response
```json
{
  "success": true,
  "message": "Theme deleted successfully (reverted to default)",
  "requestId": "req-1234567890"
}
```

---

### Preview Theme

**Endpoint**: `GET /api/admin/idps/:alias/theme/preview`  
**Description**: Get HTML preview of theme

#### Query Parameters
- `device` (optional): "desktop" | "tablet" | "mobile"

#### Response
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <title>Login - usa-realm-broker</title>
  <style>/* Theme styles */</style>
</head>
<body>
  <!-- Themed login page HTML -->
</body>
</html>
```

---

## Custom Login

### Authenticate User

**Endpoint**: `POST /api/auth/custom-login`  
**Description**: Authenticate user via custom login page  
**Auth Required**: No (public endpoint)  
**Rate Limit**: 5 attempts per 15 minutes per IP/username

#### Request Body
```json
{
  "idpAlias": "usa-realm-broker",
  "username": "john.doe",
  "password": "SecurePassword123!",
  "otp": "123456"
}
```

#### Successful Response
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 900
  },
  "message": "Login successful"
}
```

#### MFA Required Response
```json
{
  "success": false,
  "mfaRequired": true,
  "message": "Multi-factor authentication required"
}
```

#### Error Response
```json
{
  "success": false,
  "error": "Invalid username or password"
}
```

---

### Submit MFA Code

**Endpoint**: `POST /api/auth/custom-login/mfa`  
**Description**: Verify MFA code after initial authentication

#### Request Body
```json
{
  "mfaToken": "temp-token-abc-123",
  "otp": "123456"
}
```

#### Response
```json
{
  "success": true,
  "message": "MFA verification successful",
  "data": {
    "accessToken": "...",
    "refreshToken": "...",
    "expiresIn": 900
  }
}
```

---

## Error Codes

| Code | Error | Description |
|------|-------|-------------|
| 400 | Bad Request | Missing or invalid parameters |
| 401 | Unauthorized | Invalid credentials or expired token |
| 403 | Forbidden | Insufficient permissions (not super_admin) |
| 404 | Not Found | IdP or resource not found |
| 429 | Too Many Requests | Rate limit exceeded (5 attempts/15min) |
| 500 | Internal Server Error | Server error, check logs |

---

## Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| Custom Login | 5 attempts | 15 minutes |
| All Admin APIs | 100 requests | 1 minute |
| Theme Upload | 10 uploads | 1 hour |

---

## Common Error Responses

### Invalid Token
```json
{
  "success": false,
  "error": "Unauthorized",
  "message": "Invalid or expired access token"
}
```

### Insufficient Permissions
```json
{
  "success": false,
  "error": "Forbidden",
  "message": "super_admin role required"
}
```

### Rate Limited
```json
{
  "success": false,
  "error": "Too many login attempts. Please try again in 15 minutes."
}
```

---

## SDK Examples

### JavaScript/TypeScript

```typescript
// Using the IdP Management API client
import { IdPManagementAPI } from '@/lib/api/idp-management';

// Get MFA config
const mfaConfig = await IdPManagementAPI.getMFAConfig('usa-realm-broker', token);

// Update MFA config
await IdPManagementAPI.updateMFAConfig('usa-realm-broker', {
  required: true,
  otp: {
    type: 'totp',
    algorithm: 'HmacSHA256',
    digits: 6,
    period: 30
  }
}, token);

// Get active sessions
const sessions = await IdPManagementAPI.getSessions('usa-realm-broker', token, {
  username: 'john.doe'
});

// Revoke session
await IdPManagementAPI.revokeSession('usa-realm-broker', 'session-123', token);

// Get theme
const theme = await IdPManagementAPI.getTheme('usa-realm-broker', token);

// Update theme
await IdPManagementAPI.updateTheme('usa-realm-broker', {
  colors: {
    primary: '#B22234'
  }
}, token);
```

### React Hooks

```typescript
import {
  useMFAConfig,
  useUpdateMFAConfig,
  useSessions,
  useRevokeSession,
  useTheme,
  useUpdateTheme
} from '@/lib/api/idp-management';

function IdPManagementComponent() {
  // Get MFA config (with React Query caching)
  const { data: mfaConfig } = useMFAConfig('usa-realm-broker');

  // Update MFA config (with optimistic updates)
  const updateMFA = useUpdateMFAConfig();
  
  const handleSave = () => {
    updateMFA.mutate({
      alias: 'usa-realm-broker',
      config: { required: true, otp: { ... } }
    });
  };

  // Get sessions (auto-refresh every 10s)
  const { data: sessions } = useSessions('usa-realm-broker');

  // Revoke session
  const revokeSession = useRevokeSession();
  
  const handleRevoke = (sessionId: string) => {
    revokeSession.mutate({
      alias: 'usa-realm-broker',
      sessionId
    });
  };

  // Get theme
  const { data: theme } = useTheme('usa-realm-broker');

  // Update theme
  const updateTheme = useUpdateTheme();
  
  const handleUpdateTheme = (themeData: any) => {
    updateTheme.mutate({
      alias: 'usa-realm-broker',
      theme: themeData
    });
  };

  return <div>...</div>;
}
```

---

## Best Practices

1. **Always use React Query hooks** for caching and optimistic updates
2. **Handle rate limits** gracefully with exponential backoff
3. **Validate inputs** on both client and server
4. **Log all admin actions** for audit trail
5. **Use CSRF tokens** for all mutations
6. **Implement loading states** for better UX
7. **Handle errors** with user-friendly messages
8. **Cache theme data** (stale time: 10 minutes)
9. **Auto-refresh sessions** (every 10 seconds)
10. **Debounce search** (300ms delay)

---

## Security Considerations

### MFA Configuration
- ⚠️ Changing MFA settings affects all users in the realm
- ⚠️ Test MFA flow before deploying to production
- ✅ Use HmacSHA256 algorithm (recommended)
- ✅ 6-digit codes are standard and user-friendly
- ✅ 30-second period balances security and usability

### Session Management
- ⚠️ Revoking sessions logs users out immediately
- ⚠️ Bulk revocation can disrupt user experience
- ✅ Log all session revocations for audit
- ✅ Filter by IP to detect suspicious activity
- ✅ Monitor session duration for anomalies

### Theme Management
- ⚠️ Validate image uploads (max 5MB, allowed types)
- ⚠️ Sanitize file names to prevent path traversal
- ✅ Compress images before storage
- ✅ Use CDN for theme assets in production
- ✅ Revert to default if theme is broken

### Custom Login
- ⚠️ Only enable for mocked/internal IdPs
- ⚠️ Disable Direct Access Grants for external IdPs
- ✅ Implement strict rate limiting (5 attempts/15min)
- ✅ Use CSRF protection on all login forms
- ✅ Lock accounts after 5 failed attempts
- ✅ Log all login attempts for security monitoring

---

## Changelog

### 2025-10-23: v1.0.0 - Initial Release
- ✅ MFA Configuration API
- ✅ Session Management API
- ✅ Theme Management API
- ✅ Custom Login API
- ✅ Rate limiting
- ✅ CSRF protection
- ✅ Comprehensive error handling

---

## Support

For API issues or feature requests:
- **Email**: api-support@dive-v3.mil
- **Slack**: #dive-v3-api-support
- **Docs**: https://docs.dive-v3.mil/api

