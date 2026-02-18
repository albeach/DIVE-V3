# =============================================================================
# DIVE V3 Caddy — Custom build with Cloudflare DNS module
# =============================================================================
# Enables DNS-01 ACME challenge for Let's Encrypt cert provisioning
# without requiring inbound port 80.
# =============================================================================

FROM caddy:2-builder AS builder

RUN xcaddy build \
    --with github.com/caddy-dns/cloudflare

FROM caddy:2

COPY --from=builder /usr/bin/caddy /usr/bin/caddy
