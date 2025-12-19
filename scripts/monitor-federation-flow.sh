#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Monitor Federation Flow (Browser-Based)
# =============================================================================
# This script monitors Keycloak logs during browser-based federation
# to capture the exact error when authenticating with GBR IdP
# =============================================================================

LOG_FILE="/Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/.cursor/debug.log"

log_event() {
  local location="$1"
  local message="$2"
  local data="$3"
  echo "{\"runId\":\"browser-flow\",\"location\":\"$location\",\"message\":\"$message\",\"data\":$data,\"timestamp\":$(date +%s)000}" >> "$LOG_FILE"
}

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║     Monitoring Federation Flow - Browser Authentication      ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "This script will monitor logs while you test the browser flow."
echo ""
echo "Instructions:"
echo "  1. Keep this terminal window open"
echo "  2. Open browser to https://localhost:3000"
echo "  3. Click 'Sign in with Keycloak'"
echo "  4. Click 'United Kingdom' (GBR IdP)"
echo "  5. Login: testuser-gbr-1 / TestUser2025!Pilot"
echo "  6. Return here and press Ctrl+C when done"
echo ""
echo "Starting log monitoring in 5 seconds..."
echo ""

sleep 5

echo "═══════════════════════════════════════════════════════════════"
echo "  MONITORING ACTIVE - Perform browser login now"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Log initial state
log_event "start" "Monitoring started" "{\"timestamp\":\"$(date -Iseconds)\"}"

# Monitor USA Hub Keycloak logs for federation events
docker logs -f --tail 0 dive-hub-keycloak 2>&1 | while IFS= read -r line; do
  # Capture LOGIN_ERROR events
  if echo "$line" | grep -q "type=\"LOGIN_ERROR\""; then
    ERROR_TYPE=$(echo "$line" | grep -oP 'error="[^"]*"' | cut -d'"' -f2)
    CLIENT_ID=$(echo "$line" | grep -oP 'clientId="[^"]*"' | cut -d'"' -f2)
    REDIRECT=$(echo "$line" | grep -oP 'redirect_uri="[^"]*"' | cut -d'"' -f2 || echo "none")
    
    echo "[ERROR] $ERROR_TYPE | client=$CLIENT_ID"
    log_event "usa-login-error" "Login error detected" "{\"error\":\"$ERROR_TYPE\",\"clientId\":\"$CLIENT_ID\",\"redirectUri\":\"$REDIRECT\"}"
  fi
  
  # Capture IDENTITY_PROVIDER events
  if echo "$line" | grep -q "type=\"IDENTITY_PROVIDER"; then
    EVENT_TYPE=$(echo "$line" | grep -oP 'type="[^"]*"' | cut -d'"' -f2)
    echo "[IDP EVENT] $EVENT_TYPE"
    log_event "usa-idp-event" "Identity provider event" "{\"eventType\":\"$EVENT_TYPE\"}"
  fi
  
  # Capture generic ERROR or WARN
  if echo "$line" | grep -qE "(ERROR|Exception|Failed)"; then
    echo "[LOG] $line"
    SAFE_LINE=$(echo "$line" | sed 's/"/\\"/g' | head -c 500)
    log_event "usa-error-log" "Error in logs" "{\"log\":\"$SAFE_LINE\"}"
  fi
  
  # Capture token exchange
  if echo "$line" | grep -q "token"; then
    echo "[TOKEN] Token-related event"
    log_event "usa-token" "Token event" "{\"detected\":true}"
  fi
done &

USA_PID=$!

# Also monitor GBR logs in parallel
docker logs -f --tail 0 gbr-keycloak-gbr-1 2>&1 | while IFS= read -r line; do
  # Capture LOGIN events
  if echo "$line" | grep -q "type=\"LOGIN\""; then
    EVENT_TYPE=$(echo "$line" | grep -oP 'type="[^"]*"' | cut -d'"' -f2)
    USERNAME=$(echo "$line" | grep -oP 'username="[^"]*"' | cut -d'"' -f2 || echo "unknown")
    echo "[GBR] $EVENT_TYPE | user=$USERNAME"
    log_event "gbr-login" "GBR login event" "{\"eventType\":\"$EVENT_TYPE\",\"username\":\"$USERNAME\"}"
  fi
  
  # Capture LOGIN_ERROR
  if echo "$line" | grep -q "type=\"LOGIN_ERROR\""; then
    ERROR=$(echo "$line" | grep -oP 'error="[^"]*"' | cut -d'"' -f2)
    USERNAME=$(echo "$line" | grep -oP 'username="[^"]*"' | cut -d'"' -f2 || echo "unknown")
    echo "[GBR ERROR] $ERROR | user=$USERNAME"
    log_event "gbr-login-error" "GBR login error" "{\"error\":\"$ERROR\",\"username\":\"$USERNAME\"}"
  fi
  
  # Capture authorization code events
  if echo "$line" | grep -q "CODE_TO_TOKEN"; then
    echo "[GBR] Code to token exchange"
    log_event "gbr-code-exchange" "Authorization code exchange" "{\"detected\":true}"
  fi
done &

GBR_PID=$!

# Wait for user interrupt
trap "kill $USA_PID $GBR_PID 2>/dev/null; exit" INT TERM

wait
