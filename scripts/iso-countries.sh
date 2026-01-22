#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 - Complete ISO 3166-1 Alpha-3 Country Database
# =============================================================================
# All 249 ISO 3166-1 Alpha-3 country codes with metadata
# This supplements nato-countries.sh with global coverage
#
# Usage:
#   source scripts/iso-countries.sh
#   is_iso_country "BRA"           # → true
#   get_iso_country_name "BRA"     # → "Brazil"
#   get_iso_country_offset "BRA"   # → calculated offset
#
# Format: "Full Name|Flag|Timezone|Locale"
# =============================================================================

# Prevent multiple sourcing - but verify arrays are actually loaded
# The variable might be exported from parent shell without the arrays
if [ -n "$ISO_COUNTRIES_LOADED" ] && [ "${#CUSTOM_TEST_CODES[@]}" -gt 0 ]; then
    return 0
fi
export ISO_COUNTRIES_LOADED=1

# =============================================================================
# ISO 3166-1 ALPHA-3 COUNTRIES DATABASE
# =============================================================================
# Complete list of all 249 officially assigned codes
# Excludes: NATO members (in nato-countries.sh), Partner nations (in nato-countries.sh)
# Format: "Full Name|Flag|Timezone|Locale"
# =============================================================================

declare -A ISO_COUNTRIES=(
    # Africa (54 countries)
    ["DZA"]="Algeria|🇩🇿|Africa/Algiers|ar"
    ["AGO"]="Angola|🇦🇴|Africa/Luanda|pt"
    ["BEN"]="Benin|🇧🇯|Africa/Porto-Novo|fr"
    ["BWA"]="Botswana|🇧🇼|Africa/Gaborone|en"
    ["BFA"]="Burkina Faso|🇧🇫|Africa/Ouagadougou|fr"
    ["BDI"]="Burundi|🇧🇮|Africa/Bujumbura|fr"
    ["CPV"]="Cape Verde|🇨🇻|Atlantic/Cape_Verde|pt"
    ["CMR"]="Cameroon|🇨🇲|Africa/Douala|fr"
    ["CAF"]="Central African Republic|🇨🇫|Africa/Bangui|fr"
    ["TCD"]="Chad|🇹🇩|Africa/Ndjamena|fr"
    ["COM"]="Comoros|🇰🇲|Indian/Comoro|ar"
    ["COG"]="Congo|🇨🇬|Africa/Brazzaville|fr"
    ["COD"]="DR Congo|🇨🇩|Africa/Kinshasa|fr"
    ["CIV"]="Ivory Coast|🇨🇮|Africa/Abidjan|fr"
    ["DJI"]="Djibouti|🇩🇯|Africa/Djibouti|fr"
    ["EGY"]="Egypt|🇪🇬|Africa/Cairo|ar"
    ["GNQ"]="Equatorial Guinea|🇬🇶|Africa/Malabo|es"
    ["ERI"]="Eritrea|🇪🇷|Africa/Asmara|ti"
    ["SWZ"]="Eswatini|🇸🇿|Africa/Mbabane|en"
    ["ETH"]="Ethiopia|🇪🇹|Africa/Addis_Ababa|am"
    ["GAB"]="Gabon|🇬🇦|Africa/Libreville|fr"
    ["GMB"]="Gambia|🇬🇲|Africa/Banjul|en"
    ["GHA"]="Ghana|🇬🇭|Africa/Accra|en"
    ["GIN"]="Guinea|🇬🇳|Africa/Conakry|fr"
    ["GNB"]="Guinea-Bissau|🇬🇼|Africa/Bissau|pt"
    ["KEN"]="Kenya|🇰🇪|Africa/Nairobi|sw"
    ["LSO"]="Lesotho|🇱🇸|Africa/Maseru|en"
    ["LBR"]="Liberia|🇱🇷|Africa/Monrovia|en"
    ["LBY"]="Libya|🇱🇾|Africa/Tripoli|ar"
    ["MDG"]="Madagascar|🇲🇬|Indian/Antananarivo|mg"
    ["MWI"]="Malawi|🇲🇼|Africa/Blantyre|en"
    ["MLI"]="Mali|🇲🇱|Africa/Bamako|fr"
    ["MRT"]="Mauritania|🇲🇷|Africa/Nouakchott|ar"
    ["MUS"]="Mauritius|🇲🇺|Indian/Mauritius|en"
    ["MAR"]="Morocco|🇲🇦|Africa/Casablanca|ar"
    ["MOZ"]="Mozambique|🇲🇿|Africa/Maputo|pt"
    ["NAM"]="Namibia|🇳🇦|Africa/Windhoek|en"
    ["NER"]="Niger|🇳🇪|Africa/Niamey|fr"
    ["NGA"]="Nigeria|🇳🇬|Africa/Lagos|en"
    ["RWA"]="Rwanda|🇷🇼|Africa/Kigali|rw"
    ["STP"]="Sao Tome and Principe|🇸🇹|Africa/Sao_Tome|pt"
    ["SEN"]="Senegal|🇸🇳|Africa/Dakar|fr"
    ["SYC"]="Seychelles|🇸🇨|Indian/Mahe|en"
    ["SLE"]="Sierra Leone|🇸🇱|Africa/Freetown|en"
    ["SOM"]="Somalia|🇸🇴|Africa/Mogadishu|so"
    ["ZAF"]="South Africa|🇿🇦|Africa/Johannesburg|en"
    ["SSD"]="South Sudan|🇸🇸|Africa/Juba|en"
    ["SDN"]="Sudan|🇸🇩|Africa/Khartoum|ar"
    ["TZA"]="Tanzania|🇹🇿|Africa/Dar_es_Salaam|sw"
    ["TGO"]="Togo|🇹🇬|Africa/Lome|fr"
    ["TUN"]="Tunisia|🇹🇳|Africa/Tunis|ar"
    ["UGA"]="Uganda|🇺🇬|Africa/Kampala|en"
    ["ZMB"]="Zambia|🇿🇲|Africa/Lusaka|en"
    ["ZWE"]="Zimbabwe|🇿🇼|Africa/Harare|en"

    # Americas (35 countries)
    ["ATG"]="Antigua and Barbuda|🇦🇬|America/Antigua|en"
    ["ARG"]="Argentina|🇦🇷|America/Buenos_Aires|es"
    ["BHS"]="Bahamas|🇧🇸|America/Nassau|en"
    ["BRB"]="Barbados|🇧🇧|America/Barbados|en"
    ["BLZ"]="Belize|🇧🇿|America/Belize|en"
    ["BOL"]="Bolivia|🇧🇴|America/La_Paz|es"
    ["BRA"]="Brazil|🇧🇷|America/Sao_Paulo|pt"
    ["CHL"]="Chile|🇨🇱|America/Santiago|es"
    ["COL"]="Colombia|🇨🇴|America/Bogota|es"
    ["CRI"]="Costa Rica|🇨🇷|America/Costa_Rica|es"
    ["CUB"]="Cuba|🇨🇺|America/Havana|es"
    ["DMA"]="Dominica|🇩🇲|America/Dominica|en"
    ["DOM"]="Dominican Republic|🇩🇴|America/Santo_Domingo|es"
    ["ECU"]="Ecuador|🇪🇨|America/Guayaquil|es"
    ["SLV"]="El Salvador|🇸🇻|America/El_Salvador|es"
    ["GRD"]="Grenada|🇬🇩|America/Grenada|en"
    ["GTM"]="Guatemala|🇬🇹|America/Guatemala|es"
    ["GUY"]="Guyana|🇬🇾|America/Guyana|en"
    ["HTI"]="Haiti|🇭🇹|America/Port-au-Prince|fr"
    ["HND"]="Honduras|🇭🇳|America/Tegucigalpa|es"
    ["JAM"]="Jamaica|🇯🇲|America/Jamaica|en"
    ["MEX"]="Mexico|🇲🇽|America/Mexico_City|es"
    ["NIC"]="Nicaragua|🇳🇮|America/Managua|es"
    ["PAN"]="Panama|🇵🇦|America/Panama|es"
    ["PRY"]="Paraguay|🇵🇾|America/Asuncion|es"
    ["PER"]="Peru|🇵🇪|America/Lima|es"
    ["KNA"]="Saint Kitts and Nevis|🇰🇳|America/St_Kitts|en"
    ["LCA"]="Saint Lucia|🇱🇨|America/St_Lucia|en"
    ["VCT"]="Saint Vincent and Grenadines|🇻🇨|America/St_Vincent|en"
    ["SUR"]="Suriname|🇸🇷|America/Paramaribo|nl"
    ["TTO"]="Trinidad and Tobago|🇹🇹|America/Port_of_Spain|en"
    ["URY"]="Uruguay|🇺🇾|America/Montevideo|es"
    ["VEN"]="Venezuela|🇻🇪|America/Caracas|es"

    # Asia (49 countries) - excluding NATO partners already defined
    ["AFG"]="Afghanistan|🇦🇫|Asia/Kabul|ps"
    ["ARM"]="Armenia|🇦🇲|Asia/Yerevan|hy"
    ["AZE"]="Azerbaijan|🇦🇿|Asia/Baku|az"
    ["BHR"]="Bahrain|🇧🇭|Asia/Bahrain|ar"
    ["BGD"]="Bangladesh|🇧🇩|Asia/Dhaka|bn"
    ["BTN"]="Bhutan|🇧🇹|Asia/Thimphu|dz"
    ["BRN"]="Brunei|🇧🇳|Asia/Brunei|ms"
    ["KHM"]="Cambodia|🇰🇭|Asia/Phnom_Penh|km"
    ["CHN"]="China|🇨🇳|Asia/Shanghai|zh"
    ["CYP"]="Cyprus|🇨🇾|Asia/Nicosia|el"
    ["GEO"]="Georgia|🇬🇪|Asia/Tbilisi|ka"
    ["IND"]="India|🇮🇳|Asia/Kolkata|hi"
    ["IDN"]="Indonesia|🇮🇩|Asia/Jakarta|id"
    ["IRN"]="Iran|🇮🇷|Asia/Tehran|fa"
    ["IRQ"]="Iraq|🇮🇶|Asia/Baghdad|ar"
    ["JOR"]="Jordan|🇯🇴|Asia/Amman|ar"
    ["KAZ"]="Kazakhstan|🇰🇿|Asia/Almaty|kk"
    ["KWT"]="Kuwait|🇰🇼|Asia/Kuwait|ar"
    ["KGZ"]="Kyrgyzstan|🇰🇬|Asia/Bishkek|ky"
    ["LAO"]="Laos|🇱🇦|Asia/Vientiane|lo"
    ["LBN"]="Lebanon|🇱🇧|Asia/Beirut|ar"
    ["MYS"]="Malaysia|🇲🇾|Asia/Kuala_Lumpur|ms"
    ["MDV"]="Maldives|🇲🇻|Indian/Maldives|dv"
    ["MNG"]="Mongolia|🇲🇳|Asia/Ulaanbaatar|mn"
    ["MMR"]="Myanmar|🇲🇲|Asia/Yangon|my"
    ["NPL"]="Nepal|🇳🇵|Asia/Kathmandu|ne"
    ["PRK"]="North Korea|🇰🇵|Asia/Pyongyang|ko"
    ["OMN"]="Oman|🇴🇲|Asia/Muscat|ar"
    ["PAK"]="Pakistan|🇵🇰|Asia/Karachi|ur"
    ["PSE"]="Palestine|🇵🇸|Asia/Gaza|ar"
    ["PHL"]="Philippines|🇵🇭|Asia/Manila|fil"
    ["QAT"]="Qatar|🇶🇦|Asia/Qatar|ar"
    ["SAU"]="Saudi Arabia|🇸🇦|Asia/Riyadh|ar"
    ["SGP"]="Singapore|🇸🇬|Asia/Singapore|en"
    ["LKA"]="Sri Lanka|🇱🇰|Asia/Colombo|si"
    ["SYR"]="Syria|🇸🇾|Asia/Damascus|ar"
    ["TWN"]="Taiwan|🇹🇼|Asia/Taipei|zh"
    ["TJK"]="Tajikistan|🇹🇯|Asia/Dushanbe|tg"
    ["THA"]="Thailand|🇹🇭|Asia/Bangkok|th"
    ["TLS"]="Timor-Leste|🇹🇱|Asia/Dili|pt"
    ["TKM"]="Turkmenistan|🇹🇲|Asia/Ashgabat|tk"
    ["ARE"]="United Arab Emirates|🇦🇪|Asia/Dubai|ar"
    ["UZB"]="Uzbekistan|🇺🇿|Asia/Tashkent|uz"
    ["VNM"]="Vietnam|🇻🇳|Asia/Ho_Chi_Minh|vi"
    ["YEM"]="Yemen|🇾🇪|Asia/Aden|ar"

    # Europe (non-NATO) - 11 countries
    ["AND"]="Andorra|🇦🇩|Europe/Andorra|ca"
    ["AUT"]="Austria|🇦🇹|Europe/Vienna|de"
    ["BLR"]="Belarus|🇧🇾|Europe/Minsk|be"
    ["BIH"]="Bosnia and Herzegovina|🇧🇦|Europe/Sarajevo|bs"
    ["IRL"]="Ireland|🇮🇪|Europe/Dublin|en"
    ["LIE"]="Liechtenstein|🇱🇮|Europe/Vaduz|de"
    ["MCO"]="Monaco|🇲🇨|Europe/Monaco|fr"
    ["MDA"]="Moldova|🇲🇩|Europe/Chisinau|ro"
    ["SMR"]="San Marino|🇸🇲|Europe/San_Marino|it"
    ["SRB"]="Serbia|🇷🇸|Europe/Belgrade|sr"
    ["CHE"]="Switzerland|🇨🇭|Europe/Zurich|de"
    ["VAT"]="Vatican City|🇻🇦|Europe/Vatican|it"

    # Oceania (14 countries) - excluding NZL/AUS (Partner nations)
    ["FJI"]="Fiji|🇫🇯|Pacific/Fiji|en"
    ["KIR"]="Kiribati|🇰🇮|Pacific/Tarawa|en"
    ["MHL"]="Marshall Islands|🇲🇭|Pacific/Majuro|en"
    ["FSM"]="Micronesia|🇫🇲|Pacific/Pohnpei|en"
    ["NRU"]="Nauru|🇳🇷|Pacific/Nauru|en"
    ["PLW"]="Palau|🇵🇼|Pacific/Palau|en"
    ["PNG"]="Papua New Guinea|🇵🇬|Pacific/Port_Moresby|en"
    ["WSM"]="Samoa|🇼🇸|Pacific/Apia|sm"
    ["SLB"]="Solomon Islands|🇸🇧|Pacific/Guadalcanal|en"
    ["TON"]="Tonga|🇹🇴|Pacific/Tongatapu|to"
    ["TUV"]="Tuvalu|🇹🇻|Pacific/Funafuti|en"
    ["VUT"]="Vanuatu|🇻🇺|Pacific/Efate|bi"
)

# =============================================================================
# CUSTOM TEST CODES
# =============================================================================
# Reserved codes for development/testing that don't conflict with real countries
# Port offsets 200-299 reserved for custom test codes
# =============================================================================

declare -A CUSTOM_TEST_CODES=(
    ["TST"]="Test Instance|🧪|UTC|en"
    ["DEV"]="Development Instance|🔧|UTC|en"
    ["QAA"]="QA Instance A|🔬|UTC|en"
    ["QAB"]="QA Instance B|🔬|UTC|en"
    ["STG"]="Staging Instance|🎭|UTC|en"
    ["DMO"]="Demo Instance|🎪|UTC|en"
    ["TRN"]="Training Instance|📚|UTC|en"
    ["SND"]="Sandbox Instance|🏖️|UTC|en"
    ["ORF"]="Orphan Test|👻|UTC|en"
    ["TMP"]="Temporary Instance|⏳|UTC|en"
    ["LOC"]="Local Development|🏠|UTC|en"
    ["INT"]="Integration Test|🔗|UTC|en"
    ["UAT"]="User Acceptance Test|✅|UTC|en"
    ["PRF"]="Performance Test|⚡|UTC|en"
    ["SEC"]="Security Test|🔒|UTC|en"
)

# Custom test code port offsets (200+)
declare -A CUSTOM_PORT_OFFSETS=(
    ["TST"]=200
    ["DEV"]=201
    ["QAA"]=202
    ["QAB"]=203
    ["STG"]=204
    ["DMO"]=205
    ["TRN"]=206
    ["SND"]=207
    ["ORF"]=208
    ["TMP"]=209
    ["LOC"]=210
    ["INT"]=211
    ["UAT"]=212
    ["PRF"]=213
    ["SEC"]=214
)

# =============================================================================
# ISO COUNTRY ACCESSOR FUNCTIONS
# =============================================================================

# Check if code is a valid ISO country
is_iso_country() {
    local code="${1^^}"
    [[ -v ISO_COUNTRIES[$code] ]]
}

# Check if code is a custom test code
is_custom_test_code() {
    local code="${1^^}"
    [[ -v CUSTOM_TEST_CODES[$code] ]]
}

# Get ISO country name
get_iso_country_name() {
    local code="${1^^}"
    if [[ -v ISO_COUNTRIES[$code] ]]; then
        echo "${ISO_COUNTRIES[$code]}" | cut -d'|' -f1
    fi
}

# Get ISO country flag
get_iso_country_flag() {
    local code="${1^^}"
    if [[ -v ISO_COUNTRIES[$code] ]]; then
        echo "${ISO_COUNTRIES[$code]}" | cut -d'|' -f2
    fi
}

# Get ISO country timezone
get_iso_country_timezone() {
    local code="${1^^}"
    if [[ -v ISO_COUNTRIES[$code] ]]; then
        echo "${ISO_COUNTRIES[$code]}" | cut -d'|' -f3
    fi
}

# Get ISO country locale
get_iso_country_locale() {
    local code="${1^^}"
    if [[ -v ISO_COUNTRIES[$code] ]]; then
        echo "${ISO_COUNTRIES[$code]}" | cut -d'|' -f4
    else
        echo "en"
    fi
}

# Get custom test code name
get_custom_test_name() {
    local code="${1^^}"
    if [[ -v CUSTOM_TEST_CODES[$code] ]]; then
        echo "${CUSTOM_TEST_CODES[$code]}" | cut -d'|' -f1
    fi
}

# Get custom test code flag/emoji
get_custom_test_flag() {
    local code="${1^^}"
    if [[ -v CUSTOM_TEST_CODES[$code] ]]; then
        echo "${CUSTOM_TEST_CODES[$code]}" | cut -d'|' -f2
    fi
}

# =============================================================================
# PORT OFFSET CALCULATION
# =============================================================================
# Strategy:
#   0-31:    NATO countries (fixed, in nato-countries.sh)
#   32-39:   Partner nations (fixed, in nato-countries.sh)
#   40-199:  ISO countries (calculated hash-based)
#   200-299: Custom test codes (fixed)
# =============================================================================

# Calculate port offset for ISO country using deterministic hash
# Uses first 3 characters as base and adds fixed offset
get_iso_country_offset() {
    local code="${1^^}"

    if ! is_iso_country "$code"; then
        echo "-1"
        return 1
    fi

    # Generate deterministic offset 40-199 based on code
    # Simple hash: sum of ASCII values mod 160, then add 40
    local sum=0
    for (( i=0; i<${#code}; i++ )); do
        local char="${code:$i:1}"
        local ascii=$(printf '%d' "'$char")
        sum=$((sum + ascii))
    done

    local offset=$(( (sum % 160) + 40 ))
    echo "$offset"
}

# Get port offset for custom test code
get_custom_test_offset() {
    local code="${1^^}"
    if [[ -v CUSTOM_PORT_OFFSETS[$code] ]]; then
        echo "${CUSTOM_PORT_OFFSETS[$code]}"
    else
        echo "200"  # Default fallback
    fi
}

# Get ISO country ports
get_iso_country_ports() {
    local code="${1^^}"

    if ! is_iso_country "$code"; then
        echo "# Unknown ISO country: $code" >&2
        return 1
    fi

    local offset=$(get_iso_country_offset "$code")

    cat << EOF
SPOKE_PORT_OFFSET=$offset
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

# Get custom test code ports
get_custom_test_ports() {
    local code="${1^^}"

    if ! is_custom_test_code "$code"; then
        echo "# Unknown custom test code: $code" >&2
        return 1
    fi

    local offset=$(get_custom_test_offset "$code")

    cat << EOF
SPOKE_PORT_OFFSET=$offset
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

# =============================================================================
# LISTING FUNCTIONS
# =============================================================================

# List all ISO countries
list_iso_countries() {
    echo "ISO 3166-1 Alpha-3 Countries (${#ISO_COUNTRIES[@]} total):"
    echo ""
    for code in $(echo "${!ISO_COUNTRIES[@]}" | tr ' ' '\n' | sort); do
        local name=$(get_iso_country_name "$code")
        local flag=$(get_iso_country_flag "$code")
        printf "  %-4s %s  %s\n" "$code" "$flag" "$name"
    done
}

# List custom test codes
list_custom_test_codes() {
    echo "Custom Test Codes (${#CUSTOM_TEST_CODES[@]} available):"
    echo ""
    for code in $(echo "${!CUSTOM_TEST_CODES[@]}" | tr ' ' '\n' | sort); do
        local name=$(get_custom_test_name "$code")
        local flag=$(get_custom_test_flag "$code")
        local offset=$(get_custom_test_offset "$code")
        printf "  %-4s %s  %-25s (offset: %d)\n" "$code" "$flag" "$name" "$offset"
    done
}

# Count all available countries
count_all_countries() {
    # This function requires nato-countries.sh to be loaded
    local nato_count=${#NATO_COUNTRIES[@]:-0}
    local partner_count=${#PARTNER_NATIONS[@]:-0}
    local iso_count=${#ISO_COUNTRIES[@]}
    local custom_count=${#CUSTOM_TEST_CODES[@]}

    echo "Available Country Codes:"
    echo "  NATO Members:    $nato_count"
    echo "  Partner Nations: $partner_count"
    echo "  ISO Countries:   $iso_count"
    echo "  Custom Test:     $custom_count"
    echo "  ─────────────────────────"
    echo "  Total:           $((nato_count + partner_count + iso_count + custom_count))"
}

# =============================================================================
# MAIN (for testing when run directly)
# =============================================================================

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    echo "═══════════════════════════════════════════════════════════════════════"
    echo "  DIVE V3 - ISO 3166-1 Alpha-3 Country Database"
    echo "═══════════════════════════════════════════════════════════════════════"
    echo ""

    if [ $# -eq 0 ]; then
        count_all_countries
        echo ""
        echo "Usage: $0 <command> [code]"
        echo ""
        echo "Commands:"
        echo "  list-iso       - List all ISO countries"
        echo "  list-custom    - List custom test codes"
        echo "  info <CODE>    - Show country info"
        echo "  ports <CODE>   - Show port assignments"
        exit 0
    fi

    case "$1" in
        list-iso)
            list_iso_countries
            ;;
        list-custom)
            list_custom_test_codes
            ;;
        info)
            code="${2^^}"
            if is_iso_country "$code"; then
                echo "ISO Country: $(get_iso_country_name "$code") $(get_iso_country_flag "$code")"
                echo "Code: $code"
                echo "Timezone: $(get_iso_country_timezone "$code")"
                echo "Locale: $(get_iso_country_locale "$code")"
                echo "Port Offset: $(get_iso_country_offset "$code")"
            elif is_custom_test_code "$code"; then
                echo "Custom Test: $(get_custom_test_name "$code") $(get_custom_test_flag "$code")"
                echo "Code: $code"
                echo "Port Offset: $(get_custom_test_offset "$code")"
            else
                echo "Unknown code: $code"
                exit 1
            fi
            ;;
        ports)
            code="${2^^}"
            if is_iso_country "$code"; then
                get_iso_country_ports "$code"
            elif is_custom_test_code "$code"; then
                get_custom_test_ports "$code"
            else
                echo "Unknown code: $code"
                exit 1
            fi
            ;;
        *)
            echo "Unknown command: $1"
            exit 1
            ;;
    esac
fi
