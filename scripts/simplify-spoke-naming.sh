#!/usr/bin/env bash
# =============================================================================
# Update All Spoke Instances - Simplify Naming Convention
# =============================================================================
# Removes redundant {code}_ prefixes from volume declarations
# Simplifies network names to just "internal"
# =============================================================================

# Don't exit on errors - we want to process all instances
set +e

DIVE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTANCES_DIR="${DIVE_ROOT}/instances"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

echo ""
echo -e "${BOLD}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║     Simplifying Spoke Instance Naming Conventions${NC}"
echo -e "${BOLD}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

updated_count=0
skipped_count=0

# Process each spoke instance directory
for instance_dir in "$INSTANCES_DIR"/*/; do
    [ ! -d "$instance_dir" ] && continue

    code=$(basename "$instance_dir")
    compose_file="${instance_dir}docker-compose.yml"

    # Skip special directories
    if [[ "$code" == "shared" || "$code" == "template" || "$code" == "hub" ]]; then
        continue
    fi

    # Skip if docker-compose.yml doesn't exist
    if [ ! -f "$compose_file" ]; then
        echo -e "${YELLOW}⊘ $code: No docker-compose.yml (skipped)${NC}"
        ((skipped_count++))
        continue
    fi

    echo -e "${BLUE}Processing: $code${NC}"

    # Check if file needs updates
    if grep -q "${code}_postgres_data" "$compose_file" 2>/dev/null; then
        # Create backup
        cp "$compose_file" "${compose_file}.backup-$(date +%Y%m%d-%H%M%S)"

        # Portable sed in-place editing (works on both macOS and Linux)
        local tmpfile=$(mktemp)
        
        # Update volume declarations (remove redundant {code}_ prefix)
        sed "s/${code}_postgres_data:/postgres_data:/g; \
             s/${code}_mongodb_data:/mongodb_data:/g; \
             s/${code}_redis_data:/redis_data:/g; \
             s/${code}_frontend_modules:/frontend_modules:/g; \
             s/${code}_frontend_next:/frontend_next:/g; \
             s/${code}_opa_cache:/opa_cache:/g; \
             s/${code}_opal_cache:/opal_cache:/g; \
             s/${code}_backend_node_modules:/backend_node_modules:/g; \
             s/${code}_backend_logs:/backend_logs:/g; \
             s/${code}_kas_logs:/kas_logs:/g; \
             s/- ${code}_postgres_data:/- postgres_data:/g; \
             s/- ${code}_mongodb_data:/- mongodb_data:/g; \
             s/- ${code}_redis_data:/- redis_data:/g; \
             s/- ${code}_frontend_modules:/- frontend_modules:/g; \
             s/- ${code}_frontend_next:/- frontend_next:/g; \
             s/- ${code}_opa_cache:/- opa_cache:/g; \
             s/- ${code}_opal_cache:/- opal_cache:/g; \
             s/- ${code}_backend_node_modules:/- backend_node_modules:/g; \
             s/- ${code}_backend_logs:/- backend_logs:/g; \
             s/- ${code}_kas_logs:/- kas_logs:/g; \
             s/${code}-network:/internal:/g; \
             s/dive-${code}-network:/internal:/g; \
             s/- ${code}-network/- internal/g; \
             s/- dive-${code}-network/- internal/g" "$compose_file" > "$tmpfile" && mv "$tmpfile" "$compose_file"

        echo -e "  ${GREEN}✓ Updated${NC}"
        ((updated_count++))
    else
        echo -e "  ${GREEN}✓ Already simplified (skipped)${NC}"
        ((skipped_count++))
    fi
done

echo ""
echo -e "${BOLD}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}Summary:${NC}"
echo "  Updated:  $updated_count instances"
echo "  Skipped:  $skipped_count instances (already correct or no compose file)"
echo ""
echo -e "${GREEN}✅ Naming convention simplification complete!${NC}"
echo ""
echo "Next steps:"
echo "  1. Review changes: git diff instances/"
echo "  2. Run validation: ./dive naming validate-docker"
echo "  3. Nuke old resources: ./dive nuke all --yes"
echo "  4. Re-deploy: ./dive hub deploy && ./dive spoke deploy FRA"
echo ""
