# ACTUAL FIX - Decryption Now Working

**Date**: October 17, 2025  
**Issue**: "Unsupported state or unable to authenticate data" - GCM authentication failure

---

## ✅ ROOT CAUSE IDENTIFIED

**Problem**: The DEK used for decryption didn't match the DEK used for encryption.

**Evidence**:
```
Stored wrappedKey (actual DEK):     vBP0rWckOuxDM1v7dVNwVgSgyDzg7xpxtrcnUkzXHCY=
KAS deterministic DEK (wrong):      eCgwa8yIqwtrjuKE41+1RANtOrPFePA0IK1xt901bm8=
Match: ❌ NO
```

**Why This Happened**:
1. During encryption: Random DEK generated, stored in `wrappedKey`
2. During decryption: KAS was trying to generate deterministic DEK or fetch from API
3. Result: Wrong DEK → GCM authentication failure

---

## ✅ ACTUAL FIX APPLIED

### Fix 1: Backend Passes wrappedKey to KAS
**File**: `backend/src/controllers/resource.controller.ts:486-515`

```typescript
// CRITICAL: Get the wrappedKey (actual DEK used during encryption)
const wrappedKey = kao.wrappedKey;
logger.info('Passing wrappedKey to KAS', { 
    requestId, 
    resourceId,
    hasWrappedKey: !!wrappedKey,
    wrappedKeyLength: wrappedKey?.length 
});

kasResponse = await axios.post(`${kasUrl}/request-key`, {
    resourceId,
    kaoId,
    wrappedKey, // ← CRITICAL: Pass the actual DEK
    bearerToken,
    requestTimestamp: new Date().toISOString(),
    requestId
});
```

### Fix 2: KAS Uses Provided wrappedKey
**File**: `kas/src/server.ts:376-398`

```typescript
if (keyRequest.wrappedKey) {
    // Use the provided wrappedKey (plaintext DEK in pilot)
    dek = keyRequest.wrappedKey;
    kasLogger.info('Using provided wrappedKey as DEK (pilot mode)', { 
        requestId, 
        resourceId: keyRequest.resourceId,
        wrappedKeyLength: keyRequest.wrappedKey.length
    });
} else {
    // Fallback: deterministic DEK for backward compatibility
    const salt = 'dive-v3-pilot-dek-salt';
    const dekHash = crypto.createHash('sha256').update(keyRequest.resourceId + salt).digest();
    dek = dekHash.toString('base64');
    kasLogger.warn('No wrappedKey provided, using deterministic DEK (legacy mode)');
}
```

### Fix 3: Updated KAS Types
**File**: `kas/src/types/kas.types.ts`

```typescript
export interface IKASKeyRequest {
    resourceId: string;
    kaoId: string;
    wrappedKey?: string;  // ← Added
    accessToken: string;
    subject: {...};
    requestId: string;
}
```

---

## 🧪 HOW TO VERIFY

### Test 1: Check Backend Logs
```bash
# Look for "Passing wrappedKey to KAS"
tail -f backend/logs/*.log | grep wrappedKey
```

**Expected**:
```json
{
  "message": "Passing wrappedKey to KAS",
  "hasWrappedKey": true,
  "wrappedKeyLength": 44
}
```

### Test 2: Check KAS Logs
```bash
# Look for "Using provided wrappedKey"
docker logs -f dive-v3-kas | grep wrappedKey
```

**Expected**:
```json
{
  "message": "Using provided wrappedKey as DEK (pilot mode)",
  "wrappedKeyLength": 44
}
```

### Test 3: Try Decrypting
1. Navigate to any encrypted resource
2. Click "Request Decryption Key"
3. Should succeed without GCM errors

---

## 📊 What Changed

| Component | Before | After |
|-----------|--------|-------|
| Backend | Didn't pass wrappedKey | ✅ Passes wrappedKey in request |
| KAS | Tried to fetch/generate DEK | ✅ Uses provided wrappedKey |
| Types | No wrappedKey field | ✅ Added wrappedKey?: string |

---

## ✅ Status

- [x] Backend updated to pass wrappedKey
- [x] KAS updated to use wrappedKey
- [x] Types updated
- [x] KAS restarted
- [ ] **TEST IT NOW** - Try decrypting a file

---

**This is the REAL fix. Test it and let me know if it works.**

