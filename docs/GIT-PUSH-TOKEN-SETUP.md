# GitHub Personal Access Token (PAT) Setup

**Purpose:** Enable automated git pushes from GitHub Actions workflows  
**Required For:** Modifying `.github/workflows/` files (requires `workflow` scope)  
**Security Level:** 🔴 CRITICAL - Never share this token

---

## 🚨 SECURITY WARNING

**NEVER share your GitHub PAT with anyone, including:**
- ❌ Chat conversations (like Cursor AI)
- ❌ Email or messaging apps
- ❌ Code comments or documentation
- ❌ Git commits
- ❌ Screenshots

**If exposed:** Revoke immediately at https://github.com/settings/tokens

---

## 📋 Creation Steps

### Step 1: Generate Token

1. **Navigate to:** https://github.com/settings/tokens
2. Click **"Generate new token"** → **"Generate new token (classic)"**
3. **Token name:** `DIVE-V3-Workflow-Automation`
4. **Expiration:** 90 days (recommended) or custom
5. **Select scopes:**
   ```
   ✅ repo (Full control of private repositories)
      ✅ repo:status
      ✅ repo_deployment
      ✅ public_repo
      ✅ repo:invite
      ✅ security_events
   
   ✅ workflow (Update GitHub Action workflows)
   
   Optional:
   ☐ write:packages (For Docker registry - not needed now)
   ☐ delete:packages (For package cleanup - not needed now)
   ```

6. Click **"Generate token"**
7. **IMMEDIATELY copy the token** - it starts with `ghp_`
8. **Store it temporarily in a secure location** (password manager, NOT text file)

---

### Step 2: Add Token to GitHub Secrets

1. **Navigate to:** https://github.com/albeach/DIVE-V3/settings/secrets/actions
2. Click **"New repository secret"**
3. **Name (EXACT):** `GIT_PUSH_TOKEN`
4. **Secret:** Paste your PAT (starts with `ghp_`)
5. Click **"Add secret"**

**Verification:**
- [ ] Secret named `GIT_PUSH_TOKEN` appears in list
- [ ] Shows "Updated X seconds ago"
- [ ] Value is hidden (shows as `***`)

---

### Step 3: Configure Git (Local Machine)

**Option A: Use PAT for HTTPS (Recommended)**

```bash
# Configure git to use PAT for HTTPS
cd /home/mike/Desktop/DIVE-V3/DIVE-V3

# Temporarily configure PAT (CAREFUL - this stores it in git config)
git config credential.helper store
git config user.name "Your Name"
git config user.email "your-email@example.com"

# Push once (will prompt for username and password)
# Username: your-github-username
# Password: YOUR_PAT_TOKEN (paste it - will be stored)
git push

# For security, remove stored credential after pushing
git config --unset credential.helper
```

**Option B: One-Time Push with PAT**

```bash
# Use PAT for single push without storing
git push https://YOUR_PAT_TOKEN@github.com/albeach/DIVE-V3.git

# Then restore original remote
git remote set-url origin https://github.com/albeach/DIVE-V3.git
```

**Option C: Use GitHub CLI (Safest)**

```bash
# Install GitHub CLI if not present
# sudo apt install gh

# Authenticate
gh auth login

# Push normally
git push
```

---

## 🔧 Usage in GitHub Actions Workflows

### Example: Auto-Push Workflow

```yaml
name: Auto-Update Workflows

on:
  workflow_dispatch:

jobs:
  update:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout with PAT
        uses: actions/checkout@v4
        with:
          token: ${{ secrets.GIT_PUSH_TOKEN }}  # Use PAT instead of GITHUB_TOKEN
          fetch-depth: 0
      
      - name: Configure Git Bot
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
      
      - name: Make Changes
        run: |
          # Your automation that modifies .github/workflows/
          echo "# Updated $(date)" >> .github/workflows/README.md
      
      - name: Commit and Push
        run: |
          git add .
          git commit -m "chore: automated workflow update" || exit 0
          git push
```

---

## 🔄 Token Renewal (Every 90 Days)

### When to Renew
- **Current Token Created:** November 12, 2025
- **Expiration Date:** February 10, 2026 (90 days)
- **Set Reminder:** February 5, 2026 (5 days before)

### Renewal Process

1. **Generate new PAT** (same scopes as above)
2. **Update GitHub Secret:**
   - Go to: https://github.com/albeach/DIVE-V3/settings/secrets/actions
   - Click on `GIT_PUSH_TOKEN`
   - Click **"Update secret"**
   - Paste new PAT
   - Click **"Update secret"**
3. **Test immediately:**
   ```bash
   # Trigger a workflow that uses GIT_PUSH_TOKEN
   # Or test locally with new PAT
   ```
4. **Update this document:**
   - Update "Current Token Created" date
   - Update "Expiration Date"
   - Commit changes

---

## 🔒 Security Best Practices

### DO:
✅ Store PAT in GitHub Secrets only  
✅ Use bot email for automated commits  
✅ Rotate token every 90 days  
✅ Use minimal required scopes  
✅ Revoke immediately if compromised  
✅ Use password manager for temporary storage  
✅ Audit token usage in GitHub settings  
✅ Set expiration (not "no expiration")  

### DON'T:
❌ Share PAT in chat, email, or messages  
❌ Commit PAT to git repository  
❌ Store PAT in plain text files  
❌ Use PAT with unnecessary scopes  
❌ Share PAT with team members (each person creates own)  
❌ Use personal PAT for production automation  
❌ Set PAT to never expire  
❌ Reuse PAT across multiple projects  

---

## 🔍 Troubleshooting

### Issue 1: "remote rejected" error with workflow files

**Symptoms:**
```
! [remote rejected] main -> main (refusing to allow an OAuth App 
to create or update workflow `.github/workflows/...` without `workflow` scope)
```

**Solution:**
- Verify `GIT_PUSH_TOKEN` secret exists
- Verify PAT has `workflow` scope checked
- Re-generate token with correct scopes if needed

---

### Issue 2: "authentication failed" when pushing

**Symptoms:**
```
remote: Invalid username or password.
fatal: Authentication failed
```

**Solution:**
- PAT may be expired (check https://github.com/settings/tokens)
- PAT may be revoked
- Generate new PAT and update secret

---

### Issue 3: PAT not working in workflow

**Symptoms:**
- Workflow fails with authentication error
- Changes committed but not pushed

**Solution:**
1. Verify secret name is EXACTLY `GIT_PUSH_TOKEN`
2. Check workflow uses `token: ${{ secrets.GIT_PUSH_TOKEN }}`
3. Test PAT manually:
   ```bash
   curl -H "Authorization: token YOUR_PAT" https://api.github.com/user
   ```

---

## 📊 Token Audit

### Current Status
- **Token Name:** DIVE-V3-Workflow-Automation
- **Created:** November 12, 2025
- **Expires:** February 10, 2026
- **Scopes:** `repo`, `workflow`
- **Last Used:** Check at https://github.com/settings/tokens
- **Status:** ✅ Active / ⚠️ Expiring Soon / ❌ Expired

### Usage History
| Date | Action | Workflow | Result |
|------|--------|----------|--------|
| 2025-11-12 | Initial push | Manual | Success |
| TBD | | | |

---

## 🧪 Testing the Token

### Test 1: Manual Git Push
```bash
cd /home/mike/Desktop/DIVE-V3/DIVE-V3

# Test push (will use stored credentials or prompt)
git push

# Expected: Push succeeds without workflow scope error
```

### Test 2: Workflow Test
```bash
# Trigger deploy-dev-server workflow manually
# Go to: https://github.com/albeach/DIVE-V3/actions/workflows/deploy-dev-server.yml
# Click "Run workflow"
# Should succeed without authentication errors
```

### Test 3: API Test
```bash
# Test PAT via GitHub API (replace YOUR_PAT)
curl -H "Authorization: token YOUR_PAT" https://api.github.com/user

# Expected output: Your GitHub user info (JSON)
```

---

## 📝 Revocation Procedure

**If token is compromised or no longer needed:**

1. **Go to:** https://github.com/settings/tokens
2. Find: `DIVE-V3-Workflow-Automation`
3. Click **"Delete"** or **"Revoke"**
4. Confirm deletion
5. **Update GitHub Secret** (if replacing):
   - Generate new PAT
   - Update `GIT_PUSH_TOKEN` secret
6. **Test new token**

---

## 🔗 Related Documentation

- GitHub PAT Documentation: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token
- GitHub Secrets: https://docs.github.com/en/actions/security-guides/encrypted-secrets
- Workflow Scope: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps

---

## ⏰ Renewal Reminders

**Set these calendar reminders:**

- **February 5, 2026** - Generate new PAT (5 days before expiration)
- **February 10, 2026** - Token expires (deadline)

**Renewal Checklist:**
- [ ] Generate new PAT with same scopes
- [ ] Update `GIT_PUSH_TOKEN` secret in GitHub
- [ ] Test with manual push
- [ ] Update dates in this document
- [ ] Set new calendar reminders

---

## 📧 Support

**If you need help:**
1. Check Troubleshooting section above
2. Review GitHub PAT documentation
3. Verify token permissions at https://github.com/settings/tokens
4. Generate new token if issues persist

---

**Document Version:** 1.0  
**Last Updated:** November 12, 2025  
**Next Review:** February 5, 2026

