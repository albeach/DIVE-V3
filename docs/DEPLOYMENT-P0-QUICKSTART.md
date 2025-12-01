# DIVE V3 - P0 Priority Implementation Guide

**Time Required:** ~4 hours  
**Risk Level:** Low (no breaking changes)

This guide implements the immediate priority items from the Deployment Architecture Audit.

---

## P0-1: Standardize Healthchecks (2h)

### Step 1: Update federation-registry.json

Add the `healthcheckTemplates` section:

```json
{
  "healthcheckTemplates": {
    "postgres": {
      "test": ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-postgres}"],
      "interval": "10s",
      "timeout": "5s",
      "retries": 5
    },
    "mongodb": {
      "test": ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"],
      "interval": "10s",
      "timeout": "5s",
      "retries": 5
    },
    "redis": {
      "test": ["CMD", "redis-cli", "ping"],
      "interval": "10s",
      "timeout": "5s",
      "retries": 5
    },
    "keycloak": {
      "test": ["CMD-SHELL", "curl -f http://localhost:8080/health/ready || exit 1"],
      "interval": "30s",
      "timeout": "10s",
      "retries": 5,
      "start_period": "90s"
    },
    "opa": {
      "test": ["CMD", "wget", "--spider", "-q", "http://localhost:8181/health"],
      "interval": "10s",
      "timeout": "5s",
      "retries": 3
    },
    "backend": {
      "test": ["CMD", "curl", "-kfs", "https://localhost:4000/health"],
      "interval": "15s",
      "timeout": "10s",
      "retries": 5,
      "start_period": "30s"
    },
    "frontend": {
      "test": ["CMD", "curl", "-kfsI", "--max-time", "5", "https://localhost:3000/"],
      "interval": "30s",
      "timeout": "15s",
      "retries": 10,
      "start_period": "120s"
    },
    "kas": {
      "test": ["CMD", "curl", "-kfs", "https://localhost:8080/health"],
      "interval": "15s",
      "timeout": "10s",
      "retries": 5,
      "start_period": "30s"
    },
    "cloudflared": {
      "test": ["CMD", "cloudflared", "version"],
      "interval": "30s",
      "timeout": "10s",
      "retries": 5,
      "start_period": "30s"
    }
  }
}
```

### Step 2: Apply to All Compose Files

Run this sed script to standardize Keycloak healthchecks:

```bash
# Standardize Keycloak healthcheck across all compose files
for file in docker-compose.yml docker-compose.fra.yml docker-compose.gbr.yml docker-compose.deu.yml; do
  # This is just a reference - actual edits should be reviewed manually
  echo "Review healthcheck in: $file"
done
```

**Manual verification points:**
- [ ] `docker-compose.yml` - Keycloak uses `/health/ready`
- [ ] `docker-compose.fra.yml` - Keycloak uses `/health/ready`
- [ ] `docker-compose.gbr.yml` - Keycloak uses `/health/ready`
- [ ] `docker-compose.deu.yml` - Keycloak uses `/health/ready`

---

## P0-2: Add Restart Policies (1h)

### Add to All Services

Every service should have:

```yaml
restart: unless-stopped
stop_grace_period: 30s
```

**Services to update in each compose file:**
- postgres
- keycloak
- mongo / mongodb
- redis
- opa
- backend
- frontend
- kas

**Already has restart policy:**
- cloudflared ✓

---

## P0-3: Wire Verification into Deployment (1h)

### Update deploy-dive-instance.sh

The `verify-deployment.sh` script exists but may not be properly integrated. Ensure it's called:

```bash
# Around line 343-400, verify the verify_deployment function calls the external script
verify_deployment() {
    local instance=$1
    local instance_lower=$(echo "$instance" | tr '[:upper:]' '[:lower:]')
    
    local verify_script="$PROJECT_ROOT/scripts/deployment/verify-deployment.sh"
    
    if [ -x "$verify_script" ]; then
        log_info "Running verification script..."
        if "$verify_script" "$instance_lower"; then
            return 0
        else
            return 1
        fi
    fi
    # ... fallback logic
}
```

**Verification:**
```bash
# Test verification integration
./scripts/deploy-dive-instance.sh USA --dry-run
# Should show verification will be called
```

---

## Validation Checklist

After implementing P0 priorities:

- [ ] All healthchecks use consistent patterns
- [ ] All services have `restart: unless-stopped`
- [ ] `deploy-dive-instance.sh --dry-run` shows verification step
- [ ] Manual test: stop a container, verify it restarts

### Test Command

```bash
# Full validation
./scripts/deploy-dive-instance.sh USA --dry-run

# Test restart policy
docker stop dive-v3-backend
sleep 10
docker ps | grep dive-v3-backend  # Should be running again

# Test healthcheck
docker inspect dive-v3-keycloak --format='{{.State.Health.Status}}'
```

---

## Next Steps (P1)

After P0 is complete:

1. Run `./scripts/federation/generate-all-configs.sh` to validate SSOT
2. Compare generated compose files with hand-maintained ones
3. Plan migration to fully generated compose files




