# GitHub Branch Protection Configuration

**Purpose**: Enforce ACP-240 Section 3.3 Two-Person Policy Review Requirement

**ACP-240 Requirement**:
> "Two‑person review rule and formal V&V before deployment."

---

## Required Branch Protection Rules

### Main Branch Protection

Apply to: `main` branch

**Required Settings**:

1. **Require pull request reviews before merging**
   - [x] Required approving reviews: **2**
   - [x] Dismiss stale pull request approvals when new commits are pushed
   - [x] Require review from Code Owners
   - [x] Require approval of the most recent reviewable push

2. **Require status checks to pass before merging**
   - [x] Require branches to be up to date before merging
   - Required status checks:
     - [x] backend-build
     - [x] backend-unit-tests
     - [x] opa-policy-tests
     - [x] frontend-build
     - [x] security-audit
     - [x] code-quality

3. **Require conversation resolution before merging**
   - [x] All conversations must be resolved

4. **Require signed commits** (Recommended)
   - [x] Require signed commits for added security

5. **Do not allow bypassing the above settings**
   - [x] Include administrators
   - [x] Restrict who can push to matching branches

6. **Restrict force pushes**
   - [x] Do not allow force pushes

7. **Restrict deletions**
   - [x] Do not allow branch deletion

---

## CODEOWNERS Configuration

Create `.github/CODEOWNERS` file:

```
# ACP-240 Two-Person Policy Review Requirement
# All policy changes require approval from security team

# OPA Policies (CRITICAL - requires security team approval)
/policies/**/*.rego @dive-security-team @dive-policy-reviewers

# Backend Authorization (requires backend team approval)
/backend/src/middleware/authz.middleware.ts @dive-backend-team @dive-security-team
/backend/src/services/authz-*.ts @dive-backend-team @dive-security-team

# ZTDF & Cryptography (requires security team approval)
/backend/src/utils/ztdf.utils.ts @dive-security-team @dive-crypto-team
/backend/src/services/coi-key-registry.ts @dive-security-team @dive-crypto-team
/kas/src/**/*.ts @dive-security-team @dive-crypto-team

# Terraform Infrastructure (requires platform team approval)
/terraform/**/*.tf @dive-platform-team @dive-security-team

# CI/CD Pipeline (requires platform team approval)
/.github/workflows/*.yml @dive-platform-team @dive-security-team

# Documentation (requires tech writing approval)
/docs/**/*.md @dive-tech-writers

# Default: All other files require at least one reviewer
* @dive-developers
```

---

## Policy Directory Protection

**Additional Protection for `/policies` directory**:

Create `.github/workflows/policy-review.yml`:

```yaml
name: Policy Review Enforcement

on:
  pull_request:
    paths:
      - 'policies/**/*.rego'

jobs:
  require-policy-review:
    name: Enforce Two-Person Policy Review
    runs-on: ubuntu-latest
    
    steps:
      - name: Check PR Approvals
        uses: actions/github-script@v7
        with:
          script: |
            const { data: reviews } = await github.rest.pulls.listReviews({
              owner: context.repo.owner,
              repo: context.repo.repo,
              pull_number: context.issue.number
            });
            
            const approvals = reviews.filter(r => r.state === 'APPROVED');
            
            if (approvals.length < 2) {
              core.setFailed(`Policy changes require 2 approvals (ACP-240 3.3). Found: ${approvals.length}`);
            } else {
              console.log(`✅ Two-person review satisfied: ${approvals.length} approvals`);
            }
```

---

## Setup Instructions

### Via GitHub Web UI

1. Navigate to: `https://github.com/<org>/DIVE-V3/settings/branches`

2. Click **"Add branch protection rule"**

3. Branch name pattern: `main`

4. Configure settings as listed above

5. Save changes

### Via GitHub API (Automated)

```bash
# Set repository variables
GITHUB_TOKEN="<your-token>"
REPO_OWNER="<org-name>"
REPO_NAME="DIVE-V3"

# Apply branch protection
curl -X PUT \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/repos/$REPO_OWNER/$REPO_NAME/branches/main/protection \
  -d '{
    "required_status_checks": {
      "strict": true,
      "contexts": [
        "backend-build",
        "backend-unit-tests",
        "opa-policy-tests",
        "frontend-build",
        "security-audit"
      ]
    },
    "enforce_admins": true,
    "required_pull_request_reviews": {
      "dismissal_restrictions": {},
      "dismiss_stale_reviews": true,
      "require_code_owner_reviews": true,
      "required_approving_review_count": 2
    },
    "restrictions": null,
    "allow_force_pushes": false,
    "allow_deletions": false,
    "required_conversation_resolution": true
  }'
```

---

## Verification

### Test Branch Protection

1. Create test branch:
   ```bash
   git checkout -b test/policy-change
   ```

2. Modify a policy file:
   ```bash
   echo "# Test change" >> policies/fuel_inventory_abac_policy.rego
   ```

3. Commit and push:
   ```bash
   git add policies/fuel_inventory_abac_policy.rego
   git commit -m "test: verify branch protection"
   git push origin test/policy-change
   ```

4. Create PR via GitHub UI

5. Verify:
   - ❌ Cannot merge without 2 approvals
   - ❌ Cannot merge without passing CI checks
   - ❌ Cannot bypass as administrator

### Expected Behavior

**Without 2 Approvals**:
```
❌ Merging is blocked
   • Required approvals: 0/2
   • Review required from Code Owners
```

**With 2 Approvals + Passing CI**:
```
✅ Ready to merge
   • 2 approvals received
   • All checks passed
   • Conversations resolved
```

---

## Compliance Notes

**ACP-240 Section 3.3 Compliance**:
- ✅ Two-person review enforced via GitHub
- ✅ Formal V&V via CI pipeline (126 OPA tests)
- ✅ Cannot bypass (includes administrators)
- ✅ Audit trail (PR history + approvals)

**Benefits**:
- Prevents unauthorized policy changes
- Ensures peer review of security-critical code
- Maintains audit trail for compliance
- Enforces separation of duties

---

## Team Configuration

### Required GitHub Teams

Create these teams in GitHub organization:

1. **`dive-security-team`**
   - Approves: Policies, ZTDF, cryptography
   - Members: Security engineers, compliance officers

2. **`dive-policy-reviewers`**
   - Approves: OPA Rego policies
   - Members: Policy architects, authorization experts

3. **`dive-backend-team`**
   - Approves: Backend code, APIs
   - Members: Backend developers

4. **`dive-crypto-team`**
   - Approves: Encryption, KAS, key management
   - Members: Cryptography experts

5. **`dive-platform-team`**
   - Approves: Infrastructure, CI/CD, Terraform
   - Members: Platform engineers, DevOps

6. **`dive-tech-writers`**
   - Approves: Documentation
   - Members: Technical writers, architects

7. **`dive-developers`**
   - Default reviewers for all code
   - Members: All development team members

---

## Rollout Plan

### Phase 1: Soft Enforcement (Week 1)
- Enable branch protection with warnings only
- Train team on new process
- Document workflow

### Phase 2: Hard Enforcement (Week 2+)
- Enable blocking branch protection
- Require 2 approvals for policies
- Require CI passing for all merges

### Phase 3: Full Compliance (Ongoing)
- Monitor compliance metrics
- Regular audits of PR approval patterns
- Continuous improvement

---

**ACP-240 Compliance**: ✅ Two-Person Review Enforced  
**Status**: Ready to configure (instructions above)  
**Estimated Setup Time**: 15 minutes

