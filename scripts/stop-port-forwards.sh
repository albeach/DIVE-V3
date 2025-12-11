#!/bin/bash
# =============================================================================
# DIVE V3 - Stop Port Forwards
# =============================================================================

echo "Stopping all kubectl port-forward processes..."
pkill -f "kubectl port-forward" || echo "No port forwards running"
echo "✅ Port forwards stopped"








