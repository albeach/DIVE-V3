# DEPRECATED: Custom Keycloak SPIs - REMOVED & ARCHIVED

**Date:** December 18, 2025
**Version:** 3.0.0
**Status:** ❌ **PERMANENTLY REMOVED**

---

## Version History

| Version | Date | Status | Notes |
|---------|------|--------|-------|
| v1.x.x | Oct 2025 | ✅ Active | Custom SPIs in production |
| v2.0.0 | Nov 4, 2025 | ⚠️ Deprecated | Marked as deprecated, JAR copy removed |
| v2.1.0 | Nov 20, 2025 | ⚠️ Re-enabled | Temporarily re-enabled for AMR enrichment |
| **v3.0.0** | **Dec 18, 2025** | ❌ **REMOVED** | **SSOT consolidation - Native only** |

---

## Notice

All custom Keycloak SPIs have been **PERMANENTLY REMOVED** in DIVE V3 v3.0.0 as part of the
SSOT (Single Source of Truth) consolidation effort.

### What Was Removed

All custom Java SPIs have been **archived** to `keycloak/extensions/archived/`:

1. **DirectGrantOTPAuthenticator.java** - Custom Direct Grant MFA authenticator
2. **DirectGrantOTPAuthenticatorFactory.java** - Factory for Direct Grant authenticator
3. **DirectGrantOTPSimpleAuthenticator.java** - Simplified Direct Grant OTP
4. **DirectGrantOTPSimpleAuthenticatorFactory.java** - Factory for simple variant
5. **ConfigureOTPRequiredAction.java** - Custom OTP required action
6. **ConfigureOTPRequiredActionFactory.java** - Factory for OTP required action
7. **AMREnrichmentEventListener.java** - Custom AMR session note event listener
8. **AMREnrichmentEventListenerFactory.java** - Factory for AMR event listener
9. **AMRProtocolMapper.java** - Custom AMR protocol mapper
10. **RedisOTPStore.java** - Redis-based OTP secret storage

### Why They Were Removed

**Primary Reasons:**
1. **Native Support:** Keycloak 26.4.2 includes built-in ACR/AMR tracking with full RFC 8176 compliance
2. **Maintenance Burden:** Custom SPIs require updates with each Keycloak version upgrade
3. **Reliability:** Native features are better tested and more stable than custom code
4. **Security:** Direct Grant flow is not AAL2 compliant (NIST SP 800-63B)
5. **SSOT:** Terraform is now the single source of truth for all Keycloak configuration

### Migration to Native Features

All functionality has been replaced with native Keycloak 26.4.2 features:

| Custom SPI | Native Alternative | Terraform Resource |
|------------|-------------------|--------------------|
| DirectGrantOTPAuthenticator | **DEPRECATED** - Use browser flows only | N/A |
| ConfigureOTPRequiredAction | Built-in `CONFIGURE_TOTP` required action | ✅ Native |
| AMREnrichmentEventListener | Automatic AMR tracking in KC 26.4 | ✅ Native |
| AMRProtocolMapper | `oidc-amr-mapper` | `keycloak_generic_protocol_mapper` |
| RedisOTPStore | Built-in KC credential storage | ✅ Native |

### How Native Features Work

**ACR (Authentication Context Class Reference):**
```hcl
# terraform/modules/realm-mfa/main.tf
resource "keycloak_authentication_execution_config" "password_acr" {
  config = {
    acr_level = "0"      # AAL1
    reference = "pwd"    # AMR reference
  }
}
```

**AMR (Authentication Methods Reference):**
- Keycloak automatically sets `AUTH_METHODS_REF` session note
- Each authenticator adds its reference value (pwd, otp, hwk)
- Native `oidc-amr-mapper` reads session note and adds to JWT

**Protocol Mappers (Terraform):**
```hcl
# terraform/modules/federated-instance/main.tf
resource "keycloak_generic_protocol_mapper" "amr_mapper" {
  protocol_mapper = "oidc-amr-mapper"
  config = {
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "claim.name"           = "amr"
  }
}
```

**No custom code needed!** 🎉

### Current Architecture (v3.0.0)

```
┌─────────────────────────────────────────────────────────────┐
│                    SSOT: Terraform                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  terraform/modules/federated-instance/main.tf       │   │
│  │  - Realm configuration                              │   │
│  │  - Client configuration                             │   │
│  │  - Protocol mappers (oidc-amr-mapper, oidc-acr)    │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  terraform/modules/realm-mfa/main.tf                │   │
│  │  - Browser authentication flow                      │   │
│  │  - Conditional MFA (AAL1/AAL2/AAL3)                │   │
│  │  - ACR level configuration                         │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│              Keycloak 26.4.2 (Native Only)                  │
│  - NO custom JARs in /opt/keycloak/providers/              │
│  - Built-in ACR/AMR tracking                               │
│  - Native event listeners (jboss-logging)                  │
└─────────────────────────────────────────────────────────────┘
```

### Archived Source Code

Source code is preserved for reference in `keycloak/extensions/archived/`:
- `src/` - Java source files
- `pom.xml` - Maven build configuration
- `target/` - Compiled classes and JAR

### Verification Commands

```bash
# Verify no custom JARs are deployed
docker exec dive-hub-keycloak find /opt/keycloak/providers -name "dive*.jar"
# Expected: No output

# Verify no custom SPIs are loading
docker logs dive-hub-keycloak 2>&1 | grep -i "dive"
# Expected: Only import script messages, no SPI registrations

# Check Terraform manages all configuration
./dive tf plan pilot
# Expected: No changes (clean state)
```

### References

- **SSOT Refactoring:** `docs/KEYCLOAK_REFACTORING_SESSION_PROMPT.md`
- **Implementation Plan:** `docs/DIVE-V3-IMPLEMENTATION-PLAN.md`
- **Keycloak Docs:** https://www.keycloak.org/docs/26.4/server_admin/
- **RFC 8176:** Authentication Methods Reference (AMR)
- **NIST SP 800-63B:** Digital Identity Guidelines - Authentication

---

**Last Custom SPI Version:** v2.1.0
**Removal Date:** December 18, 2025
**Removed By:** SSOT Consolidation - Keycloak Refactoring
**Approval:** Technical Lead
