#!/bin/bash
echo "🔍 Checking for whitespace issues..."
if git status --porcelain | grep -q "^ M"; then
    echo "⚠️  Found modified files. Checking for whitespace-only changes..."
    git diff --name-only | xargs -I {} sh -c 'if git diff "{}" | grep -q "^+.*[^[:space:]]" && git diff "{}" | grep -q "^-.*[^[:space:]]"; then :; else echo "   {} - appears to be whitespace-only"; fi'
    echo "💡 Run 'git checkout -- .' to discard whitespace changes"
else
    echo "✅ No modified files found"
fi
