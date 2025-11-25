# Phase 4: UI Enhancements - SMART Objectives

**Duration**: Day 6-7  
**Status**: In Progress

---

## Overview

Phase 4 focuses on UI components that enhance the pilot demonstration experience, including instance awareness, demo mode indicators, and self-service onboarding visualization.

---

## Objective 4.1: Instance Banner Component

### Specific
Create an `InstanceBanner` component that displays the current DIVE V3 instance (USA, FRA, DEU) with country flag, name, status indicator, and pilot mode badge.

### Measurable
- Component renders correctly for all supported country codes
- Status indicator shows active (green pulse), inactive (gray), degraded (yellow)
- Pilot mode badge is conditionally displayed
- Flag icons display at correct size (28px)
- Component has both full (`InstanceBanner`) and compact (`InstanceBadge`) variants

### Achievable
Builds on existing `flags.tsx` component and follows established Tailwind CSS patterns.

### Relevant
Helps demo observers quickly identify which instance they're viewing during presentations.

### Time-bound
Complete by end of Day 6.

**Deliverables**:
- `frontend/src/components/ui/instance-banner.tsx`
- Integration into page layout

---

## Objective 4.2: Demo Mode Badge Component

### Specific
Create a `DemoModeBadge` component that shows the current test user's clearance level and country affiliation for pilot demonstrations.

### Measurable
- Only displays for users with `uniqueID` starting with `testuser-`
- Shows clearance level with appropriate color coding:
  - UNCLASSIFIED: Green
  - CONFIDENTIAL: Blue
  - SECRET: Yellow
  - TOP_SECRET: Red
- Extracts and displays clearance level number (1-4)
- Fixed position in bottom-right corner (z-50)
- Includes inline variant for tight spaces

### Achievable
Uses session data and follows established component patterns.

### Relevant
Helps demo coordinators verify the correct user context during pilot presentations.

### Time-bound
Complete by end of Day 6.

**Deliverables**:
- `frontend/src/components/ui/demo-mode-badge.tsx`

---

## Objective 4.3: Partner Trust Toggle Component

### Specific
Create a `PartnerTrustToggle` component that allows federation administrators to view and simulate toggling trusted partners.

### Measurable
- Displays list of federation partners with flags and status
- Status badges: trusted (green), pending (yellow), disabled (gray)
- Toggle switch changes partner status visually
- Tracks pending changes with visual indicator
- Includes pilot mode notice explaining simulation
- Save/Cancel buttons for change management
- Includes compact `PartnerList` variant for read-only display

### Achievable
Uses pilot default partners (USA, FRA, DEU, GBR, CAN) for demonstration.

### Relevant
Demonstrates the envisioned trust management workflow for federation administrators.

### Time-bound
Complete by end of Day 6.

**Deliverables**:
- `frontend/src/components/federation/partner-trust-toggle.tsx`

---

## Objective 4.4: Pilot Onboarding Wizard

### Specific
Create a `PilotOnboardingWizard` component that demonstrates the 3-step partner onboarding flow.

### Measurable
- 3-step wizard with visual progress indicator:
  1. Partner Details
  2. Technical Setup
  3. Review & Activate
- Quick-add buttons for pre-configured partners (ITA, ESP, NLD, POL, BEL, NOR)
- Manual configuration form with validation
- OIDC/SAML protocol selection
- Auto-map attributes checkbox
- Configuration summary review
- Standards compliance acknowledgment (ACP-240, ISO 3166-1, STANAG)
- Processing state with spinner

### Achievable
Self-contained component with local state management for pilot demonstration.

### Relevant
Shows stakeholders the envisioned frictionless onboarding experience.

### Time-bound
Complete by end of Day 6.

**Deliverables**:
- `frontend/src/components/federation/pilot-onboarding-wizard.tsx`

---

## Objective 4.5: Test Suite for UI Components

### Specific
Create a test suite that validates all Phase 4 UI components exist and are properly structured.

### Measurable
- Test script verifies existence of all 4 component files
- Validates component exports
- Checks for TypeScript compilation errors
- Minimum 8 test assertions

### Achievable
Shell-based tests following Phase 1-3 patterns.

### Relevant
Ensures UI components are production-ready.

### Time-bound
Complete by end of Day 7.

**Deliverables**:
- `scripts/tests/test-phase4-ui.sh`

---

## Success Criteria Summary

| Metric | Target | Status |
|--------|--------|--------|
| Component files created | 4 | ✓ |
| No TypeScript errors | 0 errors | ✓ |
| Test assertions | ≥8 | Pending |
| All tests pass | 100% | Pending |
| GitHub commit | 1 commit | Pending |

---

## Component Architecture

```
frontend/src/components/
├── ui/
│   ├── instance-banner.tsx     # Instance awareness
│   ├── demo-mode-badge.tsx     # Pilot user context
│   └── flags.tsx               # (existing) Flag components
│
└── federation/
    ├── partner-trust-toggle.tsx    # Trust management UI
    └── pilot-onboarding-wizard.tsx # Onboarding flow demo
```

---

## Integration Points

1. **Instance Banner**: Integrate into `page-layout.tsx` or main app layout
2. **Demo Mode Badge**: Conditionally render in layout based on session
3. **Partner Trust Toggle**: Federation settings page (future)
4. **Onboarding Wizard**: Modal/dialog trigger from admin interface (future)

---

## Notes

- All components designed for pilot mode demonstration
- Production features (actual API integration) deferred to post-pilot
- Components are self-contained and can be used in isolation
- Follow existing design patterns from IdP selector component
