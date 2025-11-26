#!/bin/bash
#
# Generate Keycloak Theme from Instance Configuration
#
# This script reads an instance.json file and generates a matching
# Keycloak login theme with the instance's color scheme.
#
# Usage: ./scripts/generate-keycloak-theme.sh <INSTANCE_CODE>
# Example: ./scripts/generate-keycloak-theme.sh USA
#
# The script will:
# 1. Read the instance.json configuration
# 2. Generate theme.properties with colors
# 3. Generate custom.css with gradient backgrounds
# 4. Create localized messages if needed
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

print_header() {
    echo ""
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║       DIVE V3 Keycloak Theme Generator                         ║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_step() {
    echo -e "${BLUE}▸${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Check for jq dependency
check_dependencies() {
    if ! command -v jq &> /dev/null; then
        print_error "jq is required but not installed."
        echo "  Install with: brew install jq (macOS) or apt-get install jq (Linux)"
        exit 1
    fi
}

# Usage
usage() {
    echo "Usage: $0 <INSTANCE_CODE>"
    echo ""
    echo "Arguments:"
    echo "  INSTANCE_CODE    Three-letter country code (USA, FRA, DEU, GBR, CAN, etc.)"
    echo ""
    echo "Examples:"
    echo "  $0 USA           Generate theme for United States instance"
    echo "  $0 FRA           Generate theme for France instance"
    echo "  $0 DEU           Generate theme for Germany instance"
    echo "  $0 all           Generate themes for all configured instances"
    echo ""
    exit 1
}

# Convert hex to RGB values for CSS
hex_to_rgb() {
    local hex="$1"
    hex="${hex#'#'}"  # Remove # if present
    
    local r=$((16#${hex:0:2}))
    local g=$((16#${hex:2:2}))
    local b=$((16#${hex:4:2}))
    
    echo "$r, $g, $b"
}

# Generate theme for a single instance
generate_theme() {
    local instance_code="$1"
    local instance_code_lower=$(echo "$instance_code" | tr '[:upper:]' '[:lower:]')
    local instance_json="${PROJECT_ROOT}/instances/${instance_code_lower}/instance.json"
    local theme_dir="${PROJECT_ROOT}/keycloak/themes/dive-v3-${instance_code_lower}"
    
    print_step "Generating theme for ${instance_code}..."
    
    # Check if instance.json exists
    if [[ ! -f "$instance_json" ]]; then
        print_error "Instance configuration not found: $instance_json"
        return 1
    fi
    
    # Read theme colors from instance.json
    local primary_color=$(jq -r '.theme.primary_color // "#1a365d"' "$instance_json")
    local secondary_color=$(jq -r '.theme.secondary_color // "#2b6cb0"' "$instance_json")
    local accent_color=$(jq -r '.theme.accent_color // "#3182ce"' "$instance_json")
    local locale=$(jq -r '.locale // "en"' "$instance_json")
    local instance_name=$(jq -r '.instance_name // "Unknown"' "$instance_json")
    local background_image=$(jq -r '.theme.background_image // "background.jpg"' "$instance_json")
    
    # Get banner gradient
    local banner_bg=$(jq -r '.theme.css_variables["--instance-banner-bg"] // ""' "$instance_json")
    
    print_step "  Primary: $primary_color, Secondary: $secondary_color"
    
    # Create theme directories
    mkdir -p "${theme_dir}/login/resources/css"
    mkdir -p "${theme_dir}/login/resources/img"
    mkdir -p "${theme_dir}/login/messages"
    
    # Generate theme.properties
    cat > "${theme_dir}/login/theme.properties" << EOF
# ${instance_name} Theme - Auto-generated from instance.json
# Do not edit manually - run scripts/generate-keycloak-theme.sh ${instance_code}

parent=dive-v3
backgroundImage=${background_image}
primaryColor=${primary_color}
secondaryColor=${secondary_color}
accentColor=${accent_color}
locales=${locale}

styles=css/custom.css
EOF

    print_success "  Generated theme.properties"
    
    # Calculate RGB values for CSS
    local primary_rgb=$(hex_to_rgb "$primary_color")
    local secondary_rgb=$(hex_to_rgb "$secondary_color")
    local accent_rgb=$(hex_to_rgb "$accent_color")
    
    # Generate custom.css
    cat > "${theme_dir}/login/resources/css/custom.css" << EOF
/**
 * ${instance_name} Keycloak Theme
 * Auto-generated from instance.json
 * 
 * Primary: ${primary_color}
 * Secondary: ${secondary_color}
 * Accent: ${accent_color}
 */

/* CSS Variables for this instance */
:root {
    --instance-primary: ${primary_color};
    --instance-secondary: ${secondary_color};
    --instance-accent: ${accent_color};
    --instance-primary-rgb: ${primary_rgb};
    --instance-secondary-rgb: ${secondary_rgb};
}

/* Background gradient */
.dive-background {
    background: ${banner_bg:-"linear-gradient(135deg, ${primary_color} 0%, ${secondary_color} 100%)"};
}

/* Primary button styling */
.dive-button-primary {
    background: ${banner_bg:-"linear-gradient(135deg, ${primary_color} 0%, ${secondary_color} 100%)"};
    transition: all 0.3s ease;
}

.dive-button-primary:hover {
    box-shadow: 0 8px 25px rgba(${primary_rgb}, 0.4);
    transform: translateY(-2px);
}

/* Header styling */
.dive-header h1 {
    color: ${primary_color};
}

.dive-header .logo {
    border-color: ${primary_color};
}

/* Input focus states */
.dive-input:focus {
    border-color: ${primary_color};
    box-shadow: 0 0 0 3px rgba(${primary_rgb}, 0.15);
}

/* Social/IdP link styling */
.dive-social-link:hover {
    border-color: ${primary_color};
    background: rgba(${primary_rgb}, 0.05);
}

.dive-social-link:focus {
    border-color: ${primary_color};
    box-shadow: 0 0 0 3px rgba(${primary_rgb}, 0.15);
}

/* Links */
.dive-link {
    color: ${primary_color};
}

.dive-link:hover {
    color: ${secondary_color};
}

/* Accent elements */
.dive-accent {
    color: ${accent_color};
}

.dive-accent-bg {
    background-color: ${accent_color};
}

/* Instance badge */
.dive-instance-badge {
    background: rgba(${primary_rgb}, 0.1);
    border: 1px solid ${primary_color};
    color: ${primary_color};
}

/* Alert/notification styling */
.dive-alert-info {
    border-left-color: ${primary_color};
    background: rgba(${primary_rgb}, 0.05);
}

/* OTP/WebAuthn specific styling */
.otp-input:focus {
    border-color: ${primary_color};
    box-shadow: 0 0 0 3px rgba(${primary_rgb}, 0.15);
}

.webauthn-button {
    background: ${banner_bg:-"linear-gradient(135deg, ${primary_color} 0%, ${secondary_color} 100%)"};
}

/* Passkey/WebAuthn icon coloring */
.passkey-icon {
    color: ${primary_color};
}

/* Footer styling */
.dive-footer a {
    color: ${primary_color};
}

.dive-footer a:hover {
    color: ${secondary_color};
}
EOF

    print_success "  Generated custom.css"
    
    # Generate localized messages if needed
    if [[ "$locale" != "en" ]]; then
        generate_messages "$theme_dir" "$locale" "$instance_name"
        print_success "  Generated messages_${locale}.properties"
    fi
    
    # Check if background image exists, if not copy a placeholder
    local bg_source="${PROJECT_ROOT}/frontend/public/backgrounds/${background_image}"
    local bg_dest="${theme_dir}/login/resources/img/${background_image}"
    
    if [[ -f "$bg_source" ]]; then
        cp "$bg_source" "$bg_dest"
        print_success "  Copied background image"
    else
        print_warning "  Background image not found: $bg_source"
    fi
    
    print_success "Theme generated for ${instance_code}"
}

# Generate localized messages
generate_messages() {
    local theme_dir="$1"
    local locale="$2"
    local instance_name="$3"
    local messages_file="${theme_dir}/login/messages/messages_${locale}.properties"
    
    case "$locale" in
        "fr")
            cat > "$messages_file" << EOF
# French translations for ${instance_name}
loginTitle=Connexion Coalition DIVE V3
loginSubtitle=Authentification Fédérée Sécurisée
usernameOrEmail=Email ou Nom d'utilisateur
password=Mot de passe
doLogIn=Se connecter
doRegister=S'inscrire
forgotPassword=Mot de passe oublié ?
backToLogin=Retour à la connexion
selectIdp=Sélectionnez votre fournisseur d'identité
orLoginWith=ou connectez-vous avec
rememberMe=Se souvenir de moi
noAccount=Pas encore de compte ?
alreadyHaveAccount=Vous avez déjà un compte ?
loginWithPasskey=Se connecter avec une Passkey
useSecurityKey=Utiliser une clé de sécurité
pilotMode=MODE PILOTE
EOF
            ;;
        "de")
            cat > "$messages_file" << EOF
# German translations for ${instance_name}
loginTitle=DIVE V3 Koalitions-Anmeldung
loginSubtitle=Sichere Föderierte Authentifizierung
usernameOrEmail=E-Mail oder Benutzername
password=Passwort
doLogIn=Anmelden
doRegister=Registrieren
forgotPassword=Passwort vergessen?
backToLogin=Zurück zur Anmeldung
selectIdp=Wählen Sie Ihren Identitätsanbieter
orLoginWith=oder melden Sie sich an mit
rememberMe=Angemeldet bleiben
noAccount=Noch kein Konto?
alreadyHaveAccount=Bereits ein Konto?
loginWithPasskey=Mit Passkey anmelden
useSecurityKey=Sicherheitsschlüssel verwenden
pilotMode=PILOT-MODUS
EOF
            ;;
        "it")
            cat > "$messages_file" << EOF
# Italian translations for ${instance_name}
loginTitle=Accesso Coalizione DIVE V3
loginSubtitle=Autenticazione Federata Sicura
usernameOrEmail=Email o Nome utente
password=Password
doLogIn=Accedi
doRegister=Registrati
forgotPassword=Password dimenticata?
backToLogin=Torna all'accesso
selectIdp=Seleziona il tuo provider di identità
orLoginWith=oppure accedi con
rememberMe=Ricordami
noAccount=Non hai un account?
alreadyHaveAccount=Hai già un account?
loginWithPasskey=Accedi con Passkey
useSecurityKey=Usa chiave di sicurezza
pilotMode=MODALITÀ PILOTA
EOF
            ;;
        "es")
            cat > "$messages_file" << EOF
# Spanish translations for ${instance_name}
loginTitle=Inicio de Sesión Coalición DIVE V3
loginSubtitle=Autenticación Federada Segura
usernameOrEmail=Email o Nombre de usuario
password=Contraseña
doLogIn=Iniciar sesión
doRegister=Registrarse
forgotPassword=¿Olvidó su contraseña?
backToLogin=Volver al inicio de sesión
selectIdp=Seleccione su proveedor de identidad
orLoginWith=o inicie sesión con
rememberMe=Recordarme
noAccount=¿No tiene cuenta?
alreadyHaveAccount=¿Ya tiene cuenta?
loginWithPasskey=Iniciar sesión con Passkey
useSecurityKey=Usar llave de seguridad
pilotMode=MODO PILOTO
EOF
            ;;
        *)
            # Default English messages
            cat > "$messages_file" << EOF
# English translations for ${instance_name}
loginTitle=DIVE V3 Coalition Login
loginSubtitle=Secure Federated Authentication
usernameOrEmail=Email or Username
password=Password
doLogIn=Sign In
doRegister=Register
forgotPassword=Forgot password?
backToLogin=Back to login
selectIdp=Select your Identity Provider
orLoginWith=or sign in with
rememberMe=Remember me
noAccount=Don't have an account?
alreadyHaveAccount=Already have an account?
loginWithPasskey=Sign in with Passkey
useSecurityKey=Use security key
pilotMode=PILOT MODE
EOF
            ;;
    esac
}

# Generate themes for all instances
generate_all_themes() {
    print_step "Generating themes for all configured instances..."
    
    local instances_dir="${PROJECT_ROOT}/instances"
    
    if [[ ! -d "$instances_dir" ]]; then
        print_error "Instances directory not found: $instances_dir"
        exit 1
    fi
    
    local success_count=0
    local fail_count=0
    
    for instance_dir in "${instances_dir}"/*/; do
        if [[ -f "${instance_dir}instance.json" ]]; then
            local code=$(basename "$instance_dir" | tr '[:lower:]' '[:upper:]')
            if generate_theme "$code"; then
                ((success_count++))
            else
                ((fail_count++))
            fi
            echo ""
        fi
    done
    
    echo ""
    print_success "Generated ${success_count} themes"
    if [[ $fail_count -gt 0 ]]; then
        print_warning "Failed to generate ${fail_count} themes"
    fi
}

# Main
main() {
    print_header
    check_dependencies
    
    if [[ $# -lt 1 ]]; then
        usage
    fi
    
    local instance_code="$1"
    
    if [[ "$instance_code" == "all" ]]; then
        generate_all_themes
    else
        # Convert to uppercase for consistency
        instance_code=$(echo "$instance_code" | tr '[:lower:]' '[:upper:]')
        generate_theme "$instance_code"
    fi
    
    echo ""
    print_success "Theme generation complete!"
    echo ""
    echo -e "${CYAN}Next steps:${NC}"
    echo "  1. Restart Keycloak to pick up theme changes:"
    echo "     docker-compose restart keycloak"
    echo ""
    echo "  2. Verify theme in Keycloak Admin Console:"
    echo "     Realm Settings → Themes → Login Theme"
    echo ""
}

main "$@"


