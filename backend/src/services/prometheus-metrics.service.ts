/**
 * DIVE V3 - Prometheus Metrics Service
 * 
 * Phase 8: Observability & Alerting
 * 
 * Provides comprehensive Prometheus metrics for:
 * - Authorization decisions (latency, decisions by tenant/result)
 * - Cache performance (hit/miss rates)
 * - Federation metrics
 * - Policy evaluation metrics
 * - KAS key operations
 * 
 * Metrics naming convention: dive_v3_{category}_{metric}_{unit}
 * 
 * @version 2.0.0
 * @date 2025-12-03
 */

import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics
} from 'prom-client';
// import client, { Summary } from 'prom-client'; // Unused imports
import { logger } from '../utils/logger';

// ============================================
// TYPES
// ============================================

export interface IAuthorizationMetricLabels {
  tenant: string;
  decision: 'ALLOW' | 'DENY';
  reason?: string;
  cached?: string;
}

export interface ICacheMetricLabels {
  tenant: string;
  cache_type: 'decision' | 'policy' | 'resource';
  hit: string;
}

export interface IFederationMetricLabels {
  source_tenant: string;
  target_tenant: string;
  status: 'success' | 'failure';
}

export interface IKASMetricLabels {
  tenant: string;
  decision: 'ALLOW' | 'DENY';
  resource_classification?: string;
}

// ============================================
// PROMETHEUS METRICS SERVICE
// ============================================

class PrometheusMetricsService {
  private readonly registry: Registry;
  private readonly prefix = 'dive_v3';
  
  // Authorization Metrics
  private authorizationLatency!: Histogram;
  private authorizationDecisions!: Counter;
  private authorizationDecisionsByReason!: Counter;
  private activeAuthorizationRequests!: Gauge;
  
  // Cache Metrics
  private cacheOperations!: Counter;
  private cacheHitRate!: Gauge;
  private cacheSize!: Gauge;
  private cacheEvictions!: Counter;
  
  // Federation Metrics
  private federationLogins!: Counter;
  private federationLatency!: Histogram;
  private federatedSessions!: Gauge;
  
  // Policy Metrics
  private policyEvaluations!: Counter;
  private policyEvaluationLatency!: Histogram;
  private policyVersions!: Gauge;
  
  // KAS Metrics
  private kasKeyOperations!: Counter;
  private kasLatency!: Histogram;

  // Rate Limit Metrics
  private rateLimitHits!: Counter;
  private rateLimitBlocks!: Counter;
  private rateLimitActiveKeys!: Gauge;
  
  // Audit Metrics
  private auditEntriesLogged!: Counter;
  private auditLogLatency!: Histogram;
  
  // Compliance Metrics
  private complianceChecksPassed!: Counter;
  private complianceChecksFailed!: Counter;
  private driftDetections!: Counter;
  
  // Health Metrics
  private serviceHealth!: Gauge;
  private opaHealth!: Gauge;
  private redisHealth!: Gauge;
  private mongoHealth!: Gauge;
  
  // OPAL Policy Distribution Metrics (Phase 2)
  private opalConnectedClients!: Gauge;
  private policyBundleSize!: Gauge;
  private policyBundleSigned!: Gauge;
  private policyVersionCount!: Gauge;
  private policyBundleBuilds!: Counter;
  private policyBundlePublishes!: Counter;
  private policyBundleBuildDuration!: Histogram;
  private spokeSyncStatus!: Gauge;
  private spClientsTotal!: Gauge;
  private spClientsByStatus!: Gauge;
  private opaTestsTotal!: Gauge;
  private opaTestsPassed!: Gauge;
  private opaTestsFailed!: Gauge;
  
  constructor() {
    // Create a custom registry
    this.registry = new Registry();
    
    // Set default labels
    this.registry.setDefaultLabels({
      app: 'dive-v3',
      instance: process.env.INSTANCE_NAME || 'usa',
      region: process.env.REGION || 'americas'
    });
    
    // Collect default Node.js metrics
    collectDefaultMetrics({ register: this.registry, prefix: `${this.prefix}_` });
    
    // Initialize all metrics
    this.initializeAuthorizationMetrics();
    this.initializeCacheMetrics();
    this.initializeFederationMetrics();
    this.initializePolicyMetrics();
    this.initializeKASMetrics();
    this.initializeAuditMetrics();
    this.initializeComplianceMetrics();
    this.initializeHealthMetrics();
    this.initializeOPALMetrics();
    this.initializeRateLimitMetrics();
    
    logger.info('Prometheus metrics service initialized', {
      prefix: this.prefix,
      instance: process.env.INSTANCE_NAME || 'usa'
    });
  }
  
  // ============================================
  // METRIC INITIALIZATION
  // ============================================
  
  private initializeAuthorizationMetrics(): void {
    // Authorization latency histogram (SLA target: p95 < 30ms)
    this.authorizationLatency = new Histogram({
      name: `${this.prefix}_authorization_latency_seconds`,
      help: 'Authorization decision latency in seconds',
      labelNames: ['tenant', 'decision', 'cached'],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [this.registry]
    });
    
    // Authorization decisions counter
    this.authorizationDecisions = new Counter({
      name: `${this.prefix}_authorization_decisions_total`,
      help: 'Total number of authorization decisions',
      labelNames: ['tenant', 'decision'],
      registers: [this.registry]
    });
    
    // Decisions by denial reason
    this.authorizationDecisionsByReason = new Counter({
      name: `${this.prefix}_authorization_denials_by_reason_total`,
      help: 'Authorization denials categorized by reason',
      labelNames: ['tenant', 'reason'],
      registers: [this.registry]
    });
    
    // Active authorization requests gauge
    this.activeAuthorizationRequests = new Gauge({
      name: `${this.prefix}_authorization_active_requests`,
      help: 'Number of currently active authorization requests',
      labelNames: ['tenant'],
      registers: [this.registry]
    });
  }
  
  private initializeCacheMetrics(): void {
    // Cache operations counter
    this.cacheOperations = new Counter({
      name: `${this.prefix}_cache_operations_total`,
      help: 'Total cache operations',
      labelNames: ['tenant', 'cache_type', 'hit'],
      registers: [this.registry]
    });
    
    // Cache hit rate gauge (target: > 80%)
    this.cacheHitRate = new Gauge({
      name: `${this.prefix}_cache_hit_rate`,
      help: 'Cache hit rate as a percentage',
      labelNames: ['tenant', 'cache_type'],
      registers: [this.registry]
    });
    
    // Cache size gauge
    this.cacheSize = new Gauge({
      name: `${this.prefix}_cache_size`,
      help: 'Number of entries in cache',
      labelNames: ['tenant', 'cache_type'],
      registers: [this.registry]
    });
    
    // Cache evictions counter
    this.cacheEvictions = new Counter({
      name: `${this.prefix}_cache_evictions_total`,
      help: 'Total cache evictions',
      labelNames: ['tenant', 'cache_type', 'reason'],
      registers: [this.registry]
    });
  }
  
  private initializeFederationMetrics(): void {
    // Federation logins counter
    this.federationLogins = new Counter({
      name: `${this.prefix}_federation_logins_total`,
      help: 'Total federated logins',
      labelNames: ['source_tenant', 'target_tenant', 'status'],
      registers: [this.registry]
    });
    
    // Federation latency histogram
    this.federationLatency = new Histogram({
      name: `${this.prefix}_federation_latency_seconds`,
      help: 'Federation operation latency in seconds',
      labelNames: ['source_tenant', 'target_tenant', 'operation'],
      buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry]
    });
    
    // Active federated sessions gauge
    this.federatedSessions = new Gauge({
      name: `${this.prefix}_federated_sessions`,
      help: 'Number of active federated sessions',
      labelNames: ['source_tenant', 'target_tenant'],
      registers: [this.registry]
    });
  }
  
  private initializePolicyMetrics(): void {
    // Policy evaluations counter
    this.policyEvaluations = new Counter({
      name: `${this.prefix}_policy_evaluations_total`,
      help: 'Total policy evaluations',
      labelNames: ['tenant', 'policy_name', 'result'],
      registers: [this.registry]
    });
    
    // Policy evaluation latency
    this.policyEvaluationLatency = new Histogram({
      name: `${this.prefix}_policy_evaluation_latency_seconds`,
      help: 'OPA policy evaluation latency in seconds',
      labelNames: ['tenant', 'policy_name'],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5],
      registers: [this.registry]
    });
    
    // Policy version gauge
    this.policyVersions = new Gauge({
      name: `${this.prefix}_policy_version`,
      help: 'Current policy version (encoded as timestamp)',
      labelNames: ['tenant', 'bundle_name'],
      registers: [this.registry]
    });
  }
  
  private initializeKASMetrics(): void {
    // KAS key operations counter
    this.kasKeyOperations = new Counter({
      name: `${this.prefix}_kas_key_releases_total`,
      help: 'Total KAS key release operations',
      labelNames: ['tenant', 'decision', 'resource_classification'],
      registers: [this.registry]
    });
    
    // KAS latency histogram
    this.kasLatency = new Histogram({
      name: `${this.prefix}_kas_request_duration_seconds`,
      help: 'KAS request duration in seconds',
      labelNames: ['tenant', 'operation'],
      buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
      registers: [this.registry]
    });
  }
  
  private initializeAuditMetrics(): void {
    // Audit entries logged counter
    this.auditEntriesLogged = new Counter({
      name: `${this.prefix}_audit_entries_total`,
      help: 'Total audit entries logged',
      labelNames: ['tenant', 'event_type'],
      registers: [this.registry]
    });
    
    // Audit log latency
    this.auditLogLatency = new Histogram({
      name: `${this.prefix}_audit_log_latency_seconds`,
      help: 'Audit logging latency in seconds',
      labelNames: ['tenant'],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1],
      registers: [this.registry]
    });
  }
  
  private initializeComplianceMetrics(): void {
    // Compliance checks counters
    this.complianceChecksPassed = new Counter({
      name: `${this.prefix}_compliance_checks_passed_total`,
      help: 'Total compliance checks passed',
      labelNames: ['tenant', 'check_type'],
      registers: [this.registry]
    });
    
    this.complianceChecksFailed = new Counter({
      name: `${this.prefix}_compliance_checks_failed_total`,
      help: 'Total compliance checks failed',
      labelNames: ['tenant', 'check_type', 'reason'],
      registers: [this.registry]
    });
    
    // Drift detections counter
    this.driftDetections = new Counter({
      name: `${this.prefix}_drift_detections_total`,
      help: 'Total policy drift detections',
      labelNames: ['tenant', 'severity'],
      registers: [this.registry]
    });
  }
  
  private initializeHealthMetrics(): void {
    // Service health gauge (1 = healthy, 0 = unhealthy)
    this.serviceHealth = new Gauge({
      name: `${this.prefix}_service_health`,
      help: 'Service health status (1=healthy, 0=unhealthy)',
      labelNames: ['service'],
      registers: [this.registry]
    });
    
    // OPA health gauge
    this.opaHealth = new Gauge({
      name: `${this.prefix}_opa_health`,
      help: 'OPA service health status',
      labelNames: ['instance'],
      registers: [this.registry]
    });
    
    // Redis health gauge
    this.redisHealth = new Gauge({
      name: `${this.prefix}_redis_health`,
      help: 'Redis service health status',
      labelNames: ['cluster'],
      registers: [this.registry]
    });
    
    // MongoDB health gauge
    this.mongoHealth = new Gauge({
      name: `${this.prefix}_mongodb_health`,
      help: 'MongoDB service health status',
      labelNames: ['replica_set'],
      registers: [this.registry]
    });
  }
  
  private initializeOPALMetrics(): void {
    // OPAL connected clients gauge
    this.opalConnectedClients = new Gauge({
      name: `${this.prefix}_opal_connected_clients`,
      help: 'Number of connected OPAL clients',
      registers: [this.registry]
    });
    
    // Policy bundle size gauge
    this.policyBundleSize = new Gauge({
      name: `${this.prefix}_policy_bundle_size_bytes`,
      help: 'Current policy bundle size in bytes',
      registers: [this.registry]
    });
    
    // Policy bundle signed gauge
    this.policyBundleSigned = new Gauge({
      name: `${this.prefix}_policy_bundle_signed`,
      help: 'Whether current bundle is signed (1=signed, 0=unsigned)',
      registers: [this.registry]
    });
    
    // Policy version count in MongoDB
    this.policyVersionCount = new Gauge({
      name: `${this.prefix}_policy_version_count`,
      help: 'Number of policy versions stored in MongoDB',
      registers: [this.registry]
    });
    
    // Policy bundle builds counter
    this.policyBundleBuilds = new Counter({
      name: `${this.prefix}_policy_bundle_builds_total`,
      help: 'Total policy bundle builds',
      labelNames: ['signed'],
      registers: [this.registry]
    });
    
    // Policy bundle publishes counter
    this.policyBundlePublishes = new Counter({
      name: `${this.prefix}_policy_bundle_publishes_total`,
      help: 'Total policy bundle publishes to OPAL',
      registers: [this.registry]
    });
    
    // Policy bundle build duration histogram
    this.policyBundleBuildDuration = new Histogram({
      name: `${this.prefix}_policy_bundle_build_duration_seconds`,
      help: 'Policy bundle build duration in seconds',
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [this.registry]
    });
    
    // Spoke sync status gauge
    this.spokeSyncStatus = new Gauge({
      name: `${this.prefix}_spoke_sync_status`,
      help: 'Spoke policy sync status (by status type)',
      labelNames: ['status'],
      registers: [this.registry]
    });
    
    // SP clients total gauge
    this.spClientsTotal = new Gauge({
      name: `${this.prefix}_sp_clients_total`,
      help: 'Total number of registered SP clients',
      registers: [this.registry]
    });
    
    // SP clients by status gauge
    this.spClientsByStatus = new Gauge({
      name: `${this.prefix}_sp_clients_by_status`,
      help: 'SP clients by status',
      labelNames: ['status'],
      registers: [this.registry]
    });
    
    // OPA tests total gauge
    this.opaTestsTotal = new Gauge({
      name: `${this.prefix}_opa_test_total`,
      help: 'Total number of OPA policy tests',
      registers: [this.registry]
    });
    
    // OPA tests passed gauge
    this.opaTestsPassed = new Gauge({
      name: `${this.prefix}_opa_test_passed`,
      help: 'Number of OPA policy tests passed',
      registers: [this.registry]
    });
    
    // OPA tests failed gauge
    this.opaTestsFailed = new Gauge({
      name: `${this.prefix}_opa_test_failed`,
      help: 'Number of OPA policy tests failed',
      registers: [this.registry]
    });
  }

  private initializeRateLimitMetrics(): void {
    // Rate limit hits counter
    this.rateLimitHits = new Counter({
      name: `${this.prefix}_rate_limit_hits_total`,
      help: 'Total rate limit hits (successful requests within limits)',
      labelNames: ['limiter_type'],
      registers: [this.registry]
    });

    // Rate limit blocks counter
    this.rateLimitBlocks = new Counter({
      name: `${this.prefix}_rate_limit_blocks_total`,
      help: 'Total rate limit blocks (requests exceeding limits)',
      labelNames: ['limiter_type'],
      registers: [this.registry]
    });

    // Active rate limit keys gauge
    this.rateLimitActiveKeys = new Gauge({
      name: `${this.prefix}_rate_limit_active_keys`,
      help: 'Number of active rate limit keys being tracked',
      labelNames: ['limiter_type'],
      registers: [this.registry]
    });
  }
  
  // ============================================
  // AUTHORIZATION METRIC METHODS
  // ============================================
  
  /**
   * Record an authorization decision
   */
  recordAuthorizationDecision(params: {
    tenant: string;
    decision: 'ALLOW' | 'DENY';
    latencyMs: number;
    cached: boolean;
    reason?: string;
  }): void {
    const { tenant, decision, latencyMs, cached, reason } = params;
    const latencySeconds = latencyMs / 1000;
    
    // Record latency
    this.authorizationLatency.observe(
      { tenant, decision, cached: String(cached) },
      latencySeconds
    );
    
    // Increment decision counter
    this.authorizationDecisions.inc({ tenant, decision });
    
    // Record denial reason if applicable
    if (decision === 'DENY' && reason) {
      this.authorizationDecisionsByReason.inc({
        tenant,
        reason: this.normalizeDenialReason(reason)
      });
    }
  }
  
  /**
   * Track active authorization requests
   */
  incrementActiveRequests(tenant: string): void {
    this.activeAuthorizationRequests.inc({ tenant });
  }
  
  decrementActiveRequests(tenant: string): void {
    this.activeAuthorizationRequests.dec({ tenant });
  }
  
  /**
   * Normalize denial reasons for consistent labeling
   */
  private normalizeDenialReason(reason: string): string {
    if (reason.includes('clearance')) return 'insufficient_clearance';
    if (reason.includes('releasability') || reason.includes('country')) return 'releasability_violation';
    if (reason.includes('COI')) return 'coi_violation';
    if (reason.includes('embargo')) return 'embargo_violation';
    if (reason.includes('authentication')) return 'not_authenticated';
    if (reason.includes('MFA') || reason.includes('AAL')) return 'mfa_required';
    return 'other';
  }
  
  // ============================================
  // CACHE METRIC METHODS
  // ============================================
  
  /**
   * Record a cache operation
   */
  recordCacheOperation(params: {
    tenant: string;
    cacheType: 'decision' | 'policy' | 'resource';
    hit: boolean;
  }): void {
    const { tenant, cacheType, hit } = params;
    
    this.cacheOperations.inc({
      tenant,
      cache_type: cacheType,
      hit: String(hit)
    });
  }
  
  /**
   * Update cache hit rate
   */
  updateCacheHitRate(params: {
    tenant: string;
    cacheType: 'decision' | 'policy' | 'resource';
    hitRate: number;
  }): void {
    const { tenant, cacheType, hitRate } = params;
    
    this.cacheHitRate.set(
      { tenant, cache_type: cacheType },
      hitRate
    );
  }
  
  /**
   * Update cache size
   */
  updateCacheSize(params: {
    tenant: string;
    cacheType: 'decision' | 'policy' | 'resource';
    size: number;
  }): void {
    this.cacheSize.set(
      { tenant: params.tenant, cache_type: params.cacheType },
      params.size
    );
  }
  
  /**
   * Record cache eviction
   */
  recordCacheEviction(params: {
    tenant: string;
    cacheType: 'decision' | 'policy' | 'resource';
    reason: 'ttl' | 'lru' | 'manual' | 'policy_update';
  }): void {
    this.cacheEvictions.inc({
      tenant: params.tenant,
      cache_type: params.cacheType,
      reason: params.reason
    });
  }
  
  // ============================================
  // FEDERATION METRIC METHODS
  // ============================================
  
  /**
   * Record a federation login
   */
  recordFederationLogin(params: {
    sourceTenant: string;
    targetTenant: string;
    success: boolean;
    latencyMs?: number;
  }): void {
    const { sourceTenant, targetTenant, success, latencyMs } = params;
    
    this.federationLogins.inc({
      source_tenant: sourceTenant,
      target_tenant: targetTenant,
      status: success ? 'success' : 'failure'
    });
    
    if (latencyMs !== undefined) {
      this.federationLatency.observe(
        { source_tenant: sourceTenant, target_tenant: targetTenant, operation: 'login' },
        latencyMs / 1000
      );
    }
  }
  
  /**
   * Update federated session count
   */
  updateFederatedSessions(params: {
    sourceTenant: string;
    targetTenant: string;
    count: number;
  }): void {
    this.federatedSessions.set(
      { source_tenant: params.sourceTenant, target_tenant: params.targetTenant },
      params.count
    );
  }
  
  // ============================================
  // POLICY METRIC METHODS
  // ============================================
  
  /**
   * Record a policy evaluation
   */
  recordPolicyEvaluation(params: {
    tenant: string;
    policyName: string;
    result: 'allow' | 'deny' | 'error';
    latencyMs: number;
  }): void {
    const { tenant, policyName, result, latencyMs } = params;
    
    this.policyEvaluations.inc({
      tenant,
      policy_name: policyName,
      result
    });
    
    this.policyEvaluationLatency.observe(
      { tenant, policy_name: policyName },
      latencyMs / 1000
    );
  }
  
  /**
   * Update policy version metric
   */
  updatePolicyVersion(params: {
    tenant: string;
    bundleName: string;
    versionTimestamp: number;
  }): void {
    this.policyVersions.set(
      { tenant: params.tenant, bundle_name: params.bundleName },
      params.versionTimestamp
    );
  }
  
  // ============================================
  // KAS METRIC METHODS
  // ============================================
  
  /**
   * Record a KAS key operation
   */
  recordKASOperation(params: {
    tenant: string;
    decision: 'ALLOW' | 'DENY';
    resourceClassification: string;
    latencyMs: number;
  }): void {
    const { tenant, decision, resourceClassification, latencyMs } = params;
    
    this.kasKeyOperations.inc({
      tenant,
      decision,
      resource_classification: resourceClassification
    });
    
    this.kasLatency.observe(
      { tenant, operation: 'key_release' },
      latencyMs / 1000
    );
  }
  
  // ============================================
  // AUDIT METRIC METHODS
  // ============================================
  
  /**
   * Record an audit entry
   */
  recordAuditEntry(params: {
    tenant: string;
    eventType: string;
    latencyMs?: number;
  }): void {
    this.auditEntriesLogged.inc({
      tenant: params.tenant,
      event_type: params.eventType
    });
    
    if (params.latencyMs !== undefined) {
      this.auditLogLatency.observe(
        { tenant: params.tenant },
        params.latencyMs / 1000
      );
    }
  }
  
  // ============================================
  // COMPLIANCE METRIC METHODS
  // ============================================
  
  /**
   * Record a compliance check result
   */
  recordComplianceCheck(params: {
    tenant: string;
    checkType: string;
    passed: boolean;
    reason?: string;
  }): void {
    if (params.passed) {
      this.complianceChecksPassed.inc({
        tenant: params.tenant,
        check_type: params.checkType
      });
    } else {
      this.complianceChecksFailed.inc({
        tenant: params.tenant,
        check_type: params.checkType,
        reason: params.reason || 'unknown'
      });
    }
  }
  
  /**
   * Record a drift detection
   */
  recordDriftDetection(params: {
    tenant: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
  }): void {
    this.driftDetections.inc({
      tenant: params.tenant,
      severity: params.severity
    });
  }
  
  // ============================================
  // HEALTH METRIC METHODS
  // ============================================
  
  /**
   * Update service health status
   */
  setServiceHealth(service: string, healthy: boolean): void {
    this.serviceHealth.set({ service }, healthy ? 1 : 0);
  }
  
  /**
   * Update OPA health status
   */
  setOPAHealth(instance: string, healthy: boolean): void {
    this.opaHealth.set({ instance }, healthy ? 1 : 0);
  }
  
  /**
   * Update Redis health status
   */
  setRedisHealth(cluster: string, healthy: boolean): void {
    this.redisHealth.set({ cluster }, healthy ? 1 : 0);
  }
  
  /**
   * Update MongoDB health status
   */
  setMongoHealth(replicaSet: string, healthy: boolean): void {
    this.mongoHealth.set({ replica_set: replicaSet }, healthy ? 1 : 0);
  }
  
  // ============================================
  // OPAL METRIC METHODS (Phase 2)
  // ============================================
  
  /**
   * Update OPAL connected clients count
   */
  setOPALConnectedClients(count: number): void {
    this.opalConnectedClients.set(count);
  }
  
  /**
   * Update policy bundle metrics
   */
  setPolicyBundleMetrics(params: {
    size: number;
    signed: boolean;
    versionCount?: number;
  }): void {
    this.policyBundleSize.set(params.size);
    this.policyBundleSigned.set(params.signed ? 1 : 0);
    if (params.versionCount !== undefined) {
      this.policyVersionCount.set(params.versionCount);
    }
  }
  
  /**
   * Record a policy bundle build
   */
  recordPolicyBundleBuild(params: {
    signed: boolean;
    durationMs: number;
  }): void {
    this.policyBundleBuilds.inc({ signed: String(params.signed) });
    this.policyBundleBuildDuration.observe(params.durationMs / 1000);
  }
  
  /**
   * Record a policy bundle publish
   */
  recordPolicyBundlePublish(): void {
    this.policyBundlePublishes.inc();
  }
  
  /**
   * Update spoke sync status metrics
   */
  setSpokeSyncStatus(statusCounts: {
    current: number;
    behind: number;
    stale: number;
    offline: number;
  }): void {
    this.spokeSyncStatus.set({ status: 'current' }, statusCounts.current);
    this.spokeSyncStatus.set({ status: 'behind' }, statusCounts.behind);
    this.spokeSyncStatus.set({ status: 'stale' }, statusCounts.stale);
    this.spokeSyncStatus.set({ status: 'offline' }, statusCounts.offline);
  }
  
  /**
   * Update SP client metrics
   */
  setSPClientMetrics(params: {
    total: number;
    byStatus: Record<string, number>;
  }): void {
    this.spClientsTotal.set(params.total);
    for (const [status, count] of Object.entries(params.byStatus)) {
      this.spClientsByStatus.set({ status }, count);
    }
  }
  
  /**
   * Update OPA test metrics
   */
  setOPATestMetrics(params: {
    total: number;
    passed: number;
    failed: number;
  }): void {
    this.opaTestsTotal.set(params.total);
    this.opaTestsPassed.set(params.passed);
    this.opaTestsFailed.set(params.failed);
  }

  /**
   * Record rate limit block
   */
  recordRateLimitBlock(limiterType: string): void {
    this.rateLimitBlocks.inc({ limiter_type: limiterType });
  }

  /**
   * Record rate limit hit (successful request within limits)
   */
  recordRateLimitHit(limiterType: string): void {
    this.rateLimitHits.inc({ limiter_type: limiterType });
  }

  /**
   * Update active rate limit keys count
   */
  setRateLimitActiveKeys(limiterType: string, count: number): void {
    this.rateLimitActiveKeys.set({ limiter_type: limiterType }, count);
  }

  // ============================================
  // EXPORT METHODS
  // ============================================
  
  /**
   * Get metrics in Prometheus exposition format
   */
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }
  
  /**
   * Get metrics as JSON
   */
  async getMetricsJSON(): Promise<object> {
    return this.registry.getMetricsAsJSON();
  }
  
  /**
   * Get content type for Prometheus
   */
  getContentType(): string {
    return this.registry.contentType;
  }
  
  /**
   * Reset all metrics (for testing)
   */
  resetMetrics(): void {
    this.registry.resetMetrics();
    logger.info('All Prometheus metrics reset');
  }
  
  /**
   * Get registry for advanced operations
   */
  getRegistry(): Registry {
    return this.registry;
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const prometheusMetrics = new PrometheusMetricsService();

export default PrometheusMetricsService;


