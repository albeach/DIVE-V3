#!/usr/bin/env bash
# Dynamic Trusted Issuer Generator
# Generates trusted_issuers configuration from environment variables
# This enables dynamic, per-deployment configuration without hardcoding

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

OUTPUT_FILE="${1:-$PROJECT_ROOT/policies/data/trusted-issuers.json}"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  DIVE V3 - Dynamic Trusted Issuer Generator${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo ""

# Read configuration from environment or defaults
INSTANCE="${DIVE_INSTANCE:-USA}"
INSTANCE_LOWER="$(echo "$INSTANCE" | tr '[:upper:]' '[:lower:]')"
KEYCLOAK_URL="${KEYCLOAK_URL:-https://localhost:8443}"
KEYCLOAK_REALM="${KEYCLOAK_REALM:-dive-v3-broker-${INSTANCE_LOWER}}"
TRUST_LEVEL="${TRUST_LEVEL:-DEVELOPMENT}"

# Parse KEYCLOAK_URL to extract protocol, host, port
if [[ "$KEYCLOAK_URL" =~ ^(https?://)([^:]+):?([0-9]+)?$ ]]; then
    PROTOCOL="${BASH_REMATCH[1]}"
    HOST="${BASH_REMATCH[2]}"
    PORT="${BASH_REMATCH[3]:-8443}"
else
    echo -e "${YELLOW}⚠️  Could not parse KEYCLOAK_URL: $KEYCLOAK_URL${NC}"
    PROTOCOL="https://"
    HOST="localhost"
    PORT="8443"
fi

ISSUER_URL="${PROTOCOL}${HOST}:${PORT}/realms/${KEYCLOAK_REALM}"

echo -e "${GREEN}Configuration:${NC}"
echo "  Instance: $INSTANCE"
echo "  Keycloak URL: $KEYCLOAK_URL"
echo "  Realm: $KEYCLOAK_REALM"
echo "  Issuer: $ISSUER_URL"
echo "  Trust Level: $TRUST_LEVEL"
echo ""

# Generate JSON
cat > "$OUTPUT_FILE" << EOF
{
  "trusted_issuers": {
    "${ISSUER_URL}": {
      "tenant": "${INSTANCE}",
      "name": "${INSTANCE} Keycloak (${HOST})",
      "country": "${INSTANCE}",
      "trust_level": "${TRUST_LEVEL}",
      "realm": "${KEYCLOAK_REALM}",
      "enabled": true
    }
  },
  "federation_matrix": {
    "${INSTANCE}": []
  },
  "tenant_configs": {
    "${INSTANCE}": {
      "code": "${INSTANCE}",
      "name": "${INSTANCE}",
      "locale": "en-US",
      "mfa_required_above": "UNCLASSIFIED",
      "max_session_hours": 10,
      "default_coi": []
    }
  },
  "metadata": {
    "generated_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
    "generated_by": "generate-trusted-issuers.sh",
    "instance": "${INSTANCE}",
    "keycloak_url": "${KEYCLOAK_URL}",
    "realm": "${KEYCLOAK_REALM}"
  }
}
EOF

echo -e "${GREEN}✅ Generated: $OUTPUT_FILE${NC}"
echo ""
echo -e "${BLUE}To add federation partners:${NC}"
echo "  Edit: $OUTPUT_FILE"
echo "  Add partners to federation_matrix[\"${INSTANCE}\"]"
echo ""
echo -e "${BLUE}To reload policies:${NC}"
echo "  curl -X POST https://localhost:7002/policy/reload"
echo ""
