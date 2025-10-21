#!/bin/bash
# Debug Token Audience Issue for admin-dive

echo "🔍 Token Audience Debug Tool"
echo "============================"
echo ""
echo "Please provide the admin-dive ACCESS TOKEN (not ID token)"
echo "You can get it from browser console with:"
echo "  fetch('/api/auth/session').then(r => r.json()).then(s => console.log(s.accessToken))"
echo ""
echo "Then decode the token at https://jwt.io to check the 'aud' claim"
echo ""
echo "Expected audience: dive-v3-client-broker"
echo "Backend accepts: dive-v3-client, dive-v3-client-broker, account"
echo ""
echo "Common issues:"
echo "1. Token might have 'aud' as array instead of string"
echo "2. Token might have wrong audience value"
echo "3. Token might be missing 'aud' claim entirely"
echo ""

