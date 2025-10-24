# IdP Management User Guide

**DIVE V3 - Coalition-Friendly ICAM Pilot**  
**Version**: 2025 Revamp (v2.0)  
**Date**: October 23, 2025

---

## Table of Contents

1. [Introduction](#introduction)
2. [Getting Started](#getting-started)
3. [Navigating the IdP Management Interface](#navigating-the-idp-management-interface)
4. [Adding a New IdP](#adding-a-new-idp)
5. [Configuring MFA](#configuring-mfa)
6. [Managing Active Sessions](#managing-active-sessions)
7. [Customizing Login Page Theme](#customizing-login-page-theme)
8. [Multi-Language Support](#multi-language-support)
9. [Using the Command Palette](#using-the-command-palette)
10. [Analytics and Reporting](#analytics-and-reporting)
11. [Troubleshooting](#troubleshooting)

---

## 1. Introduction

The DIVE V3 IdP Management Interface provides comprehensive tools for managing federated identity providers across coalition partners (USA, France, Canada, Industry). This 2025 revamp introduces:

- **Modern UI**: Glassmorphism design, smooth animations, intuitive interactions
- **MFA Management**: Configure multi-factor authentication per IdP
- **Session Control**: View and revoke active sessions in real-time
- **Custom Theming**: Brand login pages with country-specific colors and logos
- **Multi-Language**: Support for English and French interfaces
- **Cross-Navigation**: Seamless transitions between management, analytics, and configuration

---

## 2. Getting Started

### Prerequisites
- **Role**: super_admin (assigned by DIVE V3 administrators)
- **Browser**: Chrome, Firefox, or Safari (latest 2 versions)
- **Access**: https://dive-v3.mil/admin or http://localhost:3000/admin (dev)

### First-Time Login
1. Navigate to DIVE V3 login page
2. Select your Identity Provider (e.g., USA DoD Login)
3. Enter credentials
4. Complete MFA if required
5. After successful login, click **Admin** in navigation menu

---

## 3. Navigating the IdP Management Interface

### Dashboard Overview

**Top Navigation**:
- **Home**: Return to resources page
- **Admin**: Access admin features
- **Profile**: View your user profile

**Admin Pages**:
- **IdP Management** (`/admin/idp`): Manage identity providers
- **IdP Governance** (`/admin/analytics`): View analytics and compliance
- **Super Admin Console** (`/admin/dashboard`): System-wide administration

### IdP Management Page Layout

```
┌─────────────────────────────────────────────────────────┐
│ Breadcrumbs: Home > Admin > IdP Management             │
├─────────────────────────────────────────────────────────┤
│ [Title] Identity Provider Management    [+ Add New IdP]│
├─────────────────────────────────────────────────────────┤
│ Stats Bar: [Total: 4] [Online: 3] [Offline: 1] [Warn: 0]│
├─────────────────────────────────────────────────────────┤
│ [Search] [Filter: OIDC] [Filter: SAML]  [Grid/List View]│
├──────────────────────────────┬──────────────────────────┤
│ IdP Cards (Grid Layout)      │ Sidebar                  │
│ - USA DoD Login (OIDC) ✅    │ - Recently Viewed        │
│ - France MoD (SAML) ✅       │ - Quick Links            │
│ - Canada DND (OIDC) ✅       │                          │
│ - Industry Portal (OIDC) ⭕  │                          │
└──────────────────────────────┴──────────────────────────┘
```

### IdP Card Features
- **Status Indicator**: Green pulse (online) | Gray (offline)
- **Metrics**: Uptime %, Success Rate, Last Tested
- **Risk Tier Badge**: Gold | Silver | Bronze | Fail
- **Quick Actions**: Test, View, Analytics, Edit, Delete
- **Click to Select**: Click card to select for batch operations

### Keyboard Shortcuts
- **Cmd+K** (Mac) or **Ctrl+K** (Windows): Open command palette
- **Escape**: Close modals
- **Tab**: Navigate form fields
- **Arrow Keys**: Navigate command palette results
- **Enter**: Select command palette item

---

## 4. Adding a New IdP

### Using the Wizard

1. Click **+ Add New IdP** button
2. Complete 8-step wizard:
   - **Step 1**: Select protocol (OIDC or SAML)
   - **Step 2**: Enter basic info (alias, display name, description)
   - **Step 3**: Configure protocol (endpoints, certificates, client credentials)
   - **Step 4**: Upload documentation (optional)
   - **Step 5**: Map attributes (uniqueID, clearance, country, COI)
   - **Step 6**: Review configuration
   - **Step 7**: Submit for validation
   - **Step 8**: View results (automated security validation + risk scoring)

3. **Auto-Approval**: Gold tier IdPs (85-100 points) are automatically approved
4. **Manual Review**: Silver/Bronze tier IdPs require admin approval

### Automated Validation
The wizard automatically validates:
- ✅ TLS 1.2+ enforcement
- ✅ Strong cryptography (RSA 2048+, SHA-256+)
- ✅ SAML metadata integrity
- ✅ OIDC discovery endpoint
- ✅ MFA detection
- ✅ Attribute availability (uniqueID, clearance, country)

---

## 5. Configuring MFA

### Accessing MFA Settings
1. Click **View Details** on an IdP card
2. Navigate to **MFA Tab**
3. Configure MFA options

### MFA Options

#### Global MFA (All Users)
- Toggle **"Require MFA for all users"**
- All users must configure TOTP/HOTP during first login
- Recommended for HIGH SIDE (SECRET/TOP SECRET) IdPs

#### Conditional MFA (Clearance-Based)
- Toggle **"Conditional MFA"**
- Select clearance levels: CONFIDENTIAL, SECRET, TOP_SECRET
- Only users with selected clearances require MFA
- Recommended for MIXED classification environments

### OTP Settings
- **Algorithm**: HmacSHA256 (recommended) | HmacSHA1 | HmacSHA512
- **Code Length**: 6 digits (standard) | 8 digits (high security)
- **Time Period**: 30 seconds (recommended) | 10-60 seconds

### Live Preview
The MFA configuration panel shows a live preview of the rule:
> "Users with SECRET clearance will be prompted for MFA during login"

### Testing MFA
1. Click **Test MFA Flow** button
2. Opens Keycloak login in modal iframe
3. Verify MFA prompt appears for selected clearances
4. Close modal after testing

### Saving Changes
1. Make changes to MFA settings
2. Click **Save Changes** button
3. Confirm update was successful
4. Changes take effect immediately for new logins

---

## 6. Managing Active Sessions

### Viewing Sessions
1. Click **View Details** on an IdP card
2. Navigate to **Sessions Tab**
3. View real-time active sessions table

### Session Table Columns
- **Username**: User identifier
- **IP Address**: Client IP address
- **Login Time**: When session started
- **Last Activity**: Most recent action
- **Client**: Application (e.g., DIVE V3 Frontend, KAS)
- **Actions**: Revoke button

### Searching Sessions
- Enter username or IP in search box
- Results filter in real-time
- Case-insensitive search

### Sorting Sessions
- Click column header to sort
- Click again to reverse direction
- Default: Sort by Last Activity (newest first)

### Revoking Sessions

#### Revoke Single Session
1. Find session in table
2. Click **Revoke** button (X icon)
3. Confirm action
4. User is immediately logged out

#### Revoke All User Sessions
1. Search for username
2. Check all sessions for that user
3. Click **Revoke Selected** in toolbar
4. Confirm bulk action
5. All user sessions terminated

### Session Statistics
View session metrics:
- **Total Active**: Current session count
- **Peak Concurrent (24h)**: Highest simultaneous sessions
- **Avg Duration**: Average session length
- **By Client**: Session distribution by application
- **By User**: Sessions per user

### Auto-Refresh
Sessions refresh automatically every 10 seconds to show real-time data.

---

## 7. Customizing Login Page Theme

### Accessing Theme Editor
1. Click **View Details** on an IdP card
2. Navigate to **Theme Tab**
3. Configure theme options

### Theme Editor Tabs

#### Colors Tab
**Country Presets**:
- 🌍 USA: Red, White, Blue
- 🌍 France: Blue, White, Red
- 🌍 Canada: Red, White
- 🌍 Germany: Black, Red, Gold
- 🌍 UK: Blue, White, Red

**Manual Override**:
- Primary Color (main brand color)
- Secondary Color (backgrounds, borders)
- Accent Color (highlights, buttons)
- Background Color (page background)
- Text Color (body text)

#### Background Tab
- **Upload Image**: Drag-and-drop or browse (JPG, PNG, WebP up to 5MB)
- **Blur Intensity**: 0-10 (applies blur to background image)
- **Overlay Opacity**: 0-100% (darkens/lightens image)
- **Stock Library**: 20 pre-made backgrounds per country

#### Logo Tab
- **Upload Logo**: PNG or SVG, 200x200px recommended
- **Position**: Top-Left | Top-Center | Custom coordinates
- **Remove Logo**: Click to remove current logo

#### Layout Tab
- **Form Position**: Left | Center | Right
- **Card Style**: Glassmorphism | Solid | Bordered | Floating
- **Button Style**: Rounded | Square | Pill
- **Input Style**: Outlined | Filled | Underlined

### Preview Theme
1. Click **Preview Theme** button
2. View login page in modal
3. Switch devices: Desktop (1920x1080) | Tablet (768x1024) | Mobile (375x812)
4. Test responsiveness

### Saving Theme
1. Make desired changes
2. Click **Save Theme** button
3. Theme applies to `/login/[idpAlias]` URL
4. Users see custom login page on next visit

### Reverting to Default
1. Click **Revert to Default** button
2. Confirm action
3. Theme resets to Keycloak standard login page

---

## 8. Multi-Language Support

### Changing Language
**Admin Interface**:
- Click language toggle in top-right corner
- 🇺🇸 English ↔ 🇫🇷 Français
- Preference saved to localStorage

**Login Page**:
- Language toggle appears if enabled in theme settings
- Default language set in theme configuration
- Supported languages: English, French (German, Spanish coming soon)

### Translated Elements
- **Admin Pages**: All buttons, labels, messages
- **Login Page**: Form fields, error messages, help text
- **Error Messages**: User-friendly errors in selected language
- **Notifications**: Toast messages, confirmations

### Language Persistence
- Selection stored in `localStorage`
- Persists across page reloads
- Syncs across browser tabs
- Falls back to English if translation missing

---

## 9. Using the Command Palette

### Opening Command Palette
- Press **Cmd+K** (Mac) or **Ctrl+K** (Windows)
- Or click search icon in header

### Search Categories

**Identity Providers**:
- Search by display name or alias
- Example: Type "USA" → Select "USA DoD Login"
- Navigates to IdP detail page

**Quick Actions**:
- "Add New IdP" → Opens wizard
- "Refresh All" → Reloads IdP data
- "Export Configuration" → Downloads JSON

**Navigation**:
- "IdP Management" → `/admin/idp`
- "IdP Governance" → `/admin/analytics`
- "Dashboard" → `/admin/dashboard`

### Keyboard Navigation
- **Arrow Up/Down**: Navigate results
- **Enter**: Select result
- **Escape**: Close palette

### Recent Searches
Command palette remembers last 5 searches for quick access.

---

## 10. Analytics and Reporting

### Accessing Analytics
- Click **View Analytics** in IdP quick actions menu
- Or navigate to **IdP Governance** in admin menu
- URL: `/admin/analytics`

### Drill-Down Navigation
Click on any metric to filter IdP Management view:
- **Gold Tier: 2** → Shows only gold-tier IdPs
- **Silver Tier: 1** → Shows only silver-tier IdPs
- **Bronze Tier: 1** → Shows only bronze-tier IdPs
- **Failed: 0** → Shows rejected IdPs

### Metrics Overview
- **Risk Distribution**: IdP quality tiers (gold/silver/bronze/fail)
- **Compliance Trends**: ACP-240, STANAG 4774, NIST 800-63 compliance over time
- **SLA Performance**: Fast-track (98.5%) vs Standard (95.2%)
- **Authorization Metrics**: 10,000+ decisions tracked
- **Security Posture**: MFA adoption (92%), TLS 1.3 adoption (65%)

### Auto-Refresh
Enable **Auto-Refresh** toggle to update analytics every 5 minutes.

---

## 11. Troubleshooting

### Issue: Cannot see IdPs
**Solution**:
1. Verify you have `super_admin` role
2. Check authentication (sign out and sign in again)
3. Verify backend is running: `curl http://localhost:4000/health`
4. Check browser console for errors

### Issue: MFA changes not taking effect
**Solution**:
1. Verify you clicked **Save Changes**
2. Check Keycloak Admin Console: http://localhost:8081/admin
3. Navigate to Realm → Authentication → Flows
4. Verify OTP required action is enabled
5. Test with a new browser session (incognito mode)

### Issue: Sessions not showing
**Solution**:
1. Verify users are logged in (sessions only show for active logins)
2. Check realm name matches IdP alias (usa-idp → usa-realm)
3. Refresh page (sessions auto-refresh every 10s)
4. Check backend logs: `docker-compose logs backend`

### Issue: Theme not applying
**Solution**:
1. Verify theme is **enabled** (toggle in Theme tab)
2. Check custom login URL: `/login/[idpAlias]`
3. Clear browser cache
4. Verify uploads directory exists: `backend/uploads/idp-themes/`
5. Check file permissions (backend must have write access)

### Issue: Custom login fails
**Solution**:
1. Verify Direct Access Grants enabled in Keycloak:
   - Keycloak Admin Console → Clients → dive-v3-client
   - Settings → Direct Access Grants Enabled: ON
2. Check client secret matches environment variable
3. Verify realm name correct
4. Check rate limiting (max 5 attempts per 15 minutes)
5. Test with Postman/curl first before UI

### Issue: Language toggle not working
**Solution**:
1. Clear localStorage: `localStorage.clear()`
2. Refresh page
3. Verify locale files exist in `frontend/src/locales/`
4. Check browser console for import errors

### Issue: Command palette (Cmd+K) not opening
**Solution**:
1. Ensure you're on an admin page
2. Try Ctrl+K (Windows) instead
3. Check for keyboard shortcut conflicts
4. Refresh page
5. Check browser console for JavaScript errors

### Issue: Performance slow
**Solution**:
1. Reduce auto-refresh frequency
2. Clear React Query cache (refresh page)
3. Paginate large IdP lists (25 per page)
4. Optimize images (< 500KB)
5. Disable animations in browser settings

---

## Getting Help

- **Email**: support@dive-v3.mil
- **Slack**: #dive-v3-support
- **Documentation**: https://docs.dive-v3.mil
- **GitHub**: https://github.com/dive-v3/dive-v3 (file issues)

---

## Keyboard Shortcuts Reference

| Shortcut | Action |
|----------|--------|
| **Cmd+K** (Ctrl+K) | Open command palette |
| **Escape** | Close modal/panel |
| **Tab** | Next field |
| **Shift+Tab** | Previous field |
| **Enter** | Submit form/select item |
| **Arrow Up/Down** | Navigate list |
| **Cmd+Click** | Multi-select (batch operations) |

---

## Tips & Best Practices

✅ **DO**:
- Use command palette (Cmd+K) for fast navigation
- Test IdPs before deploying to production
- Enable MFA for classified clearances (SECRET, TOP SECRET)
- Monitor sessions regularly for suspicious activity
- Use country flag colors for better UX
- Enable auto-refresh for real-time monitoring
- Export configurations for backup

❌ **DON'T**:
- Change MFA settings without testing first
- Revoke all sessions during business hours (disrupts users)
- Upload backgrounds > 5MB (performance impact)
- Enable custom login for external IdPs (security risk)
- Delete IdPs without backup
- Disable rate limiting
- Ignore failed validation warnings

---

**End of User Guide**  
*For API documentation, see [IDP-MANAGEMENT-API.md](./IDP-MANAGEMENT-API.md)*

