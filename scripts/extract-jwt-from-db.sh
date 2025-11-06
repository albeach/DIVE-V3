#!/bin/bash

###############################################################################
# Extract JWT Token from Database Session (for diagnostic purposes)
###############################################################################
# This script extracts the actual JWT token from the PostgreSQL database
# where NextAuth stores it when using database session strategy.
###############################################################################

set -euo pipefail

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}═══════════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}║  JWT Token Extractor (Database Session Strategy)                 ║${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════════${NC}"
echo ""

# Check if we're in the project root
if [ ! -f docker-compose.yml ]; then
    echo -e "${RED}Error: docker-compose.yml not found${NC}"
    echo "Please run this script from the DIVE V3 project root"
    exit 1
fi

echo -e "${YELLOW}This script will extract JWT tokens from the PostgreSQL database.${NC}"
echo ""
echo "Available options:"
echo "  1. Extract ALL active sessions (shows all logged-in users)"
echo "  2. Extract by user email"
echo "  3. Extract most recent session"
echo ""
read -p "Choose option (1-3): " OPTION

echo ""

case $OPTION in
    1)
        echo -e "${CYAN}Fetching all active sessions...${NC}"
        echo ""
        
        docker compose exec -T postgres psql -U postgres -d dive_v3_app <<EOF
SELECT 
    s."sessionToken" as session_token,
    u.email,
    u.name,
    s.expires,
    CASE 
        WHEN s.expires > NOW() THEN 'Active'
        ELSE 'Expired'
    END as status
FROM session s
JOIN "user" u ON s."userId" = u.id
ORDER BY s.expires DESC;
EOF
        ;;
        
    2)
        read -p "Enter user email: " USER_EMAIL
        echo ""
        echo -e "${CYAN}Fetching session for $USER_EMAIL...${NC}"
        echo ""
        
        TOKEN=$(docker compose exec -T postgres psql -U postgres -d dive_v3_app -t -c \
            "SELECT s.\"sessionToken\" FROM session s JOIN \"user\" u ON s.\"userId\" = u.id WHERE u.email = '$USER_EMAIL' AND s.expires > NOW() ORDER BY s.expires DESC LIMIT 1;")
        
        TOKEN=$(echo "$TOKEN" | tr -d ' \n\r')
        
        if [ -n "$TOKEN" ] && [ "$TOKEN" != "" ]; then
            echo -e "${GREEN}✓ Token found!${NC}"
            echo ""
            echo "Session Token (use this in diagnostic script):"
            echo "$TOKEN"
            echo ""
            echo "Token saved to: extracted-token.txt"
            echo "$TOKEN" > extracted-token.txt
            
            # Try to decode it
            echo ""
            echo -e "${CYAN}Attempting to decode token...${NC}"
            
            # Check if it's a JWT (starts with eyJ)
            if [[ "$TOKEN" == eyJ* ]]; then
                echo -e "${GREEN}✓ Token appears to be a JWT${NC}"
                echo ""
                echo "Issuer:"
                echo "$TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null | jq -r '.iss' || echo "  Failed to decode"
                echo ""
                echo "Full payload:"
                echo "$TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null | jq . || echo "  Failed to decode"
            else
                echo -e "${YELLOW}⚠ Token doesn't appear to be a JWT (doesn't start with eyJ)${NC}"
                echo "This may be a session ID. NextAuth might be storing session ID instead of JWT."
            fi
        else
            echo -e "${YELLOW}⚠ No active session found for $USER_EMAIL${NC}"
        fi
        ;;
        
    3)
        echo -e "${CYAN}Fetching most recent active session...${NC}"
        echo ""
        
        RESULT=$(docker compose exec -T postgres psql -U postgres -d dive_v3_app -t <<EOF
SELECT 
    u.email || '|' || s."sessionToken"
FROM session s
JOIN "user" u ON s."userId" = u.id
WHERE s.expires > NOW()
ORDER BY s.expires DESC
LIMIT 1;
EOF
)
        
        USER_EMAIL=$(echo "$RESULT" | cut -d'|' -f1 | tr -d ' \n\r')
        TOKEN=$(echo "$RESULT" | cut -d'|' -f2 | tr -d ' \n\r')
        
        if [ -n "$TOKEN" ] && [ "$TOKEN" != "" ]; then
            echo -e "${GREEN}✓ Token found for user: $USER_EMAIL${NC}"
            echo ""
            echo "Session Token (use this in diagnostic script):"
            echo "$TOKEN"
            echo ""
            echo "Token saved to: extracted-token.txt"
            echo "$TOKEN" > extracted-token.txt
            
            # Try to decode it
            echo ""
            echo -e "${CYAN}Attempting to decode token...${NC}"
            
            # Check if it's a JWT (starts with eyJ)
            if [[ "$TOKEN" == eyJ* ]]; then
                echo -e "${GREEN}✓ Token appears to be a JWT${NC}"
                echo ""
                echo "Issuer:"
                echo "$TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null | jq -r '.iss' || echo "  Failed to decode"
                echo ""
                echo "ACR:"
                echo "$TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null | jq -r '.acr' || echo "  N/A"
                echo ""
                echo "AMR:"
                echo "$TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null | jq -r '.amr' || echo "  N/A"
            else
                echo -e "${YELLOW}⚠ Token doesn't appear to be a JWT (doesn't start with eyJ)${NC}"
                echo "This is likely a NextAuth session ID, not the actual Keycloak JWT."
                echo ""
                echo -e "${CYAN}NextAuth Database Strategy Behavior:${NC}"
                echo "  • NextAuth stores a session ID in the database"
                echo "  • The actual Keycloak JWT is stored in NextAuth's internal cache"
                echo "  • JWT is retrieved server-side and sent to backend API"
                echo ""
                echo -e "${YELLOW}To get the actual JWT, you need to:${NC}"
                echo "  1. Check backend API logs when you make a request"
                echo "  2. Or use the Network tab method (if JWT is in Authorization header)"
            fi
        else
            echo -e "${YELLOW}⚠ No active sessions found${NC}"
        fi
        ;;
        
    *)
        echo "Invalid option"
        exit 1
        ;;
esac

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Done!${NC}"
echo ""

