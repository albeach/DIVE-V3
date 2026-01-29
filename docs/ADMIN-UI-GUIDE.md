# DIVE V3 Admin UI - Complete Guide

**Version:** 2.0.0  
**Last Updated:** 2026-01-29  
**Status:** Production Ready

---

## Table of Contents

1. [Overview](#overview)
2. [Getting Started](#getting-started)
3. [Navigation System](#navigation-system)
4. [Component Library](#component-library)
5. [Educational Features](#educational-features)
6. [Smart Automation](#smart-automation)
7. [Bulk Operations](#bulk-operations)
8. [Advanced Analytics](#advanced-analytics)
9. [Keyboard Shortcuts](#keyboard-shortcuts)
10. [Troubleshooting](#troubleshooting)

---

## Overview

The DIVE V3 Admin UI is a modern, intelligent administration interface designed for NATO coalition partners. Built with Next.js 15, TypeScript, and Tailwind CSS, it provides comprehensive tools for managing identity providers, federation, policies, and security.

### Key Features

- **Unified Navigation**: Single source of truth for all 25 admin pages
- **Smart Suggestions**: AI-powered recommendations and auto-detection
- **Bulk Operations**: Dry-run mode and rollback capabilities
- **Advanced Analytics**: Interactive drill-down charts with custom reporting
- **Educational System**: 35-term glossary, contextual help, and guided tours
- **Command Palette**: Cmd+K instant access to any admin action
- **Dark Mode**: Full support with automatic detection
- **Responsive Design**: Optimized for mobile, tablet, and desktop

---

## Getting Started

### First-Time Admin Setup

1. **Log in** to your DIVE V3 instance with admin credentials
2. **Start the onboarding tour** (auto-launches on first visit)
3. **Complete the setup checklist**:
   - Configure First Identity Provider (15 min)
   - Setup Protocol Mappers (10 min)
   - Review OPA Authorization Policies (20 min)
   - Configure Certificate Expiry Alerts (5 min)
   - Review Audit Log Configuration (10 min)

### Hub vs Spoke Differences

The admin UI automatically detects your instance type and shows relevant features:

**Hub Admins See:**
- Federation Management (Spoke Registry, Policy Distribution, OPAL Status)
- Spoke Approval Workflows
- Centralized Policy Management

**Spoke Admins See:**
- Spoke Status & Hub Connectivity
- Circuit Breaker & Failover Configuration
- Audit Queue Management

---

## Navigation System

### Primary Navigation

Access admin pages via:
- **Sidebar Menu**: Persistent left navigation with categories
- **Command Palette**: Press `Cmd+K` (Mac) or `Ctrl+K` (Windows)
- **Mobile Drawer**: Three-line menu icon on mobile devices

### Navigation Categories

1. **Overview**: Dashboard, System Metrics
2. **Identity & Access**: IdPs, Users, Clearance Management, Service Providers
3. **Federation**: Spoke Management, Policy Distribution, OPAL Status (Hub only)
4. **Policy & Authorization**: OPA Policies, Guardrails
5. **Security & Certificates**: PKI Management, Certificate Rotation
6. **Audit & Compliance**: Logs, Compliance Tests, Drift Detection
7. **System & Configuration**: Settings, Integration Guides, Debug Tools

### Command Palette

Press `Cmd+K` to open the command palette:

- **Fuzzy Search**: Type partial names to find pages
- **Recent History**: See your last 10 visited pages
- **Quick Actions**: Common tasks appear at the top
- **Category Filtering**: Filter by Overview, Identity, Federation, etc.
- **Keyboard Navigation**: Arrow keys to navigate, Enter to select, Escape to close

---

## Component Library

### Unified Card

Replace old card types with the new unified component:

```tsx
import { UnifiedCard, CardHeader, CardStats } from '@/components/ui/unified-card';

// Glassmorphism card
<UnifiedCard variant="glass" hover>
  <CardHeader
    title="System Health"
    icon={<CheckCircle />}
  />
  <CardStats value="99.9%" label="Uptime" />
</UnifiedCard>

// Gradient card
<UnifiedCard variant="gradient" gradientFrom="from-indigo-500" gradientTo="to-purple-600">
  <h3>Feature Title</h3>
</UnifiedCard>
```

### Loading States

Standardized loading components:

```tsx
import { PageLoader, Skeleton, ButtonLoader } from '@/components/ui/loading-states';

// Full page loading
{isLoading && <PageLoader message="Loading dashboard..." />}

// Skeleton placeholders
<Skeleton variant="rect" height={200} count={3} />

// Button loading
<button disabled={loading}>
  <ButtonLoader loading={loading}>Save Changes</ButtonLoader>
</button>
```

### Badges

Unified badge system with specialized types:

```tsx
import { Badge, StatusBadge, ClearanceBadge, CountBadge } from '@/components/ui/badge';

<StatusBadge status="active" showDot />
<ClearanceBadge clearance="TOP_SECRET" />
<CountBadge count={42} max={99} pulse />
<Badge variant="success" pill>Active</Badge>
```

---

## Educational Features

### Admin Glossary

Access the glossary by:
- Pressing `Cmd+Shift+G`
- Clicking the glossary button in the admin header
- Hovering over underlined terms in help text

**35 Terms Available:**
- Authorization (7): ABAC, PEP, PDP, OPA, Rego, Guardrails, Bilateral Effective-Min
- Federation (8): Federation, Hub, Spoke, OPAL, Policy Distribution, Circuit Breaker, etc.
- Identity (6): IdP, OIDC, SAML, Protocol Mapper, Attribute Enrichment, Keycloak
- Security & Compliance (7): ACP-240, STANAG, COI, Clearance, Releasability, Classification, CRL
- Infrastructure (4): KAS, ZTDF, Certificate Rotation, Bundle Signing
- Monitoring (3): SLA, Audit Queue, Drift Detection

### Contextual Help

Look for the `?` icon next to complex fields:

- **Inline Help**: Hover or click for tooltips with examples
- **Help Panels**: Slide-out panels with comprehensive documentation
- **Quick Tips**: Rotating tips carousel on form pages

### Onboarding Tour

The interactive 8-step tour covers:
1. Welcome to Admin Dashboard
2. Quick Navigation (Cmd+K demo)
3. Federation Management (Hub) / Hub Connectivity (Spoke)
4. Identity Provider Configuration
5. OPA Policy Management
6. Audit & Compliance
7. PKI & Certificate Management
8. Next Steps & Resources

**Resume or Restart:** Access from Admin Dashboard settings

---

## Smart Automation

### OIDC Discovery Auto-Detection

When adding an OIDC IdP, enter the domain and DIVE V3 will:
1. Detect well-known providers (Google, Microsoft, Okta, Auth0, Keycloak)
2. Auto-fetch `.well-known/openid-configuration`
3. Pre-fill issuer, endpoints, and supported scopes
4. Provide "Apply Automatically" button

### Protocol Mapper Suggestions

Based on IdP type and provider, get recommendations for:
- **Required Mappers**: uniqueID, clearance, countryOfAffiliation
- **Optional Mappers**: acpCOI, email, groups
- **Provider-Specific**: Azure AD email, Keycloak groups, etc.

Each suggestion includes:
- Description and purpose
- Claim name and user attribute mapping
- Example values
- Required vs optional badge

### Policy Pack Recommendations

Based on tenant context, receive tailored policy packs:
- **Base ABAC**: Required for all instances (100% confidence)
- **Classified Operations**: For SECRET/TOP_SECRET tenants (95% confidence)
- **Military Operations**: For military organizations (90% confidence)
- **Coalition Sharing**: For multi-national environments (85% confidence)
- **Industry Controls**: For contractor partners (80% confidence)
- **FVEY/NATO Specific**: For alliance members (90-95% confidence)

### Certificate Expiry Warnings

Automatic monitoring with:
- **Critical**: ≤7 days (red alert)
- **Warning**: ≤30 days (amber alert)
- **Info**: ≤90 days (blue notification)
- **Auto-Renewable**: Indicates if automatic renewal is configured
- **Quick Actions**: One-click renewal links

### Authorization Anomaly Detection

Real-time detection of:
- Unusual denial rate spikes (>20% increase)
- New country seeing high denials
- Clearance-level violation patterns
- Policy drift from approved baselines

Each alert includes:
- Severity level (high/medium/low)
- Affected user count
- Recommended remediation action
- "Investigate" button for drill-down

---

## Bulk Operations

### Dry-Run Mode

Before executing destructive operations:
1. Select multiple items (checkboxes)
2. Choose bulk action (Delete, Disable, etc.)
3. Click "Preview First (Dry-Run)"
4. Review impact assessment:
   - High/Medium/Low impact indicators
   - Warnings for critical dependencies
   - List of changes that would occur
5. Proceed or Cancel

**Best Practice:** Always run dry-run for:
- Bulk deletions
- Bulk role changes
- Bulk policy updates

### Rollback Capability

Undo last operations:
- Last 10 operations tracked
- Click "Rollback (N)" button in toolbar
- Confirms operation ID and timestamp
- Restores previous state

**Supports Rollback:**
- Delete operations
- Disable/Enable toggles
- Role assignments

**Does NOT Support Rollback:**
- Password resets (emails already sent)
- Export operations (no state change)

### Progress Tracking

Real-time feedback during bulk operations:
- Progress bar (0-100%)
- Success/Failed counts
- Error messages for failed items
- Auto-clear selection on success

---

## Advanced Analytics

### Interactive Drill-Down Charts

Navigate to **Admin → Analytics → Advanced** for:

**Drill-Down Flow:**
1. Click any chart element (bar, line point, pie slice)
2. Filter is applied automatically
3. Breadcrumb trail shows active filters
4. Click filter badge with `X` to remove
5. "Clear All" to reset

**Chart Types:**
- **Bar**: Compare discrete values
- **Line**: Show trends over time
- **Area**: Emphasize cumulative trends
- **Pie**: Show proportional breakdown

**Metrics Available:**
- Authorization Decisions
- Resource Access
- User Activity
- Access Denials
- By Clearance Level
- By Country
- By Community of Interest

### Time Range Picker

Select data range:
- Last 24 Hours
- Last 7 Days
- Last 30 Days
- Last 90 Days
- Custom Range (pick start and end dates)

### Custom Report Builder

Create tailored reports:
1. Click "Report Builder" button
2. Select metrics to include (multi-select)
3. Choose schedule frequency:
   - One-time report
   - Daily (sent every morning)
   - Weekly (sent every Monday)
   - Monthly (sent first day of month)
4. Click "Generate Report"

### Export Options

Export data in multiple formats:
- **CSV**: For Excel/spreadsheet analysis
- **JSON**: For programmatic processing
- **PDF**: For sharing and archival

---

## Keyboard Shortcuts

### Global Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+K` / `Ctrl+K` | Open command palette |
| `/` | Quick search |
| `Escape` | Close modal/drawer |
| `Cmd+Shift+G` | Open glossary |
| `?` | Show keyboard shortcuts modal (coming soon) |

### Command Palette

| Shortcut | Action |
|----------|--------|
| `↑` / `↓` | Navigate results |
| `Enter` | Select/navigate to page |
| `Escape` | Close palette |
| `Tab` | Switch between sections |

### Table Navigation

| Shortcut | Action |
|----------|--------|
| `Space` | Select/deselect row |
| `Shift+Space` | Select range |
| `Cmd+A` / `Ctrl+A` | Select all |
| `Escape` | Clear selection |

---

## Troubleshooting

### Common Issues

#### Command Palette Not Opening
- **Issue**: Cmd+K does nothing
- **Solution**: Ensure no other application is capturing this shortcut (Spotlight on Mac)
- **Alternative**: Press `/` key instead

#### Smart Suggestions Not Appearing
- **Issue**: OIDC discovery not auto-detecting
- **Solution**:
  - Ensure domain is accessible from browser
  - Check if `.well-known/openid-configuration` exists
  - Try manual entry of discovery URL

#### Bulk Operations Not Showing Rollback
- **Issue**: Rollback button missing
- **Solution**:
  - Only certain operations support rollback
  - Password resets and exports are not reversible
  - Rollback history clears after 10 operations

#### Analytics Not Loading
- **Issue**: Charts show "No data available"
- **Solution**:
  - Check date range (may be no data in selected period)
  - Verify API connection in browser console
  - Refresh page to retry data fetch

### Browser Compatibility

**Supported Browsers:**
- Chrome/Edge 100+
- Firefox 100+
- Safari 15+

**Known Issues:**
- Safari < 15: Command palette backdrop blur may not work
- Firefox < 100: Some animations may be choppy

### Performance Tips

- **Large Tables**: Use pagination and filters to reduce rendering
- **Analytics**: Limit date range for faster loading
- **Bulk Operations**: Process < 100 items at a time for best performance

---

## Additional Resources

- **Integration Guide**: `/integration/federation-vs-object`
- **Policy Documentation**: `/policies` (policy editor with examples)
- **Compliance Dashboard**: `/admin/compliance`
- **Debug Tools**: `/admin/debug` (super admins only, dev mode)

---

## Getting Help

### In-App Support

1. **Glossary**: Press `Cmd+Shift+G` for term definitions
2. **Contextual Help**: Click `?` icons for field-specific guidance
3. **Quick Tips**: Watch rotating tips on complex forms
4. **Onboarding Tour**: Re-run from Admin Dashboard → Settings

### External Resources

- **DIVE V3 Documentation**: [Internal Wiki Link]
- **NATO ACP-240 Standard**: [NATO STANAG Reference]
- **OPA Policy Language**: https://www.openpolicyagent.org/docs/latest/policy-language/
- **OIDC Specification**: https://openid.net/specs/openid-connect-core-1_0.html

---

**End of Guide**

For technical issues, contact your system administrator or DIVE V3 support team.
