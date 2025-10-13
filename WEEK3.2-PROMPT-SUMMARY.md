# Week 3.2 Implementation Prompt - Summary

**Created**: October 12, 2025  
**File**: `WEEK3.2-POLICY-UPLOAD-IMPLEMENTATION-PROMPT.md`  
**Size**: 2,124 lines (comprehensive)  
**Status**: ✅ Ready for use in new chat session

---

## 📋 What Was Created

### Comprehensive Implementation Prompt (2,124 lines)

**Purpose**: Start a new chat session to implement Week 3.2 features  
**Scope**: Policy viewer UI + Secure file upload with ACP-240 compliance

**Includes:**

1. **Full Context** (~500 lines)
   - Current project status (Week 3.1 complete)
   - Repository structure
   - Technology stack
   - Critical reference materials with file paths

2. **Clear Objectives** (~200 lines)
   - Objective A: OPA policy viewer and interactive tester
   - Objective B: Secure file upload with ZTDF conversion
   - Success criteria for each objective

3. **6-Day Phased Plan** (~800 lines)
   - Day 1: Backend Policy API
   - Day 2: Frontend Policy Viewer
   - Day 3: Backend Upload API
   - Day 4: Frontend Upload UI
   - Day 5: OPA Tests & Authorization
   - Day 6: Final QA & Deployment

4. **Detailed Specifications** (~400 lines)
   - API specifications with request/response examples
   - UI/UX mockups (ASCII diagrams)
   - Database schemas
   - Security requirements

5. **Testing Requirements** (~300 lines)
   - 15+ new OPA tests required
   - 10+ new integration tests required
   - 12 manual testing scenarios
   - CI/CD requirements (102+ tests threshold)

6. **Code Examples** (~400 lines)
   - Upload service skeleton
   - ZTDF conversion pattern
   - Frontend upload page skeleton
   - OPA upload authorization rules

7. **Reference Guide** (~200 lines)
   - Key files to review
   - Implementation patterns
   - Security best practices
   - Quick command reference

---

## 🎯 Key Features of the Prompt

### Why This Prompt is Effective

✅ **Self-Contained**: All context needed for new chat session  
✅ **Actionable**: Clear day-by-day implementation plan  
✅ **Referenced**: Cites existing files with line numbers  
✅ **Testable**: Specific acceptance criteria and test requirements  
✅ **Secure**: ACP-240 compliance built into every step  
✅ **Quality-Focused**: CI/CD and testing requirements throughout  

### What Makes It Production-Ready

1. **Best Practices**: Follows existing DIVE V3 patterns exactly
2. **Test-Driven**: OPA tests written first, then implementation
3. **Security-First**: ACP-240 compliance non-negotiable
4. **Type-Safe**: TypeScript interfaces defined upfront
5. **Documented**: TSDoc comments required
6. **CI/CD**: GitHub Actions passing required before completion

---

## 🚀 How to Use This Prompt

### Starting a New Chat Session

1. **Open new conversation** with AI assistant

2. **Paste the prompt**:
   ```
   [Copy entire contents of WEEK3.2-POLICY-UPLOAD-IMPLEMENTATION-PROMPT.md]
   ```

3. **AI will**:
   - Read all referenced files
   - Understand current state (Week 3.1 complete)
   - Follow 6-day phased implementation
   - Create 15 new files
   - Write 102+ tests
   - Achieve 100% test coverage
   - Update documentation
   - Deploy to GitHub

4. **Expected outcome**:
   - Policy viewer functional
   - Secure upload working
   - All tests passing
   - CI/CD green
   - Production deployed

---

## 📊 Expected Deliverables (From Prompt)

### Code (15 new files, 8 modified)

**Backend (10 new):**
1. services/policy.service.ts (~200 lines)
2. controllers/policy.controller.ts (~150 lines)
3. routes/policy.routes.ts (~50 lines)
4. types/policy.types.ts (~100 lines)
5. services/upload.service.ts (~300 lines)
6. controllers/upload.controller.ts (~200 lines)
7. routes/upload.routes.ts (~60 lines)
8. middleware/upload.middleware.ts (~150 lines)
9. types/upload.types.ts (~150 lines)
10. __tests__/upload.test.ts (~250 lines)

**Frontend (5 new):**
1. app/policies/page.tsx (~150 lines)
2. app/policies/[id]/page.tsx (~250 lines)
3. app/upload/page.tsx (~300 lines)
4. components/upload/file-uploader.tsx (~200 lines)
5. components/upload/security-label-form.tsx (~250 lines)

**OPA (2 new):**
1. tests/policy_management_tests.rego (~150 lines)
2. tests/upload_authorization_tests.rego (~350 lines)

### Testing (Target: 102+ OPA, 50+ Integration)

**New OPA Tests (15+):**
- 5 policy viewer tests
- 10 upload authorization tests

**New Integration Tests (10+):**
- 8 upload endpoint tests
- 2 policy API tests

### Documentation (3 new, 2 modified)

**New:**
1. WEEK3.2-IMPLEMENTATION-COMPLETE.md
2. WEEK3.2-QA-RESULTS.md
3. docs/API-DOCUMENTATION.md

**Modified:**
1. README.md (add Week 3.2 features)
2. CHANGELOG.md (comprehensive entry)

---

## 🎯 Success Metrics (From Prompt)

```
Component                Target              Deliverable
═══════════════════════════════════════════════════════════
OPA Tests                102+ passing        87 existing + 15 new
Integration Tests        50+ passing         40 existing + 10 new
TypeScript Errors        0                   All services
Policy Viewer            Functional          Read-only + tester
File Upload              Functional          ACP-240 compliant
ZTDF Conversion          Automatic           All uploads
GitHub Actions           100% passing        All 6 jobs
Documentation            Complete            README + CHANGELOG
```

---

## 🔒 Security Highlights (From Prompt)

### Upload Security Requirements

✅ **File Validation**: Magic number + MIME type + size limit  
✅ **Authorization**: OPA policy check (clearance enforcement)  
✅ **ZTDF Conversion**: Automatic for all uploads  
✅ **Encryption**: AES-256-GCM with DEK/KAO  
✅ **Integrity**: SHA-384 hashes (STANAG 4778)  
✅ **Security Labels**: STANAG 4774 applied  
✅ **Audit Logging**: ENCRYPT events per ACP-240  
✅ **Fail-Closed**: Deny on any validation failure  

### OPA Upload Rules (From Prompt)

```rego
# User can only upload at or below their clearance
is_upload_above_clearance := msg if {
  input.action.operation == "upload"
  user_level := clearance_levels[input.subject.clearance]
  resource_level := clearance_levels[input.resource.classification]
  user_level < resource_level
  msg := "Cannot upload above your clearance level"
}

# Upload must be releasable to uploader's country
is_upload_not_releasable_to_uploader := msg if {
  input.action.operation == "upload"
  not input.subject.countryOfAffiliation in input.resource.releasabilityTo
  msg := "Upload must be releasable to your country"
}
```

---

## 📖 Key Sections of the Prompt

### 1. Context & Current State (Lines 1-100)
- Repository status (Week 3.1 complete)
- Current capabilities (87 tests, ZTDF, KAS)
- Technology stack
- Key reference files

### 2. Objectives (Lines 101-150)
- Objective A: Policy viewer
- Objective B: Secure upload
- Clear scope definition

### 3. Reference Materials (Lines 151-250)
- Must-read files before starting
- Repository structure
- Critical code patterns

### 4. Phased Implementation (Lines 251-800)
- 6 detailed days with tasks
- Acceptance criteria for each day
- Reference files for each task
- Code examples and patterns

### 5. Security Requirements (Lines 801-950)
- ACP-240 compliance mandatory
- File validation requirements
- Upload authorization logic
- Audit logging requirements

### 6. Testing Requirements (Lines 951-1200)
- OPA test specifications
- Integration test specifications
- Manual testing checklist
- CI/CD requirements

### 7. API Specifications (Lines 1201-1500)
- Complete API request/response examples
- Error handling specifications
- Security metadata structures

### 8. Implementation Patterns (Lines 1501-1800)
- File upload flow diagram
- ZTDF conversion code example
- Upload authorization pattern
- Integration points with existing systems

### 9. Code Examples (Lines 1801-2000)
- Backend upload service skeleton
- Frontend upload page skeleton
- OPA rule examples
- Complete working examples

### 10. Final Checklist (Lines 2001-2124)
- Success criteria
- Quality requirements
- Commit message template
- Pre-flight checklist

---

## 🎓 What This Enables

### Immediate Value
- **Policy Transparency**: Users understand why access was granted/denied
- **Self-Service Upload**: Users can upload their own classified documents
- **Automated Security**: ZTDF conversion happens automatically
- **Compliance**: ACP-240 requirements met for all uploads

### Long-Term Benefits
- **Scalability**: Can handle user-generated content
- **Flexibility**: Can extend to policy editing (future)
- **Auditability**: Complete trail of all uploads
- **Interoperability**: ZTDF enables cross-domain sharing

---

## 📞 Support for Implementation

### If Implementation Issues Arise

**Problem**: OPA tests failing  
**Solution**: Review `policies/tests/acp240_compliance_tests.rego` pattern (lines referenced in prompt)

**Problem**: ZTDF conversion errors  
**Solution**: Check `backend/src/utils/ztdf.utils.ts` functions (encryptContent, createZTDFManifest, etc.)

**Problem**: Upload authorization not working  
**Solution**: Review OPA upload rules in prompt (lines 900-950)

**Problem**: TypeScript errors  
**Solution**: Check type definitions in `backend/src/types/ztdf.types.ts`

**Problem**: CI/CD failing  
**Solution**: Review `.github/workflows/ci.yml` (frontend requires --legacy-peer-deps)

---

## ✅ Verification Checklist (For Completion)

When Week 3.2 is complete, verify:

- [ ] Can navigate to `/policies` and see policy list
- [ ] Can view policy source code with syntax highlighting
- [ ] Can test policy decisions interactively
- [ ] Can navigate to `/upload` and see upload form
- [ ] Can drag-and-drop file and see preview
- [ ] Can select security labels and see display marking
- [ ] Upload creates new resource in ZTDF format
- [ ] Uploaded resource appears in `/resources` list
- [ ] Uploaded resource has STANAG 4774 label
- [ ] Upload authorization blocks above-clearance uploads
- [ ] OPA tests: 102+ passing
- [ ] Integration tests: 50+ passing
- [ ] TypeScript: 0 errors
- [ ] GitHub Actions: 100% passing

---

## 🎊 Conclusion

**Week 3.2 Implementation Prompt**: ✅ READY

This comprehensive prompt provides:
- ✅ Complete context for new chat session
- ✅ Clear phased implementation plan (6 days)
- ✅ Detailed technical specifications
- ✅ Security requirements (ACP-240 compliant)
- ✅ Testing strategy (TDD approach)
- ✅ Code examples and patterns
- ✅ Success criteria and checklists

**File**: `WEEK3.2-POLICY-UPLOAD-IMPLEMENTATION-PROMPT.md`  
**Lines**: 2,124  
**Commit**: `cdc8d9e`  
**Status**: Deployed to GitHub main

**Ready to start Week 3.2 in a new conversation!** 🚀

---

**Prepared by**: AI Coding Assistant (Claude Sonnet 4.5)  
**Date**: October 12, 2025  
**Quality**: Production-grade, comprehensive, actionable

