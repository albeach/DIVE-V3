#!/usr/bin/env bash
# ============================================
# DIVE V3 - Encryption at Rest Verification
# ============================================
# Verifies disk encryption across federated nodes
# 
# Usage: ./scripts/security/verify-encryption-at-rest.sh [host]
#        ./scripts/security/verify-encryption-at-rest.sh all
#
# ============================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Known federated nodes (Bash 3.x compatible)
# Format: "instance:host"
FEDERATED_NODES=(
    "usa:localhost"
    "fra:localhost"
    "deu:mike@192.168.42.120"
    # Add more nodes as they're deployed:
    # "gbr:user@gbr-server.example.com"
    # "can:user@can-server.example.com"
)

# Helper function to get host for instance
get_host() {
    local instance="$1"
    for entry in "${FEDERATED_NODES[@]}"; do
        local key="${entry%%:*}"
        local value="${entry#*:}"
        if [[ "$key" == "$instance" ]]; then
            echo "$value"
            return 0
        fi
    done
    return 1
}

echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}🔐 DIVE V3 Encryption at Rest Verification${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# Function to check local macOS encryption
check_macos_encryption() {
    echo -e "${YELLOW}Checking macOS FileVault...${NC}"
    if command -v fdesetup &> /dev/null; then
        status=$(fdesetup status 2>/dev/null || echo "Unknown")
        if echo "$status" | grep -q "FileVault is On"; then
            echo -e "${GREEN}✅ FileVault is ENABLED${NC}"
            fdesetup status
            return 0
        else
            echo -e "${RED}❌ FileVault is NOT enabled${NC}"
            echo "   Run: sudo fdesetup enable"
            return 1
        fi
    else
        echo -e "${YELLOW}⚠️  Not macOS or fdesetup not available${NC}"
        return 2
    fi
}

# Function to check Linux encryption
check_linux_encryption() {
    local host="$1"
    echo -e "${YELLOW}Checking Linux disk encryption on $host...${NC}"
    
    if [[ "$host" == "localhost" ]]; then
        # Local check
        if command -v dmsetup &> /dev/null; then
            encrypted=$(dmsetup status 2>/dev/null | grep -c "crypt" || echo "0")
            if [[ "$encrypted" -gt 0 ]]; then
                echo -e "${GREEN}✅ LUKS encryption detected${NC}"
                dmsetup status 2>/dev/null | grep crypt
                return 0
            fi
        fi
        
        # Check for encrypted volumes
        if lsblk -o NAME,FSTYPE 2>/dev/null | grep -q "crypto_LUKS\|crypt"; then
            echo -e "${GREEN}✅ Encrypted volumes detected${NC}"
            lsblk -o NAME,FSTYPE,SIZE,MOUNTPOINT 2>/dev/null | grep -E "crypt|crypto"
            return 0
        fi
        
        echo -e "${RED}❌ No disk encryption detected${NC}"
        return 1
    else
        # Remote check via SSH
        echo "   Connecting to $host..."
        
        # Try to check encryption remotely
        ssh_result=$(ssh -o ConnectTimeout=10 -o BatchMode=yes "$host" \
            "dmsetup status 2>/dev/null | grep -c crypt || lsblk -o FSTYPE 2>/dev/null | grep -c crypto_LUKS || echo 0" 2>/dev/null) || ssh_result="SSH_FAILED"
        
        if [[ "$ssh_result" == "SSH_FAILED" ]]; then
            echo -e "${RED}❌ Could not connect to $host${NC}"
            echo "   Verify SSH access and try: ssh $host"
            echo -e "${RED}   UNKNOWN STATUS - Treating as AT RISK${NC}"
            return 1  # Return failure for SSH issues (conservative approach)
        elif [[ "$ssh_result" -gt 0 ]]; then
            echo -e "${GREEN}✅ Encryption detected on $host${NC}"
            return 0
        else
            echo -e "${RED}❌ No encryption detected on $host${NC}"
            echo "   SECURITY RISK: Data volumes may be unencrypted!"
            echo ""
            echo "   To enable LUKS encryption:"
            echo "   1. Backup data: ./scripts/backup-all-data.sh"
            echo "   2. Create encrypted volume:"
            echo "      sudo cryptsetup luksFormat /dev/sdX"
            echo "      sudo cryptsetup open /dev/sdX dive-v3-data"
            echo "   3. Mount and restore data"
            return 1
        fi
    fi
}

# Function to verify single node
verify_node() {
    local instance="$1"
    local host="$2"
    local result=0
    
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}Instance: ${instance^^} (${host})${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    if [[ "$host" == "localhost" ]]; then
        # Detect OS
        if [[ "$(uname)" == "Darwin" ]]; then
            check_macos_encryption
            result=$?
        else
            check_linux_encryption "localhost"
            result=$?
        fi
    else
        check_linux_encryption "$host"
        result=$?
    fi
    
    echo ""
    return $result
}

# Main logic
TARGET="${1:-all}"

if [[ "$TARGET" == "all" ]]; then
    echo "Verifying all federated nodes..."
    echo ""
    
    TOTAL=0
    ENCRYPTED=0
    FAILED=0
    
    for entry in "${FEDERATED_NODES[@]}"; do
        instance="${entry%%:*}"
        host="${entry#*:}"
        TOTAL=$((TOTAL + 1))
        
        if verify_node "$instance" "$host"; then
            ENCRYPTED=$((ENCRYPTED + 1))
        else
            FAILED=$((FAILED + 1))
        fi
    done
    
    echo -e "${CYAN}============================================${NC}"
    echo -e "${CYAN}Summary${NC}"
    echo -e "${CYAN}============================================${NC}"
    echo -e "Total Nodes: $TOTAL"
    echo -e "Encrypted:   ${GREEN}$ENCRYPTED${NC}"
    echo -e "At Risk:     ${RED}$FAILED${NC}"
    echo ""
    
    if [[ "$FAILED" -gt 0 ]]; then
        echo -e "${RED}⚠️  WARNING: Some nodes may not have encryption at rest!${NC}"
        echo -e "${RED}   This is a HIGH severity security gap for classified data.${NC}"
        exit 1
    else
        echo -e "${GREEN}✅ All federated nodes have encryption at rest${NC}"
    fi
    
else
    # Check if target is a known instance
    host=$(get_host "$TARGET" 2>/dev/null) || host=""
    if [[ -n "$host" ]]; then
        verify_node "$TARGET" "$host"
    else
        echo "Usage: $0 [instance|all]"
        echo ""
        echo "Known instances:"
        for entry in "${FEDERATED_NODES[@]}"; do
            instance="${entry%%:*}"
            host="${entry#*:}"
            echo "  - $instance ($host)"
        done
        exit 1
    fi
fi

