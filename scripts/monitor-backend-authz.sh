#!/usr/bin/env bash
# Monitor backend authorization decisions in real-time
# Run this in one terminal while testing

cd "$(dirname "$0")/.."

echo "========================================="
echo "Monitoring Backend Authorization"
echo "========================================="
echo ""
echo "Watching for:"
echo "  - Resource requests"
echo "  - OPA decisions"
echo "  - Authorization results"
echo "  - Clearance checks"
echo ""
echo "Press Ctrl+C to stop"
echo ""

./dive logs backend --follow 2>&1 | grep --line-buffered -E "GET /api/resources|POST /api/resources|OPA.*decision|Authorization.*decision|clearance|RESTRICTED|00228|allow.*true|allow.*false" | while read -r line; do
    echo "[$(date '+%H:%M:%S')] $line"
done
