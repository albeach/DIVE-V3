# Keycloak Theme Customization Guide

## Overview

This document lists all Keycloak login theme templates and their customization status for DIVE V3. The theme uses a glassmorphism design with split layout, providing consistent UI/UX across all authentication flows.

## Theme Architecture

```
keycloak/themes/
├── dive-v3/                    # Base theme (parent=base)
│   └── login/
│       ├── template.ftl        # Master layout template
│       ├── *.ftl               # Individual page templates
│       ├── resources/
│       │   ├── css/dive-v3.css # All styles
│       │   └── img/            # Background, logo, favicon
│       └── messages/
│           ├── messages_en.properties
│           └── messages_fr.properties
├── dive-v3-usa/                # USA variant (parent=dive-v3)
├── dive-v3-fra/                # France variant (parent=dive-v3)
├── dive-v3-gbr/                # UK variant (parent=dive-v3)
├── dive-v3-deu/                # Germany variant (parent=dive-v3)
└── ...                         # Other country variants
```

## Template Status

### ✅ Customized Templates (DIVE V3 Styling Applied)

| Template | Purpose | Status |
|----------|---------|--------|
| `template.ftl` | Master layout with split design | ✅ Complete |
| `login.ftl` | Main login form | ✅ Complete |
| `login-otp.ftl` | OTP verification | ✅ Complete |
| `login-config-totp.ftl` | OTP enrollment wizard | ✅ Complete |
| `login-reset-credentials.ftl` | Password reset | ✅ Complete |
| `error.ftl` | Error page with categorized messages | ✅ Complete |
| `webauthn-authenticate.ftl` | WebAuthn login | ✅ Complete |
| `webauthn-register.ftl` | WebAuthn registration | ✅ Complete |
| `webauthn-error.ftl` | WebAuthn errors | ✅ Complete |
| `login-page-expired.ftl` | Session expired page | ✅ NEW |
| `logout-confirm.ftl` | Logout confirmation | ✅ NEW |
| `info.ftl` | Generic info/success page | ✅ NEW |
| `frontchannel-logout.ftl` | Front-channel logout | ✅ NEW |
| `select-authenticator.ftl` | MFA method selection | ✅ NEW |

### ⚠️ Templates Using Base Theme (May Need Customization)

These templates inherit from the base Keycloak theme and may not match DIVE V3 styling:

| Template | Purpose | Priority | Notes |
|----------|---------|----------|-------|
| `login-update-password.ftl` | Force password change | HIGH | Users may see on first login |
| `login-update-profile.ftl` | Update profile info | MEDIUM | Federation may trigger |
| `login-verify-email.ftl` | Email verification | MEDIUM | Registration flow |
| `login-reset-password.ftl` | Password reset form | MEDIUM | Self-service recovery |
| `login-idp-link-confirm.ftl` | IdP account linking | HIGH | Federation flow |
| `login-idp-link-email.ftl` | IdP email verification | MEDIUM | Federation flow |
| `login-recovery-authn-code-input.ftl` | Recovery code input | LOW | Backup codes |
| `login-recovery-authn-code-config.ftl` | Recovery code setup | LOW | Backup codes |
| `delete-credential.ftl` | Delete MFA credential | LOW | Account management |
| `delete-account-confirm.ftl` | Account deletion | LOW | Self-service |
| `terms.ftl` | Terms of service | LOW | If enabled |
| `register.ftl` | Registration form | LOW | If self-registration enabled |
| `login-oauth-grant.ftl` | OAuth consent screen | LOW | If consent required |
| `login-x509-info.ftl` | X.509 certificate info | LOW | If CAC/PIV enabled |

### ❌ Templates Not Needed

These templates are either not used in DIVE V3 or are handled by other systems:

| Template | Reason |
|----------|--------|
| `cli_splash.ftl` | CLI authentication only |
| `code.ftl` | Device code flow |
| `saml-post-form.ftl` | SAML auto-submit |
| `passkeys.ftl` | Covered by webauthn templates |
| `login-passkeys-conditional-authenticate.ftl` | Advanced passkey flow |
| `select-organization.ftl` | Multi-org feature |
| `idp-review-user-profile.ftl` | IdP profile review |
| `link-idp-action.ftl` | IdP linking action |

## CSS Classes Reference

All DIVE V3 templates use these CSS class prefixes:

```css
.dive-*           /* All DIVE V3 components */
.dive-body        /* Body element */
.dive-container   /* Main container */
.dive-card        /* Form card */
.dive-button      /* Buttons */
.dive-button-primary
.dive-button-secondary
.dive-alert       /* Alert messages */
.dive-alert-success
.dive-alert-warning
.dive-alert-error
.dive-alert-info
```

## Adding New Templates

To customize a new template:

1. **Copy base template** from Keycloak JAR:
   ```bash
   unzip -p /tmp/keycloak-themes.jar theme/base/login/{template}.ftl > keycloak/themes/dive-v3/login/{template}.ftl
   ```

2. **Update import** to use DIVE V3 template:
   ```ftl
   <#import "template.ftl" as layout>
   <@layout.registrationLayout; section>
   ```

3. **Apply DIVE V3 styling** using existing CSS classes

4. **Add message keys** to `messages_en.properties`

5. **Restart Keycloak** to apply changes (themes are volume-mounted)

## Deployment

### Local Instances (USA, FRA, GBR)

Themes are volume-mounted from `keycloak/themes/` to `/opt/keycloak/themes/`. Changes are applied after Keycloak restart:

```bash
docker restart dive-v3-keycloak dive-v3-keycloak-fra dive-v3-keycloak-gbr
```

### Remote Instances (DEU)

For remote instances, themes must be copied to the server:

```bash
# SSH to DEU server
scp -r keycloak/themes/* user@deu-server:/path/to/keycloak/themes/
docker restart keycloak-deu
```

Or update the Docker image to include themes.

## Testing

After deploying theme changes, test these flows:

1. **Login** - Main login page
2. **MFA Enrollment** - OTP setup wizard
3. **MFA Verification** - OTP code entry
4. **Federation** - Cross-border login
5. **Page Expired** - Let session timeout
6. **Logout** - Sign out flow
7. **Error Pages** - Invalid credentials, access denied

## Known Issues

1. **DEU Theme Not Updated** - Remote instance needs manual deployment
2. **Browser Caching** - Hard refresh (Ctrl+Shift+R) may be needed after updates
3. **CSS Variables** - Country variants override `--dive-accent` color

## Files Reference

| File | Purpose |
|------|---------|
| `keycloak/themes/dive-v3/login/template.ftl` | Master layout |
| `keycloak/themes/dive-v3/login/resources/css/dive-v3.css` | All styles |
| `keycloak/themes/dive-v3/login/messages/messages_en.properties` | English text |
| `keycloak/themes/dive-v3-{country}/login/theme.properties` | Country overrides |

---

**Document Version**: 1.0  
**Last Updated**: 2025-11-29








