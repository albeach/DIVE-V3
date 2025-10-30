# 🔍 OTP Testing Issue - Root Cause & Solution

**Date**: October 27, 2025  
**Issue**: OTP enrollment flow not triggering  
**Status**: ✅ **IDENTIFIED & RESOLVED**

---

## 📋 Problem Summary

When testing the Custom SPI OTP enrollment flow, the QR code did **not** appear during login. The user was able to login successfully without OTP.

---

## 🔍 Root Cause

The conditional MFA flow requires:
```
User clearance != "UNCLASSIFIED"
```

**What Happened**:
1. Test user `admin-dive` had **NO clearance attribute** set (`null`)
2. Backend enriched null clearance to `"UNCLASSIFIED"`
3. Conditional MFA check: `"UNCLASSIFIED" != "UNCLASSIFIED"` = **FALSE**
4. Result: MFA flow **skipped**, user logged in without OTP

---

## ✅ Solution

Users need a **classified clearance level** to trigger OTP enrollment:
- `CONFIDENTIAL`
- `SECRET`
- `TOP_SECRET`

---

## 🎯 Quick Test Script

Here's a complete test script that creates a proper test user and tests the OTP flow:

```bash
#!/bin/bash
# File: test-otp-enrollment.sh

echo "🔐 Testing Custom SPI OTP Enrollment Flow"
echo "=========================================="

# Step 1: Get admin token
echo "Step 1: Getting admin token..."
TOKEN=$(curl -s -X POST "http://localhost:8081/realms/master/protocol/openid-connect/token" \
  -d "client_id=admin-cli" \
  -d "username=admin" \
  -d "password=admin" \
  -d "grant_type=password" | jq -r '.access_token')

if [ -z "$TOKEN" ] || [ "$TOKEN" == "null" ]; then
  echo "❌ Failed to get admin token"
  exit 1
fi
echo "✅ Admin token obtained"

# Step 2: Create test user with classified clearance
echo ""
echo "Step 2: Creating test user with SECRET clearance..."
USER_CREATE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "http://localhost:8081/admin/realms/dive-v3-broker/users" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "test-otp-user",
    "email": "test-otp@dive-v3.pilot",
    "enabled": true,
    "emailVerified": true,
    "attributes": {
      "clearance": ["SECRET"],
      "countryOfAffiliation": ["USA"],
      "uniqueID": ["test-otp@dive-v3.pilot"]
    },
    "credentials": [{
      "type": "password",
      "value": "TestPassword123!",
      "temporary": false
    }]
  }')

HTTP_CODE=$(echo "$USER_CREATE_RESPONSE" | tail -1)
if [ "$HTTP_CODE" == "201" ] || [ "$HTTP_CODE" == "409" ]; then
  echo "✅ User created (or already exists)"
else
  echo "⚠️  User creation status: $HTTP_CODE"
fi

# Step 3: Get user ID
echo ""
echo "Step 3: Getting user ID..."
USER_ID=$(curl -s -X GET "http://localhost:8081/admin/realms/dive-v3-broker/users?username=test-otp-user&exact=true" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.[0].id')

if [ -z "$USER_ID" ] || [ "$USER_ID" == "null" ]; then
  echo "❌ Failed to get user ID"
  exit 1
fi
echo "✅ User ID: $USER_ID"

# Step 4: Remove any existing OTP credential
echo ""
echo "Step 4: Removing existing OTP credential (if any)..."
CRED_ID=$(curl -s -X GET "http://localhost:8081/admin/realms/dive-v3-broker/users/$USER_ID/credentials" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.[] | select(.type=="otp") | .id')

if [ -n "$CRED_ID" ] && [ "$CRED_ID" != "null" ]; then
  curl -s -X DELETE "http://localhost:8081/admin/realms/dive-v3-broker/users/$USER_ID/credentials/$CRED_ID" \
    -H "Authorization: Bearer $TOKEN"
  echo "✅ OTP credential deleted: $CRED_ID"
else
  echo "ℹ️  No OTP credential to delete"
fi

# Step 5: Test login (should trigger OTP setup)
echo ""
echo "Step 5: Testing login (should trigger OTP setup)..."
RESPONSE=$(curl -s -X POST "http://localhost:4000/api/auth/custom-login" \
  -H "Content-Type: application/json" \
  -d '{
    "idpAlias": "dive-v3-broker",
    "username": "test-otp-user",
    "password": "TestPassword123!"
  }')

echo ""
echo "==== Backend Response ===="
echo "$RESPONSE" | jq '.'
echo ""

# Step 6: Check if OTP setup was triggered
if echo "$RESPONSE" | jq -e '.mfaSetupRequired == true' > /dev/null 2>&1; then
  echo "✅ SUCCESS! OTP setup required detected!"
  echo ""
  echo "📱 QR Code URL:"
  echo "$RESPONSE" | jq -r '.otpUrl // .qrCode'
  echo ""
  echo "🔑 OTP Secret:"
  echo "$RESPONSE" | jq -r '.otpSecret'
  echo ""
  echo "👤 User ID:"
  echo "$RESPONSE" | jq -r '.userId'
  echo ""
  echo "===================================="
  echo "✅ Custom SPI is working correctly!"
  echo "===================================="
  echo ""
  echo "Next steps:"
  echo "1. Scan the QR code with Google Authenticator/Authy"
  echo "2. Get the 6-digit code"
  echo "3. Login again with username + password + OTP code"
  exit 0
else
  echo "❌ FAILED! mfaSetupRequired not detected"
  echo ""
  echo "Troubleshooting:"
  echo "1. Check user clearance:"
  curl -s -X GET "http://localhost:8081/admin/realms/dive-v3-broker/users/$USER_ID" \
    -H "Authorization: Bearer $TOKEN" | jq '{username, attributes}'
  echo ""
  echo "2. Check backend logs:"
  echo "   docker logs dive-v3-backend --tail=20"
  echo ""
  echo "3. Check Keycloak logs:"
  echo "   docker logs dive-v3-keycloak 2>&1 | grep -i 'otp\|direct-grant' | tail -20"
  exit 1
fi
```

Save this to `/tmp/test-otp-enrollment.sh`, make it executable, and run it:

```bash
chmod +x /tmp/test-otp-enrollment.sh
/tmp/test-otp-enrollment.sh
```

---

## 🔧 Why admin-dive Failed

**Issue**: The `admin-dive` user in the broker realm has:
- ❌ No clearance attribute set
- ❌ Defaults to UNCLASSIFIED (via backend enrichment)
- ❌ MFA not required for UNCLASSIFIED

**Fix Options**:

### Option A: Use Federation (Recommended)
Instead of logging into the broker realm directly, use one of the federated IdPs that have users with classified clearance:

1. Navigate to http://localhost:3000
2. Select **"🇺🇸 United States (DoD)"** or **"🇫🇷 France"**
3. Login as:
   - USA: `john.smith@army.mil` / `Password123!` (SECRET clearance)
   - France: `marie.dubois@defense.gouv.fr` / `Password123!` (SECRET clearance)

### Option B: Create New Test User with Classified Clearance
Use the script above to create `test-otp-user` with SECRET clearance.

### Option C: Fix admin-dive (Not Recommended)
The broker realm users are meant for super-admin purposes and typically don't require MFA. If you want to test with `admin-dive`, you'd need to give them classified clearance, but this goes against the design.

---

## 📊 Summary

| Component | Status | Notes |
|-----------|--------|-------|
| **Custom SPI** | ✅ Active | Deployed and loaded |
| **Terraform** | ✅ Configured | Using `direct-grant-otp-setup` |
| **Backend** | ✅ Integrated | Handles custom SPI responses |
| **Frontend** | ✅ Ready | Supports `mfaSetupRequired` flow |
| **Test Issue** | ✅ Identified | User needs classified clearance |

---

## ✅ Verification Steps

After creating a proper test user with classified clearance:

1. **Login without OTP** → Should display QR code
2. **Scan QR code** → Add to authenticator app
3. **Submit 6-digit code** → Should create credential and login
4. **Logout and login again** → Should prompt for OTP (no QR)
5. **Enter OTP** → Should login successfully
6. **Check JWT token** → Should contain `acr: "1"` and `amr: ["pwd","otp"]`

---

**Status**: ✅ **Ready for Testing with Proper User**  
**Last Updated**: October 27, 2025  
**Next Action**: Run the test script above to verify OTP enrollment flow

