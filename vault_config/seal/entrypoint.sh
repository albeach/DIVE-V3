#!/bin/sh
# =============================================================================
# Vault Seal Auto-Init & Auto-Unseal Entrypoint
# =============================================================================
# This script manages the lifecycle of the lightweight "seal vault" whose sole
# purpose is to host the Transit secret engine for auto-unsealing the main
# Vault HA cluster.
#
# On first run: initializes with 1 key share / 1 threshold, enables Transit,
#   creates the "autounseal" key, and saves credentials to persistent storage.
# On restart: reads saved credentials and auto-unseals.
# =============================================================================

set -e

VAULT_ADDR="http://127.0.0.1:8200"
export VAULT_ADDR

SEAL_KEYS_FILE="/vault/data/.seal-keys"
TRANSIT_TOKEN_FILE="/vault/transit/.transit-token"  # Shared volume — cluster nodes read this
POLICY_FILE="/vault/config/seal-policy.hcl"

log() {
  echo "[seal-vault] $(date '+%H:%M:%S') $*"
}

wait_for_vault() {
  local max_attempts=30
  local attempt=0
  local exit_code=0
  while [ $attempt -lt $max_attempts ]; do
    # vault status returns: 0=unsealed, 1=error, 2=sealed (but responding)
    vault status -format=json >/dev/null 2>&1 && return 0
    exit_code=$?
    # Exit code 2 means sealed but responding — good enough
    if [ "$exit_code" = "2" ]; then
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 1
  done
  log "ERROR: Vault did not become responsive after ${max_attempts}s"
  return 1
}

initialize_vault() {
  log "Initializing seal vault (1 share, 1 threshold)..."
  local init_output
  init_output=$(vault operator init -key-shares=1 -key-threshold=1 -format=json)

  # Collapse multi-line JSON to single line for sed parsing
  local init_oneline
  init_oneline=$(echo "$init_output" | tr -d '\n')

  local unseal_key
  unseal_key=$(echo "$init_oneline" | sed -n 's/.*"unseal_keys_b64": *\[ *"\([^"]*\)".*/\1/p')
  local root_token
  root_token=$(echo "$init_oneline" | sed -n 's/.*"root_token": *"\([^"]*\)".*/\1/p')

  if [ -z "$unseal_key" ] || [ -z "$root_token" ]; then
    log "ERROR: Failed to parse init output"
    return 1
  fi

  # Save to persistent volume
  cat > "$SEAL_KEYS_FILE" <<EOF
UNSEAL_KEY=${unseal_key}
ROOT_TOKEN=${root_token}
EOF
  chmod 600 "$SEAL_KEYS_FILE"
  log "Credentials saved to persistent volume"

  echo "$unseal_key"
}

unseal_vault() {
  local unseal_key="$1"
  log "Unsealing seal vault..."
  vault operator unseal "$unseal_key" >/dev/null 2>&1
  log "Seal vault unsealed"
}

setup_transit() {
  local root_token="$1"
  export VAULT_TOKEN="$root_token"

  # Enable Transit engine (idempotent — check first)
  if ! vault secrets list -format=json 2>/dev/null | grep -q '"transit/"'; then
    log "Enabling Transit secret engine..."
    vault secrets enable transit
  else
    log "Transit engine already enabled"
  fi

  # Create autounseal key (idempotent — check first)
  if ! vault read transit/keys/autounseal >/dev/null 2>&1; then
    log "Creating 'autounseal' Transit key (aes256-gcm96)..."
    vault write -f transit/keys/autounseal type=aes256-gcm96
  else
    log "Transit key 'autounseal' already exists"
  fi

  # Create scoped policy + token (only if token file doesn't exist)
  if [ ! -f "$TRANSIT_TOKEN_FILE" ]; then
    log "Creating scoped Transit policy and token..."
    vault policy write autounseal "$POLICY_FILE"

    local token_output
    token_output=$(vault token create -policy=autounseal -orphan -period=768h -format=json)
    # Collapse multi-line JSON to single line for sed parsing
    local token_oneline
    token_oneline=$(echo "$token_output" | tr -d '\n')
    local transit_token
    transit_token=$(echo "$token_oneline" | sed -n 's/.*"client_token": *"\([^"]*\)".*/\1/p')

    echo "$transit_token" > "$TRANSIT_TOKEN_FILE"
    chmod 600 "$TRANSIT_TOKEN_FILE"
    log "Transit token saved"
  else
    log "Transit token already exists"
  fi

  unset VAULT_TOKEN
}

# =============================================================================
# Main
# =============================================================================

log "Starting Vault server..."
vault server -config=/vault/config/config.hcl &
VAULT_PID=$!

# Wait for Vault to respond
wait_for_vault

# Determine state
vault_status=$(vault status -format=json 2>/dev/null || true)
is_initialized=$(echo "$vault_status" | sed -n 's/.*"initialized": *\(true\|false\).*/\1/p')
is_sealed=$(echo "$vault_status" | sed -n 's/.*"sealed": *\(true\|false\).*/\1/p')

if [ "$is_initialized" = "false" ]; then
  # First run: initialize + unseal + setup Transit
  log "First run detected — initializing..."
  unseal_key=$(initialize_vault)
  unseal_vault "$unseal_key"

  # Load credentials for Transit setup
  . "$SEAL_KEYS_FILE"
  setup_transit "$ROOT_TOKEN"

elif [ "$is_sealed" = "true" ]; then
  # Restart: auto-unseal from saved credentials
  log "Restart detected — auto-unsealing..."
  if [ ! -f "$SEAL_KEYS_FILE" ]; then
    log "ERROR: No saved credentials found at $SEAL_KEYS_FILE"
    log "The seal vault volume may have been destroyed. Re-initialization required."
    exit 1
  fi

  . "$SEAL_KEYS_FILE"
  unseal_vault "$UNSEAL_KEY"

  # Verify Transit is still set up (it should be, data is persistent)
  export VAULT_TOKEN="$ROOT_TOKEN"
  if ! vault secrets list -format=json 2>/dev/null | grep -q '"transit/"'; then
    log "WARN: Transit engine missing after restart — re-enabling..."
    setup_transit "$ROOT_TOKEN"
  fi
  unset VAULT_TOKEN

else
  log "Seal vault is already initialized and unsealed"
  # Ensure Transit setup exists
  if [ -f "$SEAL_KEYS_FILE" ]; then
    . "$SEAL_KEYS_FILE"
    setup_transit "$ROOT_TOKEN"
  fi
fi

log "Seal vault ready — Transit auto-unseal operational"

# Wait for Vault process (foreground)
wait $VAULT_PID
