# DIVE V3 Orchestration Architecture Documentation

**Version:** 2.0 (Post-Phase 2 Refactoring)  
**Date:** 2026-01-25  
**Status:** Production-Ready Modular Architecture

---

## 📐 Architecture Overview

The DIVE V3 orchestration system follows a **modular, fail-fast architecture** with clear separation of concerns. The main `orchestration-framework.sh` acts as an orchestrator that delegates to specialized modules.

### Design Principles

1. **Separation of Concerns** - Each module handles one aspect (state, health, errors, metrics, locks)
2. **Fail-Fast** - Errors propagate immediately with clear severity levels
3. **Observable** - Comprehensive logging, metrics, and tracing
4. **Resilient** - Circuit breakers, retries, and automatic recovery
5. **Testable** - Modules can be tested independently

---

## 🗂️ Module Structure

```
scripts/dive-modules/
├── orchestration-framework.sh (2,968 lines) ← Main orchestrator
│
├── orchestration/  ← Specialized modules (62KB total)
│   ├── circuit-breaker.sh   (10KB, 6 functions)  - Resilience patterns
│   ├── errors.sh            (15KB, 8 functions)  - Error handling
│   ├── framework.sh         (16KB, 9 functions)  - Core orchestration
│   ├── locks.sh             (7KB, 6 functions)   - Lock management
│   └── metrics.sh           (12KB, 7 functions)  - Observability
│
├── orchestration-state-db.sh  (53KB, 1,570 lines) - Database-backed state
├── orchestration-state-recovery.sh (30KB) - State recovery logic
└── error-recovery.sh (shared configuration)
```

---

## 📦 Module Responsibilities

### 1. orchestration-framework.sh (Main Orchestrator)

**Role:** Coordinates deployment workflows, delegates to modules

**Key Functions:**
- `orch_check_service_health()` - Health checking with timeouts
- `orch_wait_for_dependencies()` - Dependency-aware waiting
- `orch_start_service()` - Service startup orchestration
- `orch_detect_circular_dependencies()` - Dependency graph validation
- `orch_calculate_dependency_level()` - Parallel startup planning
- `orch_parallel_startup()` - Execute parallel service startup

**Dependencies:**
- Sources all orchestration/* modules
- Sources orchestration-state-db.sh for state management
- Uses SERVICE_DEPENDENCIES and SERVICE_TIMEOUTS from config

**Service Dependency Graph:**
```
Level 0 (Independent):  postgres, mongodb, redis, opa
Level 1 (DB-dependent): keycloak
Level 2 (App layer):    backend
Level 3 (Frontend):     frontend
Level 4 (Advanced):     kas, opal-client
```

---

### 2. orchestration/circuit-breaker.sh

**Role:** Implement circuit breaker pattern for resilience

**Functions:**
1. `orch_init_circuit_breaker()` - Initialize circuit for operation
2. `orch_is_circuit_open()` - Check if circuit is open (failing)
3. `orch_record_circuit_failure()` - Record failure, maybe open circuit
4. `orch_record_circuit_success()` - Record success, maybe close circuit
5. `orch_execute_with_circuit_breaker()` - Wrap operation with circuit breaker
6. `orch_reset_circuit_breaker()` - Manually reset circuit

**Circuit States:**
- **CLOSED** - Normal operation, failures counted
- **OPEN** - Too many failures, block requests (fail fast)
- **HALF_OPEN** - Testing if service recovered

**Configuration:**
```bash
CIRCUIT_FAILURE_THRESHOLD=3        # Open after 3 failures
CIRCUIT_TIMEOUT_SECONDS=60        # Auto-transition to HALF_OPEN
CIRCUIT_SUCCESS_THRESHOLD=2       # Close after 2 successes
```

**Usage Example:**
```bash
if orch_execute_with_circuit_breaker "keycloak_health" "curl https://keycloak:8443/health"; then
    log_success "Keycloak healthy"
else
    log_error "Keycloak unhealthy (circuit may be open)"
fi
```

---

### 3. orchestration/errors.sh

**Role:** Structured error handling with severity levels and remediation

**Functions:**
1. `orch_record_error()` - Record error with severity and context
2. `orch_should_continue()` - Check if deployment should continue
3. `orch_get_error_count()` - Get error count by severity
4. `orch_clear_errors()` - Clear error counters
5. `orch_generate_error_summary()` - Generate human-readable summary
6. `orch_get_remediation()` - Get remediation steps for error code
7. `orch_escalate_error()` - Escalate error to higher severity
8. `orch_log_error_with_context()` - Log error with full context

**Error Severity Levels:**
```bash
ORCH_SEVERITY_CRITICAL=1   # Stop immediately, no recovery
ORCH_SEVERITY_HIGH=2       # Attempt recovery once, then stop
ORCH_SEVERITY_MEDIUM=3     # Log warning, continue degraded
ORCH_SEVERITY_LOW=4        # Log info, continue normally
```

**Error Taxonomy:**
```bash
# Configuration Errors (1xxx)
ERR_CONFIG_MISSING=1001
ERR_CONFIG_INVALID=1002
ERR_SECRET_UNAVAILABLE=1003

# Network Errors (2xxx)
ERR_NETWORK_TIMEOUT=2001
ERR_NETWORK_UNREACHABLE=2002
ERR_DNS_FAILURE=2003

# Container Errors (3xxx)
ERR_CONTAINER_START_FAILED=3001
ERR_CONTAINER_EXIT=3002
ERR_CONTAINER_OOM=3003

# Health Errors (4xxx)
ERR_HEALTH_CHECK_FAILED=4001
ERR_DEPENDENCY_UNHEALTHY=4002
```

---

### 4. orchestration/framework.sh

**Role:** Core orchestration utilities (not to be confused with main framework)

**Functions:**
1. `orch_validate_instance()` - Validate instance code/configuration
2. `orch_preflight_checks()` - Pre-deployment validation
3. `orch_create_checkpoint()` - Create deployment checkpoint
4. `orch_find_latest_checkpoint()` - Find most recent checkpoint
5. `orch_restore_checkpoint()` - Restore from checkpoint
6. `orch_execute_rollback()` - Execute rollback procedure
7. `orch_cleanup_old_checkpoints()` - Prune old checkpoints
8. `orch_verify_deployment()` - Post-deployment verification
9. `orch_calculate_failure_probability()` - Predictive analytics

**Rollback Strategies:**
- `ROLLBACK_STOP` - Stop services only
- `ROLLBACK_CONFIG` - Restore configuration files
- `ROLLBACK_CONTAINERS` - Recreate containers
- `ROLLBACK_COMPLETE` - Full system rollback

---

### 5. orchestration/locks.sh

**Role:** PostgreSQL-based advisory locks for safe concurrent operations

**Functions:**
1. `orch_acquire_lock()` - Acquire advisory lock
2. `orch_release_lock()` - Release advisory lock
3. `orch_is_locked()` - Check if resource is locked
4. `orch_wait_for_lock()` - Wait for lock with timeout
5. `orch_force_release_lock()` - Force release (emergency only)
6. `orch_list_active_locks()` - List all active locks

**Lock Types:**
```bash
LOCK_DEPLOYMENT="deployment"         # Deployment in progress
LOCK_FEDERATION="federation"         # Federation operation
LOCK_STATE_WRITE="state_write"      # State modification
LOCK_ROLLBACK="rollback"            # Rollback in progress
```

**Usage Example:**
```bash
if orch_acquire_lock "deployment" "spoke-EST" 30; then
    deploy_spoke "EST"
    orch_release_lock "deployment" "spoke-EST"
else
    log_error "Another deployment in progress for EST"
    exit 1
fi
```

---

### 6. orchestration/metrics.sh

**Role:** Performance metrics collection and reporting

**Functions:**
1. `orch_record_metric()` - Record a metric value
2. `orch_get_metric()` - Retrieve metric value
3. `orch_increment_counter()` - Increment counter metric
4. `orch_record_timing()` - Record operation timing
5. `orch_calculate_percentile()` - Calculate P50/P95/P99
6. `orch_export_prometheus()` - Export metrics in Prometheus format
7. `orch_generate_report()` - Generate metrics report

**Metric Types:**
- **Counters** - Monotonically increasing (deployments_total, errors_total)
- **Gauges** - Point-in-time values (services_healthy, cpu_usage)
- **Histograms** - Distribution of values (deployment_duration_seconds)

**Usage Example:**
```bash
start=$(date +%s)
deploy_service "backend"
duration=$(($(date +%s) - start))
orch_record_timing "service_deploy" "$duration" "service=backend"
```

---

### 7. orchestration-state-db.sh (Database Backend)

**Role:** PostgreSQL-backed state management (sole source of truth)

**Key Functions:**
- `orch_db_set_state()` - Set deployment state (SSOT)
- `orch_db_get_state()` - Get current state
- `orch_db_record_step()` - Record deployment step completion
- `orch_db_record_transition()` - Record state transition
- `orch_db_get_history()` - Get state transition history

**Database Schema:**
```sql
-- deployment_states: Current state per instance
CREATE TABLE deployment_states (
    instance_code VARCHAR(3),
    state VARCHAR(20),
    timestamp TIMESTAMPTZ,
    metadata JSONB
);

-- state_transitions: Immutable audit log
CREATE TABLE state_transitions (
    instance_code VARCHAR(3),
    from_state VARCHAR(20),
    to_state VARCHAR(20),
    transition_time TIMESTAMPTZ,
    duration_seconds INTEGER
);

-- deployment_steps: Step-by-step progress
CREATE TABLE deployment_steps (
    instance_code VARCHAR(3),
    step_name VARCHAR(100),
    status VARCHAR(20),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);
```

**State Machine:**
```
UNKNOWN → INITIALIZING → DEPLOYING → CONFIGURING → VERIFYING → COMPLETE
              ↓              ↓            ↓             ↓
           FAILED ← ← ← ← ← ← ← ← ← ← ← ←
              ↓
         ROLLING_BACK → CLEANUP
```

---

## 🚀 Parallel Service Startup

### Dependency-Based Orchestration

The framework includes a dependency graph that enables **intelligent parallel startup**:

**Dependency Graph:**
```bash
SERVICE_DEPENDENCIES=(
    ["postgres"]="none"
    ["mongodb"]="none"
    ["redis"]="none"
    ["keycloak"]="postgres"
    ["backend"]="postgres,mongodb,redis,keycloak"
    ["frontend"]="backend"
    ["opa"]="none"
    ["kas"]="mongodb,backend"
)
```

### Parallel Startup Algorithm

1. **Build dependency levels** using `orch_calculate_dependency_level()`
2. **Start all services at same level in parallel**
3. **Wait for level to be healthy before proceeding**
4. **Repeat for next level**

**Example Execution:**
```
Level 0: postgres, mongodb, redis, opa (start all in parallel)
  → Wait for all Level 0 healthy
Level 1: keycloak (starts after postgres healthy)
  → Wait for keycloak healthy
Level 2: backend (starts after all dependencies healthy)
  → Wait for backend healthy
Level 3: frontend (starts after backend healthy)
  → Wait for frontend healthy
```

**Performance Impact:**
- **Sequential:** postgres (60s) + mongodb (90s) + redis (30s) = 180s just for DBs
- **Parallel:** max(postgres, mongodb, redis) = 90s (50% faster)

---

## 📊 Health Check System

### Multi-Level Health Checking

The `orch_check_service_health()` function implements **3-level health checking**:

**Level 1: Container Exists**
```bash
docker ps --format '{{.Names}}' | grep -q "^${container_name}$"
```

**Level 2: Docker Health Status**
```bash
docker inspect --format='{{.State.Health.Status}}' "$container_name"
# Returns: healthy, unhealthy, starting, or none
```

**Level 3: Service-Specific Health Endpoint** (fallback)
```bash
curl -ksf https://${service}:${port}/health
```

### Health Check Configuration

Health checks use timeouts from `config/deployment-timeouts.env`:

```bash
SERVICE_TIMEOUTS=(
    ["postgres"]=60      # Fast, reliable
    ["mongodb"]=90       # Replica set init
    ["redis"]=30         # Very fast
    ["keycloak"]=180     # Realm import, slow
    ["backend"]=120      # Multiple dependencies
    ["frontend"]=90      # Next.js build
)
```

---

## 🔄 Error Recovery Strategies

### 1. Circuit Breaker Pattern

Prevents cascading failures by **failing fast** when a service is consistently unhealthy.

### 2. Smart Retry Logic

Context-aware backoff strategies from `config/deployment-timeouts.env`:

```bash
# Exponential backoff for transient failures
retry_delay = base_delay * 2^(attempt-1)

# Progressive backoff for Keycloak (slow startup)
retry_delay = base_delay * attempt + (attempt² * 2)

# Fixed + jitter for federation
retry_delay = base_delay + random(0-5)
```

### 3. Automatic Rollback

Triggered when:
- Critical error occurs (`ORCH_SEVERITY_CRITICAL`)
- High error threshold exceeded (3+ `ORCH_SEVERITY_HIGH`)
- Circuit breaker open for 5+ critical operations
- Manual trigger: `./dive rollback <instance> <checkpoint_id>`

---

## 📈 Observability

### Metrics Collection

Metrics are recorded at each deployment phase:

```bash
orch_record_timing "deployment_phase_init" "$duration"
orch_record_timing "deployment_phase_deploy" "$duration"
orch_record_timing "deployment_phase_verify" "$duration"
```

### Structured Logging

All operations use structured logging with context:

```json
{
  "timestamp": "2026-01-25T13:48:40Z",
  "level": "info",
  "module": "orchestration",
  "function": "orch_start_service",
  "instance": "USA",
  "service": "backend",
  "message": "Starting service",
  "context": {
    "dependencies_healthy": true,
    "circuit_breaker_state": "CLOSED"
  }
}
```

### Failure Probability Prediction

The `orch_calculate_failure_probability()` function uses **5 factors** to predict likelihood of deployment failure:

1. Recent error rate (weighted by severity)
2. Circuit breaker health (open circuits = higher risk)
3. Service health degradation
4. Resource exhaustion (memory, disk)
5. Time since last successful deployment

---

## 🧪 Testing Strategy

### Unit Tests

Each module should have unit tests in `tests/unit/orchestration/`:

```bash
tests/unit/orchestration/
├── circuit-breaker.test.sh
├── errors.test.sh
├── locks.test.sh
└── metrics.test.sh
```

### Integration Tests

Full orchestration flows in `tests/integration/`:

- Hub deployment
- Spoke deployment
- Federation linking
- Rollback scenarios

### Smoke Tests

Quick validation in `tests/smoke/`:

- `hub-deploy-smoke.sh` - End-to-end hub deployment (<10 min)

---

## 🎯 Usage Examples

### Example 1: Deploy Hub with Custom Timeouts

```bash
# Override Keycloak timeout for slow startup
TIMEOUT_KEYCLOAK=300 ./dive hub deploy
```

### Example 2: Deploy with Circuit Breaker Monitoring

```bash
# Check circuit breaker states before deployment
./dive circuit-breaker status

# Deploy
./dive hub deploy

# Check for opened circuits
./dive circuit-breaker status | grep OPEN
```

### Example 3: Rollback to Checkpoint

```bash
# List checkpoints
./dive checkpoint list USA

# Rollback to specific checkpoint
./dive rollback USA 20260125_134800_COMPLETE
```

---

## 📚 References

### Internal Documentation
- `MODULE_CONSOLIDATION_ROADMAP.md` - 91→30 module consolidation plan
- `config/deployment-timeouts.env` - Timeout configuration with rationale
- `DEPLOYMENT-OPTIMIZATION-BRIEF.md` - Optimization requirements
- `PORTABILITY-AUDIT-REPORT.md` - Cross-platform compatibility

### External Standards
- [Circuit Breaker Pattern](https://martinfowler.com/bliki/CircuitBreaker.html)
- [Deployment State Machines](https://martinfowler.com/articles/patterns-of-distributed-systems/)
- [Prometheus Metrics Best Practices](https://prometheus.io/docs/practices/naming/)

---

## 🔮 Future Enhancements

### Phase 3 (Planned)
- Real-time deployment dashboard
- Automated performance benchmarking
- Chaos engineering tests
- Predictive failure detection improvements

### Phase 4 (Planned)
- Blue/green deployment support
- Canary deployments
- Zero-downtime updates
- Multi-region orchestration

---

**Document Version:** 2.0  
**Last Updated:** 2026-01-25  
**Maintained By:** DIVE V3 DevOps Team  
**Status:** Production-Ready
