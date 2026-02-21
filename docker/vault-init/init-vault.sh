#!/bin/sh
# =============================================================================
# Vault Init Container
# =============================================================================
# Runs inside a hashicorp/vault:1.15 container on the Docker internal network.
# Connects to the vault service and performs: init + unseal + KV v2 enable.
#
# Idempotent: safe to run multiple times — detects existing state at each step.
#
# NOTE: The vault:1.15 image does NOT include jq. All output parsing uses
# grep/sed on Vault's default text format (not JSON).
#
# Required env vars:
#   VAULT_ADDR        - Vault address (e.g., https://vault-deu:8200)
#   VAULT_SKIP_VERIFY - Set to "true" for self-signed certs
#   KV_MOUNT          - KV v2 mount path (default: spoke-secrets)
#
# Volumes:
#   /vault/init       - Bind mount for storing unseal key + root token
#
# Exit codes:
#   0 - Vault initialized, unsealed, and KV mounted
#   1 - Failed
# =============================================================================

set -e

: "${VAULT_ADDR:?VAULT_ADDR required}"
KV_MOUNT="${KV_MOUNT:-spoke-secrets}"
INIT_FILE="/vault/init/.vault-init"

echo "Vault initialization for ${VAULT_ADDR}"

# ---- Step 1: Initialize ----
if vault status 2>&1 | grep -q "Initialized.*true"; then
    echo "Step 1/3: Already initialized"
else
    echo "Step 1/3: Initializing (Shamir 1/1)..."
    # Use default text format (not JSON) — easier to parse without jq
    # Output format:
    #   Unseal Key 1: <base64key>
    #   Initial Root Token: hvs.xxxx
    init_output=$(vault operator init -key-shares=1 -key-threshold=1)

    unseal_key=$(echo "$init_output" | grep "Unseal Key 1:" | sed 's/.*: //')
    root_token=$(echo "$init_output" | grep "Initial Root Token:" | sed 's/.*: //')

    if [ -z "$unseal_key" ] || [ -z "$root_token" ]; then
        echo "ERROR: Failed to parse init output"
        echo "Raw output:"
        echo "$init_output"
        exit 1
    fi

    # Store credentials in bind-mounted directory (accessible from host)
    cat > "$INIT_FILE" <<EOF
VAULT_UNSEAL_KEY=${unseal_key}
VAULT_ROOT_TOKEN=${root_token}
VAULT_INITIALIZED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EOF
    chmod 600 "$INIT_FILE"
    echo "  Credentials stored in $INIT_FILE"
fi

# ---- Step 2: Unseal ----
if vault status 2>&1 | grep -q "Sealed.*false"; then
    echo "Step 2/3: Already unsealed"
else
    echo "Step 2/3: Unsealing..."
    if [ ! -f "$INIT_FILE" ]; then
        echo "ERROR: Init file not found at $INIT_FILE"
        exit 1
    fi
    unseal_key=$(grep '^VAULT_UNSEAL_KEY=' "$INIT_FILE" | cut -d= -f2-)
    vault operator unseal "$unseal_key" >/dev/null
    echo "  Unsealed"
fi

# ---- Step 3: Enable KV v2 ----
root_token=$(grep '^VAULT_ROOT_TOKEN=' "$INIT_FILE" | cut -d= -f2-)
export VAULT_TOKEN="$root_token"

# Check if KV mount already exists (text format — grep for mount path in table)
if vault secrets list 2>/dev/null | grep -q "^${KV_MOUNT}/"; then
    echo "Step 3/3: KV mount ${KV_MOUNT}/ already exists"
else
    echo "Step 3/3: Enabling KV v2 at ${KV_MOUNT}/..."
    vault secrets enable -path="${KV_MOUNT}" kv-v2
    echo "  KV v2 enabled"
fi

echo "Vault ready (initialized + unsealed + KV mounted)"
exit 0
