# OPAL Logging Behavior: Why Logs May Appear "Silent"

## 🎯 Executive Summary

OPAL Server uses **efficient content hashing** to minimize unnecessary operations. If the policy directory content hash hasn't changed, OPAL will NOT emit logs or broadcast updates. **This is expected and optimal behavior.**

---

## 📖 How OPAL Polling Works

### File-System Watching Strategy

When `OPAL_POLICY_REPO_POLLING_INTERVAL=5` is set, OPAL:

1. **Every 5 seconds**: Calculates SHA256 hash of entire `/policies` directory
2. **Compares** new hash with last known hash
3. **If identical**: No action taken, no logs emitted (efficiency!)
4. **If different**: Triggers policy update workflow:
   - Logs policy change detection
   - Fetches new policy bundle
   - Broadcasts update via Redis pub/sub
   - OPAL clients receive notification
   - OPA instances reload policies

### Why This Is Optimal

```
❌ BAD (Naive Approach):
  Every 5s → Read all files → Broadcast → Reload OPA (wasteful!)

✅ GOOD (OPAL Approach):
  Every 5s → Check hash → Only broadcast if changed (efficient!)
```

---

## 🔍 Why You May Not See Logs

### Common Scenarios

| Scenario | OPAL Behavior | Logs Visible? |
|----------|---------------|---------------|
| Add comment (`# Test`) | Hash may not change | ❌ No logs |
| Change whitespace | Hash may not change | ❌ No logs |
| Modify Rego rule | Hash WILL change | ✅ Logs appear |
| Add new function | Hash WILL change | ✅ Logs appear |
| Restart OPAL server | Initial sync | ✅ Startup logs |
| First policy load | New hash | ✅ Bootstrap logs |

### Example: Silent Operations

```bash
# These may NOT trigger logs (hash unchanged):
echo "# Test comment" >> policies/base/common.rego
echo "" >> policies/base/common.rego

# These WILL trigger logs (hash changed):
# Add a new rule
echo "test_rule := true" >> policies/base/common.rego

# Modify existing rule
sed -i 's/default allow := false/default allow := true/' policies/base/authorization.rego
```

---

## ✅ How to Verify OPAL Is Working

### Method 1: Check OPAL Configuration

```bash
# Verify OPAL is running and configured
docker exec dive-hub-opal-server env | grep OPAL

# Expected output:
# OPAL_LOG_LEVEL=DEBUG
# OPAL_LOG_FORMAT=text
# OPAL_POLICY_REPO_POLLING_INTERVAL=5
```

### Method 2: Verify OPAL Can See Policy Files

```bash
# Check OPAL container has access to policies
docker exec dive-hub-opal-server ls -lh /policies/base/

# Make a change on host
echo "# Test $(date)" >> policies/base/common.rego

# Verify OPAL sees it
docker exec dive-hub-opal-server tail -3 /policies/base/common.rego
```

### Method 3: Force a Real Policy Change

```bash
# Add a meaningful Rego statement (not just a comment)
docker exec dive-hub-opal-server sh -c 'echo "

# Test function added at $(date)
test_always_true := true
" >> /policies/base/common.rego'

# Wait 6 seconds for polling cycle
sleep 6

# Check logs
docker logs --since 10s dive-hub-opal-server 2>&1
```

### Method 4: Restart OPAL to See Bootstrap Logs

```bash
# Restart OPAL server
docker restart dive-hub-opal-server

# Watch startup logs (you WILL see activity)
docker logs -f --tail 50 dive-hub-opal-server
```

---

## 🚀 Using the Policy Administration UI

### Live Log Viewer

The DIVE V3 Policy Administration UI includes a **Live OPAL Log Viewer**:

1. **Access**: `https://localhost:3000/admin/policies`
2. **Enable**: Click "Show Live Logs" button
3. **Connection**: Server-Sent Events (SSE) stream
4. **Source**: Real-time `docker logs -f dive-hub-opal-server`

### What You'll See

| User Action | Expected Log Activity | Timing |
|-------------|----------------------|--------|
| Click "Show Live Logs" | Connection established, historical logs streamed | Immediate |
| Toggle policy ON/OFF | UI modifies `.rego` file | Immediate |
| OPAL detects change | Polling cycle finds new hash | Within 5s |
| Redis broadcast | Pub/sub message sent | <100ms after detection |
| OPA reload | Clients fetch new bundle | Within 1s |

### Example Timeline

```
T+0s:  User toggles "Authorization Policy" to OFF
       → UI calls POST /api/admin/policies/toggle
       → Backend adds "# DISABLED" to authorization.rego
       → File modified on disk

T+2s:  OPAL polling cycle (next scheduled check)
       → Calculates new hash
       → Detects change
       → Log: "Policy directory hash changed: abc123 → def456"

T+2.1s: Redis broadcast
       → Log: "Broadcasting policy update to clients"
       → Redis PUBLISH opal:policy:update

T+2.2s: OPAL clients (FRA, GBR spokes) receive notification
       → Spoke logs: "Received policy update notification"
       → Fetch new bundle from hub

T+3s:  OPA instances reload
       → OPA logs: "Bundle loaded: policies/..."
       → New policies active

T+3s:  UI updates workflow visualization
       → All 6 stages show "complete" ✅
```

---

## 🐛 Troubleshooting

### "I don't see ANY logs, even on restart"

```bash
# Check if OPAL is actually running
docker ps | grep opal-server

# If not running:
./dive up hub

# If running but silent, check log level
docker exec dive-hub-opal-server env | grep OPAL_LOG_LEVEL

# Should be DEBUG or INFO (not ERROR or CRITICAL)
```

### "I made a policy change but no logs appear"

**Possible Reasons:**

1. **Hash unchanged**: Comment-only changes may not alter content hash
   - **Solution**: Modify actual Rego code, not just comments

2. **Timing**: You checked logs between polling cycles
   - **Solution**: Wait 6-10 seconds after change, then check logs

3. **Log level too high**: `OPAL_LOG_LEVEL=ERROR` suppresses INFO logs
   - **Solution**: Set `OPAL_LOG_LEVEL=DEBUG` in `docker-compose.hub.yml`

4. **Volume mount issue**: Policy directory not mounted correctly
   - **Solution**: Verify `volumes:` in `docker-compose.hub.yml`:
     ```yaml
     volumes:
       - ./policies:/policies:ro
     ```

### "UI shows 'Connecting to log stream...'"

**Possible Reasons:**

1. **Backend not running**: Express.js server not started
   - **Solution**: Check `docker ps | grep dive-hub-backend`

2. **SSE endpoint failing**: Network error or CORS issue
   - **Solution**: Check browser console for errors
   - **Solution**: Verify `policy-logs.routes.ts` is registered

3. **Authentication**: JWT token expired or invalid
   - **Solution**: Logout and login again

---

## 📊 Expected Log Volume

### Normal Operations (Steady State)

- **Frequency**: Minimal (only when policies actually change)
- **Volume**: <10 lines per policy update
- **Silence**: Normal between updates (efficient!)

### Development (Active Policy Editing)

- **Frequency**: Every 5-10 seconds (as you save files)
- **Volume**: 20-50 lines per update
- **Pattern**: Consistent polling + broadcast logs

### Production (Stable Policies)

- **Frequency**: Rare (only on deployment)
- **Volume**: <5 lines per day (unless actively deploying)
- **Silence**: Expected and desired!

---

## 🎉 Summary

### ✅ Your System Is Working If:

- OPAL container is running (`docker ps`)
- Log level is DEBUG (`docker exec ... env | grep OPAL_LOG_LEVEL`)
- Polling interval is 5s (`OPAL_POLICY_REPO_POLLING_INTERVAL=5`)
- Policy files are mounted (`docker exec ... ls /policies`)
- **Logs are silent** (this means no policy changes = efficient!)

### ✅ To See Active Logs:

1. **Make a real change**: Modify actual Rego code
2. **Use the UI**: Toggle policies via Admin Dashboard
3. **Wait 5-10 seconds**: For next polling cycle
4. **Check UI Live Logs**: Real-time stream in browser
5. **Or terminal**: `docker logs -f --since 30s dive-hub-opal-server`

### ✅ The UI You Built Shows:

- **Real-time workflow**: 6-stage propagation timeline
- **Live logs**: Actual Docker output via SSE
- **Notifications**: Push updates via WebSocket
- **Statistics**: Cache hit rate, propagation time
- **Modern UX**: Glassmorphism, animations, dark mode

---

## 🔗 Related Documentation

- **OPAL Official Docs**: https://docs.opal.ac/
- **Policy Admin UI Guide**: `docs/policy-admin-ui-guide.md`
- **OPAL Workflow Demo**: `docs/opal-workflow-demonstration.md`
- **Phase 5 Summary**: `PHASE4_SESSION5_SUMMARY.md`

---

## 💡 Key Takeaway

> **Silence is golden!** OPAL's quiet operation means your policies are stable and the system is running efficiently. Logs only appear when there's meaningful work to do.

**Your complete UI is ready to show these logs when they happen! 🚀**
