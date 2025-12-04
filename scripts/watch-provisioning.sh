#!/bin/bash
# Simple watch script for provisioning resources

watch -n 3 '
echo "=== PODS ==="
kubectl get pods --all-namespaces | grep dive-v3 | grep -v Completed
echo ""
echo "=== PVCs ==="
kubectl get pvc --all-namespaces | grep dive-v3
echo ""
echo "=== SSL CERTIFICATE ==="
kubectl get managedcertificate -n dive-v3 2>/dev/null || echo "Not found"
echo ""
echo "=== RECENT EVENTS ==="
kubectl get events --all-namespaces --sort-by=.lastTimestamp | grep dive-v3 | tail -5
'
