# DIVE V3 Pilot: Streamlined Federation Onboarding

## ⚡ Quick Start for Demos

> **This is a PILOT/POC/DEMO** - We acknowledge ACP-240, STANAGs 4774/5636, and NATO federation standards while prioritizing **frictionless demonstration** of interoperability capabilities.

---

## 🎯 Pilot Philosophy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PILOT MODE vs PRODUCTION                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   PILOT (NOW)                          PRODUCTION (FUTURE)                   │
│   ───────────                          ────────────────────                  │
│   ✅ Single command to add IdP          Multi-stage approval workflow        │
│   ✅ Pre-approved test users            Formal vetting & background checks   │
│   ✅ Simplified attribute mapping       Interactive mapping wizard           │
│   ✅ Trust all demo partners            Tiered trust with toggles            │
│   ✅ Shared admin credentials           Role-based delegated admin           │
│                                                                              │
│   GOAL: Demonstrate federated auth      GOAL: Production-grade governance    │
│         in < 5 minutes                        with full compliance           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Add a New Partner in 3 Steps

### Step 1: Run the Deploy Script

```bash
# Deploy a new instance (e.g., Italy)
./scripts/deploy-dive-instance.sh ITA

# That's it! Script handles:
# ✓ Docker services (Keycloak, Backend, Frontend, OPA, etc.)
# ✓ Cloudflare tunnel + DNS routes
# ✓ SSL certificates (mkcert)
# ✓ Keycloak realm with federation IdPs
# ✓ Test users with various clearance levels
```

### Step 2: Verify Access

```bash
# Check all instances are healthy
./scripts/manage-instances.sh status

# Output:
# USA: ✅ https://usa-app.dive25.com (10 IdPs)
# FRA: ✅ https://fra-app.dive25.com (2 IdPs)  
# DEU: ✅ https://deu-app.dive25.com (2 IdPs)
# ITA: ✅ https://ita-app.dive25.com (2 IdPs)  ← NEW!
```

### Step 3: Demo!

Navigate to the new instance and authenticate via any federated partner.

---

## 📋 Pre-Configured Test Users

Each instance comes with 4 test users. **Higher number = Higher clearance!**

| Username | Clearance | COI | Easy to Remember |
|----------|-----------|-----|------------------|
| `testuser-{code}-1` | UNCLASSIFIED | - | Level 1 = Lowest |
| `testuser-{code}-2` | CONFIDENTIAL | - | Level 2 |
| `testuser-{code}-3` | SECRET | NATO | Level 3 |
| `testuser-{code}-4` | TOP_SECRET | FVEY, NATO-COSMIC | Level 4 = Highest |

**Password for all test users:** `DiveDemo2025!`

**Examples:**
- `testuser-usa-3` = US user with SECRET clearance
- `testuser-fra-4` = French user with TOP_SECRET clearance
- `testuser-deu-1` = German user with UNCLASSIFIED clearance

---

## 🔗 Federation Topology

```
                              ┌─────────────┐
                              │   USA       │
                              │  (Primary)  │
                              │  10 IdPs    │
                              └──────┬──────┘
                                     │
              ┌──────────────────────┼──────────────────────┐
              │                      │                      │
              ▼                      ▼                      ▼
       ┌─────────────┐       ┌─────────────┐       ┌─────────────┐
       │    FRA      │       │    DEU      │       │    ITA      │
       │  Instance   │◀─────▶│  Instance   │◀─────▶│  Instance   │
       │   2 IdPs    │       │   2 IdPs    │       │   2 IdPs    │
       └─────────────┘       └─────────────┘       └─────────────┘
              │                      │                      │
              └──────────────────────┼──────────────────────┘
                                     │
                              Mutual Federation
                              (Each trusts others)
```

---

## 🎨 Quick UI Customization (Demo)

Want to show country-specific theming? Edit the instance's frontend env:

```bash
# Edit docker-compose.{code}.yml
# Change these environment variables:

NEXT_PUBLIC_INSTANCE: "ITA"
NEXT_PUBLIC_APP_NAME: "DIVE V3 - Italy Instance"
# Theme colors auto-derived from flag!
```

Restart the frontend:
```bash
docker restart dive-v3-frontend-ita
```

---

## 📜 Standards Acknowledgment

> **For Production Deployment**, the following standards would govern federation:

| Standard | Scope | Pilot Status |
|----------|-------|--------------|
| **ACP-240** | NATO Access Control Policy | 📝 Documented, not enforced |
| **STANAG 4774** | Confidentiality Metadata Label | 📝 Schema defined |
| **STANAG 5636** | Security Label Binding | 📝 OPA policies drafted |
| **NIST 800-63** | Identity Assurance Levels | 📝 Mapping documented |

### What This Means for Demos:

- ✅ **Show** the classification labels on documents
- ✅ **Demonstrate** attribute-based access control
- ✅ **Prove** cross-border authentication works
- ⏸️ **Defer** formal vetting, compliance audits, governance workflows

---

## 🛠️ Pilot Admin Commands

### Add a New Instance
```bash
./scripts/deploy-dive-instance.sh {ISO-3166-ALPHA-3}
# Examples: ITA, ESP, POL, NLD, GBR, CAN, AUS, JPN
```

### Check Status of All Instances
```bash
./scripts/manage-instances.sh status
```

### View Logs
```bash
./scripts/manage-instances.sh logs {code}
# Example: ./scripts/manage-instances.sh logs fra
```

### Restart an Instance
```bash
./scripts/manage-instances.sh restart {code}
```

### Stop an Instance
```bash
./scripts/manage-instances.sh stop {code}
```

### Sync Keycloak Realm from USA
```bash
./scripts/sync-keycloak-realm.sh usa {code}
```

---

## 🎬 Demo Scenarios

### Scenario 1: Cross-Border Authentication
1. Go to `https://fra-app.dive25.com`
2. Click "Germany" (DEU) IdP
3. Login as `testuser-deu-3` / `DiveDemo2025!` (SECRET clearance)
4. ✅ German user authenticated on French instance

### Scenario 2: Clearance-Based Access Control
1. Login as `testuser-usa-1` (UNCLASSIFIED - Level 1)
2. Try to access a SECRET document
3. ❌ Access denied - insufficient clearance
4. Login as `testuser-usa-3` (SECRET - Level 3)
5. ✅ Access granted

### Scenario 3: Releasability Check
1. Login as `testuser-fra-3` on USA instance
2. Try to access a USA-ONLY document
3. ❌ Access denied - France not in releasabilityTo
4. Try to access a NATO document
5. ✅ Access granted - France is NATO member

### Scenario 4: Add New Partner Live
1. During demo, run: `./scripts/deploy-dive-instance.sh ESP`
2. Wait ~2 minutes for services to start
3. Navigate to `https://esp-app.dive25.com`
4. Login as `testuser-esp-4` (TOP_SECRET - Level 4)
5. ✅ Spain instance live with full federation!

---

## 📊 Pilot Metrics to Capture

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Time to add new partner | < 5 min | Stopwatch during demo |
| Cross-border auth success | 100% | Demo all combinations |
| Policy decision latency | < 200ms | OPA metrics endpoint |
| Audience comprehension | High | Post-demo feedback |

---

## 🔮 Future Vision (Post-Pilot)

If this pilot is successful, the full implementation would include:

1. **Self-Service Portal** - Partners request access via web form
2. **Automated Vetting** - Metadata validation, security scans
3. **Approval Workflow** - Multi-stage review with audit trail
4. **Interactive Attribute Mapping** - Visual claim normalization tool
5. **Delegated Administration** - Partner-specific admins
6. **Compliance Monitoring** - Continuous health checks
7. **Trust Tiering** - Granular trust relationship management

See: [Full Architecture Vision](./FEDERATION-ADMIN-ARCHITECTURE.md)

---

## ❓ FAQ

**Q: Is this production-ready?**  
A: No. This is a pilot demonstrating technical feasibility. Production would require formal governance, vetting, and compliance frameworks.

**Q: Are the test users secure?**  
A: No. All test credentials are shared and documented. This is intentional for demo purposes.

**Q: Can I demo this to external stakeholders?**  
A: Yes! That's the point. Show the art of the possible while noting production requirements.

**Q: What if something breaks during a demo?**  
A: Run `./scripts/manage-instances.sh restart {code}` or check logs with `./scripts/manage-instances.sh logs {code}`.

---

*Remember: The goal is to **prove interoperability is possible**, not to build Fort Knox.*

