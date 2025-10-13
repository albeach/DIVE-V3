# DIVE V3 - Week 3.2: Policy Management & Secure File Upload Implementation Prompt

**Version**: 1.0  
**Date**: October 12, 2025  
**Prerequisites**: Week 3.1 ACP-240 Implementation Complete  
**Duration**: 3-4 days  
**Context**: This prompt is designed for a new chat session

---

## 📋 CONTEXT & CURRENT STATE

### Project Status (As of Week 3.1 Completion)

**Repository**: https://github.com/albeach/DIVE-V3  
**Branch**: `main`  
**Commit**: `17f5ef9`  
**Status**: Production-ready with NATO ACP-240 compliance

**Completed Milestones:**
- ✅ **Week 1**: Foundation (Keycloak, Next.js, MongoDB, Backend API)
- ✅ **Week 2**: Authorization (OPA, PEP/PDP, 78 tests passing)
- ✅ **Week 3**: Multi-IdP Federation (SAML + OIDC, 4 IdPs operational)
- ✅ **Week 3.1**: NATO ACP-240 (ZTDF, KAS, STANAG 4774/4778, 87 tests)

**Current Capabilities:**
- ✅ 4 IdPs operational (U.S., France, Canada, Industry)
- ✅ ABAC authorization with OPA (87/87 tests passing)
- ✅ ZTDF format with STANAG 4774/4778 compliance
- ✅ KAS service with policy-bound encryption
- ✅ Enhanced audit logging (5 ACP-240 event types)
- ✅ GitHub Actions CI/CD (6 automated jobs)

### Key Technologies

**Frontend**: Next.js 15, React 19, NextAuth.js v5, TypeScript, Tailwind CSS  
**Backend**: Node.js 20, Express.js 4.18, TypeScript, MongoDB 7  
**Auth**: Keycloak 23.0, JWT (RS256)  
**Authorization**: OPA 0.68.0, Rego policies  
**Security**: ACP-240 compliant, ZTDF format, KAS integration

---

## 🎯 WEEK 3.2 OBJECTIVES

Enhance DIVE V3 with policy management and secure file upload capabilities:

### Objective A: OPA Policy Management UI
Expose existing OPA Rego policies through web interface for:
- Viewing current policies (read-only initially)
- Understanding policy logic and rules
- Testing policy decisions interactively
- (Future) Editing and deploying policy updates

### Objective B: Secure File Upload with ACP-240 Compliance
Implement file upload functionality that:
- Accepts various file types (PDF, DOCX, TXT, images)
- Converts uploads to ZTDF format automatically
- Applies STANAG 4774 security labels
- Generates STANAG 4778 cryptographic binding
- Integrates with existing authorization flow
- Provides audit trail for all uploads

---

## 📚 CRITICAL REFERENCE MATERIALS

### Must Read Before Starting

1. **ACP240-llms.txt** - NATO ACP-240 specification (authoritative)
   - Section 4: Data Markings & Interoperability
   - Section 5: ZTDF & Cryptography
   - Section 6: Logging & Auditing

2. **backend/src/types/ztdf.types.ts** - ZTDF type definitions
   - Study IZTDFObject structure
   - Review ISTANAG4774Label interface
   - Understand IKeyAccessObject

3. **backend/src/utils/ztdf.utils.ts** - ZTDF utilities
   - migrateLegacyResourceToZTDF() - Conversion pattern
   - validateZTDFIntegrity() - Integrity validation
   - encryptContent() - AES-256-GCM encryption

4. **policies/fuel_inventory_abac_policy.rego** - Current OPA policy
   - 380+ lines of Rego logic
   - 7 violation checks (is_not_a_* pattern)
   - Enhanced KAS obligations
   - ZTDF integrity validation

5. **backend/src/middleware/authz.middleware.ts** - PEP pattern
   - JWT verification
   - OPA decision enforcement
   - ACP-240 audit logging

6. **.github/workflows/ci.yml** - CI/CD pipeline
   - 6 jobs: Backend, Frontend, KAS, OPA, ZTDF validation, Security
   - Test coverage threshold: 84+ tests
   - TypeScript compilation checks

### Repository Structure
```
DIVE-V3/
├── frontend/src/app/
│   ├── resources/         ← Existing resource UI
│   ├── dashboard/         ← User dashboard
│   └── login/             ← IdP selection
├── backend/src/
│   ├── controllers/       ← Add policy & upload controllers
│   ├── middleware/        ← Enhance with upload validation
│   ├── services/          ← Add policy & upload services
│   ├── routes/            ← Add new routes
│   └── types/             ← Extend ZTDF types
├── policies/
│   └── tests/             ← Add new policy management tests
└── .github/workflows/     ← Update CI/CD for new features
```

---

## 🔨 PHASED IMPLEMENTATION PLAN

### **DAY 1: OPA Policy Viewer (Backend Foundation)**

**Goal**: Expose OPA policies via REST API (read-only)

**Tasks:**

1. **Create Policy Service** (`backend/src/services/policy.service.ts`)
   ```typescript
   - listPolicies(): Promise<IPolicyMetadata[]>
   - getPolicyById(policyId: string): Promise<IPolicyContent>
   - getPolicyTests(policyId: string): Promise<ITestResults>
   - testPolicyDecision(input: IOPAInput): Promise<IOPADecision>
   ```
   
2. **Create Policy Controller** (`backend/src/controllers/policy.controller.ts`)
   ```typescript
   - listPoliciesHandler: GET /api/policies
   - getPolicyHandler: GET /api/policies/:id
   - testDecisionHandler: POST /api/policies/:id/test
   ```

3. **Add Policy Routes** (`backend/src/routes/policy.routes.ts`)
   - Protect with authentication middleware
   - Apply rate limiting
   - Add request validation

4. **Define Types** (`backend/src/types/policy.types.ts`)
   ```typescript
   interface IPolicyMetadata {
     policyId: string;
     name: string;
     description: string;
     version: string;
     ruleCount: number;
     testCount: number;
     lastModified: string;
   }
   
   interface IPolicyContent {
     policyId: string;
     content: string; // Rego source code
     syntax: 'rego';
     lines: number;
   }
   ```

**Acceptance Criteria:**
- [ ] Backend exposes `/api/policies` endpoint
- [ ] Returns current fuel_inventory_abac_policy.rego
- [ ] Includes metadata (version, rule count, test count)
- [ ] Test decision endpoint functional
- [ ] TypeScript: 0 errors
- [ ] Integration tests: 5+ new tests

**Reference Files:**
- Existing: `policies/fuel_inventory_abac_policy.rego`
- Existing: `backend/src/controllers/resource.controller.ts` (pattern to follow)
- Existing: `backend/src/middleware/authz.middleware.ts` (OPA integration pattern)

---

### **DAY 2: OPA Policy Viewer (Frontend UI)**

**Goal**: Create policy viewer UI for users to understand authorization logic

**Tasks:**

1. **Create Policy List Page** (`frontend/src/app/policies/page.tsx`)
   - Display available policies
   - Show policy metadata (version, rules, tests)
   - Link to detail view
   - Require authentication

2. **Create Policy Detail Page** (`frontend/src/app/policies/[id]/page.tsx`)
   - Syntax-highlighted Rego code display
   - Rule explanations (clearance, releasability, COI, embargo, ZTDF)
   - Test results summary
   - Interactive decision tester

3. **Create Policy Tester Component** (`frontend/src/components/policy/policy-tester.tsx`)
   - Input form for subject/resource/context attributes
   - Submit to `/api/policies/:id/test`
   - Display decision (allow/deny) with evaluation details
   - Color-coded results (green=allow, red=deny)

4. **Add Navigation Links**
   - Add "Policies" link to dashboard/resources navigation
   - Breadcrumb navigation

**Acceptance Criteria:**
- [ ] Policy list page displays current policies
- [ ] Policy detail shows Rego source with syntax highlighting
- [ ] Interactive tester allows custom inputs
- [ ] Results show evaluation_details (clearance_sufficient, country_releasable, etc.)
- [ ] TypeScript: 0 errors
- [ ] UI matches existing DIVE V3 design (Tailwind, modern)

**Reference Files:**
- Existing: `frontend/src/app/resources/page.tsx` (UI pattern)
- Existing: `frontend/src/app/resources/[id]/page.tsx` (detail page pattern)
- Existing: `frontend/src/app/dashboard/page.tsx` (navigation pattern)

**UI Libraries to Consider:**
- Syntax highlighting: `react-syntax-highlighter` or `prism-react-renderer`
- Code display: `<pre>` with monospace font and line numbers

---

### **DAY 3: Secure File Upload (Backend Implementation)**

**Goal**: Implement ACP-240-compliant file upload with automatic ZTDF conversion

**Tasks:**

1. **Create Upload Service** (`backend/src/services/upload.service.ts`)
   ```typescript
   - uploadFile(file: Express.Multer.File, metadata: IUploadMetadata): Promise<IZTDFResource>
   - validateFileSize(size: number): boolean
   - validateFileType(mimetype: string): boolean
   - convertToZTDF(file: Buffer, metadata: ISecurityMetadata): Promise<IZTDFObject>
   ```

2. **Create Upload Controller** (`backend/src/controllers/upload.controller.ts`)
   ```typescript
   - uploadFileHandler: POST /api/upload
   - Validate file type/size
   - Extract user attributes from JWT
   - Apply security labels based on user input
   - Convert to ZTDF format
   - Store in MongoDB
   - Return resourceId
   ```

3. **Add Upload Middleware** (`backend/src/middleware/upload.middleware.ts`)
   - File size limits (10MB default, configurable)
   - File type validation (PDF, DOCX, TXT, PNG, JPG)
   - Malware scanning placeholder (log for future integration)
   - Rate limiting (5 uploads/minute per user)

4. **Configure Multer** (file upload handling)
   ```typescript
   - Memory storage (process in-memory, don't write to disk)
   - File size limit: 10MB
   - Accepted types: application/pdf, text/*, image/*
   ```

5. **Define Upload Types** (`backend/src/types/upload.types.ts`)
   ```typescript
   interface IUploadMetadata {
     classification: ClassificationLevel;
     releasabilityTo: string[];
     COI?: string[];
     caveats?: string[];
     title: string;
     description?: string;
   }
   
   interface IUploadResult {
     success: boolean;
     resourceId: string;
     ztdfObjectId: string;
     displayMarking: string;
     metadata: {
       fileSize: number;
       mimeType: string;
       uploadedAt: string;
       uploadedBy: string;
     };
   }
   ```

6. **Enhance ACP-240 Logging**
   - Log ENCRYPT event on successful upload
   - Log ACCESS_MODIFIED event on file processing
   - Include file metadata (size, type, classification)

**Acceptance Criteria:**
- [ ] POST /api/upload endpoint functional
- [ ] Accepts multipart/form-data with file + metadata
- [ ] Validates file size (max 10MB)
- [ ] Validates file types (PDF, DOCX, TXT, images)
- [ ] Converts to ZTDF format automatically
- [ ] Generates STANAG 4774 labels
- [ ] Computes SHA-384 integrity hashes
- [ ] Stores in MongoDB with ZTDF structure
- [ ] Returns resourceId and display marking
- [ ] Logs ENCRYPT event per ACP-240
- [ ] TypeScript: 0 errors
- [ ] Integration tests: 10+ new tests

**Reference Files:**
- Existing: `backend/src/utils/ztdf.utils.ts` (ZTDF creation pattern)
- Existing: `backend/src/scripts/migrate-to-ztdf.ts` (ZTDF conversion example)
- Existing: `backend/src/services/resource.service.ts` (MongoDB pattern)
- Existing: `backend/src/utils/acp240-logger.ts` (audit logging)

**NPM Packages Needed:**
```bash
cd backend
npm install multer @types/multer
```

---

### **DAY 4: Secure File Upload (Frontend UI)**

**Goal**: Create intuitive upload UI with security label selection

**Tasks:**

1. **Create Upload Page** (`frontend/src/app/upload/page.tsx`)
   - File selection (drag-and-drop + browse button)
   - Security metadata form:
     - Classification dropdown (UNCLASSIFIED, CONFIDENTIAL, SECRET, TOP_SECRET)
     - Releasability multi-select (USA, GBR, FRA, CAN, DEU, etc.)
     - COI multi-select (NATO-COSMIC, FVEY, CAN-US, US-ONLY)
     - Caveats (NOFORN, RELIDO, PROPIN)
     - Title (required)
     - Description (optional)
   - Upload progress indicator
   - STANAG 4774 display marking preview
   - Success/error feedback

2. **Create Upload Component** (`frontend/src/components/upload/file-uploader.tsx`)
   - Drag-and-drop zone
   - File type validation (client-side)
   - File size validation (client-side, max 10MB)
   - Preview of file details (name, size, type)
   - Remove/cancel functionality

3. **Create Security Label Form** (`frontend/src/components/upload/security-label-form.tsx`)
   - Classification selector (required)
   - Country multi-selector with ISO 3166-1 alpha-3 codes
   - COI multi-selector
   - Caveats selector
   - Real-time display marking generation
   - Validation (classification ≤ user clearance)
   - Warning if user classifies above their clearance

4. **Add Upload Link to Navigation**
   - Add "Upload Document" link to dashboard
   - Show only to authenticated users
   - Badge with "🔒 ACP-240 Compliant"

5. **Success/Error Handling**
   - Success: Redirect to resource detail page
   - Error: Display detailed error message
   - Validation: Client-side + server-side

**Acceptance Criteria:**
- [ ] Upload page accessible at `/upload`
- [ ] Drag-and-drop file upload working
- [ ] Security label form validates inputs
- [ ] Display marking previews in real-time
- [ ] Client-side validation (file size, type)
- [ ] Upload progress indicator shown
- [ ] Success redirects to new resource page
- [ ] Errors display with helpful messages
- [ ] TypeScript: 0 errors
- [ ] Matches DIVE V3 design system

**Reference Files:**
- Existing: `frontend/src/app/resources/page.tsx` (UI pattern)
- Existing: `backend/src/types/ztdf.types.ts` (ClassificationLevel type)
- Existing: `policies/fuel_inventory_abac_policy.rego` (valid_country_codes)

**NPM Packages Needed:**
```bash
cd frontend
npm install react-dropzone --legacy-peer-deps
```

---

### **DAY 5: Enhanced Policy Viewer & OPA Tests**

**Goal**: Add policy testing interface and comprehensive test coverage

**Tasks:**

1. **Enhance Policy Detail Page**
   - Add "Test This Policy" interactive section
   - Pre-populate with example inputs
   - Show evaluation_details in structured format
   - Add "Copy as cURL" button for API testing

2. **Create Policy Test Cases Display**
   - Show existing test cases from `policies/tests/`
   - Display test pass/fail status
   - Link test inputs to policy rules

3. **Add OPA Policy Tests for New Features**
   - Create `policies/tests/policy_management_tests.rego`
   - 5+ tests for policy exposure (read-only verification)
   - Create `policies/tests/upload_authorization_tests.rego`
   - 10+ tests for upload authorization scenarios:
     - Upload allowed if classification ≤ user clearance
     - Upload denied if user lacks clearance
     - Upload requires authentication
     - Uploaded resource inherits user's country (default)
     - Uploaded resource requires valid releasabilityTo

4. **Create Integration Tests** (`backend/src/__tests__/upload.test.ts`)
   - Test file upload endpoint
   - Test ZTDF conversion
   - Test integrity validation
   - Test security label application
   - Test authorization (user can't upload above clearance)

**Acceptance Criteria:**
- [ ] Policy viewer shows test cases
- [ ] Interactive policy tester working
- [ ] 15+ new OPA tests created (5 policy + 10 upload)
- [ ] Integration tests: 10+ new tests
- [ ] All tests passing (target: 102+ total OPA tests)
- [ ] TypeScript: 0 errors

**Reference Files:**
- Existing: `policies/tests/acp240_compliance_tests.rego` (test pattern)
- Existing: `backend/src/__tests__/session-lifecycle.test.ts` (integration test pattern)

---

### **DAY 6: Security Enhancements & Complete Testing**

**Goal**: Harden upload security, finalize testing, prepare for deployment

**Tasks:**

1. **Upload Security Hardening**
   - File type validation (magic number checking, not just extension)
   - Content scanning placeholder (integrate with antivirus API in production)
   - Filename sanitization (remove special characters)
   - Metadata sanitization (XSS prevention)
   - Classification enforcement (user can't upload above their clearance)

2. **Enhance Upload Authorization**
   - Check user clearance before allowing upload at specific level
   - Validate releasabilityTo includes user's country
   - Log ACCESS_DENIED for uploads above clearance

3. **Add Upload Audit Events**
   - ENCRYPT event on successful upload
   - ACCESS_MODIFIED event on ZTDF creation
   - Include comprehensive metadata (uploader, classification, size, type)

4. **Update OPA Policy for Upload Authorization**
   - Add `action.operation == "upload"` handling
   - Verify user clearance ≥ uploaded resource classification
   - Create `is_upload_above_clearance` violation check

5. **Run Complete Test Suite**
   - OPA tests: Target 102+ (87 existing + 15 new)
   - TypeScript: 0 errors (all services)
   - Integration tests: Target 50+ (40 existing + 10 upload)
   - Manual testing: Upload flow end-to-end

6. **Update CI/CD**
   - Add upload integration tests to GitHub Actions
   - Verify test coverage thresholds
   - Update success criteria (102+ OPA tests)

**Acceptance Criteria:**
- [ ] Upload authorization enforced via OPA
- [ ] User cannot upload above their clearance
- [ ] File magic number validation implemented
- [ ] Filename sanitization working
- [ ] OPA tests: 102+ passing
- [ ] Integration tests: 50+ passing
- [ ] GitHub Actions CI/CD passing (all 6 jobs)
- [ ] Manual testing complete

**Reference Files:**
- Existing: `policies/fuel_inventory_abac_policy.rego` (extend with upload rules)
- Existing: `backend/src/utils/acp240-logger.ts` (audit logging pattern)
- Existing: `.github/workflows/ci.yml` (CI/CD configuration)

---

## 🔒 SECURITY REQUIREMENTS (ACP-240 Compliance)

### File Upload Security

**Mandatory Requirements:**
1. **Authentication**: All uploads require valid JWT token
2. **Authorization**: OPA policy check before upload (user clearance ≥ classification)
3. **ZTDF Conversion**: All uploads automatically converted to ZTDF
4. **Integrity Hashing**: SHA-384 hashes for policy and payload
5. **Security Labels**: STANAG 4774 labels applied
6. **Encryption**: AES-256-GCM encryption with DEK/KAO
7. **Audit Logging**: ENCRYPT event logged per ACP-240
8. **Fail-Closed**: Deny upload on any validation failure

**File Validation:**
- **Size Limit**: 10MB (configurable via env: `MAX_UPLOAD_SIZE_MB`)
- **Type Validation**: Magic number check + MIME type
- **Allowed Types**:
  - Documents: `application/pdf`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
  - Text: `text/plain`, `text/markdown`
  - Images: `image/png`, `image/jpeg`, `image/gif`
- **Blocked Types**: Executables, scripts, archives (security risk)

**Metadata Validation:**
- **Classification**: Must be one of 4 valid levels
- **ReleasabilityTo**: Must contain valid ISO 3166-1 alpha-3 codes
- **COI**: Optional, must be from known set
- **Caveats**: Optional, must be from known set
- **Title**: Required, max 200 characters, sanitize HTML

**Upload Authorization Rules:**
```rego
# User can only upload at or below their clearance
is_upload_above_clearance := msg if {
  input.action.operation == "upload"
  user_level := clearance_levels[input.subject.clearance]
  resource_level := clearance_levels[input.resource.classification]
  user_level < resource_level
  msg := sprintf("Cannot upload %s document with %s clearance", [
    input.resource.classification,
    input.subject.clearance
  ])
}

# Upload requires releasabilityTo includes uploader's country
is_upload_not_releasable_to_uploader := msg if {
  input.action.operation == "upload"
  count(input.resource.releasabilityTo) > 0
  not input.subject.countryOfAffiliation in input.resource.releasabilityTo
  msg := sprintf("Upload releasabilityTo must include uploader country: %s", [
    input.subject.countryOfAffiliation
  ])
}
```

---

## 📊 TESTING REQUIREMENTS

### OPA Policy Tests (Target: 102+ Total)

**Existing Tests (87):**
- Week 2: 53 comprehensive tests
- Week 3: 25 negative/validation tests
- Week 3.1: 9 ACP-240 compliance tests

**New Tests Required (15+):**

**Policy Management Tests (5):**
1. test_policy_list_returns_metadata
2. test_policy_content_readable
3. test_policy_test_decision_functional
4. test_unauthenticated_cannot_view_policies
5. test_policy_evaluation_details_complete

**Upload Authorization Tests (10+):**
1. test_upload_allowed_at_user_clearance_level
2. test_upload_allowed_below_user_clearance
3. test_upload_denied_above_user_clearance
4. test_upload_requires_authentication
5. test_upload_releasability_must_include_uploader_country
6. test_upload_creates_valid_ztdf_object
7. test_upload_generates_stanag_4774_label
8. test_upload_computes_integrity_hashes
9. test_upload_logs_encrypt_event
10. test_upload_denied_invalid_classification

### Integration Tests (Target: 50+ Total)

**Existing Integration Tests (40):**
- Authorization flow tests
- Session lifecycle tests
- Multi-IdP tests

**New Integration Tests Required (10+):**

**Upload Tests (8):**
1. POST /api/upload with valid PDF → 201 Created
2. POST /api/upload with 11MB file → 413 Payload Too Large
3. POST /api/upload with .exe file → 400 Bad Request
4. POST /api/upload without auth → 401 Unauthorized
5. POST /api/upload SECRET by CONFIDENTIAL user → 403 Forbidden
6. Verify uploaded resource accessible via GET /api/resources/:id
7. Verify ZTDF integrity validation on uploaded resource
8. Verify STANAG 4774 label on uploaded resource

**Policy API Tests (2):**
1. GET /api/policies → 200 OK with policy list
2. POST /api/policies/:id/test → 200 OK with decision

### Manual Testing Checklist

**Policy Viewer:**
- [ ] Navigate to `/policies` and see policy list
- [ ] Click policy and view Rego source code
- [ ] Use interactive tester with various inputs
- [ ] Verify evaluation_details display

**File Upload:**
- [ ] Navigate to `/upload` page
- [ ] Drag and drop a PDF file
- [ ] Select classification, releasability, COI
- [ ] Preview display marking
- [ ] Submit upload
- [ ] Verify redirect to new resource
- [ ] Verify STANAG 4774 label displays
- [ ] Verify resource accessible via `/resources/:id`

**Upload Authorization:**
- [ ] Login as CONFIDENTIAL user
- [ ] Try to upload SECRET document → denied
- [ ] Upload CONFIDENTIAL document → success
- [ ] Logout and verify resource access follows normal authz

**Error Handling:**
- [ ] Upload 11MB file → error message
- [ ] Upload .exe file → error message
- [ ] Upload without classification → validation error
- [ ] Upload with invalid country code → validation error

---

## 🎨 UI/UX REQUIREMENTS

### Policy Viewer Design

**Policy List Page:**
```
┌─────────────────────────────────────────────────┐
│ 📜 Authorization Policies                       │
│                                                  │
│ ┌────────────────────────────────────────────┐ │
│ │ Fuel Inventory ABAC Policy              v1.0│ │
│ │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │ │
│ │ Rules: 7  Tests: 87  Status: ✅ Active     │ │
│ │ Last Modified: Oct 12, 2025                 │ │
│ │                                              │ │
│ │ Enforces clearance, releasability, COI,     │ │
│ │ embargo, and ZTDF integrity checks          │ │
│ │                                              │ │
│ │ [View Policy] [Test Decision]               │ │
│ └────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

**Policy Detail Page:**
```
┌─────────────────────────────────────────────────┐
│ ← Back to Policies                              │
│                                                  │
│ Fuel Inventory ABAC Policy v1.0                │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                  │
│ 📊 Policy Statistics                            │
│ • 7 Authorization Rules                         │
│ • 87 Test Cases (100% passing)                  │
│ • Fail-secure pattern (default deny)            │
│                                                  │
│ 📝 Policy Source (Rego)                         │
│ ┌────────────────────────────────────────────┐ │
│ │ package dive.authorization                  │ │
│ │                                              │ │
│ │ default allow := false                       │ │
│ │                                              │ │
│ │ allow if {                                   │ │
│ │   not is_not_authenticated                   │ │
│ │   not is_insufficient_clearance              │ │
│ │   ...                                         │ │
│ └────────────────────────────────────────────┘ │
│                                                  │
│ 🧪 Test This Policy                             │
│ [Interactive Tester Component]                  │
└─────────────────────────────────────────────────┘
```

### Upload Page Design

```
┌─────────────────────────────────────────────────┐
│ 📤 Upload Classified Document                   │
│ 🛡️ ACP-240 Compliant • ZTDF Format             │
│                                                  │
│ Step 1: Select File                             │
│ ┌────────────────────────────────────────────┐ │
│ │  📁 Drag and drop file here                 │ │
│ │     or click to browse                       │ │
│ │                                              │ │
│ │  Accepted: PDF, DOCX, TXT, Images           │ │
│ │  Max size: 10 MB                            │ │
│ └────────────────────────────────────────────┘ │
│                                                  │
│ Step 2: Set Security Classification            │
│ Classification: [▼ SECRET           ]           │
│ Releasability: [☑ USA ☑ GBR ☐ FRA ☐ CAN]      │
│ COI:           [☑ FVEY ☐ NATO-COSMIC]          │
│ Caveats:       [☐ NOFORN ☐ RELIDO]             │
│                                                  │
│ Title:         [________________________]        │
│ Description:   [________________________]        │
│                                                  │
│ Display Marking Preview:                        │
│ ┌────────────────────────────────────────────┐ │
│ │ 🛡️ SECRET//FVEY//REL USA, GBR             │ │
│ └────────────────────────────────────────────┘ │
│                                                  │
│ ⚠️ Note: You can only classify up to your      │
│    clearance level (YOUR LEVEL: SECRET)         │
│                                                  │
│ [Cancel] [Upload Document 🔒]                   │
└─────────────────────────────────────────────────┘
```

**Color Scheme:**
- Unclassified: Green
- Confidential: Yellow
- Secret: Orange
- Top Secret: Red

**User Feedback:**
- Loading: Spinner with "Encrypting and uploading..."
- Success: Green banner "✅ Document uploaded successfully"
- Error: Red banner with specific error message

---

## 📝 API SPECIFICATIONS

### Policy Management API

**GET /api/policies**
```json
Response 200:
{
  "policies": [
    {
      "policyId": "fuel_inventory_abac_policy",
      "name": "Fuel Inventory ABAC Policy",
      "description": "Coalition ICAM authorization with clearance, releasability, COI, embargo checks",
      "version": "1.0",
      "package": "dive.authorization",
      "ruleCount": 7,
      "testCount": 87,
      "lastModified": "2025-10-12T10:00:00Z",
      "status": "active"
    }
  ],
  "count": 1
}
```

**GET /api/policies/:id**
```json
Response 200:
{
  "policyId": "fuel_inventory_abac_policy",
  "name": "Fuel Inventory ABAC Policy",
  "content": "package dive.authorization\n\ndefault allow := false\n...",
  "syntax": "rego",
  "lines": 380,
  "rules": [
    "allow",
    "is_not_authenticated",
    "is_insufficient_clearance",
    "is_not_releasable_to_country",
    "is_coi_violation",
    "is_under_embargo",
    "is_ztdf_integrity_violation"
  ],
  "metadata": {
    "version": "1.0",
    "testCount": 87,
    "lastModified": "2025-10-12T10:00:00Z"
  }
}
```

**POST /api/policies/:id/test**
```json
Request:
{
  "input": {
    "subject": {
      "authenticated": true,
      "uniqueID": "test.user",
      "clearance": "SECRET",
      "countryOfAffiliation": "USA",
      "acpCOI": ["FVEY"]
    },
    "action": {"operation": "view"},
    "resource": {
      "resourceId": "doc-test",
      "classification": "SECRET",
      "releasabilityTo": ["USA"],
      "COI": [],
      "encrypted": false
    },
    "context": {
      "currentTime": "2025-10-12T10:00:00Z",
      "sourceIP": "10.0.0.1",
      "deviceCompliant": true,
      "requestId": "test-123"
    }
  }
}

Response 200:
{
  "decision": {
    "allow": true,
    "reason": "Access granted - all conditions satisfied",
    "obligations": [],
    "evaluation_details": {
      "checks": {
        "authenticated": true,
        "required_attributes": true,
        "clearance_sufficient": true,
        "country_releasable": true,
        "coi_satisfied": true,
        "embargo_passed": true,
        "ztdf_integrity_valid": true
      }
    }
  },
  "executionTime": "45ms"
}
```

### Upload API

**POST /api/upload**
```
Content-Type: multipart/form-data

Fields:
- file: <binary> (required)
- classification: string (required) - UNCLASSIFIED|CONFIDENTIAL|SECRET|TOP_SECRET
- releasabilityTo: string[] (required) - ["USA", "GBR", ...]
- COI: string[] (optional) - ["FVEY", "NATO-COSMIC", ...]
- caveats: string[] (optional) - ["NOFORN", "RELIDO", ...]
- title: string (required)
- description: string (optional)

Response 201:
{
  "success": true,
  "resourceId": "doc-user-upload-001",
  "ztdfObjectId": "doc-user-upload-001",
  "displayMarking": "SECRET//FVEY//REL USA, GBR",
  "metadata": {
    "fileSize": 524288,
    "mimeType": "application/pdf",
    "originalFilename": "report.pdf",
    "uploadedAt": "2025-10-12T14:30:00Z",
    "uploadedBy": "john.doe@mil",
    "classification": "SECRET",
    "encrypted": true,
    "ztdf": {
      "version": "1.0",
      "policyHash": "abc123...",
      "payloadHash": "def456...",
      "kaoCount": 1
    }
  }
}

Response 400 (Validation Error):
{
  "error": "Bad Request",
  "message": "Invalid file type",
  "details": {
    "mimeType": "application/x-executable",
    "allowed": ["application/pdf", "text/plain", ...]
  }
}

Response 403 (Authorization Error):
{
  "error": "Forbidden",
  "message": "Cannot upload above your clearance level",
  "details": {
    "userClearance": "CONFIDENTIAL",
    "requestedClassification": "SECRET",
    "reason": "Upload classification must be ≤ user clearance"
  }
}

Response 413 (File Too Large):
{
  "error": "Payload Too Large",
  "message": "File size exceeds maximum allowed",
  "details": {
    "fileSize": 11534336,
    "maxSize": 10485760,
    "maxSizeMB": 10
  }
}
```

---

## 🔧 IMPLEMENTATION PATTERNS

### File Upload Flow

```
1. Frontend: User selects file + security metadata
   └─> Validate: Size (<10MB), Type (allowed), Classification (≤ user clearance)
   
2. Frontend: POST /api/upload (multipart/form-data)
   └─> Authorization: Bearer <JWT>
   
3. Backend: Upload Middleware
   └─> Multer: Parse multipart form
   └─> Validate: File size, file type (magic number)
   └─> Validate: Metadata (classification, releasability)
   
4. Backend: Upload Controller
   └─> Extract user attributes from JWT
   └─> Check authorization via OPA (action: "upload")
   └─> If denied: Return 403
   
5. Backend: Upload Service
   └─> Read file buffer
   └─> Encrypt with AES-256-GCM (generate DEK)
   └─> Create STANAG 4774 security label
   └─> Build ZTDF object (manifest, policy, payload)
   └─> Compute SHA-384 hashes (STANAG 4778)
   └─> Create Key Access Object (KAO)
   
6. Backend: Resource Service
   └─> Store ZTDF resource in MongoDB
   └─> Log ENCRYPT event (ACP-240)
   
7. Backend: Return success response
   └─> resourceId, displayMarking, metadata
   
8. Frontend: Redirect to /resources/:id
   └─> User sees newly uploaded document
```

### ZTDF Creation for Upload

```typescript
// Pattern from migrate-to-ztdf.ts (lines 153-238)
async function convertUploadToZTDF(
  fileBuffer: Buffer,
  metadata: IUploadMetadata,
  uploader: string
): Promise<IZTDFObject> {
  
  // 1. Encrypt content
  const encryptionResult = encryptContent(fileBuffer.toString('base64'));
  
  // 2. Create manifest
  const manifest = createZTDFManifest({
    objectId: `doc-upload-${Date.now()}`,
    objectType: 'uploaded-document',
    owner: uploader,
    ownerOrganization: 'DIVE-V3',
    contentType: metadata.mimeType,
    payloadSize: fileBuffer.length
  });
  
  // 3. Create security label
  const securityLabel = createSecurityLabel({
    classification: metadata.classification,
    releasabilityTo: metadata.releasabilityTo,
    COI: metadata.COI,
    caveats: metadata.caveats,
    originatingCountry: metadata.uploaderCountry,
    creationDate: new Date().toISOString()
  });
  
  // 4. Create policy
  const policy = createZTDFPolicy({
    securityLabel,
    policyAssertions: [
      { type: 'clearance-required', value: metadata.classification },
      { type: 'releasability-required', value: metadata.releasabilityTo },
      { type: 'uploaded-by', value: uploader }
    ]
  });
  
  // 5. Create KAO
  const kao = createKeyAccessObject(encryptionResult.dek, {
    clearanceRequired: metadata.classification,
    countriesAllowed: metadata.releasabilityTo,
    coiRequired: metadata.COI
  });
  
  // 6. Create payload
  const chunk = createEncryptedChunk({
    chunkId: 0,
    encryptedData: encryptionResult.encryptedData
  });
  
  const payload = createZTDFPayload({
    encryptionAlgorithm: 'AES-256-GCM',
    iv: encryptionResult.iv,
    authTag: encryptionResult.authTag,
    keyAccessObjects: [kao],
    encryptedChunks: [chunk]
  });
  
  // 7. Return ZTDF object
  return createZTDFObject({ manifest, policy, payload });
}
```

---

## 🧪 TESTING STRATEGY

### Test-Driven Development Approach

**Phase 1: Write OPA Tests First**
1. Create `policies/tests/upload_authorization_tests.rego`
2. Write 10 tests for upload scenarios (all should FAIL initially)
3. Run `opa test policies/` (expect failures)
4. Add upload rules to `fuel_inventory_abac_policy.rego`
5. Run tests again (expect all PASS)

**Phase 2: Write Integration Tests**
1. Create `backend/src/__tests__/upload.test.ts`
2. Write tests for upload endpoint
3. Mock Multer file objects
4. Test ZTDF conversion
5. Test authorization enforcement

**Phase 3: Manual Testing**
1. Test UI flow end-to-end
2. Test various file types
3. Test error scenarios
4. Verify audit logs

### Test Data

**Valid Upload Request:**
```json
{
  "file": "<PDF binary>",
  "classification": "SECRET",
  "releasabilityTo": ["USA", "GBR"],
  "COI": ["FVEY"],
  "title": "Operational Report October 2025",
  "description": "Monthly intelligence summary"
}
```

**Upload Test Users:**
- `testuser-us` (SECRET, USA) → Can upload up to SECRET
- `testuser-us-confid` (CONFIDENTIAL, USA) → Can upload up to CONFIDENTIAL
- `testuser-us-unclass` (UNCLASSIFIED, USA) → Can upload UNCLASSIFIED only

---

## 🚨 CRITICAL SUCCESS CRITERIA

### Must-Have Requirements (Week 3.2)

**Policy Viewer:**
- [ ] Backend exposes OPA policy via REST API
- [ ] Frontend displays policy source code
- [ ] Interactive policy tester functional
- [ ] TypeScript: 0 errors

**File Upload:**
- [ ] Upload endpoint accepts multipart/form-data
- [ ] Converts to ZTDF format automatically
- [ ] Applies STANAG 4774/4778 compliance
- [ ] Enforces upload authorization (clearance check)
- [ ] Logs ENCRYPT events per ACP-240
- [ ] TypeScript: 0 errors

**Testing:**
- [ ] OPA tests: 102+ passing (87 + 15 new)
- [ ] Integration tests: 50+ passing (40 + 10 new)
- [ ] Manual testing: All scenarios verified
- [ ] GitHub Actions CI/CD: 100% passing (all 6 jobs)

**Documentation:**
- [ ] README.md updated with Week 3.2 features
- [ ] CHANGELOG.md comprehensive entry
- [ ] API documentation for new endpoints
- [ ] User guide for upload feature

**Quality:**
- [ ] Zero TypeScript errors (all services)
- [ ] Zero lint errors
- [ ] No security vulnerabilities (npm audit)
- [ ] Clean git commits
- [ ] All code reviewed and documented

---

## 📦 DELIVERABLES

### Code Files (Estimated: 15+ new, 5 modified)

**Backend (10 new + 3 modified):**
- `backend/src/services/policy.service.ts` (NEW, ~200 lines)
- `backend/src/controllers/policy.controller.ts` (NEW, ~150 lines)
- `backend/src/routes/policy.routes.ts` (NEW, ~50 lines)
- `backend/src/types/policy.types.ts` (NEW, ~100 lines)
- `backend/src/services/upload.service.ts` (NEW, ~300 lines)
- `backend/src/controllers/upload.controller.ts` (NEW, ~200 lines)
- `backend/src/routes/upload.routes.ts` (NEW, ~60 lines)
- `backend/src/middleware/upload.middleware.ts` (NEW, ~150 lines)
- `backend/src/types/upload.types.ts` (NEW, ~150 lines)
- `backend/src/__tests__/upload.test.ts` (NEW, ~250 lines)
- MODIFY: `backend/src/server.ts` (add routes)
- MODIFY: `backend/src/utils/acp240-logger.ts` (add upload events)
- MODIFY: `backend/package.json` (add multer)

**Frontend (5 new + 2 modified):**
- `frontend/src/app/policies/page.tsx` (NEW, ~150 lines)
- `frontend/src/app/policies/[id]/page.tsx` (NEW, ~250 lines)
- `frontend/src/app/upload/page.tsx` (NEW, ~300 lines)
- `frontend/src/components/upload/file-uploader.tsx` (NEW, ~200 lines)
- `frontend/src/components/upload/security-label-form.tsx` (NEW, ~250 lines)
- MODIFY: `frontend/src/app/dashboard/page.tsx` (add links)
- MODIFY: `frontend/package.json` (add react-dropzone)

**OPA (2 new + 1 modified):**
- `policies/tests/policy_management_tests.rego` (NEW, ~150 lines)
- `policies/tests/upload_authorization_tests.rego` (NEW, ~350 lines)
- MODIFY: `policies/fuel_inventory_abac_policy.rego` (add upload rules)

**CI/CD (1 modified):**
- MODIFY: `.github/workflows/ci.yml` (update test thresholds)

**Documentation (3 new):**
- `WEEK3.2-IMPLEMENTATION-COMPLETE.md` (NEW)
- `WEEK3.2-QA-RESULTS.md` (NEW)
- `docs/API-DOCUMENTATION.md` (NEW)

**Total Expected:**
- 15 new files (~2,600 lines)
- 8 modified files
- 102+ OPA tests (87 existing + 15 new)
- 50+ integration tests (40 existing + 10 new)

---

## 🎯 ACCEPTANCE CRITERIA CHECKLIST

### Functional Requirements

**Policy Viewer:**
- [ ] Users can view list of OPA policies
- [ ] Users can view policy source code (syntax highlighted)
- [ ] Users can test policy decisions interactively
- [ ] Policy metadata displayed (version, rules, tests)
- [ ] Evaluation details shown in structured format

**File Upload:**
- [ ] Users can upload files via drag-and-drop or browse
- [ ] Security classification form validates inputs
- [ ] Display marking previews in real-time
- [ ] Upload converts to ZTDF automatically
- [ ] STANAG 4774 labels applied
- [ ] SHA-384 integrity hashes computed
- [ ] Uploaded resources appear in resource list
- [ ] Upload authorization enforced (clearance check)

### Non-Functional Requirements

**Performance:**
- [ ] Policy API response: <100ms
- [ ] Upload processing: <5 seconds for 10MB file
- [ ] ZTDF conversion: <500ms
- [ ] No impact on existing endpoints

**Security:**
- [ ] File type validation (magic number + MIME)
- [ ] File size limits enforced
- [ ] Upload authorization via OPA
- [ ] XSS prevention (metadata sanitization)
- [ ] Audit logging (ENCRYPT events)
- [ ] Fail-closed on validation failure

**Quality:**
- [ ] TypeScript: 0 errors (all services)
- [ ] ESLint: 0 errors
- [ ] OPA tests: 102+ passing
- [ ] Integration tests: 50+ passing
- [ ] Manual testing: All scenarios pass
- [ ] Code documentation (TSDoc comments)

**CI/CD:**
- [ ] GitHub Actions: All 6 jobs passing
- [ ] Test coverage threshold met (102+ OPA tests)
- [ ] Build successful (all services)
- [ ] No security vulnerabilities (npm audit)

---

## 📖 IMPLEMENTATION GUIDELINES

### Code Conventions (Per .cursorrules)

**Files:**
- kebab-case: `policy.service.ts`, `upload.controller.ts`
- Components: PascalCase: `PolicyTester.tsx`, `FileUploader.tsx`

**Functions:**
- camelCase: `uploadFile`, `testPolicyDecision`
- Async functions: Always use `async`/`await` pattern

**Interfaces:**
- PascalCase with `I` prefix: `IPolicyMetadata`, `IUploadResult`

**Error Handling:**
- Use try-catch in all async functions
- Log errors with structured logging
- Return detailed error messages to client
- Never expose stack traces in production

### Security Best Practices

**Input Validation:**
```typescript
// Validate classification
const validClassifications = ['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'];
if (!validClassifications.includes(metadata.classification)) {
  throw new Error(`Invalid classification: ${metadata.classification}`);
}

// Validate country codes (use existing valid_country_codes set)
for (const country of metadata.releasabilityTo) {
  if (!VALID_COUNTRIES.includes(country)) {
    throw new Error(`Invalid country code: ${country}`);
  }
}

// Sanitize title (prevent XSS)
const sanitizedTitle = metadata.title
  .replace(/[<>]/g, '')
  .trim()
  .substring(0, 200);
```

**File Type Validation:**
```typescript
import fileType from 'file-type';

// Magic number validation (not just extension)
const type = await fileType.fromBuffer(fileBuffer);
if (!type || !ALLOWED_MIME_TYPES.includes(type.mime)) {
  throw new Error(`Invalid file type: ${type?.mime || 'unknown'}`);
}
```

**Upload Authorization:**
```typescript
// Check via OPA before processing file
const opaInput = {
  input: {
    subject: {
      authenticated: true,
      uniqueID: user.uniqueID,
      clearance: user.clearance,
      countryOfAffiliation: user.countryOfAffiliation,
      acpCOI: user.acpCOI
    },
    action: { operation: 'upload' },
    resource: {
      resourceId: 'pending-upload',
      classification: metadata.classification,
      releasabilityTo: metadata.releasabilityTo,
      COI: metadata.COI || []
    },
    context: {
      currentTime: new Date().toISOString(),
      sourceIP: req.ip,
      deviceCompliant: true,
      requestId
    }
  }
};

const decision = await callOPA(opaInput);
if (!decision.result.allow) {
  throw new ForbiddenError(decision.result.reason);
}
```

---

## 📊 TESTING REQUIREMENTS (COMPREHENSIVE)

### OPA Tests (Target: 102+)

**File Location**: `policies/tests/upload_authorization_tests.rego`

```rego
package dive.authorization_test

# Upload Tests (10+)
test_upload_allowed_at_user_clearance
test_upload_allowed_below_user_clearance
test_upload_denied_above_user_clearance
test_upload_requires_authentication
test_upload_releasability_includes_uploader
test_upload_secret_by_secret_user_allowed
test_upload_topsecret_by_secret_user_denied
test_upload_to_foreign_country_only_denied
test_upload_with_coi_validated
test_upload_missing_classification_denied
```

**File Location**: `policies/tests/policy_management_tests.rego`

```rego
package dive.authorization_test

# Policy Management Tests (5)
test_policy_read_requires_authentication
test_policy_test_decision_functional
test_policy_allows_read_only_access
test_unauthenticated_cannot_test_policy
test_policy_evaluation_includes_details
```

### Integration Tests (Target: 50+)

**File Location**: `backend/src/__tests__/upload.test.ts`

```typescript
describe('Upload API', () => {
  describe('POST /api/upload', () => {
    it('should upload valid PDF and create ZTDF resource', async () => {
      // Test implementation
    });
    
    it('should reject file above 10MB', async () => {
      // Test implementation
    });
    
    it('should reject unauthorized file types', async () => {
      // Test implementation
    });
    
    it('should deny upload above user clearance', async () => {
      // Test implementation
    });
    
    it('should generate valid STANAG 4774 label', async () => {
      // Test implementation
    });
    
    it('should compute SHA-384 integrity hashes', async () => {
      // Test implementation
    });
    
    it('should log ENCRYPT event on success', async () => {
      // Test implementation
    });
    
    it('should validate releasabilityTo includes uploader country', async () => {
      // Test implementation
    });
    
    // 8+ more tests...
  });
});
```

### Manual Testing Scenarios (12 scenarios)

**Policy Viewer (3):**
1. Navigate to `/policies` → See policy list
2. Click policy → View Rego source with syntax highlighting
3. Use interactive tester → See allow/deny decision

**File Upload - Success Scenarios (4):**
4. Upload PDF as SECRET user with SECRET classification → Success
5. Upload DOCX as SECRET user with CONFIDENTIAL classification → Success
6. Upload TXT as CONFIDENTIAL user with CONFIDENTIAL classification → Success
7. Upload image as UNCLASSIFIED user with UNCLASSIFIED classification → Success

**File Upload - Denial Scenarios (5):**
8. Upload as CONFIDENTIAL user with SECRET classification → 403 Forbidden
9. Upload 11MB file → 413 Payload Too Large
10. Upload .exe file → 400 Bad Request (invalid type)
11. Upload without authentication → 401 Unauthorized
12. Upload with invalid country code in releasabilityTo → 400 Bad Request

---

## 🔐 SECURITY CONSIDERATIONS

### File Upload Security (ACP-240 Requirements)

**Mandatory Controls:**
1. **Authentication**: Valid JWT required (Keycloak-signed)
2. **Authorization**: OPA policy check (user clearance ≥ upload classification)
3. **File Validation**: Magic number + MIME type + size limit
4. **Content Sanitization**: Filename sanitization, metadata XSS prevention
5. **Encryption**: Immediate conversion to ZTDF (AES-256-GCM)
6. **Integrity**: SHA-384 hashes (STANAG 4778)
7. **Audit**: ENCRYPT event logged with all metadata
8. **Fail-Closed**: Deny on any validation failure

**Threat Mitigation:**
- **Malware Upload**: File type validation + (future) antivirus scanning
- **Information Leakage**: Authorization check before processing
- **Privilege Escalation**: OPA enforces clearance limits
- **XSS**: Sanitize all user-provided metadata
- **DoS**: File size limits + rate limiting
- **Data Integrity**: Cryptographic hashing

### Upload Authorization Logic

```rego
# Add to fuel_inventory_abac_policy.rego

# Allow upload only if user clearance ≥ upload classification
allow if {
  input.action.operation == "upload"
  not is_not_authenticated
  not is_missing_required_attributes
  not is_upload_above_clearance
  not is_upload_not_releasable_to_uploader
}

is_upload_above_clearance := msg if {
  input.action.operation == "upload"
  user_level := clearance_levels[input.subject.clearance]
  resource_level := clearance_levels[input.resource.classification]
  user_level < resource_level
  msg := sprintf("Cannot upload %s with %s clearance", [
    input.resource.classification,
    input.subject.clearance
  ])
}

is_upload_not_releasable_to_uploader := msg if {
  input.action.operation == "upload"
  count(input.resource.releasabilityTo) > 0
  not input.subject.countryOfAffiliation in input.resource.releasabilityTo
  msg := "Upload must be releasable to uploader's country"
}
```

---

## 📋 STEP-BY-STEP IMPLEMENTATION

### Day 1: Backend Policy API

```bash
# 1. Create policy service
touch backend/src/services/policy.service.ts
# Implement: listPolicies, getPolicyById, testDecision

# 2. Create policy controller
touch backend/src/controllers/policy.controller.ts
# Implement: listPoliciesHandler, getPolicyHandler, testDecisionHandler

# 3. Create policy routes
touch backend/src/routes/policy.routes.ts
# Define: GET /policies, GET /policies/:id, POST /policies/:id/test

# 4. Add to server
# MODIFY: backend/src/server.ts
# Add: app.use('/api/policies', policyRoutes);

# 5. Test
curl http://localhost:4000/api/policies
# Expect: Policy list with metadata
```

### Day 2: Frontend Policy Viewer

```bash
# 1. Create policy list page
touch frontend/src/app/policies/page.tsx
# Implement: Fetch and display policies

# 2. Create policy detail page
touch frontend/src/app/policies/[id]/page.tsx
# Implement: Display Rego source + metadata

# 3. Create policy tester component
touch frontend/src/components/policy/policy-tester.tsx
# Implement: Interactive form + decision display

# 4. Install syntax highlighting
cd frontend
npm install react-syntax-highlighter @types/react-syntax-highlighter --legacy-peer-deps

# 5. Test UI
# Navigate to http://localhost:3000/policies
```

### Day 3: Backend Upload API

```bash
# 1. Install dependencies
cd backend
npm install multer @types/multer file-type

# 2. Create upload service
touch backend/src/services/upload.service.ts
# Implement: uploadFile, validateFile, convertToZTDF

# 3. Create upload controller
touch backend/src/controllers/upload.controller.ts
# Implement: uploadFileHandler with authorization

# 4. Create upload middleware
touch backend/src/middleware/upload.middleware.ts
# Configure Multer + validation

# 5. Create upload routes
touch backend/src/routes/upload.routes.ts
# Define: POST /upload

# 6. Test
curl -X POST http://localhost:4000/api/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test.pdf" \
  -F "classification=SECRET" \
  -F "releasabilityTo=[\"USA\"]" \
  -F "title=Test Document"
```

### Day 4: Frontend Upload UI

```bash
# 1. Install dependencies
cd frontend
npm install react-dropzone --legacy-peer-deps

# 2. Create upload page
touch frontend/src/app/upload/page.tsx
# Implement: File selection + security form

# 3. Create file uploader component
touch frontend/src/components/upload/file-uploader.tsx
# Implement: Drag-and-drop + file validation

# 4. Create security label form
touch frontend/src/components/upload/security-label-form.tsx
# Implement: Classification/releasability/COI selectors

# 5. Test UI
# Navigate to http://localhost:3000/upload
# Upload a test file
```

### Day 5: OPA Tests & Upload Authorization

```bash
# 1. Create upload authorization tests
touch policies/tests/upload_authorization_tests.rego
# Implement: 10+ upload scenario tests

# 2. Add upload rules to policy
# MODIFY: policies/fuel_inventory_abac_policy.rego
# Add: is_upload_above_clearance, is_upload_not_releasable_to_uploader

# 3. Run OPA tests
docker exec dive-v3-opa opa test /policies -v
# Target: 102+ tests passing

# 4. Create integration tests
touch backend/src/__tests__/upload.test.ts
# Implement: 10+ upload endpoint tests

# 5. Run integration tests
cd backend && npm test
```

### Day 6: Final QA & Deployment

```bash
# 1. Run full test suite
docker exec dive-v3-opa opa test /policies
# Verify: 102+ passing

# 2. TypeScript compilation
cd backend && npx tsc --noEmit
cd ../frontend && npx tsc --noEmit
cd ../kas && npx tsc --noEmit
# Verify: 0 errors

# 3. Manual testing
# Test all 12 manual scenarios

# 4. Update documentation
# MODIFY: README.md (add Week 3.2 features)
# MODIFY: CHANGELOG.md (comprehensive entry)

# 5. Commit and push
git add .
git commit -m "feat(week3.2): Policy viewer and secure file upload"
git push origin main

# 6. Verify GitHub Actions
# Check: All 6 jobs pass
```

---

## 🧩 INTEGRATION POINTS

### Existing Systems Integration

**1. Authentication (NextAuth + JWT):**
- Use existing JWT token from session
- Extract user attributes (clearance, country, COI)
- Validate token via Keycloak JWKS (existing pattern)

**2. Authorization (OPA):**
- Call existing OPA decision endpoint
- Use existing IOPAInput interface
- Add new `action.operation == "upload"` handling
- Reuse existing decision caching (60s TTL)

**3. ZTDF (Existing Utilities):**
- Import from `backend/src/utils/ztdf.utils.ts`
- Use `encryptContent()` for file encryption
- Use `createZTDFManifest()`, `createZTDFPolicy()`, `createZTDFPayload()`
- Use `validateZTDFIntegrity()` before storing

**4. MongoDB (Existing Service):**
- Import from `backend/src/services/resource.service.ts`
- Use `createZTDFResource()` to store uploaded file
- Uploaded resources appear in existing resource list

**5. Audit Logging (ACP-240):**
- Import from `backend/src/utils/acp240-logger.ts`
- Call `logEncryptEvent()` on successful upload
- Call `logAccessDeniedEvent()` on authorization failure

**6. Frontend Navigation:**
- Add links to existing dashboard
- Use existing SecureLogoutButton component
- Match existing Tailwind design system

---

## 🚨 CRITICAL NOTES & WARNINGS

### Do NOT Break Existing Functionality
- ✅ All 87 existing OPA tests MUST still pass
- ✅ All existing endpoints MUST remain functional
- ✅ All existing UI pages MUST work unchanged
- ✅ ZTDF migration MUST remain compatible
- ✅ KAS service MUST remain functional

### ACP-240 Compliance (Non-Negotiable)
- ✅ All uploads MUST convert to ZTDF format
- ✅ All uploads MUST have STANAG 4774 labels
- ✅ All uploads MUST have SHA-384 hashes
- ✅ All uploads MUST log ENCRYPT events
- ✅ All uploads MUST enforce fail-closed

### Performance Targets
- Upload processing: <5 seconds for 10MB file
- ZTDF conversion: <500ms
- Policy API: <100ms response time
- No degradation to existing endpoints

### Best Practices
- ✅ Test-driven: Write OPA tests first
- ✅ Type-safe: TypeScript interfaces for all
- ✅ Security-first: Validate everything, fail-closed
- ✅ Documented: TSDoc comments on all functions
- ✅ Clean commits: Conventional commit messages
- ✅ No shortcuts: Follow existing patterns exactly

---

## 📚 DOCUMENTATION REQUIREMENTS

### README.md Updates

Add to "Implementation Timeline" section:
```markdown
### ✅ Week 3.2: Policy Viewer & Secure Upload (Oct 13, 2025)
- [x] OPA policy viewer UI (read-only)
- [x] Interactive policy decision tester
- [x] Secure file upload with ACP-240 compliance
- [x] Automatic ZTDF conversion for uploads
- [x] Upload authorization (clearance enforcement)
- [x] 102+ OPA tests passing
- [x] 50+ integration tests passing
```

### CHANGELOG.md Entry

```markdown
## [Week 3.2] - 2025-10-13

### Added - Policy Viewer & Secure Upload

**OPA Policy Viewer:**
- Policy service and controller (backend/src/services/policy.service.ts, 200 lines)
- Policy viewer UI (frontend/src/app/policies/, 400 lines)
- Interactive policy decision tester
- Syntax-highlighted Rego display
- Policy metadata API (/api/policies)

**Secure File Upload:**
- Upload service with ZTDF conversion (backend/src/services/upload.service.ts, 300 lines)
- Upload controller with authorization (backend/src/controllers/upload.controller.ts, 200 lines)
- Upload UI with drag-and-drop (frontend/src/app/upload/, 550 lines)
- Security label form with validation
- File type validation (magic number + MIME)
- File size limits (10MB)
- Upload authorization via OPA
- ACP-240 audit logging (ENCRYPT events)

**OPA Policy Updates:**
- Upload authorization rules (is_upload_above_clearance, is_upload_not_releasable_to_uploader)
- 15 new tests (5 policy viewer + 10 upload authorization)
- Total: 102 tests (87 + 15)

**Integration Tests:**
- Upload API tests (10 scenarios)
- Policy API tests (2 scenarios)
- Total: 50+ tests (40 + 10)

### Changed
- Server routes (added /api/policies and /api/upload)
- Dashboard navigation (added Policy Viewer and Upload links)
- CI/CD thresholds (102+ OPA tests required)

### Security
- Upload authorization enforced (user can only upload ≤ clearance)
- File type validation (magic number verification)
- Metadata sanitization (XSS prevention)
- ZTDF automatic conversion
- ENCRYPT event logging per ACP-240
```

---

## 🎯 SUCCESS CRITERIA (FINAL CHECKLIST)

### Must Pass Before Completion

**Functional (100%):**
- [ ] Policy viewer shows current OPA policy
- [ ] Policy tester allows interactive testing
- [ ] Upload accepts files and creates ZTDF resources
- [ ] Upload authorization enforced
- [ ] Uploaded resources accessible via /resources/:id
- [ ] STANAG 4774 labels on uploaded resources

**Testing (100%):**
- [ ] OPA tests: 102+ passing (0 failures)
- [ ] Integration tests: 50+ passing
- [ ] TypeScript: 0 errors (Backend, Frontend, KAS)
- [ ] Manual testing: All 12 scenarios pass
- [ ] GitHub Actions: All 6 jobs passing

**Security (100%):**
- [ ] File type validation working
- [ ] File size limits enforced
- [ ] Upload authorization via OPA
- [ ] ZTDF conversion automatic
- [ ] SHA-384 hashes computed
- [ ] Audit logging functional

**Quality (100%):**
- [ ] Code documented (TSDoc comments)
- [ ] Clean git history
- [ ] README.md updated
- [ ] CHANGELOG.md updated
- [ ] No console errors in browser
- [ ] No TypeScript/ESLint errors

**CI/CD (100%):**
- [ ] All 6 GitHub Actions jobs passing
- [ ] Test coverage thresholds met
- [ ] Build successful
- [ ] No security vulnerabilities

---

## 📞 QUICK REFERENCE

### Key Commands

```bash
# Start environment
docker-compose up -d
cd backend && npm run dev
cd frontend && npm run dev

# Run OPA tests
docker exec dive-v3-opa opa test /policies -v

# Run integration tests
cd backend && npm test

# Check TypeScript
npx tsc --noEmit (in backend, frontend, kas)

# View audit logs
tail -f backend/logs/authz.log
tail -f kas/logs/kas-audit.log

# Test upload
curl -X POST http://localhost:4000/api/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test.pdf" \
  -F "classification=SECRET" \
  -F "releasabilityTo=USA,GBR" \
  -F "title=Test Upload"
```

### Critical Files to Reference

**ZTDF Implementation:**
- `backend/src/types/ztdf.types.ts` (type definitions)
- `backend/src/utils/ztdf.utils.ts` (utilities)
- `backend/src/scripts/migrate-to-ztdf.ts` (conversion example)

**Existing Patterns:**
- `backend/src/controllers/resource.controller.ts` (controller pattern)
- `backend/src/services/resource.service.ts` (service pattern)
- `backend/src/middleware/authz.middleware.ts` (OPA integration)
- `frontend/src/app/resources/[id]/page.tsx` (detail page pattern)

**OPA Policy:**
- `policies/fuel_inventory_abac_policy.rego` (main policy)
- `policies/tests/acp240_compliance_tests.rego` (test pattern)

**CI/CD:**
- `.github/workflows/ci.yml` (pipeline configuration)

---

## 🚀 DELIVERABLE

**Week 3.2 Complete** with:
- ✅ OPA policy viewer (read-only) with interactive tester
- ✅ Secure file upload with ACP-240 compliance
- ✅ Automatic ZTDF conversion for uploads
- ✅ Upload authorization (clearance enforcement)
- ✅ 102+ OPA tests passing (87 + 15 new)
- ✅ 50+ integration tests passing
- ✅ GitHub Actions CI/CD passing (all 6 jobs)
- ✅ README and CHANGELOG updated
- ✅ Zero TypeScript errors
- ✅ Production-ready code

**Status**: Ready for Week 4 E2E testing and demos

---

## 📖 APPENDIX: EXAMPLE CODE SNIPPETS

### Backend: Upload Service (Skeleton)

```typescript
// backend/src/services/upload.service.ts
import { Buffer } from 'buffer';
import fileType from 'file-type';
import { IZTDFResource } from '../types/ztdf.types';
import { migrateLegacyResourceToZTDF, encryptContent } from '../utils/ztdf.utils';
import { createZTDFResource } from './resource.service';
import { logger } from '../utils/logger';

const MAX_FILE_SIZE = parseInt(process.env.MAX_UPLOAD_SIZE_MB || '10') * 1024 * 1024;
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'image/png',
  'image/jpeg',
  'image/gif'
];

export async function uploadFile(
  fileBuffer: Buffer,
  metadata: IUploadMetadata,
  uploader: IUploaderInfo
): Promise<IUploadResult> {
  
  // 1. Validate file size
  if (fileBuffer.length > MAX_FILE_SIZE) {
    throw new Error(`File size ${fileBuffer.length} exceeds maximum ${MAX_FILE_SIZE}`);
  }
  
  // 2. Validate file type (magic number)
  const type = await fileType.fromBuffer(fileBuffer);
  if (!type || !ALLOWED_MIME_TYPES.includes(type.mime)) {
    throw new Error(`Invalid file type: ${type?.mime || 'unknown'}`);
  }
  
  // 3. Sanitize metadata
  const sanitizedTitle = sanitizeTitle(metadata.title);
  
  // 4. Create ZTDF object
  const ztdfObject = await convertUploadToZTDF(fileBuffer, metadata, uploader);
  
  // 5. Store in MongoDB
  const ztdfResource: IZTDFResource = {
    resourceId: ztdfObject.manifest.objectId,
    title: sanitizedTitle,
    ztdf: ztdfObject,
    legacy: {
      classification: metadata.classification,
      releasabilityTo: metadata.releasabilityTo,
      COI: metadata.COI || [],
      encrypted: true,
      // ... other fields
    }
  };
  
  await createZTDFResource(ztdfResource);
  
  // 6. Log ENCRYPT event
  logEncryptEvent({
    requestId: metadata.requestId,
    subject: uploader.uniqueID,
    resourceId: ztdfObject.manifest.objectId,
    classification: metadata.classification
  });
  
  // 7. Return result
  return {
    success: true,
    resourceId: ztdfResource.resourceId,
    ztdfObjectId: ztdfObject.manifest.objectId,
    displayMarking: ztdfObject.policy.securityLabel.displayMarking || '',
    metadata: {
      fileSize: fileBuffer.length,
      mimeType: type.mime,
      uploadedAt: new Date().toISOString(),
      uploadedBy: uploader.uniqueID
    }
  };
}
```

### Frontend: Upload Page (Skeleton)

```typescript
// frontend/src/app/upload/page.tsx
'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import FileUploader from '@/components/upload/file-uploader';
import SecurityLabelForm from '@/components/upload/security-label-form';

export default function UploadPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState({
    classification: 'UNCLASSIFIED',
    releasabilityTo: ['USA'],
    COI: [],
    title: '',
    description: ''
  });
  const [uploading, setUploading] = useState(false);

  const handleUpload = async () => {
    if (!file || !session?.accessToken) return;
    
    setUploading(true);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('classification', metadata.classification);
      formData.append('releasabilityTo', JSON.stringify(metadata.releasabilityTo));
      formData.append('COI', JSON.stringify(metadata.COI));
      formData.append('title', metadata.title);
      
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.accessToken}`
        },
        body: formData
      });
      
      if (!response.ok) {
        throw new Error('Upload failed');
      }
      
      const result = await response.json();
      router.push(`/resources/${result.resourceId}`);
      
    } catch (error) {
      console.error('Upload error:', error);
      // Show error message
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* UI implementation */}
    </div>
  );
}
```

---

## 🎓 LEARNING OBJECTIVES

By completing Week 3.2, you will have implemented:

1. **Policy Transparency**: Users can understand authorization logic
2. **Policy Testing**: Interactive decision testing
3. **Secure Upload**: ACP-240-compliant file upload
4. **ZTDF Automation**: Automatic conversion of uploaded files
5. **Upload Authorization**: OPA-enforced clearance limits
6. **Complete Audit Trail**: All uploads logged per ACP-240

**Skills Demonstrated:**
- Full-stack development (Express + Next.js)
- File handling (Multer + Buffer processing)
- OPA policy authoring (Rego)
- ACP-240 compliance implementation
- Test-driven development
- CI/CD pipeline management

---

## 📝 FINAL COMMIT MESSAGE TEMPLATE

```
feat(week3.2): Policy viewer and secure file upload with ACP-240 compliance

Policy Viewer:
- Add policy service and controller (read-only access)
- Add policy viewer UI with syntax highlighting
- Add interactive policy decision tester
- Display policy metadata and test results

Secure File Upload:
- Add upload service with ZTDF conversion
- Add upload controller with authorization enforcement
- Add upload UI with drag-and-drop and security label form
- File validation (type, size, magic number)
- Metadata sanitization (XSS prevention)
- Upload authorization via OPA (clearance limits)
- ACP-240 audit logging (ENCRYPT events)

OPA Policy Updates:
- Add upload authorization rules
- Add is_upload_above_clearance violation check
- Add is_upload_not_releasable_to_uploader check
- 15 new tests (5 policy + 10 upload)
- Total: 102 tests (87 + 15)

Integration Tests:
- Add 10 upload endpoint tests
- Add 2 policy API tests
- Total: 50+ tests (40 + 10)

Files Created: 15 (~2,600 lines)
Files Modified: 8
OPA Tests: 102/102 PASSING (100%)
Integration Tests: 50+ PASSING
TypeScript: 0 errors

Status: Production-ready with policy management and secure upload

Ref: ACP240-llms.txt (sections 4-6), STANAG 4774/4778
```

---

## ✅ PRE-FLIGHT CHECKLIST (Before Starting)

- [ ] Read ACP240-llms.txt sections 4-6
- [ ] Review backend/src/types/ztdf.types.ts
- [ ] Review backend/src/utils/ztdf.utils.ts
- [ ] Review policies/fuel_inventory_abac_policy.rego
- [ ] Understand current test count: 87 OPA tests
- [ ] Verify services running (docker-compose ps)
- [ ] Verify current commit: 17f5ef9
- [ ] Clone repository or pull latest main branch

---

**END OF WEEK 3.2 IMPLEMENTATION PROMPT**

**Ready to start**: This prompt provides complete context for a new chat session  
**Estimated effort**: 3-4 days (6 development phases)  
**Success criteria**: 102+ tests, 0 errors, CI/CD passing, production deployed  
**Next**: Use this prompt to begin Week 3.2 implementation in a new conversation

🚀 **Good luck with Week 3.2 implementation!** 🛡️

