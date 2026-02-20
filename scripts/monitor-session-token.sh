#!/usr/bin/env bash
# Real-time monitoring for session token validation
# Run this while testing in the browser

cd "$(dirname "$0")/.." || exit 1

echo "========================================="
echo "Monitoring Session Token Validation"
echo "========================================="
echo ""
echo "Watching for:"
echo "  - SessionValidation events"
echo "  - Token refresh attempts"
echo "  - Resource API calls"
echo "  - 401 errors"
echo ""
echo "Press Ctrl+C to stop"
echo ""

./dive logs frontend --follow 2>&1 | grep --line-buffered -E "SessionValidation|getSessionTokens|refreshAccessToken|ResourcesAPI|SearchAPI|401|Unauthorized|Invalid.*JWT|GET /api/resources|POST /api/resources" | while read -r line; do
    echo "[$(date '+%H:%M:%S')] $line"
done
