#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Analyze Federation Flow Logs
# =============================================================================
# Run this AFTER the monitor script to analyze captured events
# =============================================================================

LOG_FILE="/Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/.cursor/debug.log"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         Federation Flow Analysis                             ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

if [ ! -f "$LOG_FILE" ] || [ ! -s "$LOG_FILE" ]; then
  echo "❌ No log data captured"
  echo "   Make sure you ran monitor-federation-flow.sh while testing"
  exit 1
fi

# Count events
TOTAL_EVENTS=$(grep -c "runId" "$LOG_FILE" || echo "0")
ERROR_EVENTS=$(grep -c "error" "$LOG_FILE" || echo "0")
USA_EVENTS=$(grep -c "usa-" "$LOG_FILE" || echo "0")
GBR_EVENTS=$(grep -c "gbr-" "$LOG_FILE" || echo "0")

echo "Event Summary:"
echo "  Total events: $TOTAL_EVENTS"
echo "  Errors: $ERROR_EVENTS"
echo "  USA Hub events: $USA_EVENTS"
echo "  GBR events: $GBR_EVENTS"
echo ""

if [ "$ERROR_EVENTS" -gt 0 ]; then
  echo "❌ Errors Detected:"
  echo "═══════════════════════════════════════════════════════════════"
  jq -r 'select(.message | contains("error") or contains("Error")) | 
    "[\(.location)] \(.message): \(.data)"' "$LOG_FILE" 2>/dev/null || cat "$LOG_FILE" | grep error
  echo ""
fi

echo "Chronological Event Flow:"
echo "═══════════════════════════════════════════════════════════════"
jq -r '"\(.timestamp) | \(.location | ljust(20)) | \(.message)"' "$LOG_FILE" 2>/dev/null | sort -n || cat "$LOG_FILE"

echo ""
echo "Complete log file: $LOG_FILE"
