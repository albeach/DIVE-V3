#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - NATO Member Countries Database
# =============================================================================
# Centralized metadata for all 32 NATO member countries
# ISO 3166-1 alpha-3 codes with full metadata for spoke deployment
#
# Usage:
#   source scripts/nato-countries.sh
#   get_country_name "GBR"        # → "United Kingdom"
#   get_country_flag "FRA"        # → "🇫🇷"
#   is_nato_country "USA"         # → true (exit 0)
#   get_country_offset "POL"      # → 22 (for port calculation)
#   list_nato_countries           # → sorted list of all countries
#
# Format: "Full Name|Flag|Primary Color|Secondary Color|Timezone|Join Year|Locale Code"
# Locale codes use ISO 639-1 (2-letter) format
# =============================================================================

# Associative array requires Bash 4+
declare -A NATO_COUNTRIES

# =============================================================================
# NATO MEMBER COUNTRIES (32 Total - as of 2024)
# =============================================================================
# Sorted alphabetically by ISO 3166-1 alpha-3 code
# Port offsets assigned 0-31 for deterministic, conflict-free port mapping
# Locale codes are ISO 639-1 (2-letter): en, de, fr, etc.
# =============================================================================

NATO_COUNTRIES=(
    # Founding Members (1949) - 12 countries
    ["BEL"]="Belgium|🇧🇪|#000000|#FDDA24|Europe/Brussels|1949|nl"
    ["CAN"]="Canada|🇨🇦|#FF0000|#FFFFFF|America/Toronto|1949|en"
    ["DNK"]="Denmark|🇩🇰|#C60C30|#FFFFFF|Europe/Copenhagen|1949|da"
    ["FRA"]="France|🇫🇷|#002395|#ED2939|Europe/Paris|1949|fr"
    ["ISL"]="Iceland|🇮🇸|#02529C|#DC1E35|Atlantic/Reykjavik|1949|is"
    ["ITA"]="Italy|🇮🇹|#009246|#CE2B37|Europe/Rome|1949|it"
    ["LUX"]="Luxembourg|🇱🇺|#00A1DE|#ED2939|Europe/Luxembourg|1949|fr"
    ["NLD"]="Netherlands|🇳🇱|#AE1C28|#21468B|Europe/Amsterdam|1949|nl"
    ["NOR"]="Norway|🇳🇴|#BA0C2F|#00205B|Europe/Oslo|1949|no"
    ["PRT"]="Portugal|🇵🇹|#006600|#FF0000|Europe/Lisbon|1949|pt"
    ["GBR"]="United Kingdom|🇬🇧|#012169|#C8102E|Europe/London|1949|en"
    ["USA"]="United States|🇺🇸|#002868|#BF0A30|America/New_York|1949|en"

    # Cold War Expansion (1952-1982) - 4 countries
    ["GRC"]="Greece|🇬🇷|#0D5EAF|#FFFFFF|Europe/Athens|1952|el"
    ["TUR"]="Turkey|🇹🇷|#E30A17|#FFFFFF|Europe/Istanbul|1952|tr"
    ["DEU"]="Germany|🇩🇪|#000000|#DD0000|Europe/Berlin|1955|de"
    ["ESP"]="Spain|🇪🇸|#AA151B|#F1BF00|Europe/Madrid|1982|es"

    # Post-Cold War Expansion (1999) - 3 countries
    ["CZE"]="Czechia|🇨🇿|#11457E|#D7141A|Europe/Prague|1999|cs"
    ["HUN"]="Hungary|🇭🇺|#CD2A3E|#436F4D|Europe/Budapest|1999|hu"
    ["POL"]="Poland|🇵🇱|#DC143C|#FFFFFF|Europe/Warsaw|1999|pl"

    # 2004 Expansion (Big Bang) - 7 countries
    ["BGR"]="Bulgaria|🇧🇬|#00966E|#D62612|Europe/Sofia|2004|bg"
    ["EST"]="Estonia|🇪🇪|#0072CE|#000000|Europe/Tallinn|2004|et"
    ["LVA"]="Latvia|🇱🇻|#9E3039|#FFFFFF|Europe/Riga|2004|lv"
    ["LTU"]="Lithuania|🇱🇹|#FDB913|#006A44|Europe/Vilnius|2004|lt"
    ["ROU"]="Romania|🇷🇴|#002B7F|#FCD116|Europe/Bucharest|2004|ro"
    ["SVK"]="Slovakia|🇸🇰|#0B4EA2|#EE1C25|Europe/Bratislava|2004|sk"
    ["SVN"]="Slovenia|🇸🇮|#005DA4|#ED1C24|Europe/Ljubljana|2004|sl"

    # 2009-2020 Expansion - 4 countries
    ["ALB"]="Albania|🇦🇱|#E41E20|#000000|Europe/Tirane|2009|sq"
    ["HRV"]="Croatia|🇭🇷|#FF0000|#171796|Europe/Zagreb|2009|hr"
    ["MNE"]="Montenegro|🇲🇪|#C40308|#D4AF37|Europe/Podgorica|2017|sr"
    ["MKD"]="North Macedonia|🇲🇰|#D20000|#FFE600|Europe/Skopje|2020|mk"

    # Nordic Expansion (2023-2024) - 2 countries
    ["FIN"]="Finland|🇫🇮|#002F6C|#FFFFFF|Europe/Helsinki|2023|fi"
    ["SWE"]="Sweden|🇸🇪|#006AA7|#FECC00|Europe/Stockholm|2024|sv"
)

# =============================================================================
# PORT OFFSET MAPPING (Deterministic, Conflict-Free)
# =============================================================================
# Fixed offsets 0-31 for all 32 NATO countries
# USA=0 (hub), then alphabetical by code for remaining countries
# Port calculations:
#   Frontend:  3000 + offset (3000-3031)
#   Backend:   4000 + offset (4000-4031)
#   Keycloak:  8443 + offset (8443-8474)
#   Postgres:  5432 + offset (5432-5463)
#   MongoDB:   27017 + offset (27017-27048)
#   Redis:     6379 + offset (6379-6410)
#   OPA:       8181 + (offset * 10) (8181-8491) - larger gaps to avoid conflicts
#   KAS:       9000 + offset (9000-9031)
# =============================================================================

declare -A NATO_PORT_OFFSETS

NATO_PORT_OFFSETS=(
    # USA as hub gets offset 0
    ["USA"]=0

    # Remaining 31 countries in alphabetical order (offsets 1-31)
    ["ALB"]=1
    ["BEL"]=2
    ["BGR"]=3
    ["CAN"]=4
    ["HRV"]=5
    ["CZE"]=6
    ["DNK"]=7
    ["EST"]=8
    ["FIN"]=9
    ["FRA"]=10
    ["DEU"]=11
    ["GRC"]=12
    ["HUN"]=13
    ["ISL"]=14
    ["ITA"]=15
    ["LVA"]=16
    ["LTU"]=17
    ["LUX"]=18
    ["MNE"]=19
    ["NLD"]=20
    ["MKD"]=21
    ["NOR"]=22
    ["POL"]=23
    ["PRT"]=24
    ["ROU"]=25
    ["SVK"]=26
    ["SVN"]=27
    ["ESP"]=28
    ["SWE"]=29
    ["TUR"]=30
    ["GBR"]=31
)

# =============================================================================
# ACCESSOR FUNCTIONS
# =============================================================================

# Get full country name
# Usage: get_country_name "GBR" → "United Kingdom"
get_country_name() {
    local code="${1^^}"
    if [[ -v NATO_COUNTRIES[$code] ]]; then
        echo "${NATO_COUNTRIES[$code]}" | cut -d'|' -f1
    else
        echo ""
    fi
}

# Get country flag emoji
# Usage: get_country_flag "FRA" → "🇫🇷"
get_country_flag() {
    local code="${1^^}"
    if [[ -v NATO_COUNTRIES[$code] ]]; then
        echo "${NATO_COUNTRIES[$code]}" | cut -d'|' -f2
    else
        echo ""
    fi
}

# Get primary color (hex)
# Usage: get_country_primary_color "USA" → "#002868"
get_country_primary_color() {
    local code="${1^^}"
    if [[ -v NATO_COUNTRIES[$code] ]]; then
        echo "${NATO_COUNTRIES[$code]}" | cut -d'|' -f3
    else
        echo ""
    fi
}

# Get secondary color (hex)
# Usage: get_country_secondary_color "USA" → "#BF0A30"
get_country_secondary_color() {
    local code="${1^^}"
    if [[ -v NATO_COUNTRIES[$code] ]]; then
        echo "${NATO_COUNTRIES[$code]}" | cut -d'|' -f4
    else
        echo ""
    fi
}

# Get timezone
# Usage: get_country_timezone "GBR" → "Europe/London"
get_country_timezone() {
    local code="${1^^}"
    if [[ -v NATO_COUNTRIES[$code] ]]; then
        echo "${NATO_COUNTRIES[$code]}" | cut -d'|' -f5
    else
        echo ""
    fi
}

# Get NATO join year
# Usage: get_country_join_year "POL" → "1999"
get_country_join_year() {
    local code="${1^^}"
    if [[ -v NATO_COUNTRIES[$code] ]]; then
        echo "${NATO_COUNTRIES[$code]}" | cut -d'|' -f6
    else
        echo ""
    fi
}

# Get locale code (ISO 639-1)
# Usage: get_country_locale "HRV" → "hr"
get_country_locale() {
    local code="${1^^}"
    if [[ -v NATO_COUNTRIES[$code] ]]; then
        echo "${NATO_COUNTRIES[$code]}" | cut -d'|' -f7
    else
        echo "en"  # Default to English if unknown
    fi
}

# Get port offset for country
# Usage: get_country_offset "GBR" → 31
get_country_offset() {
    local code="${1^^}"
    if [[ -v NATO_PORT_OFFSETS[$code] ]]; then
        echo "${NATO_PORT_OFFSETS[$code]}"
    else
        echo "-1"
    fi
}

# Check if code is a valid NATO country
# Usage: if is_nato_country "GBR"; then echo "Valid"; fi
is_nato_country() {
    local code="${1^^}"
    [[ -v NATO_COUNTRIES[$code] ]]
}

# =============================================================================
# PORT CALCULATION FUNCTIONS
# =============================================================================

# Get all ports for a country
# Usage: eval "$(get_country_ports 'GBR')"
#        echo $SPOKE_FRONTEND_PORT  # → 3031
get_country_ports() {
    local code="${1^^}"
    local offset

    if ! is_nato_country "$code"; then
        echo "# ERROR: $code is not a valid NATO country code"
        return 1
    fi

    offset="${NATO_PORT_OFFSETS[$code]}"

    # Export calculated ports
    echo "SPOKE_PORT_OFFSET=$offset"
    echo "SPOKE_FRONTEND_PORT=$((3000 + offset))"
    echo "SPOKE_BACKEND_PORT=$((4000 + offset))"
    echo "SPOKE_KEYCLOAK_HTTPS_PORT=$((8443 + offset))"
    echo "SPOKE_KEYCLOAK_HTTP_PORT=$((8080 + offset))"
    echo "SPOKE_POSTGRES_PORT=$((5432 + offset))"
    echo "SPOKE_MONGODB_PORT=$((27017 + offset))"
    echo "SPOKE_REDIS_PORT=$((6379 + offset))"
    echo "SPOKE_OPA_PORT=$((8181 + offset * 10))"
    echo "SPOKE_KAS_PORT=$((9000 + offset))"
}

# =============================================================================
# LISTING FUNCTIONS
# =============================================================================

# List all NATO countries (sorted by code)
# Usage: list_nato_countries
list_nato_countries() {
    for code in $(echo "${!NATO_COUNTRIES[@]}" | tr ' ' '\n' | sort); do
        local name=$(get_country_name "$code")
        local flag=$(get_country_flag "$code")
        local year=$(get_country_join_year "$code")
        local offset=$(get_country_offset "$code")
        printf "%-4s %s  %-20s (Joined: %s, Offset: %2d)\n" "$code" "$flag" "$name" "$year" "$offset"
    done
}

# List countries in table format (for CLI output)
# Usage: list_nato_countries_table
list_nato_countries_table() {
    echo "┌──────┬────┬──────────────────────┬────────┬────────┐"
    echo "│ Code │ 🏳️  │ Country              │ Joined │ Offset │"
    echo "├──────┼────┼──────────────────────┼────────┼────────┤"
    for code in $(echo "${!NATO_COUNTRIES[@]}" | tr ' ' '\n' | sort); do
        local name=$(get_country_name "$code")
        local flag=$(get_country_flag "$code")
        local year=$(get_country_join_year "$code")
        local offset=$(get_country_offset "$code")
        printf "│ %-4s │ %s │ %-20s │  %s  │   %2d   │\n" "$code" "$flag" "$name" "$year" "$offset"
    done
    echo "└──────┴────┴──────────────────────┴────────┴────────┘"
    echo ""
    echo "Total: ${#NATO_COUNTRIES[@]} NATO member countries"
}

# List countries with ports
# Usage: list_nato_ports
list_nato_ports() {
    echo "┌──────┬──────────────────────┬──────────┬─────────┬──────────┬──────────┐"
    echo "│ Code │ Country              │ Frontend │ Backend │ Keycloak │ Postgres │"
    echo "├──────┼──────────────────────┼──────────┼─────────┼──────────┼──────────┤"
    for code in $(echo "${!NATO_COUNTRIES[@]}" | tr ' ' '\n' | sort); do
        local name=$(get_country_name "$code")
        local offset=${NATO_PORT_OFFSETS[$code]}
        local frontend=$((3000 + offset))
        local backend=$((4000 + offset))
        local keycloak=$((8443 + offset))
        local postgres=$((5432 + offset))
        printf "│ %-4s │ %-20s │  %5d   │  %5d  │   %5d  │   %5d  │\n" \
            "$code" "$name" "$frontend" "$backend" "$keycloak" "$postgres"
    done
    echo "└──────┴──────────────────────┴──────────┴─────────┴──────────┴──────────┘"
}

# Get country info as JSON
# Usage: get_country_json "GBR"
get_country_json() {
    local code="${1^^}"

    if ! is_nato_country "$code"; then
        echo "{\"error\": \"Invalid NATO country code: $code\"}"
        return 1
    fi

    local name=$(get_country_name "$code")
    local flag=$(get_country_flag "$code")
    local primary=$(get_country_primary_color "$code")
    local secondary=$(get_country_secondary_color "$code")
    local timezone=$(get_country_timezone "$code")
    local year=$(get_country_join_year "$code")
    local offset=$(get_country_offset "$code")
    local locale=$(get_country_locale "$code")

    cat <<EOF
{
  "code": "$code",
  "name": "$name",
  "flag": "$flag",
  "locale": "$locale",
  "colors": {
    "primary": "$primary",
    "secondary": "$secondary"
  },
  "timezone": "$timezone",
  "natoJoinYear": $year,
  "portOffset": $offset,
  "ports": {
    "frontend": $((3000 + offset)),
    "backend": $((4000 + offset)),
    "keycloak": $((8443 + offset)),
    "postgres": $((5432 + offset)),
    "mongodb": $((27017 + offset)),
    "redis": $((6379 + offset)),
    "opa": $((8181 + offset * 10)),
    "kas": $((9000 + offset))
  }
}
EOF
}

# =============================================================================
# VALIDATION FUNCTIONS
# =============================================================================

# Validate country code and return detailed error
# Usage: validate_nato_country "XYZ" → error message or empty if valid
validate_nato_country() {
    local code="${1^^}"

    if [ -z "$code" ]; then
        echo "ERROR: Country code is required"
        return 1
    fi

    if [ ${#code} -ne 3 ]; then
        echo "ERROR: Country code must be exactly 3 characters (ISO 3166-1 alpha-3)"
        return 1
    fi

    if ! is_nato_country "$code"; then
        echo "ERROR: '$code' is not a valid NATO member country code"
        echo ""
        echo "Valid NATO country codes:"
        list_nato_countries | head -10
        echo "... (use 'list_nato_countries' for full list)"
        return 1
    fi

    return 0
}

# Check for port conflicts between countries
# Usage: check_port_conflicts
check_port_conflicts() {
    local -A seen_ports
    local conflicts=0

    for code in "${!NATO_COUNTRIES[@]}"; do
        local offset=${NATO_PORT_OFFSETS[$code]}
        local frontend=$((3000 + offset))
        local backend=$((4000 + offset))
        local keycloak=$((8443 + offset))

        for port in $frontend $backend $keycloak; do
            if [[ -v seen_ports[$port] ]]; then
                echo "CONFLICT: Port $port used by both ${seen_ports[$port]} and $code"
                ((conflicts++))
            else
                seen_ports[$port]="$code"
            fi
        done
    done

    if [ $conflicts -eq 0 ]; then
        echo "✓ No port conflicts detected across all 32 NATO countries"
        return 0
    else
        echo "✗ Found $conflicts port conflicts!"
        return 1
    fi
}

# =============================================================================
# PARTNER NATIONS (Non-NATO, for future expansion)
# =============================================================================
# These are not NATO members but may participate in exercises/pilots
# Port offsets 32-39 reserved for partner nations

declare -A PARTNER_NATIONS=(
    ["AUS"]="Australia|🇦🇺|#002868|#FFFFFF|Australia/Sydney|PARTNER|en"
    ["NZL"]="New Zealand|🇳🇿|#00247D|#CC142B|Pacific/Auckland|PARTNER|en"
    ["JPN"]="Japan|🇯🇵|#BC002D|#FFFFFF|Asia/Tokyo|PARTNER|ja"
    ["KOR"]="South Korea|🇰🇷|#003478|#C60C30|Asia/Seoul|PARTNER|ko"
    ["ISR"]="Israel|🇮🇱|#0038B8|#FFFFFF|Asia/Jerusalem|PARTNER|he"
    ["UKR"]="Ukraine|🇺🇦|#0057B7|#FFDD00|Europe/Kyiv|PARTNER|uk"
)

# Partner nation port offsets (32-39)
declare -A PARTNER_PORT_OFFSETS=(
    ["AUS"]=32
    ["NZL"]=33
    ["JPN"]=34
    ["KOR"]=35
    ["ISR"]=36
    ["UKR"]=37
)

# Check if code is a partner nation
is_partner_nation() {
    local code="${1^^}"
    [[ -v PARTNER_NATIONS[$code] ]]
}

# Get partner nation name
get_partner_name() {
    local code="${1^^}"
    if [[ -v PARTNER_NATIONS[$code] ]]; then
        echo "${PARTNER_NATIONS[$code]}" | cut -d'|' -f1
    fi
}

# Get partner nation flag
get_partner_flag() {
    local code="${1^^}"
    if [[ -v PARTNER_NATIONS[$code] ]]; then
        echo "${PARTNER_NATIONS[$code]}" | cut -d'|' -f2
    fi
}

# Get partner nation primary color
get_partner_primary_color() {
    local code="${1^^}"
    if [[ -v PARTNER_NATIONS[$code] ]]; then
        echo "${PARTNER_NATIONS[$code]}" | cut -d'|' -f3
    fi
}

# Get partner nation secondary color
get_partner_secondary_color() {
    local code="${1^^}"
    if [[ -v PARTNER_NATIONS[$code] ]]; then
        echo "${PARTNER_NATIONS[$code]}" | cut -d'|' -f4
    fi
}

# Get partner nation timezone
get_partner_timezone() {
    local code="${1^^}"
    if [[ -v PARTNER_NATIONS[$code] ]]; then
        echo "${PARTNER_NATIONS[$code]}" | cut -d'|' -f5
    fi
}

# Get partner nation locale code (ISO 639-1)
# Usage: get_partner_locale "NZL" → "en"
get_partner_locale() {
    local code="${1^^}"
    if [[ -v PARTNER_NATIONS[$code] ]]; then
        echo "${PARTNER_NATIONS[$code]}" | cut -d'|' -f7
    else
        echo "en"  # Default to English
    fi
}

# Get partner nation port offset
get_partner_offset() {
    local code="${1^^}"
    if [[ -v PARTNER_PORT_OFFSETS[$code] ]]; then
        echo "${PARTNER_PORT_OFFSETS[$code]}"
    else
        echo "32"  # Default fallback
    fi
}

# Get partner nation ports (same formula as NATO countries)
get_partner_ports() {
    local code="${1^^}"
    if ! is_partner_nation "$code"; then
        echo "# Unknown partner nation: $code" >&2
        return 1
    fi

    local offset=$(get_partner_offset "$code")

    # Same port calculation as NATO countries
    cat << EOF
SPOKE_FRONTEND_PORT=$((3000 + offset))
SPOKE_BACKEND_PORT=$((4000 + offset))
SPOKE_KEYCLOAK_HTTPS_PORT=$((8443 + offset))
SPOKE_KEYCLOAK_HTTP_PORT=$((8080 + offset))
SPOKE_POSTGRES_PORT=$((5432 + offset))
SPOKE_MONGODB_PORT=$((27017 + offset))
SPOKE_REDIS_PORT=$((6379 + offset))
SPOKE_OPA_PORT=$((8181 + (offset * 10)))
SPOKE_KAS_PORT=$((9000 + offset))
EOF
}

# List all partner nations
list_partner_nations() {
    for code in $(echo "${!PARTNER_NATIONS[@]}" | tr ' ' '\n' | sort); do
        local name=$(get_partner_name "$code")
        local flag=$(get_partner_flag "$code")
        echo "$code: $name $flag"
    done
}

# =============================================================================
# LOAD ISO COUNTRIES DATABASE (for extended country support)
# =============================================================================
# Source iso-countries.sh for ISO 3166-1 Alpha-3 and custom test codes
_iso_script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "${_iso_script_dir}/iso-countries.sh" ]; then
    source "${_iso_script_dir}/iso-countries.sh"
fi
unset _iso_script_dir

# =============================================================================
# UNIFIED COUNTRY FUNCTIONS (Works with NATO, Partner, ISO, and Custom codes)
# =============================================================================

# Check if code is any valid country (NATO, Partner, ISO, or Custom Test)
is_valid_country() {
    local code="${1^^}"
    is_nato_country "$code" || is_partner_nation "$code" || \
    { type is_iso_country &>/dev/null && is_iso_country "$code"; } || \
    { type is_custom_test_code &>/dev/null && is_custom_test_code "$code"; }
}

# Get country name (unified - supports NATO, Partner, ISO, and Custom)
get_any_country_name() {
    local code="${1^^}"
    if is_nato_country "$code"; then
        get_country_name "$code"
    elif is_partner_nation "$code"; then
        get_partner_name "$code"
    elif type is_iso_country &>/dev/null && is_iso_country "$code"; then
        get_iso_country_name "$code"
    elif type is_custom_test_code &>/dev/null && is_custom_test_code "$code"; then
        get_custom_test_name "$code"
    fi
}

# Get country flag (unified - supports NATO, Partner, ISO, and Custom)
get_any_country_flag() {
    local code="${1^^}"
    if is_nato_country "$code"; then
        get_country_flag "$code"
    elif is_partner_nation "$code"; then
        get_partner_flag "$code"
    elif type is_iso_country &>/dev/null && is_iso_country "$code"; then
        get_iso_country_flag "$code"
    elif type is_custom_test_code &>/dev/null && is_custom_test_code "$code"; then
        get_custom_test_flag "$code"
    fi
}

# Get country timezone (unified - supports NATO, Partner, ISO, and Custom)
get_any_country_timezone() {
    local code="${1^^}"
    if is_nato_country "$code"; then
        get_country_timezone "$code"
    elif is_partner_nation "$code"; then
        get_partner_timezone "$code"
    elif type is_iso_country &>/dev/null && is_iso_country "$code"; then
        get_iso_country_timezone "$code"
    elif type is_custom_test_code &>/dev/null && is_custom_test_code "$code"; then
        echo "UTC"  # Custom test codes use UTC
    fi
}

# Get country ports (unified - supports NATO, Partner, ISO, and Custom)
get_any_country_ports() {
    local code="${1^^}"
    if is_nato_country "$code"; then
        get_country_ports "$code"
    elif is_partner_nation "$code"; then
        get_partner_ports "$code"
    elif type is_iso_country &>/dev/null && is_iso_country "$code"; then
        get_iso_country_ports "$code"
    elif type is_custom_test_code &>/dev/null && is_custom_test_code "$code"; then
        get_custom_test_ports "$code"
    fi
}

# Get country offset (unified - supports NATO, Partner, ISO, and Custom)
get_any_country_offset() {
    local code="${1^^}"
    if is_nato_country "$code"; then
        get_country_offset "$code"
    elif is_partner_nation "$code"; then
        get_partner_offset "$code"
    elif type is_iso_country &>/dev/null && is_iso_country "$code"; then
        get_iso_country_offset "$code"
    elif type is_custom_test_code &>/dev/null && is_custom_test_code "$code"; then
        get_custom_test_offset "$code"
    fi
}

# Get country locale code (unified - supports NATO, Partner, ISO, and Custom)
# Usage: get_any_country_locale "HRV" → "hr"
get_any_country_locale() {
    local code="${1^^}"
    if is_nato_country "$code"; then
        get_country_locale "$code"
    elif is_partner_nation "$code"; then
        get_partner_locale "$code"
    elif type is_iso_country &>/dev/null && is_iso_country "$code"; then
        get_iso_country_locale "$code"
    else
        echo "en"  # Default to English (custom test codes)
    fi
}

# Get country type (returns: NATO, PARTNER, ISO, CUSTOM, or UNKNOWN)
get_country_type() {
    local code="${1^^}"
    if is_nato_country "$code"; then
        echo "NATO"
    elif is_partner_nation "$code"; then
        echo "PARTNER"
    elif type is_iso_country &>/dev/null && is_iso_country "$code"; then
        echo "ISO"
    elif type is_custom_test_code &>/dev/null && is_custom_test_code "$code"; then
        echo "CUSTOM"
    else
        echo "UNKNOWN"
    fi
}

# =============================================================================
# MAIN (for testing when run directly)
# =============================================================================

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    echo "═══════════════════════════════════════════════════════════════════════"
    echo "  DIVE V3 - NATO Member Countries Database"
    echo "═══════════════════════════════════════════════════════════════════════"
    echo ""
    echo "Total NATO Members: ${#NATO_COUNTRIES[@]}"
    echo ""

    # Show usage if no arguments
    if [ $# -eq 0 ]; then
        echo "Usage: $0 <command> [country_code]"
        echo ""
        echo "Commands:"
        echo "  list          - List all NATO countries"
        echo "  table         - Show countries in table format"
        echo "  ports         - Show port assignments for all countries"
        echo "  info <CODE>   - Show detailed info for a country"
        echo "  json <CODE>   - Show country info as JSON"
        echo "  validate      - Check for port conflicts"
        echo ""
        echo "Examples:"
        echo "  $0 list"
        echo "  $0 info GBR"
        echo "  $0 json USA"
        exit 0
    fi

    case "$1" in
        list)
            list_nato_countries
            ;;
        table)
            list_nato_countries_table
            ;;
        ports)
            list_nato_ports
            ;;
        info)
            if [ -z "$2" ]; then
                echo "ERROR: Country code required"
                exit 1
            fi
            code="${2^^}"
            if is_nato_country "$code"; then
                echo "Country: $(get_country_name "$code") $(get_country_flag "$code")"
                echo "Code: $code"
                echo "Colors: $(get_country_primary_color "$code") / $(get_country_secondary_color "$code")"
                echo "Timezone: $(get_country_timezone "$code")"
                echo "NATO Member Since: $(get_country_join_year "$code")"
                echo ""
                echo "Port Assignments:"
                eval "$(get_country_ports "$code")"
                echo "  Frontend:  $SPOKE_FRONTEND_PORT"
                echo "  Backend:   $SPOKE_BACKEND_PORT"
                echo "  Keycloak:  $SPOKE_KEYCLOAK_HTTPS_PORT"
                echo "  Postgres:  $SPOKE_POSTGRES_PORT"
                echo "  MongoDB:   $SPOKE_MONGODB_PORT"
                echo "  Redis:     $SPOKE_REDIS_PORT"
                echo "  OPA:       $SPOKE_OPA_PORT"
                echo "  KAS:       $SPOKE_KAS_PORT"
            else
                echo "ERROR: Invalid NATO country code: $code"
                exit 1
            fi
            ;;
        json)
            if [ -z "$2" ]; then
                echo "ERROR: Country code required"
                exit 1
            fi
            get_country_json "$2"
            ;;
        validate)
            check_port_conflicts
            ;;
        *)
            echo "Unknown command: $1"
            exit 1
            ;;
    esac
fi

