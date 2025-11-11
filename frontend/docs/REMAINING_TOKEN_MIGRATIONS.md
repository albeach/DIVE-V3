# Complete Token Access Migration Guide

## Status: PARTIALLY COMPLETE ⚠️

We've successfully removed client-side token access from core session management, but **58 files** still access `session.accessToken` directly.

## ✅ Already Fixed

1. `frontend/src/components/auth/token-expiry-checker.tsx` - Uses server heartbeat
2. `frontend/src/hooks/use-session-heartbeat.ts` - Server-side validation
3. `frontend/src/components/auth/secure-logout-button.tsx` - Fetches tokens from server
4. `frontend/src/app/resources/page.tsx` - Uses `/api/resources`
5. `frontend/src/app/resources/[id]/page.tsx` - Uses `/api/resources/[id]`
6. `frontend/src/app/resources/[id]/ztdf/page.tsx` - Uses `/api/resources/[id]/ztdf`
7. `frontend/src/app/admin/approvals/page.tsx` - Removed token dependency

## ❌ Still Need Fixing (58 occurrences)

### High Priority (User-Facing)

1. **KAS Request Modal** (`components/ztdf/KASRequestModal.tsx`)
   - Needs: `/api/kas/request-key` server route
   
2. **Upload Page** (`app/upload/page.tsx`)
   - Needs: `/api/upload` server route

3. **Resource Detail Page** (`app/resources/[id]/page.tsx`)
   - Line 485: Still has one more occurrence in KAS decrypt handler

### Medium Priority (Admin Features)

4. **Admin Pages** (Multiple files):
   - `app/admin/certificates/page.tsx`
   - `app/admin/debug/page.tsx`
   - `app/admin/idp/page.tsx`
   - `app/admin/idp/new/page.tsx`
   - `app/admin/analytics/page.tsx`

5. **Admin Dashboard Components** (Multiple):
   - `components/admin/dashboard/resource-analytics.tsx`
   - `components/admin/dashboard/realtime-activity.tsx`
   - `components/admin/dashboard/threat-intelligence.tsx`
   - `components/admin/dashboard/security-posture.tsx`
   - `components/admin/dashboard/authorization-analytics.tsx`
   - `components/admin/dashboard/system-overview-section.tsx`
   - `components/admin/dashboard/performance-metrics.tsx`
   - `components/admin/dashboard/compliance-overview.tsx`

6. **IdP Management Library** (`lib/api/idp-management.ts`)
   - 11 functions need updating

### Already Server-Side (Safe)

These are API routes (already server-side, okay to keep):
- ✅ `app/api/policies-lab/upload/route.ts`
- ✅ `app/api/policies-lab/list/route.ts`
- ✅ `app/api/admin/sp-registry/**/*.ts` (5 files)

## Migration Pattern

### For Client Components

**OLD (Insecure):**
```typescript
const accessToken = (session as any)?.accessToken;
if (!accessToken) {
    setError('No access token available');
    return;
}
const response = await fetch(backendUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
});
```

**NEW (Secure):**
```typescript
// Client just calls API route
const response = await fetch('/api/my-endpoint');
if (!response.ok) {
    const error = await response.json();
    setError(error.message);
    return;
}
```

### For Server API Routes

Create corresponding server route:

```typescript
// frontend/src/app/api/my-endpoint/route.ts
import { validateSession, getSessionTokens } from '@/lib/session-validation';

export async function GET() {
    // Validate session
    const validation = await validateSession();
    if (!validation.isValid) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get tokens server-side only
    const tokens = await getSessionTokens();

    // Call backend
    const backendUrl = process.env.BACKEND_URL || 'https://localhost:4000';
    const response = await fetch(`${backendUrl}/api/...`, {
        headers: { 'Authorization': `Bearer ${tokens.accessToken}` }
    });

    // Return data (not tokens!)
    return NextResponse.json(await response.json());
}
```

## Quick Win: Batch Migration

For components that just need to call the backend API, we can create generic proxy routes:

### 1. Admin Analytics Proxy
```typescript
// frontend/src/app/api/admin/analytics/route.ts
export async function GET() {
    const tokens = await getSessionTokens();
    const response = await fetch(`${backendUrl}/api/admin/analytics`, {
        headers: { 'Authorization': `Bearer ${tokens.accessToken}` }
    });
    return NextResponse.json(await response.json());
}
```

### 2. Certificate Management Proxy
```typescript
// frontend/src/app/api/admin/certificates/route.ts
// GET, POST, DELETE handlers
```

### 3. IdP Management Proxy
```typescript
// frontend/src/app/api/admin/idps/route.ts
// Proxy all IdP operations
```

## Implementation Priority

1. **Phase 1 (DONE):** Core session management ✅
2. **Phase 2 (NOW):** User-facing features
   - KAS request modal
   - Upload page
   - Resource detail page fixes
3. **Phase 3:** Admin dashboard components
4. **Phase 4:** IdP management library refactor

## Testing Checklist

After each migration:
- [ ] Page loads without "No access token" error
- [ ] Operations complete successfully
- [ ] No tokens in browser DevTools Network tab
- [ ] Session validation works correctly
- [ ] Error handling works (401, 403, 500)

## Files to Create

### Immediate (Phase 2)

1. `frontend/src/app/api/kas/request-key/route.ts`
2. `frontend/src/app/api/upload/route.ts`
3. Fix remaining token access in resource detail page

### Later (Phase 3)

4. `frontend/src/app/api/admin/analytics/route.ts`
5. `frontend/src/app/api/admin/certificates/route.ts`
6. `frontend/src/app/api/admin/dashboard/[metric]/route.ts`

### Eventually (Phase 4)

7. Refactor `frontend/src/lib/api/idp-management.ts` to use server routes

## Status Dashboard

| Category | Total | Fixed | Remaining | % Complete |
|----------|-------|-------|-----------|------------|
| Core Session | 4 | 4 | 0 | 100% ✅ |
| User Pages | 4 | 3 | 1 | 75% 🟡 |
| Admin Pages | 5 | 0 | 5 | 0% 🔴 |
| Dashboard Components | 8 | 0 | 8 | 0% 🔴 |
| API Library | 11 | 0 | 11 | 0% 🔴 |
| Server Routes | 10 | 10 | 0 | 100% ✅ |
| **TOTAL** | **42** | **17** | **25** | **40%** |

## Next Steps

1. **Immediate:** Fix the one remaining token access in resource detail page (line 485)
2. **Today:** Implement KAS request and upload proxies (Phase 2)
3. **This Week:** Migrate admin components (Phase 3)
4. **Future:** Refactor IdP management library (Phase 4)

## Notes

- Server-side API routes (`app/api/*/route.ts`) are SAFE - they already run server-side
- Only client components (`'use client'`) need migration
- The pattern is consistent: Create server route → Update client call
- All tokens must stay server-side per 2025 security best practices

## References

- `frontend/docs/SESSION_MANAGEMENT.md` - Full documentation
- `frontend/docs/MIGRATION_SESSION_FIXES.md` - Initial fixes
- `frontend/src/lib/session-validation.ts` - Utility functions

