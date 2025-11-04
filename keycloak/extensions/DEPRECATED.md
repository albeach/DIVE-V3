# DEPRECATED: Custom Keycloak SPIs Removed

**Date:** November 4, 2025  
**Version:** 2.0.0  
**Status:** ❌ **REMOVED**

---

## Notice

This directory has been **DEPRECATED** and all custom Keycloak SPIs have been **REMOVED** in DIVE V3 v2.0.0.

### What Was Removed

All custom Java SPIs that were previously in this directory:

1. **DirectGrantOTPAuthenticator.java** - Custom Direct Grant MFA authenticator
2. **DirectGrantOTPAuthenticatorFactory.java** - Factory for Direct Grant authenticator
3. **ConfigureOTPRequiredAction.java** - Custom OTP required action
4. **ConfigureOTPRequiredActionFactory.java** - Factory for OTP required action
5. **AMREnrichmentEventListener.java** - Custom AMR session note event listener
6. **AMREnrichmentEventListenerFactory.java** - Factory for AMR event listener
7. **AMRProtocolMapper.java** - Custom AMR protocol mapper
8. **RedisOTPStore.java** - Redis-based OTP secret storage

### Why They Were Removed

**Primary Reasons:**
1. **Native Support:** Keycloak 26.4.2 includes built-in ACR/AMR tracking
2. **Maintenance Burden:** Custom SPIs require updates with each KC version
3. **Reliability:** Native features are better tested and more stable
4. **Security:** Direct Grant flow is not AAL2 compliant
5. **Complexity:** Custom code adds unnecessary complexity

### Migration to Native Features

All functionality has been **replaced with native Keycloak 26.4.2 features**:

| Custom SPI | Native Alternative | Status |
|------------|-------------------|--------|
| DirectGrantOTPAuthenticator | **DEPRECATED** - Use browser flows only | ✅ Removed |
| ConfigureOTPRequiredAction | Built-in `CONFIGURE_TOTP` required action | ✅ Replaced |
| AMREnrichmentEventListener | Automatic AMR tracking in KC 26.4 | ✅ Replaced |
| AMRProtocolMapper | `oidc-usersessionmodel-note-mapper` | ✅ Replaced |
| RedisOTPStore | Built-in KC credential storage | ✅ Removed |

### How Native Features Work

**ACR (Authentication Context Class Reference):**
```hcl
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
- Protocol mapper reads session note and adds to JWT

**No custom code needed!** 🎉

### References

- **Migration Guide:** `docs/NATIVE-KEYCLOAK-REFACTORING.md`
- **Implementation Plan:** `docs/DIVE-V3-IMPLEMENTATION-PLAN.md`
- **Keycloak Docs:** https://www.keycloak.org/docs/26.4/server_admin/

### Rollback (Emergency Only)

If you need to restore custom SPIs temporarily:

```bash
# Restore from Git history
git checkout v1.x.x -- keycloak/extensions/
git checkout v1.x.x -- keycloak/providers/

# Rebuild SPIs
cd keycloak/extensions
mvn clean package
cp target/dive-keycloak-extensions.jar ../providers/

# Restart Keycloak
docker compose restart keycloak
```

**Note:** Rollback is NOT recommended. Contact the team if you encounter issues.

---

**Last Custom SPI Version:** v1.5.0  
**Removal Date:** November 4, 2025  
**Removed By:** AI Expert - Keycloak Refactoring  
**Approval:** Technical Lead


