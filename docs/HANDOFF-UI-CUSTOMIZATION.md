# DIVE V3 - UI/UX Customization Session Handoff

**Copy this entire document into a new chat session for full context.**

---

## Session Focus: Instance-Specific UI/UX Customization

This session focuses on implementing scalable UI/UX customization that allows each coalition partner instance to have its own visual identity while maintaining a consistent user experience.

---

## Project Overview

**DIVE V3** is a coalition-friendly ICAM (Identity, Credential, and Access Management) web application demonstrating federated identity management across USA/NATO partners.

### Current State (Nov 25, 2025)

```
INST   FRONTEND   BACKEND    KEYCLOAK   IdPs   EXTERNAL URL
────   ────────   ───────    ────────   ────   ─────────────────────────
USA     ✓ 200     ✓ 200     ✓ 200     13     https://usa-app.dive25.com
FRA     ✓ 200     ✓ 200     ✓ 200     2      https://fra-app.dive25.com
DEU     ✓ 200     ✓ 200     ✓ 200     2      https://deu-app.dive25.com
```

All 3 instances are running and accessible.

### Tech Stack
- **Frontend**: Next.js 15+ (App Router), TypeScript, Tailwind CSS
- **Auth**: Keycloak 26.x with custom themes
- **Infrastructure**: Docker Compose, Terraform

---

## Current UI Components

### 1. Instance Banner (`frontend/src/components/ui/instance-banner.tsx`)

Displays the current instance with flag, name, and status:

```tsx
// Instance color themes (current implementation)
const INSTANCE_THEMES: Record<string, { bg: string; border: string; text: string }> = {
  USA: { bg: 'bg-blue-900/10', border: 'border-blue-600', text: 'text-blue-800' },
  FRA: { bg: 'bg-blue-900/10', border: 'border-blue-600', text: 'text-blue-800' },
  DEU: { bg: 'bg-gray-900/10', border: 'border-yellow-500', text: 'text-gray-800' },
  GBR: { bg: 'bg-red-900/10', border: 'border-red-600', text: 'text-red-800' },
  CAN: { bg: 'bg-red-900/10', border: 'border-red-600', text: 'text-red-800' },
  // ... more countries
};
```

### 2. Country Flags (`frontend/src/components/ui/flags.tsx`)

Self-contained SVG flag components with premium design:
- Subtle gradients and shine overlays
- Rounded corners and drop shadows
- Properly layered patterns (Union Jack, etc.)

### 3. IdP Selector (`frontend/src/components/auth/idp-selector.tsx`)

Displays available Identity Providers:
- Country flags with size prop
- Subtle green pulsing status indicator
- Compact design (no technical jargon)
- Filters out "Industry Partners" IdP

---

## Instance Configuration Schema

Each instance has a `instance.json` file defining its configuration:

```json
// instances/usa/instance.json
{
  "instance_code": "USA",
  "instance_name": "United States",
  "locale": "en",
  "hostnames": {
    "app": "usa-app.dive25.com",
    "api": "usa-api.dive25.com",
    "idp": "usa-idp.dive25.com"
  },
  "theme": {
    "primary_color": "#1a365d",
    "secondary_color": "#2b6cb0",
    "accent_color": "#3182ce",
    "background_image": "background-usa.jpg",
    "keycloak_theme": "dive-v3-usa",
    "css_variables": {
      "--instance-primary": "#1a365d",
      "--instance-secondary": "#2b6cb0",
      "--instance-accent": "#3182ce",
      "--instance-text": "#ffffff",
      "--instance-banner-bg": "linear-gradient(135deg, #1a365d 0%, #2b6cb0 100%)"
    }
  },
  "federation_partners": ["FRA", "DEU", "GBR", "CAN"]
}
```

```json
// instances/fra/instance.json
{
  "instance_code": "FRA",
  "instance_name": "France",
  "locale": "fr",
  "theme": {
    "primary_color": "#002395",
    "secondary_color": "#ED2939",
    "accent_color": "#ffffff",
    "keycloak_theme": "dive-v3-fra",
    "css_variables": {
      "--instance-primary": "#002395",
      "--instance-secondary": "#ED2939",
      "--instance-banner-bg": "linear-gradient(135deg, #002395 0%, #ED2939 100%)"
    }
  }
}
```

---

## UI/UX Customization Requirements

### Priority 1: Dynamic Theme Application

**Goal**: Each instance should automatically apply its theme from `instance.json`

**Current Gap**: CSS variables are defined in config but not dynamically applied

**Required**:
1. Read `instance.json` at build/runtime
2. Inject CSS variables into `:root`
3. Update Tailwind theme to use CSS variables
4. Ensure Keycloak login theme matches

### Priority 2: Background Customization

**Goal**: Each instance can have a unique background

**Options**:
- Solid gradient (from CSS variables)
- Country-specific image
- Animated/particle background
- Professional institutional look

### Priority 3: Logo/Branding

**Goal**: Support country-specific logos and branding

**Required**:
- Logo upload/config per instance
- Header logo placement
- Favicon per instance
- Login page branding

### Priority 4: Keycloak Theme Synchronization

**Goal**: Keycloak login page matches instance theme

**Required**:
- Generate Keycloak theme from `instance.json`
- Apply colors, logos, backgrounds
- Localization (fr for FRA, de for DEU, etc.)

---

## Phased Implementation Plan

### Phase 1: CSS Variable Integration
**Duration**: 2-3 hours
**SMART Objectives**:
- [S] Create theme provider that reads `instance.json` and injects CSS variables
- [M] All 3 instances display their configured primary color in banner
- [A] Achievable with existing Next.js app structure
- [R] Foundation for all other theming
- [T] Complete within this session

**Success Criteria**:
- [ ] USA banner shows blue (#1a365d) gradient
- [ ] FRA banner shows blue/red (#002395/#ED2939) gradient
- [ ] DEU banner shows black/red/gold gradient
- [ ] No hardcoded colors in components

**Test Suite**:
```bash
# Verify CSS variables are injected
curl -s https://localhost:3000 | grep "instance-primary"
curl -s https://localhost:3001 | grep "instance-primary"
curl -s https://localhost:3002 | grep "instance-primary"
```

### Phase 2: Background System
**Duration**: 2-3 hours
**SMART Objectives**:
- [S] Create background component that supports gradient, image, or custom patterns
- [M] Each instance displays visually distinct background
- [A] Using existing Tailwind utilities
- [R] Major visual differentiation between instances
- [T] Complete within this session

**Success Criteria**:
- [ ] USA: Professional blue gradient with subtle pattern
- [ ] FRA: Tricolor gradient with subtle texture
- [ ] DEU: Bundesfarben gradient
- [ ] Backgrounds don't interfere with readability

**Deliverables**:
- `frontend/src/components/ui/instance-background.tsx`
- Background assets in `frontend/public/backgrounds/`

### Phase 3: Keycloak Theme Generation
**Duration**: 3-4 hours
**SMART Objectives**:
- [S] Create script to generate Keycloak theme from `instance.json`
- [M] Login page colors match frontend
- [A] Building on existing `keycloak/themes/` structure
- [R] Unified visual experience across login flow
- [T] Complete within this session

**Success Criteria**:
- [ ] `scripts/generate-keycloak-theme.sh {CODE}` produces valid theme
- [ ] Theme applied to respective Keycloak instance
- [ ] Logo and colors match frontend
- [ ] Localized text (Login → Connexion for FRA)

**Keycloak Theme Structure**:
```
keycloak/themes/dive-v3-{code}/
├── login/
│   ├── resources/
│   │   ├── css/
│   │   │   └── styles.css      # Generated from instance.json
│   │   └── img/
│   │       └── logo.png        # Instance-specific logo
│   ├── messages/
│   │   └── messages_{locale}.properties
│   └── theme.properties
```

### Phase 4: Scalability Validation
**Duration**: 1-2 hours
**SMART Objectives**:
- [S] Add a new instance (GBR) to validate the system
- [M] GBR instance has unique theming with minimal manual work
- [A] Using existing scripts and patterns
- [R] Proves scalability for future partners
- [T] Complete within this session

**Success Criteria**:
- [ ] Create `instances/gbr/instance.json` with UK theme
- [ ] Run deploy script - theme automatically applied
- [ ] Frontend shows Union Jack branding
- [ ] Keycloak login matches UK theme
- [ ] Full test suite passes

---

## Key Files to Modify/Create

### Frontend Components
```
frontend/src/
├── components/
│   ├── ui/
│   │   ├── instance-banner.tsx      # UPDATE: Use CSS variables
│   │   ├── instance-background.tsx  # CREATE: Background component
│   │   ├── flags.tsx                # EXISTS: Country flags
│   │   └── theme-provider.tsx       # CREATE: CSS variable injection
│   └── auth/
│       └── idp-selector.tsx         # UPDATE: Theme-aware styling
├── app/
│   └── layout.tsx                   # UPDATE: Add ThemeProvider
└── styles/
    └── theme.css                    # CREATE: CSS variable definitions
```

### Instance Configuration
```
instances/{code}/
├── instance.json                    # Theme configuration
├── assets/
│   ├── logo.png                     # Instance logo
│   ├── logo-dark.png               # Dark mode logo
│   └── background.jpg              # Optional background image
└── keycloak-theme/                  # Generated Keycloak theme
```

### Scripts
```
scripts/
├── generate-instance-theme.sh       # CREATE: Generate frontend theme
├── generate-keycloak-theme.sh       # CREATE: Generate Keycloak theme
└── validate-theme.sh                # CREATE: Test theme application
```

---

## Environment Variables for Theming

```bash
# Instance identification
NEXT_PUBLIC_INSTANCE=USA
NEXT_PUBLIC_INSTANCE_NAME="United States"
NEXT_PUBLIC_LOCALE=en

# Theme (read from instance.json or override)
NEXT_PUBLIC_THEME_PRIMARY=#1a365d
NEXT_PUBLIC_THEME_SECONDARY=#2b6cb0
NEXT_PUBLIC_THEME_ACCENT=#3182ce

# Branding
NEXT_PUBLIC_LOGO_URL=/logos/usa-logo.png
NEXT_PUBLIC_BACKGROUND_TYPE=gradient  # gradient|image|pattern
```

---

## Design Guidelines

### Color Principles
1. **Primary**: Main brand color (buttons, headers, links)
2. **Secondary**: Supporting color (accents, highlights)
3. **Accent**: Call-to-action elements
4. **Text**: Ensure WCAG AA contrast ratio (4.5:1)

### Country Color References
| Country | Primary | Secondary | Accent |
|---------|---------|-----------|--------|
| USA | #1a365d (Navy) | #2b6cb0 (Blue) | #3182ce |
| FRA | #002395 (Blue) | #ED2939 (Red) | #FFFFFF |
| DEU | #000000 (Black) | #DD0000 (Red) | #FFCC00 (Gold) |
| GBR | #012169 (Blue) | #C8102E (Red) | #FFFFFF |
| CAN | #FF0000 (Red) | #FFFFFF | #FF0000 |
| ITA | #009246 (Green) | #CE2B37 (Red) | #FFFFFF |

### Typography
- Maintain consistent font family across instances
- Use instance colors for headings/emphasis
- Keep body text high-contrast (dark on light or vice versa)

### Accessibility
- All color combinations must pass WCAG AA
- Focus indicators must be visible
- Screen reader compatible

---

## Quick Reference Commands

```bash
# Check current instance theme
curl -s https://localhost:3000 | grep "instance-primary"

# View instance configuration
cat instances/usa/instance.json | jq '.theme'

# Restart frontend to apply changes
docker-compose restart frontend

# Generate Keycloak theme (once script created)
./scripts/generate-keycloak-theme.sh USA

# Run UI test suite
./scripts/tests/test-pilot-comprehensive.sh

# Check status
./scripts/dive status
```

---

## CLI Permissions Required

### GitHub CLI (`gh`)
```bash
gh auth status  # Verify authentication
gh secret set <name>  # Store secrets
```

### Cloudflare CLI (`cloudflared`, `wrangler`)
```bash
cloudflared tunnel list
cloudflared tunnel create dive-v3-{code}
cloudflared tunnel route dns {tunnel-id} {hostname}
```

### GCP CLI (`gcloud`) - For New Project
```bash
gcloud auth login
gcloud projects create dive-v3-pilot --name="DIVE V3 Pilot"
gcloud config set project dive-v3-pilot
```

### Docker
```bash
docker-compose -f instances/{code}/docker-compose.yml up -d
docker logs dive-v3-frontend-{code}
```

### Terraform
```bash
terraform workspace list
terraform workspace select {code}
terraform apply -var-file={code}.tfvars
```

---

## MCP Tools Available

- **Keycloak Docs MCP**: `mcp_keycloak-docs_docs_search` - Search Keycloak theming documentation
- **Browser MCP**: `mcp_cursor-ide-browser_*` - Visual testing in browser

---

## Critical Rules

1. **Scalability First**: Every solution must work for N instances, not just 3
2. **Configuration-Driven**: All customization via `instance.json`, no hardcoding
3. **Best Practice Only**: No shortcuts or workarounds
4. **Test Everything**: Each phase must have passing test suite
5. **Commit Often**: Git commit after each successful phase
6. **No PII**: Never log personal information

---

## Expected Deliverables by End of Session

1. **ThemeProvider component** that reads instance config and injects CSS variables
2. **InstanceBackground component** with gradient/image support
3. **Keycloak theme generator script** that creates themes from instance.json
4. **Validation script** to test theme application
5. **Documentation updates** with theming guide
6. **Git commits** for each completed phase

---

## Session Success Criteria

| Criteria | Verification |
|----------|--------------|
| USA, FRA, DEU have visually distinct themes | Screenshot comparison |
| CSS variables properly injected | Browser DevTools inspection |
| Keycloak login matches frontend | Visual verification |
| Adding new instance requires only `instance.json` | Deploy GBR as test |
| All tests pass | `./scripts/tests/test-pilot-comprehensive.sh` |
| Changes committed to GitHub | `git log --oneline -5` |

---

## Known Issues & Context

1. **Flags are SVG components** - Use `getFlagComponent(code)` from `flags.tsx`
2. **Tailwind CSS** - Use `bg-[var(--instance-primary)]` syntax for CSS variables
3. **Next.js App Router** - Client components need `'use client'` directive
4. **Docker volumes** - Changes may require container restart to see

---

## Test Users for Visual Testing

| Instance | Username | Password |
|----------|----------|----------|
| USA | testuser-usa-1 | DiveDemo2025! |
| FRA | testuser-fra-1 | DiveDemo2025! |
| DEU | testuser-deu-1 | DiveDemo2025! |

---

*Last Updated: November 25, 2025*


