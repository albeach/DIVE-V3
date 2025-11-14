# DIVE V3 Certificate Infrastructure

**Purpose:** Three-tier PKI infrastructure for test environments and Policy Signing

## Certificate Hierarchy

```
Root CA (root.crt, root.key)
  └─> Intermediate CA (intermediate.crt, intermediate.key)
      └─> Policy Signer (policy-signer.crt, policy-signer.key)
```

## Files

### Root CA (`ca/`)
- `root.key` - Root CA private key (4096-bit RSA)
- `root.crt` - Root CA certificate (self-signed, 10 years)

### Intermediate CA (`ca/`)
- `intermediate.key` - Intermediate CA private key (4096-bit RSA)
- `intermediate.crt` - Intermediate CA certificate (signed by Root, 5 years)

### Policy Signing Certificate (`signing/`)
- `policy-signer.key` - Policy signer private key (4096-bit RSA)
- `policy-signer.crt` - Policy signer certificate (signed by Intermediate, 1 year)
- `policy-signer.pem` - Same as .crt (alternate format)

### Certificate Chain (`ca/`)
- `chain.pem` - Full chain: Signer → Intermediate → Root

### Certificate Revocation Lists (`crl/`)
- `root-crl.pem` - Root CA CRL
- `intermediate-crl.pem` - Intermediate CA CRL

## Usage

**For Tests:**
```typescript
import { certificateManager } from '../utils/certificate-manager';

await certificateManager.initialize();
const hierarchy = await certificateManager.loadThreeTierHierarchy();
```

**For Manual Signing:**
```bash
openssl dgst -sha384 -sign certs/signing/policy-signer.key policy.json > signature.bin
```

## Regeneration

```bash
cd backend
rm -rf certs
./scripts/generate-test-certs.sh
```

## Security Notes

- **FOR TESTING ONLY** - Do not use in production
- Certificates are self-signed
- Private keys are not password-protected (test convenience)
- Validity periods are fixed (not renewable)

**Generated:** Automated by CI/CD pipeline and local testing
**Algorithm:** RSA-4096 with SHA-384
**Compliance:** ACP-240 three-tier CA best practices
