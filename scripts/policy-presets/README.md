# Federation Constraints - Policy Presets

**Version:** 1.0
**Date:** 2026-01-28

---

## Quick Start

### List Available Packs

```bash
./list-packs.sh
```

### Preview a Pack (Dry Run)

```bash
./preview-pack.sh NATO_STANDARD --tenant FRA
```

### Apply a Pack

```bash
export DIVE_ADMIN_TOKEN="your-jwt-token"
./apply-pack.sh NATO_STANDARD --tenant FRA
```

### Rollback a Pack

```bash
./rollback-pack.sh NATO_STANDARD --tenant FRA
```

---

## Available Policy Packs

### 1. NATO_STANDARD

**Classification Cap:** SECRET
**COI Model:** NATO + bilateral tags
**Use Case:** Default NATO sharing pattern

**Deployment:**
```bash
./apply-pack.sh NATO_STANDARD --tenant YOUR_TENANT
```

**Creates:**
- Bilateral constraints to all NATO partners
- Tenant config: MFA required above CONFIDENTIAL
- Denies: US-ONLY, COSMIC_TOP_SECRET

---

### 2. FVEY_EXPANDED

**Classification Cap:** TOP_SECRET
**COI Model:** FVEY + bilateral tags
**Use Case:** Five Eyes enhanced trust

**Deployment:**
```bash
./apply-pack.sh FVEY_EXPANDED --tenant USA
```

**Creates:**
- Full TOP_SECRET access for FVEY partners (USA, GBR, CAN, AUS, NZL)
- Enhanced MFA requirements
- No denials within FVEY

---

### 3. BILATERAL_RESTRICTED

**Classification Cap:** CONFIDENTIAL
**COI Model:** Bilateral tag only
**Use Case:** Conservative two-party sharing

**Deployment:**
```bash
./apply-pack.sh BILATERAL_RESTRICTED \
  --owner-tenant FRA \
  --partner-tenant DEU \
  --effective-date 2026-03-01 \
  --expiration-date 2026-03-31
```

**Creates:**
- Time-limited bilateral constraint
- Denies NATO/FVEY expansion
- Requires explicit bilateral COI tag (e.g., FRA-DEU)

---

### 4. INDUSTRY_LOCKDOWN

**Classification Cap:** CONFIDENTIAL
**COI Model:** Industry COIs only
**Use Case:** Industry partner restrictions

**Deployment:**
```bash
./apply-pack.sh INDUSTRY_LOCKDOWN --tenant USA
```

**Creates:**
- Industry max classification: CONFIDENTIAL
- Industry-specific COI definitions
- MFA required, 4-hour session limit

---

### 5. HIGH_WATERMARK

**Classification Cap:** Varies by partner
**COI Model:** NATO + bilateral
**Use Case:** Differentiated trust levels

**Deployment:**
```bash
./apply-pack.sh HIGH_WATERMARK --tenant USA
```

**Creates:**
- TOP_SECRET for high-trust partners (GBR, CAN)
- SECRET for moderate-trust partners (FRA, DEU)
- Customizable per-partner caps

---

### 6. EMBARGO_TEMPLATE

**Classification Cap:** Configurable
**COI Model:** Configurable
**Use Case:** Time-based embargoes

**Deployment:**
```bash
./apply-pack.sh EMBARGO_TEMPLATE --tenant USA
```

**Creates:**
- Tenant config with embargo rules
- Classification-based embargo hours (SECRET: 48h, TOP_SECRET: 72h)
- COI-based embargo hours (OPERATIONAL: 24h, INTELLIGENCE: 72h)

---

### 7. ATTRIBUTE_RELEASE_TEMPLATE

**Classification Cap:** N/A
**COI Model:** N/A
**Use Case:** PII protection

**Deployment:**
```bash
./apply-pack.sh ATTRIBUTE_RELEASE_TEMPLATE --tenant USA
```

**Creates:**
- Per-partner attribute release policies
- Deny PII attributes (email, phone, address)
- Allow only essential security attributes

---

## Composing Multiple Packs

### Example: NATO + FVEY Hybrid

```bash
# Step 1: Apply NATO_STANDARD as base
./apply-pack.sh NATO_STANDARD --tenant USA

# Step 2: Overlay FVEY_EXPANDED for FVEY partners
./apply-pack.sh FVEY_EXPANDED --tenant USA

# Result:
#   USA→GBR: TOP_SECRET (FVEY overrides NATO)
#   USA→CAN: TOP_SECRET (FVEY overrides NATO)
#   USA→FRA: SECRET (NATO only)
#   USA→DEU: SECRET (NATO only)
```

### Example: NATO + Industry

```bash
# Apply NATO_STANDARD for government partners
./apply-pack.sh NATO_STANDARD --tenant FRA

# Add industry lockdown
./apply-pack.sh INDUSTRY_LOCKDOWN --tenant FRA

# Result:
#   Government partners: SECRET via NATO
#   Industry partners: CONFIDENTIAL via INDUSTRY_LOCKDOWN
```

---

## Directory Structure

```
scripts/policy-presets/
├── README.md                           # This file
├── list-packs.sh                       # List available packs
├── preview-pack.sh                     # Preview pack (dry run)
├── apply-pack.sh                       # Deploy pack
├── rollback-pack.sh                    # Remove pack
└── packs/
    ├── NATO_STANDARD.json              # Default NATO sharing
    ├── FVEY_EXPANDED.json              # Five Eyes enhanced trust
    ├── BILATERAL_RESTRICTED.json       # Conservative bilateral
    ├── INDUSTRY_LOCKDOWN.json          # Industry restrictions
    ├── HIGH_WATERMARK.json             # Differentiated trust
    ├── EMBARGO_TEMPLATE.json           # Time-based embargoes
    └── ATTRIBUTE_RELEASE_TEMPLATE.json # PII protection
```

---

## Environment Variables

```bash
# Required for script execution
export DIVE_ADMIN_TOKEN="<your-admin-jwt-token>"

# Optional (defaults to localhost)
export DIVE_API_URL="https://localhost:4000"
```

### Getting an Admin Token

```bash
# Option 1: Login via Keycloak
curl -X POST https://localhost:8443/realms/dive-v3-broker-fra/protocol/openid-connect/token \
  -d "grant_type=password" \
  -d "client_id=dive-v3-client" \
  -d "username=admin-fra@dive.nato.int" \
  -d "password=your-password" | jq -r '.access_token'

# Option 2: Use existing NextAuth session
# Login to https://localhost:3000 and extract JWT from browser cookies
```

---

## Testing Policy Packs

### Preview Before Applying

**Always preview first** to understand what will be created:

```bash
./preview-pack.sh NATO_STANDARD --tenant FRA
```

### Test in Non-Production

Apply to test environment first:

```bash
DIVE_API_URL=https://test.dive.nato.int ./apply-pack.sh NATO_STANDARD --tenant FRA
```

### Verify Constraints

```bash
# Check your constraints
curl -k https://localhost:4000/api/federation-constraints \
  -H "Authorization: Bearer $DIVE_ADMIN_TOKEN" | jq

# Check bilateral effective-min
curl -k https://localhost:4000/api/federation-constraints/bilateral/FRA/DEU \
  -H "Authorization: Bearer $DIVE_ADMIN_TOKEN" | jq '.effectiveMax'
```

---

## Troubleshooting

### Scripts Won't Execute

```bash
# Ensure scripts are executable
chmod +x *.sh
```

### API Calls Fail with 401 Unauthorized

```bash
# Verify token is valid
echo $DIVE_ADMIN_TOKEN | cut -d'.' -f2 | base64 -d | jq

# Check expiration (exp claim)
```

### Constraints Not Appearing in OPA

```bash
# Force OPAL sync
curl -k -X POST https://localhost:4000/api/opal/force-sync \
  -H "Authorization: Bearer $DIVE_ADMIN_TOKEN"

# Wait 2 seconds
sleep 2

# Check OPA data
curl -k https://localhost:8181/v1/data/federation_constraints | jq
```

---

## Advanced Usage

### Create Custom Pack

1. Copy an existing pack as template:
```bash
cp packs/NATO_STANDARD.json packs/MY_CUSTOM_PACK.json
```

2. Edit constraints in JSON file

3. Apply:
```bash
./apply-pack.sh MY_CUSTOM_PACK --tenant YOUR_TENANT
```

### Batch Apply to Multiple Tenants

```bash
for TENANT in FRA GBR DEU; do
  echo "Applying NATO_STANDARD to $TENANT..."
  ./apply-pack.sh NATO_STANDARD --tenant $TENANT
  sleep 2
done
```

---

## Support

**Documentation:** [ADMIN-QUICK-START-FEDERATION-CONSTRAINTS.md](../../docs/ADMIN-QUICK-START-FEDERATION-CONSTRAINTS.md)
**Deployment Guide:** [FEDERATION-CONSTRAINTS-DEPLOYMENT-GUIDE.md](../../docs/FEDERATION-CONSTRAINTS-DEPLOYMENT-GUIDE.md)
**Questions:** #dive-v3-policy-architecture (Slack)
**Issues:** GitHub Issues (tag: `federation-constraints`)

---

**README Version:** 1.0
**Last Updated:** 2026-01-28
