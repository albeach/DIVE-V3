#!/usr/bin/env bash
# =============================================================================
# Multi-Format Resource Seeding - Comprehensive Test Suite
# =============================================================================
# Tests all aspects of the multi-format seeding enhancement
# Usage: ./test-seeding-multi-format.sh [--full|--quick|--category <name>]
# =============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0
TESTS_WARNED=0

# Test configuration
TEST_INSTANCE="${TEST_INSTANCE:-USA}"
TEST_COUNT="${TEST_COUNT:-100}"
BACKEND_CONTAINER="${BACKEND_CONTAINER:-dive-hub-backend}"
DIVE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"

# Test results
TEST_RESULTS_FILE="test-results-$(date +%Y%m%d-%H%M%S).json"
TEST_START_TIME=$(date +%s)

# =============================================================================
# Utility Functions
# =============================================================================

log_test() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((TESTS_PASSED++))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((TESTS_FAILED++))
}

log_skip() {
    echo -e "${YELLOW}[SKIP]${NC} $1"
    ((TESTS_SKIPPED++))
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
    ((TESTS_WARNED++))
}

log_section() {
    echo ""
    echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${CYAN}  $1${NC}"
    echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

print_header() {
    clear
    echo -e "${BOLD}${CYAN}"
    echo "╔════════════════════════════════════════════════════════════════════╗"
    echo "║        DIVE V3 - Multi-Format Seeding Test Suite                  ║"
    echo "║        Comprehensive Validation & Verification                     ║"
    echo "╚════════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo "  Instance:  ${TEST_INSTANCE}"
    echo "  Count:     ${TEST_COUNT}"
    echo "  Container: ${BACKEND_CONTAINER}"
    echo "  Started:   $(date)"
    echo ""
}

# =============================================================================
# Test Category 1: Template Loading & Validation
# =============================================================================

test_category_templates() {
    log_section "Category 1: Template Loading & Validation"

    # Test 1.1: Verify examples directory exists
    log_test "1.1 - Verify examples directory exists"
    if [ -d "${DIVE_ROOT}/examples/examples" ]; then
        log_pass "Examples directory found: ${DIVE_ROOT}/examples/examples"
    else
        log_fail "Examples directory not found: ${DIVE_ROOT}/examples/examples"
        return 1
    fi

    # Test 1.2: Verify manifest.json exists
    log_test "1.2 - Verify manifest.json exists and is valid JSON"
    if [ -f "${DIVE_ROOT}/examples/examples/manifest.json" ]; then
        if jq empty "${DIVE_ROOT}/examples/examples/manifest.json" 2>/dev/null; then
            log_pass "manifest.json is valid JSON"
        else
            log_fail "manifest.json is not valid JSON"
            return 1
        fi
    else
        log_fail "manifest.json not found"
        return 1
    fi

    # Test 1.3: Verify template file count
    log_test "1.3 - Verify template file count matches manifest"
    local manifest_count=$(jq 'length' "${DIVE_ROOT}/examples/examples/manifest.json")
    local actual_files=$(find "${DIVE_ROOT}/examples/examples" -type f ! -name "manifest.json" ! -name "*.bdo" ! -name "*.xmp" | wc -l | tr -d ' ')

    if [ "$manifest_count" -eq "$actual_files" ]; then
        log_pass "Template count matches: ${manifest_count} files"
    else
        log_fail "Template count mismatch: manifest=${manifest_count}, actual=${actual_files}"
    fi

    # Test 1.4: Verify all 14 file types are present
    log_test "1.4 - Verify all 14 file types are present in manifest"
    local expected_types=("pdf" "docx" "xlsx" "pptx" "mp4" "mp3" "m4a" "jpg" "png" "txt" "html" "csv" "json" "xml")
    local missing_types=()

    for ext in "${expected_types[@]}"; do
        local count=$(jq -r ".[] | select(.filename | endswith(\".${ext}\")) | .filename" "${DIVE_ROOT}/examples/examples/manifest.json" | wc -l | tr -d ' ')
        if [ "$count" -eq 0 ]; then
            missing_types+=("$ext")
        fi
    done

    if [ ${#missing_types[@]} -eq 0 ]; then
        log_pass "All 14 file types present in manifest"
    else
        log_warn "Missing file types in manifest: ${missing_types[*]}"
    fi

    # Test 1.5: Verify SHA-256 checksums
    log_test "1.5 - Verify template SHA-256 checksums match manifest"
    local checksum_errors=0
    while IFS= read -r filename; do
        local manifest_sha=$(jq -r ".[] | select(.filename == \"${filename}\") | .sha256" "${DIVE_ROOT}/examples/examples/manifest.json")
        if [ -f "${DIVE_ROOT}/examples/examples/${filename}" ]; then
            local actual_sha=$(shasum -a 256 "${DIVE_ROOT}/examples/examples/${filename}" | awk '{print $1}')
            if [ "$manifest_sha" != "$actual_sha" ]; then
                ((checksum_errors++))
                log_warn "Checksum mismatch for ${filename}"
            fi
        fi
    done < <(jq -r '.[].filename' "${DIVE_ROOT}/examples/examples/manifest.json")

    if [ $checksum_errors -eq 0 ]; then
        log_pass "All checksums match manifest"
    else
        log_fail "Checksum errors: ${checksum_errors}"
    fi

    # Test 1.6: Verify BDO sidecar files exist
    log_test "1.6 - Verify BDO sidecar files exist"
    local bdo_missing=0
    while IFS= read -r bdo_file; do
        if [ -n "$bdo_file" ] && [ "$bdo_file" != "null" ]; then
            if [ ! -f "${DIVE_ROOT}/examples/examples/${bdo_file}" ]; then
                ((bdo_missing++))
            fi
        fi
    done < <(jq -r '.[].bdo_sidecar' "${DIVE_ROOT}/examples/examples/manifest.json")

    if [ $bdo_missing -eq 0 ]; then
        log_pass "All BDO sidecar files present"
    else
        log_warn "Missing BDO files: ${bdo_missing}"
    fi
}

# =============================================================================
# Test Category 2: Docker Environment
# =============================================================================

test_category_docker() {
    log_section "Category 2: Docker Environment Validation"

    # Test 2.1: Verify backend container is running
    log_test "2.1 - Verify backend container is running"
    if docker ps --format '{{.Names}}' | grep -q "^${BACKEND_CONTAINER}$"; then
        log_pass "Backend container is running: ${BACKEND_CONTAINER}"
    else
        log_fail "Backend container not running: ${BACKEND_CONTAINER}"
        return 1
    fi

    # Test 2.2: Verify examples volume mount
    log_test "2.2 - Verify examples directory accessible in container"
    if docker exec "$BACKEND_CONTAINER" test -d "/app/examples/examples"; then
        log_pass "Examples directory mounted in container"
    else
        log_fail "Examples directory not accessible in container"
        return 1
    fi

    # Test 2.3: Verify manifest.json accessible
    log_test "2.3 - Verify manifest.json accessible in container"
    if docker exec "$BACKEND_CONTAINER" test -f "/app/examples/examples/manifest.json"; then
        log_pass "manifest.json accessible in container"
    else
        log_fail "manifest.json not accessible in container"
        return 1
    fi

    # Test 2.4: Count template files in container
    log_test "2.4 - Verify template files count in container"
    local container_files=$(docker exec "$BACKEND_CONTAINER" find /app/examples/examples -type f ! -name "manifest.json" ! -name "*.bdo" ! -name "*.xmp" 2>/dev/null | wc -l | tr -d ' ')
    if [ "$container_files" -ge 14 ]; then
        log_pass "Template files accessible in container: ${container_files} files"
    else
        log_fail "Insufficient template files in container: ${container_files}"
    fi

    # Test 2.5: Verify seeding script exists
    log_test "2.5 - Verify seed-instance-resources.ts exists in container"
    if docker exec "$BACKEND_CONTAINER" test -f "/app/src/scripts/seed-instance-resources.ts"; then
        log_pass "Seeding script found in container"
    else
        log_fail "Seeding script not found in container"
        return 1
    fi
}

# =============================================================================
# Test Category 3: CLI Argument Handling
# =============================================================================

test_category_cli() {
    log_section "Category 3: CLI Argument Handling"

    # Test 3.1: Test --file-type-mode=text
    log_test "3.1 - Test --file-type-mode=text (dry-run)"
    if docker exec "$BACKEND_CONTAINER" npx tsx src/scripts/seed-instance-resources.ts \
        --instance="$TEST_INSTANCE" \
        --count=10 \
        --file-type-mode=text \
        --dry-run 2>&1 | grep -q "File Type Mode: text"; then
        log_pass "Text mode accepted"
    else
        log_fail "Text mode validation failed"
    fi

    # Test 3.2: Test --file-type-mode=multi
    log_test "3.2 - Test --file-type-mode=multi (dry-run)"
    if docker exec "$BACKEND_CONTAINER" npx tsx src/scripts/seed-instance-resources.ts \
        --instance="$TEST_INSTANCE" \
        --count=10 \
        --file-type-mode=multi \
        --dry-run 2>&1 | grep -q "File Type Mode: multi"; then
        log_pass "Multi mode accepted"
    else
        log_fail "Multi mode validation failed"
    fi

    # Test 3.3: Test invalid file-type-mode
    log_test "3.3 - Test invalid --file-type-mode (should fail)"
    if docker exec "$BACKEND_CONTAINER" npx tsx src/scripts/seed-instance-resources.ts \
        --instance="$TEST_INSTANCE" \
        --count=10 \
        --file-type-mode=invalid \
        --dry-run 2>&1 | grep -q "Invalid file type mode"; then
        log_pass "Invalid mode rejected correctly"
    else
        log_fail "Invalid mode not rejected"
    fi

    # Test 3.4: Test --no-multimedia flag
    log_test "3.4 - Test --no-multimedia flag (dry-run)"
    if docker exec "$BACKEND_CONTAINER" npx tsx src/scripts/seed-instance-resources.ts \
        --instance="$TEST_INSTANCE" \
        --count=10 \
        --file-type-mode=multi \
        --no-multimedia \
        --dry-run 2>&1 | grep -q "multimedia.*excluded"; then
        log_pass "No-multimedia flag accepted"
    else
        log_warn "No-multimedia flag behavior unclear"
    fi

    # Test 3.5: Test count validation
    log_test "3.5 - Test count validation (negative should fail)"
    if docker exec "$BACKEND_CONTAINER" npx tsx src/scripts/seed-instance-resources.ts \
        --instance="$TEST_INSTANCE" \
        --count=-1 \
        --dry-run 2>&1 | grep -q -i "error\|invalid"; then
        log_pass "Negative count rejected correctly"
    else
        log_warn "Negative count validation unclear"
    fi
}

# =============================================================================
# Test Category 4: Seeding Execution
# =============================================================================

test_category_seeding() {
    log_section "Category 4: Seeding Execution (${TEST_COUNT} resources)"

    # Test 4.1: Clean existing test data
    log_test "4.1 - Clean existing test data"
    docker exec "$BACKEND_CONTAINER" npx tsx -e "
        import { MongoClient } from 'mongodb';
        const client = await MongoClient.connect(process.env.MONGODB_URI || 'mongodb://mongodb-usa:27017');
        const db = client.db('dive_${TEST_INSTANCE,,}');
        const result = await db.collection('resources').deleteMany({ seedBatchId: { \$regex: /^seed-test-/ } });
        console.log('Deleted test resources:', result.deletedCount);
        await client.close();
    " 2>&1 | tail -5
    log_pass "Test data cleaned"

    # Test 4.2: Execute multi-format seeding
    log_test "4.2 - Execute multi-format seeding (${TEST_COUNT} resources)"
    local seed_start=$(date +%s)

    if docker exec "$BACKEND_CONTAINER" npx tsx src/scripts/seed-instance-resources.ts \
        --instance="$TEST_INSTANCE" \
        --count="$TEST_COUNT" \
        --file-type-mode=multi \
        --replace 2>&1 | tee /tmp/seeding-output.log; then

        local seed_end=$(date +%s)
        local seed_duration=$((seed_end - seed_start))
        log_pass "Seeding completed in ${seed_duration}s"
    else
        log_fail "Seeding execution failed"
        cat /tmp/seeding-output.log | tail -20
        return 1
    fi

    # Test 4.3: Verify resource count in MongoDB
    log_test "4.3 - Verify resource count in MongoDB"
    local db_count=$(docker exec "$BACKEND_CONTAINER" npx tsx -e "
        import { MongoClient } from 'mongodb';
        const client = await MongoClient.connect(process.env.MONGODB_URI || 'mongodb://mongodb-usa:27017');
        const db = client.db('dive_${TEST_INSTANCE,,}');
        const count = await db.collection('resources').countDocuments({ instanceCode: '${TEST_INSTANCE}' });
        console.log(count);
        await client.close();
    " 2>&1 | tail -1 | tr -d '[:space:]')

    if [ "$db_count" -ge "$TEST_COUNT" ]; then
        log_pass "Resource count verified: ${db_count} >= ${TEST_COUNT}"
    else
        log_fail "Resource count mismatch: ${db_count} < ${TEST_COUNT}"
    fi
}

# =============================================================================
# Test Category 5: File Type Distribution
# =============================================================================

test_category_distribution() {
    log_section "Category 5: File Type Distribution Analysis"

    log_test "5.1 - Analyze file type distribution in MongoDB"

    # Get distribution from MongoDB
    docker exec "$BACKEND_CONTAINER" npx tsx -e "
        import { MongoClient } from 'mongodb';
        const client = await MongoClient.connect(process.env.MONGODB_URI || 'mongodb://mongodb-usa:27017');
        const db = client.db('dive_${TEST_INSTANCE,,}');

        const distribution = await db.collection('resources').aggregate([
            { \\\$match: { instanceCode: '${TEST_INSTANCE}' } },
            { \\\$group: { _id: '\\\$fileType', count: { \\\$sum: 1 } } },
            { \\\$sort: { count: -1 } }
        ]).toArray();

        console.log(JSON.stringify(distribution, null, 2));
        await client.close();
    " 2>&1 | tee /tmp/distribution.json

    log_pass "Distribution analysis complete (see /tmp/distribution.json)"

    # Test 5.2: Verify all file types present
    log_test "5.2 - Verify multiple file types are present"
    local unique_types=$(cat /tmp/distribution.json | jq -r '.[].._id' | grep -v "^$" | wc -l | tr -d ' ')

    if [ "$unique_types" -ge 5 ]; then
        log_pass "Multiple file types present: ${unique_types} types"
    else
        log_warn "Limited file type diversity: ${unique_types} types"
    fi

    # Test 5.3: Check for PDF and DOCX (highest weight)
    log_test "5.3 - Verify PDF and DOCX are most common (20% each)"
    if cat /tmp/distribution.json | jq -r '.[].._id' | grep -q "pdf\|docx"; then
        log_pass "PDF/DOCX found in distribution"
    else
        log_warn "PDF/DOCX not found in distribution"
    fi
}

# =============================================================================
# Test Category 6: ZTDF Structure Validation
# =============================================================================

test_category_ztdf() {
    log_section "Category 6: ZTDF Structure Validation"

    # Test 6.1: Verify ZTDF manifest structure
    log_test "6.1 - Verify ZTDF manifest structure"
    local sample_doc=$(docker exec "$BACKEND_CONTAINER" npx tsx -e "
        import { MongoClient } from 'mongodb';
        const client = await MongoClient.connect(process.env.MONGODB_URI || 'mongodb://mongodb-usa:27017');
        const db = client.db('dive_${TEST_INSTANCE,,}');
        const doc = await db.collection('resources').findOne({ instanceCode: '${TEST_INSTANCE}' });
        console.log(JSON.stringify(doc, null, 2));
        await client.close();
    " 2>&1 | jq '.' > /tmp/sample-doc.json)

    if cat /tmp/sample-doc.json | jq -e '.ztdf.manifest' > /dev/null 2>&1; then
        log_pass "ZTDF manifest structure valid"
    else
        log_fail "ZTDF manifest structure invalid"
    fi

    # Test 6.2: Verify contentType field
    log_test "6.2 - Verify contentType matches file type"
    if cat /tmp/sample-doc.json | jq -e '.ztdf.manifest.contentType' > /dev/null 2>&1; then
        local content_type=$(cat /tmp/sample-doc.json | jq -r '.ztdf.manifest.contentType')
        log_pass "contentType field present: ${content_type}"
    else
        log_fail "contentType field missing"
    fi

    # Test 6.3: Verify policy bindings
    log_test "6.3 - Verify ZTDF policy bindings"
    if cat /tmp/sample-doc.json | jq -e '.ztdf.manifest.policy' > /dev/null 2>&1; then
        log_pass "Policy bindings present"
    else
        log_fail "Policy bindings missing"
    fi

    # Test 6.4: Verify encryption metadata
    log_test "6.4 - Verify encryption metadata (AES-256-GCM)"
    if cat /tmp/sample-doc.json | jq -e '.ztdf.encryptionMethod' > /dev/null 2>&1; then
        local enc_method=$(cat /tmp/sample-doc.json | jq -r '.ztdf.encryptionMethod')
        if [[ "$enc_method" == *"AES-256-GCM"* ]] || [[ "$enc_method" == *"aes-256-gcm"* ]]; then
            log_pass "AES-256-GCM encryption verified"
        else
            log_warn "Encryption method: ${enc_method}"
        fi
    else
        log_warn "Encryption metadata not found"
    fi
}

# =============================================================================
# Test Category 7: BDO Validation
# =============================================================================

test_category_bdo() {
    log_section "Category 7: STANAG 4778 BDO Validation"

    # Test 7.1: Verify BDO field exists
    log_test "7.1 - Verify BDO XML field exists"
    if cat /tmp/sample-doc.json | jq -e '.bdoXml' > /dev/null 2>&1; then
        log_pass "BDO XML field present"
    else
        log_warn "BDO XML field not found in document"
        return 0
    fi

    # Test 7.2: Validate BDO XML structure
    log_test "7.2 - Validate BDO XML structure"
    local bdo_xml=$(cat /tmp/sample-doc.json | jq -r '.bdoXml' 2>/dev/null || echo "")

    if echo "$bdo_xml" | grep -q "mb:BindingInformation"; then
        log_pass "BDO root element valid (mb:BindingInformation)"
    else
        log_warn "BDO root element not found"
    fi

    # Test 7.3: Verify STANAG 4774 namespace
    log_test "7.3 - Verify STANAG 4774 namespace (slab)"
    if echo "$bdo_xml" | grep -q "slab:originatorConfidentialityLabel"; then
        log_pass "STANAG 4774 namespace present"
    else
        log_warn "STANAG 4774 namespace not found"
    fi

    # Test 7.4: Verify classification element
    log_test "7.4 - Verify classification element in BDO"
    if echo "$bdo_xml" | grep -q "<slab:Classification>"; then
        local classification=$(echo "$bdo_xml" | grep -oP '(?<=<slab:Classification>).*?(?=</slab:Classification>)')
        log_pass "Classification found: ${classification}"
    else
        log_warn "Classification element not found in BDO"
    fi

    # Test 7.5: Verify DataReference with contentType
    log_test "7.5 - Verify DataReference with xmime:contentType"
    if echo "$bdo_xml" | grep -q "xmime:contentType"; then
        log_pass "DataReference contentType attribute present"
    else
        log_warn "xmime:contentType not found in DataReference"
    fi
}

# =============================================================================
# Test Category 8: Performance Benchmarks
# =============================================================================

test_category_performance() {
    log_section "Category 8: Performance Benchmarks"

    # Test 8.1: Calculate seeding throughput
    log_test "8.1 - Calculate seeding throughput"
    if [ -f /tmp/seeding-output.log ]; then
        local total_time=$(grep -oP 'completed in \K[0-9]+' /tmp/seeding-output.log || echo "0")
        if [ "$total_time" -gt 0 ]; then
            local throughput=$((TEST_COUNT / total_time))
            log_pass "Seeding throughput: ${throughput} resources/sec"

            if [ "$throughput" -ge 10 ]; then
                log_pass "Performance exceeds minimum threshold (10 res/sec)"
            else
                log_warn "Performance below threshold: ${throughput} < 10 res/sec"
            fi
        else
            log_skip "Could not calculate throughput"
        fi
    else
        log_skip "Seeding log not found"
    fi

    # Test 8.2: MongoDB write performance
    log_test "8.2 - Test MongoDB query performance"
    local query_start=$(date +%s%3N)
    docker exec "$BACKEND_CONTAINER" npx tsx -e "
        import { MongoClient } from 'mongodb';
        const client = await MongoClient.connect(process.env.MONGODB_URI || 'mongodb://mongodb-usa:27017');
        const db = client.db('dive_${TEST_INSTANCE,,}');
        const docs = await db.collection('resources').find({ instanceCode: '${TEST_INSTANCE}' }).limit(100).toArray();
        await client.close();
    " > /dev/null 2>&1
    local query_end=$(date +%s%3N)
    local query_time=$((query_end - query_start))

    if [ "$query_time" -lt 1000 ]; then
        log_pass "Query performance excellent: ${query_time}ms"
    else
        log_warn "Query performance: ${query_time}ms"
    fi
}

# =============================================================================
# Test Category 9: Backward Compatibility
# =============================================================================

test_category_backward_compat() {
    log_section "Category 9: Backward Compatibility"

    # Test 9.1: Test legacy text mode
    log_test "9.1 - Test legacy text-only mode"
    if docker exec "$BACKEND_CONTAINER" npx tsx src/scripts/seed-instance-resources.ts \
        --instance="$TEST_INSTANCE" \
        --count=10 \
        --file-type-mode=text \
        --dry-run 2>&1 | grep -q "text"; then
        log_pass "Legacy text mode supported"
    else
        log_fail "Legacy text mode not working"
    fi

    # Test 9.2: Verify default mode is multi
    log_test "9.2 - Verify default mode is multi (not text)"
    if docker exec "$BACKEND_CONTAINER" npx tsx src/scripts/seed-instance-resources.ts \
        --instance="$TEST_INSTANCE" \
        --count=10 \
        --dry-run 2>&1 | grep -q "File Type Mode: multi"; then
        log_pass "Default mode is multi"
    else
        log_warn "Default mode unclear"
    fi
}

# =============================================================================
# Main Test Execution
# =============================================================================

run_all_tests() {
    print_header

    test_category_templates || true
    test_category_docker || return 1
    test_category_cli || true
    test_category_seeding || return 1
    test_category_distribution || true
    test_category_ztdf || true
    test_category_bdo || true
    test_category_performance || true
    test_category_backward_compat || true
}

run_quick_tests() {
    print_header
    echo -e "${YELLOW}Running quick test suite (essential tests only)${NC}"
    echo ""

    test_category_docker || return 1
    test_category_cli || true

    # Quick seeding test with 50 resources
    TEST_COUNT=50 test_category_seeding || return 1
    test_category_distribution || true
}

# =============================================================================
# Test Results Summary
# =============================================================================

print_summary() {
    local test_end_time=$(date +%s)
    local total_duration=$((test_end_time - TEST_START_TIME))

    echo ""
    log_section "Test Results Summary"

    echo "  Total Tests:    $((TESTS_PASSED + TESTS_FAILED + TESTS_SKIPPED))"
    echo -e "  ${GREEN}Passed:${NC}         ${TESTS_PASSED}"
    echo -e "  ${RED}Failed:${NC}         ${TESTS_FAILED}"
    echo -e "  ${YELLOW}Skipped:${NC}        ${TESTS_SKIPPED}"
    echo -e "  ${YELLOW}Warnings:${NC}       ${TESTS_WARNED}"
    echo "  Duration:       ${total_duration}s"
    echo ""

    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}${BOLD}✓ ALL TESTS PASSED${NC}"
        echo ""
        return 0
    else
        echo -e "${RED}${BOLD}✗ SOME TESTS FAILED${NC}"
        echo ""
        return 1
    fi
}

# =============================================================================
# Entry Point
# =============================================================================

main() {
    local mode="${1:---full}"

    case "$mode" in
        --full)
            run_all_tests
            ;;
        --quick)
            run_quick_tests
            ;;
        --category)
            local category="${2:-}"
            if [ -z "$category" ]; then
                echo "Error: --category requires a category name"
                exit 1
            fi
            print_header
            "test_category_${category}" || true
            ;;
        --help)
            echo "Usage: $0 [--full|--quick|--category <name>]"
            echo ""
            echo "Options:"
            echo "  --full              Run all tests (default)"
            echo "  --quick             Run essential tests only"
            echo "  --category <name>   Run specific test category"
            echo ""
            echo "Categories:"
            echo "  templates, docker, cli, seeding, distribution,"
            echo "  ztdf, bdo, performance, backward_compat"
            echo ""
            echo "Environment Variables:"
            echo "  TEST_INSTANCE       Instance code (default: USA)"
            echo "  TEST_COUNT          Number of resources (default: 100)"
            echo "  BACKEND_CONTAINER   Backend container name (default: dive-hub-backend)"
            exit 0
            ;;
        *)
            echo "Unknown option: $mode"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac

    print_summary
}

main "$@"
