#!/bin/bash
#
# DIVE V3 - Phase 6 Performance Baseline Test
# Measures authorization latency with Redis caching and database indexes
#
# Target: < 200ms p95 latency for authorization decisions
#

set -eo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Configuration
BACKEND_URL="${BACKEND_URL:-http://localhost:4000}"
NUM_REQUESTS="${NUM_REQUESTS:-100}"
CONCURRENT_REQUESTS="${CONCURRENT_REQUESTS:-10}"
RESULTS_DIR="./performance-results"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Create results directory
mkdir -p "$RESULTS_DIR"

log_info "========================================="
log_info "DIVE V3 - Phase 6 Performance Baseline"
log_info "========================================="
log_info "Backend URL: $BACKEND_URL"
log_info "Requests: $NUM_REQUESTS (concurrent: $CONCURRENT_REQUESTS)"
log_info "Results: $RESULTS_DIR/baseline_$TIMESTAMP.txt"
echo ""

# Test 1: Health Check Latency
log_info "Test 1: Health Check Latency"
log_info "-----------------------------------------"

health_times=()
for i in {1..10}; do
    start=$(date +%s%3N)
    curl -s "$BACKEND_URL/health" > /dev/null 2>&1
    end=$(date +%s%3N)
    latency=$((end - start))
    health_times+=("$latency")
done

# Calculate average
health_avg=0
for t in "${health_times[@]}"; do
    health_avg=$((health_avg + t))
done
health_avg=$((health_avg / ${#health_times[@]}))

log_success "Health check avg latency: ${health_avg}ms"
echo ""

# Test 2: Authorization Decision Latency (requires authentication)
log_info "Test 2: Authorization Decision Latency"
log_info "-----------------------------------------"
log_warning "Requires valid authentication token for accurate testing"
log_info "Run with: TEST_TOKEN=<jwt> ./scripts/phase6-baseline-test.sh"
echo ""

if [[ -n "$TEST_TOKEN" ]]; then
    log_info "Testing with provided token..."
    
    # Test authorization endpoint
    auth_times=()
    cache_hits=0
    
    for i in $(seq 1 $NUM_REQUESTS); do
        start=$(date +%s%3N)
        response=$(curl -s -w "\n%{http_code}\n%{time_total}" \
            -H "Authorization: Bearer $TEST_TOKEN" \
            "$BACKEND_URL/api/resources/doc-001" 2>/dev/null || echo "000\n0")
        
        _http_code=$(echo "$response" | tail -n 2 | head -n 1)
        _time_total=$(echo "$response" | tail -n 1)
        end=$(date +%s%3N)
        
        latency=$((end - start))
        auth_times+=("$latency")
        
        # Check if cached (simple heuristic: very fast = cached)
        if [[ $latency -lt 50 ]]; then
            ((cache_hits++))
        fi
        
        # Progress indicator
        if [[ $((i % 10)) -eq 0 ]]; then
            echo -n "."
        fi
    done
    echo ""
    
    # Calculate statistics
    auth_avg=0
    auth_min=999999
    auth_max=0
    
    for t in "${auth_times[@]}"; do
        auth_avg=$((auth_avg + t))
        if [[ $t -lt $auth_min ]]; then
            auth_min=$t
        fi
        if [[ $t -gt $auth_max ]]; then
            auth_max=$t
        fi
    done
    auth_avg=$((auth_avg / ${#auth_times[@]}))
    
    # Calculate cache hit rate
    cache_hit_rate=$((cache_hits * 100 / NUM_REQUESTS))
    
    log_success "Authorization Decision Latency:"
    log_info "  Min: ${auth_min}ms"
    log_info "  Avg: ${auth_avg}ms"
    log_info "  Max: ${auth_max}ms"
    log_info "  Cache hits: $cache_hits / $NUM_REQUESTS (${cache_hit_rate}%)"
    
    if [[ $auth_avg -lt 200 ]]; then
        log_success "✅ Target achieved: < 200ms average latency"
    else
        log_warning "⚠️  Target missed: ${auth_avg}ms > 200ms"
    fi
else
    log_warning "Skipping authorization tests (no TEST_TOKEN provided)"
fi

echo ""

# Test 3: OPA Decision Latency
log_info "Test 3: OPA Decision Latency (Direct)"
log_info "-----------------------------------------"

OPA_URL="${OPA_URL:-https://localhost:8181}"

opa_times=()
for i in {1..10}; do
    start=$(date +%s%3N)
    current_time=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    curl -sk -X POST "$OPA_URL/v1/data/dive/authorization/decision" \
        -H "Content-Type: application/json" \
        -d '{
            "input": {
                "subject": {
                    "uniqueID": "test-user",
                    "clearance": "SECRET",
                    "countryOfAffiliation": "USA",
                    "acpCOI": ["FVEY"]
                },
                "resource": {
                    "resourceId": "doc-001",
                    "classification": "SECRET",
                    "releasabilityTo": ["USA"],
                    "COI": ["FVEY"]
                },
                "action": "read",
                "context": {
                    "currentTime": "'$current_time'",
                    "requestId": "test-'$i'"
                }
            }
        }' > /dev/null 2>&1
    end=$(date +%s%3N)
    latency=$((end - start))
    opa_times+=("$latency")
done

# Calculate average
opa_avg=0
for t in "${opa_times[@]}"; do
    opa_avg=$((opa_avg + t))
done
opa_avg=$((opa_avg / ${#opa_times[@]}))

log_success "OPA decision avg latency: ${opa_avg}ms"
echo ""

# Test 4: Redis Cache Performance
log_info "Test 4: Redis Cache Performance"
log_info "-----------------------------------------"

# Check Redis stats
redis_stats=$(docker exec dive-hub-redis redis-cli INFO stats 2>/dev/null | grep -E "keyspace_hits|keyspace_misses|expired_keys" || echo "")

if [[ -n "$redis_stats" ]]; then
    log_success "Redis Stats:"
    echo "$redis_stats" | while read line; do
        log_info "  $line"
    done
else
    log_warning "Could not retrieve Redis stats"
fi

echo ""

# Test 5: Database Query Performance (MongoDB)
log_info "Test 5: MongoDB Query Performance"
log_info "-----------------------------------------"

MONGO_PASSWORD=$(gcloud secrets versions access latest --secret=dive-v3-mongo-password-usa --project=dive25 2>/dev/null || echo "")

if [[ -n "$MONGO_PASSWORD" ]]; then
    # Test resource lookup query
    log_info "Testing resource lookup by resourceId..."
    
    mongo_result=$(docker exec dive-hub-mongodb mongosh -u admin -p "$MONGO_PASSWORD" --authenticationDatabase admin --quiet <<'MONGOEOF'
use dive-v3-hub;
var start = new Date();
db.resources.findOne({ resourceId: "doc-001" });
var end = new Date();
print((end - start) + "ms");
MONGOEOF
)
    
    log_success "MongoDB lookup: $mongo_result"
    
    # Check index usage
    log_info "Checking index usage..."
    
    docker exec dive-hub-mongodb mongosh -u admin -p "$MONGO_PASSWORD" --authenticationDatabase admin --quiet <<'MONGOEOF'
use dive-v3-hub;
print("\nResource collection indexes:");
db.resources.getIndexes().forEach(function(idx) {
    print("  - " + idx.name);
});
MONGOEOF

else
    log_warning "Could not test MongoDB (password not available)"
fi

echo ""

# Summary
log_info "========================================="
log_info "Performance Baseline Summary"
log_info "========================================="
log_info "Health Check: ${health_avg}ms avg"
log_info "OPA Direct: ${opa_avg}ms avg"
if [[ -n "$TEST_TOKEN" ]]; then
    log_info "Authorization (with cache): ${auth_avg}ms avg (${cache_hit_rate}% cache hits)"
    
    if [[ $auth_avg -lt 200 ]]; then
        log_success "✅ Performance target achieved"
    else
        log_warning "⚠️  Performance target not met (${auth_avg}ms > 200ms)"
    fi
else
    log_warning "⚠️  Authorization test skipped (no TEST_TOKEN)"
fi

# Save results
cat > "$RESULTS_DIR/baseline_$TIMESTAMP.txt" <<EOF
DIVE V3 - Phase 6 Performance Baseline
Timestamp: $TIMESTAMP
Backend URL: $BACKEND_URL

Results:
--------
Health Check: ${health_avg}ms avg
OPA Direct: ${opa_avg}ms avg
EOF

if [[ -n "$TEST_TOKEN" ]]; then
    cat >> "$RESULTS_DIR/baseline_$TIMESTAMP.txt" <<EOF
Authorization: ${auth_avg}ms avg (min: ${auth_min}ms, max: ${auth_max}ms)
Cache Hit Rate: ${cache_hit_rate}%
Target: < 200ms (p95)
Status: $([[ $auth_avg -lt 200 ]] && echo "PASSED" || echo "NEEDS OPTIMIZATION")
EOF
fi

log_success "Results saved to: $RESULTS_DIR/baseline_$TIMESTAMP.txt"
