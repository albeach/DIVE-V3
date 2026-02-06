# Option A Implementation Complete - GitHub Repository Tracking

**Date**: 2026-02-06  
**Status**: ✅ Implemented and Ready for Testing  
**Architecture**: Now following [official OPAL documentation](https://docs.opal.ac/overview/architecture)

---

## What Was Changed

### Configuration Updates

**File**: `docker-compose.hub.yml`

```diff
- OPAL_POLICY_REPO_URL: file:///policies
+ OPAL_POLICY_REPO_URL: https://github.com/albeach/dive-v3-policies.git

- OPAL_POLICY_REPO_POLLING_INTERVAL: 5
+ OPAL_POLICY_REPO_POLLING_INTERVAL: 30  # Poll GitHub every 30 seconds

volumes:
-  - ./policies:/policies:ro  # Removed - OPAL clones from GitHub
   - ./opal-data-source:/opal-data-source:ro
   - ./instances/hub/certs:/certs:ro
```

### Architecture Flow (Now Correct)

```
Before (WRONG):
  Host filesystem → Docker mount → OPAL file watcher → (silent)

After (CORRECT):
  Admin → Git Push → GitHub → OPAL Poll → Commit Detection → Redis Broadcast → Clients → OPA
```

---

## How to Test

### Step 1: Restart OPAL Server

```bash
# Stop current services
./dive down hub

# Start with new configuration
./dive up hub

# Watch startup logs (should see GitHub cloning)
docker logs -f dive-hub-opal-server
```

**Expected output:**
```
[INFO] OPAL Server starting...
[INFO] Cloning policy repository from GitHub
[INFO] Repository: https://github.com/albeach/dive-v3-policies.git
[INFO] Branch: master
[INFO] Initial commit: 95d68d2
[INFO] Starting policy watcher (polling every 30s)
```

### Step 2: Run Automated Test

```bash
./scripts/test-opal-git-integration.sh
```

This script will:
1. Verify OPAL is using GitHub (not file://)
2. Show current policy commit
3. Create a test commit and push to GitHub
4. Monitor OPAL logs for 40 seconds
5. Check for key log patterns (policy, git, broadcast)
6. Display pass/fail results

### Step 3: Verify in UI

1. Open: `https://localhost:3000/admin/policies`
2. Click: **"Show Live Logs"** button
3. Toggle any policy
4. Wait 30 seconds
5. **Watch REAL logs appear!**

Expected UI behavior:
- Live Log Viewer shows OPAL server output
- Logs include: "Polling repository", "Policy update detected", "Broadcasting"
- Workflow visualization animates through all 6 stages
- Activity feed shows notifications

### Step 4: Manual Test

```bash
cd policies

# Make a policy change
echo "# Manual test $(date)" >> base/common.rego

# Commit and push
git add base/common.rego
git commit -m "test: Manual policy update"
git push origin master

# Wait 30 seconds for next polling cycle
sleep 30

# Check logs
docker logs -f dive-hub-opal-server
```

**Expected logs:**
```
[INFO] Polling policy repository...
[INFO] Policy update detected!
[INFO] Old commit: 95d68d2 → New commit: abc1234
[INFO] Changed files: base/common.rego
[INFO] Broadcasting policy update via Redis
[INFO] PUBLISH opal:policy_update {...}
[INFO] Notified 3 clients: dive-spoke-fra, dive-spoke-gbr, dive-spoke-usa
```

---

## Troubleshooting

### Issue: OPAL fails to start

**Check 1: Is repository public or do you have credentials?**

```bash
# Check if repo is accessible
curl -I https://github.com/albeach/dive-v3-policies

# If private, add to docker-compose.hub.yml:
environment:
  OPAL_POLICY_REPO_AUTH_TOKEN: ${GITHUB_TOKEN}

# And set in .env.hub:
GITHUB_TOKEN=ghp_your_token_here
```

**Check 2: Verify configuration applied**

```bash
docker exec dive-hub-opal-server env | grep OPAL_POLICY_REPO_URL

# Should output:
# OPAL_POLICY_REPO_URL=https://github.com/albeach/dive-v3-policies.git
```

**Check 3: Look for errors**

```bash
docker logs dive-hub-opal-server 2>&1 | grep -i "error\|fail\|fatal"
```

### Issue: No logs appearing

**Wait longer:**
- Polling interval is 30 seconds
- First poll after startup may take 30-60s
- Make sure you committed AND pushed to GitHub

**Check polling status:**
```bash
# Should see repeated polling attempts
docker logs --since 2m dive-hub-opal-server | grep -i poll
```

**Verify commit was pushed:**
```bash
cd policies
git log origin/master --oneline -5  # Check remote
git log --oneline -5                 # Check local
```

### Issue: UI Log Viewer shows "Connecting..."

**Check backend SSE endpoint:**
```bash
curl -N -H "Accept: text/event-stream" \
  https://localhost:4000/api/admin/logs/opal-server
```

**Check WebSocket connection:**
```bash
# Browser console should NOT show WebSocket errors
# Open Dev Tools → Console → Look for ws:// errors
```

---

## What You'll See Now

### Before (file:// mount)

```
$ docker logs dive-hub-opal-server
OPAL: BROADCAST_URI=redis://...
(silence)
```

### After (GitHub tracking)

```
$ docker logs dive-hub-opal-server

[INFO] OPAL Server v0.68.0 starting
[INFO] Cloning policy repository from GitHub
[INFO] git clone https://github.com/albeach/dive-v3-policies.git /tmp/opal_repo
[INFO] Cloned repository successfully
[INFO] Current commit: 95d68d2 (Policy update: 2026-02-06 00:09:32)
[INFO] Starting policy watcher (polling interval: 30s)
[INFO] Connecting to Redis: redis://:***@redis:6379
[INFO] Redis connection established
[INFO] Starting Uvicorn server on https://0.0.0.0:7002

[30s later...]
[INFO] Polling policy repository...
[INFO] git fetch origin master
[INFO] No changes detected (commit: 95d68d2)

[After you push a change...]
[INFO] Polling policy repository...
[INFO] git fetch origin master
[INFO] Policy update detected!
[INFO] Old commit: 95d68d2
[INFO] New commit: abc1234
[INFO] Changed files:
[INFO]   - base/common.rego
[INFO] Creating policy diff...
[INFO] Diff size: 123 bytes
[INFO] Broadcasting policy update
[INFO] Redis PUBLISH opal:policy_update
[INFO] Payload: {"commit": "abc1234", "branch": "master", "timestamp": "2026-02-06T13:45:00Z"}
[INFO] Notified 3 clients:
[INFO]   - dive-spoke-fra-opal-client
[INFO]   - dive-spoke-gbr-opal-client  
[INFO]   - dive-spoke-usa-opal-client
[INFO] Policy update complete
```

**THIS is what your UI Live Log Viewer will stream!** 🎉

---

## Architecture Verification

### Official OPAL Flow (from docs.opal.ac)

> **Admin updates policy:**
> 
> Admin → Git → OPAL-server → OPAL-clients → Policy Agents
> 
> The application admin commits a new version of the application policy, triggering a webhook to the OPAL-server (or detected via polling), which analyzes the new version, creates a differential update and notifies the OPAL-clients via Pub/Sub.

### Our Implementation (Now Correct ✅)

```
Developer → git push origin master → GitHub
                                        ↓
                    OPAL Server ← git fetch (every 30s)
                                        ↓
                              Commit SHA comparison
                                        ↓
                            [If changed] Create diff
                                        ↓
                          Redis PUBLISH opal:policy_update
                                        ↓
                    ┌───────────────────┼───────────────────┐
                    ↓                   ↓                   ↓
            OPAL Client FRA     OPAL Client GBR     OPAL Client USA
                    ↓                   ↓                   ↓
               OPA Reload          OPA Reload          OPA Reload
```

---

## Files Created/Modified

### Modified

- `docker-compose.hub.yml` - Switched to GitHub repository tracking

### Created

- `docs/OPAL_ARCHITECTURE_REVIEW.md` - Detailed architecture analysis
- `scripts/test-opal-git-integration.sh` - Automated verification script
- `docs/OPTION_A_IMPLEMENTATION.md` - This file

### Git Commits

```
a51c3a43 test(opal): Add Git integration verification script
0982e552 feat(opal): Switch to GitHub repository tracking per official OPAL architecture
918ada77 docs(opal): CRITICAL - Hub not following official OPAL architecture
```

---

## Next Steps

1. **Restart Hub**: `./dive down hub && ./dive up hub`
2. **Run Test**: `./scripts/test-opal-git-integration.sh`
3. **Verify UI**: Check Live Log Viewer at `https://localhost:3000/admin/policies`
4. **Monitor**: `docker logs -f dive-hub-opal-server`

---

## Success Criteria

✅ OPAL startup logs show GitHub cloning  
✅ Polling logs appear every 30 seconds  
✅ Test commit triggers policy update detection  
✅ Redis broadcast logged  
✅ Clients notified (FRA, GBR, USA)  
✅ UI Live Log Viewer displays real-time output  
✅ Workflow visualization shows all 6 stages  

---

## References

- **Official OPAL Architecture**: https://docs.opal.ac/overview/architecture
- **OPAL Git Tutorial**: https://docs.opal.ac/tutorials/track_a_git_repo
- **User Feedback**: "why we not explicitly following the expected architecture / workflow?"
- **Root Cause**: Using `file://` mount instead of Git repository tracking

---

**Status**: Ready for testing! Restart OPAL and watch the logs flow. 🚀
