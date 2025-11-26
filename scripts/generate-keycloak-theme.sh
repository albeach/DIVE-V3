#!/bin/bash
#
# Generate Keycloak Theme from instance.json
#
# This script reads the instance.json configuration file and generates
# a Keycloak theme CSS file with instance-specific colors and styling.
#
# Usage:
#   ./scripts/generate-keycloak-theme.sh USA
#   ./scripts/generate-keycloak-theme.sh FRA
#   ./scripts/generate-keycloak-theme.sh DEU
#   ./scripts/generate-keycloak-theme.sh --all
#
# The generated theme will be placed in:
#   keycloak/themes/dive-v3-{code}/login/resources/css/custom.css
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
INSTANCES_DIR="$PROJECT_ROOT/instances"
THEMES_DIR="$PROJECT_ROOT/keycloak/themes"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if jq is installed
check_dependencies() {
    if ! command -v jq &> /dev/null; then
        log_error "jq is required but not installed. Please install jq:"
        echo "  brew install jq  # macOS"
        echo "  apt install jq   # Debian/Ubuntu"
        exit 1
    fi
}

# Convert hex color to RGB values
hex_to_rgb() {
    local hex="$1"
    hex="${hex#\#}"  # Remove leading #
    
    local r=$((16#${hex:0:2}))
    local g=$((16#${hex:2:2}))
    local b=$((16#${hex:4:2}))
    
    echo "$r, $g, $b"
}

# Generate CSS for a single instance
generate_theme() {
    local code=$(echo "$1" | tr '[:lower:]' '[:upper:]')  # Convert to uppercase
    local code_lower=$(echo "$1" | tr '[:upper:]' '[:lower:]')
    local instance_file="$INSTANCES_DIR/$code_lower/instance.json"
    
    if [[ ! -f "$instance_file" ]]; then
        log_error "Instance file not found: $instance_file"
        return 1
    fi
    
    log_info "Generating Keycloak theme for $code..."
    
    # Read values from instance.json
    local instance_name=$(jq -r '.instance_name' "$instance_file")
    local primary_color=$(jq -r '.theme.primary_color' "$instance_file")
    local secondary_color=$(jq -r '.theme.secondary_color' "$instance_file")
    local accent_color=$(jq -r '.theme.accent_color' "$instance_file")
    local banner_bg=$(jq -r '.theme.css_variables["--instance-banner-bg"]' "$instance_file")
    
    # Convert to RGB
    local primary_rgb=$(hex_to_rgb "$primary_color")
    local secondary_rgb=$(hex_to_rgb "$secondary_color")
    
    # Create theme directory structure
    local theme_dir="$THEMES_DIR/dive-v3-$code_lower/login/resources/css"
    mkdir -p "$theme_dir"
    
    # Generate custom.css
    cat > "$theme_dir/custom.css" << EOF
/**
 * $instance_name Keycloak Theme
 * Auto-generated from instance.json
 * Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
 * 
 * Primary: $primary_color
 * Secondary: $secondary_color
 * Accent: $accent_color
 */

/* CSS Variables for this instance */
:root {
    --instance-primary: $primary_color;
    --instance-secondary: $secondary_color;
    --instance-accent: $accent_color;
    --instance-primary-rgb: $primary_rgb;
    --instance-secondary-rgb: $secondary_rgb;
}

/* Background gradient */
.dive-background {
    background: $banner_bg;
}

/* Primary button styling */
.dive-button-primary {
    background: $banner_bg;
    transition: all 0.3s ease;
}

.dive-button-primary:hover {
    box-shadow: 0 8px 25px rgba($primary_rgb, 0.4);
    transform: translateY(-2px);
}

/* Header styling */
.dive-header h1 {
    color: $primary_color;
}

.dive-header .logo {
    border-color: $primary_color;
}

/* Input focus states */
.dive-input:focus {
    border-color: $primary_color;
    box-shadow: 0 0 0 3px rgba($primary_rgb, 0.15);
}

/* Social/IdP link styling */
.dive-social-link:hover {
    border-color: $primary_color;
    background: rgba($primary_rgb, 0.05);
}

.dive-social-link:focus {
    border-color: $primary_color;
    box-shadow: 0 0 0 3px rgba($primary_rgb, 0.15);
}

/* Links */
.dive-link {
    color: $primary_color;
}

.dive-link:hover {
    color: $secondary_color;
}

/* Accent elements */
.dive-accent {
    color: $accent_color;
}

.dive-accent-bg {
    background-color: $accent_color;
}

/* Instance badge */
.dive-instance-badge {
    background: rgba($primary_rgb, 0.1);
    border: 1px solid $primary_color;
    color: $primary_color;
}

/* Alert/notification styling */
.dive-alert-info {
    border-left-color: $primary_color;
    background: rgba($primary_rgb, 0.05);
}

/* OTP/WebAuthn specific styling */
.otp-input:focus {
    border-color: $primary_color;
    box-shadow: 0 0 0 3px rgba($primary_rgb, 0.15);
}

.webauthn-button {
    background: $banner_bg;
}

/* Passkey/WebAuthn icon coloring */
.passkey-icon {
    color: $primary_color;
}

/* Footer styling */
.dive-footer a {
    color: $primary_color;
}

.dive-footer a:hover {
    color: $secondary_color;
}
EOF
    
    log_success "Generated theme: $theme_dir/custom.css"
    
    # Generate theme.properties if it doesn't exist
    local theme_props="$THEMES_DIR/dive-v3-$code_lower/login/theme.properties"
    if [[ ! -f "$theme_props" ]]; then
        cat > "$theme_props" << EOF
# $instance_name Keycloak Theme
# Auto-generated from instance.json

parent=dive-v3
import=common/keycloak

styles=css/dive-v3.css css/custom.css
EOF
        log_success "Generated theme.properties"
    fi
    
    return 0
}

# Generate themes for all instances
generate_all_themes() {
    log_info "Generating themes for all instances..."
    
    local success_count=0
    local fail_count=0
    
    for instance_dir in "$INSTANCES_DIR"/*/; do
        if [[ -d "$instance_dir" ]]; then
            local code=$(basename "$instance_dir")
            if generate_theme "$code"; then
                ((success_count++))
            else
                ((fail_count++))
            fi
        fi
    done
    
    echo ""
    log_info "Theme generation complete:"
    log_success "  $success_count themes generated successfully"
    if [[ $fail_count -gt 0 ]]; then
        log_warning "  $fail_count themes failed"
    fi
}

# Show usage
show_usage() {
    cat << EOF
Usage: $(basename "$0") [INSTANCE_CODE|--all]

Generate Keycloak themes from instance.json configuration files.

Arguments:
  INSTANCE_CODE   The 3-letter country code (USA, FRA, DEU, GBR, etc.)
  --all           Generate themes for all instances

Examples:
  $(basename "$0") USA       # Generate USA theme only
  $(basename "$0") FRA       # Generate France theme only
  $(basename "$0") --all     # Generate all themes

The generated themes will be placed in:
  keycloak/themes/dive-v3-{code}/login/resources/css/custom.css

Note: Requires jq to be installed for JSON parsing.
EOF
}

# Main entry point
main() {
    check_dependencies
    
    if [[ $# -eq 0 ]]; then
        show_usage
        exit 0
    fi
    
    case "$1" in
        --all|-a)
            generate_all_themes
            ;;
        --help|-h)
            show_usage
            ;;
        *)
            generate_theme "$1"
            ;;
    esac
}

main "$@"
