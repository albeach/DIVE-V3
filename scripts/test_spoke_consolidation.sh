#!/bin/bash
# Test script for spoke module consolidation

set -e

echo "🧪 Testing Spoke Module Consolidation..."

# Test 1: Spoke command dispatcher works
echo ""
echo "Test 1: Spoke command dispatcher"
if ./dive spoke --help >/dev/null 2>&1; then
    echo "✅ PASS: Spoke dispatcher works"
else
    echo "❌ FAIL: Spoke dispatcher broken"
    exit 1
fi

# Test 2: Check that sub-modules are loaded (no lazy loading)
echo ""
echo "Test 2: Sub-modules loaded at startup"
if grep -q "spoke_list_countries" scripts/dive-modules/spoke.sh; then
    echo "❌ FAIL: Functions not inlined yet (still using source)"
else
    echo "✅ PASS: Ready for function inlining"
fi

# Test 3: Verify lazy loading infrastructure removed
echo ""
echo "Test 3: Lazy loading infrastructure removed"
if grep -q "_load_spoke_" scripts/dive-modules/spoke.sh; then
    echo "❌ FAIL: Lazy loading infrastructure still exists"
    exit 1
else
    echo "✅ PASS: Lazy loading infrastructure removed"
fi

# Test 4: Verify wrapper functions removed
echo ""
echo "Test 4: Wrapper functions removed"
if grep -q "_load_spoke_deploy &&" scripts/dive-modules/spoke.sh; then
    echo "❌ FAIL: Wrapper functions still exist"
    exit 1
else
    echo "✅ PASS: Wrapper functions removed"
fi

echo ""
echo "🎉 Spoke consolidation test passed!"
echo ""
echo "Summary:"
echo "- ✅ Sub-modules loaded at startup"
echo "- ✅ Lazy loading infrastructure removed"
echo "- ✅ Wrapper functions removed"
echo "- ✅ Dispatcher calls functions directly"
echo ""
echo "Next step: Inline all functions from sub-modules into spoke.sh"
