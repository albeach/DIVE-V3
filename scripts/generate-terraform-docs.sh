#!/bin/bash
# =============================================================================
# Generate Terraform Documentation
# =============================================================================
# Uses terraform-docs to generate README.md files for modules.
#
# Prerequisites:
#   brew install terraform-docs
#   # or
#   go install github.com/terraform-docs/terraform-docs@latest
#
# Usage:
#   ./scripts/generate-terraform-docs.sh
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIVE_ROOT="$(dirname "$SCRIPT_DIR")"

# Check for terraform-docs
if ! command -v terraform-docs &> /dev/null; then
    echo "terraform-docs is not installed."
    echo ""
    echo "Install with:"
    echo "  brew install terraform-docs"
    echo "  # or"
    echo "  go install github.com/terraform-docs/terraform-docs@latest"
    exit 1
fi

echo "=== Generating Terraform Documentation ==="

# Generate docs for each module
for dir in "$DIVE_ROOT"/terraform/modules/*/; do
    if [ -d "$dir" ]; then
        module_name=$(basename "$dir")
        echo "Processing $module_name..."
        
        # Generate markdown documentation
        terraform-docs markdown table \
            --output-file README.md \
            --output-mode inject \
            --sort-by required \
            "$dir" 2>/dev/null || {
                echo "  - Using manual README (terraform-docs inject markers not found)"
            }
    fi
done

echo ""
echo "=== Documentation Generation Complete ==="
echo ""
echo "Generated READMEs for:"
for dir in "$DIVE_ROOT"/terraform/modules/*/; do
    if [ -f "$dir/README.md" ]; then
        echo "  ✓ $(basename "$dir")"
    fi
done
