#!/bin/bash
# =============================================================================
# DIVE V3 - Monitor Resources During Provisioning
# =============================================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

clear
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     DIVE V3 - Resource Provisioning Monitor              ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Function to print section header
print_section() {
    echo -e "\n${YELLOW}=== $1 ===${NC}"
}

# Function to count resources
count_resources() {
    local ns=$1
    local resource=$2
    local status=$3
    kubectl get $resource -n $ns --no-headers 2>/dev/null | grep -c "$status" || echo "0"
}

# Check all instances
INSTANCES=("dive-v3:USA" "dive-v3-fra:FRA" "dive-v3-gbr:GBR" "dive-v3-deu:DEU")

for instance_info in "${INSTANCES[@]}"; do
    IFS=':' read -r ns name <<< "$instance_info"
    
    print_section "$name Instance ($ns)"
    
    # Pods
    total_pods=$(kubectl get pods -n $ns --no-headers 2>/dev/null | wc -l | tr -d ' ')
    running=$(count_resources $ns pods "Running")
    pending=$(count_resources $ns pods "Pending")
    init=$(kubectl get pods -n $ns --no-headers 2>/dev/null | grep -c "Init" || echo "0")
    
    echo "Pods:"
    echo -e "  Total:   $total_pods"
    echo -e "  ${GREEN}Running: $running${NC}"
    echo -e "  ${YELLOW}Pending: $pending${NC}"
    echo -e "  ${YELLOW}Init:    $init${NC}"
    
    # PVCs
    total_pvcs=$(kubectl get pvc -n $ns --no-headers 2>/dev/null | wc -l | tr -d ' ')
    bound=$(count_resources $ns pvc "Bound")
    pending_pvc=$(count_resources $ns pvc "Pending")
    
    echo "PVCs:"
    echo -e "  Total:   $total_pvcs"
    echo -e "  ${GREEN}Bound:   $bound${NC}"
    echo -e "  ${YELLOW}Pending: $pending_pvc${NC}"
    
    # Show pending pods
    if [ "$pending" -gt 0 ] || [ "$init" -gt 0 ]; then
        echo ""
        echo "Pending/Init Pods:"
        kubectl get pods -n $ns --no-headers 2>/dev/null | grep -E "Pending|Init" | while read line; do
            pod_name=$(echo $line | awk '{print $1}')
            status=$(echo $line | awk '{print $3}')
            echo -e "  ${YELLOW}$pod_name: $status${NC}"
        done
    fi
    
    # Show pending PVCs
    if [ "$pending_pvc" -gt 0 ]; then
        echo ""
        echo "Pending PVCs:"
        kubectl get pvc -n $ns --no-headers 2>/dev/null | grep "Pending" | while read line; do
            pvc_name=$(echo $line | awk '{print $1}')
            echo -e "  ${YELLOW}$pvc_name${NC}"
        done
    fi
done

# SSL Certificate
print_section "SSL Certificate"
cert_status=$(kubectl get managedcertificate -n dive-v3 dive-v3-ssl-cert -o jsonpath='{.status.certificateStatus}' 2>/dev/null || echo "NOT_FOUND")
if [ "$cert_status" == "Active" ]; then
    echo -e "  Status: ${GREEN}$cert_status${NC}"
elif [ "$cert_status" == "Provisioning" ]; then
    echo -e "  Status: ${YELLOW}$cert_status${NC}"
else
    echo -e "  Status: ${RED}$cert_status${NC}"
fi

# Ingress
print_section "Ingress"
ingress_ip=$(kubectl get ingress -n dive-v3 dive-v3-ingress -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "N/A")
echo "  IP Address: $ingress_ip"

# Recent Events
print_section "Recent Events (Last 5)"
kubectl get events --all-namespaces --sort-by=.lastTimestamp 2>/dev/null | grep dive-v3 | tail -5 | while read line; do
    event_time=$(echo $line | awk '{print $1, $2}')
    event_type=$(echo $line | awk '{print $3}')
    event_obj=$(echo $line | awk '{print $4}')
    event_msg=$(echo $line | cut -d' ' -f5-)
    
    if [ "$event_type" == "Warning" ]; then
        echo -e "  ${RED}[$event_time] $event_type: $event_obj - $event_msg${NC}"
    else
        echo -e "  ${GREEN}[$event_time] $event_type: $event_obj - $event_msg${NC}"
    fi
done

echo ""
echo -e "${BLUE}Press Ctrl+C to exit. Refreshing every 5 seconds...${NC}"
