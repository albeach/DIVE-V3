# Multi-Platform Quick Reference

## Platform Detection

```bash
# Check your architecture
uname -m

# ARM64 (macOS):  arm64 or aarch64
# AMD64 (Ubuntu): x86_64
```

## Deployment Commands

### Both Platforms (Native)
```bash
# Standard deployment
docker compose up -d

# Verify native execution
docker compose exec opa uname -m
# Should match host architecture
```

### Force Specific Platform (Testing Only)
```bash
# Force AMD64 (e.g., for testing on ARM64)
docker compose -f docker-compose.yml -f docker-compose.platform.yml up -d

# ⚠️ This will use emulation (slower)
```

## Ubuntu 24.04.3 LTS Setup

```bash
# 1. Run automated setup
sudo ./scripts/setup-ubuntu.sh

# 2. Log out and back in (Docker group)

# 3. Start DIVE V3
docker compose up -d

# 4. Verify deployment
./scripts/verify-platform-compatibility.sh
```

## Verification

```bash
# Check all services are native
./scripts/verify-platform-compatibility.sh

# Quick health check
curl -k https://localhost:4000/health
curl -k https://localhost:3000
curl http://localhost:8181/health
```

## Troubleshooting

### Issue: "platform not supported"
```bash
# Rebuild without cache
docker compose build --no-cache
docker compose up -d
```

### Issue: "permission denied" (Ubuntu)
```bash
# Fix directory permissions
sudo chown -R 1001:1001 backend/logs
sudo chown -R 1001:1001 frontend/.next
```

### Issue: Slow performance
```bash
# Check for emulation
docker compose logs 2>&1 | grep -i qemu

# If found, remove platform specifications
grep -r "platform:" docker-compose.yml
# Remove any "platform: linux/amd64" lines
```

## Files Modified for Multi-Platform Support

- `docker-compose.yml` - Removed `platform: linux/amd64` from OPA
- `keycloak/Dockerfile` - Added `ARG TARGETARCH` for dynamic curl
- `docker-compose.platform.yml` - Optional platform override
- `scripts/verify-platform-compatibility.sh` - Verification tool
- `scripts/setup-ubuntu.sh` - Ubuntu automation
- `docs/MULTI-PLATFORM-DEPLOYMENT.md` - Full guide

## Performance Comparison

| Platform | Architecture | Performance |
|----------|-------------|-------------|
| macOS M1/M2/M3 | ARM64 Native | ⚡️ Optimal |
| Ubuntu 24.04 | AMD64 Native | ⚡️ Optimal |
| macOS (emulated) | AMD64 via QEMU | 🐢 2-5x slower |

## Common Questions

**Q: Do I need to change anything for Ubuntu?**
A: Just run `sudo ./scripts/setup-ubuntu.sh` once, then use normal commands.

**Q: Will this work on my Apple Silicon Mac?**
A: Yes! All services run natively on ARM64.

**Q: Can I test AMD64 behavior on my Mac?**
A: Yes, use: `docker compose -f docker-compose.yml -f docker-compose.platform.yml up`

**Q: How do I know if emulation is happening?**
A: Run `./scripts/verify-platform-compatibility.sh` - it will warn you.

## Support

- Full Guide: [docs/MULTI-PLATFORM-DEPLOYMENT.md](docs/MULTI-PLATFORM-DEPLOYMENT.md)
- Summary: [MULTI-PLATFORM-IMPLEMENTATION-COMPLETE.md](MULTI-PLATFORM-IMPLEMENTATION-COMPLETE.md)
- Issues: Run verification script for detailed diagnostics

