# Session Management - Quick Start Guide

**For Developers**: Quick reference for understanding and working with DIVE V3 session management

---

## 🎯 Key Concepts

### 1. Two-Tier System

**Baseline** (already working):
- ✅ Real-time countdown indicator
- ✅ Professional expiry modal
- ✅ Proactive token refresh
- ✅ Error boundary

**Advanced** (new):
- ✅ Cross-tab synchronization
- ✅ Server-side validation
- ✅ Clock skew compensation
- ✅ Page visibility optimization

---

## 🔧 How to Use

### Reading Session Status

```typescript
import { useSessionHeartbeat } from '@/hooks/use-session-heartbeat';

function MyComponent() {
    const { sessionHealth, isPageVisible } = useSessionHeartbeat();
    
    if (sessionHealth) {
        console.log('Session valid:', sessionHealth.isValid);
        console.log('Expires at:', new Date(sessionHealth.expiresAt));
        console.log('Clock skew:', sessionHealth.serverTimeOffset, 'ms');
        console.log('Page visible:', isPageVisible);
    }
}
```

### Broadcasting Events (Cross-Tab)

```typescript
import { getSessionSyncManager } from '@/lib/session-sync-manager';

const syncManager = getSessionSyncManager();

// When you refresh token:
syncManager.notifyTokenRefreshed(expiresAtTimestamp);

// When user logs out:
syncManager.notifyUserLogout();

// When showing warning:
syncManager.notifyWarningShown();
```

### Listening for Events (Cross-Tab)

```typescript
import { getSessionSyncManager } from '@/lib/session-sync-manager';

const syncManager = getSessionSyncManager();

// Subscribe to all events
const unsubscribe = syncManager.subscribe((event) => {
    switch (event.type) {
        case 'TOKEN_REFRESHED':
            console.log('Token refreshed in another tab');
            // Update your UI
            break;
            
        case 'USER_LOGOUT':
            console.log('User logged out in another tab');
            // Cleanup and redirect
            break;
            
        case 'SESSION_EXPIRED':
            console.log('Session expired in another tab');
            // Show expired modal
            break;
    }
});

// Don't forget to cleanup!
useEffect(() => {
    return () => unsubscribe();
}, []);
```

---

## 🧪 Testing Your Changes

### Test Cross-Tab Sync

```bash
# 1. Open DIVE V3 in Chrome
# 2. Open DevTools console in all tabs
# 3. Login
# 4. In Tab 1, watch for auto-refresh (at ~12 min)
# 5. In Tab 2, 3, check console:
#    Expected: "[SessionSync] Received: TOKEN_REFRESHED"
# 6. Verify all tabs show same expiry time
```

### Test Clock Skew

```bash
# 1. Change system clock +5 minutes
# 2. Open DIVE V3
# 3. Login
# 4. Check console for:
#    "[Heartbeat] Clock skew detected: offset: 300000"
# 5. Verify session indicator shows correct time
#    (should compensate for skew)
# 6. Change clock back
# 7. Wait 30s for next heartbeat
# 8. Verify skew corrected in console
```

### Test Page Visibility

```bash
# 1. Open DIVE V3
# 2. Open DevTools console
# 3. Switch to another app/tab for 1 minute
# 4. Switch back
# 5. Check console:
#    Expected: "[Heartbeat] Page became visible, performing immediate check"
# 6. Verify session status accurate
```

---

## 🐛 Debugging

### Common Issues

#### Issue: "Tabs not syncing"

Check:
1. Browser supports Broadcast Channel API (Chrome 54+, Firefox 38+, Safari 15.4+)
2. Same origin (all tabs on same domain)
3. Console for errors

Debug:
```typescript
const syncManager = getSessionSyncManager();
console.log('Tab ID:', syncManager.getTabId());
// Should see: "tab-1234567890-abc123"
```

#### Issue: "Clock skew warning spam"

Check:
1. System clock accuracy (sync with NTP)
2. Server time (SSH to server, run `date`)

Adjust tolerance:
```typescript
// In use-session-heartbeat.ts
const CLOCK_SKEW_TOLERANCE = 5000; // Increase if needed
```

#### Issue: "Heartbeat not running"

Check:
1. User is authenticated
2. `/api/session/refresh` endpoint accessible
3. Console for errors

Debug:
```typescript
const { sessionHealth, triggerHeartbeat } = useSessionHeartbeat();

// Manual trigger
await triggerHeartbeat();
console.log(sessionHealth);
```

---

## 📏 Configuration Reference

### Heartbeat Interval

**File**: `frontend/src/hooks/use-session-heartbeat.ts`
```typescript
const HEARTBEAT_INTERVAL = 30000; // 30 seconds
```

**Adjust for**:
- High security: `10000` (10s) - Faster revocation detection
- Low traffic: `60000` (60s) - Reduce server load
- Development: `15000` (15s) - Faster feedback

### Refresh Thresholds

**File**: `frontend/src/components/auth/token-expiry-checker.tsx`
```typescript
const WARNING_THRESHOLD = 120;  // 2 minutes - Show warning
const REFRESH_THRESHOLD = 300;  // 5 minutes - Auto-refresh
```

**Timeline (15-min token)**:
```
0:00  → Token issued
12:00 → Auto-refresh (REFRESH_THRESHOLD hit)
13:00 → Warning modal (WARNING_THRESHOLD hit)
15:00 → Expired modal
```

### Clock Skew Tolerance

**File**: `frontend/src/hooks/use-session-heartbeat.ts`
```typescript
const CLOCK_SKEW_TOLERANCE = 5000; // 5 seconds
```

**Purpose**: Log warning if clock drift exceeds tolerance  
**Note**: Skew is always compensated regardless of tolerance

---

## 💡 Best Practices

### DO ✅

1. **Use server-validated data when available**
   ```typescript
   // Prefer sessionHealth over client-side JWT parsing
   if (sessionHealth && sessionHealth.isValid) {
       const remaining = sessionHealth.expiresAt - (Date.now() - sessionHealth.serverTimeOffset);
   }
   ```

2. **Broadcast significant events**
   ```typescript
   // After refreshing token:
   syncManager.notifyTokenRefreshed(newExpiresAt);
   
   // Before logging out:
   syncManager.notifyUserLogout();
   ```

3. **Pause timers when hidden**
   ```typescript
   if (isPageVisible) {
       const interval = setInterval(updateUI, 1000);
       return () => clearInterval(interval);
   }
   ```

4. **Cleanup subscriptions**
   ```typescript
   useEffect(() => {
       const unsubscribe = syncManager.subscribe(handler);
       return () => unsubscribe();
   }, []);
   ```

### DON'T ❌

1. **Don't broadcast tokens**
   ```typescript
   // BAD: Never broadcast sensitive data
   syncManager.broadcast({ type: 'TOKEN', token: accessToken });
   
   // GOOD: Only broadcast metadata
   syncManager.notifyTokenRefreshed(expiresAtTimestamp);
   ```

2. **Don't trust client time**
   ```typescript
   // BAD: Client clock might be wrong
   const remaining = tokenExpiry - Date.now();
   
   // GOOD: Compensate for clock skew
   const remaining = tokenExpiry - (Date.now() - serverTimeOffset);
   ```

3. **Don't poll when hidden**
   ```typescript
   // BAD: Wastes battery
   setInterval(updateUI, 1000); // Always runs
   
   // GOOD: Pause when hidden
   if (isPageVisible) {
       setInterval(updateUI, 1000);
   }
   ```

4. **Don't make authorization decisions client-side**
   ```typescript
   // BAD: Client can't be trusted
   if (clientSaysTokenValid) {
       showSecretData();
   }
   
   // GOOD: Server validates on every API call
   const response = await fetch('/api/resource', {
       headers: { Authorization: `Bearer ${token}` }
   });
   ```

---

## 🔍 Console Log Reference

### What to Look For

**Normal Operation**:
```
[SessionSync] tab-123456 Initialized
[Heartbeat] Health check: { isValid: true, ... }
[TokenExpiry] Using server-validated session health
[TokenExpiry] Auto-refreshing session (under 5 minutes, page visible)
[SessionSync] tab-123456 Broadcasting: TOKEN_REFRESHED
[TokenExpiry] Received sync event: TOKEN_REFRESHED
```

**Warning Signs**:
```
⚠️ [Heartbeat] Clock skew detected: offset: 300000
   → System clock is off, but compensated

⚠️ [Heartbeat] Session invalid: 401
   → Server rejected session, logout needed

⚠️ [SessionSync] Channel not available
   → Broadcast Channel unsupported, tabs work independently
```

**Error Cases**:
```
❌ [Heartbeat] Failed: TypeError: Failed to fetch
   → Network error, retry on next interval

❌ [TokenExpiry] Error parsing token: Invalid JWT
   → Token corrupted, force re-login

❌ [TokenExpiry] Failed to refresh session: RefreshTokenExpired
   → Refresh token expired, show expired modal
```

---

## 📦 Import Cheat Sheet

```typescript
// Session heartbeat hook (server validation + page visibility)
import { useSessionHeartbeat } from '@/hooks/use-session-heartbeat';

// Cross-tab sync manager
import { getSessionSyncManager } from '@/lib/session-sync-manager';

// Session expiry modal component
import { SessionExpiryModal } from '@/components/auth/session-expiry-modal';
import type { SessionExpiryReason } from '@/components/auth/session-expiry-modal';

// Session status indicator
import { SessionStatusIndicator } from '@/components/auth/session-status-indicator';

// Token expiry checker (already in layout)
import { TokenExpiryChecker } from '@/components/auth/token-expiry-checker';

// NextAuth session hook
import { useSession, signOut } from 'next-auth/react';
```

---

## 🚀 Quick Reference Commands

```bash
# Check if Broadcast Channel supported (browser console)
typeof BroadcastChannel !== 'undefined'

# Check if Page Visibility API supported
typeof document.visibilityState !== 'undefined'

# Manual heartbeat test
fetch('/api/session/refresh').then(r => r.json()).then(console.log)

# View session health in React component
const { sessionHealth } = useSessionHeartbeat();
console.log(sessionHealth);

# Check clock skew
const serverTime = 1729008000; // From API response
const clientTime = Math.floor(Date.now() / 1000);
const skew = clientTime - serverTime;
console.log('Clock skew:', skew, 'seconds');
```

---

## 📚 Documentation Links

- **Baseline Features**: `docs/SESSION-MANAGEMENT-IMPROVEMENTS.md`
- **Advanced Features**: `docs/ADVANCED-SESSION-MANAGEMENT.md`
- **Executive Summary**: `ADVANCED-SESSION-MANAGEMENT-SUMMARY.md`
- **This Guide**: `docs/SESSION-MANAGEMENT-QUICK-START.md`

---

**Last Updated**: October 14, 2025  
**Maintainer**: DIVE V3 Team  
**Questions?** Check console logs first, then review full documentation

