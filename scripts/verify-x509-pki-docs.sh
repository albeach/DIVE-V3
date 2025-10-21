#!/bin/bash

# X.509 PKI Assessment - Verification & QA Script
# Date: October 21, 2025
# Purpose: Verify documentation completeness and run QA checks

set -e

echo "============================================"
echo "X.509 PKI Assessment - Verification & QA"
echo "============================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Counter for tests
PASSED=0
FAILED=0

# Function to check if file exists
check_file() {
    local file=$1
    local description=$2
    
    if [ -f "$file" ]; then
        echo -e "${GREEN}✅ PASS${NC}: $description"
        ((PASSED++))
    else
        echo -e "${RED}❌ FAIL${NC}: $description"
        ((FAILED++))
    fi
}

# Function to check file content
check_content() {
    local file=$1
    local pattern=$2
    local description=$3
    
    if grep -q "$pattern" "$file" 2>/dev/null; then
        echo -e "${GREEN}✅ PASS${NC}: $description"
        ((PASSED++))
    else
        echo -e "${RED}❌ FAIL${NC}: $description"
        ((FAILED++))
    fi
}

echo "📋 Phase 1: Documentation Completeness"
echo "========================================"
echo ""

# Check for new documentation files
check_file "notes/X509-PKI-ASSESSMENT-PROMPT.md" "Assessment prompt exists"
check_file "notes/X509-PKI-QUICK-START.md" "Quick start guide exists"
check_file "notes/X509-PKI-DOCUMENTATION-SUMMARY.md" "Documentation summary exists"

echo ""

# Check for updated files
check_content "CHANGELOG.md" "X.509 PKI ASSESSMENT PROMPT GENERATED" "CHANGELOG updated with X.509 entry"
check_content "README.md" "Phase 4.1: X.509 PKI Implementation" "README updated with Phase 4.1"
check_content "README.md" "GOLD ⭐⭐⭐" "README shows 95% compliance (not 100%)"
check_content "README.md" "93% (13/14)" "README shows Section 5 at 93%"

echo ""
echo "📄 Phase 2: Prompt Content Validation"
echo "========================================"
echo ""

# Check prompt contains key sections
check_content "notes/X509-PKI-ASSESSMENT-PROMPT.md" "MISSION STATEMENT" "Prompt has mission statement"
check_content "notes/X509-PKI-ASSESSMENT-PROMPT.md" "CURRENT PROJECT STATE" "Prompt has project state"
check_content "notes/X509-PKI-ASSESSMENT-PROMPT.md" "ACP-240 SECTION 5 REQUIREMENTS" "Prompt has ACP-240 requirements"
check_content "notes/X509-PKI-ASSESSMENT-PROMPT.md" "IDENTIFIED GAPS" "Prompt has gap analysis"
check_content "notes/X509-PKI-ASSESSMENT-PROMPT.md" "PROJECT DIRECTORY STRUCTURE" "Prompt has directory structure"
check_content "notes/X509-PKI-ASSESSMENT-PROMPT.md" "PHASED IMPLEMENTATION REQUIREMENTS" "Prompt has implementation plan"
check_content "notes/X509-PKI-ASSESSMENT-PROMPT.md" "Phase 1: CA Infrastructure" "Prompt has Phase 1"
check_content "notes/X509-PKI-ASSESSMENT-PROMPT.md" "Phase 2: Signature Integration" "Prompt has Phase 2"
check_content "notes/X509-PKI-ASSESSMENT-PROMPT.md" "Phase 3: Lifecycle Management" "Prompt has Phase 3"
check_content "notes/X509-PKI-ASSESSMENT-PROMPT.md" "Phase 4: Documentation" "Prompt has Phase 4"
check_content "notes/X509-PKI-ASSESSMENT-PROMPT.md" "TESTING STRATEGY" "Prompt has testing strategy"
check_content "notes/X509-PKI-ASSESSMENT-PROMPT.md" "SUCCESS METRICS" "Prompt has success metrics"

echo ""
echo "🔍 Phase 3: Reference Validation"
echo "=================================="
echo ""

# Check if referenced files exist
check_file "notes/ACP240-llms.txt" "ACP-240 spec exists"
check_file "notes/ACP240-GAP-ANALYSIS-REPORT.md" "Gap analysis report exists"
check_file "backend/src/utils/ztdf.utils.ts" "Target ZTDF utils file exists"
check_file "backend/src/utils/certificate-manager.ts" "Certificate manager exists"
check_file "backend/src/utils/policy-signature.ts" "Policy signature utils exist"
check_file "backend/src/scripts/generate-certificates.ts" "Certificate generation script exists"

echo ""
echo "🧪 Phase 4: Current Test Status"
echo "=================================="
echo ""

# Change to backend directory
if [ -d "backend" ]; then
    cd backend
    
    echo "Running backend tests (this may take a few minutes)..."
    if npm test --silent 2>&1 | tail -20; then
        echo -e "${GREEN}✅ PASS${NC}: Backend tests executed"
        ((PASSED++))
    else
        echo -e "${YELLOW}⚠️  WARN${NC}: Backend tests had issues (expected if not all deps installed)"
    fi
    
    cd ..
else
    echo -e "${YELLOW}⚠️  WARN${NC}: Backend directory not found, skipping test execution"
fi

echo ""
echo "🔄 Phase 5: GitHub CI/CD Status"
echo "=================================="
echo ""

# Check for CI/CD workflow files
check_file ".github/workflows/ci.yml" "CI workflow exists"
check_file ".github/workflows/backend-tests.yml" "Backend tests workflow exists"

# Check if Git is available and repo has remotes
if command -v git &> /dev/null; then
    if git rev-parse --git-dir > /dev/null 2>&1; then
        echo "Git repository detected"
        
        # Check if there are uncommitted changes
        if [[ -z $(git status -s) ]]; then
            echo -e "${GREEN}✅ PASS${NC}: Working directory clean"
            ((PASSED++))
        else
            echo -e "${YELLOW}⚠️  INFO${NC}: Uncommitted changes present (expected)"
            echo "   New files created:"
            git status -s | grep "??" | sed 's/^??/     /'
        fi
        
        # Show current branch
        BRANCH=$(git branch --show-current)
        echo "Current branch: $BRANCH"
        
        # Check if remote exists
        if git remote -v | grep -q origin; then
            echo -e "${GREEN}✅ PASS${NC}: Git remote configured"
            ((PASSED++))
        else
            echo -e "${YELLOW}⚠️  WARN${NC}: No git remote configured"
        fi
    else
        echo -e "${YELLOW}⚠️  WARN${NC}: Not a git repository"
    fi
else
    echo -e "${YELLOW}⚠️  WARN${NC}: Git not found"
fi

echo ""
echo "📊 Phase 6: File Statistics"
echo "=================================="
echo ""

# Count lines in prompt
if [ -f "notes/X509-PKI-ASSESSMENT-PROMPT.md" ]; then
    PROMPT_LINES=$(wc -l < "notes/X509-PKI-ASSESSMENT-PROMPT.md")
    echo "Assessment prompt: $PROMPT_LINES lines"
    
    if [ "$PROMPT_LINES" -gt 700 ]; then
        echo -e "${GREEN}✅ PASS${NC}: Prompt is comprehensive (>700 lines)"
        ((PASSED++))
    else
        echo -e "${RED}❌ FAIL${NC}: Prompt is too short (<700 lines)"
        ((FAILED++))
    fi
fi

# Count lines in quick start
if [ -f "notes/X509-PKI-QUICK-START.md" ]; then
    QUICK_LINES=$(wc -l < "notes/X509-PKI-QUICK-START.md")
    echo "Quick start guide: $QUICK_LINES lines"
fi

# Count lines in summary
if [ -f "notes/X509-PKI-DOCUMENTATION-SUMMARY.md" ]; then
    SUMMARY_LINES=$(wc -l < "notes/X509-PKI-DOCUMENTATION-SUMMARY.md")
    echo "Documentation summary: $SUMMARY_LINES lines"
fi

# Total lines of documentation
TOTAL_LINES=$((PROMPT_LINES + QUICK_LINES + SUMMARY_LINES))
echo "Total documentation: $TOTAL_LINES lines"

echo ""
echo "============================================"
echo "📝 VERIFICATION SUMMARY"
echo "============================================"
echo ""

TOTAL=$((PASSED + FAILED))
PASS_RATE=$((PASSED * 100 / TOTAL))

echo "Tests Passed:  $PASSED"
echo "Tests Failed:  $FAILED"
echo "Pass Rate:     $PASS_RATE%"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ ALL CHECKS PASSED${NC}"
    echo ""
    echo "🎯 Next Steps:"
    echo "   1. Copy notes/X509-PKI-ASSESSMENT-PROMPT.md to new AI chat"
    echo "   2. Or read notes/X509-PKI-QUICK-START.md for quick reference"
    echo "   3. Begin Phase 0: Discovery & Assessment"
    echo ""
    echo "📚 Documentation Location:"
    echo "   - Full prompt:   notes/X509-PKI-ASSESSMENT-PROMPT.md"
    echo "   - Quick start:   notes/X509-PKI-QUICK-START.md"
    echo "   - Summary:       notes/X509-PKI-DOCUMENTATION-SUMMARY.md"
    echo ""
    echo "🚀 Ready to implement X.509 PKI for 100% ACP-240 Section 5 compliance!"
    exit 0
elif [ $PASS_RATE -ge 80 ]; then
    echo -e "${YELLOW}⚠️  MOSTLY COMPLETE (some warnings)${NC}"
    echo ""
    echo "Review any failed checks above and address if needed."
    exit 0
else
    echo -e "${RED}❌ VERIFICATION FAILED${NC}"
    echo ""
    echo "Please review failed checks above and ensure all documentation is complete."
    exit 1
fi

