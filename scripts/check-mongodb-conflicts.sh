#!/bin/bash
# =============================================================================
# DIVE V3 - MongoDB Port Conflict Checker
# =============================================================================
# Checks for local MongoDB installations that might conflict with Docker containers.
#
# This script is called automatically by startup scripts to ensure Docker MongoDB
# containers can bind to their ports without conflicts.
#
# =============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Ports used by DIVE V3 MongoDB instances
MONGO_PORTS=(27017 27018 27019)

check_port() {
    local port=$1
    local conflicts=$(lsof -i :$port 2>/dev/null | grep -v "com.docke" | grep "LISTEN" || true)
    
    if [[ -n "$conflicts" ]]; then
        echo -e "${RED}❌ Port $port conflict detected!${NC}"
        echo "$conflicts"
        return 1
    fi
    return 0
}

stop_local_mongodb() {
    echo -e "${YELLOW}Attempting to stop local MongoDB...${NC}"
    
    # Try Homebrew service first
    if command -v brew &>/dev/null; then
        brew services stop mongodb-community 2>/dev/null && {
            echo -e "${GREEN}✅ Stopped mongodb-community via Homebrew${NC}"
            return 0
        }
    fi
    
    # Try systemd (Linux)
    if command -v systemctl &>/dev/null; then
        sudo systemctl stop mongod 2>/dev/null && {
            echo -e "${GREEN}✅ Stopped mongod via systemctl${NC}"
            return 0
        }
    fi
    
    # Kill any remaining mongod processes
    pkill -f "mongod" 2>/dev/null && {
        echo -e "${GREEN}✅ Killed mongod processes${NC}"
        return 0
    }
    
    return 1
}

main() {
    echo "🔍 Checking for MongoDB port conflicts..."
    
    local has_conflicts=false
    
    for port in "${MONGO_PORTS[@]}"; do
        if ! check_port "$port"; then
            has_conflicts=true
        fi
    done
    
    if [[ "$has_conflicts" == "true" ]]; then
        echo ""
        echo -e "${YELLOW}⚠️  Local MongoDB is running and will conflict with Docker containers!${NC}"
        echo ""
        
        if [[ "$1" == "--auto-fix" ]]; then
            stop_local_mongodb
            sleep 2
            
            # Recheck
            has_conflicts=false
            for port in "${MONGO_PORTS[@]}"; do
                if ! check_port "$port"; then
                    has_conflicts=true
                fi
            done
            
            if [[ "$has_conflicts" == "true" ]]; then
                echo -e "${RED}❌ Could not resolve port conflicts automatically.${NC}"
                echo "Please manually stop the conflicting processes and try again."
                exit 1
            fi
        else
            echo "To fix this, run one of:"
            echo "  1. brew services stop mongodb-community"
            echo "  2. sudo systemctl stop mongod"
            echo "  3. $0 --auto-fix"
            echo ""
            exit 1
        fi
    fi
    
    echo -e "${GREEN}✅ No MongoDB port conflicts detected${NC}"
    exit 0
}

main "$@"


