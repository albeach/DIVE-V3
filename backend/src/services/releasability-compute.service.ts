/**
 * DIVE V3 - Releasability Compute Service
 *
 * Phase 3: Computes dynamic releasability at authorization time.
 *
 * Instead of storing static `releasabilityTo: ["USA", "GBR", "FRA"]` arrays,
 * resources can define rules that are evaluated against current federation state.
 *
 * Benefits:
 * - New spoke approved → immediately sees NATO resources
 * - Spoke suspended → immediately loses access
 * - No MongoDB updates needed when federation changes
 * - Reduces stale permission risks
 *
 * @version 1.0.0
 * @date 2025-12-20
 */

import { logger } from '../utils/logger';
import { hubSpokeRegistry } from './hub-spoke-registry.service';
import { opalDataService } from './opal-data.service';
import {
  IReleasabilityRules,
  IResourceWithRules,
  IReleasabilityComputeResult,
  getMultilateralGroupMembers
} from '../types/releasability.types';

// ============================================
// RELEASABILITY COMPUTE SERVICE
// ============================================

class ReleasabilityComputeService {
  private cacheEnabled = true;
  private computeCache: Map<string, { result: IReleasabilityComputeResult; expires: number }> = new Map();
  private readonly CACHE_TTL_MS = 60000; // 60 second cache

  constructor() {
    // Periodically clean up expired cache entries
    setInterval(() => this.cleanupCache(), 30000);
  }

  /**
   * Compute releasabilityTo for a resource
   *
   * If resource has releasabilityRules, compute dynamically.
   * Otherwise, use static releasabilityTo array (backward compatibility).
   */
  async computeReleasabilityTo(resource: IResourceWithRules): Promise<IReleasabilityComputeResult> {
    const startTime = Date.now();

    // Check cache first
    const cacheKey = this.getCacheKey(resource);
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      logger.debug('Releasability computed from cache', {
        resourceId: resource.resourceId,
        countries: cached.countries.length
      });
      return cached;
    }

    let result: IReleasabilityComputeResult;

    // If no rules, use static array (backward compatibility)
    if (!resource.releasabilityRules) {
      result = {
        countries: resource.releasabilityTo || [],
        source: 'static',
        computedAt: new Date()
      };
    } else {
      result = await this.computeFromRules(resource.releasabilityRules, resource.resourceId);
    }

    // Cache the result
    this.setInCache(cacheKey, result);

    const duration = Date.now() - startTime;
    logger.debug('Releasability computed', {
      resourceId: resource.resourceId,
      source: result.source,
      countries: result.countries.length,
      durationMs: duration
    });

    return result;
  }

  /**
   * Compute releasability from rules
   */
  private async computeFromRules(
    rules: IReleasabilityRules,
    resourceId: string
  ): Promise<IReleasabilityComputeResult> {
    let countries: string[] = [];

    switch (rules.type) {
      case 'explicit':
        countries = rules.countries || [];
        break;

      case 'coi-based':
        countries = await this.getCountriesWithCOI(rules.requiredCOI || [], rules.coiMatchMode || 'all');
        break;

      case 'bilateral':
        countries = await this.getApprovedSpokeCodes(rules.requiresBilateralAgreement);
        break;

      case 'multilateral':
        countries = rules.multilateralGroup
          ? getMultilateralGroupMembers(rules.multilateralGroup)
          : [];
        break;

      default:
        logger.warn('Unknown releasability rule type', {
          resourceId,
          type: (rules as any).type
        });
        countries = [];
    }

    // Apply additional countries
    if (rules.additionalCountries?.length) {
      const additionalSet = new Set(rules.additionalCountries);
      for (const country of additionalSet) {
        if (!countries.includes(country)) {
          countries.push(country);
        }
      }
    }

    // Apply exclusions
    if (rules.excludeCountries?.length) {
      const excludeSet = new Set(rules.excludeCountries);
      countries = countries.filter(c => !excludeSet.has(c));
    }

    return {
      countries,
      source: rules.type,
      computedAt: new Date(),
      debug: {
        rulesApplied: rules,
        excluded: rules.excludeCountries,
        added: rules.additionalCountries
      }
    };
  }

  /**
   * Get countries with matching COI membership
   */
  private async getCountriesWithCOI(requiredCOI: string[], matchMode: 'all' | 'any'): Promise<string[]> {
    if (requiredCOI.length === 0) {
      return [];
    }

    try {
      const opalData = await opalDataService.getCurrentData();
      const coiMembers = opalData.coi_members || {};

      // Get all unique countries across all COIs
      const allCountries = new Set<string>();
      const countryCoiMembership: Map<string, Set<string>> = new Map();

      for (const [coiName, members] of Object.entries(coiMembers)) {
        for (const country of members) {
          allCountries.add(country);
          if (!countryCoiMembership.has(country)) {
            countryCoiMembership.set(country, new Set());
          }
          countryCoiMembership.get(country)!.add(coiName);
        }
      }

      // Filter based on match mode
      const result: string[] = [];
      const requiredSet = new Set(requiredCOI);

      for (const country of allCountries) {
        const membership = countryCoiMembership.get(country) || new Set();

        if (matchMode === 'all') {
          // Country must be member of ALL required COIs
          const hasAll = [...requiredSet].every(coi => membership.has(coi));
          if (hasAll) {
            result.push(country);
          }
        } else {
          // Country must be member of at least ONE required COI
          const hasAny = [...requiredSet].some(coi => membership.has(coi));
          if (hasAny) {
            result.push(country);
          }
        }
      }

      return result;
    } catch (error) {
      logger.error('Failed to get countries with COI membership', {
        requiredCOI,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return [];
    }
  }

  /**
   * Get instance codes of approved spokes
   *
   * If requiresBilateral is true, only return spokes with bilateral or national trust level.
   */
  private async getApprovedSpokeCodes(requiresBilateral?: boolean): Promise<string[]> {
    try {
      // Use listActiveSpokes to get approved spokes
      const spokes = await hubSpokeRegistry.listActiveSpokes();

      let filteredSpokes = spokes;

      if (requiresBilateral) {
        filteredSpokes = spokes.filter(
          s => s.trustLevel === 'bilateral' || s.trustLevel === 'national'
        );
      }

      // Always include the hub instance
      const hubInstanceCode = process.env.INSTANCE_CODE || 'USA';
      const codes = filteredSpokes.map(s => s.instanceCode.toUpperCase());

      if (!codes.includes(hubInstanceCode)) {
        codes.unshift(hubInstanceCode);
      }

      return codes;
    } catch (error) {
      logger.error('Failed to get approved spoke codes', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // Fallback: return just the hub
      return [process.env.INSTANCE_CODE || 'USA'];
    }
  }

  // ============================================
  // CACHE MANAGEMENT
  // ============================================

  private getCacheKey(resource: IResourceWithRules): string {
    // Include rules in cache key to handle rule changes
    const rulesHash = resource.releasabilityRules
      ? JSON.stringify(resource.releasabilityRules)
      : 'static';
    return `${resource.resourceId}:${rulesHash}`;
  }

  private getFromCache(key: string): IReleasabilityComputeResult | null {
    if (!this.cacheEnabled) return null;

    const entry = this.computeCache.get(key);
    if (entry && entry.expires > Date.now()) {
      return entry.result;
    }

    // Expired, remove it
    if (entry) {
      this.computeCache.delete(key);
    }

    return null;
  }

  private setInCache(key: string, result: IReleasabilityComputeResult): void {
    if (!this.cacheEnabled) return;

    this.computeCache.set(key, {
      result,
      expires: Date.now() + this.CACHE_TTL_MS
    });
  }

  private cleanupCache(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.computeCache.entries()) {
      if (entry.expires <= now) {
        this.computeCache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug('Cleaned up releasability cache', { cleaned });
    }
  }

  /**
   * Invalidate cache (call when federation changes)
   */
  invalidateCache(): void {
    const size = this.computeCache.size;
    this.computeCache.clear();
    logger.info('Releasability compute cache invalidated', { entriesCleared: size });
  }

  /**
   * Enable or disable caching (for testing)
   */
  setCacheEnabled(enabled: boolean): void {
    this.cacheEnabled = enabled;
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; enabled: boolean } {
    return {
      size: this.computeCache.size,
      enabled: this.cacheEnabled
    };
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const releasabilityComputeService = new ReleasabilityComputeService();

export default ReleasabilityComputeService;

