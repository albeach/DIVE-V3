# Admin API Route Migration Guide

## Overview

This guide explains how to migrate existing admin API routes to use the new standardized middleware pattern introduced in January 2026.

## What Changed

### Before (Old Pattern)
```typescript
import { auth } from '@/auth';

export async function GET(request: NextRequest) {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const isAdmin = session.user.roles?.includes('admin');
    if (!isAdmin) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const response = await fetch(`${BACKEND_URL}/endpoint`, {
        headers: {
            'Authorization': `Bearer ${(session as any).accessToken}`,
        },
    });

    return NextResponse.json(await response.json());
}
```

### After (New Pattern)
```typescript
import { withAuth, createAdminBackendFetch } from '@/middleware/admin-auth';

export const GET = withAuth(async (request, { tokens }) => {
    const backendFetch = createAdminBackendFetch(tokens);
    const response = await backendFetch(`/api/admin/endpoint`);

    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Backend error' }));
        return NextResponse.json(
            { success: false, error: 'BackendError', message: error.message },
            { status: response.status }
        );
    }

    return NextResponse.json(await response.json());
});
```

## Benefits

1. **Automatic Token Refresh**: The middleware handles token expiration automatically
2. **Consistent Auth**: All routes use the same authentication logic
3. **Standardized Errors**: Error responses follow `IAdminAPIResponse` format
4. **Audit Logging**: All admin actions are logged automatically
5. **Type Safety**: Full TypeScript support with `AdminAuthContext`
6. **Less Boilerplate**: ~50% less code per route

## Migration Steps

### Step 1: Import the Middleware

```typescript
// Remove this
import { auth } from '@/auth';
import { getBackendUrl } from '@/lib/api-utils';

// Add this
import { withAuth, withSuperAdmin, createAdminBackendFetch } from '@/middleware/admin-auth';
import { getBackendUrl } from '@/lib/api-utils';
```

### Step 2: Convert Function Exports to Const Exports

```typescript
// Before
export async function GET(request: NextRequest) { ... }

// After
export const GET = withAuth(async (request, { tokens, session, userId }) => { ... });
```

### Step 3: Remove Manual Auth Checks

```typescript
// Remove all of this
const session = await auth();
if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

const isAdmin = session.user.roles?.includes('super_admin') ||
               session.user.roles?.includes('admin') ||
               session.user.roles?.includes('dive-admin');

if (!isAdmin) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
}
```

### Step 4: Use createAdminBackendFetch

```typescript
// Before
const response = await fetch(`${BACKEND_URL}/api/admin/endpoint`, {
    headers: {
        'Authorization': `Bearer ${(session as any).accessToken}`,
        'Content-Type': 'application/json',
    },
});

// After
const backendFetch = createAdminBackendFetch(tokens, BACKEND_URL);
const response = await backendFetch(`/api/admin/endpoint`);
```

### Step 5: Standardize Error Responses

```typescript
// Before (inconsistent formats)
return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
return NextResponse.json({ success: false, message: 'Error' }, { status: 500 });

// After (consistent format)
return NextResponse.json(
    {
        success: false,
        error: 'BackendError',
        message: error.message || 'Failed to complete operation',
    },
    { status: response.status }
);
```

### Step 6: Remove Mock Data Fallbacks

```typescript
// Remove all mock data fallback logic
if (!response.ok) {
    console.warn('[Route] Backend error, returning mock data');
    return NextResponse.json({ success: true, data: generateMockData() });
}

function generateMockData() { ... }

// Replace with proper error handling
if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Backend error' }));
    return NextResponse.json(
        { success: false, error: 'BackendError', message: error.message },
        { status: response.status }
    );
}
```

### Step 7: Add Export Config

```typescript
// Add this at the top of the file (after imports)
export const dynamic = 'force-dynamic';
```

## Middleware Variants

### withAuth (Standard Admin Access)
```typescript
export const GET = withAuth(async (request, { tokens, session, userId }) => {
    // Any admin role can access
});
```

### withSuperAdmin (Super Admin Only)
```typescript
export const POST = withSuperAdmin(async (request, { tokens, session }) => {
    // Only super_admin can access
});
```

### withAdminAuthSkipTokens (No Backend Call)
```typescript
export const GET = withAdminAuthSkipTokens(async (request, { session }) => {
    // For routes that don't call the backend
    // tokens are not retrieved (faster)
});
```

### Custom Role Check
```typescript
export const POST = withAdminAuth(
    async (request, { tokens }) => { ... },
    {
        customRoleCheck: (session) => {
            return session.user.roles?.includes('policy_admin');
        },
        enableAuditLog: true
    }
);
```

## Complete Example

### Before: `frontend/src/app/api/admin/users/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getBackendUrl } from '@/lib/api-utils';

const BACKEND_URL = getBackendUrl();

export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const isAdmin = session.user.roles?.includes('super_admin') ||
                       session.user.roles?.includes('admin') ||
                       session.user.roles?.includes('dive-admin');

        if (!isAdmin) {
            return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const queryString = searchParams.toString();

        const response = await fetch(`${BACKEND_URL}/api/admin/users?${queryString}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${(session as any).accessToken}`,
            },
        });

        if (!response.ok) {
            console.warn('[Users API] Backend error, returning mock data');
            return NextResponse.json({
                success: true,
                data: { users: generateMockUsers(), total: 7 }
            });
        }

        const data = await response.json();
        return NextResponse.json(data);

    } catch (error) {
        console.error('[Users API] Error:', error);
        return NextResponse.json({
            success: true,
            data: { users: generateMockUsers(), total: 7 }
        });
    }
}

export async function POST(request: NextRequest) {
    // Similar pattern...
}

function generateMockUsers() { ... }
```

### After: Migrated Version

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { withAuth, withSuperAdmin, createAdminBackendFetch } from '@/middleware/admin-auth';
import { getBackendUrl } from '@/lib/api-utils';

const BACKEND_URL = getBackendUrl();

export const dynamic = 'force-dynamic';

export const GET = withAuth(async (request, { tokens }) => {
    const { searchParams } = new URL(request.url);
    const queryString = searchParams.toString();

    const backendFetch = createAdminBackendFetch(tokens, BACKEND_URL);
    const response = await backendFetch(`/api/admin/users?${queryString}`);

    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Backend error' }));
        return NextResponse.json(
            {
                success: false,
                error: 'BackendError',
                message: error.message || `Backend returned ${response.status}`,
            },
            { status: response.status }
        );
    }

    const data = await response.json();
    return NextResponse.json(data);
});

export const POST = withSuperAdmin(async (request, { tokens }) => {
    const body = await request.json();

    const backendFetch = createAdminBackendFetch(tokens, BACKEND_URL);
    const response = await backendFetch(`/api/admin/users`, {
        method: 'POST',
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to create user' }));
        return NextResponse.json(
            {
                success: false,
                error: 'BackendError',
                message: error.message || 'Failed to create user',
            },
            { status: response.status }
        );
    }

    const data = await response.json();
    return NextResponse.json(data);
});
```

## Code Reduction

- **Before**: ~110 lines (with auth checks, mock data, try/catch)
- **After**: ~45 lines (60% reduction)
- **Removed**: 65 lines of boilerplate

## Testing After Migration

1. **Authentication**: Test that only admins can access
2. **Authorization**: Test super_admin requirements work
3. **Token Refresh**: Test with expired tokens (auto-refresh should work)
4. **Error Handling**: Test backend errors return proper format
5. **Audit Logs**: Check logs for admin actions

## Migration Checklist

For each route file in `frontend/src/app/api/admin/`:

- [ ] Import `withAuth` or `withSuperAdmin` from middleware
- [ ] Convert `async function` exports to `const` exports with wrapper
- [ ] Remove manual `auth()` calls and role checks
- [ ] Use `createAdminBackendFetch` for backend calls
- [ ] Remove mock data fallback logic
- [ ] Standardize error response format
- [ ] Add `export const dynamic = 'force-dynamic'`
- [ ] Test the migrated route
- [ ] Remove unused imports (`auth`, mock data functions)

## Rollout Strategy

### Phase 1: Core Routes (Week 1)
- [x] `/api/admin/users` (already migrated as example)
- [ ] `/api/admin/idps`
- [ ] `/api/admin/approvals`
- [ ] `/api/admin/certificates`

### Phase 2: Analytics & Monitoring (Week 2)
- [ ] `/api/admin/analytics/*`
- [ ] `/api/admin/logs/*`
- [ ] `/api/admin/metrics/*`

### Phase 3: Advanced Features (Week 3)
- [ ] `/api/admin/opa/*`
- [ ] `/api/admin/policies/*`
- [ ] `/api/admin/compliance/*`
- [ ] `/api/admin/clearance/*`

### Phase 4: Federation & Infrastructure (Week 4)
- [ ] `/api/admin/federation/*`
- [ ] `/api/admin/sp-registry/*`
- [ ] `/api/admin/tenants/*`
- [ ] `/api/admin/sessions/*`

## Common Issues & Solutions

### Issue: "tokens is undefined"
**Solution**: Make sure you're using `withAuth` or `withSuperAdmin`, not `withAdminAuthSkipTokens`

### Issue: "Cannot read property 'accessToken' of undefined"
**Solution**: Token refresh may have failed. Check Keycloak connectivity and refresh token validity

### Issue: "Backend returned 401"
**Solution**: The middleware already refreshed the token. This means the refresh token itself expired. User needs to re-login.

### Issue: "Role check failing"
**Solution**: Use `withSuperAdmin` if the backend endpoint requires super_admin role

## Need Help?

- Check the example migration: `frontend/src/app/api/admin/users/route.ts`
- Review the middleware code: `frontend/src/middleware/admin-auth.ts`
- Test your changes with: `npm run dev` and check `/admin/users` page

## Status

- **Created**: 2026-02-05
- **Status**: Active Migration
- **Routes Migrated**: 1/68 (1.5%)
- **Target Completion**: 2026-02-12
