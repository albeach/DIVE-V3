# GitHub Actions CI/CD

## Workflows

### `ci.yml` - Continuous Integration

**Triggers:**
- Push to `main` or `develop` branches
- Pull requests to `main`

**Jobs:**
1. **OPA Policy Tests**
   - Checks policy syntax
   - Runs unit tests (Week 2+)

2. **Backend Tests**
   - TypeScript type checking
   - Unit tests (Week 2+)

3. **Frontend Tests**
   - TypeScript type checking
   - Linting
   - Build verification

4. **Integration Tests** (main branch only)
   - Starts Docker services
   - Seeds database
   - Tests API endpoints

## Secrets Required

Set these in GitHub repository settings (Settings → Secrets and variables → Actions):

- `AUTH_SECRET` - Generate with: `openssl rand -base64 32`
- `KEYCLOAK_CLIENT_SECRET` - From Terraform output (optional for CI)

## Status Badge

Add to README.md:

```markdown
![CI Status](https://github.com/<username>/DIVE-V3/workflows/DIVE%20V3%20CI%2FCD%20Pipeline/badge.svg)
```

