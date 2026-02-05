#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - ACR/AMR Token Audit for WebAuthn Authentication
# =============================================================================
# Purpose: Diagnose why ACR=0 and AMR=[] despite WebAuthn registration
# =============================================================================

set -e

echo "🔍 ACR/AMR WebAuthn Token Audit - GBR Instance"
echo "================================================================="
echo ""

# Decode the provided access token
ACCESS_TOKEN="eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICJVaW5uT3FwLWJ4dlJPeDFsdHAtcDhaNDJ1UzItME0xYVZzT1FwdlhrVFNZIn0.eyJleHAiOjE3NzAyMDQ3OTcsImlhdCI6MTc3MDIwMzg5NywianRpIjoib25ydHJ0OmRkMzE0MjIxLTllYzEtMDA4My03MGM4LTU3NWU3MTJkMTU3MyIsImlzcyI6Imh0dHBzOi8vbG9jYWxob3N0Ojg0NzQvcmVhbG1zL2RpdmUtdjMtYnJva2VyLWdiciIsImF1ZCI6ImFjY291bnQiLCJ0eXAiOiJCZWFyZXIiLCJhenAiOiJkaXZlLXYzLWJyb2tlci1nYnIiLCJzaWQiOiItV0Y1ck9sVGhPV2dmQTRpTGhmWDA2R1UiLCJhY3IiOiIwIiwiYWxsb3dlZC1vcmlnaW5zIjpbImh0dHA6Ly9ob3N0LmRvY2tlci5pbnRlcm5hbDozMDMxIiwiaHR0cHM6Ly9nYnIuZGl2ZTI1LmNvbSIsImh0dHBzOi8vbG9jYWxob3N0OjMwMzEiLCJodHRwOi8vbG9jYWxob3N0OjMwMzEiXSwicmVhbG1fYWNjZXNzIjp7InJvbGVzIjpbImRpdmUtYWRtaW4iLCJvZmZsaW5lX2FjY2VzcyIsInVtYV9hdXRob3JpemF0aW9uIiwiZGVmYXVsdC1yb2xlcy1kaXZlLXYzLWJyb2tlci1nYnIiXX0sInJlc291cmNlX2FjY2VzcyI6eyJhY2NvdW50Ijp7InJvbGVzIjpbIm1hbmFnZS1hY2NvdW50IiwibWFuYWdlLWFjY291bnQtbGlua3MiLCJ2aWV3LXByb2ZpbGUiXX19LCJzY29wZSI6Im9wZW5pZCB1bmlxdWVJRCBwcm9maWxlIGNvdW50cnlPZkFmZmlsaWF0aW9uIHVzZXJfYW1yIGRpdmVfYWNyIGFjcENPSSBlbWFpbCBkaXZlX2FtciB1c2VyX2FjciBjbGVhcmFuY2UiLCJyZWFsbV9yb2xlcyI6WyJkaXZlLWFkbWluIiwib2ZmbGluZV9hY2Nlc3MiLCJ1bWFfYXV0aG9yaXphdGlvbiIsImRlZmF1bHQtcm9sZXMtZGl2ZS12My1icm9rZXItZ2JyIl0sImFjcENPSSI6WyJOQVRPLEZWRVkiXSwiZW1haWxfdmVyaWZpZWQiOnRydWUsImFtciI6W10sIm5hbWUiOiJBZG1pbiBVc2VyIiwiY2xlYXJhbmNlIjoiVE9QX1NFQ1JFVCIsImNvdW50cnlPZkFmZmlsaWF0aW9uIjoiR0JSIiwicHJlZmVycmVkX3VzZXJuYW1lIjoiYWRtaW4tZ2JyIiwiZ2l2ZW5fbmFtZSI6IkFkbWluIiwiZmFtaWx5X25hbWUiOiJVc2VyIiwidW5pcXVlSUQiOiJhZG1pbi1nYnIiLCJlbWFpbCI6ImFkbWluLWdickBnYnIuZGl2ZTI1Lm1pbCJ9.DPWhhZIK91sfBjwCMqLra1D3Y0cklZCWIlBOpDP84RLJLS8zsqQ6-oyUPqI4eszLTOM_wH_KU9YHjgNTXw0yvWvfVAkeTewzGU4gPb0U49a5bZa96eLIGUWAj5qSnH4_9VsVWauJGN3DSvCycRNnlJ-k-qTlgR_yIPH3wAfM1y-N9G2MB3ZfZP9gnuDi-sgeAX8LvlX4rh6hcghgb_6ZIbxe6qPwRP06Yo0nyzINb373ZTMCsloICa-5e5FI2VuJAojFIvfWlqlpqxdKKBGXkTYefa_Fem0cOPkTgEnQLlNViVhfv6kjOLt-w_D_4vSjTkBx6CFST_ikcj-jRZ1Lsw"

ID_TOKEN="eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICJVaW5uT3FwLWJ4dlJPeDFsdHAtcDhaNDJ1UzItME0xYVZzT1FwdlhrVFNZIn0.eyJleHAiOjE3NzAyMDQ3OTcsImlhdCI6MTc3MDIwMzg5NywianRpIjoiMjcyNTAxY2QtNTk4Ny03N2Q4LWU5ZTYtMjczYTVhMDBmOWM1IiwiaXNzIjoiaHR0cHM6Ly9sb2NhbGhvc3Q6ODQ3NC9yZWFsbXMvZGl2ZS12My1icm9rZXItZ2JyIiwiYXVkIjoiZGl2ZS12My1icm9rZXItZ2JyIiwic3ViIjoiNGFiYzI3NWItYjJmYS00YmE3LWFhZDMtNjRkMDVmNmE0YzJkIiwidHlwIjoiSUQiLCJhenAiOiJkaXZlLXYzLWJyb2tlci1nYnIiLCJzaWQiOiItV0Y1ck9sVGhPV2dmQTRpTGhmWDA2R1UiLCJhdF9oYXNoIjoiYlNhWW52SVp0bDFZTmM3X0xlakVtZyIsImFjciI6IjAiLCJhY3BDT0kiOlsiTkFUTyxGVkVZIl0sImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJhbXIiOltdLCJjb3VudHJ5T2ZBZmZpbGlhdGlvbiI6IkdCUiIsInByZWZlcnJlZF91c2VybmFtZSI6ImFkbWluLWdiciIsImdpdmVuX25hbWUiOiJBZG1pbiIsInJlYWxtX3JvbGVzIjpbImRpdmUtYWRtaW4iLCJvZmZsaW5lX2FjY2VzcyIsInVtYV9hdXRob3JpemF0aW9uIiwiZGVmYXVsdC1yb2xlcy1kaXZlLXYzLWJyb2tlci1nYnIiXSwicmVhbG1fYWNjZXNzIjp7InJvbGVzIjpbImRpdmUtYWRtaW4iLCJvZmZsaW5lX2FjY2VzcyIsInVtYV9hdXRob3JpemF0aW9uIiwiZGVmYXVsdC1yb2xlcy1kaXZlLXYzLWJyb2tlci1nYnIiXX0sIm5hbWUiOiJBZG1pbiBVc2VyIiwiY2xlYXJhbmNlIjoiVE9QX1NFQ1JFVCIsImZhbWlseV9uYW1lIjoiVXNlciIsInVuaXF1ZUlEIjoiYWRtaW4tZ2JyIiwiZW1haWwiOiJhZG1pbi1nYnJAZ2JyLmRpdmUyNS5taWwifQ.QKeTrYp_cgOuKYcE1m53g7-x-3mOzkauS_5fzbiaib_Ut4vegq68kZuCpAkaS9j83Otnyc-IbRvYDoPZbrU10Lel4NbBDjzhv99jUYxptO3GG_5-urLGpF2YfmEO9Ru0AkJeZtEUvAgqlC7M3UL974L0X1zi0_G3vomNQqDsivDFgcgEGmhZi69NCJnEwSUN6rf72O-OpIsAD2XDmCtIDMxPH7RJ0NfOjvg1suj4qMtXUezsJvGbW5twH8gsQrGW5GxuJXxtJf6UYtyBXI4ibyuTWo0DpaelSIwBnU7caHGBBX70TD_t5QUNmYtnAQL38XYspBA_NjTvA8pxAttkCA"

echo "📋 Decoding Tokens..."
echo ""

echo "=== ACCESS TOKEN PAYLOAD ===" | tee access_token_decoded.json
echo "$ACCESS_TOKEN" | cut -d'.' -f2 | base64 -d 2>/dev/null | jq '.' | tee -a access_token_decoded.json
echo ""

echo "=== ID TOKEN PAYLOAD ===" | tee id_token_decoded.json
echo "$ID_TOKEN" | cut -d'.' -f2 | base64 -d 2>/dev/null | jq '.' | tee -a id_token_decoded.json
echo ""

echo "🔍 KEY FINDINGS:"
echo "================================================================="

# Extract key claims
ACR=$(echo "$ACCESS_TOKEN" | cut -d'.' -f2 | base64 -d 2>/dev/null | jq -r '.acr')
AMR=$(echo "$ACCESS_TOKEN" | cut -d'.' -f2 | base64 -d 2>/dev/null | jq -r '.amr')
SCOPE=$(echo "$ACCESS_TOKEN" | cut -d'.' -f2 | base64 -d 2>/dev/null | jq -r '.scope')
SID=$(echo "$ACCESS_TOKEN" | cut -d'.' -f2 | base64 -d 2>/dev/null | jq -r '.sid')

echo "✅ ACR (Authentication Context): $ACR"
echo "❌ AMR (Authentication Methods): $AMR (EMPTY!)"
echo "📋 Scope includes: $SCOPE"
echo "🔐 Session ID: $SID"
echo ""

echo "🎯 ROOT CAUSE ANALYSIS:"
echo "================================================================="
echo "❌ PROBLEM: Token shows acr='0' and amr=[] despite WebAuthn registration"
echo ""
echo "📌 EXPECTED: After WebAuthn auth, should see:"
echo "   - acr: '3' (AAL3 for hardware key)"
echo "   - amr: ['pwd', 'hwk'] (password + hardware key)"
echo ""
echo "📌 ACTUAL: Token contains:"
echo "   - acr: '0' (lowest level - no authentication)"
echo "   - amr: [] (no auth methods recorded)"
echo ""
echo "🔍 HYPOTHESIS:"
echo "   1. User registered WebAuthn but hasn't used it to login yet"
echo "   2. Keycloak authentication flow not configured to populate AMR/ACR"
echo "   3. Protocol mappers missing for acr/amr claims"
echo "   4. WebAuthn configured but not set as required in flow"
echo ""

echo "📝 Token files saved:"
echo "   - access_token_decoded.json"
echo "   - id_token_decoded.json"
echo ""
