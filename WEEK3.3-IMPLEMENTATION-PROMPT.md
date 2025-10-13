# Week 3.3 Implementation Prompt: IdP Onboarding Wizard & Super Admin Console

**Date:** October 13, 2025  
**Current Commit:** cc4d7cd  
**Branch:** main  
**Status:** Week 3.2 Complete - Ready for Week 3.3

---

## 📋 PROJECT CONTEXT

### Repository Status
- **URL:** https://github.com/albeach/DIVE-V3
- **Current State:** Production-ready with NATO ACP-240 compliance
- **Test Coverage:** 106 OPA tests + 45 integration tests (100% passing)
- **CI/CD:** GitHub Actions 7/7 jobs passing

### Completed Milestones
- ✅ **Week 1:** Foundation (Keycloak, Next.js, MongoDB, Backend API)
- ✅ **Week 2:** Authorization (OPA, PEP/PDP, 78 tests)
- ✅ **Week 3:** Multi-IdP Federation (4 IdPs: US, France, Canada, Industry)
- ✅ **Week 3.1:** NATO ACP-240 (ZTDF, KAS, STANAG 4774/4778, 87 tests)
- ✅ **Week 3.2:** Policy Viewer + Secure Upload (106 tests, production ready)

### Current Capabilities
- 4 IdPs operational (U.S., France, Canada, Industry)
- ABAC authorization with OPA (106/106 tests passing)
- ZTDF format with STANAG 4774/4778 compliance
- KAS service with policy-bound encryption
- Policy viewer with interactive tester
- Secure file upload with automatic ZTDF conversion
- Enhanced audit logging (5 ACP-240 event types)

---

## 🎯 WEEK 3.3 OBJECTIVES

### Objective A: IdP Onboarding Wizard
**Goal:** Streamlined workflow for administrators to add new SAML/OIDC Identity Providers to Keycloak broker

**Requirements:**
- Web-based wizard UI (multi-step form)
- Support both SAML 2.0 and OIDC protocols
- Automatic Keycloak configuration via Admin API
- Protocol mapper creation for DIVE attributes
- Testing interface for new IdP
- Validation and preview before activation
- Audit logging for IdP management events

**User Stories:**
1. As an admin, I want to add a new SAML IdP without editing Terraform
2. As an admin, I want to configure attribute mappings via UI
3. As an admin, I want to test the new IdP before making it live
4. As an admin, I want to see all configured IdPs and their status

### Objective B: Super Administrator Console
**Goal:** Administrative dashboard for monitoring, auditing, and IdP management

**Requirements:**
- Super Admin role with elevated privileges
- Comprehensive logging dashboard (view all ACP-240 events)
- Security violation monitoring
- IdP approval workflow (pending → approved → active)
- User management (view users, clearances, sessions)
- System health monitoring
- Audit trail export

**User Stories:**
1. As a super admin, I want to view all authorization decisions
2. As a super admin, I want to see security violations (failed access attempts)
3. As a super admin, I want to approve/deny new IdP configurations
4. As a super admin, I want to monitor system health
5. As a super admin, I want to export audit logs for compliance

---

## 📚 CRITICAL REFERENCE MATERIALS

### Must Read Before Starting

1. **keycloak-admin-api-llm.md** - Keycloak Admin REST API documentation
   - Section on Identity Provider configuration
   - Protocol mappers API
   - Realm management endpoints

2. **ACP240-llms.txt** - NATO ACP-240 specification
   - Section 6: Logging & Auditing (event types)
   - Section 2: Identity Specifications

3. **terraform/main.tf** - Current Keycloak configuration
   - Study keycloak_oidc_identity_provider resources
   - Review protocol_mapper configurations
   - Understand existing IdP patterns

4. **backend/src/middleware/authz.middleware.ts** - JWT verification pattern
   - Study role extraction from tokens
   - Review attribute handling

5. **backend/src/utils/acp240-logger.ts** - Audit logging utilities
   - Study existing event types
   - Review logging format

6. **policies/fuel_inventory_abac_policy.rego** - Current OPA policy
   - 402 lines of authorization logic
   - Consider how to add admin role checks

### Repository Structure
```
DIVE-V3/
├── frontend/src/
│   ├── app/
│   │   ├── admin/          ← NEW: Super admin console
│   │   ├── admin/idp/      ← NEW: IdP wizard
│   │   ├── admin/logs/     ← NEW: Log viewer
│   │   └── admin/users/    ← NEW: User management
│   ├── components/admin/   ← NEW: Admin components
├── backend/src/
│   ├── controllers/
│   │   ├── admin.controller.ts     ← NEW
│   │   └── idp.controller.ts       ← NEW
│   ├── services/
│   │   ├── keycloak-admin.service.ts  ← NEW
│   │   └── audit-log.service.ts       ← NEW
│   ├── middleware/
│   │   └── admin-auth.middleware.ts   ← NEW
│   ├── types/
│   │   ├── keycloak.types.ts          ← NEW
│   │   └── admin.types.ts             ← NEW
├── policies/
│   ├── admin_authorization_policy.rego  ← NEW
│   └── tests/
│       └── admin_tests.rego             ← NEW
```

---

## 🔨 PHASED IMPLEMENTATION PLAN

### DAY 1: Backend - Keycloak Admin API Integration

**Goal:** Establish connection to Keycloak Admin API and implement IdP management

**Tasks:**
1. **Install Dependencies**
   ```bash
   cd backend
   npm install @keycloak/keycloak-admin-client
   ```

2. **Create Keycloak Admin Service** (`backend/src/services/keycloak-admin.service.ts`)
   - Initialize admin client with credentials
   - listIdentityProviders(): Get all configured IdPs
   - getIdentityProvider(alias): Get specific IdP config
   - createSAMLIdentityProvider(config): Create SAML IdP
   - createOIDCIdentityProvider(config): Create OIDC IdP
   - updateIdentityProvider(alias, config): Update IdP
   - deleteIdentityProvider(alias): Remove IdP
   - createProtocolMapper(idpAlias, mapper): Add attribute mapping
   - testIdentityProvider(alias): Test IdP connection

3. **Create Admin Controller** (`backend/src/controllers/admin.controller.ts`)
   - listIdPsHandler: GET /api/admin/idps
   - getIdPHandler: GET /api/admin/idps/:alias
   - createIdPHandler: POST /api/admin/idps
   - updateIdPHandler: PUT /api/admin/idps/:alias
   - deleteIdPHandler: DELETE /api/admin/idps/:alias
   - testIdPHandler: POST /api/admin/idps/:alias/test

4. **Create Admin Auth Middleware** (`backend/src/middleware/admin-auth.middleware.ts`)
   - Verify user has super_admin role
   - Extract from JWT: roles claim
   - Deny if not super_admin
   - Log admin actions

5. **Define Types** (`backend/src/types/keycloak.types.ts`, `admin.types.ts`)

**Acceptance Criteria:**
- [ ] Backend can connect to Keycloak Admin API
- [ ] Can list existing IdPs via REST endpoint
- [ ] Admin middleware enforces role check
- [ ] TypeScript: 0 errors
- [ ] Integration tests: 5+ new tests

---

### DAY 2: Frontend - IdP Onboarding Wizard (Part 1: OIDC)

**Goal:** Create multi-step wizard for OIDC IdP configuration

**Tasks:**
1. **Create Wizard Page** (`frontend/src/app/admin/idp/new/page.tsx`)
   - Step 1: Protocol selection (SAML or OIDC)
   - Step 2: Basic configuration (alias, display name, description)
   - Step 3: OIDC-specific config (issuer, client ID/secret, scopes)
   - Step 4: Attribute mapping (uniqueID, clearance, country, COI)
   - Step 5: Review and test
   - Step 6: Activation

2. **Create Wizard Components**
   - `frontend/src/components/admin/wizard-steps.tsx` - Step indicator
   - `frontend/src/components/admin/oidc-config-form.tsx` - OIDC form
   - `frontend/src/components/admin/attribute-mapper.tsx` - Mapping UI

3. **Add Navigation**
   - Add "Admin" link to dashboard (visible only to super_admin)
   - Breadcrumb navigation

**Acceptance Criteria:**
- [ ] Wizard accessible at `/admin/idp/new`
- [ ] Step-by-step flow working
- [ ] Form validation on each step
- [ ] OIDC configuration form complete
- [ ] TypeScript: 0 errors

---

### DAY 3: Frontend - IdP Onboarding Wizard (Part 2: SAML)

**Goal:** Add SAML support to IdP wizard

**Tasks:**
1. **Create SAML Config Form** (`frontend/src/components/admin/saml-config-form.tsx`)
   - SSO Service URL
   - Entity ID
   - Certificate upload/paste
   - Signature algorithm
   - Name ID format
   - Attribute URNs

2. **Enhance Wizard Logic**
   - Dynamic form based on protocol selection
   - SAML vs OIDC attribute mapping differences
   - Certificate validation
   - Metadata XML import (optional)

3. **Add IdP List Page** (`frontend/src/app/admin/idp/page.tsx`)
   - Display all configured IdPs
   - Status indicators (active, pending, inactive)
   - Edit/Delete/Test actions
   - Search and filter

**Acceptance Criteria:**
- [ ] SAML configuration form complete
- [ ] Wizard supports both SAML and OIDC
- [ ] IdP list page displays all IdPs
- [ ] Actions (edit, delete, test) functional
- [ ] TypeScript: 0 errors

---

### DAY 4: Super Admin Console - Log Viewer

**Goal:** Comprehensive audit log viewing interface

**Tasks:**
1. **Create Audit Log Service** (`backend/src/services/audit-log.service.ts`)
   - queryLogs(filters): Query logs with pagination
   - getSecurityViolations(): Get ACCESS_DENIED events
   - getEncryptEvents(): Get ENCRYPT events
   - getDecryptEvents(): Get DECRYPT events
   - exportLogs(format): Export to CSV/JSON
   - getLogStatistics(): Get aggregate stats

2. **Create Admin Log Controller** (`backend/src/controllers/admin-log.controller.ts`)
   - getLogsHandler: GET /api/admin/logs
   - getViolationsHandler: GET /api/admin/logs/violations
   - exportLogsHandler: GET /api/admin/logs/export
   - getStatsHandler: GET /api/admin/logs/stats

3. **Create Log Viewer UI** (`frontend/src/app/admin/logs/page.tsx`)
   - Log table with pagination
   - Filters (event type, user, resource, date range)
   - Security violations highlighted
   - Real-time log streaming (WebSocket or polling)
   - Export button
   - Log detail modal

4. **Create Stats Dashboard** (`frontend/src/app/admin/dashboard/page.tsx`)
   - Total events by type (pie chart)
   - Events over time (line chart)
   - Top denied resources
   - Top users by access attempts
   - Security violation trends

**Acceptance Criteria:**
- [ ] Log viewer displays all ACP-240 events
- [ ] Filters working (type, user, date)
- [ ] Security violations highlighted
- [ ] Export functionality working
- [ ] Statistics dashboard complete
- [ ] TypeScript: 0 errors

---

### DAY 5: Super Admin Console - IdP Approval Workflow

**Goal:** Workflow for approving/denying IdP submissions

**Tasks:**
1. **Add IdP Status Field to Database**
   - Extend Keycloak IdP with status: 'pending' | 'approved' | 'rejected'
   - Store in metadata or separate MongoDB collection

2. **Create Approval Service** (`backend/src/services/idp-approval.service.ts`)
   - submitIdPForApproval(idpConfig): Submit new IdP
   - getPendingIdPs(): List pending approvals
   - approveIdP(alias, approver): Approve and activate
   - rejectIdP(alias, reason, approver): Reject with reason
   - getApprovalHistory(alias): Get approval audit trail

3. **Create Approval UI** (`frontend/src/app/admin/approvals/page.tsx`)
   - List pending IdP submissions
   - Review interface (show full config)
   - Approve/Reject buttons
   - Rejection reason form
   - Approval history timeline

4. **Update IdP Wizard**
   - Wizard submits for approval (not immediate activation)
   - Show "Pending Approval" status
   - Email notification to super admins (optional)

**Acceptance Criteria:**
- [ ] IdP submissions create pending requests
- [ ] Super admin can view pending IdPs
- [ ] Approve action activates IdP in Keycloak
- [ ] Reject action prevents activation
- [ ] Approval history tracked
- [ ] TypeScript: 0 errors

---

### DAY 6: OPA Policy for Admin Role & Complete Testing

**Goal:** Implement admin authorization in OPA and comprehensive testing

**Tasks:**
1. **Create Admin Policy** (`policies/admin_authorization_policy.rego`)
   ```rego
   package dive.admin_authorization
   
   default allow := false
   
   # Allow if user has super_admin role
   allow if {
       input.subject.authenticated
       "super_admin" in input.subject.roles
       input.action.operation in allowed_admin_operations
   }
   
   allowed_admin_operations := {
       "view_logs", "export_logs", "approve_idp", 
       "reject_idp", "manage_users", "view_violations"
   }
   ```

2. **Add Role-Based Access to Main Policy**
   - Update `fuel_inventory_abac_policy.rego`
   - Add admin bypass for testing (optional)
   - Add role extraction logic

3. **Create OPA Admin Tests** (`policies/tests/admin_authorization_tests.rego`)
   - 10+ tests for admin operations
   - Test super_admin role required
   - Test non-admin denied
   - Test operation-specific checks

4. **Create Integration Tests**
   - `backend/src/__tests__/admin.test.ts` (admin API tests)
   - `backend/src/__tests__/idp-wizard.test.ts` (wizard tests)
   - Test admin middleware
   - Test Keycloak Admin API integration

5. **Run Full QA**
   - OPA tests: Target 120+ (106 + 14 new admin)
   - Integration tests: Target 60+ (45 + 15 new)
   - Manual testing: All admin workflows
   - Performance testing

6. **Update CI/CD**
   - Update test thresholds (120 OPA tests)
   - Add admin tests to pipeline

**Acceptance Criteria:**
- [ ] Admin policy created with role checks
- [ ] 14+ new OPA tests (admin operations)
- [ ] 15+ new integration tests
- [ ] OPA tests: 120+ passing
- [ ] Integration tests: 60+ passing
- [ ] GitHub Actions: All jobs passing
- [ ] TypeScript: 0 errors

---

## 🔒 SECURITY REQUIREMENTS

### Super Admin Role

**Authentication:**
- Super admin must have valid JWT
- JWT must contain `roles` claim with `super_admin`
- Role assigned manually in Keycloak (not self-service)

**Authorization:**
- All admin endpoints protected by adminAuthMiddleware
- OPA policy checks for super_admin role
- Fail-closed if role missing

**Audit Logging:**
- Log all admin actions (IdP create, approve, reject)
- Log super admin logins
- Log configuration changes
- Event type: ADMIN_ACTION

### IdP Onboarding Security

**Validation:**
- OIDC: Validate issuer URL format
- SAML: Validate certificate (X.509)
- Validate alias uniqueness
- Sanitize all inputs (XSS prevention)

**Approval Workflow:**
- New IdPs start in 'pending' status
- Require super admin approval
- Rejection requires reason
- Cannot bypass approval workflow

**Testing:**
- IdP test before activation
- Validate attribute mapping works
- Check DIVE attributes present in token

---

## 🎨 UI/UX SPECIFICATIONS

### IdP Onboarding Wizard

**Step 1: Protocol Selection**
```
┌─────────────────────────────────────────────────┐
│ Add New Identity Provider                       │
│                                                  │
│ Select Protocol:                                │
│ ┌────────────┐  ┌────────────┐                 │
│ │  🔷 OIDC   │  │  🔶 SAML   │                 │
│ │  (OAuth 2) │  │  (SAML 2.0)│                 │
│ └────────────┘  └────────────┘                 │
│                                                  │
│           [Next →]                              │
└─────────────────────────────────────────────────┘
```

**Step 2: Basic Configuration**
```
┌─────────────────────────────────────────────────┐
│ Basic Configuration                             │
│                                                  │
│ Alias:        [germany-idp_______]             │
│ Display Name: [Germany Military IdP]           │
│ Description:  [German Armed Forces OIDC]       │
│                                                  │
│ [← Back]  [Next →]                             │
└─────────────────────────────────────────────────┘
```

**Step 3: Protocol Configuration (OIDC)**
```
┌─────────────────────────────────────────────────┐
│ OIDC Configuration                              │
│                                                  │
│ Issuer URL:     [https://idp.example.mil/oidc] │
│ Client ID:      [dive-v3-client_____________]  │
│ Client Secret:  [•••••••••••••••••••••••••]    │
│ Authorization:  [https://...oauth/authorize]    │
│ Token Endpoint: [https://...oauth/token]        │
│ User Info:      [https://...userinfo]          │
│                                                  │
│ [← Back]  [Next →]                             │
└─────────────────────────────────────────────────┘
```

**Step 4: Attribute Mapping**
```
┌─────────────────────────────────────────────────┐
│ DIVE Attribute Mapping                          │
│                                                  │
│ Map IdP claims to DIVE attributes:              │
│                                                  │
│ uniqueID    ← [sub____________] (IdP claim)    │
│ clearance   ← [security_level__] (IdP claim)   │
│ country     ← [nationality_____] (IdP claim)   │
│ acpCOI      ← [groups__________] (IdP claim)   │
│                                                  │
│ [← Back]  [Next →]                             │
└─────────────────────────────────────────────────┘
```

**Step 5: Review & Test**
```
┌─────────────────────────────────────────────────┐
│ Review Configuration                            │
│                                                  │
│ Alias: germany-idp                              │
│ Protocol: OIDC                                  │
│ Issuer: https://idp.example.mil/oidc           │
│ Mappings: 4 configured                          │
│                                                  │
│ [Test Connection]  Status: ✅ Connected         │
│                                                  │
│ Submit for Approval:                            │
│ [ ] I verify this configuration is correct      │
│                                                  │
│ [← Back]  [Submit for Approval]                │
└─────────────────────────────────────────────────┘
```

### Super Admin Console

**Dashboard**
```
┌─────────────────────────────────────────────────┐
│ 👑 Super Administrator Console                  │
│                                                  │
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐   │
│ │ 4 IdPs │ │ 3 Pending│ │ 156 │ │ 12 Violations││
│ │ Active │ │ Approvals│ │ Users  │ │ Last 24h    ││
│ └────────┘ └────────┘ └────────┘ └────────┘   │
│                                                  │
│ Quick Actions:                                  │
│ • [View Pending IdP Approvals]                  │
│ • [View Security Violations]                    │
│ • [Export Audit Logs]                           │
│ • [Manage Users]                                │
└─────────────────────────────────────────────────┘
```

---

## 📊 API SPECIFICATIONS

### Admin IdP Management API

**GET /api/admin/idps**
```json
Response 200:
{
  "idps": [
    {
      "alias": "us-idp",
      "displayName": "U.S. Military IdP",
      "protocol": "oidc",
      "status": "active",
      "enabled": true,
      "createdAt": "2025-10-10T10:00:00Z"
    },
    {
      "alias": "germany-idp",
      "displayName": "Germany Military IdP",
      "protocol": "oidc",
      "status": "pending",
      "enabled": false,
      "createdAt": "2025-10-13T14:00:00Z"
    }
  ]
}
```

**POST /api/admin/idps**
```json
Request:
{
  "alias": "germany-idp",
  "displayName": "Germany Military IdP",
  "protocol": "oidc",
  "config": {
    "issuer": "https://idp.bundeswehr.mil/oidc",
    "clientId": "dive-v3-client",
    "clientSecret": "secret123",
    "authorizationUrl": "https://idp.bundeswehr.mil/oauth/authorize",
    "tokenUrl": "https://idp.bundeswehr.mil/oauth/token"
  },
  "attributeMappings": {
    "uniqueID": "sub",
    "clearance": "security_level",
    "countryOfAffiliation": "nationality",
    "acpCOI": "groups"
  }
}

Response 201:
{
  "success": true,
  "alias": "germany-idp",
  "status": "pending",
  "message": "IdP submitted for approval"
}
```

### Admin Logs API

**GET /api/admin/logs**
```json
Query params: ?eventType=ACCESS_DENIED&limit=50&offset=0

Response 200:
{
  "logs": [
    {
      "timestamp": "2025-10-13T14:30:00Z",
      "eventType": "ACCESS_DENIED",
      "subject": "john.doe@mil",
      "resourceId": "doc-secret-001",
      "reason": "Insufficient clearance: CONFIDENTIAL < SECRET",
      "requestId": "req-abc-123"
    }
  ],
  "total": 156,
  "page": 1
}
```

---

## 🧪 TESTING STRATEGY

### OPA Tests (Target: 120+)

**Admin Authorization Tests (14 new):**
1. test_admin_can_view_logs
2. test_admin_can_approve_idp
3. test_admin_can_reject_idp
4. test_admin_can_export_logs
5. test_non_admin_cannot_view_logs
6. test_non_admin_cannot_approve_idp
7. test_admin_role_required
8. test_admin_operations_list
9. test_admin_can_manage_users
10. test_admin_view_violations
11. test_admin_authenticated_required
12. test_admin_missing_role_denied
13. test_admin_invalid_operation_denied
14. test_admin_audit_trail

**Total Expected:** 120 tests (106 + 14)

### Integration Tests (Target: 60+)

**Keycloak Admin API Tests (8):**
1. List IdPs via Admin API
2. Create OIDC IdP
3. Create SAML IdP
4. Update IdP configuration
5. Delete IdP
6. Create protocol mapper
7. Test IdP connection
8. Handle Admin API errors

**Admin Workflow Tests (7):**
1. Submit IdP for approval
2. Approve IdP (activates in Keycloak)
3. Reject IdP with reason
4. List pending approvals
5. Super admin role enforcement
6. Non-admin denied
7. Approval audit logging

**Total Expected:** 60 tests (45 + 15)

---

## 📝 DETAILED IMPLEMENTATION SPECIFICATIONS

### Keycloak Admin API Integration

**Authentication:**
```typescript
import KcAdminClient from '@keycloak/keycloak-admin-client';

const kcAdminClient = new KcAdminClient({
  baseUrl: process.env.KEYCLOAK_URL,
  realmName: process.env.KEYCLOAK_REALM
});

// Authenticate
await kcAdminClient.auth({
  username: process.env.KEYCLOAK_ADMIN_USER,
  password: process.env.KEYCLOAK_ADMIN_PASSWORD,
  grantType: 'password',
  clientId: 'admin-cli'
});
```

**Create OIDC IdP:**
```typescript
await kcAdminClient.identityProviders.create({
  alias: 'germany-idp',
  displayName: 'Germany Military IdP',
  providerId: 'oidc',
  enabled: false, // Pending approval
  config: {
    issuer: 'https://idp.bundeswehr.mil/oidc',
    clientId: 'dive-v3-client',
    clientSecret: 'secret123',
    defaultScope: 'openid profile email',
    authorizationUrl: 'https://idp.bundeswehr.mil/oauth/authorize',
    tokenUrl: 'https://idp.bundeswehr.mil/oauth/token',
    userInfoUrl: 'https://idp.bundeswehr.mil/userinfo'
  }
});
```

**Create Protocol Mapper:**
```typescript
await kcAdminClient.identityProviders.createMapper({
  identityProviderAlias: 'germany-idp'
}, {
  name: 'uniqueID-mapper',
  identityProviderAlias: 'germany-idp',
  identityProviderMapper: 'oidc-user-attribute-idp-mapper',
  config: {
    claim: 'sub',
    'user.attribute': 'uniqueID'
  }
});
```

---

## 🔐 SUPER ADMIN ROLE IMPLEMENTATION

### Keycloak Configuration

**Create Super Admin Role:**
```bash
# In Keycloak Admin Console
1. Navigate to Realm: dive-v3-pilot
2. Roles → Create Role
   - Name: super_admin
   - Description: Super Administrator with full system access
3. Users → Select user → Role Mappings
   - Assign super_admin role
```

**Protocol Mapper for Roles:**
```javascript
// Add to dive-v3-client in Keycloak
{
  name: 'roles-mapper',
  protocol: 'openid-connect',
  protocolMapper: 'oidc-usermodel-realm-role-mapper',
  config: {
    'claim.name': 'roles',
    'jsonType.label': 'String',
    'multivalued': 'true'
  }
}
```

### JWT Token with Roles

**Expected JWT Structure:**
```json
{
  "sub": "admin-user-123",
  "uniqueID": "admin@dive.mil",
  "clearance": "TOP_SECRET",
  "countryOfAffiliation": "USA",
  "acpCOI": ["FVEY"],
  "roles": ["super_admin"],
  "exp": 1697234567
}
```

### Admin Middleware

```typescript
// backend/src/middleware/admin-auth.middleware.ts
export const adminAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // 1. Authenticate JWT (reuse authenticateJWT)
  // 2. Extract roles from token
  // 3. Check for super_admin role
  // 4. Log admin action
  // 5. Fail-closed if role missing
};
```

---

## 📋 DATABASE SCHEMA

### IdP Approval Collection (MongoDB)

```typescript
interface IIdPSubmission {
  submissionId: string;
  alias: string;
  displayName: string;
  protocol: 'oidc' | 'saml';
  status: 'pending' | 'approved' | 'rejected';
  config: {
    // OIDC or SAML specific config
  };
  attributeMappings: {
    uniqueID: string;
    clearance: string;
    countryOfAffiliation: string;
    acpCOI: string;
  };
  submittedBy: string;
  submittedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
}
```

### Audit Log Query Enhancement

**Add Indexes:**
```javascript
// MongoDB indexes for fast log queries
db.audit_logs.createIndex({ eventType: 1, timestamp: -1 });
db.audit_logs.createIndex({ subject: 1, timestamp: -1 });
db.audit_logs.createIndex({ resourceId: 1, timestamp: -1 });
db.audit_logs.createIndex({ timestamp: -1 });
```

---

## 🔧 ENVIRONMENT VARIABLES

**Add to .env.local:**
```bash
# Keycloak Admin API
KEYCLOAK_ADMIN_USER=admin
KEYCLOAK_ADMIN_PASSWORD=admin

# Super Admin Configuration
SUPER_ADMIN_EMAIL=admin@dive.mil
SUPER_ADMIN_DEFAULT_CLEARANCE=TOP_SECRET

# Audit Log Configuration
AUDIT_LOG_RETENTION_DAYS=90
AUDIT_LOG_EXPORT_ENABLED=true
```

---

## 📊 SUCCESS CRITERIA

### Functional (100%)
- [ ] IdP wizard creates OIDC IdPs
- [ ] IdP wizard creates SAML IdPs
- [ ] Attribute mappings configurable
- [ ] IdP test functionality working
- [ ] Approval workflow functional
- [ ] Super admin can approve/reject IdPs
- [ ] Log viewer displays all events
- [ ] Security violations highlighted
- [ ] Export logs working
- [ ] Role-based access enforced

### Testing (100%)
- [ ] OPA tests: 120+ passing
- [ ] Integration tests: 60+ passing
- [ ] Manual testing: All workflows verified
- [ ] GitHub Actions: All jobs passing
- [ ] TypeScript: 0 errors

### Security (100%)
- [ ] Super admin role enforced
- [ ] Admin actions logged
- [ ] IdP validation implemented
- [ ] Approval workflow prevents bypass
- [ ] Fail-closed on role missing

### Quality (100%)
- [ ] Code documented (TSDoc)
- [ ] README updated
- [ ] CHANGELOG updated
- [ ] No TypeScript errors
- [ ] No security vulnerabilities

---

## 🚀 DELIVERABLES

**Expected Files: 20+ new, 8 modified**

**Backend (12 new):**
- services/keycloak-admin.service.ts
- services/audit-log.service.ts
- services/idp-approval.service.ts
- controllers/admin.controller.ts
- controllers/admin-log.controller.ts
- middleware/admin-auth.middleware.ts
- routes/admin.routes.ts
- types/keycloak.types.ts
- types/admin.types.ts
- __tests__/admin.test.ts
- __tests__/idp-wizard.test.ts
- __tests__/admin-auth.test.ts

**Frontend (8 new):**
- app/admin/dashboard/page.tsx
- app/admin/idp/page.tsx
- app/admin/idp/new/page.tsx
- app/admin/logs/page.tsx
- app/admin/approvals/page.tsx
- components/admin/wizard-steps.tsx
- components/admin/oidc-config-form.tsx
- components/admin/saml-config-form.tsx

**OPA (2 new):**
- policies/admin_authorization_policy.rego
- policies/tests/admin_authorization_tests.rego

**Documentation (3 new):**
- WEEK3.3-IMPLEMENTATION-COMPLETE.md
- WEEK3.3-QA-RESULTS.md
- docs/ADMIN-GUIDE.md

---

## 📚 REFERENCE MATERIALS

### Keycloak Admin API

**Key Endpoints:**
- `GET /admin/realms/{realm}/identity-provider/instances`
- `POST /admin/realms/{realm}/identity-provider/instances`
- `GET /admin/realms/{realm}/identity-provider/instances/{alias}`
- `PUT /admin/realms/{realm}/identity-provider/instances/{alias}`
- `DELETE /admin/realms/{realm}/identity-provider/instances/{alias}`
- `POST /admin/realms/{realm}/identity-provider/instances/{alias}/mappers`

**Documentation:** See `keycloak-admin-api-llm.md`

### Existing Patterns to Follow

**Admin UI Pattern:**
- Reference: `frontend/src/app/resources/[id]/page.tsx`
- Use existing SecureLogoutButton component
- Match DIVE V3 design system (Tailwind)

**Service Pattern:**
- Reference: `backend/src/services/upload.service.ts`
- Error handling, logging, validation

**Middleware Pattern:**
- Reference: `backend/src/middleware/authz.middleware.ts`
- JWT extraction, validation, fail-closed

---

## ⚠️ CRITICAL NOTES

### Do NOT Break Existing Functionality
- ✅ All 106 OPA tests MUST still pass
- ✅ All existing endpoints MUST work
- ✅ Policy viewer MUST remain functional
- ✅ Upload functionality MUST remain functional
- ✅ Resource access MUST remain unchanged

### Security Requirements (Non-Negotiable)
- ✅ Super admin role MUST be enforced
- ✅ Admin actions MUST be logged
- ✅ IdPs MUST require approval
- ✅ Fail-closed if admin check fails
- ✅ No self-service super admin

### Best Practices
- ✅ Test-driven: Write OPA tests first
- ✅ Incremental: 6-day phased approach
- ✅ Security-first: Validate everything
- ✅ Document: TSDoc on all functions
- ✅ Follow .cursorrules conventions

---

## 🎯 FINAL COMMIT MESSAGE TEMPLATE

```
feat(week3.3): IdP onboarding wizard and super admin console

IdP Onboarding Wizard:
- Add Keycloak Admin API service for IdP management
- Add IdP wizard UI (6-step workflow)
- Support OIDC and SAML protocol configuration
- Attribute mapper UI for DIVE claims
- IdP testing and validation
- Approval workflow (pending → approved)

Super Administrator Console:
- Add super admin role with OPA enforcement
- Add admin authentication middleware
- Add audit log viewer with filtering
- Add security violation monitoring
- Add IdP approval interface
- Add user management dashboard
- Add system health monitoring

OPA Policy Updates:
- Add admin_authorization_policy.rego
- Add super_admin role checks
- 14 new admin tests
- Total: 120 tests (106 + 14)

Integration Tests:
- 15 new admin/IdP tests
- Total: 60+ tests (45 + 15)

Files Created: 22 (~2,800 lines)
Files Modified: 8
OPA Tests: 120/120 PASSING (100%)
Integration Tests: 60+ PASSING
TypeScript: 0 errors

Status: Production-ready with admin capabilities

Ref: keycloak-admin-api-llm.md, ACP240-llms.txt (section 6)
```

---

**END OF WEEK 3.3 IMPLEMENTATION PROMPT**
