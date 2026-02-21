#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Guided Mode Framework
# =============================================================================
# Output helpers for the Guided CLI experience. All functions are NO-OPS in
# Pro mode so pipeline code can call them unconditionally.
#
# Usage:
#   source "${MODULES_DIR}/guided/framework.sh"
#   guided_explain "What is a Hub?" "$GUIDED_MSG_HUB_WHAT"
#   guided_ask "Enter your Hub domain:" HUB_DOMAIN "" "The web address of..."
#   guided_confirm "Deploy spoke FRA to dev-fra.dive25.com?"
# =============================================================================

# Guard against double-sourcing
[ -n "${_GUIDED_FRAMEWORK_LOADED:-}" ] && return 0
_GUIDED_FRAMEWORK_LOADED=1

# Terminal width for box drawing (fallback 80)
_guided_term_width() {
    local w
    w=$(tput cols 2>/dev/null) || w=80
    [ "$w" -gt 120 ] && w=120
    echo "$w"
}

# =============================================================================
# CORE OUTPUT FUNCTIONS
# =============================================================================

# Print a boxed explanation with title and body text.
# In Pro mode: no-op. In Guided mode: renders a clean bordered box.
# Usage: guided_explain "Title" "Body text line 1\nLine 2"
guided_explain() {
    is_guided || return 0
    local title="$1" body="$2"
    local width
    width=$(_guided_term_width)
    local inner=$((width - 4))

    echo ""
    printf "  ${BOLD}${CYAN}%s${NC}\n" "$title"
    printf "  ${DIM}"
    printf '%*s' "$inner" '' | tr ' ' '─'
    printf "${NC}\n"
    # Print body, wrapping long lines
    echo "$body" | while IFS= read -r line; do
        printf "  %s\n" "$line"
    done
    echo ""
}

# Interactive prompt that stores the answer in the named variable.
# In Pro mode: silently uses env var or default (no prompt).
# Usage: guided_ask "What is your Hub address?" HUB_DOMAIN "dev-usa.dive25.com" "Help text"
guided_ask() {
    local question="$1" var_name="$2" default="$3" help_text="${4:-}"

    if is_guided; then
        # Show help text if provided
        if [ -n "$help_text" ]; then
            printf "  ${DIM}%s${NC}\n" "$help_text"
        fi
        local value
        if [ -n "$default" ]; then
            read -r -p "  ${BOLD}${question}${NC} [${CYAN}${default}${NC}]: " value
        else
            read -r -p "  ${BOLD}${question}${NC}: " value
        fi
        # Use entered value, or existing env var, or default
        value="${value:-${!var_name:-$default}}"
        printf -v "$var_name" '%s' "$value"
        export "$var_name"
    else
        # Pro mode: use env var if set, otherwise default
        local current="${!var_name:-$default}"
        printf -v "$var_name" '%s' "$current"
        export "$var_name"
    fi
}

# Multiple-choice prompt with recommendation highlight.
# In Pro mode: silently uses env var or recommended value.
# Usage: guided_ask_choice "Pick a provider" PROVIDER "vault:Vault (Recommended)" "env:Environment files" "" "Help"
guided_ask_choice() {
    local question="$1" var_name="$2"
    shift 2
    local recommended="" help_text="" options=()

    # Collect options until we hit empty string (separator) or run out
    while [ $# -gt 0 ] && [ -n "$1" ]; do
        options+=("$1")
        shift
    done
    # Skip empty separator
    [ $# -gt 0 ] && [ -z "$1" ] && shift
    # Remaining is help text
    help_text="${1:-}"

    if is_guided; then
        if [ -n "$help_text" ]; then
            printf "  ${DIM}%s${NC}\n" "$help_text"
        fi
        printf "\n  ${BOLD}%s${NC}\n" "$question"
        local i=1
        for opt in "${options[@]}"; do
            local key="${opt%%:*}"
            local label="${opt#*:}"
            printf "    ${CYAN}%d)${NC} %s\n" "$i" "$label"
            i=$((i + 1))
        done
        local choice
        read -r -p "  Enter choice (1-${#options[@]}): " choice
        if [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le "${#options[@]}" ]; then
            local selected="${options[$((choice - 1))]}"
            local key="${selected%%:*}"
            printf -v "$var_name" '%s' "$key"
        else
            # Default to first option
            local first="${options[0]}"
            printf -v "$var_name" '%s' "${first%%:*}"
        fi
        export "$var_name"
    else
        # Pro mode: use env var or first option's key
        if [ -z "${!var_name:-}" ]; then
            local first="${options[0]}"
            printf -v "$var_name" '%s' "${first%%:*}"
        fi
        export "$var_name"
    fi
}

# Show a summary and ask for Y/n confirmation.
# In Pro mode: auto-confirms (returns 0).
# Usage: guided_confirm "Hub: dev-usa\nSpoke: FRA"
guided_confirm() {
    is_guided || return 0
    local summary="$1"

    echo ""
    printf "  ${BOLD}${CYAN}Summary${NC}\n"
    printf "  ${DIM}"
    printf '%*s' 40 '' | tr ' ' '─'
    printf "${NC}\n"
    echo "$summary" | while IFS= read -r line; do
        printf "  %s\n" "$line"
    done
    printf "  ${DIM}"
    printf '%*s' 40 '' | tr ' ' '─'
    printf "${NC}\n"
    echo ""
    local answer
    read -r -p "  ${BOLD}Continue? [Y/n]:${NC} " answer
    case "$answer" in
        [nN]|[nN][oO])
            echo "  Cancelled."
            return 1
            ;;
        *)
            return 0
            ;;
    esac
}

# =============================================================================
# PROGRESS & STATUS FUNCTIONS
# =============================================================================

# Show phase progress with a plain-language description.
# In Pro mode: no-op (the pipeline already has its own logging).
# Usage: guided_progress "DEPLOYMENT" "Starting all services..."
guided_progress() {
    is_guided || return 0
    local phase_name="$1" description="$2"

    echo ""
    printf "  ${BOLD}${GREEN}▶ %s${NC}\n" "$phase_name"
    printf "  %s\n" "$description"
    echo ""
}

# Celebratory success message.
# In Pro mode: no-op (pipeline uses log_success).
# Usage: guided_success "Your spoke is deployed and connected to the Hub!"
guided_success() {
    is_guided || return 0
    local message="$1"

    echo ""
    printf "  ${BOLD}${GREEN}✓ Success!${NC}\n"
    printf "  %s\n" "$message"
    echo ""
}

# Warning with plain-language remediation.
# In Pro mode: no-op (pipeline uses log_warn).
# Usage: guided_warn "Certificate expires soon" "Run ./dive certs renew to fix this"
guided_warn() {
    is_guided || return 0
    local message="$1" what_to_do="${2:-}"

    echo ""
    printf "  ${BOLD}${YELLOW}⚠ %s${NC}\n" "$message"
    if [ -n "$what_to_do" ]; then
        printf "  ${DIM}%s${NC}\n" "$what_to_do"
    fi
    echo ""
}

# Error with context and fix instructions.
# In Pro mode: no-op (pipeline uses log_error).
# Usage: guided_error "Registration failed" "The Hub couldn't verify this spoke" "Ask your Hub admin to run: ./dive spoke authorize FRA"
guided_error() {
    is_guided || return 0
    local message="$1" what_happened="${2:-}" how_to_fix="${3:-}"

    echo ""
    printf "  ${BOLD}${RED}✗ %s${NC}\n" "$message"
    if [ -n "$what_happened" ]; then
        printf "  %s\n" "$what_happened"
    fi
    if [ -n "$how_to_fix" ]; then
        echo ""
        printf "  ${BOLD}How to fix:${NC} %s\n" "$how_to_fix"
    fi
    echo ""
}

# =============================================================================
# GUIDED STEP COUNTER
# =============================================================================
# Track and display step numbers in guided flows.

_GUIDED_STEP=0

# Reset step counter (call at the start of a guided flow)
guided_step_reset() {
    _GUIDED_STEP=0
}

# Increment and display a numbered step.
# Usage: guided_step "Connecting to the Hub"
guided_step() {
    is_guided || return 0
    local description="$1"
    _GUIDED_STEP=$((_GUIDED_STEP + 1))
    printf "\n  ${BOLD}${CYAN}Step %d:${NC} %s\n" "$_GUIDED_STEP" "$description"
}
