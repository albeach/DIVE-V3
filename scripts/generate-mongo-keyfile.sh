#!/bin/bash
# =============================================================================
# MongoDB Replica Set KeyFile Generator
# =============================================================================
# Purpose:
#   Generate a secure keyFile for MongoDB replica set internal authentication.
#   This is required when running MongoDB as a replica set with authorization.
#
# Reference:
#   https://www.mongodb.com/docs/manual/tutorial/enforce-keyfile-access-control-in-existing-replica-set/
#
# Security:
#   - KeyFile must be 6-1024 characters
#   - Base64 encoded (letters, numbers, =, /, +)
#   - File permissions must be 0400 or 0600 (read-only by owner)
#   - Same keyFile must be used by all replica set members
#
# Usage:
#   ./scripts/generate-mongo-keyfile.sh instances/hub/mongo-keyfile
#   ./scripts/generate-mongo-keyfile.sh instances/fra/mongo-keyfile
# =============================================================================

set -e

OUTPUT_FILE="${1:-instances/hub/mongo-keyfile}"
KEYFILE_DIR=$(dirname "$OUTPUT_FILE")

echo "🔐 Generating MongoDB Replica Set KeyFile"
echo "========================================="
echo ""
echo "Output: $OUTPUT_FILE"
echo ""

# Create directory if it doesn't exist
mkdir -p "$KEYFILE_DIR"

# Generate 1024-character random base64 keyfile
# Using openssl for cryptographically secure random data
openssl rand -base64 756 | tr -d '\n' > "$OUTPUT_FILE"

# Set proper permissions (read-only by owner)
chmod 400 "$OUTPUT_FILE"

# Verify file size (MongoDB requires 6-1024 characters)
FILE_SIZE=$(wc -c < "$OUTPUT_FILE" | tr -d ' ')

if [ "$FILE_SIZE" -lt 6 ] || [ "$FILE_SIZE" -gt 1024 ]; then
    echo "❌ Error: KeyFile size ($FILE_SIZE bytes) outside valid range (6-1024)"
    rm "$OUTPUT_FILE"
    exit 1
fi

echo "✅ KeyFile generated successfully"
echo "   Size: $FILE_SIZE bytes"
echo "   Permissions: $(ls -l "$OUTPUT_FILE" | awk '{print $1}')"
echo "   Path: $OUTPUT_FILE"
echo ""
echo "⚠️  SECURITY: This keyFile enables internal replica set authentication"
echo "   - Keep this file secure and private"
echo "   - Do NOT commit to git"
echo "   - Use same keyFile for all replica set members"
echo "   - File permissions MUST be 400 or 600"
echo ""
