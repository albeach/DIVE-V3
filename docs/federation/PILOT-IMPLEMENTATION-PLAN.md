# DIVE V3 Pilot: Federation Implementation Plan

## Overview

**Objective:** Enable frictionless partner onboarding for demonstrations while acknowledging production standards.

**Timeline:** 2 weeks (10 working days)

**Outcome:** Any authorized user can deploy a new federated instance with a single command.

---

## Phase 1: Foundation (Days 1-2)

### 1.1 Standardize Test User Schema

**Goal:** Every instance gets consistent test users with predictable credentials.

**Tasks:**

- [ ] **1.1.1** Create test user Terraform module

```hcl
# terraform/modules/federated-instance/test-users.tf

locals {
  clearance_levels = ["UNCLASSIFIED", "CONFIDENTIAL", "SECRET", "TOP_SECRET"]
  
  test_users = {
    admin = {
      clearance = "TOP_SECRET"
      coi       = ["FVEY", "NATO-COSMIC"]
      role      = "realm-admin"
    }
    officer = {
      clearance = "SECRET"
      coi       = ["NATO"]
      role      = "user"
    }
    analyst = {
      clearance = "CONFIDENTIAL"
      coi       = []
      role      = "user"
    }
    guest = {
      clearance = "UNCLASSIFIED"
      coi       = []
      role      = "user"
    }
  }
}

resource "keycloak_user" "test_users" {
  for_each = local.test_users
  
  realm_id = keycloak_realm.broker.id
  username = "${each.key}.${lower(var.instance_code)}"
  email    = "${each.key}.${lower(var.instance_code)}@dive-demo.example"
  enabled  = true
  
  first_name = title(each.key)
  last_name  = upper(var.instance_code)
  
  initial_password {
    value     = "DiveDemo2025!"
    temporary = false
  }
  
  attributes = {
    clearance           = each.value.clearance
    countryOfAffiliation = var.instance_code
    acpCOI              = jsonencode(each.value.coi)
    userType            = "military"
  }
}
```

- [ ] **1.1.2** Update existing instances with standardized users
- [ ] **1.1.3** Document test user matrix in pilot guide

**Deliverable:** All instances have `admin.{code}`, `officer.{code}`, `analyst.{code}`, `guest.{code}` users.

---

### 1.2 Enhance Deploy Script

**Goal:** Single command deploys a fully-functional federated instance.

**Tasks:**

- [ ] **1.2.1** Update `deploy-dive-instance.sh` with comprehensive checks

```bash
#!/usr/bin/env bash
# scripts/deploy-dive-instance.sh - Enhanced for Pilot

set -euo pipefail

CODE="${1:-}"
if [[ -z "$CODE" ]] || [[ ! "$CODE" =~ ^[A-Z]{3}$ ]]; then
  echo "Usage: $0 <ISO-3166-ALPHA-3>"
  echo "Examples: USA, FRA, DEU, ITA, ESP, GBR, CAN, AUS, JPN"
  exit 1
fi

CODE_LOWER=$(echo "$CODE" | tr '[:upper:]' '[:lower:]')

echo "╔════════════════════════════════════════════════════════════╗"
echo "║     DIVE V3 PILOT - Deploy New Federation Partner          ║"
echo "║     Instance: $CODE                                         ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Pre-flight checks
echo "🔍 Pre-flight checks..."
command -v docker >/dev/null 2>&1 || { echo "❌ Docker required"; exit 1; }
command -v cloudflared >/dev/null 2>&1 || { echo "❌ cloudflared required"; exit 1; }
command -v terraform >/dev/null 2>&1 || { echo "❌ Terraform required"; exit 1; }
command -v mkcert >/dev/null 2>&1 || { echo "❌ mkcert required"; exit 1; }
echo "✅ All prerequisites installed"

# Check if instance already exists
if docker ps -a --format '{{.Names}}' | grep -q "dive-v3-frontend-${CODE_LOWER}"; then
  echo "⚠️  Instance $CODE already exists. Use manage-instances.sh to control it."
  exit 1
fi

# Step 1: Generate certificates
echo ""
echo "📜 Step 1/6: Generating SSL certificates..."
./scripts/generate-dev-certs.sh
echo "✅ Certificates ready"

# Step 2: Create Cloudflare tunnel
echo ""
echo "🌐 Step 2/6: Creating Cloudflare tunnel..."
# ... (tunnel creation logic)
echo "✅ Tunnel created: ${CODE_LOWER}-app.dive25.com"

# Step 3: Generate docker-compose file
echo ""
echo "🐳 Step 3/6: Generating Docker Compose configuration..."
# ... (compose generation logic)
echo "✅ docker-compose.${CODE_LOWER}.yml created"

# Step 4: Start services
echo ""
echo "🚀 Step 4/6: Starting Docker services..."
docker-compose -f docker-compose.${CODE_LOWER}.yml up -d
echo "✅ Services starting..."

# Step 5: Wait for health
echo ""
echo "⏳ Step 5/6: Waiting for services to be healthy..."
TIMEOUT=120
ELAPSED=0
while [[ $ELAPSED -lt $TIMEOUT ]]; do
  if curl -sf "https://${CODE_LOWER}-app.dive25.com/api/health" >/dev/null 2>&1; then
    echo "✅ Services healthy!"
    break
  fi
  sleep 5
  ELAPSED=$((ELAPSED + 5))
  echo "   Waiting... ($ELAPSED/$TIMEOUT seconds)"
done

# Step 6: Apply Terraform
echo ""
echo "🏗️  Step 6/6: Applying Terraform configuration..."
cd terraform/instances
terraform workspace select -or-create ${CODE_LOWER}
terraform apply -var-file="${CODE_LOWER}.tfvars" -auto-approve
cd ../..
echo "✅ Keycloak realm configured"

# Summary
echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║     ✅ DEPLOYMENT COMPLETE                                  ║"
echo "╠════════════════════════════════════════════════════════════╣"
echo "║                                                             ║"
echo "║  🌐 Frontend: https://${CODE_LOWER}-app.dive25.com                ║"
echo "║  🔌 API:      https://${CODE_LOWER}-api.dive25.com                ║"
echo "║  🔐 Keycloak: https://${CODE_LOWER}-idp.dive25.com                ║"
echo "║                                                             ║"
echo "║  👤 Test Users:                                             ║"
echo "║     admin.${CODE_LOWER}   / DiveDemo2025! (TOP_SECRET)           ║"
echo "║     officer.${CODE_LOWER} / DiveDemo2025! (SECRET)               ║"
echo "║     analyst.${CODE_LOWER} / DiveDemo2025! (CONFIDENTIAL)         ║"
echo "║     guest.${CODE_LOWER}   / DiveDemo2025! (UNCLASSIFIED)         ║"
echo "║                                                             ║"
echo "╚════════════════════════════════════════════════════════════╝"
```

- [ ] **1.2.2** Add `--dry-run` flag for validation without deployment
- [ ] **1.2.3** Add `--verbose` flag for debugging
- [ ] **1.2.4** Add rollback on failure

**Deliverable:** `./scripts/deploy-dive-instance.sh ITA` deploys Italy in < 5 minutes.

---

## Phase 2: Federation Automation (Days 3-4)

### 2.1 Auto-Configure Federation Partners

**Goal:** New instances automatically trust existing partners and vice versa.

**Tasks:**

- [ ] **2.1.1** Create federation partner discovery

```typescript
// backend/src/services/federation-discovery.service.ts

interface FederationPartner {
  code: string;
  name: string;
  idpUrl: string;
  appUrl: string;
  apiUrl: string;
  status: 'active' | 'pending' | 'offline';
}

export class FederationDiscoveryService {
  private readonly KNOWN_PARTNERS: Record<string, Partial<FederationPartner>> = {
    'USA': { name: 'United States' },
    'FRA': { name: 'France' },
    'DEU': { name: 'Germany' },
    'GBR': { name: 'United Kingdom' },
    'CAN': { name: 'Canada' },
    'ITA': { name: 'Italy' },
    'ESP': { name: 'Spain' },
    'POL': { name: 'Poland' },
    'NLD': { name: 'Netherlands' },
    'AUS': { name: 'Australia' },
    'JPN': { name: 'Japan' },
  };

  async discoverActivePartners(): Promise<FederationPartner[]> {
    const partners: FederationPartner[] = [];
    
    for (const [code, meta] of Object.entries(this.KNOWN_PARTNERS)) {
      const urls = {
        idpUrl: `https://${code.toLowerCase()}-idp.dive25.com`,
        appUrl: `https://${code.toLowerCase()}-app.dive25.com`,
        apiUrl: `https://${code.toLowerCase()}-api.dive25.com`,
      };
      
      try {
        // Check if IdP is reachable
        const response = await fetch(
          `${urls.idpUrl}/realms/dive-v3-broker/.well-known/openid-configuration`,
          { method: 'GET', signal: AbortSignal.timeout(5000) }
        );
        
        if (response.ok) {
          partners.push({
            code,
            name: meta.name!,
            ...urls,
            status: 'active',
          });
        }
      } catch {
        // Partner not active, skip
      }
    }
    
    return partners;
  }
}
```

- [ ] **2.1.2** Update Terraform to auto-create IdP brokers for active partners

```hcl
# terraform/modules/federated-instance/federation-auto.tf

data "http" "active_partners" {
  url = "https://usa-api.dive25.com/api/federation/partners"
  
  request_headers = {
    Accept = "application/json"
  }
}

locals {
  active_partners = jsondecode(data.http.active_partners.response_body).partners
  
  # Filter out self
  federation_partners = {
    for p in local.active_partners : p.code => p
    if p.code != var.instance_code
  }
}

resource "keycloak_oidc_identity_provider" "auto_federation" {
  for_each = local.federation_partners
  
  realm        = keycloak_realm.broker.id
  alias        = "${lower(each.key)}-federation"
  display_name = "DIVE V3 - ${each.value.name}"
  enabled      = true
  
  authorization_url = "${each.value.idpUrl}/realms/dive-v3-broker/protocol/openid-connect/auth"
  token_url         = "${each.value.idpUrl}/realms/dive-v3-broker/protocol/openid-connect/token"
  # ... etc
}
```

- [ ] **2.1.3** Create script to refresh federation on existing instances

```bash
# scripts/refresh-federation.sh
# Re-scans for active partners and updates all instances

for instance in usa fra deu; do
  echo "Refreshing federation for $instance..."
  cd terraform/instances
  terraform workspace select $instance
  terraform apply -auto-approve
  cd ../..
done
```

**Deliverable:** New instances auto-discover and trust existing partners.

---

### 2.2 Bidirectional Trust Setup

**Goal:** When ITA is added, USA/FRA/DEU automatically get ITA as a federation option.

**Tasks:**

- [ ] **2.2.1** Create post-deploy hook to update existing instances

```bash
# Part of deploy-dive-instance.sh

update_existing_partners() {
  local NEW_CODE=$1
  
  echo "🔄 Updating existing partners to trust $NEW_CODE..."
  
  # Get list of active instances
  ACTIVE=$(./scripts/manage-instances.sh list --format=codes)
  
  for existing in $ACTIVE; do
    if [[ "$existing" != "$NEW_CODE" ]]; then
      echo "   Adding $NEW_CODE IdP to $existing..."
      
      # Add new IdP broker to existing instance's Keycloak
      cd terraform/instances
      terraform workspace select $(echo $existing | tr '[:upper:]' '[:lower:]')
      terraform apply -auto-approve -target=keycloak_oidc_identity_provider.auto_federation
      cd ../..
    fi
  done
  
  echo "✅ All existing partners updated"
}
```

- [ ] **2.2.2** Add webhook/event system for federation changes (stretch goal)

**Deliverable:** Adding Italy automatically makes it available on USA, FRA, DEU login pages.

---

## Phase 3: Instance Management (Days 5-6)

### 3.1 Comprehensive Management Script

**Goal:** Single script for all instance lifecycle operations.

**Tasks:**

- [ ] **3.1.1** Enhance `manage-instances.sh`

```bash
#!/usr/bin/env bash
# scripts/manage-instances.sh - Full instance lifecycle management

COMMAND="${1:-help}"
INSTANCE="${2:-}"

show_help() {
  cat << EOF
DIVE V3 Instance Manager

Usage: $0 <command> [instance]

Commands:
  status              Show status of all instances
  list                List all instances (--format=codes|table|json)
  start <code>        Start an instance
  stop <code>         Stop an instance
  restart <code>      Restart an instance
  logs <code>         View logs (--follow, --service=frontend|backend|keycloak)
  health <code>       Detailed health check
  shell <code>        Open shell in frontend container
  sync <code>         Sync Keycloak realm from USA
  destroy <code>      Destroy an instance (with confirmation)
  
Examples:
  $0 status
  $0 start fra
  $0 logs deu --follow --service=backend
  $0 destroy ita
EOF
}

status_all() {
  echo "╔════════════════════════════════════════════════════════════════════╗"
  echo "║                    DIVE V3 INSTANCE STATUS                          ║"
  echo "╠═══════╦═══════════════════════════════╦════════════╦═══════════════╣"
  echo "║ Code  ║ URL                           ║ Status     ║ IdPs          ║"
  echo "╠═══════╬═══════════════════════════════╬════════════╬═══════════════╣"
  
  for compose_file in docker-compose*.yml; do
    # Extract instance code
    if [[ "$compose_file" == "docker-compose.yml" ]]; then
      CODE="USA"
    else
      CODE=$(echo "$compose_file" | sed 's/docker-compose\.\(.*\)\.yml/\1/' | tr '[:lower:]' '[:upper:]')
    fi
    
    CODE_LOWER=$(echo "$CODE" | tr '[:upper:]' '[:lower:]')
    URL="https://${CODE_LOWER}-app.dive25.com"
    
    # Check health
    if curl -sf "${URL}/" >/dev/null 2>&1; then
      STATUS="✅ Online"
      # Get IdP count
      IDP_COUNT=$(curl -sf "https://${CODE_LOWER}-api.dive25.com/api/idps/public" 2>/dev/null | jq '.idps | length' 2>/dev/null || echo "?")
    else
      STATUS="❌ Offline"
      IDP_COUNT="-"
    fi
    
    printf "║ %-5s ║ %-29s ║ %-10s ║ %-13s ║\n" "$CODE" "$URL" "$STATUS" "${IDP_COUNT} partners"
  done
  
  echo "╚═══════╩═══════════════════════════════╩════════════╩═══════════════╝"
}

health_check() {
  local CODE=$1
  local CODE_LOWER=$(echo "$CODE" | tr '[:upper:]' '[:lower:]')
  
  echo "🏥 Health Check for $CODE"
  echo "════════════════════════════════════════"
  
  services=("frontend" "backend" "keycloak" "opa" "mongodb" "redis")
  
  for svc in "${services[@]}"; do
    container="dive-v3-${svc}"
    [[ "$CODE" != "USA" ]] && container="dive-v3-${svc}-${CODE_LOWER}"
    
    status=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "unknown")
    
    case "$status" in
      healthy)   icon="✅" ;;
      unhealthy) icon="❌" ;;
      starting)  icon="🔄" ;;
      *)         icon="❓" ;;
    esac
    
    printf "  %s %-12s %s\n" "$icon" "$svc" "$status"
  done
  
  echo ""
  echo "🌐 External Endpoints"
  echo "────────────────────────────────────────"
  
  endpoints=(
    "Frontend|https://${CODE_LOWER}-app.dive25.com/"
    "API|https://${CODE_LOWER}-api.dive25.com/api/health"
    "Keycloak|https://${CODE_LOWER}-idp.dive25.com/realms/dive-v3-broker"
  )
  
  for ep in "${endpoints[@]}"; do
    name="${ep%%|*}"
    url="${ep##*|}"
    
    http_code=$(curl -sf -o /dev/null -w "%{http_code}" "$url" --max-time 5 2>/dev/null || echo "000")
    
    if [[ "$http_code" == "200" ]]; then
      icon="✅"
    else
      icon="❌"
    fi
    
    printf "  %s %-12s %s\n" "$icon" "$name" "$http_code"
  done
}

case "$COMMAND" in
  status)  status_all ;;
  health)  health_check "$INSTANCE" ;;
  help|*)  show_help ;;
esac
```

- [ ] **3.1.2** Add colorized output with proper formatting
- [ ] **3.1.3** Add JSON output mode for scripting
- [ ] **3.1.4** Add `--watch` mode for continuous status

**Deliverable:** Full lifecycle management via single script.

---

### 3.2 Quick Demo Commands

**Goal:** One-liners for common demo scenarios.

**Tasks:**

- [ ] **3.2.1** Create demo helper script

```bash
#!/usr/bin/env bash
# scripts/demo-helper.sh - Quick commands for demos

COMMAND="${1:-help}"

case "$COMMAND" in
  open-all)
    # Open all active instances in browser
    for url in $(./scripts/manage-instances.sh list --format=urls); do
      open "$url"
    done
    ;;
    
  add-partner)
    # Quick add a new partner with countdown
    CODE="${2:-ESP}"
    echo "🚀 Adding $CODE to federation in..."
    for i in 3 2 1; do echo "   $i..."; sleep 1; done
    ./scripts/deploy-dive-instance.sh "$CODE"
    ;;
    
  show-users)
    # Display test user credentials
    cat << EOF
╔═══════════════════════════════════════════════════════════╗
║                    TEST USER CREDENTIALS                   ║
╠═══════════════════╦═══════════════════╦═══════════════════╣
║ Username Pattern  ║ Password          ║ Clearance         ║
╠═══════════════════╬═══════════════════╬═══════════════════╣
║ admin.{code}      ║ DiveDemo2025!     ║ TOP_SECRET        ║
║ officer.{code}    ║ DiveDemo2025!     ║ SECRET            ║
║ analyst.{code}    ║ DiveDemo2025!     ║ CONFIDENTIAL      ║
║ guest.{code}      ║ DiveDemo2025!     ║ UNCLASSIFIED      ║
╚═══════════════════╩═══════════════════╩═══════════════════╝
Examples: admin.usa, officer.fra, guest.deu
EOF
    ;;
    
  cross-auth-demo)
    # Guide through cross-border auth demo
    cat << EOF
╔═══════════════════════════════════════════════════════════╗
║            CROSS-BORDER AUTHENTICATION DEMO                ║
╠═══════════════════════════════════════════════════════════╣
║                                                            ║
║  1. Open: https://fra-app.dive25.com                       ║
║                                                            ║
║  2. Click: "Germany" in the IdP selector                   ║
║                                                            ║
║  3. Login as: officer.deu / DiveDemo2025!                  ║
║                                                            ║
║  4. ✅ German user now authenticated on French instance!   ║
║                                                            ║
║  5. Check: User attributes show:                           ║
║     - countryOfAffiliation: DEU                            ║
║     - clearance: SECRET                                    ║
║     - Authenticated via: France broker                     ║
║                                                            ║
╚═══════════════════════════════════════════════════════════╝
EOF
    ;;
    
  *)
    echo "Demo Helper Commands:"
    echo "  open-all         Open all instances in browser"
    echo "  add-partner ITA  Live-add a new partner"
    echo "  show-users       Display test credentials"
    echo "  cross-auth-demo  Walk through cross-border demo"
    ;;
esac
```

**Deliverable:** `./scripts/demo-helper.sh` for common demo tasks.

---

## Phase 4: UI Enhancements (Days 7-8)

### 4.1 Instance Branding

**Goal:** Each instance visually reflects its country.

**Tasks:**

- [ ] **4.1.1** Add instance indicator to header

```typescript
// frontend/src/components/ui/instance-badge.tsx

interface InstanceBadgeProps {
  code: string;
  name: string;
}

export function InstanceBadge({ code, name }: InstanceBadgeProps) {
  const FlagComponent = getCountryFlagComponent(code);
  
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-white/10 backdrop-blur rounded-full">
      <FlagComponent size={20} />
      <span className="text-sm font-medium text-white">{name} Instance</span>
    </div>
  );
}
```

- [ ] **4.1.2** Add country-themed color accents

```typescript
// frontend/src/lib/theme-colors.ts

export const COUNTRY_THEMES: Record<string, { primary: string; accent: string }> = {
  USA: { primary: '#3C3B6E', accent: '#B22234' },
  FRA: { primary: '#002395', accent: '#ED2939' },
  DEU: { primary: '#000000', accent: '#DD0000' },
  GBR: { primary: '#012169', accent: '#C8102E' },
  ITA: { primary: '#009246', accent: '#CE2B37' },
  ESP: { primary: '#AA151B', accent: '#F1BF00' },
  // ... etc
};

export function getThemeForInstance(code: string) {
  return COUNTRY_THEMES[code] || COUNTRY_THEMES.USA;
}
```

- [ ] **4.1.3** Apply theme colors to UI elements

**Deliverable:** Each instance has visual branding matching its country.

---

### 4.2 Federation Status Dashboard

**Goal:** Visual display of federation health on landing page.

**Tasks:**

- [ ] **4.2.1** Create federation status component

```typescript
// frontend/src/components/federation/federation-status.tsx

export function FederationStatus() {
  const [partners, setPartners] = useState<FederationPartner[]>([]);
  
  useEffect(() => {
    fetch('/api/federation/partners')
      .then(r => r.json())
      .then(data => setPartners(data.partners));
  }, []);
  
  return (
    <div className="bg-white/5 backdrop-blur rounded-xl p-4 mt-6">
      <h3 className="text-sm font-semibold text-gray-300 mb-3">
        Federation Status
      </h3>
      <div className="flex flex-wrap gap-2">
        {partners.map(p => (
          <div 
            key={p.code}
            className="flex items-center gap-1.5 px-2 py-1 bg-white/10 rounded-full"
          >
            <span className={`w-2 h-2 rounded-full ${
              p.status === 'active' ? 'bg-emerald-500' : 'bg-red-500'
            }`} />
            <span className="text-xs text-gray-300">{p.code}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **4.2.2** Add to landing page below IdP selector

**Deliverable:** Users see which federation partners are online.

---

## Phase 5: Documentation & Polish (Days 9-10)

### 5.1 Demo Runbook

**Goal:** Step-by-step guide for conducting demos.

**Tasks:**

- [ ] **5.1.1** Create demo runbook document

```markdown
# DIVE V3 Demo Runbook

## Pre-Demo Checklist (15 min before)

- [ ] Run `./scripts/manage-instances.sh status` - all green?
- [ ] Test login on USA instance with `admin.usa`
- [ ] Clear browser history/cookies (fresh session)
- [ ] Have terminal ready with scripts directory

## Demo Flow (20-30 minutes)

### Act 1: Introduction (5 min)
- Explain DIVE V3 mission
- Show architecture diagram
- Highlight: "Multiple sovereign instances, federated trust"

### Act 2: Cross-Border Auth (5 min)
- Go to fra-app.dive25.com
- "I'm a German officer visiting French system"
- Click Germany, login as officer.deu
- Show attributes in dashboard

### Act 3: Policy Enforcement (5 min)
- Try to access SECRET document as guest.usa
- Show denial with reason
- Login as officer.usa
- Show successful access

### Act 4: Live Partner Addition (10 min)
- "Let's add Italy to the federation"
- Run: `./scripts/deploy-dive-instance.sh ITA`
- Narrate each step as it happens
- Navigate to ita-app.dive25.com
- Show Italy can now auth via USA, FRA, DEU
- Refresh fra-app.dive25.com - Italy appears!

### Act 5: Q&A (5 min)
- Common questions in FAQ section

## Troubleshooting During Demo

| Issue | Quick Fix |
|-------|-----------|
| Instance offline | `./scripts/manage-instances.sh restart {code}` |
| Login fails | Check Keycloak logs, restart if needed |
| Page won't load | Check Cloudflare tunnel status |
| Slow response | "That's the overseas latency simulation" 😉 |
```

- [ ] **5.1.2** Create FAQ for common stakeholder questions
- [ ] **5.1.3** Record backup demo video

**Deliverable:** Anyone can conduct a polished demo.

---

### 5.2 Final Polish

**Tasks:**

- [ ] **5.2.1** Ensure all scripts have `--help` documentation
- [ ] **5.2.2** Add ASCII art banners to key scripts
- [ ] **5.2.3** Create `scripts/preflight-check.sh` for validation
- [ ] **5.2.4** Test full flow on clean machine
- [ ] **5.2.5** Update main README with pilot quick-start

**Deliverable:** Production-quality pilot experience.

---

## Checklist Summary

### Phase 1: Foundation (Days 1-2)
- [ ] 1.1.1 Test user Terraform module
- [ ] 1.1.2 Update existing instances
- [ ] 1.1.3 Document test user matrix
- [ ] 1.2.1 Enhanced deploy script
- [ ] 1.2.2 Dry-run flag
- [ ] 1.2.3 Verbose flag
- [ ] 1.2.4 Rollback on failure

### Phase 2: Federation Automation (Days 3-4)
- [ ] 2.1.1 Federation discovery service
- [ ] 2.1.2 Auto-create IdP brokers
- [ ] 2.1.3 Refresh federation script
- [ ] 2.2.1 Bidirectional trust setup
- [ ] 2.2.2 Event system (stretch)

### Phase 3: Instance Management (Days 5-6)
- [ ] 3.1.1 Enhanced manage-instances.sh
- [ ] 3.1.2 Colorized output
- [ ] 3.1.3 JSON output mode
- [ ] 3.1.4 Watch mode
- [ ] 3.2.1 Demo helper script

### Phase 4: UI Enhancements (Days 7-8)
- [ ] 4.1.1 Instance badge component
- [ ] 4.1.2 Country theme colors
- [ ] 4.1.3 Apply theme to UI
- [ ] 4.2.1 Federation status component
- [ ] 4.2.2 Add to landing page

### Phase 5: Documentation & Polish (Days 9-10)
- [ ] 5.1.1 Demo runbook
- [ ] 5.1.2 FAQ document
- [ ] 5.1.3 Backup demo video
- [ ] 5.2.1 Script help documentation
- [ ] 5.2.2 ASCII art banners
- [ ] 5.2.3 Preflight check script
- [ ] 5.2.4 Clean machine test
- [ ] 5.2.5 Update main README

---

## Success Criteria

| Metric | Target |
|--------|--------|
| Deploy new instance | < 5 minutes |
| All pre-flight checks pass | 100% |
| Cross-border auth works | All combinations |
| Demo runnable by non-developer | Yes |
| Stakeholder feedback | Positive |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Cloudflare rate limits | Use existing tunnels, document limits |
| Docker resource exhaustion | Document minimum specs, test on target hardware |
| Demo day failures | Backup video, pre-warm instances |
| Network connectivity | Local fallback mode (stretch) |

---

*Let's make federation frictionless!* 🚀








