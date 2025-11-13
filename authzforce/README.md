# AuthzForce CE Server - DIVE V3 Policies Lab

## Overview

AuthzForce CE (Authorization Force Community Edition) is an **optional** XACML 3.0 Policy Decision Point (PDP) used in the DIVE V3 **Policies Lab** feature for educational comparison between OPA (Rego) and XACML policy languages.

**Important**: This is NOT used for production DIVE V3 authorization. All production authorization decisions use **OPA** only.

## Purpose

The Policies Lab allows users to:
- Upload and validate both Rego and XACML policies
- Evaluate policies side-by-side with the same input
- Compare decision outputs, performance, and trace details
- Learn conceptual mappings between XACML and Rego constructs

## Configuration

### Directory Structure

```
authzforce/
├── conf/                          # Configuration files (mounted read-only)
│   ├── context.xml                # Tomcat context configuration
│   ├── logback.xml                # Logging configuration
│   ├── catalog.xml                # XML catalog
│   ├── authzforce-ext.xsd         # Extension schemas
│   ├── *.properties               # JSON/XML mapping configs
│   └── domain.tmpl/               # Domain template (not used directly)
└── data/                          # Runtime data (Docker volume - writable)
    └── domains/                   # Created domains stored here
        └── dive-lab/              # (created via REST API on first use)
```

### Docker Volume Configuration

**Fixed Configuration** (as of Nov 2025):
- `./authzforce/conf` → mounted **read-only** (configuration files)
- `authzforce_data` → mounted **read-write** as **Docker volume** (data persistence)

**Why Docker Volume?**
- AuthzForce requires write access to `/opt/authzforce-ce-server/data` to initialize domains
- Using a Docker volume (not bind mount) avoids permission issues
- Data persists across container restarts

### Health Check

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:8080/authzforce-ce/domains"]
  interval: 15s
  timeout: 10s
  retries: 5
  start_period: 60s  # Java apps take time to start
```

## Startup Sequence

1. **Tomcat starts** (Apache Tomcat 10.1.18 with Java 17)
2. **AuthzForce servlet initializes** using `context.xml`
3. **REST API becomes available** at `/authzforce-ce/domains`
4. **First request creates domain** `dive-lab` dynamically

## Troubleshooting

### Symptom: "Context [/authzforce-ce] startup failed due to previous errors"

**Root Cause**: Missing `context.xml` or incorrect volume mounts

**Fix**:
1. Ensure `authzforce/conf/context.xml` exists (not just `context.xml.sample`)
2. Use Docker volume for data: `authzforce_data:/opt/authzforce-ce-server/data`
3. Check logs: `docker logs dive-v3-authzforce --tail 100`

### Symptom: "Permission denied" errors in logs

**Root Cause**: Bind mount permissions conflict with container user

**Fix**: Use Docker volume instead of bind mount (already fixed in current config)

### Symptom: Health check fails with 404

**Root Cause**: AuthzForce servlet not loaded (context.xml issue)

**Fix**:
1. Verify `context.xml` is valid XML
2. Check volume mounts: `docker inspect dive-v3-authzforce | grep -A10 Mounts`
3. Restart with logs: `docker-compose restart authzforce && docker logs -f dive-v3-authzforce`

## API Usage

### Create Domain (if not exists)

```bash
curl -X POST http://localhost:8282/authzforce-ce/domains \
  -H "Content-Type: application/xml" \
  -d @authzforce/conf/domain.xml
```

### Evaluate XACML Request

```bash
curl -X POST http://localhost:8282/authzforce-ce/domains/dive-lab/pdp \
  -H "Content-Type: application/xml" \
  -d @request.xml
```

## Production Notes

- **Optional Service**: DIVE V3 works perfectly without AuthzForce
- **Not Used in Authorization Flow**: All production authz decisions use OPA
- **Educational Only**: For learning XACML vs Rego comparison
- **Can Be Disabled**: Comment out in `docker-compose.yml` to skip

## References

- [AuthzForce CE Server](https://github.com/authzforce/server)
- [XACML 3.0 Specification](https://docs.oasis-open.org/xacml/3.0/xacml-3.0-core-spec-os-en.html)
- [XACML JSON Profile](https://docs.oasis-open.org/xacml/xacml-json-http/v1.1/xacml-json-http-v1.1.html)

