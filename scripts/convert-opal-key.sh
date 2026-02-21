#!/bin/bash
# =============================================================================
# Convert OPAL PEM Public Key to SSH Format
# =============================================================================
# Converts PEM format RSA public key to SSH format (ssh-rsa ...) without
# host-specific comments. Required for OPAL client compatibility.
#
# Usage: ./scripts/convert-opal-key.sh <input_pem_file>
#
# @version 1.0.0
# @date 2026-01-13
# =============================================================================

set -e

# Check arguments
if [ $# -ne 1 ]; then
    echo "Usage: $0 <input_pem_file>"
    echo ""
    echo "Converts PEM format RSA public key to SSH format (ssh-rsa ...)"
    echo "Output is printed to stdout without host-specific comments."
    exit 1
fi

INPUT_FILE="$1"

# Validate input file exists
if [ ! -f "$INPUT_FILE" ]; then
    echo "ERROR: Input file not found: $INPUT_FILE" >&2
    exit 1
fi

# Validate it's a PEM public key
if ! head -1 "$INPUT_FILE" | grep -q "BEGIN PUBLIC KEY"; then
    echo "ERROR: Input file is not a PEM format public key" >&2
    echo "Expected: -----BEGIN PUBLIC KEY-----" >&2
    exit 1
fi

# Convert PEM to SSH format using ssh-keygen
# This creates a clean SSH format key without hostname comments
ssh-keygen -i -m PKCS8 -f "$INPUT_FILE" 2>/dev/null || {
    echo "ERROR: Failed to convert PEM to SSH format" >&2
    echo "Ensure ssh-keygen supports -i -m PKCS8 (OpenSSH 6.5+)" >&2
    exit 1
}
