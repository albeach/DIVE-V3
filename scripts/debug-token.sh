#!/bin/bash
# Debug script to decode JWT and extract issuer

# Get a token from frontend by checking browser storage
echo "=== Checking frontend authentication ==="
curl -s http://localhost:3000/api/auth/session | jq '.'

echo ""
echo "=== Instructions ==="
echo "1. Open browser to http://localhost:3000"
echo "2. Login with any user"
echo "3. Open browser DevTools -> Application -> Cookies"
echo "4. Copy the 'next-auth.session-token' cookie value"
echo "5. Make a request to the backend with that token"
echo ""
echo "OR paste a JWT token below to decode it:"
read -r TOKEN

if [ -n "$TOKEN" ]; then
    echo "=== Decoding Token Header ==="
    echo "$TOKEN" | cut -d '.' -f1 | base64 -d 2>/dev/null | jq '.'
    
    echo ""
    echo "=== Decoding Token Payload ==="
    echo "$TOKEN" | cut -d '.' -f2 | base64 -d 2>/dev/null | jq '.'
fi

