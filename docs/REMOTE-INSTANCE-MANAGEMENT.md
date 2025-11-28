# DIVE V3 Remote Instance Management Procedure

**Document Version:** 1.0  
**Date:** November 26, 2025  
**Classification:** INTERNAL USE ONLY

---

## Overview

This document establishes best practice procedures for managing remote DIVE V3 instances that operate outside the primary development environment. Remote instances are external federation partners that require coordinated management, monitoring, and maintenance.

### Current Remote Instances

| Instance | Domain | Type | SSH Access | Project Dir |
|----------|--------|------|------------|-------------|
| DEU (Germany) | `prosecurity.biz` | External Partner | `ssh mike@192.168.42.120` | `/opt/dive-v3` |

### Security Remediations Completed (Nov 26, 2025)

| Issue | Status | Resolution |
|-------|--------|------------|
| DEU Keycloak uses default credentials (admin/admin) | ✅ RESOLVED | Updated to `DivePilot2025!` (consistent with all instances) |
| DEU OPA uses HTTP internally | ✅ RESOLVED | Enabled OPA TLS with certificate.pem and key.pem |
| DEU docker-compose.yml has deprecated 'version' attribute | ✅ RESOLVED | Removed 'version', modernized docker-compose.yml |
| DEU missing GBR federation partner | ✅ RESOLVED | Added via Terraform (full mesh: USA, FRA, GBR, DEU) |
| DEU dive-v3-broker realm missing | ✅ RESOLVED | Created via Terraform with test users |

### Local Instances (Reference)

| Instance | Domain | Type |
|----------|--------|------|
| USA | `*.dive25.com` | Local |
| FRA | `*.dive25.com` | Local |
| GBR | `*.dive25.com` | Local |

---

## Part 1: Monitoring & Health Checks

### 1.1 Automated Monitoring

Remote instances are monitored via the centralized status page:

```bash
# Status page API endpoint
curl -s https://status.dive25.com/api/status | jq '.instances[] | select(.type == "remote")'

# Direct health check
curl -sk https://deu-api.prosecurity.biz/health
curl -sk https://deu-app.prosecurity.biz
curl -sk https://deu-idp.prosecurity.biz/realms/dive-v3-broker
```

### 1.2 Prometheus Scraping

Remote instances can expose metrics for Prometheus scraping:

```yaml
# instances/shared/prometheus.yml
- job_name: 'dive-v3-backend-deu'
  static_configs:
    - targets: ['deu-api.prosecurity.biz:443']
      labels:
        instance: 'deu'
        type: 'external'
  metrics_path: '/metrics'
  scheme: https
  tls_config:
    insecure_skip_verify: true  # For self-signed certs
```

### 1.3 Alert Rules for Remote Instances

```yaml
# monitoring/alerts/remote-instances.yml
groups:
  - name: remote-instance-alerts
    rules:
      - alert: RemoteInstanceDown
        expr: up{instance="deu"} == 0
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Remote instance {{ $labels.instance }} is down"
          
      - alert: RemoteInstanceHighLatency
        expr: probe_http_duration_seconds{instance="deu"} > 2
        for: 10m
        labels:
          severity: warning
```

---

## Part 2: Access & Authentication

### 2.1 SSH Access Procedure

```bash
# Standard SSH access
ssh mike@192.168.42.120

# Using sshpass (non-interactive) - MUST INCLUDE PubkeyAuthentication=no
# This is required because local SSH keys may have passphrases
sshpass -p 'mike2222' ssh -o PubkeyAuthentication=no -o StrictHostKeyChecking=no mike@192.168.42.120

# Execute remote command
sshpass -p 'mike2222' ssh -o PubkeyAuthentication=no mike@192.168.42.120 'docker ps'

# RECOMMENDED: Use the ssh-helper.sh for consistent access
source scripts/remote/ssh-helper.sh
ssh_remote deu "docker ps"
sudo_remote deu "chown -R 1000:1000 /opt/dive-v3/keycloak/themes"
```

### 2.2 Lessons Learned (Nov 2025)

| Issue | Resolution |
|-------|------------|
| sshpass hangs indefinitely | Add `-o PubkeyAuthentication=no` to force password auth (local keys have passphrases that sshpass can't handle) |
| sudo commands timeout | Use `echo 'password' \| sudo -S command` to pipe password non-interactively |
| macOS rsync extended attributes | Use `tar` archive instead of direct rsync for theme files |
| `docker-compose` not found | Use `docker compose` (v2) on newer systems |
| Wrong remote paths | DEU uses `/opt/dive-v3` not `/home/mike/dive-v3` |

### 2.3 Security Best Practices

1. **SSH Key Authentication**: Migrate from password to SSH key-based auth
   ```bash
   # Generate key (if not exists)
   ssh-keygen -t ed25519 -C "dive-v3-admin"
   
   # Copy to remote
   ssh-copy-id mike@192.168.42.120
   ```

2. **Jump Host**: Consider using a bastion host for sensitive environments

3. **Audit Logging**: Ensure SSH sessions are logged
   ```bash
   # On remote host
   cat /var/log/auth.log | grep ssh
   ```

---

## Part 3: Deployment & Updates

### 3.1 Pre-Update Checklist

- [ ] Notify federation partners of planned maintenance
- [ ] Verify backup of current configuration
- [ ] Check current container versions
- [ ] Review changelog for breaking changes
- [ ] Schedule maintenance window

### 3.2 Remote Deployment Scripts

All remote management scripts are in `scripts/remote/` and use the shared `ssh-helper.sh` for consistent SSH configuration.

**Available Scripts:**

| Script | Purpose | Usage |
|--------|---------|-------|
| `ssh-helper.sh` | Core SSH functions (source this first) | `source scripts/remote/ssh-helper.sh` |
| `deploy-remote.sh` | Full deployment with backup | `./scripts/remote/deploy-remote.sh deu` |
| `sync-themes.sh` | Sync Keycloak themes only | `./scripts/remote/sync-themes.sh deu` |
| `sync-policies.sh` | Sync OPA policies only | `./scripts/remote/sync-policies.sh deu` |
| `check-drift.sh` | Check for configuration drift | `./scripts/remote/check-drift.sh deu` |
| `backup-remote.sh` | Create remote backup | `./scripts/remote/backup-remote.sh deu` |

**Quick Commands:**

```bash
# Full deployment with theme sync
./scripts/remote/deploy-remote.sh deu --sync-themes

# Just sync themes (after UI changes)
./scripts/remote/sync-themes.sh deu

# Just sync policies (after Rego changes)
./scripts/remote/sync-policies.sh deu

# Interactive access using helper functions
source scripts/remote/ssh-helper.sh
ssh_remote deu "docker ps"
sudo_remote deu "docker restart dive-v3-keycloak-deu"
sync_themes deu
restart_services deu keycloak frontend backend
```

### 3.3 Sync Configuration Files

```bash
#!/bin/bash
# scripts/sync-remote-config.sh

REMOTE_HOST="mike@192.168.42.120"
REMOTE_PASSWORD="mike2222"
REMOTE_PROJECT_DIR="/opt/dive-v3"

# Sync policies
echo ">>> Syncing OPA policies..."
sshpass -p "$REMOTE_PASSWORD" rsync -avz \
  --exclude='*.rego.bak' \
  policies/ "$REMOTE_HOST:$REMOTE_PROJECT_DIR/policies/"

# Sync Keycloak themes (if applicable)
echo ">>> Syncing Keycloak themes..."
sshpass -p "$REMOTE_PASSWORD" rsync -avz \
  keycloak/themes/ "$REMOTE_HOST:$REMOTE_PROJECT_DIR/keycloak/themes/"

# Restart affected services
echo ">>> Restarting OPA..."
sshpass -p "$REMOTE_PASSWORD" ssh "$REMOTE_HOST" \
  "cd $REMOTE_PROJECT_DIR && docker-compose restart opa"
```

---

## Part 4: Backup & Recovery

### 4.1 Automated Backup Script

```bash
#!/bin/bash
# scripts/backup-remote.sh

REMOTE_HOST="mike@192.168.42.120"
REMOTE_PASSWORD="mike2222"
REMOTE_PROJECT_DIR="/opt/dive-v3"
LOCAL_BACKUP_DIR="backups/remote-deu"
BACKUP_DATE=$(date +%Y%m%d-%H%M%S)

mkdir -p "$LOCAL_BACKUP_DIR/$BACKUP_DATE"

echo "=== Remote Backup: DEU Instance ==="
echo "Date: $BACKUP_DATE"

# 1. Backup Docker volumes
echo ">>> Backing up Docker volumes..."
sshpass -p "$REMOTE_PASSWORD" ssh "$REMOTE_HOST" \
  "cd $REMOTE_PROJECT_DIR && docker-compose exec -T postgres pg_dump -U postgres keycloak_db" \
  > "$LOCAL_BACKUP_DIR/$BACKUP_DATE/keycloak-db.sql"

sshpass -p "$REMOTE_PASSWORD" ssh "$REMOTE_HOST" \
  "cd $REMOTE_PROJECT_DIR && docker-compose exec -T mongodb mongodump --archive" \
  > "$LOCAL_BACKUP_DIR/$BACKUP_DATE/mongodb.archive"

# 2. Backup configuration files
echo ">>> Backing up configuration..."
sshpass -p "$REMOTE_PASSWORD" rsync -avz \
  "$REMOTE_HOST:$REMOTE_PROJECT_DIR/docker-compose.yml" \
  "$LOCAL_BACKUP_DIR/$BACKUP_DATE/"

sshpass -p "$REMOTE_PASSWORD" rsync -avz \
  "$REMOTE_HOST:$REMOTE_PROJECT_DIR/.env" \
  "$LOCAL_BACKUP_DIR/$BACKUP_DATE/"

# 3. Create manifest
cat > "$LOCAL_BACKUP_DIR/$BACKUP_DATE/manifest.json" << EOF
{
  "instance": "deu",
  "domain": "prosecurity.biz",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "contents": [
    "keycloak-db.sql",
    "mongodb.archive",
    "docker-compose.yml",
    ".env"
  ]
}
EOF

echo "=== Backup Complete: $LOCAL_BACKUP_DIR/$BACKUP_DATE ==="
```

### 4.2 Recovery Procedure

1. **Stop services**: `docker-compose down`
2. **Restore PostgreSQL**: `psql -U postgres keycloak_db < keycloak-db.sql`
3. **Restore MongoDB**: `mongorestore --archive < mongodb.archive`
4. **Restore configuration**: Copy `docker-compose.yml` and `.env`
5. **Start services**: `docker-compose up -d`
6. **Verify health**: Check all endpoints

---

## Part 5: Federation Management

### 5.1 Federation Registry

Remote instances must be registered in `config/federation-registry.json`:

```json
{
  "version": "2.0.0",
  "instances": {
    "deu": {
      "name": "Germany",
      "type": "remote",
      "domain": "prosecurity.biz",
      "endpoints": {
        "app": "https://deu-app.prosecurity.biz",
        "api": "https://deu-api.prosecurity.biz",
        "idp": "https://deu-idp.prosecurity.biz"
      },
      "contact": {
        "admin": "admin@prosecurity.biz",
        "oncall": "+49-xxx-xxx-xxxx"
      },
      "maintenance": {
        "window": "Sunday 02:00-06:00 CET",
        "notification_hours": 48
      }
    }
  }
}
```

### 5.2 Identity Provider Synchronization

When updating Keycloak IdP configurations, ensure remote instances are updated:

```bash
# Export IdP configuration from local
./scripts/export-idp-config.sh usa-idp > idp-config.json

# Apply to remote (via SSH or Keycloak API)
sshpass -p 'mike2222' ssh mike@192.168.42.120 \
  "cd /home/mike/dive-v3 && ./scripts/import-idp-config.sh < idp-config.json"
```

### 5.3 Certificate Rotation

Remote instances need certificate rotation coordination:

1. **Notify**: Inform federation partners 7 days in advance
2. **Generate**: Create new certificates
3. **Deploy**: Update remote instance certificates
4. **Update**: Refresh trust stores on local instances
5. **Verify**: Test federation flows

---

## Part 6: Troubleshooting

### 6.1 Common Issues

| Issue | Diagnosis | Resolution |
|-------|-----------|------------|
| Federation login fails | Check IdP metadata | Re-sync IdP configuration |
| 502 Bad Gateway | Check Cloudflare tunnel | Restart cloudflared service |
| Database connection refused | Check container health | Restart postgres/mongodb |
| OPA policy errors | Check policy syntax | Sync policies from main repo |
| Certificate expired | Check cert dates | Rotate certificates |

### 6.2 Diagnostic Commands

```bash
# Check container status
sshpass -p 'mike2222' ssh mike@192.168.42.120 'docker ps -a'

# View logs
sshpass -p 'mike2222' ssh mike@192.168.42.120 'docker logs dive-v3-backend --tail 100'

# Check disk space
sshpass -p 'mike2222' ssh mike@192.168.42.120 'df -h'

# Check memory
sshpass -p 'mike2222' ssh mike@192.168.42.120 'free -m'

# Network connectivity
sshpass -p 'mike2222' ssh mike@192.168.42.120 'curl -sk https://usa-api.dive25.com/health'
```

### 6.3 Emergency Procedures

**Service Outage:**
1. Verify network connectivity
2. Check container health: `docker ps`
3. Review logs: `docker logs <container>`
4. Restart affected service: `docker restart <container>`
5. If persistent, escalate to on-call

**Security Incident:**
1. Isolate instance: `docker-compose down`
2. Preserve logs: `docker logs > incident-$(date +%s).log`
3. Notify security team
4. Do NOT restart until cleared

---

## Part 7: Maintenance Schedule

### 7.1 Regular Maintenance Tasks

| Task | Frequency | Script |
|------|-----------|--------|
| Health Check | Every 5 min | `status-page/health-check.sh` |
| Backup | Daily | `scripts/backup-remote.sh` |
| Log Rotation | Weekly | `docker system prune --all --force` |
| Certificate Check | Monthly | `scripts/check-certs.sh` |
| Security Patches | Monthly | `docker-compose pull && docker-compose up -d` |
| Full Audit | Quarterly | Manual review |

### 7.2 Maintenance Window Protocol

1. **48 hours before**: Send notification to federation partners
2. **24 hours before**: Confirm maintenance window
3. **1 hour before**: Final health check
4. **During**: Execute maintenance, monitor closely
5. **After**: Verify all services, send completion notification

---

## Part 8: Contacts & Escalation

### 8.1 Contact Matrix

| Role | Contact | Hours |
|------|---------|-------|
| DEU Admin | admin@prosecurity.biz | Business hours (CET) |
| On-Call | +49-xxx-xxx-xxxx | 24/7 |
| Security | security@dive25.com | 24/7 |

### 8.2 Escalation Path

1. **Level 1**: Check monitoring dashboards, attempt self-resolution
2. **Level 2**: Contact remote instance admin
3. **Level 3**: Engage security team (if security incident)
4. **Level 4**: Executive notification (if major outage)

---

## Appendix A: Quick Reference

### SSH One-Liners

```bash
# Quick health check
sshpass -p 'mike2222' ssh mike@192.168.42.120 'docker-compose ps'

# Restart all services
sshpass -p 'mike2222' ssh mike@192.168.42.120 'cd /home/mike/dive-v3 && docker-compose restart'

# View backend logs
sshpass -p 'mike2222' ssh mike@192.168.42.120 'docker logs dive-v3-backend --tail 50 -f'

# Check OPA policies
sshpass -p 'mike2222' ssh mike@192.168.42.120 'docker exec dive-v3-opa cat /policies/dive_abac_policy.rego'
```

### API Endpoints

```bash
# Health
curl -sk https://deu-api.prosecurity.biz/health

# IdPs
curl -sk https://deu-api.prosecurity.biz/api/idps/public

# Keycloak Realm
curl -sk https://deu-idp.prosecurity.biz/realms/dive-v3-broker/.well-known/openid-configuration
```

---

**Document maintained by**: DIVE V3 Infrastructure Team  
**Last reviewed**: November 26, 2025

