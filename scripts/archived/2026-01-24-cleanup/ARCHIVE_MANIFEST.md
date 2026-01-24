# Script Archive - 2026-01-24 Cleanup

## Purpose
Archive all legacy/deprecated/conflicting scripts that are NOT part of the SSOT pipeline
used by \`./dive deploy hub\` and \`./dive spoke deploy [countrycode]\`.

## SSOT Pipeline (What Remains Active)

### Hub Deployment SSOT
\`\`\`
./dive deploy hub
  ↓
scripts/dive-modules/deployment/hub.sh
  ↓
scripts/dive-modules/hub/seed.sh
  ↓
Backend TypeScript Scripts (SSOT):
  - backend/src/scripts/initialize-coi-keys.ts
  - backend/src/scripts/setup-demo-users.ts
  - backend/src/scripts/seed-instance-resources.ts
\`\`\`

### Spoke Deployment SSOT
\`\`\`
./dive spoke deploy [CODE]
  ↓
scripts/dive-modules/spoke/pipeline/spoke-pipeline.sh
  ↓
Pipeline Phases (All in scripts/dive-modules/spoke/pipeline/):
  - phase-preflight.sh
  - phase-initialization.sh
  - phase-deployment.sh
  - phase-configuration.sh (calls init-nextauth-db.sh, init-keycloak.sh)
  - phase-seeding.sh (calls backend TypeScript SSOT)
  - phase-verification.sh
  ↓
Backend TypeScript Scripts (SSOT):
  - backend/src/scripts/initialize-coi-keys.ts (added in Step 0)
  - backend/src/scripts/setup-demo-users.ts
  - backend/src/scripts/seed-instance-resources.ts
  ↓
Spoke-Specific Scripts (KEPT):
  - scripts/spoke-init/init-nextauth-db.sh (DB schema initialization)
  - scripts/spoke-init/init-keycloak.sh (Keycloak initialization)
\`\`\`

## Archived Scripts

### Hub Scripts (DEPRECATED - Use TypeScript SSOT)

**scripts/hub-init/** → archived/2026-01-24-cleanup/hub-init/
- configure-acr-loa-complete.sh (Terraform handles this now)
- configure-amr.sh (Terraform handles this now)
- configure-hub-client.sh (Terraform handles this now)
- init-hub.sh (deployment/hub.sh handles this now)

**Reason:** Hub now uses:
- Terraform for Keycloak configuration (SSOT)
- TypeScript backend scripts for seeding (SSOT)
- No need for bash configuration scripts

### Spoke Scripts (DEPRECATED - Use TypeScript/Pipeline SSOT)

**scripts/spoke-init/** → archived/2026-01-24-cleanup/spoke-init/
- init-all.sh (pipeline handles orchestration now)
- init-databases.sh (phase-initialization.sh handles this)
- apply-user-profile.sh (Terraform handles this)
- configure-federation-client-scopes.sh (Terraform handles this)
- configure-localized-mappers.sh (Terraform handles this)
- register-spoke-federation.sh (phase-configuration.sh handles this)
- verify-spoke-setup.sh (phase-verification.sh handles this)

**KEPT (Still Used by Pipeline):**
- init-nextauth-db.sh (called by phase-configuration.sh)
- init-keycloak.sh (called by phase-configuration.sh)
- README.md (documentation)
- __tests__/ (test directory)

**Already Archived (2026-01-24):** → archived/legacy-seeding/
- seed-users.sh (TypeScript setup-demo-users.ts is SSOT)
- seed-resources.sh (TypeScript seed-instance-resources.ts is SSOT)
- seed-localized-users.sh (not used)

**Reason:** Spoke pipeline is the SSOT orchestrator. Individual scripts
that duplicate pipeline functionality are no longer needed.

### Terraform (DEPRECATED - Already Archived)

**terraform/archived/2025-12-14-cleanup/unused-modules/**
- Already properly archived
- No additional action needed

## What Remains (SSOT Only)

### Active Scripts
\`\`\`
scripts/
├── dive-modules/           # SSOT CLI modules
│   ├── deployment/         # Hub/spoke deployment
│   ├── spoke/pipeline/     # Spoke pipeline (SSOT)
│   ├── hub/               # Hub modules
│   ├── configuration/      # Shared config
│   └── [other modules]
├── spoke-init/            # Minimal - only what pipeline uses
│   ├── init-nextauth-db.sh (KEPT - used by pipeline)
│   ├── init-keycloak.sh (KEPT - used by pipeline)
│   ├── README.md
│   └── __tests__/
└── archived/              # All deprecated scripts
    ├── legacy-seeding/    # Bash seeding scripts
    └── 2026-01-24-cleanup/ # This cleanup
        ├── hub-init/
        └── spoke-init/
\`\`\`

### Backend TypeScript (SSOT)
\`\`\`
backend/src/scripts/
├── initialize-coi-keys.ts     # COI SSOT (19 COIs)
├── setup-demo-users.ts         # User seeding SSOT
└── seed-instance-resources.ts  # Resource seeding SSOT
\`\`\`

### Terraform (SSOT)
\`\`\`
terraform/modules/
├── federated-instance/  # SSOT for realms/clients/mappers
└── realm-mfa/          # SSOT for auth flows
\`\`\`

## Benefits of Cleanup

1. **No Confusion:** Only SSOT scripts remain active
2. **Clear Path:** Easy to understand what pipeline uses
3. **Maintainable:** Single code path to update
4. **Documented:** This manifest explains what was archived and why

## Rollback (If Needed)

\`\`\`bash
# Restore archived scripts
cp -r scripts/archived/2026-01-24-cleanup/hub-init/* scripts/hub-init/
cp -r scripts/archived/2026-01-24-cleanup/spoke-init/* scripts/spoke-init/
\`\`\`

## Date Archived
2026-01-24

## Archived By
Keycloak 26.5.2 Modernization Project - SSOT Consolidation
