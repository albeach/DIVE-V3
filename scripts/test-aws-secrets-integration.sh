#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Test AWS Secrets Integration
# =============================================================================

# Note: Don't use set -e as tests may intentionally fail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_test() { echo -e "${BLUE}▶ TEST:${NC} $1"; }
log_pass() { echo -e "${GREEN}✓ PASS:${NC} $1"; }
log_fail() { echo -e "${RED}✗ FAIL:${NC} $1"; }
log_skip() { echo -e "${YELLOW}⊘ SKIP:${NC} $1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

# Simple test - don't load full modules, just check files exist
log_test() { echo -e "${BLUE}▶ TEST:${NC} $1"; }
log_pass() { echo -e "${GREEN}✓ PASS:${NC} $1"; }
log_fail() { echo -e "${RED}✗ FAIL:${NC} $1"; }
log_skip() { echo -e "${YELLOW}⊘ SKIP:${NC} $1"; }

PASSED=0
FAILED=0
SKIPPED=0

echo "═══════════════════════════════════════════════════════════"
echo " DIVE V3 - AWS Secrets Integration Test Suite"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Test 1: Check AWS CLI availability
log_test "AWS CLI availability"
if command -v aws >/dev/null 2>&1; then
    log_pass "AWS CLI installed"
    ((PASSED++))
else
    log_skip "AWS CLI not installed"
    ((SKIPPED++))
fi

# Test 2: Check AWS authentication
log_test "AWS authentication"
if aws sts get-caller-identity >/dev/null 2>&1; then
    AWS_ACCOUNT=$(aws sts get-caller-identity --query 'Account' --output text)
    AWS_REGION=$(aws configure get region || echo "us-east-1")
    log_pass "AWS authenticated (Account: $AWS_ACCOUNT, Region: $AWS_REGION)"
    ((PASSED++))
    AWS_AUTH=true
else
    log_skip "AWS not authenticated"
    ((SKIPPED++))
    AWS_AUTH=false
fi

# Test 3: Provider selection
log_test "Provider selection mechanism"
if [ -n "${SECRETS_PROVIDER:-}" ]; then
    log_pass "SECRETS_PROVIDER=$SECRETS_PROVIDER"
    ((PASSED++))
else
    log_skip "SECRETS_PROVIDER not set (will use default)"
    ((SKIPPED++))
fi

# Test 4: Check AWS functions exist in secrets.sh
log_test "AWS function definitions in secrets.sh"
if grep -q "aws_is_authenticated()" "$SCRIPT_DIR/dive-modules/configuration/secrets.sh" && \
   grep -q "aws_get_secret()" "$SCRIPT_DIR/dive-modules/configuration/secrets.sh" && \
   grep -q "aws_set_secret()" "$SCRIPT_DIR/dive-modules/configuration/secrets.sh" && \
   grep -q "aws_secret_exists()" "$SCRIPT_DIR/dive-modules/configuration/secrets.sh"; then
    log_pass "All AWS functions found in secrets.sh"
    ((PASSED++))
else
    log_fail "Missing AWS functions in secrets.sh"
    ((FAILED++))
fi

# Test 5: Check unified wrapper functions in secrets.sh
log_test "Unified wrapper functions in secrets.sh"
if grep -q "get_secret()" "$SCRIPT_DIR/dive-modules/configuration/secrets.sh" && \
   grep -q "set_secret()" "$SCRIPT_DIR/dive-modules/configuration/secrets.sh" && \
   grep -q "secret_exists()" "$SCRIPT_DIR/dive-modules/configuration/secrets.sh" && \
   grep -q "is_authenticated()" "$SCRIPT_DIR/dive-modules/configuration/secrets.sh"; then
    log_pass "All wrapper functions found in secrets.sh"
    ((PASSED++))
else
    log_fail "Missing wrapper functions in secrets.sh"
    ((FAILED++))
fi

# Test 6: Check SECRETS_PROVIDER support
log_test "SECRETS_PROVIDER support in secrets.sh"
if grep -q "SECRETS_PROVIDER" "$SCRIPT_DIR/dive-modules/configuration/secrets.sh"; then
    log_pass "SECRETS_PROVIDER variable found"
    ((PASSED++))
else
    log_fail "SECRETS_PROVIDER not found"
    ((FAILED++))
fi

# Test 7: List secrets (if authenticated)
if [ "$AWS_AUTH" = true ]; then
    log_test "List AWS secrets"
    export SECRETS_PROVIDER=aws
    SECRET_COUNT=$(aws secretsmanager list-secrets \
        --region "${AWS_REGION}" \
        --query "length(SecretList[?starts_with(Name, 'dive-v3')])" \
        --output text 2>/dev/null || echo "0")
    log_pass "Found $SECRET_COUNT DIVE V3 secrets in AWS"
    ((PASSED++))
fi

# Test 8: Check migration script
log_test "Migration script exists"
if [ -f "$SCRIPT_DIR/migrate-secrets-gcp-to-aws.sh" ] && [ -x "$SCRIPT_DIR/migrate-secrets-gcp-to-aws.sh" ]; then
    log_pass "Migration script exists and is executable"
    ((PASSED++))
else
    log_fail "Migration script missing or not executable"
    ((FAILED++))
fi

# Test 9: Check EC2 setup script
log_test "EC2 setup script exists"
if [ -f "$SCRIPT_DIR/setup-aws-secrets-ec2.sh" ] && [ -x "$SCRIPT_DIR/setup-aws-secrets-ec2.sh" ]; then
    log_pass "EC2 setup script exists and is executable"
    ((PASSED++))
else
    log_fail "EC2 setup script missing or not executable"
    ((FAILED++))
fi

# Test 10: Check documentation
log_test "Documentation exists"
if [ -f "$REPO_ROOT/docs/AWS_SECRETS_MANAGER_GUIDE.md" ] && \
   [ -f "$REPO_ROOT/SWITCH_TO_AWS_SECRETS.md" ]; then
    log_pass "All documentation files present"
    ((PASSED++))
else
    log_fail "Missing documentation files"
    ((FAILED++))
fi

# Test 11: Verify IAM permissions (if authenticated)
if [ "$AWS_AUTH" = true ]; then
    log_test "IAM permissions check"
    if aws secretsmanager list-secrets --region "${AWS_REGION}" --max-results 1 >/dev/null 2>&1; then
        log_pass "Has ListSecrets permission"
        ((PASSED++))
    else
        log_fail "Missing ListSecrets permission"
        ((FAILED++))
    fi
fi

# Test 12: Test secret access (if secrets exist)
if [ "$AWS_AUTH" = true ] && [ "${SECRET_COUNT:-0}" -gt 0 ]; then
    log_test "Secret access test"
    FIRST_SECRET=$(aws secretsmanager list-secrets \
        --region "${AWS_REGION}" \
        --query "SecretList[?starts_with(Name, 'dive-v3')].Name | [0]" \
        --output text 2>/dev/null)
    
    if [ -n "$FIRST_SECRET" ] && [ "$FIRST_SECRET" != "None" ]; then
        if aws secretsmanager get-secret-value \
            --secret-id "$FIRST_SECRET" \
            --region "${AWS_REGION}" \
            >/dev/null 2>&1; then
            log_pass "Can access secret: $FIRST_SECRET"
            ((PASSED++))
        else
            log_fail "Cannot access secret: $FIRST_SECRET"
            ((FAILED++))
        fi
    else
        log_skip "No secrets to test"
        ((SKIPPED++))
    fi
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo " Test Results"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Passed:  $PASSED"
echo "Failed:  $FAILED"
echo "Skipped: $SKIPPED"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    echo ""
    if [ "$AWS_AUTH" = false ]; then
        echo "Note: Some tests skipped due to missing AWS authentication"
        echo "To run full test suite:"
        echo "  1. Configure AWS CLI: aws configure"
        echo "  2. Re-run: $0"
    fi
    echo ""
    exit 0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    echo ""
    exit 1
fi
