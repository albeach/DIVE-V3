# Security Hardening Checklist - External IdPs

Comprehensive security hardening checklist and automation for production deployment of Spain SAML and USA OIDC identity providers.

## 🔒 Certificate & Key Management

### Certificates
- [ ] Replace self-signed certificates with CA-signed certificates
- [ ] Use minimum 2048-bit RSA keys (4096-bit recommended)
- [ ] Enable certificate pinning for critical endpoints
- [ ] Implement automated certificate rotation (90-day max validity)
- [ ] Store certificates in secure vault (HashiCorp Vault, AWS Secrets Manager)
- [ ] Set up OCSP stapling for certificate validation
- [ ] Monitor certificate expiration (alert at 30 days)

### Private Keys
- [ ] Encrypt private keys at rest (AES-256)
- [ ] Restrict file permissions (chmod 600)
- [ ] Use hardware security modules (HSM) for key storage in production
- [ ] Implement key rotation policy (annually minimum)
- [ ] Never commit keys to version control
- [ ] Use separate keys for signing and encryption

**Automation**:
```bash
# Automated certificate monitoring
./scripts/monitor-certificates.sh

# Expected output: Certificate expires in X days
```

## 🌐 Network Security

### Firewall Rules
- [ ] Restrict external IdP access to DIVE broker IPs only
- [ ] Block direct database access from external networks
- [ ] Enable DDoS protection (rate limiting)
- [ ] Implement IP whitelisting for admin interfaces
- [ ] Use VPN/bastion for administrative access
- [ ] Enable network segmentation (separate IdP and DB networks)

### TLS/SSL Configuration
- [ ] Enforce TLS 1.2 minimum (TLS 1.3 recommended)
- [ ] Disable SSLv2, SSLv3, TLS 1.0, TLS 1.1
- [ ] Use strong cipher suites only (no RC4, DES, 3DES)
- [ ] Enable HSTS (Strict-Transport-Security header)
- [ ] Implement perfect forward secrecy (ECDHE ciphers)
- [ ] Disable TLS compression (CRIME attack mitigation)

**Hardened TLS Config**:
```nginx
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';
ssl_prefer_server_ciphers on;
ssl_session_cache shared:SSL:10m;
ssl_session_tickets off;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

## 🔐 Authentication & Authorization

### Password Policies
- [ ] Enforce minimum 16-character passwords for admin accounts
- [ ] Require password complexity (uppercase, lowercase, numbers, symbols)
- [ ] Implement password rotation (90 days maximum)
- [ ] Use password manager for credential storage
- [ ] Enable multi-factor authentication (MFA) for all admin access
- [ ] Implement account lockout after 5 failed attempts

### Access Control
- [ ] Follow principle of least privilege
- [ ] Use role-based access control (RBAC)
- [ ] Separate admin and service accounts
- [ ] Implement just-in-time (JIT) access for privileged operations
- [ ] Regular access reviews (quarterly)
- [ ] Disable default/demo accounts

**Keycloak Admin Hardening**:
```bash
# Disable default admin
/opt/keycloak/bin/kc.sh users delete admin --realm master

# Create dedicated admin with MFA
/opt/keycloak/bin/kc.sh users create admin-prod --realm master
/opt/keycloak/bin/kc.sh users set-password admin-prod --password <strong-password>
```

## 🛡️ Application Hardening

### Spain SAML (SimpleSAMLphp)
- [ ] Disable debug mode in production
- [ ] Remove demo/example modules
- [ ] Set `admin.protectindexpage` to true
- [ ] Enable SAML assertion encryption
- [ ] Require signed SAML assertions
- [ ] Implement request signing
- [ ] Set secure session cookies (HttpOnly, Secure, SameSite)
- [ ] Configure proper CORS policies

**SimpleSAMLphp Hardening**:
```php
// config.php
$config['admin.protectindexpage'] = true;
$config['admin.protectmetadata'] = true;
$config['debug'] = false;
$config['showerrors'] = false;
$config['session.cookie.secure'] = true;
$config['session.cookie.samesite'] = 'None';
$config['session.cookie.httponly'] = true;
```

### USA OIDC (Keycloak)
- [ ] Disable Direct Access Grants in production
- [ ] Enable brute force detection
- [ ] Set short token lifespans (15min access, 8hr refresh)
- [ ] Implement token revocation
- [ ] Enable request object encryption
- [ ] Configure PKCE for all clients
- [ ] Disable implicit flow
- [ ] Use authorization code flow with PKCE only

**Keycloak Hardening**:
```bash
# Disable Direct Access Grants
KC_FEATURES_DISABLED="direct-access-grants"

# Enable brute force protection
/opt/keycloak/bin/kcadm.sh update realms/us-dod -s bruteForceProtected=true
/opt/keycloak/bin/kcadm.sh update realms/us-dod -s failureFactor=5
/opt/keycloak/bin/kcadm.sh update realms/us-dod -s permanentLockout=true
```

## 🗄️ Database Security

### PostgreSQL Hardening
- [ ] Use strong database passwords (32+ characters)
- [ ] Enable SSL/TLS for database connections
- [ ] Restrict database access to localhost/internal network
- [ ] Implement connection pooling with limits
- [ ] Enable query logging for audit trail
- [ ] Regular database backups (encrypted)
- [ ] Implement database encryption at rest
- [ ] Apply security patches promptly

**PostgreSQL Config**:
```bash
# postgresql.conf
ssl = on
ssl_cert_file = '/etc/postgresql/certs/server.crt'
ssl_key_file = '/etc/postgresql/certs/server.key'
listen_addresses = 'localhost'
max_connections = 100
log_statement = 'all'
log_connections = on
log_disconnections = on
```

## 📊 Logging & Monitoring

### Audit Logging
- [ ] Enable comprehensive audit logs
- [ ] Log all authentication attempts (success and failure)
- [ ] Log all administrative actions
- [ ] Log certificate usage and validation
- [ ] Implement centralized log aggregation (ELK, Splunk)
- [ ] Set up log retention (90 days minimum)
- [ ] Implement tamper-proof logging (append-only)
- [ ] Regular log review (weekly)

### Security Monitoring
- [ ] Set up real-time security alerts
- [ ] Monitor for suspicious login patterns
- [ ] Detect brute force attempts
- [ ] Alert on certificate expiration
- [ ] Monitor for configuration changes
- [ ] Implement intrusion detection (IDS/IPS)
- [ ] Track failed authorization attempts

**Audit Log Configuration**:
```yaml
# filebeat.yml for log shipping
filebeat.inputs:
  - type: log
    enabled: true
    paths:
      - /var/log/simplesamlphp/*.log
      - /opt/keycloak/data/log/*.log
    fields:
      type: security-audit
      environment: production
```

## 🔄 Secure Configuration Management

### Environment Variables
- [ ] Never hardcode secrets in code
- [ ] Use environment variables for all sensitive data
- [ ] Encrypt environment files
- [ ] Use secrets management (Vault, AWS Secrets Manager)
- [ ] Rotate secrets regularly (quarterly)
- [ ] Implement secrets scanning in CI/CD

### Docker Security
- [ ] Run containers as non-root user
- [ ] Use minimal base images (alpine where possible)
- [ ] Scan images for vulnerabilities (Trivy, Clair)
- [ ] Enable Docker Content Trust
- [ ] Implement resource limits (CPU, memory)
- [ ] Use read-only filesystems where possible
- [ ] Drop unnecessary capabilities

**Dockerfile Hardening**:
```dockerfile
FROM node:20-alpine AS base
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs
COPY --chown=nodejs:nodejs . .
```

## 🚀 Deployment Security

### CI/CD Pipeline
- [ ] Implement security scanning in pipeline
- [ ] Use signed container images
- [ ] Automated vulnerability scanning
- [ ] Secret scanning (GitGuardian, TruffleHog)
- [ ] Infrastructure as Code (IaC) scanning
- [ ] Dependency vulnerability checking

### Production Deployment
- [ ] Use blue-green or canary deployments
- [ ] Implement rollback capabilities
- [ ] Test in staging before production
- [ ] Require manual approval for production deploys
- [ ] Implement deployment windows
- [ ] Document deployment procedures

## 📋 Compliance & Standards

### Regulatory Compliance
- [ ] GDPR compliance (if handling EU data)
- [ ] HIPAA compliance (if handling health data)
- [ ] SOC 2 compliance
- [ ] ISO 27001 alignment
- [ ] Document compliance mappings

### Security Standards
- [ ] OWASP Top 10 mitigation
- [ ] CIS Benchmarks compliance
- [ ] NIST Cybersecurity Framework alignment
- [ ] NATO ACP-240 compliance

## 🔍 Regular Security Tasks

### Daily
- [ ] Review security alerts
- [ ] Monitor authentication logs
- [ ] Check system resource usage

### Weekly
- [ ] Review failed login attempts
- [ ] Check certificate validity
- [ ] Review audit logs for anomalies

### Monthly
- [ ] Security patch updates
- [ ] Access review
- [ ] Backup restoration test
- [ ] Vulnerability scanning

### Quarterly
- [ ] Secret rotation
- [ ] Security training
- [ ] Penetration testing
- [ ] Disaster recovery drill

### Annually
- [ ] Security audit
- [ ] Policy review and update
- [ ] Incident response plan testing
- [ ] Third-party security assessment

## 🛠️ Automation Scripts

### Security Scan Script
```bash
#!/bin/bash
# security-scan.sh

# Certificate expiration check
./scripts/monitor-certificates.sh

# Docker image vulnerability scan
trivy image venatorfox/simplesamlphp:v2.3.1
trivy image quay.io/keycloak/keycloak:26.0.0

# Configuration security check
docker-bench-security

# Secret scanning
gitleaks detect --source external-idps/

# Dependency vulnerabilities
npm audit --audit-level=high
```

### Hardening Automation
```bash
#!/bin/bash
# apply-hardening.sh

# Apply TLS hardening
./scripts/harden-tls.sh

# Apply database hardening
./scripts/harden-database.sh

# Apply application hardening
./scripts/harden-applications.sh

# Verify hardening
./scripts/verify-hardening.sh
```

## ✅ Pre-Production Checklist

Before going live, verify:

- [ ] All certificates are CA-signed and valid
- [ ] TLS 1.3 enabled with strong ciphers only
- [ ] All admin passwords are strong (16+ characters)
- [ ] MFA enabled for all administrative access
- [ ] Database encrypted at rest and in transit
- [ ] All default accounts disabled
- [ ] Audit logging enabled and centralized
- [ ] Security monitoring and alerting configured
- [ ] Backup and disaster recovery tested
- [ ] Penetration test completed
- [ ] Security runbook documented
- [ ] Incident response plan in place

## 📚 References

- OWASP SAML Security Cheat Sheet
- Keycloak Security Guide
- CIS Docker Benchmark
- NIST SP 800-63B (Digital Identity Guidelines)
- NATO ACP-240 Access Control Policy


