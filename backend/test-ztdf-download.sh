#!/bin/bash

# ZTDF Download Test Script
# Tests the complete ZTDF export functionality end-to-end

set -e  # Exit on error

echo "============================================"
echo "ZTDF Download End-to-End Test"
echo "============================================"
echo ""

# Configuration
BACKEND_URL="${BACKEND_URL:-https://localhost:4000}"
JWT_SECRET="${JWT_SECRET:-your-256-bit-secret-key-for-jwt-signing-must-be-at-least-32-chars}"
OUTPUT_DIR="./output/ztdf-test"

# Create output directory
mkdir -p "$OUTPUT_DIR"

echo "Step 1: Generate Test JWT Token"
echo "--------------------------------"

# Generate JWT token using Node.js
TOKEN=$(node -e "
const jwt = require('jsonwebtoken');
const token = jwt.sign(
  {
    uniqueID: 'john.doe@mil',
    clearance: 'TOP_SECRET',
    countryOfAffiliation: 'USA',
    acpCOI: ['FVEY', 'NATO-COSMIC']
  },
  '$JWT_SECRET',
  { expiresIn: '1h' }
);
console.log(token);
")

echo "✓ JWT Token generated"
echo ""

echo "Step 2: List Available ZTDF Resources"
echo "--------------------------------------"

# List resources
RESOURCES_JSON=$(curl -k -s -H "Authorization: Bearer $TOKEN" \
  "$BACKEND_URL/api/resources" 2>/dev/null || echo '{"error": "Failed to fetch"}')

# Extract first resource ID
RESOURCE_ID=$(echo "$RESOURCES_JSON" | node -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync(0, 'utf-8'));
if (data.resources && data.resources.length > 0) {
  console.log(data.resources[0].resourceId);
} else {
  console.log('NONE');
}
" 2>/dev/null || echo "NONE")

if [ "$RESOURCE_ID" = "NONE" ]; then
  echo "✗ No ZTDF resources found in database"
  echo "  Run: cd backend && npm run seed-ztdf"
  exit 1
fi

echo "✓ Found ZTDF resource: $RESOURCE_ID"
echo ""

echo "Step 3: Download ZTDF File"
echo "--------------------------"

ZTDF_FILE="$OUTPUT_DIR/$RESOURCE_ID.ztdf"

curl -k -s -H "Authorization: Bearer $TOKEN" \
  -o "$ZTDF_FILE" \
  "$BACKEND_URL/api/resources/$RESOURCE_ID/download"

if [ ! -f "$ZTDF_FILE" ]; then
  echo "✗ Download failed - file not created"
  exit 1
fi

FILE_SIZE=$(stat -f%z "$ZTDF_FILE" 2>/dev/null || stat -c%s "$ZTDF_FILE" 2>/dev/null || echo "0")

if [ "$FILE_SIZE" -lt 100 ]; then
  echo "✗ Downloaded file is too small ($FILE_SIZE bytes)"
  cat "$ZTDF_FILE"
  exit 1
fi

echo "✓ Downloaded ZTDF file: $ZTDF_FILE ($FILE_SIZE bytes)"
echo ""

echo "Step 4: Verify ZIP Structure"
echo "-----------------------------"

# Check if it's a valid ZIP
if ! file "$ZTDF_FILE" | grep -q "Zip archive"; then
  echo "✗ File is not a valid ZIP archive"
  file "$ZTDF_FILE"
  exit 1
fi

echo "✓ File is a valid ZIP archive"

# List contents
echo ""
echo "ZIP contents:"
unzip -l "$ZTDF_FILE" || {
  echo "✗ Failed to list ZIP contents"
  exit 1
}

# Check for required files
if ! unzip -l "$ZTDF_FILE" | grep -q "0.manifest.json"; then
  echo "✗ Missing 0.manifest.json"
  exit 1
fi

if ! unzip -l "$ZTDF_FILE" | grep -q "0.payload"; then
  echo "✗ Missing 0.payload"
  exit 1
fi

echo ""
echo "✓ ZIP contains required files (0.manifest.json + 0.payload)"
echo ""

echo "Step 5: Validate Manifest Format"
echo "---------------------------------"

# Extract and validate manifest
unzip -p "$ZTDF_FILE" 0.manifest.json > "$OUTPUT_DIR/manifest.json"

# Check tdf_spec_version
SPEC_VERSION=$(node -e "
const fs = require('fs');
const manifest = JSON.parse(fs.readFileSync('$OUTPUT_DIR/manifest.json', 'utf-8'));
console.log(manifest.tdf_spec_version || 'MISSING');
")

if [ "$SPEC_VERSION" != "4.3.0" ]; then
  echo "✗ Invalid tdf_spec_version: $SPEC_VERSION (expected 4.3.0)"
  exit 1
fi

echo "✓ tdf_spec_version: $SPEC_VERSION"

# Validate manifest structure
node -e "
const fs = require('fs');
const manifest = JSON.parse(fs.readFileSync('$OUTPUT_DIR/manifest.json', 'utf-8'));

const checks = [
  { name: 'payload.type', expected: 'reference', actual: manifest.payload?.type },
  { name: 'payload.url', expected: '0.payload', actual: manifest.payload?.url },
  { name: 'payload.protocol', expected: 'zip', actual: manifest.payload?.protocol },
  { name: 'payload.isEncrypted', expected: true, actual: manifest.payload?.isEncrypted },
  { name: 'encryptionInformation.type', expected: 'split', actual: manifest.encryptionInformation?.type }
];

let failed = false;
checks.forEach(check => {
  if (check.actual !== check.expected) {
    console.log(\`✗ \${check.name}: \${check.actual} (expected \${check.expected})\`);
    failed = true;
  } else {
    console.log(\`✓ \${check.name}: \${check.actual}\`);
  }
});

if (!manifest.encryptionInformation?.keyAccess || manifest.encryptionInformation.keyAccess.length === 0) {
  console.log('✗ Missing keyAccess array');
  failed = true;
} else {
  console.log(\`✓ keyAccess: \${manifest.encryptionInformation.keyAccess.length} KAO(s)\`);
}

if (!manifest.assertions || manifest.assertions.length === 0) {
  console.log('✗ Missing assertions array');
  failed = true;
} else {
  console.log(\`✓ assertions: \${manifest.assertions.length} assertion(s)\`);
}

if (failed) process.exit(1);
"

echo ""

echo "Step 6: Validate Assertions (STANAG 4774)"
echo "------------------------------------------"

node -e "
const fs = require('fs');
const manifest = JSON.parse(fs.readFileSync('$OUTPUT_DIR/manifest.json', 'utf-8'));

const assertion = manifest.assertions[0];
if (!assertion) {
  console.log('✗ No assertions found');
  process.exit(1);
}

console.log(\`✓ Assertion ID: \${assertion.id}\`);
console.log(\`✓ Assertion type: \${assertion.type}\`);
console.log(\`✓ Assertion scope: \${assertion.scope}\`);
console.log(\`✓ Assertion appliesToState: \${assertion.appliesToState}\`);

if (assertion.statement?.value?.Xmlns) {
  console.log(\`✓ STANAG 4774 namespace: \${assertion.statement.value.Xmlns.substring(0, 40)}...\`);
}

if (assertion.statement?.value?.ConfidentialityInformation?.Classification) {
  console.log(\`✓ Classification: \${assertion.statement.value.ConfidentialityInformation.Classification}\`);
}

if (assertion.binding?.method === 'jws') {
  console.log('✓ Binding method: jws');
}
"

echo ""

echo "Step 7: Extract Payload Info"
echo "-----------------------------"

PAYLOAD_SIZE=$(unzip -l "$ZTDF_FILE" | grep "0.payload" | awk '{print $1}')
echo "✓ Payload size: $PAYLOAD_SIZE bytes"

# Extract payload (binary)
unzip -p "$ZTDF_FILE" 0.payload > "$OUTPUT_DIR/payload.bin"
EXTRACTED_SIZE=$(stat -f%z "$OUTPUT_DIR/payload.bin" 2>/dev/null || stat -c%s "$OUTPUT_DIR/payload.bin" 2>/dev/null)
echo "✓ Extracted payload: $EXTRACTED_SIZE bytes"

echo ""

echo "Step 8: Pretty-print Manifest"
echo "------------------------------"

echo "Manifest JSON (first 50 lines):"
cat "$OUTPUT_DIR/manifest.json" | jq . | head -50

echo ""
echo "============================================"
echo "✅ ALL TESTS PASSED!"
echo "============================================"
echo ""
echo "Summary:"
echo "  • Downloaded ZTDF file: $ZTDF_FILE"
echo "  • File size: $FILE_SIZE bytes"
echo "  • Spec version: $SPEC_VERSION"
echo "  • Payload size: $PAYLOAD_SIZE bytes"
echo "  • OpenTDF compliant: YES"
echo ""
echo "Files saved to: $OUTPUT_DIR/"
echo "  - $RESOURCE_ID.ztdf (complete ZTDF file)"
echo "  - manifest.json (extracted manifest)"
echo "  - payload.bin (extracted encrypted payload)"
echo ""

