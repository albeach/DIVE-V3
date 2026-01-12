#!/usr/bin/env bash
# Quick test of critical spoke commands

echo "🧪 Testing critical spoke commands..."

# Test 1: Help command
echo -n "1. Help command: "
if ./dive spoke help >/dev/null 2>&1; then
    echo "✅ PASSED"
else
    echo "❌ FAILED"
fi

# Test 2: Error cases (should fail gracefully)
echo -n "2. Init without args: "
if ./dive spoke init 2>&1 | grep -q "Instance code"; then
    echo "✅ PASSED"
else
    echo "❌ FAILED"
fi

# Test 3: Sync command (should work)
echo -n "3. Sync command: "
if timeout 3 ./dive spoke sync 2>&1 | grep -q "sync"; then
    echo "✅ PASSED"
else
    echo "❌ FAILED"
fi

# Test 4: List countries
echo -n "4. List countries: "
if ./dive spoke list-countries 2>/dev/null | head -1 | grep -q "NATO"; then
    echo "✅ PASSED"
else
    echo "❌ FAILED"
fi

# Test 5: Module loading
echo -n "5. Module loading: "
if bash -c "source scripts/dive-modules/spoke.sh >/dev/null 2>&1 && type spoke_status >/dev/null 2>&1"; then
    echo "✅ PASSED"
else
    echo "❌ FAILED"
fi

echo ""
echo "🎯 Quick test complete!"