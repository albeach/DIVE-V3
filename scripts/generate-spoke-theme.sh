#!/bin/bash
# =============================================================================
# DIVE V3 - Dynamic Keycloak Theme Generator
# =============================================================================
# Generates a Keycloak theme for any country based on 3-letter ISO code
# Usage: ./scripts/generate-spoke-theme.sh <COUNTRY_CODE> [COUNTRY_NAME]
#
# Examples:
#   ./scripts/generate-spoke-theme.sh NZL "New Zealand"
#   ./scripts/generate-spoke-theme.sh AUS "Australia"
#   ./scripts/generate-spoke-theme.sh JPN "Japan"
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
THEMES_DIR="$PROJECT_ROOT/keycloak/themes"
BASE_THEME="dive-v3"

# Country code (required) - compatible with bash 3.x
COUNTRY_CODE="$(echo "$1" | tr '[:lower:]' '[:upper:]')"
COUNTRY_CODE_LOWER="$(echo "$COUNTRY_CODE" | tr '[:upper:]' '[:lower:]')"

# Country name (optional, will lookup if not provided)
COUNTRY_NAME="${2:-}"

if [ -z "$COUNTRY_CODE" ]; then
    echo "❌ Usage: $0 <COUNTRY_CODE> [COUNTRY_NAME]"
    echo "   Example: $0 NZL 'New Zealand'"
    exit 1
fi

# =============================================================================
# COUNTRY DATA - Colors based on national flags
# Format: PRIMARY|SECONDARY|ACCENT|NAME|FLAG
# =============================================================================
get_country_data() {
    local code="$1"
    case "$code" in
        # Five Eyes
        USA) echo "#3C3B6E|#B22234|#ffffff|United States|🇺🇸" ;;
        GBR) echo "#012169|#C8102E|#ffffff|United Kingdom|🇬🇧" ;;
        CAN) echo "#FF0000|#ffffff|#FF0000|Canada|🇨🇦" ;;
        AUS) echo "#00008B|#FF0000|#ffffff|Australia|🇦🇺" ;;
        NZL) echo "#00247D|#CC142B|#ffffff|New Zealand|🇳🇿" ;;
        
        # NATO Major
        FRA) echo "#002395|#ED2939|#ffffff|France|🇫🇷" ;;
        DEU) echo "#000000|#DD0000|#FFCC00|Germany|🇩🇪" ;;
        ITA) echo "#009246|#CE2B37|#ffffff|Italy|🇮🇹" ;;
        ESP) echo "#AA151B|#F1BF00|#ffffff|Spain|🇪🇸" ;;
        POL) echo "#DC143C|#ffffff|#DC143C|Poland|🇵🇱" ;;
        NLD) echo "#21468B|#AE1C28|#ffffff|Netherlands|🇳🇱" ;;
        
        # Asia-Pacific
        JPN) echo "#BC002D|#ffffff|#BC002D|Japan|🇯🇵" ;;
        KOR) echo "#003478|#C60C30|#ffffff|South Korea|🇰🇷" ;;
        SGP) echo "#ED2939|#ffffff|#ED2939|Singapore|🇸🇬" ;;
        
        # Nordic
        NOR) echo "#BA0C2F|#00205B|#ffffff|Norway|🇳🇴" ;;
        SWE) echo "#006AA7|#FECC02|#FECC02|Sweden|🇸🇪" ;;
        DNK) echo "#C8102E|#ffffff|#C8102E|Denmark|🇩🇰" ;;
        FIN) echo "#003580|#ffffff|#003580|Finland|🇫🇮" ;;
        
        # Others
        BEL) echo "#000000|#FFD90F|#ED2939|Belgium|🇧🇪" ;;
        PRT) echo "#006600|#FF0000|#FFE100|Portugal|🇵🇹" ;;
        GRC) echo "#0D5EAF|#ffffff|#0D5EAF|Greece|🇬🇷" ;;
        TUR) echo "#E30A17|#ffffff|#E30A17|Turkey|🇹🇷" ;;
        CZE) echo "#11457E|#D7141A|#ffffff|Czech Republic|🇨🇿" ;;
        HUN) echo "#436F4D|#CD2A3E|#ffffff|Hungary|🇭🇺" ;;
        ROU) echo "#002B7F|#FCD116|#CE1126|Romania|🇷🇴" ;;
        BGR) echo "#00966E|#D62612|#ffffff|Bulgaria|🇧🇬" ;;
        
        # Default
        *) echo "" ;;
    esac
}

# =============================================================================
# Lookup or use provided country data
# =============================================================================
COUNTRY_INFO="$(get_country_data "$COUNTRY_CODE")"

if [ -n "$COUNTRY_INFO" ]; then
    PRIMARY="$(echo "$COUNTRY_INFO" | cut -d'|' -f1)"
    SECONDARY="$(echo "$COUNTRY_INFO" | cut -d'|' -f2)"
    ACCENT="$(echo "$COUNTRY_INFO" | cut -d'|' -f3)"
    NAME="$(echo "$COUNTRY_INFO" | cut -d'|' -f4)"
    FLAG="$(echo "$COUNTRY_INFO" | cut -d'|' -f5)"
    COUNTRY_NAME="${COUNTRY_NAME:-$NAME}"
else
    # Default colors for unknown countries
    PRIMARY="#1a365d"
    SECONDARY="#c53030"
    ACCENT="#ffffff"
    FLAG="🌐"
    if [ -z "$COUNTRY_NAME" ]; then
        echo "⚠️  Unknown country code: $COUNTRY_CODE"
        echo "   Please provide country name as second argument"
        echo "   Using default colors (blue/red)"
        COUNTRY_NAME="$COUNTRY_CODE"
    fi
fi

THEME_NAME="dive-v3-${COUNTRY_CODE_LOWER}"
THEME_DIR="$THEMES_DIR/$THEME_NAME"

echo "═══════════════════════════════════════════════════════════════════════"
echo "  Generating Keycloak Theme: $THEME_NAME"
echo "═══════════════════════════════════════════════════════════════════════"
echo "  Country: $COUNTRY_NAME ($COUNTRY_CODE)"
echo "  Flag: $FLAG"
echo "  Primary: $PRIMARY"
echo "  Secondary: $SECONDARY"
echo "  Accent: $ACCENT"
echo "═══════════════════════════════════════════════════════════════════════"

# =============================================================================
# Create theme directory structure
# =============================================================================
mkdir -p "$THEME_DIR/login/messages"
mkdir -p "$THEME_DIR/login/resources/css"
mkdir -p "$THEME_DIR/login/resources/img"

# =============================================================================
# Generate theme.properties
# =============================================================================
cat > "$THEME_DIR/login/theme.properties" << EOF
# $COUNTRY_NAME Theme - Auto-generated
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# Country Code: $COUNTRY_CODE

parent=dive-v3
backgroundImage=background-${COUNTRY_CODE_LOWER}.jpg
primaryColor=$PRIMARY
secondaryColor=$SECONDARY
accentColor=$ACCENT
locales=en

styles=css/custom.css
EOF

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

PRIMARY_RGB="$(hex_to_rgb "$PRIMARY")"
SECONDARY_RGB="$(hex_to_rgb "$SECONDARY")"

# =============================================================================
# Generate custom.css
# =============================================================================
cat > "$THEME_DIR/login/resources/css/custom.css" << EOF
/**
 * $COUNTRY_NAME Keycloak Theme
 * Auto-generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
 * 
 * Primary: $PRIMARY
 * Secondary: $SECONDARY
 * Accent: $ACCENT
 */

/* CSS Variables for this instance */
:root {
    --instance-primary: $PRIMARY;
    --instance-secondary: $SECONDARY;
    --instance-accent: $ACCENT;
    --instance-primary-rgb: $PRIMARY_RGB;
    --instance-secondary-rgb: $SECONDARY_RGB;
}

/* Background gradient */
.dive-background {
    background: linear-gradient(135deg, $PRIMARY 0%, $SECONDARY 100%);
}

/* Primary button styling */
.dive-button-primary {
    background: linear-gradient(135deg, $PRIMARY 0%, $SECONDARY 100%);
    transition: all 0.3s ease;
}

.dive-button-primary:hover {
    box-shadow: 0 8px 25px rgba($PRIMARY_RGB, 0.4);
    transform: translateY(-2px);
}

/* Header styling */
.dive-header h1 {
    color: $PRIMARY;
}

.dive-header .logo {
    border-color: $PRIMARY;
}

/* Input focus states */
.dive-input:focus {
    border-color: $PRIMARY;
    box-shadow: 0 0 0 3px rgba($PRIMARY_RGB, 0.15);
}

/* Social/IdP link styling */
.dive-social-link:hover {
    border-color: $PRIMARY;
    background: rgba($PRIMARY_RGB, 0.05);
}

.dive-social-link:focus {
    border-color: $PRIMARY;
    box-shadow: 0 0 0 3px rgba($PRIMARY_RGB, 0.15);
}

/* Links */
.dive-link {
    color: $PRIMARY;
}

.dive-link:hover {
    color: $SECONDARY;
}

/* Accent elements */
.dive-accent {
    color: $ACCENT;
}

.dive-accent-bg {
    background-color: $ACCENT;
}

/* Instance badge */
.dive-instance-badge {
    background: rgba($PRIMARY_RGB, 0.1);
    border: 1px solid $PRIMARY;
    color: $PRIMARY;
}

/* Alert/notification styling */
.dive-alert-info {
    border-left-color: $PRIMARY;
    background: rgba($PRIMARY_RGB, 0.05);
}

/* OTP/WebAuthn specific styling */
.otp-input:focus {
    border-color: $PRIMARY;
    box-shadow: 0 0 0 3px rgba($PRIMARY_RGB, 0.15);
}

.webauthn-button {
    background: linear-gradient(135deg, $PRIMARY 0%, $SECONDARY 100%);
}

/* Passkey/WebAuthn icon coloring */
.passkey-icon {
    color: $PRIMARY;
}

/* Footer styling */
.dive-footer a {
    color: $PRIMARY;
}

.dive-footer a:hover {
    color: $SECONDARY;
}
EOF

# =============================================================================
# Copy messages from base theme or GBR (English)
# =============================================================================
if [ -f "$THEMES_DIR/dive-v3-gbr/login/messages/messages_en.properties" ]; then
    cp "$THEMES_DIR/dive-v3-gbr/login/messages/messages_en.properties" \
       "$THEME_DIR/login/messages/"
elif [ -f "$THEMES_DIR/$BASE_THEME/login/messages/messages_en.properties" ]; then
    cp "$THEMES_DIR/$BASE_THEME/login/messages/messages_en.properties" \
       "$THEME_DIR/login/messages/"
fi

# =============================================================================
# Create placeholder background image (copy from GBR if exists)
# =============================================================================
if [ -f "$THEMES_DIR/dive-v3-gbr/login/resources/img/background-gbr.jpg" ]; then
    cp "$THEMES_DIR/dive-v3-gbr/login/resources/img/background-gbr.jpg" \
       "$THEME_DIR/login/resources/img/background-${COUNTRY_CODE_LOWER}.jpg"
    echo "📷 Copied placeholder background image"
fi

echo ""
echo "✅ Theme generated: $THEME_DIR"
echo ""
echo "To apply the theme to a realm:"
echo "  kcadm.sh update realms/dive-v3-broker -s loginTheme=$THEME_NAME"
echo ""
echo "To add custom background image:"
echo "  cp your-image.jpg $THEME_DIR/login/resources/img/background-${COUNTRY_CODE_LOWER}.jpg"
echo ""
