# UX Improvements - Session Management

**Date**: November 10, 2025  
**Issue**: Excessive console logging and frequent resource re-fetching causing UI noise  
**Components**: Resources Page, Token Expiry Checker, Session Heartbeat Hook

## Problems

1. **Console Noise**: Debug logs appearing every 30 seconds:
   - `[Resources] Session data:` with full session object
   - `[Resources] Fetching with access token (length): 1846`
   - `[TokenExpiry] Using server-validated session health:`
   - `[Heartbeat] Interval tick`
   - `[Heartbeat] Starting interval (page visible)`

2. **Resource Re-fetching**: Resources page was re-fetching data every time the session changed (every 30 seconds), causing unnecessary network traffic and potential UI flicker

3. **Aggressive Heartbeat**: Session heartbeat was checking every 30 seconds, which is excessive for normal operation

## Solutions

### 1. Resources Page (`frontend/src/app/resources/page.tsx`)

**Before:**
```typescript
useEffect(() => {
  // ... fetch logic with debug logs
}, [session, status, router]); // Re-fetches on every session change
```

**After:**
```typescript
useEffect(() => {
  // Removed debug console.log statements
  // ... fetch logic (cleaner)
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [status]); // Only fetch once on mount, not on every session change
```

**Benefits:**
- ✅ Resources only fetch **once** when page loads
- ✅ No more debug logs in production
- ✅ Reduced network traffic
- ✅ No UI flicker from re-fetching

---

### 2. Token Expiry Checker (`frontend/src/components/auth/token-expiry-checker.tsx`)

**Before:**
```typescript
console.log('[TokenExpiry] Using server-validated session health:', {
  expiresAt: new Date(expiresAt).toISOString(),
  secondsRemaining,
  clockSkew: Math.floor(sessionHealth.serverTimeOffset / 1000) + 's',
});
```

**After:**
```typescript
// Removed verbose logging - only errors are logged
```

**Benefits:**
- ✅ Clean console output
- ✅ Still logs errors/warnings when issues occur

---

### 3. Session Heartbeat (`frontend/src/hooks/use-session-heartbeat.ts`)

**Before:**
```typescript
const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const HEARTBEAT_INTERVAL_CRITICAL = 10000; // 10 seconds

console.log('[Heartbeat] Interval tick');
console.log('[Heartbeat] Health check:', { ... });
console.log('[Heartbeat] Starting interval (page visible)');
```

**After:**
```typescript
const HEARTBEAT_INTERVAL = 120000; // 2 minutes (normal)
const HEARTBEAT_INTERVAL_CRITICAL = 30000; // 30 seconds (when < 5 minutes remaining)

// Only log in development or when there's an issue
if (process.env.NODE_ENV === 'development' && !health.isValid) {
    console.warn('[Heartbeat] Session health issue:', { ... });
}
```

**Benefits:**
- ✅ Heartbeat checks every **2 minutes** (was 30 seconds) during normal operation
- ✅ Still checks every **30 seconds** when session is close to expiry (< 5 minutes remaining)
- ✅ No console noise during normal operation
- ✅ Still logs warnings in development when there are issues
- ✅ Reduced backend load (4x fewer heartbeat requests)

---

## Performance Impact

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Heartbeat requests (15 min) | 30 requests | 7-8 requests | **73% reduction** |
| Resources re-fetches | Every 30s | Once on mount | **~99% reduction** |
| Console logs (15 min) | 60+ logs | 0-2 logs | **~97% reduction** |
| Network traffic | High | Low | **Significantly reduced** |

---

## User Experience

### Before
- Console constantly updating with session/heartbeat logs
- Resources page flickering from re-fetches
- High browser activity in DevTools
- Distracting for developers

### After
- Clean console (only errors/warnings when needed)
- Resources load once and stay stable
- Minimal background network activity
- Professional, production-ready UX

---

## Testing

1. **Load resources page**: `https://dev-app.dive25.com/resources`
2. **Open browser console**
3. **Wait 2 minutes**
4. **Expected**: No `[Resources]`, `[TokenExpiry]`, or `[Heartbeat]` logs
5. **Resources should NOT re-fetch** (no network activity in DevTools)

### When session is close to expiry (< 5 minutes):
- Heartbeat will increase to every 30 seconds (critical mode)
- Token expiry checker will show warnings/modals as expected

---

## Related Files

**Modified:**
- `frontend/src/app/resources/page.tsx` (lines 165-213)
- `frontend/src/components/auth/token-expiry-checker.tsx` (lines 159-164)
- `frontend/src/hooks/use-session-heartbeat.ts` (lines 35-36, 89-104, 126-140, 171-183)

---

## Notes

- Debug logs still appear in **development mode** when there are issues
- Error logs are **never suppressed** (security/auth failures still logged)
- Heartbeat still responds immediately when page visibility changes
- Critical session expiry warnings still work as expected

---

## Rollback (if needed)

To revert to the old behavior:
1. Change `HEARTBEAT_INTERVAL` back to `30000` (30 seconds)
2. Change `HEARTBEAT_INTERVAL_CRITICAL` back to `10000` (10 seconds)
3. Restore console.log statements in all three files
4. Change resources `useEffect` dependency back to `[session, status, router]`

However, this is **not recommended** as the new behavior is production-ready and more user-friendly.





