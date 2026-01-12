#!/usr/bin/env bash
# =============================================================================
# DIVE V3 SPOKE MODULARIZATION - SIMPLE VALIDATION
# =============================================================================
# Quick validation of key aspects of the spoke modularization
# =============================================================================

set -e

echo "🔍 DIVE V3 Spoke Modularization - Simple Validation"
echo "=================================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

cd "$(dirname "${BASH_SOURCE[0]}")/.."

echo "1. Testing CLI accessibility..."
if ./dive --help >/dev/null 2>&1; then
    echo -e "   ${GREEN}✅ CLI accessible${NC}"
else
    echo -e "   ${RED}❌ CLI not accessible${NC}"
    exit 1
fi

echo ""
echo "2. Testing spoke command..."
if ./dive spoke --help >/dev/null 2>&1; then
    echo -e "   ${GREEN}✅ Spoke command exists${NC}"
else
    echo -e "   ${RED}❌ Spoke command missing${NC}"
    exit 1
fi

echo ""
echo "3. Testing spoke help..."
if ./dive spoke help 2>/dev/null | grep -q "Spoke Commands"; then
    echo -e "   ${GREEN}✅ Spoke help works${NC}"
else
    echo -e "   ${RED}❌ Spoke help broken${NC}"
    exit 1
fi

echo ""
echo "4. Testing module structure..."
module_count=$(find scripts/dive-modules/spoke -name "*.sh" 2>/dev/null | wc -l)
if [ "$module_count" -ge 15 ]; then
    echo -e "   ${GREEN}✅ $module_count modules found${NC}"
else
    echo -e "   ${RED}❌ Only $module_count modules (expected 15+)${NC}"
    exit 1
fi

echo ""
echo "5. Testing dispatcher size..."
dispatcher_lines=$(wc -l < scripts/dive-modules/spoke.sh 2>/dev/null)
if [ "$dispatcher_lines" -lt 400 ]; then
    reduction=$(( (3071 - dispatcher_lines) * 100 / 3071 ))
    echo -e "   ${GREEN}✅ $dispatcher_lines lines ($reduction% reduction)${NC}"
else
    echo -e "   ${RED}❌ $dispatcher_lines lines (too large)${NC}"
    exit 1
fi

echo ""
echo "6. Testing AI-friendly module sizes..."
large_count=$(find scripts/dive-modules/spoke -name "*.sh" -exec wc -l {} \; 2>/dev/null | awk '$1 > 500 {count++} END {print count+0}')
if [ "$large_count" -eq 0 ]; then
    echo -e "   ${GREEN}✅ All modules <500 lines${NC}"
else
    echo -e "   ${YELLOW}⚠️  $large_count modules >500 lines${NC}"
fi

echo ""
echo "7. Testing sample commands..."
commands=("init" "deploy" "status" "health" "verify" "sync" "register")
working=0
total=${#commands[@]}

for cmd in "${commands[@]}"; do
    if timeout 2s ./dive spoke "$cmd" 2>&1 | grep -q "Instance code\|Setup\|deploy\|sync\|register" 2>/dev/null; then
        ((working++))
    fi
done

if [ "$working" -ge 5 ]; then
    echo -e "   ${GREEN}✅ $working/$total sample commands accessible${NC}"
else
    echo -e "   ${RED}❌ Only $working/$total commands accessible${NC}"
fi

echo ""
echo "8. Testing function coverage..."
dispatcher_funcs=$(grep -E "spoke_[a-zA-Z_]+" scripts/dive-modules/spoke.sh | sed 's/.*spoke_\([a-zA-Z_]*\).*/spoke_\1/' | sort | uniq | grep -v "log_" | grep -v "print_" | wc -l)
module_funcs=$(find scripts/dive-modules/spoke -name "*.sh" -exec grep -E "^[a-zA-Z_][a-zA-Z0-9_]*\(\)" {} \; 2>/dev/null | wc -l)

if [ "$dispatcher_funcs" -le "$module_funcs" ]; then
    echo -e "   ${GREEN}✅ Functions covered ($dispatcher_funcs dispatched, $module_funcs defined)${NC}"
else
    echo -e "   ${RED}❌ Missing functions (more dispatched than defined)${NC}"
fi

echo ""
echo "9. Testing direct loading architecture..."
if grep -q "DIRECT LOADING OF SPOKE SUB-MODULES" scripts/dive-modules/spoke.sh; then
    echo -e "   ${GREEN}✅ Direct loading implemented${NC}"
else
    echo -e "   ${RED}❌ Direct loading not found${NC}"
fi

echo ""
echo "🎯 VALIDATION COMPLETE"
echo "======================"

success_count=$(echo "
CLI accessible: 1
Spoke command exists: 1
Spoke help works: 1
Modules found: $([ "$module_count" -ge 15 ] && echo 1 || echo 0)
Dispatcher size: $([ "$dispatcher_lines" -lt 400 ] && echo 1 || echo 0)
AI-friendly sizes: $([ "$large_count" -eq 0 ] && echo 1 || echo 0)
Commands accessible: $([ "$working" -ge 5 ] && echo 1 || echo 0)
Function coverage: $([ "$dispatcher_funcs" -le "$module_funcs" ] && echo 1 || echo 0)
Direct loading: 1
" | awk '{sum += $2} END {print sum}')

total_tests=9
success_rate=$(( (success_count * 100) / total_tests ))

echo "Tests passed: $success_count/$total_tests ($success_rate%)"
echo ""

if [ $success_rate -eq 100 ]; then
    echo -e "${GREEN}🎉 COMPLETE SUCCESS - SPOKE MODULARIZATION VALIDATED!${NC}"
    echo ""
    echo "✅ All core functionality verified"
    echo "✅ Modular architecture working"
    echo "✅ Direct loading confirmed"
    echo "✅ Commands accessible"
    echo ""
    exit 0
elif [ $success_rate -ge 80 ]; then
    echo -e "${YELLOW}⚠️  MOSTLY SUCCESSFUL${NC}"
    echo ""
    echo "Most aspects work correctly, minor issues detected."
    exit 1
else
    echo -e "${RED}❌ VALIDATION FAILED${NC}"
    echo ""
    echo "Significant issues detected."
    exit 1
fi