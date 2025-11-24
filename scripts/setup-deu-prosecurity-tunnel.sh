#!/usr/bin/env bash
#
# DIVE V3 – Cloudflare Zero Trust tunnel bootstrap for the DEU (prosecurity.biz) realm
# ------------------------------------------------------------------------------
# This script provisions a Cloudflare Tunnel, generates a config with the DEU
# hostnames, and maps DNS records. It supports a dry-run mode so partners can
# preview commands before executing them with their own credentials.
#
# Usage:
#   chmod +x scripts/setup-deu-prosecurity-tunnel.sh
#   DRY_RUN=true scripts/setup-deu-prosecurity-tunnel.sh      # preview only
#   scripts/setup-deu-prosecurity-tunnel.sh                   # execute
#
# Optional overrides (environment variables):
#   CF_TUNNEL_NAME           – default: dive-v3-deu
#   CF_TUNNEL_CONFIG         – default: ~/.cloudflared/dive-v3-deu.yml
#   DEU_FRONTEND_HOST        – default: sp.prosecurity.biz
#   DEU_KEYCLOAK_HOST        – default: idp.prosecurity.biz
#   DEU_API_HOST             – default: api.prosecurity.biz
#   DEU_OPA_HOST             – default: opa.prosecurity.biz
#   DEU_KAS_HOST             – default: kas.prosecurity.biz
#   DEU_METRICS_HOST         – default: metrics.prosecurity.biz (optional dashboard)
#
set -euo pipefail

#######################################
# Helpers
#######################################
DRY_RUN="${DRY_RUN:-false}"
TUNNEL_NAME="${CF_TUNNEL_NAME:-dive-v3-deu}"
CONFIG_PATH="${CF_TUNNEL_CONFIG:-$HOME/.cloudflared/${TUNNEL_NAME}.yml}"
CLOUDFLARED_BIN="${CLOUDFLARED_BIN:-cloudflared}"

# Hostnames (can be overridden)
HOST_FRONTEND="${DEU_FRONTEND_HOST:-sp.prosecurity.biz}"
HOST_KEYCLOAK="${DEU_KEYCLOAK_HOST:-idp.prosecurity.biz}"
HOST_API="${DEU_API_HOST:-api.prosecurity.biz}"
HOST_OPA="${DEU_OPA_HOST:-opa.prosecurity.biz}"
HOST_KAS="${DEU_KAS_HOST:-kas.prosecurity.biz}"
HOST_METRICS="${DEU_METRICS_HOST:-metrics.prosecurity.biz}"

run_cmd() {
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "[DRY-RUN] $*"
  else
    "$@"
  fi
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "❌ Missing required command: $1"
    echo "   Install $1 and re-run the script."
    exit 1
  fi
}

#######################################
# Pre-flight checks
#######################################
echo "==============================================="
echo "DIVE V3 – DEU Cloudflare Tunnel provisioning"
echo "Tunnel name : $TUNNEL_NAME"
echo "Dry-run mode: $DRY_RUN"
echo "==============================================="

require_command "$CLOUDFLARED_BIN"

CERT_PATH="$HOME/.cloudflared/cert.pem"
if [[ ! -f "$CERT_PATH" ]]; then
  echo "⚠️  Cloudflare cert not found at $CERT_PATH"
  echo "   Run '$CLOUDFLARED_BIN tunnel login' with the Cloudflare account"
  echo "   that owns prosecurity.biz before re-running this script."
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "   Continuing in dry-run mode..."
  else
    exit 1
  fi
fi

#######################################
# Create or load tunnel
#######################################
echo ""
echo "➡️  Ensuring tunnel '$TUNNEL_NAME' exists..."

if [[ "$DRY_RUN" == "true" ]]; then
  echo "   [DRY-RUN] Skipping Cloudflare API calls."
  TUNNEL_ID="${DRY_RUN_TUNNEL_ID:-00000000-0000-0000-0000-000000000000}"
else
  get_tunnel_id() {
    "$CLOUDFLARED_BIN" tunnel list | awk -v t="$TUNNEL_NAME" '
      NR>1 && $2==t {print $1; exit}
    '
  }

  TUNNEL_ID="$(get_tunnel_id || true)"

  if [[ -z "$TUNNEL_ID" ]]; then
    echo "   Tunnel not found. Creating..."
    run_cmd "$CLOUDFLARED_BIN" tunnel create "$TUNNEL_NAME"
    TUNNEL_ID="$(get_tunnel_id || true)"
    if [[ -z "$TUNNEL_ID" ]]; then
      echo "❌ Unable to retrieve tunnel ID after creation."
      exit 1
    fi
  else
    echo "   Tunnel already exists (ID: $TUNNEL_ID)"
  fi
fi

#######################################
# Write tunnel config
# Non-standard port for Keycloak (8444) to deconflict with Mike's home server.
#######################################
mkdir -p "$(dirname "$CONFIG_PATH")"

CONFIG_BODY=$(cat <<EOF
tunnel: $TUNNEL_ID
credentials-file: $HOME/.cloudflared/${TUNNEL_ID}.json

ingress:
  - hostname: $HOST_FRONTEND
    service: https://localhost:3000
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s

  - hostname: $HOST_KEYCLOAK
    service: https://localhost:8444
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s

  - hostname: $HOST_API
    service: https://localhost:4000
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s

  - hostname: $HOST_OPA
    service: http://localhost:8181
    originRequest:
      connectTimeout: 30s

  - hostname: $HOST_KAS
    service: https://localhost:8085
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s

  - hostname: $HOST_METRICS
    service: http://localhost:9090
    originRequest:
      connectTimeout: 30s

  - service: http_status:404
EOF
)

if [[ "$DRY_RUN" == "true" ]]; then
  echo ""
  echo "[DRY-RUN] --- Proposed tunnel config ($CONFIG_PATH) ---"
  echo "$CONFIG_BODY"
  echo "[DRY-RUN] --- end config ---"
else
  echo "$CONFIG_BODY" > "$CONFIG_PATH"
  echo ""
  echo "📝 Tunnel config written to $CONFIG_PATH"
fi

#######################################
# Create DNS records
#######################################
map_hostname() {
  local host="$1"
  echo "   Mapping $host → tunnel"
  run_cmd "$CLOUDFLARED_BIN" tunnel route dns "$TUNNEL_NAME" "$host"
}

echo ""
echo "➡️  Creating DNS routes (CNAME records)..."
for host in "$HOST_FRONTEND" "$HOST_KEYCLOAK" "$HOST_API" "$HOST_OPA" "$HOST_KAS" "$HOST_METRICS"; do
  map_hostname "$host"
done

#######################################
# Optional systemd install
#######################################
if [[ "${INSTALL_SYSTEMD:-true}" == "true" ]]; then
  echo ""
  echo "➡️  Installing systemd service for tunnel..."
  run_cmd sudo "$CLOUDFLARED_BIN" service install --config "$CONFIG_PATH"
  if [[ "$DRY_RUN" != "true" ]]; then
    sudo systemctl enable cloudflared
    sudo systemctl restart cloudflared
  else
    echo "[DRY-RUN] sudo systemctl enable cloudflared"
    echo "[DRY-RUN] sudo systemctl restart cloudflared"
  fi
else
  echo ""
  echo "ℹ️  INSTALL_SYSTEMD=false; skipping service install."
fi

#######################################
# Summary
#######################################
echo ""
echo "==============================================="
echo "DEU Tunnel bootstrap complete (dry-run: $DRY_RUN)"
echo "  Frontend : https://$HOST_FRONTEND"
echo "  Keycloak : https://$HOST_KEYCLOAK"
echo "  API      : https://$HOST_API"
echo "  OPA      : https://$HOST_OPA"
echo "  KAS      : https://$HOST_KAS"
echo "  Metrics  : https://$HOST_METRICS"
echo ""
echo "Next steps:"
echo "  • Update Next.js, backend, Keycloak configs with new hostnames."
echo "  • Create Cloudflare Access policies for API/OPA/KAS as needed."
echo "  • Share JWKS + tunnel fingerprints with USA realm."
echo "==============================================="

