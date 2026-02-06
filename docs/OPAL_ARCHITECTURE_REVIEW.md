# ⚠️ OPAL Architecture Deviation - Critical Issue

**Status**: Architecture not following [official OPAL best practices](https://docs.opal.ac/overview/architecture)  
**Severity**: High - Silent logs, no Git tracking, not production-ready  
**Date Identified**: 2026-02-06

---

## 🚨 Problem Summary

**You are 100% correct!** DIVE V3 Hub is NOT following the official OPAL architecture. We're using filesystem mounts instead of Git repository tracking, which explains why logs are empty.

### Current (Incorrect) Architecture

```
docker-compose.hub.yml:
  OPAL_POLICY_REPO_URL: file:///policies  ❌ WRONG
  volumes:
    - ./policies:/policies:ro             ❌ Direct mount
```

**Result**: OPAL has no Git commits to track, no logs to emit, no proper workflow.

### Expected (Correct) Architecture

From [OPAL Official Docs](https://docs.opal.ac/overview/architecture):

> **Admin updates policy:**  
> Admin → Git → OPAL-server → OPAL-clients → Policy Agents
>
> The application admin commits a new version of the application policy, triggering a webhook to the OPAL-server, which analyzes the new version, creates a differential update and notifies the OPAL-clients via Pub/Sub.

```
docker-compose.pilot.yml:
  OPAL_POLICY_REPO_URL: https://github.com/albeach/dive-v3-policies.git  ✅ CORRECT
```

---

## Why Logs Are Empty

| What OPAL Expects | What We're Doing | Result |
|-------------------|------------------|--------|
| Git fetch every 30s | File system watch | No Git fetch logs |
| Commit SHA comparison | File timestamp check | No commit detection logs |
| Webhook endpoint | N/A | No webhook activity |
| Redis broadcast on commit | Silent file watcher | No broadcast logs |

**OPAL's file:// watcher is a development shortcut, not the production architecture.**

---

## Evidence

### 1. Official OPAL Architecture

From https://docs.opal.ac/overview/architecture:

**Policy Flow Diagram:**
```
Admin → Git Repository → (webhook or polling) → OPAL Server
                                                      ↓
                                            Redis Pub/Sub Broadcast
                                                      ↓
                                              OPAL Clients (FRA, GBR, USA)
                                                      ↓
                                              OPA Instances Reload
```

### 2. Our Current Configuration

```bash
$ docker exec dive-hub-opal-server env | grep POLICY_REPO
OPAL_POLICY_REPO_URL=file:///policies
OPAL_POLICY_REPO_POLLING_INTERVAL=5
```

**Problem**: `file://` protocol bypasses Git entirely.

### 3. policies/ IS a Git Repository

```bash
$ cd policies && git log --oneline -5
95d68d2 Policy update: 2026-02-06 00:09:32
861e4e4 fix(policy): replace dynamic tenant path...
892d26c fix(policy): correct tenant module data path...

$ git remote -v
origin  https://github.com/albeach/dive-v3-policies.git (fetch)
origin  https://github.com/albeach/dive-v3-policies.git (push)
```

**We have a Git repository, but OPAL isn't using it!**

---

## The Fix

### Option 1: Use GitHub Repository (Recommended for Production)

Update `docker-compose.hub.yml`:

```yaml
opal-server:
  environment:
    # Change from file:// to https://
    OPAL_POLICY_REPO_URL: https://github.com/albeach/dive-v3-policies.git
    OPAL_POLICY_REPO_MAIN_BRANCH: master  # or main
    OPAL_POLICY_REPO_POLLING_INTERVAL: 30  # Check every 30s
    
    # For private repository:
    OPAL_POLICY_REPO_AUTH_TOKEN: ${GITHUB_TOKEN}
    
    # Optional: Webhook support (faster than polling)
    OPAL_POLICY_REPO_WEBHOOK_SECRET: ${GITHUB_WEBHOOK_SECRET}
  
  # Remove or keep volume mount for local development
  # volumes:
  #   - ./policies:/policies:ro
```

**Benefits**:
- ✅ OPAL polls GitHub every 30s
- ✅ Detects commit SHA changes
- ✅ Logs show: "Policy update detected: abc123 → def456"
- ✅ Broadcasts to Redis
- ✅ Clients receive notifications
- ✅ Proper OPAL architecture

### Option 2: Hybrid - Auto-Commit Local Changes

Keep file mount but make OPAL Git-aware:

```yaml
opal-server:
  volumes:
    - ./policies:/policies:rw  # Read-write for git operations
  environment:
    OPAL_POLICY_REPO_URL: file:///policies
  entrypoint: >
    sh -c "
      cd /policies &&
      git config --global user.email 'opal@dive-v3.mil' &&
      git config --global user.name 'OPAL Server' &&
      while true; do
        git add -A &&
        git diff --cached --quiet || git commit -m 'Auto-commit: $(date)' &&
        sleep 10
      done &
      exec opal-server run
    "
```

This makes every file change a Git commit, so OPAL can track it.

---

## What Will Change After Fix

### Before (Current - Silent Logs)

```bash
$ docker logs dive-hub-opal-server
OPAL: BROADCAST_URI=redis://...
# Nothing else - no Git activity
```

### After (With Git Integration)

```bash
$ docker logs -f dive-hub-opal-server
[INFO] OPAL Server starting...
[INFO] Polling policy repository: https://github.com/albeach/dive-v3-policies.git
[INFO] Current commit SHA: 95d68d2
[INFO] Checking for updates... (every 30s)
[INFO] Policy update detected!
[INFO] Old SHA: 95d68d2 → New SHA: abc1234
[INFO] Changed files: base/authorization.rego
[INFO] Broadcasting policy update to clients
[INFO] Redis PUBLISH opal:policy_update {"commit": "abc1234", ...}
[INFO] 3 clients notified: fra, gbr, usa
```

**NOW the UI Live Log Viewer will have real logs to display!**

---

## Impact on UI/UX

### Current Behavior (File Mount)

1. User toggles policy in UI
2. Backend modifies file on disk
3. OPAL file watcher *might* detect (silent)
4. No logs generated
5. UI log viewer shows empty stream

### Expected Behavior (Git Integration)

1. User toggles policy in UI
2. Backend modifies file AND commits to Git
3. OPAL polls Git, detects new commit SHA
4. OPAL logs: "Policy update detected"
5. OPAL broadcasts via Redis
6. OPAL logs: "Broadcasting to 3 clients"
7. UI log viewer displays full workflow
8. Workflow visualization shows all 6 stages

---

## Testing the Fix

### Step 1: Update Configuration

```bash
# Edit docker-compose.hub.yml
vim docker-compose.hub.yml

# Change:
OPAL_POLICY_REPO_URL: https://github.com/albeach/dive-v3-policies.git
```

### Step 2: Restart OPAL

```bash
./dive down hub
./dive up hub

# Watch startup logs
docker logs -f dive-hub-opal-server
```

You should see:
```
[INFO] Cloning policy repository from GitHub...
[INFO] Policy repository initialized at commit: 95d68d2
[INFO] Starting polling loop (interval: 30s)
```

### Step 3: Make a Policy Change

```bash
cd policies
echo "# Test $(date)" >> base/common.rego
git add base/common.rego
git commit -m "test: Policy update"
git push origin master
```

### Step 4: Watch OPAL Detect It

```bash
# Wait 30 seconds (polling interval)
docker logs -f dive-hub-opal-server

# Should see:
# [INFO] Detected new commit: 95d68d2 → [new SHA]
# [INFO] Broadcasting policy update...
```

---

## References

1. **OPAL Architecture**: https://docs.opal.ac/overview/architecture
   - See "Policy flows → Admin updates policy"
   - Explicitly shows Git repository in flow diagram

2. **OPAL Git Tracking Tutorial**: https://docs.opal.ac/tutorials/track_a_git_repo
   - Step-by-step guide for GitHub integration
   - Webhook configuration examples

3. **OPAL Configuration**: https://docs.opal.ac/getting-started/running-opal/run-opal-server
   - `OPAL_POLICY_REPO_URL` documentation
   - Polling vs webhook modes

---

## Decision Required

**Question for user**: How should we proceed?

### Option A: Use GitHub (Recommended)
- ✅ Production-ready
- ✅ Proper OPAL architecture
- ✅ Rich logging and observability
- ✅ Webhook support
- ⚠️ Requires GitHub token for private repos

### Option B: Hybrid Auto-Commit
- ✅ Keep local development workflow
- ✅ OPAL sees Git commits
- ✅ Logs will populate
- ⚠️ Auto-commits may clutter history

### Option C: Keep Current (Not Recommended)
- ❌ Not following OPAL architecture
- ❌ Silent logs
- ❌ Not production-ready
- ❌ Limited observability

---

## Conclusion

**You were absolutely right to question this.** The empty logs are a symptom of not following the official OPAL architecture. The fix is straightforward: switch from `file:///policies` to the GitHub repository URL.

**Next Step**: Choose Option A or B above, and I'll implement the fix immediately.
