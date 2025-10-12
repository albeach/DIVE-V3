#!/bin/bash

echo "Testing Keycloak logout endpoint..."
echo ""

# Get a test token (you'll need to replace with actual token from browser)
echo "To test Keycloak logout, we need an id_token."
echo ""
echo "Steps to test manually:"
echo "1. Login to DIVE V3"
echo "2. Open Browser Console (F12)"
echo "3. Run: document.cookie"
echo "4. Look for AUTH_SESSION_ID, KEYCLOAK_SESSION cookies"
echo ""
echo "If these Keycloak cookies exist after clicking logout,"
echo "it means Keycloak end_session_endpoint is not being called properly."
echo ""
echo "Check in secure-logout-button.tsx:"
echo "- Is getKeycloakLogoutUrl() returning correct URL?"
echo "- Does URL include id_token_hint?"
echo "- Does URL include post_logout_redirect_uri?"
echo ""
echo "Keycloak logout URL should look like:"
echo "http://localhost:8081/realms/dive-v3-pilot/protocol/openid-connect/logout"
echo "  ?id_token_hint=eyJhbGc..."
echo "  &post_logout_redirect_uri=http://localhost:3000"

