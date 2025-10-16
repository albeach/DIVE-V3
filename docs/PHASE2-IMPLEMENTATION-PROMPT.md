# Phase 2 Implementation Prompt

**FOR USE IN NEW CHAT SESSION**  
**Date Created:** 2025-10-16  
**Prerequisites:** Phase 0 ✅ + Phase 1 ✅ Complete

---

## CONTEXT: Phase 0 & Phase 1 Completion

### Phase 0: Observability Baseline ✅ (Merged to main)

**Branch:** `main` (merged from `feature/phase0-hardening-observability`)  
**Commit:** `731123d`

**Delivered:**
- Prometheus metrics service (`backend/src/services/metrics.service.ts`)
- Service Level Objectives (`docs/SLO.md`)
- Security baseline (Next.js 15.4.6 → 15.5.4, fixed CRITICAL CVE)
- IdP selector improvements (Industry flag, direct login)
- Documentation (7 guides, 2,795 lines)

**Files:** 23 files changed, +8,321 lines

---

### Phase 1: Automated Security Validation ✅ (Merged to main)

**Branch:** `main` (merged from `feature/phase1-validation-services`)  
**Commits:** `aada417` (merge) + 8 follow-up commits  
**Final Test Status:** **22/22 unit tests passing (100%)** ✅

**Delivered:**
1. **TLS Validation Service** (`backend/src/services/idp-validation.service.ts`, 450 lines)
   - Version ≥1.2 enforcement, cipher strength, certificate validation
   - Scoring: TLS 1.3=15pts, TLS 1.2=12pts, <1.2=0pts (fail)

2. **Crypto Algorithm Validator** (in idp-validation.service.ts, 200 lines)
   - OIDC JWKS validation (RS256, RS512, ES256, ES512, PS256, PS512)
   - SAML signature validation (SHA-256+ required)
   - Deny-list: MD5, SHA-1 (strict mode), HS1, RS1, 'none'
   - Scoring: SHA-256+=25pts, SHA-1=10pts (warn), MD5=0pts (fail)

3. **SAML Metadata Parser** (`backend/src/services/saml-metadata-parser.service.ts`, 310 lines)
   - XML validation, Entity ID extraction, SSO/SLO endpoints
   - X.509 certificate parsing, expiry detection

4. **OIDC Discovery Validator** (`backend/src/services/oidc-discovery.service.ts`, 300 lines)
   - .well-known/openid-configuration validation
   - JWKS reachability, MFA support detection (ACR values)

5. **MFA Detection Service** (`backend/src/services/mfa-detection.service.ts`, 200 lines)
   - ACR/AMR claims (OIDC), AuthnContextClassRef (SAML)
   - Scoring: Policy doc=20pts, ACR hints=15pts, none=0pts

6. **ValidationResultsPanel** (`frontend/src/components/admin/validation-results-panel.tsx`, 360 lines)
   - Color-coded status indicators (✅⚠️❌)
   - Preliminary score with tier badges

**Integration:**
- Enhanced admin controller (`createIdPHandler`) with validation
- Validation results stored in MongoDB
- Metrics recording for success/failure
- Environment variables configured

**Files:** 15 files changed, +3,349 lines

**Test Coverage:**
- Unit tests: 22/22 passing (100%)
- Test file: `backend/src/__tests__/idp-validation.test.ts`
- Coverage: 100% of validation logic paths

**Documentation:**
- 8 comprehensive guides (~160KB)
- CHANGELOG.md updated
- README.md updated with Phase 1 features

**Key References for Phase 2:**
- `docs/PHASE1-COMPLETE.md` - What was delivered
- `docs/PHASE1-100-PERCENT-TESTS-PASSING.md` - Test methodology
- `backend/src/services/idp-validation.service.ts` - Service patterns
- `backend/src/types/validation.types.ts` - Type definitions

---

## PHASE 2 OBJECTIVE

**Goal:** Implement **comprehensive risk scoring, automated compliance checking, and enhanced approval workflow** to replace preliminary scoring with production-grade risk assessment.

**Business Impact:**
- **Risk-Based Prioritization:** High-risk IdPs flagged for immediate review
- **Compliance Automation:** NATO standards (ACP-240, STANAG) checked automatically
- **Audit Trail:** Complete decision history for regulatory compliance
- **Admin Efficiency:** 90% reduction in review time for low-risk submissions

**Scope:** Production-ready risk assessment (expanding beyond pilot)

**Duration:** 3-4 weeks  
**Exit Criteria:** Full risk scoring operational, compliance validation automated, 95% of submissions auto-triaged

---

## DELIVERABLES

### 1. Comprehensive Risk Scoring Engine (5 days)

**File:** `backend/src/services/risk-scoring.service.ts` (NEW, ~600 lines)

**Purpose:** Replace preliminary scoring (70 points max) with comprehensive risk assessment (100 points)

**Scoring Components:**

**A. Technical Security (40 points)** - FROM PHASE 1
- TLS Version (15pts): TLS 1.3=15, TLS 1.2=12, <1.2=0
- Cryptography (25pts): SHA-256+=25, SHA-1=10, MD5=0

**B. Authentication Strength (30 points)** - NEW
- MFA Enforcement (20pts): Documented policy=20, ACR hints=15, none=0
- Identity Assurance Level (10pts):
  - IAL3 (government-issued ID + biometric) = 10pts
  - IAL2 (government-issued ID, remote) = 7pts
  - IAL1 (self-asserted) = 3pts

**C. Operational Maturity (20 points)** - NEW
- Uptime SLA (5pts): 99.9%=5, 99%=3, <99%=0
- Incident Response (5pts): 24/7 NOC=5, business hours=3, none=0
- Security Patching (5pts): <30 days=5, <90 days=3, >90 days=0
- Support Contact (5pts): Multiple channels=5, email only=2, none=0

**D. Compliance & Governance (10 points)** - NEW
- NATO Certification (5pts): ACP-240 certified=5, in progress=3, none=0
- Audit Logging (3pts): Comprehensive=3, basic=2, none=0
- Data Residency (2pts): Documented=2, none=0

**Total: 100 points**

**Risk Levels:**
- **Minimal Risk** (85-100pts, Gold): Auto-approved (admin notified)
- **Low Risk** (70-84pts, Silver): Fast-track review (<2hr SLA)
- **Medium Risk** (50-69pts, Bronze): Standard review (<24hr SLA)
- **High Risk** (<50pts, Fail): Detailed review required or auto-reject

**Function Signature:**
```typescript
async calculateRiskScore(
  validationResults: IValidationResults,
  submissionData: IIdPSubmission
): Promise<IComprehensiveRiskScore>
```

**Return Type:**
```typescript
interface IComprehensiveRiskScore {
  total: number; // 0-100
  riskLevel: 'minimal' | 'low' | 'medium' | 'high';
  tier: 'gold' | 'silver' | 'bronze' | 'fail';
  breakdown: {
    technicalSecurity: number; // 0-40
    authenticationStrength: number; // 0-30
    operationalMaturity: number; // 0-20
    complianceGovernance: number; // 0-10
  };
  factors: IRiskFactor[]; // Detailed factor analysis
  recommendations: string[];
  computedAt: string;
  computedBy: string;
}

interface IRiskFactor {
  category: string;
  factor: string;
  score: number;
  maxScore: number;
  weight: number;
  evidence: string[];
  concerns: string[];
}
```

**Test Cases:**
- ✅ Perfect IdP (TLS 1.3, MFA, 99.9% SLA, ACP-240 cert) → 95+ points (Minimal Risk)
- ✅ Good IdP (TLS 1.2, MFA, 99% SLA) → 80 points (Low Risk)
- ⚠️ Acceptable IdP (TLS 1.2, no MFA, basic logging) → 55 points (Medium Risk)
- ❌ Weak IdP (TLS 1.1, no MFA, no SLA) → 30 points (High Risk, reject)

---

### 2. Compliance Validation Service (4 days)

**File:** `backend/src/services/compliance-validation.service.ts` (NEW, ~400 lines)

**Purpose:** Automated checking of NATO/DoD compliance requirements

**Standards Checked:**

**A. ACP-240 Compliance**
- Policy-based access control capability
- Audit logging (9 event types minimum)
- Attribute-based access (ABAC) support
- Data-centric security model

**B. STANAG Requirements**
- STANAG 4774: Security labeling capability
- STANAG 4778: Cryptographic binding support
- (Exclude STANAG 4586 as specified in requirements)

**C. NIST Standards**
- NIST 800-63-3: Digital identity guidelines
  - IAL (Identity Assurance Level)
  - AAL (Authenticator Assurance Level)
  - FAL (Federation Assurance Level)

**D. Data Residency & Sovereignty**
- Data location documented
- GDPR compliance (if EU partners)
- Cross-border data transfer agreements

**Function Signature:**
```typescript
async validateCompliance(
  submissionData: IIdPSubmission
): Promise<IComplianceCheckResult>
```

**Return Type:**
```typescript
interface IComplianceCheckResult {
  overall: 'compliant' | 'partial' | 'non-compliant';
  standards: {
    acp240: IStandardCheck;
    stanag4774: IStandardCheck;
    stanag4778: IStandardCheck;
    nist80063: IStandardCheck;
  };
  score: number; // 0-10 points for governance category
  gaps: string[];
  recommendations: string[];
}

interface IStandardCheck {
  applicable: boolean;
  status: 'pass' | 'partial' | 'fail' | 'unknown';
  evidence: string[];
  gaps: string[];
}
```

**Pilot-Appropriate Implementation:**
- Check for documentation uploads (policy PDFs)
- Parse partner-provided compliance certificates
- Simple keyword matching (production would use NLP)
- Manual review for complex cases

---

### 3. Enhanced Approval Workflow (3 days)

**File:** `backend/src/services/idp-approval.service.ts` (MODIFY, +200 lines)

**Enhancements:**

**A. Auto-Approval Logic**
```typescript
async processSubmission(submissionId: string): Promise<IApprovalDecision> {
  const submission = await getSubmission(submissionId);
  const riskScore = submission.comprehensiveRiskScore;
  
  // Auto-approve minimal risk (Gold tier, 85+ points)
  if (riskScore.total >= 85 && riskScore.riskLevel === 'minimal') {
    return {
      action: 'auto-approve',
      reason: 'Minimal risk score (85+ points) - auto-approved',
      requiresManualReview: false,
      slaDeadline: new Date() // Immediate
    };
  }
  
  // Fast-track low risk (Silver tier, 70-84 points)
  if (riskScore.total >= 70 && riskScore.riskLevel === 'low') {
    return {
      action: 'fast-track',
      reason: 'Low risk score - fast-track review',
      requiresManualReview: true,
      slaDeadline: new Date(Date.now() + 2 * 60 * 60 * 1000) // 2 hours
    };
  }
  
  // Standard review for medium risk (Bronze tier, 50-69 points)
  if (riskScore.total >= 50) {
    return {
      action: 'standard-review',
      reason: 'Medium risk - standard review process',
      requiresManualReview: true,
      slaDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
    };
  }
  
  // Auto-reject high risk (<50 points)
  return {
    action: 'auto-reject',
    reason: 'High risk score (<50 points) - critical issues must be addressed',
    requiresManualReview: false,
    rejectionReason: riskScore.factors.filter(f => f.score === 0).map(f => f.concerns).flat()
  };
}
```

**B. SLA Tracking**
- Track submission-to-decision time
- Alert admins when SLA approaching
- Metrics for SLA compliance rate

**C. Workflow States**
- `pending` → Awaiting auto-triage
- `auto-approved` → Minimal risk, approved
- `fast-track` → Low risk, 2hr SLA
- `standard-review` → Medium risk, 24hr SLA
- `detailed-review` → High risk, manual deep-dive
- `auto-rejected` → Critical issues, immediate rejection
- `approved` → Final approval
- `rejected` → Final rejection

---

### 4. Admin Dashboard Enhancement (2 days)

**File:** `frontend/src/app/admin/approvals/page.tsx` (MODIFY, +150 lines)

**Enhancements:**

**A. Risk-Based Filtering**
- Filter by risk level (Minimal/Low/Medium/High)
- Filter by auto-approved vs manual review
- Filter by SLA status (within SLA, approaching, exceeded)

**B. Risk Score Display**
```tsx
<RiskScoreBadge score={95} riskLevel="minimal" />
// Shows: "95/100 - Minimal Risk" with green badge

<RiskBreakdown breakdown={{
  technicalSecurity: 38/40,
  authenticationStrength: 28/30,
  operationalMaturity: 18/20,
  complianceGovernance: 9/10
}} />
```

**C. Compliance Status Cards**
- ACP-240 compliance status
- STANAG compliance status
- NIST 800-63 alignment
- Color-coded: green (compliant), yellow (partial), red (non-compliant)

**D. SLA Indicators**
- Time remaining until SLA deadline
- Visual countdown for fast-track submissions
- Red alert when SLA exceeded

---

### 5. Risk Factor Analysis UI (2 days)

**File:** `frontend/src/components/admin/risk-factor-analysis.tsx` (NEW, ~300 lines)

**Purpose:** Detailed breakdown of risk factors for admin review

**Components:**

**A. Risk Factor Table**
| Category | Factor | Score | Evidence | Concerns |
|----------|--------|-------|----------|----------|
| Technical Security | TLS Version | 15/15 | TLS 1.3 detected | None |
| Technical Security | Algorithms | 25/25 | RS256, RS512 | None |
| Auth Strength | MFA | 15/20 | ACR hints detected | No policy doc uploaded |
| Operational | Uptime SLA | 0/5 | Not documented | Upload SLA doc |

**B. Visual Risk Radar Chart**
```
        Technical (40pts)
              /\
             /  \
   Auth(30)/    \Ops(20)
           \    /
            \  /
         Compliance(10)
```

**C. Recommendations Panel**
- Prioritized list of improvements
- Impact of each improvement on score
- Actionable guidance

---

### 6. MongoDB Schema Updates (1 day)

**File:** `backend/src/types/admin.types.ts` (MODIFY)

**Update IIdPSubmission:**
```typescript
interface IIdPSubmission {
  // ... existing fields ...
  
  // Phase 1 (already exists)
  validationResults?: IValidationResults;
  preliminaryScore?: IPreliminaryScore;
  
  // Phase 2 (NEW)
  comprehensiveRiskScore?: IComprehensiveRiskScore;
  complianceCheck?: IComplianceCheckResult;
  approvalDecision?: IApprovalDecision;
  slaDeadline?: string;
  slaStatus?: 'within' | 'approaching' | 'exceeded';
  autoApproved?: boolean;
  fastTrack?: boolean;
  
  // Operational data (NEW, uploaded by partner)
  operationalData?: {
    uptimeSLA?: string; // '99.9%'
    incidentResponse?: '24/7' | 'business-hours' | 'none';
    securityPatching?: string; // '<30 days'
    supportContacts?: string[]; // ['noc@example.com', '+1-555-0100']
  };
  
  // Compliance uploads (NEW)
  complianceDocuments?: {
    acp240Certificate?: string; // File path or URL
    mfaPolicy?: string;
    privacyPolicy?: string;
    incidentResponsePlan?: string;
  };
}
```

---

### 7. Comprehensive Risk Scoring Tests (3 days)

**File:** `backend/src/__tests__/risk-scoring.test.ts` (NEW, ~500 lines)

**Test Suites:**

**A. Score Calculation (15 tests)**
- Perfect IdP (all factors max) → 100 points
- Good IdP (TLS 1.2, MFA, good SLA) → 80 points
- Acceptable IdP (minimums met) → 55 points
- Weak IdP (critical gaps) → 30 points

**B. Risk Level Assignment (8 tests)**
- 95 points → Minimal risk
- 75 points → Low risk
- 60 points → Medium risk
- 40 points → High risk

**C. Factor Analysis (10 tests)**
- Each factor scored correctly
- Evidence captured
- Concerns identified
- Recommendations generated

**D. Edge Cases (7 tests)**
- Missing operational data (defaults)
- No compliance docs (score 0)
- Partial compliance (score partial points)
- Invalid SLA format (handled gracefully)

**Target:** >95% test coverage for risk scoring service

---

### 8. Compliance Validation Tests (2 days)

**File:** `backend/src/__tests__/compliance-validation.test.ts` (NEW, ~300 lines)

**Test Coverage:**
- ACP-240 compliance checking (5 tests)
- STANAG compliance verification (3 tests)
- NIST 800-63 alignment (4 tests)
- Document parsing (3 tests)
- Edge cases (missing docs, invalid formats) (5 tests)

---

### 9. Integration Tests (2 days)

**File:** `backend/src/__tests__/phase2-integration.test.ts` (NEW, ~400 lines)

**End-to-End Scenarios:**

1. **Minimal Risk Submission** (Auto-Approve)
   - Submit perfect IdP config
   - Validation passes (Phase 1)
   - Risk scoring: 95/100 points
   - Compliance: All standards met
   - Result: Auto-approved, admin notified

2. **Low Risk Submission** (Fast-Track)
   - Submit good IdP config
   - Risk scoring: 75/100 points
   - Result: Fast-track queue, 2hr SLA

3. **Medium Risk Submission** (Standard Review)
   - Submit acceptable IdP
   - Risk scoring: 60/100
   - Result: Standard queue, 24hr SLA

4. **High Risk Submission** (Auto-Reject)
   - Submit weak IdP (TLS 1.0)
   - Risk scoring: 25/100
   - Result: Auto-rejected with guidance

5. **SLA Monitoring**
   - Submit fast-track IdP
   - Verify SLA deadline set
   - Mock time passage
   - Verify SLA status updates (within → approaching → exceeded)

6. **Compliance Gap Handling**
   - Submit IdP without compliance docs
   - Verify gaps identified
   - Verify recommendations provided

---

### 10. GitHub CI/CD Workflow (1 day)

**File:** `.github/workflows/phase2-risk-scoring.yml` (NEW or update `.github/workflows/ci.yml`)

**Jobs:**

**A. Risk Scoring Tests**
```yaml
risk-scoring-tests:
  name: Risk Scoring Service Tests
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v3
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '20'
    - name: Install Dependencies
      run: cd backend && npm ci
    - name: Run Risk Scoring Tests
      run: cd backend && npm test -- risk-scoring.test.ts --coverage
    - name: Verify Coverage >95%
      run: |
        cd backend
        npm run test:coverage -- risk-scoring.test.ts
        # Fail if coverage <95%
```

**B. Compliance Tests**
```yaml
compliance-tests:
  name: Compliance Validation Tests
  runs-on: ubuntu-latest
  steps:
    - name: Run Compliance Tests
      run: cd backend && npm test -- compliance-validation.test.ts
```

**C. Integration Tests**
```yaml
phase2-integration:
  name: Phase 2 Integration Tests
  runs-on: ubuntu-latest
  services:
    mongodb:
      image: mongo:7.0
      ports:
        - 27017:27017
    opa:
      image: openpolicyagent/opa:0.68.0
      ports:
        - 8181:8181
  steps:
    - name: Run Phase 2 Integration Tests
      run: cd backend && npm test -- phase2-integration.test.ts
```

**Success Criteria:**
- ✅ All test jobs pass
- ✅ Coverage >95% for new services
- ✅ No TypeScript errors
- ✅ Build successful

---

### 11. Documentation Updates (2 days)

**A. Implementation Plan Update**

Create or update: `docs/IMPLEMENTATION-PLAN.md`

```markdown
## Phase 2: Risk Scoring & Compliance ✅

**Status:** Complete (2025-10-XX)
**Duration:** 3 weeks actual (vs. 4 weeks estimated)

**Delivered:**
- Comprehensive risk scoring engine (100-point system)
- Compliance validation service (ACP-240, STANAG, NIST)
- Enhanced approval workflow (auto-approve, fast-track, SLA)
- Admin dashboard risk visualization
- 40+ tests (>95% coverage)

**Exit Criteria Met:** 8/8
- ✅ Risk scoring replaces preliminary scoring
- ✅ Compliance automated for NATO standards
- ✅ Auto-approval for minimal risk (85+ points)
- ✅ SLA tracking operational
- ✅ Test coverage >95%
- ✅ CI/CD enforces quality gates
- ✅ Documentation complete
- ✅ No regression in Phase 0/1 features
```

**B. CHANGELOG.md Update**

```markdown
## [Phase 2] - 2025-10-XX

### Added - Comprehensive Risk Scoring & Compliance Automation

**Risk Scoring Engine:**
- 100-point comprehensive scoring (vs 70-point preliminary)
- 4 categories: Technical Security (40pts), Auth Strength (30pts), Operational Maturity (20pts), Compliance (10pts)
- Risk levels: Minimal (85-100), Low (70-84), Medium (50-69), High (<50)
- Automated risk factor analysis with evidence and concerns
- 30+ risk factors evaluated

**Compliance Validation:**
- ACP-240 compliance checking (policy-based access, audit logging, ABAC)
- STANAG 4774/4778 capability verification (security labeling, crypto binding)
- NIST 800-63-3 alignment (IAL/AAL/FAL assessment)
- Data residency and sovereignty validation
- Automated document parsing for compliance certificates

**Enhanced Approval Workflow:**
- Auto-approval for minimal risk IdPs (85+ points)
- Fast-track queue for low risk (70-84 points, 2hr SLA)
- Standard review for medium risk (50-69 points, 24hr SLA)
- Auto-rejection for high risk (<50 points)
- SLA tracking and monitoring
- Admin alerts for SLA approaching/exceeded

**Admin Dashboard:**
- Risk-based filtering (Minimal/Low/Medium/High)
- Risk score visualization (badge, breakdown, radar chart)
- Compliance status cards (ACP-240, STANAG, NIST)
- SLA countdown indicators
- Risk factor analysis table

**Testing:**
- 40+ unit tests for risk scoring and compliance
- 6 integration tests for end-to-end workflow
- >95% code coverage for new services
- All CI/CD jobs passing

### Changed
- IIdPSubmission schema extended with risk and compliance fields
- Approval service enhanced with auto-triage logic
- Admin dashboard redesigned with risk-based views
- Metrics service tracks SLA compliance

### Security
- Risk-based access control (higher scrutiny for high-risk)
- Compliance validation ensures NATO standards
- Audit trail for all automated decisions
- Manual override available for all auto-decisions
```

**C. README.md Update**

Add to Key Features section:

```markdown
### 🎯 Risk-Based IdP Approval (Phase 2 - NEW!)

**Intelligent risk assessment replaces manual triage:**

- **100-Point Risk Scoring**
  - Technical Security (40pts): TLS version, cryptography
  - Authentication Strength (30pts): MFA enforcement, identity assurance
  - Operational Maturity (20pts): SLA, incident response, patching
  - Compliance & Governance (10pts): NATO certs, audit logging
  
- **Automated Triage**
  - Minimal Risk (85-100pts): Auto-approved
  - Low Risk (70-84pts): Fast-track (2hr SLA)
  - Medium Risk (50-69pts): Standard review (24hr SLA)
  - High Risk (<50pts): Auto-rejected or detailed review

- **Compliance Automation**
  - ACP-240 compliance verification
  - STANAG 4774/4778 capability checking
  - NIST 800-63 alignment assessment
  - Automated gap analysis with recommendations

- **SLA Management**
  - Automated SLA deadline calculation
  - Real-time countdown indicators
  - Admin alerts for approaching deadlines
  - SLA compliance tracking and reporting

**Business Impact:**
- 90% reduction in manual review time
- 100% of minimal-risk IdPs auto-approved
- SLA compliance >98% (vs <50% manual)
- Complete audit trail for regulatory compliance
```

**D. Phase 2 Completion Summary**

Create: `docs/PHASE2-COMPLETION-SUMMARY.md`

```markdown
# Phase 2: Risk Scoring & Compliance - COMPLETE

**Status:** ✅ 100% Complete
**Test Coverage:** >95% (40+ tests passing)
**Production Ready:** Yes

## What Was Delivered
- Comprehensive risk scoring (100 points)
- Compliance validation (ACP-240, STANAG, NIST)
- Auto-approval workflow
- Enhanced admin dashboard
- 40+ tests (100% passing)
- Complete documentation

## Success Metrics
- Auto-approval rate: 15% (minimal risk)
- Fast-track rate: 35% (low risk)
- SLA compliance: >98%
- Review time: 30min → 3min (90% reduction)
```

---

## TECHNICAL SPECIFICATIONS

### TypeScript Interfaces (NEW)

**File:** `backend/src/types/risk-scoring.types.ts` (NEW, ~400 lines)

```typescript
export interface IComprehensiveRiskScore {
  total: number;
  riskLevel: 'minimal' | 'low' | 'medium' | 'high';
  tier: 'gold' | 'silver' | 'bronze' | 'fail';
  breakdown: {
    technicalSecurity: number;
    authenticationStrength: number;
    operationalMaturity: number;
    complianceGovernance: number;
  };
  factors: IRiskFactor[];
  recommendations: string[];
  computedAt: string;
  computedBy: string;
}

export interface IRiskFactor {
  category: 'technical' | 'authentication' | 'operational' | 'compliance';
  factor: string;
  score: number;
  maxScore: number;
  weight: number;
  evidence: string[];
  concerns: string[];
  recommendation?: string;
}

export interface IApprovalDecision {
  action: 'auto-approve' | 'fast-track' | 'standard-review' | 'detailed-review' | 'auto-reject';
  reason: string;
  requiresManualReview: boolean;
  slaDeadline?: Date;
  rejectionReason?: string[];
}

export interface IComplianceCheckResult {
  overall: 'compliant' | 'partial' | 'non-compliant';
  standards: {
    acp240: IStandardCheck;
    stanag4774: IStandardCheck;
    stanag4778: IStandardCheck;
    nist80063: IStandardCheck;
  };
  score: number;
  gaps: string[];
  recommendations: string[];
}

export interface IStandardCheck {
  applicable: boolean;
  status: 'pass' | 'partial' | 'fail' | 'unknown';
  evidence: string[];
  gaps: string[];
  score: number;
}
```

---

## ENVIRONMENT VARIABLES (NEW)

Add to `backend/.env.example`:

```bash
# Phase 2: Risk Scoring & Compliance
RISK_SCORING_ENABLED=true
AUTO_APPROVE_THRESHOLD=85
FAST_TRACK_THRESHOLD=70
AUTO_REJECT_THRESHOLD=50

# SLA Configuration (hours)
FAST_TRACK_SLA_HOURS=2
STANDARD_REVIEW_SLA_HOURS=24
DETAILED_REVIEW_SLA_HOURS=72

# Compliance Validation
COMPLIANCE_STRICT_MODE=false
REQUIRE_ACP240_CERT=false
REQUIRE_MFA_POLICY_DOC=false

# Operational Requirements (for scoring)
MINIMUM_UPTIME_SLA=99.0
REQUIRE_247_SUPPORT=false
MAX_PATCHING_DAYS=90
```

---

## SUCCESS CRITERIA (Phase 2 Exit)

### Quantitative Metrics

| **Metric** | **Target** | **Measurement** |
|-----------|------------|-----------------|
| **Risk Scoring Accuracy** | >90% | Manual review agrees with risk level |
| **Auto-Approval Rate** | 10-20% | Minimal risk IdPs auto-approved |
| **SLA Compliance** | >95% | Decisions within SLA deadline |
| **Test Coverage** | >95% | Jest coverage report |
| **Review Time Reduction** | 90% | 30min → 3min average |

### Qualitative Criteria

- ✅ Admin feedback: "Risk scores accurately reflect security posture"
- ✅ Partner feedback: "Clear guidance on improving scores"
- ✅ Security team: "Compliance automation reduces audit burden"
- ✅ No regression in Phase 0/1 features

---

## COMMIT STRATEGY

### Branch Naming
```
feature/phase2-risk-scoring-compliance
```

### Commit Sequence

1. `feat(risk): add comprehensive risk scoring engine`
2. `feat(compliance): add compliance validation service`
3. `feat(approval): enhance workflow with auto-triage`
4. `feat(ui): add risk-based admin dashboard filters`
5. `feat(ui): add risk factor analysis component`
6. `test(risk): add comprehensive risk scoring tests (>95% coverage)`
7. `test(compliance): add compliance validation tests`
8. `test(integration): add Phase 2 end-to-end tests`
9. `ci: add Phase 2 test jobs to GitHub Actions`
10. `docs: update implementation plan, CHANGELOG, README`
11. `docs: add Phase 2 completion summary`

---

## FILE STRUCTURE TO CREATE

```
dive-v3/
├── backend/src/
│   ├── services/
│   │   ├── risk-scoring.service.ts              (NEW - 600 lines)
│   │   ├── compliance-validation.service.ts     (NEW - 400 lines)
│   │   └── idp-approval.service.ts              (MODIFY - +200 lines)
│   │
│   ├── types/
│   │   ├── risk-scoring.types.ts                (NEW - 400 lines)
│   │   └── admin.types.ts                       (MODIFY - +50 lines)
│   │
│   ├── __tests__/
│   │   ├── risk-scoring.test.ts                 (NEW - 500 lines)
│   │   ├── compliance-validation.test.ts        (NEW - 300 lines)
│   │   ├── phase2-integration.test.ts           (NEW - 400 lines)
│   │   └── fixtures/
│   │       ├── perfect-idp-submission.json      (NEW - test data)
│   │       ├── weak-idp-submission.json         (NEW - test data)
│   │       └── compliance-certificates/         (NEW - sample docs)
│   │
│   └── controllers/
│       └── admin.controller.ts                  (MODIFY - integrate risk scoring)
│
├── frontend/src/
│   ├── components/admin/
│   │   ├── risk-factor-analysis.tsx             (NEW - 300 lines)
│   │   ├── risk-score-badge.tsx                 (NEW - 100 lines)
│   │   ├── compliance-status-card.tsx           (NEW - 150 lines)
│   │   └── sla-countdown.tsx                    (NEW - 120 lines)
│   │
│   └── app/admin/approvals/
│       └── page.tsx                             (MODIFY - +150 lines)
│
├── .github/workflows/
│   └── ci.yml                                   (MODIFY - add Phase 2 jobs)
│
├── docs/
│   ├── PHASE2-COMPLETION-SUMMARY.md             (NEW - completion doc)
│   ├── IMPLEMENTATION-PLAN.md                   (UPDATE - Phase 2 section)
│   └── api/
│       └── RISK-SCORING-API.md                  (NEW - API docs)
│
├── CHANGELOG.md                                 (UPDATE - Phase 2 entry)
└── README.md                                    (UPDATE - Phase 2 features)
```

**Estimated Lines of Code:**
- Services: ~1,200 lines
- Tests: ~1,200 lines
- Types: ~450 lines
- UI: ~670 lines
- Documentation: ~2,000 lines
- **Total:** ~5,520 lines

---

## IMPLEMENTATION STRATEGY

### Week 1: Risk Scoring Engine

**Days 1-2:** Risk Scoring Service
- Implement scoring algorithm
- Factor analysis logic
- Evidence collection
- Write unit tests (target: 30+ tests)

**Days 3-4:** Compliance Validation
- ACP-240 checking
- STANAG verification
- NIST alignment
- Write unit tests (target: 15+ tests)

**Day 5:** Integration
- Update admin controller
- Store comprehensive scores in MongoDB
- Update approval service

### Week 2: Enhanced Workflow

**Days 1-2:** Auto-Approval Logic
- Implement risk-based triage
- SLA deadline calculation
- Workflow state management
- Write integration tests

**Days 3-4:** Admin Dashboard UI
- Risk-based filtering
- Risk score display components
- Compliance status cards
- SLA countdown indicators

**Day 5:** Testing & QA
- Manual QA testing
- Performance testing
- Integration verification

### Week 3: Polish & Documentation

**Days 1-2:** CI/CD Integration
- GitHub Actions workflow
- Coverage enforcement
- Quality gates

**Days 3-4:** Documentation
- Update CHANGELOG, README, implementation plan
- Write Phase 2 completion summary
- API documentation

**Day 5:** Final QA & Merge
- Comprehensive testing
- Final review
- Merge to main

---

## REFERENCE MATERIALS

### Phase 1 Documentation (CRITICAL - READ FIRST)

**Location:** Branch `main` (Phase 1 merged)

**Critical Files:**
1. **`docs/PHASE1-COMPLETE.md`** - Phase 1 achievements
2. **`docs/PHASE1-100-PERCENT-TESTS-PASSING.md`** - Testing methodology
3. **`backend/src/services/idp-validation.service.ts`** - Service pattern reference
4. **`backend/src/types/validation.types.ts`** - Type definition patterns
5. **`backend/src/__tests__/idp-validation.test.ts`** - Test patterns (100% passing)

**Supporting:**
6. **`docs/PHASE1-IMPLEMENTATION-STATUS.md`** - Implementation details
7. **`backend/src/controllers/admin.controller.ts`** - Integration patterns
8. **`frontend/src/components/admin/validation-results-panel.tsx`** - UI patterns

### Phase 1 Achievements Summary

**Backend Services (Reference These):**
- TLS validation: Version checking, cipher validation
- Algorithm validation: JWKS (OIDC), XML signatures (SAML)
- SAML metadata parser: XML validation, certificate extraction
- OIDC discovery: .well-known validation, JWKS checks
- MFA detection: ACR/AMR claims, confidence levels

**Patterns to Reuse:**
- Service class structure (singleton export)
- Error handling (try-catch, structured logging)
- TypeScript interfaces (comprehensive, well-documented)
- Testing approach (mocking, async patterns, 100% coverage)
- Documentation style (JSDoc, inline examples)

---

## TESTING REQUIREMENTS

### Unit Test Coverage (Target: >95%)

**Risk Scoring Service Tests (30+ tests):**
- Score calculation accuracy (15 tests)
- Risk level assignment (8 tests)
- Factor analysis (10 tests)
- Edge cases (7 tests)

**Compliance Service Tests (15+ tests):**
- ACP-240 checking (5 tests)
- STANAG verification (3 tests)
- NIST alignment (4 tests)
- Document parsing (3 tests)

**Workflow Tests (6+ tests):**
- Auto-approval logic
- Fast-track queue
- SLA tracking
- Workflow state transitions

### Integration Tests (10+ tests)

**End-to-End Scenarios:**
1. Minimal risk submission → auto-approved
2. Low risk submission → fast-track queue
3. Medium risk submission → standard review
4. High risk submission → auto-rejected
5. SLA monitoring and alerts
6. Compliance gap identification

### Manual QA Testing

**10 Test Scenarios:**
1. Submit perfect IdP → verify auto-approval
2. Submit good IdP → verify fast-track
3. Submit acceptable IdP → verify standard queue
4. Submit weak IdP → verify rejection
5. Check risk score display in UI
6. Verify compliance status cards
7. Test SLA countdown
8. Test risk factor analysis table
9. Verify metrics recording
10. Test manual override capability

---

## CI/CD REQUIREMENTS

### GitHub Actions Workflow

**Required Jobs:**
1. **Backend Build** - TypeScript compilation
2. **Frontend Build** - Next.js build
3. **Risk Scoring Tests** - Unit tests >95% coverage
4. **Compliance Tests** - Unit tests passing
5. **Integration Tests** - E2E scenarios
6. **Type Check** - No TypeScript errors
7. **Security Audit** - npm audit (0 critical CVEs)

**Success Criteria:**
- ✅ All jobs passing (green)
- ✅ Coverage >95% for risk/compliance services
- ✅ No test failures
- ✅ Build successful
- ✅ No security vulnerabilities

**Workflow File:** `.github/workflows/ci.yml` (modify) or `.github/workflows/phase2-risk-scoring.yml` (new)

---

## ACCEPTANCE CRITERIA (Phase 2 Exit)

### Code (100% Complete)
- [ ] Risk scoring engine implemented and tested
- [ ] Compliance validation service implemented
- [ ] Auto-approval workflow implemented
- [ ] Enhanced admin dashboard with risk views
- [ ] Risk factor analysis UI complete
- [ ] All unit tests passing (>95% coverage)
- [ ] All integration tests passing
- [ ] TypeScript compiles without errors
- [ ] ESLint passes (no new warnings)

### Testing (100% Complete)
- [ ] 40+ unit tests passing
- [ ] 10+ integration tests passing
- [ ] Manual QA complete (10 scenarios)
- [ ] CI/CD pipeline passing (all jobs green)
- [ ] Performance validated (<2s scoring overhead)

### Documentation (100% Complete)
- [ ] CHANGELOG.md updated (Phase 2 entry)
- [ ] README.md updated (Phase 2 features)
- [ ] Implementation plan updated
- [ ] Phase 2 completion summary written
- [ ] API documentation complete

### Production Readiness
- [ ] Auto-approval tested with real submissions
- [ ] SLA tracking verified
- [ ] Compliance checks validated
- [ ] Metrics dashboard functional
- [ ] No regression in Phase 0/1 features

---

## PROMPT FOR AI ASSISTANT (NEW CHAT)

```
**Role & Tone:**
Act as a senior backend engineer and risk assessment expert with expertise in Node.js, TypeScript, compliance automation (ACP-240, STANAG, NIST), and workflow orchestration. Be implementation-focused, test-driven, and production-oriented.

**Objective:**
Implement Phase 2 of the DIVE V3 IdP risk assessment system: comprehensive risk scoring (100 points), automated compliance validation, and intelligent approval workflow with auto-approval for minimal-risk submissions.

**Context - Phase 0 & Phase 1 Complete:**

Phase 0 established observability baseline (merged to main):
- ✅ Prometheus metrics service
- ✅ 5 Service Level Objectives (docs/SLO.md)
- ✅ Security audit baseline

Phase 1 implemented automated security validation (merged to main):
- ✅ 4 validation services: TLS, crypto, SAML, OIDC, MFA
- ✅ Preliminary risk scoring (0-70 points)
- ✅ ValidationResultsPanel UI component
- ✅ 22 unit tests passing (100%)
- ✅ Integration into workflow
- ✅ Comprehensive documentation (8 docs, 160KB)

**Current State:**
- Validation services operational in production
- Preliminary scores displayed (max 70 points)
- All submissions require manual admin approval
- **Gap:** No automated triage, no compliance checking, no SLA management

**Your Task:**

Implement Phase 2 comprehensive risk scoring and compliance automation:

1. **Comprehensive Risk Scoring Engine** (5 days)
   - File: backend/src/services/risk-scoring.service.ts (NEW, ~600 lines)
   - Function: calculateRiskScore() → 100-point system
   - Categories: Technical (40), Auth (30), Operational (20), Compliance (10)
   - Risk levels: Minimal (85-100), Low (70-84), Medium (50-69), High (<50)
   - Test: 30+ unit tests, >95% coverage

2. **Compliance Validation Service** (4 days)
   - File: backend/src/services/compliance-validation.service.ts (NEW, ~400 lines)
   - Standards: ACP-240, STANAG 4774/4778, NIST 800-63
   - Document parsing for compliance certificates
   - Automated gap analysis
   - Test: 15+ unit tests

3. **Enhanced Approval Workflow** (3 days)
   - Modify: backend/src/services/idp-approval.service.ts (+200 lines)
   - Auto-approve minimal risk (85+ points)
   - Fast-track low risk (70-84 points, 2hr SLA)
   - Standard review medium risk (50-69 points, 24hr SLA)
   - Auto-reject or detailed review high risk (<50 points)
   - SLA tracking and alerts

4. **Admin Dashboard Enhancement** (2 days)
   - Modify: frontend/src/app/admin/approvals/page.tsx (+150 lines)
   - Risk-based filtering
   - Risk score badge and breakdown
   - Compliance status cards
   - SLA countdown indicators

5. **Risk Factor Analysis UI** (2 days)
   - File: frontend/src/components/admin/risk-factor-analysis.tsx (NEW, ~300 lines)
   - Factor table with evidence and concerns
   - Recommendations panel
   - Visual risk breakdown

6. **Comprehensive Testing** (3 days)
   - Risk scoring tests: 30+ tests
   - Compliance tests: 15+ tests
   - Integration tests: 10+ scenarios
   - Manual QA: 10 scenarios
   - Target: >95% coverage, 100% pass rate

7. **CI/CD Integration** (1 day)
   - Add Phase 2 test jobs to GitHub Actions
   - Coverage enforcement (>95%)
   - Quality gates
   - All jobs must pass

8. **Documentation** (2 days)
   - Update CHANGELOG.md (Phase 2 entry)
   - Update README.md (Phase 2 features)
   - Update implementation plan
   - Write Phase 2 completion summary

**Technical Specifications:**

Reference Phase 1 patterns from:
- `backend/src/services/idp-validation.service.ts` (service structure)
- `backend/src/__tests__/idp-validation.test.ts` (test patterns, 100% passing)
- `backend/src/types/validation.types.ts` (type definition style)

New interfaces in: docs/PHASE2-IMPLEMENTATION-PROMPT.md (this file, line 250-350)

Environment variables:
```bash
RISK_SCORING_ENABLED=true
AUTO_APPROVE_THRESHOLD=85
FAST_TRACK_THRESHOLD=70
AUTO_REJECT_THRESHOLD=50
FAST_TRACK_SLA_HOURS=2
STANDARD_REVIEW_SLA_HOURS=24
```

**Success Criteria (Phase 2 Exit):**

Quantitative:
- ✅ Risk scoring engine: 100-point system operational
- ✅ Test coverage >95% for new services
- ✅ 100% test pass rate (no shortcuts)
- ✅ Auto-approval rate: 10-20% (minimal risk)
- ✅ SLA compliance >95%
- ✅ All CI/CD jobs passing

Qualitative:
- ✅ Risk scores accurately reflect security posture
- ✅ Compliance automation reduces audit burden
- ✅ Admin review time reduced by 90%
- ✅ No regression in Phase 0/1 features

**Constraints:**

1. **Build on Phase 1 Foundation:**
   - Reuse validation services (don't rewrite)
   - Extend preliminary scoring (don't replace validation)
   - Follow established patterns (service singletons, TypeScript strict)

2. **Code Quality:**
   - TypeScript strict mode
   - 100% test pass rate (no shortcuts)
   - ESLint passing
   - Comprehensive JSDoc comments

3. **Testing:**
   - Every service must have >95% coverage
   - Integration tests for workflows
   - Manual QA before marking complete
   - CI/CD must pass

4. **Documentation:**
   - Update all 3: CHANGELOG, README, implementation plan
   - Write Phase 2 completion summary
   - API documentation for new endpoints

**Reference Files to Read:**

Critical (read first):
1. docs/PHASE1-COMPLETE.md - Phase 1 summary
2. docs/PHASE1-100-PERCENT-TESTS-PASSING.md - Testing best practices
3. backend/src/services/idp-validation.service.ts - Service patterns
4. backend/src/__tests__/idp-validation.test.ts - Test patterns
5. backend/src/types/validation.types.ts - Type patterns

Supporting:
6. docs/PHASE1-IMPLEMENTATION-STATUS.md - Implementation details
7. backend/src/controllers/admin.controller.ts - Integration point
8. frontend/src/components/admin/validation-results-panel.tsx - UI patterns

**Deliverables:**

1. Risk scoring engine (fully tested, >95% coverage)
2. Compliance validation service (fully tested)
3. Enhanced approval workflow with auto-triage
4. Admin dashboard enhancements (risk-based views)
5. Risk factor analysis UI
6. 55+ unit tests (100% passing)
7. 10+ integration tests (100% passing)
8. GitHub Actions workflow (all jobs green)
9. Updated documentation (CHANGELOG, README, completion summary)

**Timeline:**

Week 1: Risk scoring + compliance services
Week 2: Workflow + UI enhancements
Week 3: Testing + CI/CD + documentation

**Now proceed with implementation following Phase 1 best practices: proper root cause analysis, no shortcuts, 100% test pass rate, comprehensive documentation.**
```

---

## TESTING CHECKLIST (Phase 2)

### Before Marking Phase 2 Complete

**Code:**
- [ ] Risk scoring engine implemented
- [ ] Compliance validation implemented
- [ ] Auto-approval workflow implemented
- [ ] Admin dashboard enhanced
- [ ] Risk factor UI complete
- [ ] TypeScript: 0 errors
- [ ] ESLint: Clean

**Testing:**
- [ ] Unit tests: 55+ tests, 100% passing
- [ ] Integration tests: 10+ tests, 100% passing
- [ ] Coverage: >95% for risk/compliance services
- [ ] Manual QA: 10 scenarios complete
- [ ] Performance: <2s scoring overhead

**CI/CD:**
- [ ] GitHub Actions workflow added/updated
- [ ] All test jobs passing
- [ ] Coverage enforcement working
- [ ] Security audit passing
- [ ] Build jobs successful

**Documentation:**
- [ ] CHANGELOG.md updated
- [ ] README.md updated
- [ ] Implementation plan updated
- [ ] Phase 2 completion summary written
- [ ] API docs complete

**Verification:**
- [ ] Auto-approval tested (minimal risk)
- [ ] Fast-track tested (low risk)
- [ ] SLA tracking working
- [ ] Compliance checks accurate
- [ ] Metrics dashboard updated
- [ ] No Phase 0/1 regressions

---

## ADDITIONAL CONTEXT

### Current System Capabilities (Phase 1)

**What Already Works:**
- TLS validation (version, cipher, certificates)
- Algorithm validation (JWKS, SAML signatures)
- SAML metadata parsing
- OIDC discovery validation
- MFA detection
- Preliminary scoring (0-70 points)
- Validation results UI

**What Phase 2 Adds:**
- Comprehensive scoring (100 points vs 70)
- Compliance automation
- Auto-approval (vs 100% manual)
- SLA management (vs none)
- Risk factor analysis (vs simple score)

### Integration Points

**Where to Hook In:**

1. **After Phase 1 Validation:**
   - `backend/src/controllers/admin.controller.ts` line ~350
   - After preliminary score calculated
   - Before storing submission
   - Add: comprehensive risk scoring + compliance check

2. **Approval Queue:**
   - `backend/src/services/idp-approval.service.ts`
   - Add auto-triage logic
   - Set SLA deadlines based on risk level

3. **Admin Dashboard:**
   - `frontend/src/app/admin/approvals/page.tsx`
   - Add risk-based filtering
   - Display comprehensive scores
   - Show compliance status

4. **Metrics:**
   - `backend/src/services/metrics.service.ts`
   - Add auto-approval metrics
   - Add SLA compliance metrics
   - Add risk distribution metrics

---

## KNOWN CONSIDERATIONS

**From Phase 1 Experience:**

1. **Testing:** Always achieve 100% pass rate (no shortcuts)
2. **TypeScript:** Use proper type annotations (avoid circular refs)
3. **Async:** Use setImmediate() for async callback mocking
4. **Security:** Always warn about issues, even if tolerated
5. **Documentation:** Write as you code, not after

**Pilot-Appropriate for Phase 2:**
- Simple document parsing (keyword matching, not NLP)
- Partner-provided operational data (honor system for SLAs)
- Auto-approval with admin notification (not silent)
- Manual override always available

---

## SUCCESS METRICS

**Code Quality:**
- Tests: >55 passing (100% pass rate)
- Coverage: >95% for new services
- TypeScript: 0 errors
- Build: Successful

**Functionality:**
- Auto-approval rate: 10-20%
- Fast-track rate: 30-40%
- SLA compliance: >95%
- Review time: 90% reduction

**Documentation:**
- 3 updates: CHANGELOG, README, plan
- 1 new: Phase 2 completion summary
- Code comments: Comprehensive

---

**Estimated Total Effort:** 3-4 weeks  
**Starting Point:** Branch `main` (Phase 0 + Phase 1 complete)  
**Ending Point:** Phase 2 merged to main with 100% tests passing

**Begin implementation using Phase 1 as template. Maintain quality standards: proper testing, no shortcuts, comprehensive documentation.**

