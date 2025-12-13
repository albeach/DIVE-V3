# DIVE V3 NATO 32-Country Expansion - AI Session Prompt

## Executive Summary

Expand the DIVE V3 federated identity platform to support **all 32 NATO member countries** with:
- Pre-generated Terraform templates per country
- Country-specific Keycloak themes (branding, colors, flags)
- Frontend customizations (country selector, localization)
- Automated "spoke-in-a-box" deployment for any NATO country

**You have explicit approval to leverage:** GCloud CLI, GitHub CLI, Keycloak CLI/API, Docker, Terraform, mkcert, kcadm.sh, and any tools needed. All Docker resources contain fake/dummy data and can be nuked/recreated freely.

---

## Part 1: Session Context (From Previous Chat)

### 1.1 What Was Accomplished

The previous session focused on creating a **resilient, persistent "spoke-in-a-box"** solution:

1. **Fixed spoke initialization** (`scripts/dive-modules/spoke.sh`):
   - Unified port calculation via `_get_spoke_ports()` function
   - Instance-suffixed environment variables (e.g., `POSTGRES_PASSWORD_ITA`)
   - Automatic certificate generation via `mkcert` with localhost SANs
   - Proper `.env` file generation with all required secrets

2. **Fixed Keycloak federation** (`scripts/spoke-init/init-keycloak.sh`):
   - Correct cross-border client ID: `dive-v3-cross-border-client`
   - PKCE enabled with `pkceMethod: "S256"`
   - Standardized federation secret: `cross-border-secret-2025`
   - Auto-seeding of users and resources after Keycloak init

3. **Fixed IdP attribute mappers** (`backend/src/services/keycloak-federation.service.ts`):
   - Changed `syncMode` from `INHERIT` to `FORCE`
   - Added all DIVE attributes: `clearance`, `countryOfAffiliation`, `uniqueID`, `acpCOI`
   - Correct IdP mapper structure with `identityProviderMapper` type

4. **Fixed hub-spoke trust**:
   - Hub trusts mkcert CA via `KC_TRUSTSTORE_PATHS`
   - Consistent `COMPOSE_PROJECT_NAME` to avoid stack conflicts
   - Hub auto-creates IdPs with correct mappers on spoke approval

5. **Successfully deployed spokes**: USA (hub), GBR, FRA, ITA, ESP, NZL

### 1.2 Key Files Modified

| File | Purpose |
|------|---------|
| `scripts/dive-modules/spoke.sh` | Core spoke initialization and docker-compose generation |
| `scripts/spoke-init/init-keycloak.sh` | Keycloak realm, clients, IdPs, scopes, mappers |
| `scripts/spoke-init/seed-users.sh` | Test user creation with proper attributes |
| `scripts/spoke-init/seed-resources.sh` | 5000 resources per spoke with even distribution |
| `backend/src/services/keycloak-federation.service.ts` | Auto-IdP creation with attribute mappers |
| `keycloak/themes/dive-v3/login/template.ftl` | Cross-border banner with dynamic country detection |
| `docker-compose.yml`, `docker-compose.hub.yml` | Hub services with mkcert trust |

### 1.3 Critical Patterns Established

```bash
# Port calculation formula (MUST be consistent everywhere)
_get_spoke_ports() {
    local code="$1"
    # USA=0, FRA=1, GBR=2, DEU=3, CAN=4, NZL=5, ITA=6, ESP=7...
    local offset=$(echo "$code" | awk '{
        codes["USA"]=0; codes["FRA"]=1; codes["GBR"]=2; codes["DEU"]=3;
        codes["CAN"]=4; codes["NZL"]=5; codes["ITA"]=6; codes["ESP"]=7;
        # ... extend for all 32 countries
        print codes[$1] ? codes[$1] : 99
    }')
    
    # Port mappings
    FRONTEND_PORT=$((3000 + offset))
    BACKEND_PORT=$((4000 + offset))
    KEYCLOAK_HTTPS_PORT=$((8443 + offset * 11))
    POSTGRES_PORT=$((5432 + offset))
    MONGO_PORT=$((27017 + offset))
    REDIS_PORT=$((6379 + offset))
    OPA_PORT=$((8181 + offset * 100))
    OPAL_PORT=$((7002 + offset))
    KAS_PORT=$((8080 + offset))
}
```

### 1.4 Issues Resolved

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| `countryOfAffiliation = "USA"` for all users | Missing IdP attribute mappers on hub | Created mappers with `syncMode: FORCE` |
| `Identity Provider Unavailable` | Hub JVM didn't trust mkcert CA | Added `KC_TRUSTSTORE_PATHS` to docker-compose |
| `Invalid client credentials` | Mismatched federation secrets | Standardized to `cross-border-secret-2025` |
| `Invalid parameter: redirect_uri` | Wildcards in middle of URI | Fixed redirect URIs to `https://localhost:PORT/*` |
| Two compose stacks running | Missing `COMPOSE_PROJECT_NAME` | Explicitly set in `hub.sh` |

---

## Part 2: Project Directory Structure

```
DIVE-V3/
├── dive                           # Main CLI entry point (Bash 5+)
├── DIVE-V3-CLI-USER-GUIDE.md     # CLI documentation
│
├── scripts/
│   ├── dive-modules/              # CLI modular components
│   │   ├── common.sh              # Shared utilities, logging, secrets loading
│   │   ├── spoke.sh               # Spoke init, up, down, register, status
│   │   ├── hub.sh                 # Hub management, spoke approvals
│   │   ├── federation.sh          # IdP linking, mapper management
│   │   ├── core.sh                # up, down, restart, logs, ps, exec
│   │   ├── deploy.sh              # Full deployment workflows
│   │   ├── secrets.sh             # GCP Secret Manager integration
│   │   ├── status.sh              # Health checks, diagnostics
│   │   ├── db.sh                  # Seed, backup, restore
│   │   ├── policy.sh              # OPA bundle build, OPAL push
│   │   ├── terraform.sh           # Terraform plan/apply/destroy
│   │   ├── pilot.sh               # Remote pilot VM management
│   │   ├── sp.sh                  # SP client registration
│   │   ├── test.sh                # E2E and unit test runner
│   │   └── help.sh                # CLI help system
│   │
│   └── spoke-init/                # Spoke initialization scripts
│       ├── init-keycloak.sh       # Realm, clients, IdPs, mappers
│       ├── init-databases.sh      # MongoDB, PostgreSQL setup
│       ├── seed-users.sh          # Test user creation
│       ├── seed-resources.sh      # 5000 resources with distribution
│       └── init-all.sh            # Orchestrates all init scripts
│
├── instances/                     # Per-country spoke instances
│   ├── usa/                       # Hub instance
│   ├── gbr/                       # United Kingdom spoke
│   ├── fra/                       # France spoke
│   ├── deu/                       # Germany spoke (partial)
│   ├── ita/                       # Italy spoke
│   ├── esp/                       # Spain spoke
│   ├── nzl/                       # New Zealand spoke (non-NATO partner)
│   └── shared/                    # Shared resources
│
├── keycloak/
│   ├── certs/                     # mkcert certificates
│   │   ├── mkcert-rootCA.pem      # Root CA for trust
│   │   ├── key.pem                # Private key
│   │   └── cert.pem               # Certificate
│   └── themes/                    # Country-specific themes
│       ├── dive-v3/               # Hub theme (USA)
│       ├── dive-v3-usa/
│       ├── dive-v3-gbr/
│       ├── dive-v3-fra/
│       ├── dive-v3-deu/
│       ├── dive-v3-ita/
│       ├── dive-v3-esp/
│       ├── dive-v3-can/
│       ├── dive-v3-nld/
│       ├── dive-v3-pol/
│       ├── dive-v3-nzl/
│       └── dive-v3-industry/
│
├── terraform/
│   ├── modules/                   # Reusable Terraform modules
│   │   └── keycloak/              # Keycloak resource module
│   ├── pilot/                     # Pilot VM configuration
│   └── tfvars-examples/           # Example variable files
│
├── backend/
│   └── src/
│       ├── services/
│       │   ├── keycloak-federation.service.ts  # Auto-IdP creation
│       │   └── hub-spoke-registry.service.ts   # Spoke registration
│       └── routes/
│           └── federation.routes.ts            # Registration API
│
├── frontend/
│   └── src/
│       ├── app/                   # Next.js App Router
│       └── components/
│           └── auth/              # IdP selection, country buttons
│
├── policies/                      # OPA Rego policies
│   ├── fuel_inventory_abac_policy.rego
│   └── tests/
│
├── docker-compose.yml             # Main hub compose
├── docker-compose.hub.yml         # Hub-specific overrides
├── docker-compose.gbr.yml         # GBR spoke compose
├── docker-compose.fra.yml         # FRA spoke compose
└── docker-compose.federation.yml  # Federation network
```

---

## Part 3: Existing Code Coverage Audit

### 3.1 Spoke Infrastructure (✅ 85% Complete)

| Component | Status | Notes |
|-----------|--------|-------|
| `_get_spoke_ports()` | ✅ | 8 countries defined, needs 32 |
| `_spoke_init_internal()` | ✅ | Generates config.json, docker-compose.yml, .env |
| `spoke_up()` | ✅ | Starts services, loads secrets |
| `spoke_register()` | ✅ | Registers with hub, includes certificates |
| `spoke_status()` | ✅ | Health checks |
| `init-keycloak.sh` | ✅ | Creates realm, clients, IdPs, seeds users/resources |
| `seed-users.sh` | ✅ | Creates 4 test users + admin per spoke |
| `seed-resources.sh` | ✅ | Creates 5000 resources with even distribution |

### 3.2 Hub Infrastructure (✅ 90% Complete)

| Component | Status | Notes |
|-----------|--------|-------|
| `hub_up()` | ✅ | Starts hub services |
| `hub_approve()` | ✅ | Approves spoke, creates IdP with mappers |
| `hub_status()` | ✅ | Shows registered spokes, pending approvals |
| `hub_verify()` | ✅ | 10-point verification checklist |
| Auto-IdP creation | ✅ | Creates attribute mappers with syncMode:FORCE |

### 3.3 Keycloak Themes (🟡 40% Complete)

| Theme | Status | Notes |
|-------|--------|-------|
| `dive-v3` (USA hub) | ✅ | Full implementation with cross-border banner |
| `dive-v3-usa` | 🟡 | Basic, needs flag/branding |
| `dive-v3-gbr` | 🟡 | Basic, needs flag/branding |
| `dive-v3-fra` | 🟡 | Basic, needs flag/branding |
| `dive-v3-deu` | 🟡 | Basic, needs flag/branding |
| `dive-v3-ita` | 🟡 | Basic, needs flag/branding |
| `dive-v3-esp` | 🟡 | Basic, needs flag/branding |
| Remaining 26 NATO | ❌ | Not created |

### 3.4 Terraform Templates (🟡 30% Complete)

| Template | Status | Notes |
|----------|--------|-------|
| `modules/keycloak/` | ✅ | Base Keycloak module |
| Per-country tfvars | ❌ | Need 32 country-specific variable files |
| Per-country themes TF | ❌ | Need Terraform to deploy themes |

### 3.5 Frontend Customizations (🟡 50% Complete)

| Component | Status | Notes |
|-----------|--------|-------|
| Country selector | ✅ | Works for configured IdPs |
| Dynamic IdP buttons | ✅ | Shows available countries |
| Country flags | 🟡 | Only 6 countries have flags |
| Localization | ❌ | English only |

---

## Part 4: Gap Analysis - Missing Features

### 4.1 Critical Gaps

| Gap | Impact | Priority |
|-----|--------|----------|
| Port mapping for 32 countries | Cannot deploy >8 spokes | P0 |
| Country metadata database | No centralized country info | P0 |
| 32 Keycloak themes | Poor UX for new countries | P1 |
| 32 Terraform tfvars | Manual config required | P1 |
| Automated theme generation | Manual work for each country | P1 |

### 4.2 Missing NATO Countries (24)

Current: USA, GBR, FRA, DEU, ITA, ESP, CAN, NZL (8)

Missing from spoke infrastructure:
```
ALB (Albania)           BEL (Belgium)         BGR (Bulgaria)
HRV (Croatia)           CZE (Czechia)         DNK (Denmark)
EST (Estonia)           FIN (Finland)         GRC (Greece)
HUN (Hungary)           ISL (Iceland)         LVA (Latvia)
LTU (Lithuania)         LUX (Luxembourg)      MNE (Montenegro)
NLD (Netherlands)       MKD (North Macedonia) NOR (Norway)
POL (Poland)            PRT (Portugal)        ROU (Romania)
SVK (Slovakia)          SVN (Slovenia)        SWE (Sweden)
TUR (Turkey)
```

Note: NZL is a partner, not NATO member. Replace with missing NATO country.

### 4.3 Missing Theme Components Per Country

Each country theme needs:
- `login/template.ftl` - Login page with country branding
- `login/resources/css/styles.css` - Country colors
- `login/resources/img/flag.svg` - Country flag
- `login/resources/img/emblem.png` - Government emblem (optional)
- `login/messages/messages_en.properties` - Country-specific text
- `theme.properties` - Theme configuration

### 4.4 Missing Terraform Components

Per-country Terraform needs:
- `terraform/countries/<code>.tfvars` - Country-specific variables
- `terraform/modules/spoke/` - Reusable spoke module
- `terraform/modules/theme/` - Theme deployment module

---

## Part 5: Phased Implementation Plan

### Phase 1: Foundation (Week 1)
**Goal**: Create centralized NATO country database and extend port mapping

#### SMART Objectives
- **S**: Create `scripts/nato-countries.sh` with metadata for all 32 NATO countries
- **M**: All 32 countries have valid port mappings in `_get_spoke_ports()`
- **A**: Extend existing patterns, no new architecture
- **R**: Required for any spoke beyond current 8
- **T**: Complete in 3 days

#### Tasks
1. Create `scripts/nato-countries.sh`:
   ```bash
   # Country metadata: code, name, flag, primary_color, secondary_color, timezone
   declare -A NATO_COUNTRIES=(
       ["USA"]="United States|🇺🇸|#002868|#BF0A30|America/New_York"
       ["GBR"]="United Kingdom|🇬🇧|#012169|#C8102E|Europe/London"
       ["FRA"]="France|🇫🇷|#002395|#ED2939|Europe/Paris"
       # ... all 32
   )
   ```

2. Update `_get_spoke_ports()` to support all 32 countries
3. Create `scripts/validate-nato-country.sh` for input validation
4. Update CLI help to list all supported countries

#### Success Criteria
- [ ] `./dive spoke init ALB "Albania"` generates valid config
- [ ] Port conflicts impossible for any 32-country combination
- [ ] `./dive spoke list-countries` shows all 32 with metadata

#### Testing Suite
```bash
# Test all 32 country port assignments
for code in USA GBR FRA DEU ITA ESP CAN ALB BEL BGR HRV CZE DNK EST FIN GRC HUN ISL LVA LTU LUX MNE NLD MKD NOR POL PRT ROU SVK SVN SWE TUR; do
    ./dive --instance $code spoke ports
done | sort -u  # Verify no duplicates
```

---

### Phase 2: Theme Generation (Week 2)
**Goal**: Auto-generate Keycloak themes for all 32 countries

#### SMART Objectives
- **S**: Create `scripts/generate-country-theme.sh` that generates complete theme
- **M**: 32 themes exist in `keycloak/themes/dive-v3-<code>/`
- **A**: Use template substitution from `dive-v3` base theme
- **R**: Required for proper country branding
- **T**: Complete in 4 days

#### Tasks
1. Create theme template in `keycloak/themes/dive-v3-template/`
2. Create `scripts/generate-country-theme.sh`:
   ```bash
   generate_theme() {
       local code="$1"
       local name="${NATO_COUNTRIES[$code]%%|*}"
       local flag="$(echo ${NATO_COUNTRIES[$code]} | cut -d'|' -f2)"
       local primary="$(echo ${NATO_COUNTRIES[$code]} | cut -d'|' -f3)"
       local secondary="$(echo ${NATO_COUNTRIES[$code]} | cut -d'|' -f4)"
       
       cp -r keycloak/themes/dive-v3-template keycloak/themes/dive-v3-${code,,}
       sed -i "s/{{COUNTRY_NAME}}/$name/g" ...
       sed -i "s/{{PRIMARY_COLOR}}/$primary/g" ...
   }
   ```
3. Generate all 32 themes
4. Add `./dive spoke generate-theme <CODE>` CLI command

#### Success Criteria
- [ ] All 32 themes exist and are syntactically valid
- [ ] Each theme has unique colors matching national flag
- [ ] Themes load without errors in Keycloak

#### Testing Suite
```bash
# Validate all themes
for theme_dir in keycloak/themes/dive-v3-*/; do
    code=$(basename $theme_dir | sed 's/dive-v3-//')
    echo "Validating $code..."
    [ -f "$theme_dir/login/template.ftl" ] || echo "MISSING: template.ftl"
    [ -f "$theme_dir/login/resources/css/styles.css" ] || echo "MISSING: styles.css"
    [ -f "$theme_dir/theme.properties" ] || echo "MISSING: theme.properties"
done
```

---

### Phase 3: Terraform Templates (Week 3)
**Goal**: Pre-generate Terraform configurations for all 32 countries

#### SMART Objectives
- **S**: Create `terraform/countries/<code>.tfvars` for all 32
- **M**: Each tfvars has all required variables populated
- **A**: Use existing Terraform modules
- **R**: Required for IaC deployment
- **T**: Complete in 4 days

#### Tasks
1. Create `terraform/modules/spoke/` module:
   - Keycloak realm configuration
   - Client registrations
   - IdP configurations
   - Theme deployment
2. Create `scripts/generate-country-tfvars.sh`
3. Generate all 32 tfvars files
4. Add `./dive tf generate <CODE>` CLI command

#### Success Criteria
- [ ] `terraform plan -var-file=countries/alb.tfvars` succeeds for all 32
- [ ] No hardcoded secrets in tfvars (use GCP Secret Manager references)
- [ ] All tfvars validated by `terraform validate`

#### Testing Suite
```bash
cd terraform
for tfvars in countries/*.tfvars; do
    echo "Validating $tfvars..."
    terraform validate -var-file="$tfvars" || exit 1
done
echo "All tfvars valid!"
```

---

### Phase 4: End-to-End Integration (Week 4)
**Goal**: Deploy and test 3 new NATO countries end-to-end

#### SMART Objectives
- **S**: Deploy ALB, POL, NOR spokes from scratch
- **M**: Each spoke completes 12-point verification
- **A**: Use only `./dive` CLI commands
- **R**: Validates entire pipeline
- **T**: Complete in 5 days

#### Tasks
1. Deploy Albania:
   ```bash
   ./dive spoke init ALB "Albania"
   ./dive --instance alb spoke up
   ./dive --instance alb spoke register
   ./dive hub approve ALB
   ./dive --instance alb spoke verify
   ```
2. Deploy Poland and Norway similarly
3. Test cross-border SSO between all countries
4. Document any issues and fix

#### Success Criteria
- [ ] 3 new spokes fully operational
- [ ] Cross-border SSO works from any spoke to hub
- [ ] User attributes flow correctly (countryOfAffiliation, clearance, COIs)
- [ ] 5000 resources seeded per spoke
- [ ] Frontend shows all countries in selector

#### Testing Suite
```bash
# Full E2E test suite
./dive test federation --countries ALB,POL,NOR

# Individual spoke verification
for code in ALB POL NOR; do
    ./dive --instance $code spoke verify || exit 1
done

# Cross-border SSO tests
./dive test cross-border --from ALB --to USA
./dive test cross-border --from POL --to GBR
./dive test cross-border --from NOR --to FRA
```

---

### Phase 5: Full Rollout (Week 5)
**Goal**: Deploy remaining 21 NATO countries

#### SMART Objectives
- **S**: All 32 NATO countries have functional spokes
- **M**: 32 entries in hub's spoke registry, all approved
- **A**: Batch deployment using scripts
- **R**: Complete NATO coverage
- **T**: Complete in 5 days

#### Tasks
1. Create batch deployment script:
   ```bash
   #!/bin/bash
   REMAINING=(BEL BGR HRV CZE DNK EST FIN GRC HUN ISL LVA LTU LUX MNE NLD MKD PRT ROU SVK SVN SWE TUR)
   for code in "${REMAINING[@]}"; do
       ./dive spoke init $code "${NATO_COUNTRIES[$code]%%|*}"
       ./dive --instance $code spoke up
       ./dive --instance $code spoke register
       ./dive hub approve $code
   done
   ```
2. Run batch deployment
3. Verify all 32 spokes
4. Generate final report

#### Success Criteria
- [ ] `./dive hub spokes list` shows 32 approved spokes
- [ ] All 32 spokes pass health checks
- [ ] Total resources: 160,000 (5000 × 32)
- [ ] Total users: 160 (5 × 32)

---

## Part 6: Success Metrics Summary

| Metric | Target | How to Verify |
|--------|--------|---------------|
| NATO countries supported | 32 | `./dive spoke list-countries \| wc -l` |
| Keycloak themes | 32 | `ls keycloak/themes/dive-v3-* \| wc -l` |
| Terraform tfvars | 32 | `ls terraform/countries/*.tfvars \| wc -l` |
| Deployed spokes | 32 | `./dive hub spokes list --count` |
| Resources seeded | 160,000 | Sum of MongoDB counts |
| Test users | 160 | Sum of Keycloak users |
| Cross-border SSO tests passing | 100% | `./dive test cross-border --all` |
| Port conflicts | 0 | Port uniqueness validation |
| Theme validation errors | 0 | Theme syntax check |

---

## Part 7: Technical Constraints

### 7.1 Port Allocation Strategy
With 32 countries, need careful port planning:
- Frontend: 3000-3031
- Backend: 4000-4031
- Keycloak HTTPS: 8443, 8454, 8465, ... (11-port increments)
- PostgreSQL: 5432-5463
- MongoDB: 27017-27048
- Redis: 6379-6410
- OPA: 8181, 8281, 8381, ... (100-port increments)

### 7.2 Resource Limits
- Each spoke: ~2GB RAM (Keycloak + Backend + DBs)
- 32 spokes: ~64GB RAM (run subsets for testing)
- Recommend: Deploy hub + 5 spokes max locally

### 7.3 Secret Management
All secrets in GCP Secret Manager (project: `dive25`):
- Pattern: `dive-v3-<type>-<country>`
- Example: `dive-v3-keycloak-alb`, `dive-v3-mongodb-pol`

---

## Part 8: Commands Reference

```bash
# Country management
./dive spoke list-countries              # List all 32 NATO countries
./dive spoke init <CODE> [NAME]          # Initialize new spoke
./dive spoke generate-theme <CODE>       # Generate theme for country

# Batch operations
./dive spoke batch-init --countries ALB,POL,NOR
./dive spoke batch-deploy --all-nato
./dive spoke batch-verify --all

# Terraform
./dive tf generate <CODE>                # Generate tfvars for country
./dive tf generate --all-nato            # Generate all 32 tfvars
./dive tf apply --instance <CODE>        # Apply for specific country

# Testing
./dive test federation --country <CODE>
./dive test cross-border --from <CODE> --to <CODE>
./dive test all-nato                     # Full NATO test suite

# Hub management
./dive hub spokes list                   # List all registered spokes
./dive hub spokes stats                  # Show federation statistics
./dive hub approve --batch ALB,POL,NOR   # Batch approve
```

---

## Part 9: File Templates Needed

### 9.1 `scripts/nato-countries.sh`
```bash
#!/usr/local/bin/bash
# NATO Member Countries Database
# ISO 3166-1 alpha-3 codes with metadata

declare -A NATO_COUNTRIES=(
    # Format: "Full Name|Flag|Primary Color|Secondary Color|Timezone|Join Year"
    ["ALB"]="Albania|🇦🇱|#E41E20|#000000|Europe/Tirane|2009"
    ["BEL"]="Belgium|🇧🇪|#000000|#FDDA24|Europe/Brussels|1949"
    ["BGR"]="Bulgaria|🇧🇬|#00966E|#D62612|Europe/Sofia|2004"
    ["CAN"]="Canada|🇨🇦|#FF0000|#FFFFFF|America/Toronto|1949"
    ["HRV"]="Croatia|🇭🇷|#FF0000|#0000FF|Europe/Zagreb|2009"
    ["CZE"]="Czechia|🇨🇿|#11457E|#D7141A|Europe/Prague|1999"
    ["DNK"]="Denmark|🇩🇰|#C60C30|#FFFFFF|Europe/Copenhagen|1949"
    ["EST"]="Estonia|🇪🇪|#0072CE|#000000|Europe/Tallinn|2004"
    ["FIN"]="Finland|🇫🇮|#002F6C|#FFFFFF|Europe/Helsinki|2023"
    ["FRA"]="France|🇫🇷|#002395|#ED2939|Europe/Paris|1949"
    ["DEU"]="Germany|🇩🇪|#000000|#DD0000|Europe/Berlin|1955"
    ["GRC"]="Greece|🇬🇷|#0D5EAF|#FFFFFF|Europe/Athens|1952"
    ["HUN"]="Hungary|🇭🇺|#CD2A3E|#436F4D|Europe/Budapest|1999"
    ["ISL"]="Iceland|🇮🇸|#02529C|#DC1E35|Atlantic/Reykjavik|1949"
    ["ITA"]="Italy|🇮🇹|#009246|#CE2B37|Europe/Rome|1949"
    ["LVA"]="Latvia|🇱🇻|#9E3039|#FFFFFF|Europe/Riga|2004"
    ["LTU"]="Lithuania|🇱🇹|#FDB913|#006A44|Europe/Vilnius|2004"
    ["LUX"]="Luxembourg|🇱🇺|#00A1DE|#ED2939|Europe/Luxembourg|1949"
    ["MNE"]="Montenegro|🇲🇪|#C40308|#D4AF37|Europe/Podgorica|2017"
    ["NLD"]="Netherlands|🇳🇱|#AE1C28|#21468B|Europe/Amsterdam|1949"
    ["MKD"]="North Macedonia|🇲🇰|#D20000|#FFE600|Europe/Skopje|2020"
    ["NOR"]="Norway|🇳🇴|#BA0C2F|#00205B|Europe/Oslo|1949"
    ["POL"]="Poland|🇵🇱|#DC143C|#FFFFFF|Europe/Warsaw|1999"
    ["PRT"]="Portugal|🇵🇹|#006600|#FF0000|Europe/Lisbon|1949"
    ["ROU"]="Romania|🇷🇴|#002B7F|#FCD116|Europe/Bucharest|2004"
    ["SVK"]="Slovakia|🇸🇰|#0B4EA2|#EE1C25|Europe/Bratislava|2004"
    ["SVN"]="Slovenia|🇸🇮|#005DA4|#ED1C24|Europe/Ljubljana|2004"
    ["ESP"]="Spain|🇪🇸|#AA151B|#F1BF00|Europe/Madrid|1982"
    ["SWE"]="Sweden|🇸🇪|#006AA7|#FECC00|Europe/Stockholm|2024"
    ["TUR"]="Turkey|🇹🇷|#E30A17|#FFFFFF|Europe/Istanbul|1952"
    ["GBR"]="United Kingdom|🇬🇧|#012169|#C8102E|Europe/London|1949"
    ["USA"]="United States|🇺🇸|#002868|#BF0A30|America/New_York|1949"
)

get_country_name() { echo "${NATO_COUNTRIES[$1]}" | cut -d'|' -f1; }
get_country_flag() { echo "${NATO_COUNTRIES[$1]}" | cut -d'|' -f2; }
get_country_primary_color() { echo "${NATO_COUNTRIES[$1]}" | cut -d'|' -f3; }
get_country_secondary_color() { echo "${NATO_COUNTRIES[$1]}" | cut -d'|' -f4; }
get_country_timezone() { echo "${NATO_COUNTRIES[$1]}" | cut -d'|' -f5; }
get_country_join_year() { echo "${NATO_COUNTRIES[$1]}" | cut -d'|' -f6; }

is_nato_country() {
    [[ -v NATO_COUNTRIES[$1] ]]
}

list_nato_countries() {
    for code in "${!NATO_COUNTRIES[@]}"; do
        echo "$code: $(get_country_name $code)"
    done | sort
}
```

---

## Ready to Begin

This prompt provides complete context for expanding DIVE V3 to support all 32 NATO countries. Begin with **Phase 1: Foundation** by creating the NATO countries database and extending port mappings.

**First command to run:**
```bash
./dive spoke list-countries 2>/dev/null || echo "Command not yet implemented - start Phase 1"
```

