# DIVE V3 CLI Modules

Version 5.0.0 - Module Consolidation Complete (2026-01-22)

## Overview

The DIVE V3 CLI has been refactored from 91 modules to 30 consolidated modules, achieving a 67% reduction in complexity while maintaining full functionality.

## Module Structure

```
scripts/dive-modules/
├── core/                     # Core functionality (3 modules)
│   ├── common.sh            # Shared utilities and SSOT patterns
│   ├── logging.sh           # Structured JSON logging with request correlation
│   └── cli.sh               # CLI entry point and command dispatch
│
├── orchestration/            # Orchestration layer (6 modules)
│   ├── framework.sh         # Core orchestration, dependencies, health checks
│   ├── state.sh             # PostgreSQL state management, checkpoints
│   ├── locks.sh             # PostgreSQL advisory locks
│   ├── errors.sh            # Error handling, retry logic, auto-recovery
│   ├── circuit-breaker.sh   # Circuit breaker pattern implementation
│   └── metrics.sh           # Prometheus metrics collection
│
├── deployment/               # Deployment operations (6 modules)
│   ├── hub.sh               # Hub deployment, init, management
│   ├── spoke.sh             # Spoke deployment, init, management
│   ├── preflight.sh         # Pre-deployment validation
│   ├── containers.sh        # Docker container orchestration
│   ├── verification.sh      # Post-deployment health checks
│   └── rollback.sh          # Rollback, cleanup, recovery
│
├── configuration/            # Configuration management (4 modules)
│   ├── secrets.sh           # GCP Secret Manager integration
│   ├── terraform.sh         # Keycloak IaC operations
│   ├── certificates.sh      # Certificate generation and rotation
│   └── templates.sh         # Docker Compose/env template generation
│
├── federation/               # Federation management (4 modules)
│   ├── setup.sh             # Federation linking and configuration
│   ├── verification.sh      # Federation verification and SSO testing
│   ├── drift-detection.sh   # 3-layer configuration drift detection
│   └── health.sh            # Heartbeat monitoring and health tracking
│
├── utilities/                # Utility modules (7 modules)
│   ├── testing.sh           # Test framework and assertions
│   ├── troubleshooting.sh   # Diagnostics and troubleshooting
│   ├── policy.sh            # OPA policy bundle management
│   ├── backup.sh            # Database backup/restore
│   ├── help.sh              # CLI help text
│   ├── pilot.sh             # Pilot VM management
│   └── sp.sh                # Service Provider client management
│
└── common.sh                 # Legacy entry point (loads core/common.sh)
```

## CLI Commands

### Hub Management

```bash
./dive hub deploy           # Deploy the Hub from scratch
./dive hub up               # Start Hub containers
./dive hub down             # Stop Hub containers
./dive hub status           # Check Hub status
./dive hub logs             # View Hub logs
./dive hub reset            # Reset Hub to clean state
./dive hub seed             # Seed database with sample data
```

### Spoke Management

```bash
./dive spoke deploy <CODE>  # Deploy a spoke (e.g., ALB, FRA)
./dive spoke up <CODE>      # Start spoke containers
./dive spoke down <CODE>    # Stop spoke containers
./dive spoke status <CODE>  # Check spoke status
./dive spoke verify <CODE>  # Run verification checks
./dive spoke list           # List all configured spokes
```

### Federation

```bash
./dive federation link <CODE>    # Link spoke to hub federation
./dive federation unlink <CODE>  # Remove federation link
./dive federation verify <CODE>  # Verify federation health
./dive federation status         # Show all federation links
./dive federation drift <CODE>   # Check for configuration drift
```

### Orchestration Database

```bash
./dive orch-db status       # Show orchestration database status
./dive orch-db validate     # Validate state machine
./dive orch-db migrate      # Run database migrations
./dive orch-db cleanup      # Clean up stale data
```

### Secrets Management

```bash
./dive secrets ensure <CODE>    # Ensure all secrets exist
./dive secrets rotate <CODE>    # Rotate secrets
./dive secrets verify <CODE>    # Verify secret access
```

### Terraform

```bash
./dive tf init <hub|CODE>      # Initialize Terraform
./dive tf plan <hub|CODE>      # Plan Terraform changes
./dive tf apply <hub|CODE>     # Apply Terraform changes
./dive tf destroy <hub|CODE>   # Destroy Terraform resources
```

### Cleanup

```bash
./dive cleanup hub              # Clean up Hub only
./dive cleanup <CODE>           # Clean up specific spoke
./dive cleanup --all --force    # Clean slate (nuke everything)
./dive nuke                     # Destructive full reset
```

### Policy Management

```bash
./dive policy build         # Build OPA policy bundle
./dive policy push          # Push bundle to OPAL
./dive policy test          # Run policy tests
./dive policy status        # Check policy distribution
```

### Utilities

```bash
./dive help                 # Show help
./dive version              # Show version
./dive pilot up             # Start pilot VM
./dive sp register <CODE>   # Register SP client
```

## State Management

All state is stored in PostgreSQL (Single Source of Truth):

- **deployment_states**: Current deployment state per instance
- **deployment_locks**: Advisory locks for concurrent deployment protection
- **orchestration_checkpoints**: Recovery points for rollback
- **orchestration_errors**: Error tracking and analytics
- **circuit_breakers**: Circuit breaker state per operation
- **orchestration_metrics**: Deployment metrics

## Logging

Structured JSON logging with request correlation:

```bash
# Initialize request context
init_request_context "hub:deploy" "deployment" "hub"

# Log with context
log_info_ctx "Starting deployment" '{"phase":"preflight"}'
log_error_ctx "Deployment failed" '{"errorCode":"TIMEOUT"}'

# Complete operation
log_operation_complete true "Deployment successful"

# View logs
log_tail "ERROR" 100      # Last 100 error logs
log_trace_request "req-xxx"  # Trace specific request
log_stats                 # Log statistics
```

## Metrics

Prometheus metrics are collected and exported:

```bash
# Record metrics
metrics_record_deployment_duration "hub" "hub" "deploy" 540
metrics_record_federation_health "hub" "alb" 1

# Collect all metrics
metrics_collect_all

# View summary
metrics_summary
```

## Circuit Breaker

Operations are protected by circuit breakers:

```bash
# Execute with circuit breaker
orch_circuit_breaker_execute "keycloak_health" "curl http://localhost:8080/health"

# Check status
orch_circuit_breaker_status "keycloak_health"

# Reset if stuck
orch_circuit_breaker_reset "keycloak_health"
```

## Migration from v4.x

### Breaking Changes

1. **Module paths changed**: All modules now live in subdirectories
2. **State management**: File-based state removed, PostgreSQL-only
3. **Locks**: File-based locks removed, PostgreSQL advisory locks only
4. **Secrets**: Hardcoded fallbacks removed, GCP-only

### Deprecation Shims

For backward compatibility, shims exist at the old locations:
- `hub.sh` → `deployment/hub.sh`
- `spoke.sh` → `deployment/spoke.sh`
- `federation.sh` → `federation/setup.sh`
- `secrets.sh` → `configuration/secrets.sh`
- etc.

These shims will be removed in v6.0.0.

### Migration Steps

1. Update any custom scripts to use new paths
2. Ensure PostgreSQL is running for state management
3. Ensure GCP authentication for secrets
4. Run `./dive orch-db migrate` to update schema

## Testing

### Unit Tests

```bash
./tests/unit/run-all.sh
```

### Integration Tests

```bash
./tests/integration/run-all.sh
```

### Chaos Tests

```bash
./tests/chaos/run-all.sh hub      # Run all chaos tests on hub
./tests/chaos/database-failure.sh hub
./tests/chaos/network-partition.sh hub
./tests/chaos/container-crash.sh hub
./tests/chaos/concurrent-deployments.sh
```

## Observability

### Grafana Dashboards

- **Deployment Overview**: `/monitoring/dashboards/deployment-overview.json`
- **Federation Health**: `/monitoring/dashboards/federation-health.json`
- **Orchestration State**: `/monitoring/dashboards/orchestration-state.json`
- **Error Analytics**: `/monitoring/dashboards/error-analytics.json`

### Alerting

Alert rules are configured in:
- `/monitoring/alerting/dive-alerts.yml`

### Logs

- Structured logs: `logs/dive-structured.log`
- Audit logs: `logs/audit.log`
- Prometheus metrics: `logs/metrics/dive_metrics.prom`

## Support

For issues or questions:
1. Check the troubleshooting guide: `./dive help troubleshooting`
2. Run diagnostics: `./dive diagnose`
3. Collect logs: `./dive collect-logs`
