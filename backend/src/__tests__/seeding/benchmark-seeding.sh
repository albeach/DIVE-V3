#!/usr/bin/env bash
# =============================================================================
# Multi-Format Seeding Performance Benchmark
# =============================================================================
# Benchmarks seeding performance across different configurations
# Usage: ./benchmark-seeding.sh [--instance USA] [--runs 3]
# =============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Configuration
TEST_INSTANCE="${1:-USA}"
NUM_RUNS="${2:-3}"
BACKEND_CONTAINER="${BACKEND_CONTAINER:-dive-hub-backend}"
RESULTS_DIR="./benchmark-results"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
RESULTS_FILE="${RESULTS_DIR}/benchmark-${TIMESTAMP}.csv"

# Test configurations
declare -a TEST_CONFIGS=(
    "100:text:Text mode 100"
    "100:multi:Multi mode 100"
    "500:text:Text mode 500"
    "500:multi:Multi mode 500"
    "1000:text:Text mode 1000"
    "1000:multi:Multi mode 1000"
    "5000:multi:Multi mode 5000 (default)"
)

# Create results directory
mkdir -p "$RESULTS_DIR"

# =============================================================================
# Utility Functions
# =============================================================================

log_section() {
    echo ""
    echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${CYAN}  $1${NC}"
    echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[⚠]${NC} $1"
}

print_header() {
    clear
    echo -e "${BOLD}${CYAN}"
    echo "╔════════════════════════════════════════════════════════════════════╗"
    echo "║          DIVE V3 - Seeding Performance Benchmark                  ║"
    echo "║          Multi-Format vs Text-Only Performance                    ║"
    echo "╚════════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo "  Instance:   ${TEST_INSTANCE}"
    echo "  Runs:       ${NUM_RUNS} per configuration"
    echo "  Results:    ${RESULTS_FILE}"
    echo "  Started:    $(date)"
    echo ""
}

# =============================================================================
# Benchmark Functions
# =============================================================================

cleanup_test_data() {
    local instance=$1
    log_info "Cleaning up test data from previous runs..."

    docker exec "$BACKEND_CONTAINER" npx tsx -e "
        import { MongoClient } from 'mongodb';
        const client = await MongoClient.connect(process.env.MONGODB_URI || 'mongodb://mongodb-${instance,,}:27017');
        const db = client.db('dive_${instance,,}');
        const result = await db.collection('resources').deleteMany({ instanceCode: '${instance}' });
        console.log('Deleted resources:', result.deletedCount);
        await client.close();
    " 2>&1 | tail -1

    log_success "Test data cleaned"
}

run_seeding_benchmark() {
    local count=$1
    local mode=$2
    local description=$3
    local run_number=$4

    log_info "Run ${run_number}/${NUM_RUNS}: ${description}"

    # Clean data before each run
    cleanup_test_data "$TEST_INSTANCE" > /dev/null 2>&1

    # Run seeding and capture timing
    local start_time=$(date +%s)
    local start_ms=$(date +%s%3N)

    local output=$(docker exec "$BACKEND_CONTAINER" npx tsx src/scripts/seed-instance-resources.ts \
        --instance="$TEST_INSTANCE" \
        --count="$count" \
        --file-type-mode="$mode" \
        --replace 2>&1)

    local end_time=$(date +%s)
    local end_ms=$(date +%s%3N)

    local duration=$((end_time - start_time))
    local duration_ms=$((end_ms - start_ms))

    # Calculate throughput
    local throughput=0
    if [ $duration -gt 0 ]; then
        throughput=$((count / duration))
    else
        throughput=$count
    fi

    # Get MongoDB stats
    local db_count=$(docker exec "$BACKEND_CONTAINER" npx tsx -e "
        import { MongoClient } from 'mongodb';
        const client = await MongoClient.connect(process.env.MONGODB_URI || 'mongodb://mongodb-${TEST_INSTANCE,,}:27017');
        const db = client.db('dive_${TEST_INSTANCE,,}');
        const count = await db.collection('resources').countDocuments({ instanceCode: '${TEST_INSTANCE}' });
        console.log(count);
        await client.close();
    " 2>&1 | tail -1 | tr -d '[:space:]')

    # Verify count
    local success="true"
    if [ "$db_count" -ne "$count" ]; then
        log_warn "Count mismatch: expected ${count}, got ${db_count}"
        success="false"
    fi

    # Log result
    echo "${TIMESTAMP},${TEST_INSTANCE},${count},${mode},${run_number},${duration},${duration_ms},${throughput},${db_count},${success}" >> "$RESULTS_FILE"

    log_success "Completed in ${duration}s (${throughput} res/sec, ${duration_ms}ms)"

    # Brief pause between runs
    sleep 2

    return 0
}

# =============================================================================
# Results Analysis
# =============================================================================

analyze_results() {
    log_section "Results Analysis"

    echo ""
    echo "Benchmark Results Summary:"
    echo "─────────────────────────────────────────────────────────────────────────────"
    printf "%-25s %-10s %-12s %-12s %-12s\n" "Configuration" "Count" "Avg Time(s)" "Avg Thru" "Success"
    echo "─────────────────────────────────────────────────────────────────────────────"

    # Analyze each unique configuration
    for config in "${TEST_CONFIGS[@]}"; do
        IFS=':' read -r count mode description <<< "$config"

        # Calculate averages from CSV
        local avg_duration=$(awk -F',' -v cnt="$count" -v md="$mode" '
            $3 == cnt && $4 == md { sum += $6; n++ }
            END { if (n > 0) printf "%.1f", sum/n; else print "N/A" }
        ' "$RESULTS_FILE")

        local avg_throughput=$(awk -F',' -v cnt="$count" -v md="$mode" '
            $3 == cnt && $4 == md { sum += $8; n++ }
            END { if (n > 0) printf "%.0f", sum/n; else print "N/A" }
        ' "$RESULTS_FILE")

        local success_rate=$(awk -F',' -v cnt="$count" -v md="$mode" '
            $3 == cnt && $4 == md { total++; if ($10 == "true") success++ }
            END { if (total > 0) printf "%.0f%%", (success/total)*100; else print "N/A" }
        ' "$RESULTS_FILE")

        printf "%-25s %-10s %-12s %-12s %-12s\n" \
            "$description" "$count" "${avg_duration}s" "${avg_throughput}/s" "$success_rate"
    done

    echo "─────────────────────────────────────────────────────────────────────────────"
    echo ""

    # Performance comparison
    log_section "Performance Comparison: Multi vs Text Mode"

    for count in 100 500 1000; do
        local text_time=$(awk -F',' -v cnt="$count" '$3 == cnt && $4 == "text" { sum += $6; n++ } END { if (n > 0) printf "%.1f", sum/n; else print "0" }' "$RESULTS_FILE")
        local multi_time=$(awk -F',' -v cnt="$count" '$3 == cnt && $4 == "multi" { sum += $6; n++ } END { if (n > 0) printf "%.1f", sum/n; else print "0" }' "$RESULTS_FILE")

        if [ "$text_time" != "0" ] && [ "$multi_time" != "0" ]; then
            local diff=$(echo "$multi_time $text_time" | awk '{printf "%.1f", $1 - $2}')
            local pct=$(echo "$multi_time $text_time" | awk '{printf "%.1f", (($1 - $2) / $2) * 100}')

            echo "  ${count} resources:"
            echo "    Text mode:   ${text_time}s"
            echo "    Multi mode:  ${multi_time}s"
            if (( $(echo "$pct > 0" | bc -l) )); then
                echo -e "    Difference:  ${YELLOW}+${diff}s (+${pct}%)${NC} slower"
            else
                echo -e "    Difference:  ${GREEN}${diff}s (${pct}%)${NC} faster"
            fi
            echo ""
        fi
    done

    # Scalability analysis
    log_section "Scalability Analysis"

    echo "  Throughput by configuration:"
    echo ""
    awk -F',' 'NR > 1 {
        key = $3 "_" $4
        sum[key] += $8
        count[key]++
        desc[key] = $3 " resources (" $4 " mode)"
    }
    END {
        for (k in sum) {
            avg = sum[k] / count[k]
            printf "    %-30s %6.0f resources/sec\n", desc[k], avg
        }
    }' "$RESULTS_FILE" | sort -t'_' -k1 -n

    echo ""
}

# =============================================================================
# Main Execution
# =============================================================================

main() {
    print_header

    # Initialize CSV file
    echo "timestamp,instance,count,mode,run,duration_sec,duration_ms,throughput,db_count,success" > "$RESULTS_FILE"

    # Check container
    log_section "Environment Check"
    if ! docker ps --format '{{.Names}}' | grep -q "^${BACKEND_CONTAINER}$"; then
        echo -e "${RED}Error: Backend container not running: ${BACKEND_CONTAINER}${NC}"
        exit 1
    fi
    log_success "Backend container is running"

    # Run benchmarks
    log_section "Running Benchmarks"

    for config in "${TEST_CONFIGS[@]}"; do
        IFS=':' read -r count mode description <<< "$config"

        echo ""
        log_info "Testing: ${description}"
        echo "────────────────────────────────────────────────────────────────"

        for run in $(seq 1 $NUM_RUNS); do
            run_seeding_benchmark "$count" "$mode" "$description" "$run"
        done

        echo ""
    done

    # Analyze and display results
    analyze_results

    # Save detailed results
    log_section "Results Saved"
    log_success "Detailed results: ${RESULTS_FILE}"
    log_success "Raw data can be analyzed with: cat ${RESULTS_FILE}"

    # Generate summary report
    local summary_file="${RESULTS_DIR}/benchmark-${TIMESTAMP}-summary.txt"
    {
        echo "DIVE V3 - Multi-Format Seeding Benchmark"
        echo "========================================"
        echo ""
        echo "Date: $(date)"
        echo "Instance: ${TEST_INSTANCE}"
        echo "Runs per config: ${NUM_RUNS}"
        echo ""
        analyze_results
    } > "$summary_file"

    log_success "Summary report: ${summary_file}"

    echo ""
    log_section "Benchmark Complete"
    echo ""
}

main "$@"
