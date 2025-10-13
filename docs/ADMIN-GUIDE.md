# DIVE V3 Super Administrator Guide

**Version:** Week 3.3  
**Last Updated:** October 13, 2025  
**Status:** Production Ready

---

## 👑 Super Administrator Overview

The DIVE V3 Super Administrator Console provides comprehensive tools for managing identity providers, monitoring system security, and maintaining audit compliance.

### Capabilities
- ✅ Add/remove identity providers (OIDC and SAML)
- ✅ Approve/reject IdP submissions
- ✅ View audit logs (all ACP-240 events)
- ✅ Monitor security violations
- ✅ Export compliance reports
- ✅ View system statistics

---

## 🔑 Getting Started

### Accessing the Admin Console

1. **Login** with super admin credentials:
   - Username: `testuser-us`
   - Password: `Password123!`
   - URL: `http://localhost:3000/login`

2. **Navigate** to admin console:
   - Click "👑 Admin" link in navigation
   - Or go directly to: `http://localhost:3000/admin/dashboard`

3. **Verify** you have super_admin role:
   - JWT token should contain: `"realm_access": { "roles": ["user", "super_admin"] }`
   - If Admin link not visible, role assignment may be missing

### First-Time Setup

1. **Apply Terraform changes:**
   ```bash
   cd terraform
   terraform apply
   ```
   This creates:
   - super_admin realm role
   - Roles protocol mapper (includes roles in JWT)

2. **Restart services** to pick up changes:
   ```bash
   ./scripts/dev-start.sh
   ```

3. **Test access:**
   - Login as testuser-us
   - Admin link should appear in navigation

---

## 🧙 IdP Onboarding Wizard

### Creating a New OIDC IdP

**Navigate to:** `/admin/idp/new`

**Step 1: Select Protocol**
- Choose "OIDC" (🔷 OpenID Connect)

**Step 2: Basic Configuration**
- **Alias:** `germany-idp` (lowercase, alphanumeric, hyphens)
- **Display Name:** `Germany Military IdP`
- **Description:** `Identity provider for German Armed Forces personnel`

**Step 3: OIDC Configuration**
- **Issuer URL:** `https://idp.bundeswehr.mil/oidc`
- **Client ID:** `dive-v3-client`
- **Client Secret:** (paste secret from IdP admin)
- **Authorization URL:** `https://idp.bundeswehr.mil/oauth/authorize`
- **Token URL:** `https://idp.bundeswehr.mil/oauth/token`
- **UserInfo URL:** `https://idp.bundeswehr.mil/userinfo` (optional)
- **JWKS URL:** `https://idp.bundeswehr.mil/certs` (optional)

**Tip:** Find these URLs at: `https://idp.bundeswehr.mil/.well-known/openid-configuration`

**Step 4: Attribute Mapping**

Map IdP claims to DIVE attributes:

| DIVE Attribute | IdP Claim (example) | Required |
|----------------|---------------------|----------|
| uniqueID | `sub` | Yes |
| clearance | `security_level` | Yes |
| countryOfAffiliation | `nationality` | Yes |
| acpCOI | `groups` | Optional |

**Common OIDC claim names:**
- uniqueID: `sub`, `user_id`, `username`
- clearance: `clearance`, `security_level`, `classification`
- country: `country`, `nationality`, `country_code`
- acpCOI: `groups`, `communities`, `coi`

**Step 5: Review & Test**
- Review configuration summary
- Click "Test Connection" (verifies IdP reachable)
- Check for ✅ success message

**Step 6: Submit for Approval**
- Check "I verify this configuration is correct"
- Click "Submit for Approval"
- IdP created in Keycloak (disabled state)
- Awaits super admin approval

### Creating a New SAML IdP

**Navigate to:** `/admin/idp/new`

**Step 1: Select Protocol**
- Choose "SAML" (🔶 SAML 2.0)

**Step 2: Basic Configuration**
- Same as OIDC (alias, display name, description)

**Step 3: SAML Configuration**
- **Entity ID:** `dive-v3-saml-client`
- **SSO Service URL:** `https://idp.example.mil/saml/sso`
- **SLO Service URL:** `https://idp.example.mil/saml/slo` (optional)
- **Certificate:** Paste X.509 certificate (PEM format)
  ```
  -----BEGIN CERTIFICATE-----
  MIIDXTCCAkWgAwIBAgIJAKZ...
  -----END CERTIFICATE-----
  ```
- **Signature Algorithm:** RSA_SHA256 (recommended)
- **Name ID Format:** Email Address or Persistent

**Advanced Settings:**
- ✅ Want Assertions Signed (recommended)
- ⚪ Want AuthN Requests Signed (optional)
- ✅ Validate Signature (recommended)

**Step 4-6:** Same as OIDC

---

## 📋 Managing Identity Providers

### Viewing All IdPs

**Navigate to:** `/admin/idp`

**Features:**
- List all configured IdPs
- Search by alias or display name
- Filter by protocol (OIDC/SAML)
- Status indicators (Active/Inactive)

### Testing an IdP

1. Navigate to IdP list
2. Click "Test" next to IdP
3. System checks:
   - OIDC: Discovery endpoint reachable, JWKS valid
   - SAML: SSO endpoint reachable, certificate valid
4. View result message

### Deleting an IdP

1. Navigate to IdP list
2. Click "Delete" next to IdP
3. Confirm deletion
4. IdP removed from Keycloak and database

**Warning:** Deletion is permanent. Users authenticated via this IdP will lose access.

---

## ✅ Approving IdP Submissions

### Viewing Pending Submissions

**Navigate to:** `/admin/approvals`

**You'll see:**
- List of all pending IdP submissions
- Submitted by (user)
- Submitted at (timestamp)
- Protocol (OIDC/SAML)

### Reviewing a Submission

1. Click "Show Configuration Details"
2. Review:
   - Protocol configuration (URLs, credentials)
   - Attribute mappings
   - Submitter information

### Approving an IdP

1. Click "Approve" button
2. Confirm approval
3. System actions:
   - Enables IdP in Keycloak
   - Updates submission status to "approved"
   - Logs approval action
4. IdP now active for user authentication

### Rejecting an IdP

1. Enter rejection reason in text field
2. Click "Reject" button
3. Confirm rejection
4. System actions:
   - Deletes IdP from Keycloak
   - Updates submission status to "rejected"
   - Stores rejection reason
   - Logs rejection action

**Best Practice:** Always provide a clear rejection reason for audit trail.

---

## 📜 Viewing Audit Logs

### Accessing Log Viewer

**Navigate to:** `/admin/logs`

### Filtering Logs

**Event Type Filter:**
- All Events
- ENCRYPT (data encrypted)
- DECRYPT (data accessed)
- ACCESS_DENIED (policy denial)
- ACCESS_MODIFIED (content changed)
- DATA_SHARED (cross-domain release)

**Outcome Filter:**
- All Outcomes
- ALLOW (successful)
- DENY (denied)

**Subject Filter:**
- Enter user uniqueID (e.g., `john.doe@mil`)
- Partial match supported

### Understanding Log Entries

**Table Columns:**
- **Timestamp:** When event occurred
- **Event Type:** ACP-240 event type (color-coded)
- **Subject:** User who performed action
- **Resource:** Resource ID accessed
- **Outcome:** ALLOW (green) or DENY (red)
- **Reason:** Policy decision reason

**Security Violations (Red Background):**
- Events with outcome = DENY
- Indicates failed authorization attempt
- Review for potential security threats

### Exporting Logs

1. Apply desired filters
2. Click "Export" button
3. JSON file downloads
4. Use for compliance reporting

**Export includes:**
- All filtered log entries
- Full event details (attributes, policy evaluation)
- Suitable for audit submission

---

## 📊 Dashboard & Statistics

### Admin Dashboard

**Navigate to:** `/admin/dashboard`

**Quick Stats (Last 7 Days):**
1. **Successful Access** - ALLOW decisions
2. **Denied Access** - DENY decisions
3. **Total Events** - All ACP-240 events
4. **Violations** - Security violations count

**Quick Actions:**
- **View Audit Logs** → `/admin/logs`
- **Security Violations** → `/admin/logs?outcome=DENY`
- **Manage IdPs** → `/admin/idp`

**Top Denied Resources:**
- Resources most frequently denied
- Useful for identifying sensitive content
- Click to view in log viewer

**Events by Type:**
- Breakdown of all event types
- ENCRYPT, DECRYPT, ACCESS_DENIED, etc.
- Count per type

---

## 🔒 Security Best Practices

### Super Admin Role

**Assignment:**
- Manually assigned in Keycloak (not self-service)
- Navigate to Keycloak Admin Console
- Realm: dive-v3-pilot → Users → [user] → Role Mappings
- Add "super_admin" role

**Protection:**
- Never share super admin credentials
- Log out when not in use
- Monitor admin action logs
- Review approval decisions regularly

### IdP Security

**When Creating IdPs:**
- ✅ Verify IdP is from trusted source
- ✅ Test connectivity before approval
- ✅ Validate certificate (SAML)
- ✅ Use strong signature algorithms
- ✅ Enable signature validation

**When Approving IdPs:**
- ✅ Review all configuration details
- ✅ Verify attribute mappings correct
- ✅ Check submitted by trusted user
- ✅ Test if uncertain
- ✅ Document approval reason

**Red Flags:**
- ❌ Unknown/untrusted IdP URLs
- ❌ Weak signature algorithms
- ❌ Missing certificates (SAML)
- ❌ Suspicious attribute mappings
- ❌ Unusual submission times

### Audit Monitoring

**Daily Tasks:**
- Review ACCESS_DENIED events
- Check for unusual access patterns
- Monitor new IdP submissions
- Review top denied resources

**Weekly Tasks:**
- Export logs for compliance
- Review approval history
- Check system statistics
- Validate all IdPs still active

---

## 🛠️ Troubleshooting

### "Admin link not visible"

**Solution:**
1. Verify user has super_admin role in Keycloak
2. Check JWT token includes realm_access.roles
3. Logout and login again to refresh token

### "Forbidden" error on admin endpoints

**Solution:**
1. Check JWT token valid (not expired)
2. Verify super_admin role in token
3. Check backend logs for details
4. Ensure adminAuthMiddleware running

### "IdP test failed"

**Solution:**
1. Check IdP URLs are correct
2. Verify IdP is reachable from backend
3. Check OIDC discovery endpoint exists
4. Verify SAML SSO endpoint responds
5. Check firewall/network settings

### "No logs displayed"

**Solution:**
1. Verify MongoDB connection
2. Check audit_logs collection exists
3. Generate some activity (access resources)
4. Check backend logs for MongoDB errors

---

## 📞 Support

### Additional Resources
- **Implementation Guide:** WEEK3.3-IMPLEMENTATION-COMPLETE.md
- **QA Results:** WEEK3.3-QA-RESULTS.md
- **API Reference:** See CHANGELOG.md (Week 3.3 section)
- **Keycloak API:** keycloak-admin-api-llm.md

### Common Tasks

**Add Super Admin Role to User:**
```
Keycloak Admin Console
→ Realms → dive-v3-pilot
→ Users → [select user]
→ Role Mappings → Available Roles
→ Select "super_admin" → Add Selected
```

**View Backend Logs:**
```bash
docker-compose logs -f backend
# OR
tail -f backend/logs/app.log
```

**Check Audit Logs in MongoDB:**
```bash
docker-compose exec mongodb mongosh dive-v3
> db.audit_logs.find().sort({timestamp: -1}).limit(10)
```

---

## 🎯 Quick Reference

### Admin Console Routes
```
/admin/dashboard    - System overview and statistics
/admin/idp          - IdP list and management
/admin/idp/new      - IdP onboarding wizard
/admin/logs         - Audit log viewer
/admin/approvals    - Pending IdP approvals
```

### API Endpoints
```
GET    /api/admin/idps                      List IdPs
POST   /api/admin/idps                      Create IdP
GET    /api/admin/idps/:alias               Get IdP details
PUT    /api/admin/idps/:alias               Update IdP
DELETE /api/admin/idps/:alias               Delete IdP
POST   /api/admin/idps/:alias/test          Test IdP

GET    /api/admin/logs                      Query logs
GET    /api/admin/logs/violations           Security violations
GET    /api/admin/logs/stats                Statistics
GET    /api/admin/logs/export               Export logs

GET    /api/admin/approvals/pending         Pending IdPs
POST   /api/admin/approvals/:alias/approve  Approve IdP
POST   /api/admin/approvals/:alias/reject   Reject IdP
```

### Required Permissions
All admin endpoints require:
- ✅ Valid JWT token
- ✅ super_admin role in realm_access.roles
- ✅ Authenticated session

---

**Document Version:** 1.0  
**Effective Date:** October 13, 2025  
**For:** DIVE V3 Super Administrators

