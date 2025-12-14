#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 - Dynamic Keycloak Theme Generator
# =============================================================================
# Generates a Keycloak theme for any NATO country based on 3-letter ISO code
# Uses centralized NATO countries database for consistent metadata
#
# Usage: ./scripts/generate-spoke-theme.sh <COUNTRY_CODE> [--all] [--force]
#
# Examples:
#   ./scripts/generate-spoke-theme.sh GBR          # Generate GBR theme
#   ./scripts/generate-spoke-theme.sh --all        # Generate all 32 NATO themes
#   ./scripts/generate-spoke-theme.sh ALB --force  # Regenerate even if exists
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
THEMES_DIR="$PROJECT_ROOT/keycloak/themes"
BASE_THEME="dive-v3"

# Load NATO countries database
source "$SCRIPT_DIR/nato-countries.sh"

# Parse arguments
FORCE=false
ALL=false
COUNTRY_CODE=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --all|-a)
            ALL=true
            shift
            ;;
        --force|-f)
            FORCE=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 <COUNTRY_CODE> [--all] [--force]"
            echo ""
            echo "Options:"
            echo "  --all, -a     Generate themes for all 32 NATO countries"
            echo "  --force, -f   Regenerate theme even if it exists"
            echo "  --help, -h    Show this help"
            echo ""
            echo "Examples:"
            echo "  $0 GBR          Generate UK theme"
            echo "  $0 --all        Generate all 32 NATO themes"
            echo "  $0 POL --force  Regenerate Poland theme"
            exit 0
            ;;
        *)
            COUNTRY_CODE="${1^^}"
            shift
            ;;
    esac
done

# =============================================================================
# Generate theme for a single country
# =============================================================================
generate_theme() {
    local code="$1"
    local code_lower="${code,,}"
    
    # Validate NATO country
    if ! is_nato_country "$code"; then
        if is_partner_nation "$code"; then
            echo "⚠️  $code is a partner nation (not NATO member). Using partner data..."
        else
            echo "❌ Unknown country code: $code"
            echo "   Run './dive spoke list-countries' to see valid codes"
            return 1
        fi
    fi
    
    # Get country data from NATO database
    local name=$(get_country_name "$code")
    local flag=$(get_country_flag "$code")
    local primary=$(get_country_primary_color "$code")
    local secondary=$(get_country_secondary_color "$code")
    local accent="#ffffff"  # White accent works for most flags
    
    # Handle partner nations
    if is_partner_nation "$code"; then
        local partner_data="${PARTNER_NATIONS[$code]}"
        name=$(echo "$partner_data" | cut -d'|' -f1)
        flag=$(echo "$partner_data" | cut -d'|' -f2)
        primary=$(echo "$partner_data" | cut -d'|' -f3)
        secondary=$(echo "$partner_data" | cut -d'|' -f4)
    fi
    
    local theme_name="dive-v3-${code_lower}"
    local theme_dir="$THEMES_DIR/$theme_name"
    
    # Check if theme exists
    if [ -d "$theme_dir" ] && [ "$FORCE" != true ]; then
        echo "  ⏭️  $code: Theme exists (use --force to regenerate)"
        return 0
    fi

    echo "  ✨ Generating: $name ($code) $flag"
    
    # Create theme directory structure
    mkdir -p "$theme_dir/login/messages"
    mkdir -p "$theme_dir/login/resources/css"
    mkdir -p "$theme_dir/login/resources/img"
    
    # Convert hex to RGB for rgba() usage
    local primary_rgb=$(hex_to_rgb "$primary")
    local secondary_rgb=$(hex_to_rgb "$secondary")
    
    # Generate theme.properties
    cat > "$theme_dir/login/theme.properties" << PROPS
# $name Theme - Auto-generated from NATO countries database
# Do not edit manually - run: ./scripts/generate-spoke-theme.sh $code --force
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")

parent=dive-v3
backgroundImage=background-${code_lower}.jpg
primaryColor=$primary
secondaryColor=$secondary
accentColor=$accent
locales=en

styles=css/custom.css
PROPS

    # Generate custom.css
    cat > "$theme_dir/login/resources/css/custom.css" << CSS
/**
 * $name Keycloak Theme
 * Auto-generated from NATO countries database
 * Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
 * 
 * Primary: $primary
 * Secondary: $secondary
 * Accent: $accent
 */

/* CSS Variables for this instance */
:root {
    --instance-primary: $primary;
    --instance-secondary: $secondary;
    --instance-accent: $accent;
    --instance-primary-rgb: $primary_rgb;
    --instance-secondary-rgb: $secondary_rgb;
}

/* Background gradient */
.dive-background {
    background: linear-gradient(135deg, $primary 0%, $secondary 100%);
}

/* Primary button styling */
.dive-button-primary {
    background: linear-gradient(135deg, $primary 0%, $secondary 100%);
    transition: all 0.3s ease;
}

.dive-button-primary:hover {
    box-shadow: 0 8px 25px rgba($primary_rgb, 0.4);
    transform: translateY(-2px);
}

/* Header styling */
.dive-header h1 {
    color: $primary;
}

.dive-header .logo {
    border-color: $primary;
}

/* Input focus states */
.dive-input:focus {
    border-color: $primary;
    box-shadow: 0 0 0 3px rgba($primary_rgb, 0.15);
}

/* Social/IdP link styling */
.dive-social-link:hover {
    border-color: $primary;
    background: rgba($primary_rgb, 0.05);
}

.dive-social-link:focus {
    border-color: $primary;
    box-shadow: 0 0 0 3px rgba($primary_rgb, 0.15);
}

/* Links */
.dive-link {
    color: $primary;
}

.dive-link:hover {
    color: $secondary;
}

/* Accent elements */
.dive-accent {
    color: $accent;
}

.dive-accent-bg {
    background-color: $accent;
}

/* Instance badge */
.dive-instance-badge {
    background: rgba($primary_rgb, 0.1);
    border: 1px solid $primary;
    color: $primary;
}

/* Alert/notification styling */
.dive-alert-info {
    border-left-color: $primary;
    background: rgba($primary_rgb, 0.05);
}

/* OTP/WebAuthn specific styling */
.otp-input:focus {
    border-color: $primary;
    box-shadow: 0 0 0 3px rgba($primary_rgb, 0.15);
}

.webauthn-button {
    background: linear-gradient(135deg, $primary 0%, $secondary 100%);
}

/* Passkey/WebAuthn icon coloring */
.passkey-icon {
    color: $primary;
}

/* Footer styling */
.dive-footer a {
    color: $primary;
}

.dive-footer a:hover {
    color: $secondary;
}
CSS

    # Copy messages from base theme or GBR (English)
    if [ -f "$THEMES_DIR/dive-v3-gbr/login/messages/messages_en.properties" ]; then
        cp "$THEMES_DIR/dive-v3-gbr/login/messages/messages_en.properties" \
           "$theme_dir/login/messages/"
    elif [ -f "$THEMES_DIR/$BASE_THEME/login/messages/messages_en.properties" ]; then
        cp "$THEMES_DIR/$BASE_THEME/login/messages/messages_en.properties" \
           "$theme_dir/login/messages/"
    fi
    
    # Create placeholder background (copy from GBR if exists, otherwise from base)
    local bg_src=""
    if [ -f "$THEMES_DIR/dive-v3-gbr/login/resources/img/background-gbr.jpg" ]; then
        bg_src="$THEMES_DIR/dive-v3-gbr/login/resources/img/background-gbr.jpg"
    elif [ -f "$THEMES_DIR/$BASE_THEME/login/resources/img/background.jpg" ]; then
        bg_src="$THEMES_DIR/$BASE_THEME/login/resources/img/background.jpg"
    fi
    
    if [ -n "$bg_src" ]; then
        cp "$bg_src" "$theme_dir/login/resources/img/background-${code_lower}.jpg"
    fi
    
    echo "     ✓ Created: $theme_dir"
    return 0
}

# =============================================================================
# Convert hex to RGB for rgba() usage
# =============================================================================
hex_to_rgb() {
    local hex="${1#\#}"
    local r=$((16#${hex:0:2}))
    local g=$((16#${hex:2:2}))
    local b=$((16#${hex:4:2}))
    echo "$r, $g, $b"
}

# =============================================================================
# Main execution
# =============================================================================

if [ "$ALL" = true ]; then
    echo "═══════════════════════════════════════════════════════════════════════"
    echo "  Generating Keycloak Themes for All 32 NATO Countries"
    echo "═══════════════════════════════════════════════════════════════════════"
    echo ""
    
    generated=0
    skipped=0
    failed=0
    
    for code in $(echo "${!NATO_COUNTRIES[@]}" | tr ' ' '\n' | sort); do
        generate_theme "$code" && generated=$((generated + 1)) || failed=$((failed + 1))
    done
    
    echo ""
    echo "═══════════════════════════════════════════════════════════════════════"
    echo "  Summary: Processed ${#NATO_COUNTRIES[@]} countries"
    echo "  Generated/Updated: $generated themes"
    if [ $failed -gt 0 ]; then
        echo "  Failed: $failed"
    fi
    echo "═══════════════════════════════════════════════════════════════════════"
    
elif [ -n "$COUNTRY_CODE" ]; then
    echo "═══════════════════════════════════════════════════════════════════════"
    echo "  Generating Keycloak Theme: dive-v3-${COUNTRY_CODE,,}"
    echo "═══════════════════════════════════════════════════════════════════════"
    echo ""
    
    if generate_theme "$COUNTRY_CODE"; then
        echo ""
        echo "To apply the theme to a realm:"
        echo "  kcadm.sh update realms/dive-v3-${COUNTRY_CODE,,} -s loginTheme=dive-v3-${COUNTRY_CODE,,}"
        echo ""
        echo "To add custom background image:"
        echo "  cp your-image.jpg $THEMES_DIR/dive-v3-${COUNTRY_CODE,,}/login/resources/img/background-${COUNTRY_CODE,,}.jpg"
    fi
else
    echo "❌ Usage: $0 <COUNTRY_CODE> [--all] [--force]"
    echo "   Run '$0 --help' for more options"
    exit 1
fi
