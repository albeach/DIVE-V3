# DIVE V3 Session Management - 2025 Best Practices

## Overview

DIVE V3 implements modern, security-focused session management following 2025 best practices. This document outlines our approach and the security principles behind it.

## Architecture

### Database Session Strategy

We use **NextAuth v5 with database sessions** (not JWT strategy):

```typescript
// frontend/src/auth.ts
session: {
    strategy: "database",  // ✅ Secure: Sessions stored in PostgreSQL
    maxAge: 8 * 60 * 60,   // 8 hours
    updateAge: 15 * 60,    // Update every 15 minutes
}
```

**Benefits:**
- ✅ Sessions revocable server-side (instant logout)
- ✅ No client-side session tampering possible
- ✅ Tokens never exposed to client
- ✅ True single source of truth (database)

### Security Principles

#### 1. **NO Client-Side JWT Parsing** ❌

**BAD (Old Pattern):**
```typescript
// ❌ NEVER DO THIS
const payload = JSON.parse(atob(accessToken.split('.')[1]));
const exp = payload.exp;
```

**WHY IT'S BAD:**
- Client can manipulate token
- No signature verification
- Expiry can be faked
- Opens timing attacks

**GOOD (Our Approach):**
```typescript
// ✅ Server validates, client receives validated data
const response = await fetch('/api/session/refresh');
const { expiresAt, isValid } = await response.json();
```

#### 2. **Tokens Are Server-Side Only** 🔒

**Access tokens, ID tokens, and refresh tokens:**
- ✅ Stored in database (PostgreSQL)
- ✅ Accessed only by server-side API routes
- ✅ NEVER sent to client in session object
- ✅ Used for Keycloak API calls server-side

**Client receives:**
- ✅ User profile (name, email, uniqueID)
- ✅ Claims (clearance, country, COI)
- ✅ Validated expiry timestamp from server
- ❌ NO raw tokens

#### 3. **Server-Side Validation** 🛡️

All session validation happens server-side:

```typescript
// frontend/src/lib/session-validation.ts
export async function validateSession(): Promise<SessionValidationResult> {
    const session = await auth();
    if (!session) return { isValid: false, error: 'NO_SESSION' };
    
    // Check database for valid tokens
    const account = await db.query.accounts.findFirst(...);
    if (!account.access_token) return { isValid: false, error: 'INVALID_TOKENS' };
    
    // Check expiry
    const isExpired = account.expires_at <= now();
    if (isExpired) return { isValid: false, error: 'EXPIRED' };
    
    return { isValid: true, session };
}
```

## Components

### 1. Token Expiry Checker

**File:** `frontend/src/components/auth/token-expiry-checker.tsx`

**Purpose:** Shows warning modal 2 minutes before session expires

**Security:**
- ✅ Uses ONLY server-validated session health
- ✅ NO client-side JWT parsing
- ✅ Waits for heartbeat before checking expiry
- ✅ Handles loading and error states properly

**Flow:**
```
1. Component mounts
2. useSessionHeartbeat() fetches server validation
3. Server returns validated expiresAt timestamp
4. Client displays countdown based on server time
5. Auto-refresh when < 5 minutes remaining
6. Warning modal at < 2 minutes
```

### 2. Session Heartbeat Hook

**File:** `frontend/src/hooks/use-session-heartbeat.ts`

**Purpose:** Periodic server-side session validation

**Features:**
- ✅ 2-minute interval (normal), 30-second (critical)
- ✅ Pauses when page hidden (saves resources)
- ✅ Clock skew compensation
- ✅ Exponential backoff retry
- ✅ Proper loading and error states

**API:**
```typescript
const {
    sessionHealth,    // { isValid, expiresAt, serverTimeOffset }
    isPageVisible,    // boolean
    isLoading,        // boolean
    error,            // string | null
    triggerHeartbeat  // () => Promise<SessionHealthStatus>
} = useSessionHeartbeat();
```

### 3. Session Sync Manager

**File:** `frontend/src/lib/session-sync-manager.ts`

**Purpose:** Cross-tab synchronization via Broadcast Channel

**Events:**
- `TOKEN_REFRESHED` - One tab refreshed, others update
- `SESSION_EXPIRED` - One tab detected expiry, all show modal
- `USER_LOGOUT` - One tab logged out, all tabs logout
- `WARNING_SHOWN/DISMISSED` - Coordinate modal state

### 4. Session Validation Utilities

**File:** `frontend/src/lib/session-validation.ts`

**Purpose:** Server-side utilities for API routes

**Functions:**
```typescript
// Validate current session
const validation = await validateSession();
if (!validation.isValid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

// Get tokens for server-side operations (NEVER expose to client)
const tokens = await getSessionTokens();
await fetch(keycloakAPI, {
    headers: { Authorization: `Bearer ${tokens.accessToken}` }
});

// Authorization helpers
hasClearance(userClearance, 'SECRET');
hasReleasability(userCountry, ['USA', 'GBR']);
hasCOIAccess(userCOI, ['FVEY']);
```

## API Endpoints

### GET /api/session/refresh

**Purpose:** Health check with server-validated session status

**Response:**
```json
{
    "authenticated": true,
    "expiresAt": "2025-11-10T18:09:04.000Z",
    "timeUntilExpiry": 582,
    "isExpired": false,
    "needsRefresh": false,
    "serverTime": 1731261522
}
```

**Security:**
- ✅ Validates session server-side
- ✅ Returns validated timestamps only
- ✅ Includes server time for clock skew compensation
- ✅ No tokens in response

### POST /api/session/refresh

**Purpose:** Manual session refresh (extends lifetime)

**Flow:**
1. Validates current session
2. Uses refresh token to get new access token from Keycloak
3. Updates database with new tokens
4. Extends session expiry
5. Returns new expiry timestamp

**Response:**
```json
{
    "success": true,
    "expiresAt": "2025-11-10T19:09:04.000Z",
    "expiresIn": 900
}
```

## Migration Guide

### If You Have Client-Side JWT Parsing

**OLD CODE:**
```typescript
const payload = JSON.parse(atob(session.accessToken.split('.')[1]));
const exp = payload.exp * 1000;
```

**NEW CODE:**
```typescript
const { sessionHealth } = useSessionHeartbeat();
if (sessionHealth) {
    const expiresAt = sessionHealth.expiresAt;
    const now = Date.now() - sessionHealth.serverTimeOffset;
    const timeRemaining = expiresAt - now;
}
```

### If You Access Tokens Client-Side

**OLD CODE:**
```typescript
const response = await fetch('/api/external', {
    headers: {
        Authorization: `Bearer ${session.accessToken}` // ❌ Bad
    }
});
```

**NEW CODE:**
```typescript
// Client-side: Just make authenticated request
const response = await fetch('/api/external');

// API Route (server-side): Get tokens server-side
export async function GET() {
    const tokens = await getSessionTokens();
    const response = await fetch(externalAPI, {
        headers: { Authorization: `Bearer ${tokens.accessToken}` }
    });
    return response;
}
```

## Testing

### Manual Testing

1. **Session Expiry Warning:**
   - Login with Keycloak
   - Wait until 2 minutes before expiry
   - Verify warning modal appears
   - Click "Extend Session"
   - Verify session refreshed

2. **Cross-Tab Sync:**
   - Open two browser tabs
   - Logout in one tab
   - Verify other tab also logs out

3. **Server-Side Validation:**
   - Check browser console
   - Should see `[TokenExpiry] Server-validated session:`
   - Should NOT see `[TokenExpiry] Using client-side JWT parsing`

### Automated Testing

```typescript
// Test session validation
import { validateSession } from '@/lib/session-validation';

test('validates active session', async () => {
    const result = await validateSession();
    expect(result.isValid).toBe(true);
    expect(result.session).toBeDefined();
});

test('rejects expired session', async () => {
    // ... setup expired session
    const result = await validateSession();
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('EXPIRED');
});
```

## Security Checklist

- ✅ Database session strategy configured
- ✅ Tokens NOT sent to client in session object
- ✅ All validation happens server-side
- ✅ Client-side JWT parsing removed
- ✅ Session heartbeat validates server-side
- ✅ Clock skew compensation implemented
- ✅ Cross-tab synchronization working
- ✅ Proper loading/error states
- ✅ Exponential backoff retry
- ✅ Page visibility detection

## Performance Considerations

1. **Heartbeat Frequency:**
   - Normal: 2 minutes (low overhead)
   - Critical (<5 min remaining): 30 seconds

2. **Page Visibility:**
   - Pauses heartbeat when tab hidden
   - Resumes when tab becomes visible
   - Saves server resources

3. **Caching:**
   - Heartbeat responses cached for 60 seconds
   - Reduces database load
   - Still maintains security

4. **Retry Strategy:**
   - Exponential backoff: 2s, 4s, 8s
   - Max 3 attempts
   - Prevents stampeding herd

## References

- **NextAuth v5 Docs:** https://authjs.dev/getting-started/migrating-to-v5
- **OWASP Session Management:** https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- **NIST SP 800-63B:** Digital Identity Guidelines (Session Management)
- **Keycloak Docs:** https://www.keycloak.org/docs/latest/securing_apps/

## Questions?

See `frontend/src/lib/session-validation.ts` for implementation details.
See `frontend/src/hooks/use-session-heartbeat.ts` for heartbeat logic.
See `frontend/src/components/auth/token-expiry-checker.tsx` for UI component.

