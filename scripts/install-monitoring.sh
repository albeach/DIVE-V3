#!/bin/bash
# =============================================================================
# DIVE V3 - Install Monitoring Stack (Prometheus + Grafana)
# =============================================================================
# Installs Prometheus Operator, Grafana, and configures monitoring for DIVE V3
# =============================================================================

set -euo pipefail

NAMESPACE="monitoring"
RELEASE_NAME="kube-prometheus-stack"
CHART_REPO="https://prometheus-community.github.io/helm-charts"
CHART_NAME="kube-prometheus-stack"
CHART_VERSION="59.0.0"  # Latest stable version

echo "=============================================================================="
echo "DIVE V3 - Installing Monitoring Stack"
echo "=============================================================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check if Helm is installed
if ! command -v helm &> /dev/null; then
    echo -e "${RED}Error: Helm is not installed${NC}"
    echo "Install Helm: https://helm.sh/docs/intro/install/"
    exit 1
fi

# Check if kubectl is configured
if ! kubectl cluster-info &> /dev/null; then
    echo -e "${RED}Error: kubectl is not configured or cluster is not accessible${NC}"
    exit 1
fi

echo "Step 1: Creating monitoring namespace..."
kubectl create namespace $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -
echo ""

echo "Step 2: Adding Prometheus Helm repository..."
helm repo add prometheus-community $CHART_REPO
helm repo update
echo ""

echo "Step 3: Installing Prometheus Operator..."
if helm list -n $NAMESPACE | grep -q $RELEASE_NAME; then
    echo "Upgrading existing installation..."
    helm upgrade $RELEASE_NAME prometheus-community/$CHART_NAME \
        --version $CHART_VERSION \
        --namespace $NAMESPACE \
        --values k8s/monitoring/prometheus-operator-values.yaml \
        --wait \
        --timeout 10m
else
    echo "Installing new release..."
    helm install $RELEASE_NAME prometheus-community/$CHART_NAME \
        --version $CHART_VERSION \
        --namespace $NAMESPACE \
        --values k8s/monitoring/prometheus-operator-values.yaml \
        --wait \
        --timeout 10m
fi

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Prometheus Operator installed successfully${NC}"
else
    echo -e "${RED}❌ Prometheus Operator installation failed${NC}"
    exit 1
fi
echo ""

echo "Step 4: Waiting for Prometheus Operator to be ready..."
kubectl wait --for=condition=ready pod \
    -l app.kubernetes.io/name=prometheus-operator \
    -n $NAMESPACE \
    --timeout=5m || echo "Warning: Some pods may still be initializing"
echo ""

echo "Step 5: Applying ServiceMonitors..."
kubectl apply -f k8s/monitoring/servicemonitor-backend.yaml
kubectl apply -f k8s/monitoring/servicemonitor-frontend.yaml
kubectl apply -f k8s/monitoring/servicemonitor-opa.yaml
echo -e "${GREEN}✅ ServiceMonitors applied${NC}"
echo ""

echo "Step 6: Applying Prometheus Alerting Rules..."
kubectl apply -f k8s/monitoring/prometheusrule-dive-v3.yaml
echo -e "${GREEN}✅ Alerting rules applied${NC}"
echo ""

echo "Step 7: Checking pod status..."
kubectl get pods -n $NAMESPACE
echo ""

echo "Step 8: Getting service endpoints..."
kubectl get svc -n $NAMESPACE
echo ""

echo "=============================================================================="
echo "Monitoring Stack Installation Complete!"
echo "=============================================================================="
echo ""
echo "Access Grafana:"
echo "  kubectl port-forward -n $NAMESPACE svc/$RELEASE_NAME-grafana 3000:80"
echo "  Then visit: http://localhost:3000"
echo "  Default credentials: admin / admin"
echo ""
echo "Access Prometheus:"
echo "  kubectl port-forward -n $NAMESPACE svc/$RELEASE_NAME-prometheus 9090:9090"
echo "  Then visit: http://localhost:9090"
echo ""
echo "Access Alertmanager:"
echo "  kubectl port-forward -n $NAMESPACE svc/$RELEASE_NAME-alertmanager 9093:9093"
echo "  Then visit: http://localhost:9093"
echo ""
