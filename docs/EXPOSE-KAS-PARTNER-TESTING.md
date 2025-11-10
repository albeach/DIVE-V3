# Exposing KAS for Partner Testing

## Quick Start

### 1. Start your KAS server
```bash
# Start the entire DIVE stack (including KAS)
docker-compose up -d

# Or start just KAS
docker-compose up -d kas

# Verify KAS is running
curl http://localhost:8080/health
```

### 2. Expose KAS to the internet

**Option A: Using ngrok (Easiest)**
```bash
# Install ngrok
brew install ngrok  # macOS
# or download from https://ngrok.com/download

# Run the expose script
./scripts/expose-kas.sh ngrok

# Share the HTTPS URL with your partner (e.g., https://abc123.ngrok.io)
```

**Option B: Using Cloudflare Tunnel**
```bash
# Install cloudflared
brew install cloudflare/cloudflare/cloudflared

# Run the expose script
./scripts/expose-kas.sh cloudflared

# Share the URL with your partner
```

**Option C: Using LocalTunnel**
```bash
# Run the expose script (auto-installs if needed)
./scripts/expose-kas.sh localtunnel

# Share the URL with your partner
```

### 3. Generate test tokens for your partner
```bash
# Generate token for US test user
./scripts/generate-partner-test-token.sh testuser-us

# Generate token for France test user
./scripts/generate-partner-test-token.sh testuser-fra password123

# Token will be displayed and saved to tmp/partner-token-<username>.txt
```

### 4. Share with partner
Send your partner:
1. **KAS URL**: The HTTPS URL from step 2 (e.g., `https://abc123.ngrok.io`)
2. **JWT Token**: From step 3 or have them request their own
3. **Testing Guide**: Share `docs/KAS-PARTNER-TESTING-GUIDE.md`

### 5. Partner tests the endpoint
```bash
# Health check (no auth required)
curl https://abc123.ngrok.io/health

# Request decryption key
curl -X POST https://abc123.ngrok.io/request-key \
  -H "Content-Type: application/json" \
  -d '{
    "resourceId": "doc-fuel-inventory-2024",
    "kaoId": "kao-test-001",
    "bearerToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
    "wrappedKey": "dGVzdGtleQ=="
  }'
```

## Available Test Users

| Username | Password | Clearance | Country | COI |
|----------|----------|-----------|---------|-----|
| testuser-us | password123 | SECRET | USA | FVEY |
| testuser-fra | password123 | SECRET | FRA | NATO-COSMIC |
| testuser-can | password123 | CONFIDENTIAL | CAN | CAN-US |
| bob.contractor | password123 | CONFIDENTIAL | USA | US-ONLY |

## Troubleshooting

### "KAS is not running"
```bash
docker-compose up -d kas
docker logs dive-v3-kas
```

### "ngrok not found"
```bash
# macOS
brew install ngrok

# Linux
snap install ngrok

# Or download from https://ngrok.com/download
```

### "Token generation failed"
```bash
# Check Keycloak is running
docker-compose up -d keycloak

# Check user exists
docker-compose exec keycloak /opt/keycloak/bin/kcadm.sh get users \
  -r dive-v3-broker --fields username
```

### Partner cannot connect
- Verify tunnel is still running (ngrok URLs change on restart)
- Check firewall settings
- Verify KAS container is healthy: `docker ps | grep kas`
- Check KAS logs: `docker logs dive-v3-kas`

## Security Notes

⚠️ **For testing only** - Not for production use:
- ngrok free tier has rate limits (40 req/min)
- JWT tokens expire after 15 minutes
- All requests are logged in KAS audit logs
- KAS re-evaluates OPA policy on every request

For production deployments, use proper infrastructure (load balancer, API gateway, etc.)

## Rate Limits

| Service | Limit |
|---------|-------|
| ngrok (free) | 40 requests/min |
| cloudflared | Unlimited |
| localtunnel | 100 requests/min |
| KAS (dev) | Unlimited |

## Example Integration Test

```bash
#!/bin/bash
# Save as test-kas.sh

KAS_URL="https://your-url.ngrok.io"
TOKEN=$(cat tmp/partner-token-testuser-us.txt | grep ACCESS_TOKEN | cut -d'"' -f2)

echo "Testing KAS at $KAS_URL"

# 1. Health check
echo "1. Health check..."
curl -s "$KAS_URL/health" | jq '.status'

# 2. Valid request
echo "2. Request key..."
curl -s -X POST "$KAS_URL/request-key" \
  -H "Content-Type: application/json" \
  -d "{
    \"resourceId\": \"doc-fuel-inventory-2024\",
    \"kaoId\": \"kao-test-001\",
    \"bearerToken\": \"$TOKEN\",
    \"wrappedKey\": \"dGVzdGtleQ==\"
  }" | jq '.success'

echo "Test complete!"
```

## Support

- **Documentation**: See `docs/KAS-PARTNER-TESTING-GUIDE.md` for full API reference
- **Issues**: Check KAS logs with `docker logs dive-v3-kas`
- **Questions**: Review the main [README.md](../README.md)

## Next Steps

1. Partner reads the testing guide: `docs/KAS-PARTNER-TESTING-GUIDE.md`
2. Partner implements their integration
3. Partner tests all scenarios (success, denial, errors)
4. Review audit logs: `docker logs dive-v3-kas | grep "KEY_RELEASED\|KEY_DENIED"`

