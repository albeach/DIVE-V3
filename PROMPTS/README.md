# DIVE V3 - AI Agent Prompts

This directory contains comprehensive prompts for AI agents to perform specialized tasks on the DIVE V3 codebase.

---

## 📋 Available Prompts

### 1. ACP240-GAP-ANALYSIS-PROMPT.md

**Purpose**: Comprehensive NATO ACP-240 compliance gap analysis

**Use Case**: Start a new AI chat session to:
- Analyze all ACP-240 requirements vs current implementation
- Identify compliance gaps with priority classification
- Remediate critical and high-priority gaps
- Update documentation and run full QA testing
- Ensure CI/CD pipeline passes
- Commit and push changes

**Duration**: 3-5 hours (depending on gaps found)

**Prerequisites**:
- All services running (Docker + backend + frontend)
- MongoDB seeded with test data
- Access to `notes/ACP240-llms.txt` (authoritative requirements)

**Deliverables**:
- `ACP240-GAP-ANALYSIS-REPORT.md` - Comprehensive findings
- Code fixes for critical gaps
- Updated documentation (README, CHANGELOG, IMPLEMENTATION-PLAN)
- Passing test suite (100%)
- GitHub commit with CI/CD verification

**How to Use**:
1. Open a new AI chat session (Claude, GPT-4, etc.)
2. Attach the file: `PROMPTS/ACP240-GAP-ANALYSIS-PROMPT.md`
3. Attach the requirements: `notes/ACP240-llms.txt`
4. Start with: "Please conduct the ACP-240 gap analysis as specified in the prompt"
5. Let the AI work systematically through all sections
6. Review the gap analysis report when complete

---

## 🎯 Prompt Structure

Each prompt in this directory follows a standard structure:

1. **Task Overview** - Clear objectives and scope
2. **Context** - Current implementation state from CHANGELOG
3. **Project Structure** - Annotated directory tree with focus areas
4. **Requirements Checklist** - Systematic coverage of all requirements
5. **Methodology** - Step-by-step analysis approach
6. **Expected Gaps** - Known issues to investigate
7. **Success Criteria** - Clear definition of completion
8. **Deliverables** - Specific outputs required
9. **Testing Requirements** - QA verification steps
10. **Commit Guidelines** - Professional git workflow

---

## 📚 Related Documentation

### For Gap Analysis Context:
- `../notes/ACP240-llms.txt` - NATO ACP-240 requirements
- `../CHANGELOG.md` - Recent implementation changes
- `../ZTDF-COMPLIANCE-AUDIT.md` - Known gaps and status
- `../docs/IMPLEMENTATION-PLAN.md` - Roadmap and progress

### For Reference:
- `../README.md` - Project overview
- `../docs/PHASE4-IMPLEMENTATION-PROMPT.md` - Latest phase guidance
- `../backend/TESTING-GUIDE.md` - Test structure and patterns

---

## 🔄 Maintenance

### When to Update Prompts:

1. **After Major Implementation Changes**
   - Update "Context" section with latest CHANGELOG
   - Revise "Expected Gaps" based on recent fixes
   - Update test count statistics

2. **After ACP-240 Requirements Changes**
   - Update requirements sections
   - Add new compliance areas
   - Revise priority classifications

3. **After Architecture Changes**
   - Update project structure diagrams
   - Revise file path references
   - Update code examples

### Prompt Versioning:

Each prompt should include:
- Creation date
- Last updated date
- Relevant commit hash
- Compatible with codebase version

---

## 🎯 Future Prompts (Planned)

### 2. MULTI-KAS-IMPLEMENTATION-PROMPT.md
**Status**: Planned  
**Purpose**: Implement multiple KAS support for coalition scalability  
**Priority**: HIGH  

### 3. COI-KEYS-IMPLEMENTATION-PROMPT.md
**Status**: Planned  
**Purpose**: Implement COI-based community keys instead of per-resource DEKs  
**Priority**: HIGH  

### 4. X509-SIGNATURE-IMPLEMENTATION-PROMPT.md
**Status**: Planned  
**Purpose**: Implement X.509 digital signature verification for ZTDF policies  
**Priority**: MEDIUM  

### 5. PRODUCTION-HARDENING-PROMPT.md
**Status**: Planned  
**Purpose**: HSM integration, production security hardening, and deployment  
**Priority**: LOW (post-pilot)  

---

## 💡 Best Practices for Using Prompts

1. **Always start fresh**: Use new chat session for each prompt
2. **Attach all references**: Include requirements files and relevant docs
3. **Monitor progress**: Check intermediate outputs, don't just wait for completion
4. **Verify deliverables**: Review the gap analysis report thoroughly
5. **Test locally first**: Run all tests before pushing to GitHub
6. **Review commits**: Ensure commit messages are detailed and professional

---

## 📞 Support

For questions about prompts or gap analysis:
1. Review this README
2. Check the prompt file itself (includes examples)
3. Consult recent CHANGELOG entries for context
4. Review `docs/IMPLEMENTATION-PLAN.md` for roadmap

---

**Last Updated**: October 17, 2025  
**Maintainer**: DIVE V3 Development Team  
**Repository**: https://github.com/albeach/DIVE-V3

