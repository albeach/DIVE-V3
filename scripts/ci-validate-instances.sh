#!/usr/bin/env bash
# =============================================================================
# CI Validation: Instance Configuration Consistency
# =============================================================================
# Run this script in CI pipelines to catch configuration drift before merge.
#
# Usage:
#   ./scripts/ci-validate-instances.sh
#
# Exit codes:
#   0 - All checks passed
#   1 - Configuration drift detected
#
# =============================================================================

set -euo pipefail

# Determine script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIVE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== DIVE V3 Instance Configuration CI Validation ==="
echo ""

# Configuration
LINE_COUNT_MIN=240
LINE_COUNT_MAX=260
EXPECTED_NETWORK="dive-v3-shared-network"
INSTANCES_DIR="$DIVE_ROOT/instances"

# Counters
total_checked=0
compose_issues=0
network_issues=0
extends_issues=0

echo "Checking docker-compose.yml files..."
echo ""

for dir in "$INSTANCES_DIR"/*/; do
    code=$(basename "$dir")

    # Skip hub and shared
    if [ "$code" = "hub" ] || [ "$code" = "shared" ]; then
        continue
    fi

    compose="$dir/docker-compose.yml"

    # Skip if no docker-compose.yml
    if [ ! -f "$compose" ]; then
        continue
    fi

    total_checked=$((total_checked + 1))
    code_upper=$(echo "$code" | tr '[:lower:]' '[:upper:]')

    # Check line count
    line_count=$(wc -l < "$compose" | tr -d ' ')
    if [ "$line_count" -lt "$LINE_COUNT_MIN" ] || [ "$line_count" -gt "$LINE_COUNT_MAX" ]; then
        echo "✗ $code_upper: Line count $line_count not in range [$LINE_COUNT_MIN-$LINE_COUNT_MAX]"
        compose_issues=$((compose_issues + 1))
    fi

    # Check network name
    if ! grep -q "$EXPECTED_NETWORK" "$compose" 2>/dev/null; then
        echo "✗ $code_upper: Missing external network $EXPECTED_NETWORK"
        network_issues=$((network_issues + 1))
    fi

    # Check for extends pattern
    if ! grep -q "extends:" "$compose" 2>/dev/null; then
        echo "✗ $code_upper: Not using extends pattern"
        extends_issues=$((extends_issues + 1))
    fi
done

total_issues=$((compose_issues + network_issues + extends_issues))

echo ""
echo "=== Summary ==="
echo "Instances checked:  $total_checked"
echo "Line count issues:  $compose_issues"
echo "Network issues:     $network_issues"
echo "Extends issues:     $extends_issues"
echo "Total issues:       $total_issues"
echo ""

if [ $total_issues -eq 0 ]; then
    echo "✓ All configuration checks passed!"
    exit 0
else
    echo "✗ Configuration drift detected!"
    echo ""
    echo "To fix, run: ./dive spoke regenerate --all"
    exit 1
fi

