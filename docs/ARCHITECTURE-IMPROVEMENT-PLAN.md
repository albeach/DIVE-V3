# DIVE V3 Architecture Improvement Plan

**Status**: Draft  
**Version**: 1.0  
**Date**: November 25, 2025

---

## Executive Summary

This document outlines critical architectural issues identified in the current DIVE V3 implementation and provides a best-practice remediation plan with SMART objectives and clear success criteria.

---

## Gap Analysis: Current Issues

### Issue 1: Monolithic Compose Stack with Shared Resources

**Current State:**
```
/
├── docker-compose.yml         # USA instance - all services
├── docker-compose.fra.yml     # FRA instance - all services  
├── docker-compose.deu.yml     # DEU instance - all services
├── keycloak/
│   ├── certs/                 # SHARED BY ALL INSTANCES ❌
│   └── themes/                # SHARED BY ALL INSTANCES ❌
├── backend/                   # SHARED SOURCE ❌
└── frontend/                  # SHARED SOURCE ❌
```

**Problems:**
1. **Certificate Contamination**: All instances share `./keycloak/certs`, meaning certificate regeneration affects all instances
2. **Theme Coupling**: All instances mount the same themes directory
3. **No Configuration Isolation**: Instance-specific env vars scattered across multiple files
4. **Build Artifact Contamination**: Despite named volumes, shared source directories can cause issues
5. **Port Management Hell**: Manual port offset management across files

**Impact**: HIGH - Can cause cross-instance interference and deployment failures

---

### Issue 2: Terraform Configuration Conflict

**Current State:**
```
terraform/
├── main.tf              # Configures provider for SINGLE Keycloak
├── usa-realm.tf         # Creates usa realm in SINGLE Keycloak
├── fra-realm.tf         # Creates fra realm in SINGLE Keycloak
├── deu-realm.tf         # Creates deu realm in SINGLE Keycloak
├── usa-broker.tf        # Creates usa IdP broker in broker realm
├── fra-broker.tf        # Creates fra IdP broker in broker realm
│
└── instances/           # COMPLETELY DIFFERENT APPROACH
    ├── usa.tfvars       # For SEPARATE USA Keycloak
    ├── fra.tfvars       # For SEPARATE FRA Keycloak
    ├── instance.tf      # Uses federated-instance module
    └── terraform.tfstate.d/
        └── fra/         # Workspace state
```

**Problems:**
1. **Two Incompatible Architectures**: 
   - Root: Multi-realm in SINGLE Keycloak
   - Instances: Single realm in SEPARATE Keycloaks
2. **Both Cannot Be Applied**: They configure different Keycloak instances
3. **No Clear Migration Path**: Documentation doesn't specify which to use
4. **State Confusion**: Multiple state files with overlapping resources

**Impact**: CRITICAL - Causes configuration drift and deployment failures

---

### Issue 3: Missing Instance Customization Automation

**Current State:**
- Manual hostname configuration in each docker-compose file
- Manual theme assignment requires Terraform apply
- No frontend theming per instance (only Keycloak themes exist)
- Color palette, branding, and instance identity are hardcoded

**Problems:**
1. **Manual Error Prone**: Every new instance requires manual edits
2. **No Frontend Branding**: Frontend doesn't reflect instance identity
3. **Inconsistent UX**: Users don't know which instance they're on

**Impact**: MEDIUM - Affects user experience and operational efficiency

---

## Best Practice Architecture

### Target State: Isolated Instance Architecture

```
/
├── instances/                    # Instance configurations
│   ├── usa/
│   │   ├── docker-compose.yml    # Self-contained USA stack
│   │   ├── .env                  # USA environment variables
│   │   ├── certs/                # USA certificates
│   │   └── config/               # USA-specific configs
│   ├── fra/
│   │   ├── docker-compose.yml    # Self-contained FRA stack
│   │   ├── .env                  # FRA environment variables
│   │   ├── certs/                # FRA certificates
│   │   └── config/               # FRA-specific configs
│   └── deu/
│       └── ...
│
├── templates/                    # Instance generation templates
│   ├── docker-compose.template.yml
│   ├── .env.template
│   ├── terraform.tfvars.template
│   └── theme-config.template.json
│
├── terraform/
│   └── instances/                # ONLY USE THIS APPROACH
│       ├── provider.tf           # Dynamically configured
│       ├── instance.tf           # Module-based
│       └── modules/              # Reusable modules
│
├── keycloak/
│   └── themes/                   # Base themes (read-only)
│
├── backend/                      # Shared source (mounted read-only)
├── frontend/                     # Shared source (mounted read-only)
│
└── scripts/
    ├── create-instance.sh        # Create new instance
    ├── deploy-instance.sh        # Deploy specific instance
    └── customize-instance.sh     # Update instance theming
```

---

## SMART Objectives

### Objective 1: Instance Directory Isolation

**Specific**: Create isolated directory structure for each instance with self-contained Docker Compose, environment variables, and certificates.

**Measurable**: 
- 3 isolated instance directories (USA, FRA, DEU)
- Each directory is deployable independently
- No shared mutable resources between instances

**Achievable**: Migrate existing configurations to new structure.

**Relevant**: Eliminates cross-instance interference.

**Time-bound**: 2 hours

**Success Criteria:**
- [ ] `instances/usa/` fully self-contained
- [ ] `instances/fra/` fully self-contained
- [ ] `instances/deu/` fully self-contained
- [ ] Can deploy any instance without affecting others
- [ ] Can stop/start any instance independently

---

### Objective 2: Terraform Architecture Cleanup

**Specific**: Remove conflicting Terraform configurations and establish single source of truth using the `terraform/instances/` workspace approach.

**Measurable**:
- 0 conflicting Terraform files in root
- 3 Terraform workspaces (usa, fra, deu)
- 100% configuration parity across instances

**Achievable**: Archive legacy files, update modules.

**Relevant**: Eliminates configuration drift.

**Time-bound**: 1 hour

**Success Criteria:**
- [ ] Legacy root .tf files archived to `terraform/archive/`
- [ ] Each workspace has valid state
- [ ] `terraform plan` shows no drift for any instance
- [ ] Applying to one instance doesn't affect others

---

### Objective 3: Automated Instance Customization

**Specific**: Create scripts that automatically customize instance aesthetics (frontend colors, Keycloak theme, hostnames) from a single configuration file.

**Measurable**:
- 1 configuration file per instance
- Automatic theme generation
- Automatic frontend color injection
- Hostname auto-configuration

**Achievable**: Template-based generation with envsubst/jq.

**Relevant**: Enables rapid instance deployment.

**Time-bound**: 2 hours

**Success Criteria:**
- [ ] Instance config file defines all customizations
- [ ] Running `customize-instance.sh USA` applies all theming
- [ ] Frontend shows instance-specific colors
- [ ] Keycloak shows instance-specific branding
- [ ] All hostnames automatically configured

---

### Objective 4: Comprehensive Test Suite

**Specific**: Create test suite that validates isolation, customization, and deployment for all instances.

**Measurable**:
- Isolation tests: 6 assertions
- Customization tests: 8 assertions
- Deployment tests: 5 assertions
- Total: 19+ assertions

**Achievable**: Shell-based tests following existing patterns.

**Relevant**: Ensures architecture improvements are validated.

**Time-bound**: 1 hour

**Success Criteria:**
- [ ] All tests pass
- [ ] Test coverage for each objective
- [ ] Can run full suite in <2 minutes

---

## Implementation Plan

### Phase 1: Instance Directory Structure (Day 1)

1. Create `instances/` directory structure
2. Generate isolated docker-compose files
3. Create per-instance environment files
4. Copy/generate per-instance certificates
5. Test independent deployment

### Phase 2: Terraform Cleanup (Day 1)

1. Archive conflicting root Terraform files
2. Create workspaces for each instance
3. Import existing state
4. Validate configuration parity
5. Document proper usage

### Phase 3: Customization Automation (Day 2)

1. Create instance configuration schema
2. Build template files
3. Create `customize-instance.sh` script
4. Implement frontend theming
5. Test end-to-end customization

### Phase 4: Testing & Documentation (Day 2)

1. Create isolation test suite
2. Create customization test suite
3. Update pilot documentation
4. Commit and push

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Data loss during migration | HIGH | Backup all configs before changes |
| Terraform state corruption | HIGH | Export state before modifications |
| Deployment downtime | MEDIUM | Implement changes in dev first |
| Theme generation errors | LOW | Validate templates before apply |

---

## Appendix: Instance Configuration Schema

```json
{
  "instance_code": "USA",
  "instance_name": "United States",
  "locale": "en",
  "hostnames": {
    "app": "usa-app.dive25.com",
    "api": "usa-api.dive25.com",
    "idp": "usa-idp.dive25.com",
    "kas": "usa-kas.dive25.com"
  },
  "ports": {
    "frontend": 3000,
    "backend": 4000,
    "keycloak_http": 8080,
    "keycloak_https": 8443,
    "mongodb": 27017,
    "redis": 6379,
    "opa": 8181,
    "kas": 8080
  },
  "theme": {
    "primary_color": "#1a365d",
    "secondary_color": "#2b6cb0",
    "accent_color": "#3182ce",
    "background": "usa-background.jpg"
  },
  "federation_partners": ["FRA", "DEU", "GBR", "CAN"]
}
```










