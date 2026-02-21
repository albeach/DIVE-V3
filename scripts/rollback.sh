#!/bin/bash
# =============================================================================
# DIVE V3 - Kubernetes Rollback Script
# =============================================================================
# Automated rollback for blue-green deployments
# =============================================================================

set -euo pipefail

NAMESPACE="${NAMESPACE:-dive-v3}"
DEPLOYMENT="${DEPLOYMENT:-frontend}"
COLOR="${COLOR:-blue}"

echo "🔄 Rolling back ${DEPLOYMENT} deployment in namespace ${NAMESPACE}..."

# Get current deployment
CURRENT_DEPLOYMENT="${DEPLOYMENT}-${COLOR}"

# Determine target color (opposite of current)
if [ "${COLOR}" == "blue" ]; then
    TARGET_COLOR="green"
else
    TARGET_COLOR="blue"
fi

TARGET_DEPLOYMENT="${DEPLOYMENT}-${TARGET_COLOR}"

# Check if target deployment exists
if ! kubectl get deployment "${TARGET_DEPLOYMENT}" -n "${NAMESPACE}" &>/dev/null; then
    echo "❌ Target deployment ${TARGET_DEPLOYMENT} does not exist"
    exit 1
fi

# Scale up target deployment
echo "📈 Scaling up ${TARGET_DEPLOYMENT}..."
kubectl scale deployment "${TARGET_DEPLOYMENT}" -n "${NAMESPACE}" --replicas=2

# Wait for target deployment to be ready
echo "⏳ Waiting for ${TARGET_DEPLOYMENT} to be ready..."
kubectl wait --for=condition=available --timeout=300s deployment/"${TARGET_DEPLOYMENT}" -n "${NAMESPACE}"

# Update service to point to target deployment
echo "🔀 Switching service to ${TARGET_DEPLOYMENT}..."
kubectl patch service "${DEPLOYMENT}" -n "${NAMESPACE}" -p "{\"spec\":{\"selector\":{\"version\":\"${TARGET_COLOR}\"}}}"

# Scale down current deployment
echo "📉 Scaling down ${CURRENT_DEPLOYMENT}..."
kubectl scale deployment "${CURRENT_DEPLOYMENT}" -n "${NAMESPACE}" --replicas=0

echo "✅ Rollback complete: ${DEPLOYMENT} now using ${TARGET_COLOR} deployment"
