# GitHub Secrets Configuration Guide

**Purpose:** Configure environment variables for automated deployment  
**Target:** https://github.com/albeach/DIVE-V3/settings/secrets/actions  
**Date:** November 12, 2025

---

## ⚠️ IMPORTANT

These secrets are **REQUIRED** for automated deployment to work. Without them, the deploy-dev-server.yml workflow will fail.

---

## Required Secrets

### 1. ENV_BACKEND
**Description:** Backend environment variables (.env file)  
**Source:** `backend/.env`

### 2. ENV_FRONTEND  
**Description:** Frontend environment variables (.env.local file)  
**Source:** `frontend/.env.local`

### 3. ENV_KAS (Optional)
**Description:** KAS environment variables (.env file)  
**Source:** `kas/.env`

---

## Step-by-Step Instructions

### Step 1: Open GitHub Secrets Page

1. Navigate to: https://github.com/albeach/DIVE-V3
2. Click **Settings** (top menu)
3. Click **Secrets and variables** → **Actions** (left sidebar)
4. You should see "Actions secrets and variables" page

---

### Step 2: Add ENV_BACKEND Secret

1. Click **"New repository secret"** (green button)
2. **Name:** `ENV_BACKEND`
3. **Secret:** Copy entire contents of `backend/.env` file
   
   ```bash
   # On home server or local dev machine:
   cd /home/mike/Desktop/DIVE-V3/DIVE-V3
   cat backend/.env
   # Copy ALL the output
   ```

4. Paste the copied content into the "Secret" field
5. Click **"Add secret"**
6. ✅ You should see "ENV_BACKEND" in the secrets list

**Verification:**
- Secret name shows as `ENV_BACKEND`
- "Updated X seconds ago" timestamp appears
- Secret value is hidden (shows as `***`)

---

### Step 3: Add ENV_FRONTEND Secret

1. Click **"New repository secret"** again
2. **Name:** `ENV_FRONTEND`
3. **Secret:** Copy entire contents of `frontend/.env.local` file
   
   ```bash
   cd /home/mike/Desktop/DIVE-V3/DIVE-V3
   cat frontend/.env.local
   # Copy ALL the output
   ```

4. Paste the copied content into the "Secret" field
5. Click **"Add secret"**
6. ✅ You should see "ENV_FRONTEND" in the secrets list

---

### Step 4: Add ENV_KAS Secret (Optional)

**Note:** Only add this if KAS (Key Access Service) is deployed.

1. Click **"New repository secret"** again
2. **Name:** `ENV_KAS`
3. **Secret:** Copy entire contents of `kas/.env` file
   
   ```bash
   cd /home/mike/Desktop/DIVE-V3/DIVE-V3
   cat kas/.env
   # Copy ALL the output (if file exists)
   ```

4. Paste the copied content into the "Secret" field
5. Click **"Add secret"**
6. ✅ You should see "ENV_KAS" in the secrets list

---

## Verification Checklist

After adding secrets, verify:

- [ ] Navigate to https://github.com/albeach/DIVE-V3/settings/secrets/actions
- [ ] See "ENV_BACKEND" in repository secrets list
- [ ] See "ENV_FRONTEND" in repository secrets list
- [ ] See "ENV_KAS" in repository secrets list (if KAS deployed)
- [ ] Each secret shows "Updated X minutes ago"
- [ ] Values are hidden (show as `***`)

**Total Secrets:** 2 required (ENV_BACKEND, ENV_FRONTEND) + 1 optional (ENV_KAS)

---

## Testing Secrets

### Test 1: View Secrets (Permissions Check)

1. Go to https://github.com/albeach/DIVE-V3/settings/secrets/actions
2. You should see the secrets listed
3. Click on a secret name
4. Should show "Update" button (you have permission)

### Test 2: Manual Deployment Test

1. Go to: https://github.com/albeach/DIVE-V3/actions/workflows/deploy-dev-server.yml
2. Click **"Run workflow"**
3. Select branch: `main`
4. Click **"Run workflow"**
5. Workflow should start (requires self-hosted runner to be online)
6. Check logs for .env file deployment step
7. Should show: "✅ backend/.env deployed (X lines)"

---

## Security Best Practices

### DO:
✅ Keep secrets updated when .env files change  
✅ Rotate secrets every 90 days  
✅ Use strong passwords in .env files  
✅ Verify only authorized users have access  
✅ Audit secret access logs periodically  

### DON'T:
❌ Share secrets in chat or email  
❌ Commit secrets to git  
❌ Log secret values in workflows  
❌ Use production secrets for testing  
❌ Grant unnecessary access to secrets  

---

## Troubleshooting

### Issue 1: "Secret not found" error in workflow

**Symptoms:**
- Workflow fails with "ENV_BACKEND secret not found"

**Solution:**
1. Verify secret name is EXACTLY `ENV_BACKEND` (case-sensitive)
2. Check secret exists: https://github.com/albeach/DIVE-V3/settings/secrets/actions
3. Re-add secret if missing

---

### Issue 2: Deployment fails with "backend/.env missing"

**Symptoms:**
- deploy-dev-server.yml workflow fails
- Log shows "❌ Failed to deploy backend/.env"

**Solution:**
1. Verify ENV_BACKEND secret has content (not empty)
2. Check secret syntax (no extra spaces, correct line breaks)
3. Re-add secret with correct content from `backend/.env`

---

### Issue 3: Services fail to start after deployment

**Symptoms:**
- Health checks fail
- Services can't connect to database
- Missing environment variables

**Solution:**
1. Verify .env files have all required variables
2. Compare deployed .env with local working .env
3. Check for typos in secret values
4. Re-add secrets if needed

---

### Issue 4: Can't access secrets page (403 Forbidden)

**Symptoms:**
- Can't open https://github.com/albeach/DIVE-V3/settings/secrets/actions
- See "You need admin access" message

**Solution:**
1. Verify you have admin access to repository
2. Contact repository owner (@albeach) for access
3. Ensure you're logged into correct GitHub account

---

## Updating Secrets

When .env files change, update secrets:

1. Go to: https://github.com/albeach/DIVE-V3/settings/secrets/actions
2. Click on secret name (e.g., "ENV_BACKEND")
3. Click **"Update secret"**
4. Paste new content from updated .env file
5. Click **"Update secret"**
6. ✅ Secret updated

**Tip:** Add a comment in git commit when updating secrets:
```bash
git commit -m "feat: add new environment variable
  
Note: GitHub secret ENV_BACKEND needs updating"
```

---

## Secret Content Format

### ENV_BACKEND Example (sanitized)
```bash
NODE_ENV=production
PORT=4000
MONGODB_URI=mongodb://localhost:27017/dive_v3
POSTGRES_URI=postgresql://postgres:password@localhost:5432/dive_v3_app
REDIS_HOST=localhost
REDIS_PORT=6379
OPA_URL=http://localhost:8181
KEYCLOAK_URL=https://localhost:8443
KEYCLOAK_REALM=dive-v3-broker
KEYCLOAK_CLIENT_ID=dive-v3-client-broker
KEYCLOAK_CLIENT_SECRET=your-secret-here
JWT_SECRET=your-jwt-secret-here
# ... more variables
```

### ENV_FRONTEND Example (sanitized)
```bash
NEXT_PUBLIC_BACKEND_URL=https://dev-api.dive25.com
NEXTAUTH_URL=https://dev-app.dive25.com
NEXTAUTH_SECRET=your-nextauth-secret-here
AUTH_SECRET=your-auth-secret-here
DATABASE_URL=postgresql://postgres:password@localhost:5432/dive_v3_app
KEYCLOAK_URL=https://dev-auth.dive25.com
KEYCLOAK_REALM=dive-v3-broker
KEYCLOAK_CLIENT_ID=dive-v3-client-broker
KEYCLOAK_CLIENT_SECRET=your-secret-here
# ... more variables
```

---

## Quick Reference Commands

### Copy .env to clipboard (Linux)
```bash
cd /home/mike/Desktop/DIVE-V3/DIVE-V3
xclip -sel clip < backend/.env  # or use cat backend/.env
```

### Count lines in .env (for verification)
```bash
wc -l backend/.env
wc -l frontend/.env.local
wc -l kas/.env
```

### Verify .env files exist
```bash
ls -lh backend/.env frontend/.env.local kas/.env
```

---

## Completion Checklist

Mark complete when:

- [ ] ENV_BACKEND secret added to GitHub
- [ ] ENV_FRONTEND secret added to GitHub
- [ ] ENV_KAS secret added to GitHub (if applicable)
- [ ] All secrets verified in GitHub UI
- [ ] Test deployment triggered successfully
- [ ] .env files deployed correctly to home server
- [ ] Services started with correct environment variables

**Status:** ✅ Week 1 Day 4-5 Complete

---

**Next Step:** Install self-hosted runner (Week 1 Day 6-7)

See: `SELF-HOSTED-RUNNER-SETUP.md` for instructions

