# 🎯 OTP Testing - Quick Solution

**Issue**: Cannot easily set user attributes in broker realm  
**Solution**: Use federated IdP users that already have classified clearance  
**Status**: ✅ **READY TO TEST**

---

## ✅ Recommended Test Method: Use Federation

The easiest way to test OTP enrollment is to use one of the federated IdP realms that have pre-configured users with classified clearance.

### Test Steps:

1. **Navigate to**: http://localhost:3000
2. **Select**: "🇺🇸 United States (DoD)" or "🇫🇷 France"
3. **Login as**:
   - USA: `john.smith@army.mil` / `Password123!` (SECRET clearance)
   - France: `marie.dubois@defense.gouv.fr` / `Password123!` (SECRET clearance)
4. **Expected**: User will be redirected through federation, then OTP enrollment should trigger

---

## 🔧 Alternative: Use Browser Test

Since we have browser automation available, let me test the federation flow:

```bash
# Test with USA realm user
curl -s -X POST "http://localhost:4000/api/auth/custom-login" \
  -H "Content-Type: application/json" \
  -d '{
    "idpAlias": "usa-realm-broker",
    "username": "john.smith@army.mil",
    "password": "Password123!"
  }' | jq '.'
```

---

## 📊 Why Broker Realm Users Don't Work

The `dive-v3-broker` realm is designed for:
- Super admin access
- System management
- NOT for regular classified users

Regular users authenticate via **federated IdPs** (USA, France, Canada, etc.) which have:
- ✅ Proper clearance attributes configured
- ✅ Country affiliations
- ✅ Organizational attributes
- ✅ MFA requirements based on clearance

---

## 🎯 Summary

| Realm | Purpose | MFA Required? | Test Users Available? |
|-------|---------|---------------|----------------------|
| **dive-v3-broker** | Super admin | ❌ No (UNCLASSIFIED) | ✅ Yes (but no MFA) |
| **dive-v3-usa** | USA DoD users | ✅ Yes (SECRET clearance) | ✅ Yes |
| **dive-v3-fra** | France users | ✅ Yes (SECRET clearance) | ✅ Yes |
| **dive-v3-can** | Canada users | ✅ Yes (CONFIDENTIAL) | ✅ Yes |

---

## ✅ Next Action

I'll test the OTP enrollment using the USA federated IdP user which has proper clearance configured.

**Test user**: `john.smith@army.mil` / `Password123!`  
**Expected**: OTP enrollment QR code should appear

