# AuthzForce Startup Issue - Resolution Summary

## Issue Identified

**Date:** November 13, 2025  
**Symptom:** AuthzForce failed to become healthy within 90s timeout  
**Error Message:**
```
SEVERE [main] org.apache.catalina.core.StandardContext.startInternal Context [/authzforce-ce] startup failed due to previous errors
```

## Root Cause Analysis

**Primary Cause:** Malformed XML Schema Definition (XSD) file

**Details:**
- File: `authzforce/conf/authzforce-ext.xsd`
- Issue: Missing closing tag `</xs:schema>`
- XML Parser Error: `"XML document structures must start and end within the same entity"`
- Impact: Spring Boot context initialization failure during AuthzForce servlet startup

## Resolution Applied

### 1. Fixed Malformed XSD File

**File:** `authzforce/conf/authzforce-ext.xsd`

**Fix:** Added missing closing tag:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="http://authzforce.github.io/rest-api-model/xmlns/authzforce/ext" xmlns:tns="http://authzforce.github.io/rest-api-model/xmlns/authzforce/ext" elementFormDefault="qualified" attributeFormDefault="unqualified" version="4.0">
	<xs:annotation>
		<xs:documentation xml:lang="en">
			Schemas of enabled AuthzForce extensions, such as attribute providers.
		</xs:documentation>
	</xs:annotation>
	<!-- Extension for file-based PAP DAO root/ref policy providers -->
	<xs:import namespace="http://authzforce.github.io/pap-dao-flat-file/xmlns/pdp-ext/4" />
</xs:schema>  <!-- ← ADDED THIS CLOSING TAG -->
```

### 2. Updated Docker Compose Configuration

**File:** `docker-compose.yml`

**Changes:**
- Changed `/authzforce/data` from bind mount to Docker volume (`authzforce_data`)
- Prevents permission issues with container writes
- Ensures persistence across container restarts

**Before:**
```yaml
volumes:
  - ./authzforce/data:/opt/authzforce-ce-server/data
```

**After:**
```yaml
volumes:
  - authzforce_data:/opt/authzforce-ce-server/data
```

Added to volumes section:
```yaml
volumes:
  postgres_data:
  mongo_data:
  redis_data:
  authzforce_data:  # ← ADDED
```

### 3. Created Missing Context Configuration

**File:** `authzforce/conf/context.xml`

**Action:** Created from `context.xml.sample` template to provide Tomcat deployment descriptor

### 4. Updated Documentation

**File:** `authzforce/README.md`

**Content:** Comprehensive documentation covering:
- Purpose (optional XACML testing for Policies Lab)
- Directory structure
- Docker volume configuration
- Startup sequence
- Troubleshooting guide
- API usage examples

## Verification

**Health Check Status:** ✅ **HEALTHY**

```bash
$ docker ps --filter name=dive-v3-authzforce
dive-v3-authzforce: Up 2 minutes (healthy)

$ curl http://localhost:8282/authzforce-ce/domains
<?xml version='1.0' encoding='UTF-8'?><ns2:resources .../>
```

**Logs:** No SEVERE errors, clean startup:
```
13-Nov-2025 02:56:07.290 INFO [main] org.apache.catalina.startup.HostConfig.deployDescriptor 
Deployment of deployment descriptor [/usr/local/tomcat/conf/Catalina/localhost/authzforce-ce.xml] 
has finished in [1,439] ms

13-Nov-2025 02:56:07.298 INFO [main] org.apache.catalina.startup.Catalina.start 
Server startup in [1476] milliseconds
```

## Best Practice Recommendations Going Forward

### Option A: Keep AuthzForce (For Policies Lab Feature)

**Use Case:** You want to use the Policies Lab feature for XACML vs Rego comparison

**Status:** ✅ **NOW WORKING** with fixes applied

**Maintenance:**
- Monitor health status: `docker ps | grep authzforce`
- Check logs if issues arise: `docker logs dive-v3-authzforce`
- Backup `authzforce_data` volume for domain persistence

### Option B: Disable AuthzForce (Production Simplification)

**Use Case:** You only need OPA for production authorization (AuthzForce is educational only)

**To Disable:**

1. **Comment out in `docker-compose.yml`:**
```yaml
# authzforce:
#   image: authzforce/server:12.0.1
#   ...
```

2. **Update `scripts/deploy-dev.sh`:**
```bash
# wait_for_service "AuthzForce" "$AUTHZFORCE_TIMEOUT" "dive-v3-authzforce" || log_warn "⚠️  AuthzForce not healthy"
log_info "AuthzForce disabled (Policies Lab XACML feature not needed)"
```

3. **Impact:**
- ✅ Core DIVE V3 functionality unaffected (uses OPA)
- ❌ Policies Lab XACML evaluation unavailable
- ✅ Faster deployment (one less service)
- ✅ Reduced resource usage (~512MB RAM saved)

## Key Learnings

1. **AuthzForce Role:** Optional educational feature, NOT critical to DIVE V3 core
2. **Core Authorization:** DIVE V3 uses **OPA** for all production authorization decisions
3. **Volume Strategy:** Use Docker volumes (not bind mounts) for writable data directories
4. **XML Validation:** Always validate XML config files with proper closing tags
5. **Graceful Degradation:** Deploy script correctly treats AuthzForce as non-critical (warning, not failure)

## Files Modified

1. ✅ `authzforce/conf/authzforce-ext.xsd` - Fixed malformed XML
2. ✅ `docker-compose.yml` - Changed to Docker volume for data persistence
3. ✅ `authzforce/conf/context.xml` - Created from template
4. ✅ `authzforce/README.md` - Comprehensive documentation

## System Architecture Note

```
┌─────────────────────────────────────────────────────────┐
│            DIVE V3 Authorization Stack                   │
├─────────────────────────────────────────────────────────┤
│  PRODUCTION (Critical):                                  │
│  • OPA (Open Policy Agent)                               │
│    - All authorization decisions                         │
│    - Rego policy evaluation                              │
│    - Required for system operation                       │
│                                                          │
│  EDUCATIONAL (Optional):                                 │
│  • AuthzForce CE                                         │
│    - XACML policy comparison only                        │
│    - Policies Lab feature                                │
│    - NOT used in authorization flow                      │
│    - Can be disabled without impact                      │
└─────────────────────────────────────────────────────────┘
```

## Support Commands

```bash
# Check AuthzForce status
docker ps --filter name=dive-v3-authzforce

# View logs
docker logs dive-v3-authzforce --tail 50

# Restart if needed
docker-compose restart authzforce

# Test health endpoint
curl http://localhost:8282/authzforce-ce/domains

# Completely recreate (if configuration changes)
docker-compose down authzforce
docker-compose up -d authzforce
```

## Conclusion

✅ **ISSUE RESOLVED**  
AuthzForce is now running successfully. The Policies Lab feature is fully operational for XACML vs Rego policy comparison.

**System Status:**  
- Core DIVE V3: ✅ Operational (OPA-based authorization)
- Policies Lab: ✅ Operational (AuthzForce XACML engine healthy)

**Recommendation:** Keep AuthzForce enabled if you use the Policies Lab educational feature. Disable it if you only need production OPA-based authorization.

