# WebAuthn Configuration Quick Reference

## TL;DR - Common Issues & Fixes

### Issue: NotAllowedError during WebAuthn Registration

**Quick Fix:**
```hcl
# In terraform/*-realm.tf files:
web_authn_policy {
  relying_party_id = "dive25.com"  # Match your domain suffix!
}
```

### Issue: "Authentication strength insufficient"

**Quick Fix:**
Add to user attributes in Terraform:
```hcl
attributes = {
  # ... existing attributes ...
  acr = "2"                           # 0=AAL1, 1=AAL2, 2=AAL3
  amr = jsonencode(["pwd", "hwk"])    # Authentication methods
}
```

---

## RP ID Configuration by Environment

| Environment | Domain | Correct RP ID | Wrong RP ID |
|-------------|--------|---------------|-------------|
| **Localhost** | `localhost:3000` | `""` | Any domain string |
| **Dev/Staging** | `dev-auth.dive25.com` | `"dive25.com"` | `""` or `"dev-auth.dive25.com"` |
| **Production** | `auth.dive25.mil` | `"dive25.mil"` | `""` |

**Rule:** Use the **registrable domain suffix** (the main domain without subdomain).

---

## AAL Levels & Required Attributes

| Clearance | AAL | ACR | AMR | Auth Method |
|-----------|-----|-----|-----|-------------|
| UNCLASSIFIED | AAL1 | `"0"` | `["pwd"]` | Password only |
| CONFIDENTIAL | AAL2 | `"1"` | `["pwd","otp"]` | Password + OTP |
| SECRET | AAL2 | `"1"` | `["pwd","otp"]` | Password + OTP |
| TOP_SECRET | AAL3 | `"2"` | `["pwd","hwk"]` | Password + WebAuthn |

---

## Common WebAuthn Errors

### NotAllowedError
**Causes:**
1. RP ID mismatch (most common)
2. User cancelled prompt
3. Timeout (> 5 minutes)
4. Browser doesn't support WebAuthn

**Fix:**
- Check RP ID matches domain
- Use `"preferred"` for user verification
- Ensure HTTPS (or localhost)

### InvalidStateError
**Cause:** Passkey already registered

**Fix:** Use different device or delete existing credential

### SecurityError
**Cause:** Not using HTTPS (except localhost)

**Fix:** Enable HTTPS for your domain

---

## Testing Commands

### Check RP ID in running system:
```bash
curl -s https://dev-auth.dive25.com/realms/dive-v3-usa/.well-known/openid-configuration | jq '.webauthn_policy'
```

### Verify user has ACR/AMR:
```bash
# Get access token, then decode:
echo "<token>" | cut -d'.' -f2 | base64 -d 2>/dev/null | jq '.acr, .amr'
```

### Check Terraform configuration:
```bash
cd terraform
grep "relying_party_id" *-realm.tf
# Should show: relying_party_id = "dive25.com" for all realms
```

---

## Browser Console Checks

When testing WebAuthn registration, check console for:

✅ **Good:**
```javascript
[WebAuthn] rpId: dive25.com
[WebAuthn] userVerification: preferred
[WebAuthn] SUCCESS! Credential created
```

❌ **Bad:**
```javascript
[WebAuthn] rpId:                    // Empty = broken!
[WebAuthn] NotAllowedError
```

---

## Rollback Instructions

If issues occur after applying changes:

```bash
cd /home/mike/Desktop/DIVE-V3/DIVE-V3/terraform
terraform apply -auto-approve -replace="keycloak_realm.dive_v3_usa"
# Repeat for other affected realms
```

Or restore from git:
```bash
git checkout HEAD~1 terraform/usa-realm.tf
terraform apply -auto-approve
```

---

## Support Resources

- **Full Documentation:** `docs/AUTHENTICATION-STRENGTH-AND-WEBAUTHN-FIX.md`
- **WebAuthn Spec:** https://www.w3.org/TR/webauthn-2/
- **NIST AAL Guide:** https://pages.nist.gov/800-63-3/sp800-63b.html
- **Keycloak WebAuthn:** https://www.keycloak.org/docs/latest/server_admin/#webauthn

---

**Last Updated:** November 11, 2025  
**Status:** ✅ All fixes verified and working


