# DIVE V3 Keycloak Realm Configuration

## ⚠️ IMPORTANT: Terraform is the SSOT

**Version:** 3.0.0 (December 2025)

As of v3.0.0, **Terraform is the Single Source of Truth (SSOT)** for all Keycloak realm configuration.

### Current Architecture

```
┌─────────────────────────────────────────────────────────┐
│              SSOT: Terraform Modules                    │
│  terraform/modules/federated-instance/  → Realm config │
│  terraform/modules/realm-mfa/           → Auth flows   │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼ terraform apply
┌─────────────────────────────────────────────────────────┐
│              Keycloak Configuration                     │
│  - Realms, clients, protocol mappers                   │
│  - Authentication flows (AAL1/AAL2/AAL3)              │
│  - User profile, federation clients                    │
└─────────────────────────────────────────────────────────┘
```

### Archived JSON Templates

The JSON realm templates in `archived/` are **NO LONGER the primary source of truth**.

They are kept for:
- Historical reference
- Emergency fallback bootstrap (rare edge cases)
- Legacy documentation

**DO NOT MODIFY** the archived JSON templates for production configuration changes.

### How to Configure Keycloak

1. **Edit Terraform modules** in `terraform/modules/federated-instance/` or `terraform/modules/realm-mfa/`
2. **Apply changes** with: `./dive tf apply pilot`
3. **Verify** with: `./dive tf plan pilot` (should show no changes)

### Environment Variables

The `import-realm.sh` script supports:

| Variable | Description | SSOT Behavior |
|----------|-------------|---------------|
| `SKIP_REALM_IMPORT=true` | Skip JSON import entirely | Terraform-only mode |
| `SKIP_REALM_IMPORT=false` (default) | Allow fallback JSON import | Used for quick dev/demo |

### Files in This Directory

```
realms/
├── README.md           # This file
└── archived/           # Legacy JSON templates (DO NOT USE)
    ├── dive-v3-broker.json
    ├── dive-v3-broker-can.json
    ├── dive-v3-broker-deu.json
    ├── dive-v3-broker-fra.json
    ├── dive-v3-broker-gbr.json
    └── ... (other country variants)
```

### Migration Notes

- **v2.0.0** (Nov 2025): Custom SPIs deprecated
- **v2.1.0** (Nov 2025): Custom SPIs temporarily re-enabled
- **v3.0.0** (Dec 2025): SSOT consolidation - Terraform is authoritative

### References

- **SSOT Refactoring:** `docs/KEYCLOAK_REFACTORING_SESSION_PROMPT.md`
- **Terraform Modules:** `terraform/modules/federated-instance/README.md`
- **MFA Flows:** `terraform/modules/realm-mfa/README.md`
