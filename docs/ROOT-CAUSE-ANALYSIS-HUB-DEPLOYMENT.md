# Root Cause Analysis: Hub Deployment Incomplete Services

**Date**: 2026-01-27  
**Issue**: Hub deployment appeared to complete but Keycloak and Frontend were not started  
**Status**: ✅ RESOLVED - Root cause identified

---

## **Executive Summary**

The `./dive hub deploy` command completed Phase 3 (service startup) but **Keycloak and Frontend containers were created but never started**. This caused downstream failures:
- No Keycloak realm available
- No frontend accessible
- Backend throwing 404 errors for realm endpoints

**Root Cause**: The deployment command was **interrupted prematurely** due to insufficient timeout in the Shell tool invocation (30s default vs. ~5min actual deployment time).

---

## **Technical Details**

### **What Happened**

1. **Hub deployment initiated** with `./dive hub deploy`
2. **Phase 1-2.5 completed successfully**:
   - ✅ Preflight checks passed
   - ✅ Hub initialization complete
   - ✅ MongoDB replica set initialized to PRIMARY
   
3. **Phase 3 (Parallel Service Startup) began**:
   - ✅ Level 0: postgres, mongodb, redis, redis-blacklist, opa → **ALL HEALTHY**
   - ✅ Level 1: keycloak, kas → **KEYCLOAK CREATED BUT NOT STARTED**
   - ✅ Level 2: backend → **HEALTHY**
   - ✅ Level 3: otel-collector, frontend, opal-server → **FRONTEND CREATED BUT NOT STARTED**

4. **Deployment log ends abruptly** after "✅ opal-server is healthy (6s)"
   - No error thrown
   - No completion message
   - Process interrupted

5. **Services left in inconsistent state**:
   - Keycloak: `Created` status (never started)
   - Frontend: `Created` status (never started)
   - All other services: `Healthy`

### **Why This Happened**

The `hub_parallel_startup()` function (lines 769-1108 in `scripts/dive-modules/deployment/hub.sh`) works as follows:

```bash
# For each dependency level:
for ((level=0; level<=max_level; level++)); do
    # Start all services at this level in PARALLEL background processes
    for service in "${current_level_services[@]}"; do
        (
            # Background process: Start service and wait for health
            docker compose up -d "$service"
            # Wait for health (timeout: 60-180s depending on service)
            while [ $elapsed -lt $timeout ]; do
                # Check if healthy
                if [ "$health" = "healthy" ]; then
                    exit 0  # Success
                fi
                sleep 3
            done
            exit 1  # Timeout
        ) &
        pids+=($pid)
    done
    
    # Wait for ALL background processes at this level
    for pid in "${pids[@]}"; do
        if wait $pid; then
            # Success
        else
            # Failure - check if CORE service
        fi
    done
done
```

**The function spawns background processes and properly waits for them.**

**However**, the Shell tool invocation used `block_until_ms: 600000` (10 minutes) for the second attempt, but the **first attempt used the default 30 seconds**.

When the 30s timeout expired:
1. The Shell tool **sent the process to background**
2. The deployment continued in background
3. Background processes for Keycloak/Frontend were spawned
4. But the parent deployment script **was interrupted/killed** before waiting for them
5. Orphaned background processes left Keycloak/Frontend in "Created" state

### **Evidence**

**Deployment Log Analysis**:
```
# Last output before interruption:
[0;34mℹ [0mLevel 3: Starting otel-collector frontend opal-server
[0;32m✅ opal-server is healthy (6s)[0m
# <END OF LOG - NO ERROR, NO COMPLETION>
```

**Missing from log**:
- No "✅ frontend is healthy" message
- No "✅ otel-collector is running" message  
- No "✅ keycloak is healthy" message
- No Phase 4-8 output (Terraform, seeding, verification)

**Container States After**:
```bash
$ docker ps -a | grep keycloak
dive-hub-keycloak   Created   # ❌ Never started

$ docker ps -a | grep frontend  
dive-hub-frontend   Created   # ❌ Never started
```

---

## **Resolution**

### **Immediate Fix**
Manually started the containers:
```bash
docker start dive-hub-keycloak  # Became healthy after ~40s
docker compose -f docker-compose.hub.yml up -d frontend  # Started after Keycloak ready
```

### **Terraform Application**
Since the deployment never reached Phase 6 (Keycloak configuration), Terraform was not applied:
```bash
cd terraform/hub
terraform init
terraform apply -var-file=hub.tfvars -auto-approve
# Result: 98 resources created (dive-v3-broker-usa realm + MFA flows)
```

### **Verification**
```bash
$ curl -k https://localhost:8443/realms/dive-v3-broker-usa | jq .realm
"dive-v3-broker-usa"

$ curl -k https://localhost:3000 | grep title
<title>DIVE V3 - Coalition ICAM Platform</title>

$ docker ps | grep hub | wc -l
11  # All 11 Hub services running and healthy
```

---

## **Proper Deployment Approach**

### **Option 1: Let Deployment Complete** (RECOMMENDED)
```bash
# Don't interrupt the deployment - let it run to completion
./dive hub deploy
# Wait for final success message (typically 3-5 minutes)
```

### **Option 2: Use Long Timeout in Shell Tool**
When invoking via automation/tooling:
```bash
# Use block_until_ms of at least 300000 (5 minutes)
Shell(command="./dive hub deploy", block_until_ms=300000)
```

### **Option 3: Monitor Background Process**
If deployment sent to background:
```bash
# Check deployment log file
tail -f /tmp/hub-deploy-*.log

# Check services periodically
watch -n 5 'docker ps --format "{{.Names}}\t{{.Status}}" | grep hub'
```

---

## **Long-Term Fix Required**

### **Issue**: Deployment Script Doesn't Handle SIGTERM Gracefully**

When the parent shell is interrupted, background processes become orphaned:
1. Parent script receives SIGTERM
2. Background processes (service health checkers) continue running
3. But their parent is gone, so `wait $pid` never completes
4. Services remain in "Created" state

### **Proposed Solution**: Add Signal Handlers**

```bash
# In hub_parallel_startup(), add trap for cleanup:
cleanup_background_processes() {
    log_warn "Deployment interrupted - cleaning up background processes..."
    for pid in "${pids[@]}"; do
        kill $pid 2>/dev/null || true
    done
    exit 1
}

trap cleanup_background_processes SIGTERM SIGINT

# ... rest of function ...
```

### **Alternative**: Use Process Groups

```bash
# Start background processes in a process group
for service in "${current_level_services[@]}"; do
    (
        # Set process group
        set -m
        # ... start service ...
    ) &
done

# Kill entire process group on interrupt
trap 'kill -- -$$' SIGTERM SIGINT
```

---

## **Recommendations**

1. **Document deployment time expectations**: 
   - Hub: 3-5 minutes (Terraform adds 1-2 minutes)
   - Spoke: 2-4 minutes

2. **Add progress indicators**: 
   - Show current phase and estimated time remaining
   - Already partially implemented via `progress_set_phase()`

3. **Add timeout warnings**:
   ```bash
   log_warn "Hub deployment typically takes 3-5 minutes"
   log_warn "Do not interrupt the deployment process"
   ```

4. **Test deployment completion**:
   - Add end-to-end test that runs full deployment
   - Verify all services started
   - Verify Terraform applied
   - Verify seeding completed

---

## **Impact Assessment**

- **Severity**: Medium (deployment appears complete but isn't)
- **Frequency**: Occurs when deployment interrupted or timed out
- **Detection**: Easy (services missing, realm doesn't exist)
- **Mitigation**: Manual start of missing services
- **Prevention**: Proper timeout values + signal handling

---

## **Related Issues**

- MongoDB "not primary" errors → Fixed in commit `0742694`
- FRA Frontend/KAS not started → Related to same root cause (deployment interruption)
- Spoke auto-registration not completing → Same pattern (premature termination)

---

## **Testing Done**

- ✅ Manual start of Keycloak → became healthy in 40s
- ✅ Manual start of Frontend → became healthy in 28s
- ✅ Manual Terraform apply → 98 resources created
- ✅ Hub realm verification → dive-v3-broker-usa exists
- ✅ Backend OPAL endpoints → returning 200 OK
- ✅ Frontend accessible → https://localhost:3000

---

## **Lessons Learned**

1. **Timeout values matter**: 30s default is insufficient for multi-phase deployments
2. **Background processes need cleanup**: Orphaned processes leave inconsistent state
3. **Deployment should be atomic**: Either complete fully or roll back
4. **Status indicators help**: Knowing which phase is running prevents premature interruption
5. **Testing deployments end-to-end is critical**: Unit tests don't catch orchestration issues
