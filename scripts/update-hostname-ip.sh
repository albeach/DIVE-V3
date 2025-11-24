#!/bin/bash

###############################################################################
# Update /etc/hosts with Current IP Address
###############################################################################
# This script updates the IP address for a hostname in /etc/hosts
# Useful when your server IP changes (e.g., moving between networks)
###############################################################################

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                                                                ║${NC}"
echo -e "${BLUE}║       DIVE V3 - Update Hostname IP Address                    ║${NC}"
echo -e "${BLUE}║                                                                ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Get current IP
CURRENT_IP=$(ip route get 1 2>/dev/null | awk '{print $7}' | head -1)

if [ -z "$CURRENT_IP" ]; then
    echo -e "${RED}✗ Could not detect current IP address${NC}"
    echo ""
    read -p "Enter your server's IP address manually: " CURRENT_IP
    echo ""
fi

echo -e "${CYAN}Current server IP: ${GREEN}${CURRENT_IP}${NC}"
echo ""

# Check if there are any custom hostnames in /etc/hosts
echo "Scanning /etc/hosts for DIVE hostnames..."
echo ""

# Find potential DIVE hostnames (exclude standard entries)
DIVE_HOSTNAMES=$(grep -v "^#" /etc/hosts | grep -v "^127\." | grep -v "^::1" | grep -v "localhost" | awk '{print $2}' | grep -v "^$" || true)

if [ -z "$DIVE_HOSTNAMES" ]; then
    echo -e "${YELLOW}⚠️  No custom hostnames found in /etc/hosts${NC}"
    echo ""
    echo "If you're using a custom hostname, you can add it:"
    read -p "Enter hostname to add (or press Enter to skip): " NEW_HOSTNAME
    
    if [ -n "$NEW_HOSTNAME" ]; then
        echo "$CURRENT_IP $NEW_HOSTNAME" | sudo tee -a /etc/hosts > /dev/null
        echo -e "${GREEN}✓${NC} Added: $CURRENT_IP $NEW_HOSTNAME"
    fi
    exit 0
fi

echo "Found custom hostnames:"
echo ""

# Display all found hostnames with their current IPs
COUNTER=1
declare -A HOSTNAME_MAP
while IFS= read -r hostname; do
    EXISTING_IP=$(grep "$hostname" /etc/hosts | grep -v "^#" | awk '{print $1}' | head -1)
    echo -e "  ${GREEN}${COUNTER})${NC} $hostname"
    echo -e "     Current IP in /etc/hosts: ${CYAN}$EXISTING_IP${NC}"
    
    if [ "$EXISTING_IP" != "$CURRENT_IP" ]; then
        echo -e "     ${YELLOW}⚠️  MISMATCH! Should be: $CURRENT_IP${NC}"
    else
        echo -e "     ${GREEN}✓ Correct${NC}"
    fi
    echo ""
    
    HOSTNAME_MAP[$COUNTER]="$hostname:$EXISTING_IP"
    COUNTER=$((COUNTER + 1))
done <<< "$DIVE_HOSTNAMES"

# Ask which hostname to update
echo ""
echo "Options:"
echo -e "  ${GREEN}1-${COUNTER})${NC} Update a specific hostname"
echo -e "  ${GREEN}a)${NC} Update ALL mismatched hostnames"
echo -e "  ${GREEN}q)${NC} Quit without changes"
echo ""
read -p "Selection: " SELECTION

if [ "$SELECTION" == "q" ] || [ "$SELECTION" == "Q" ]; then
    echo "No changes made."
    exit 0
fi

# Function to update a hostname
update_hostname() {
    local hostname=$1
    local old_ip=$2
    
    echo ""
    echo -e "${CYAN}Updating: $hostname${NC}"
    echo "  Old IP: $old_ip"
    echo "  New IP: $CURRENT_IP"
    
    # Create backup
    sudo cp /etc/hosts /etc/hosts.bak.$(date +%Y%m%d_%H%M%S)
    
    # Remove old entry
    sudo sed -i.tmp "/$hostname/d" /etc/hosts
    
    # Add new entry
    echo "$CURRENT_IP $hostname" | sudo tee -a /etc/hosts > /dev/null
    
    echo -e "${GREEN}✓${NC} Updated $hostname: $old_ip → $CURRENT_IP"
}

# Process selection
if [ "$SELECTION" == "a" ] || [ "$SELECTION" == "A" ]; then
    echo ""
    echo -e "${YELLOW}Updating ALL mismatched hostnames...${NC}"
    
    for key in "${!HOSTNAME_MAP[@]}"; do
        IFS=':' read -r hostname old_ip <<< "${HOSTNAME_MAP[$key]}"
        
        if [ "$old_ip" != "$CURRENT_IP" ]; then
            update_hostname "$hostname" "$old_ip"
        fi
    done
    
elif [[ "$SELECTION" =~ ^[0-9]+$ ]] && [ "$SELECTION" -lt "$COUNTER" ]; then
    IFS=':' read -r hostname old_ip <<< "${HOSTNAME_MAP[$SELECTION]}"
    
    if [ "$old_ip" == "$CURRENT_IP" ]; then
        echo ""
        echo -e "${GREEN}✓${NC} $hostname already has correct IP: $CURRENT_IP"
        echo "No changes needed."
    else
        update_hostname "$hostname" "$old_ip"
    fi
else
    echo -e "${RED}Invalid selection${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✓ Update Complete!${NC}"
echo ""
echo "Current /etc/hosts entries:"
echo ""
grep -v "^#" /etc/hosts | grep -v "^127\." | grep -v "^::1" | grep "$CURRENT_IP" || echo "  (none)"
echo ""
echo -e "${YELLOW}⚠️  Remember: You also need to update /etc/hosts on YOUR CLIENT machine!${NC}"
echo ""
echo -e "${CYAN}On your browser machine (Linux/Mac):${NC}"
echo -e "${GREEN}  echo \"${CURRENT_IP} <hostname>\" | sudo tee -a /etc/hosts${NC}"
echo ""
echo -e "${CYAN}On your browser machine (Windows, as Administrator):${NC}"
echo -e "${GREEN}  echo ${CURRENT_IP} <hostname> >> C:\\Windows\\System32\\drivers\\etc\\hosts${NC}"
echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo ""


