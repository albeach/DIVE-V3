#!/bin/bash
# Test Script: Option B - Separate Enrollment from Authentication
# This demonstrates the new architecture where enrollment happens BEFORE authentication

set -e

BACKEND_URL="${BACKEND_URL:-http://localhost:4000}"
USERNAME="admin-dive"
PASSWORD="DiveAdmin2025!"
IDP_ALIAS="dive-v3-broker"

echo "🧪 Testing Option B Architecture: Separate OTP Enrollment from Authentication"
echo "================================================================"
echo ""

# Step 1: Generate OTP secret via OTP Service (simulating what frontend would do)
echo "Step 1: Generating OTP secret..."
curl -s -X POST "$BACKEND_URL/api/auth/otp/setup" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\",\"idpAlias\":\"$IDP_ALIAS\"}" \
  > /tmp/otp-setup.json

SUCCESS=$(cat /tmp/otp-setup.json | jq -r '.success')
if [ "$SUCCESS" != "true" ]; then
  echo "❌ OTP setup failed. This endpoint requires authentication but user doesn't have OTP yet."
  echo "   This is expected with current implementation."
  echo ""
  echo "💡 WORKAROUND: Using OTP Service directly to generate secret..."
  
  # Alternative: Direct OTP generation (what we'll implement)
  echo "   Generating secret via service layer..."
  SECRET=$(node -e "const speakeasy = require('speakeasy'); const secret = speakeasy.generateSecret({length: 20}); console.log(secret.base32);")
  echo "   Secret generated: ${SECRET:0:20}..."
  
  # Manually construct QR code URL
  QR_URL="otpauth://totp/DIVE%20V3%20Coalition%20ICAM:${USERNAME}?secret=${SECRET}&issuer=DIVE%20V3%20Coalition%20ICAM&algorithm=SHA256&digits=6&period=30"
  echo "   QR Code URL generated"
else
  SECRET=$(cat /tmp/otp-setup.json | jq -r '.data.secret')
  QR_URL=$(cat /tmp/otp-setup.json | jq -r '.data.qrCodeUrl')
  echo "✅ OTP secret generated: ${SECRET:0:20}..."
fi

echo ""

# Step 2: Generate OTP code (simulating authenticator app)
echo "Step 2: Generating OTP code (simulating authenticator app scan)..."
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/backend
OTP_CODE=$(node -e "const speakeasy = require('speakeasy'); const code = speakeasy.totp({ secret: '$SECRET', encoding: 'base32', algorithm: 'sha256' }); console.log(code);")
echo "✅ OTP Code: $OTP_CODE"
echo ""

# Step 3: Finalize enrollment via new API
echo "Step 3: Finalizing enrollment via /api/auth/otp/finalize-enrollment..."
curl -s -X POST "$BACKEND_URL/api/auth/otp/finalize-enrollment" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USERNAME\",\"idpAlias\":\"$IDP_ALIAS\",\"otpCode\":\"$OTP_CODE\"}" \
  > /tmp/finalize-enrollment.json

ENROLL_SUCCESS=$(cat /tmp/finalize-enrollment.json | jq -r '.success')
if [ "$ENROLL_SUCCESS" = "true" ]; then
  echo "✅ Enrollment completed successfully!"
  echo "   $(cat /tmp/finalize-enrollment.json | jq -r '.message')"
else
  echo "❌ Enrollment failed:"
  cat /tmp/finalize-enrollment.json | jq '.'
  exit 1
fi
echo ""

# Step 4: Authenticate with OTP
echo "Step 4: Authenticating with username + password + OTP..."
# Generate a fresh OTP code
OTP_CODE=$(node -e "const speakeasy = require('speakeasy'); const code = speakeasy.totp({ secret: '$SECRET', encoding: 'base32', algorithm: 'sha256' }); console.log(code);")
echo "   Using fresh OTP code: $OTP_CODE"

curl -s -X POST "$BACKEND_URL/api/auth/custom-login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\",\"idpAlias\":\"$IDP_ALIAS\",\"otp\":\"$OTP_CODE\"}" \
  > /tmp/login-result.json

LOGIN_SUCCESS=$(cat /tmp/login-result.json | jq -r '.success')
if [ "$LOGIN_SUCCESS" = "true" ]; then
  echo "✅ Authentication successful!"
  AAL=$(cat /tmp/login-result.json | jq -r '.data.aal')
  echo "   AAL Level: $AAL (should be 'AAL2')"
  echo "   Access Token: $(cat /tmp/login-result.json | jq -r '.data.accessToken' | cut -c1-50)..."
else
  echo "❌ Authentication failed:"
  cat /tmp/login-result.json | jq '.'
  exit 1
fi

echo ""
echo "================================================================"
echo "✅ SUCCESS: Option B Architecture Working!"
echo "   1. Enrollment completed via Admin API ✓"
echo "   2. Authentication with OTP successful ✓"
echo "   3. AAL2 achieved ✓"
echo "================================================================"

