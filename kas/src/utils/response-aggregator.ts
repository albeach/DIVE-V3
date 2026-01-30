/**
 * Response Aggregation Utility
 *
 * Aggregates responses from multiple KAS instances (local + federated)
 * Implements Phase 3.3: Response Aggregation
 *
 * Reference: kas/IMPLEMENTATION-HANDOFF.md Phase 3.3
 * Trace: KAS-REQ-102 (Response Aggregation), KAS-REQ-103 (Signature Preservation)
 */

import { kasLogger } from './kas-logger';
import {
    IPolicyGroupResponse,
    IKeyAccessObjectResult,
} from '../types/rewrap.types';
import {
    IFederatedRewrapResponse,
    IFederationResult,
    IAggregatedResponse,
} from '../types/federation.types';

// ============================================
// Response Aggregator
// ============================================

export class ResponseAggregator {
    /**
     * Aggregate local and federated results for a single policy
     *
     * CRITICAL: Preserves per-result signatures from downstream KAS (does NOT re-sign)
     */
    aggregateForPolicy(
        policyId: string,
        localResults: IKeyAccessObjectResult[],
        federationResults: IFederationResult[],
        requestId: string
    ): IAggregatedResponse {
        const startTime = Date.now();

        kasLogger.debug('Aggregating responses for policy', {
            requestId,
            policyId,
            localResultCount: localResults.length,
            federationResultCount: federationResults.length,
        });

        // Collect all results
        const allResults: IKeyAccessObjectResult[] = [...localResults];
        const errors: string[] = [];
        let federatedCount = 0;

        // Extract results from each federation response
        for (const fedResult of federationResults) {
            if (fedResult.success && fedResult.response) {
                // Extract results from federated response
                const federatedResults = this.extractResultsFromFederatedResponse(
                    fedResult.response,
                    policyId,
                    requestId
                );

                // CRITICAL: Preserve signatures from downstream KAS (do NOT re-sign)
                allResults.push(...federatedResults);
                federatedCount += federatedResults.length;

                kasLogger.debug('Extracted results from federated KAS', {
                    requestId,
                    kasId: fedResult.kasId,
                    resultCount: federatedResults.length,
                    successCount: federatedResults.filter(r => r.status === 'success').length,
                });

            } else if (fedResult.error) {
                // Federation failed - create error results for affected KAOs
                const errorResults = this.createErrorResultsForFailedKAS(
                    fedResult.error.affectedKAOIds,
                    fedResult.error.message,
                    fedResult.kasId
                );

                allResults.push(...errorResults);
                errors.push(`KAS ${fedResult.kasId}: ${fedResult.error.message}`);

                kasLogger.warn('Federation failure, created error results', {
                    requestId,
                    kasId: fedResult.kasId,
                    affectedKAOCount: fedResult.error.affectedKAOIds.length,
                });
            }
        }

        const aggregationTimeMs = Date.now() - startTime;

        kasLogger.info('Response aggregation complete', {
            requestId,
            policyId,
            totalResults: allResults.length,
            localCount: localResults.length,
            federatedCount,
            successCount: allResults.filter(r => r.status === 'success').length,
            errorCount: allResults.filter(r => r.status === 'error').length,
            aggregationTimeMs,
        });

        return {
            policyId,
            results: allResults,
            aggregationMetadata: {
                localCount: localResults.length,
                federatedCount,
                downstreamKASCount: federationResults.filter(r => r.success).length,
                aggregationTimeMs,
                errors: errors.length > 0 ? errors : undefined,
            },
        };
    }

    /**
     * Extract results from federated response for a specific policy
     * Preserves signatures from downstream KAS
     */
    private extractResultsFromFederatedResponse(
        response: IFederatedRewrapResponse,
        policyId: string,
        requestId: string
    ): IKeyAccessObjectResult[] {
        const results: IKeyAccessObjectResult[] = [];

        // Find matching policy group in response
        for (const responseGroup of response.responses) {
            // Match by policyId (exact match or hash match)
            if (responseGroup.policyId === policyId || this.policiesMatch(responseGroup.policyId, policyId)) {
                // Add all results from this group
                // CRITICAL: Do NOT modify signature field - preserve as-is from downstream KAS
                for (const result of responseGroup.results) {
                    results.push({
                        ...result,
                        // Preserve signature from downstream KAS
                        signature: result.signature,
                    });
                }
            }
        }

        if (results.length === 0) {
            kasLogger.warn('No matching policy group found in federated response', {
                requestId,
                expectedPolicyId: policyId,
                availablePolicyIds: response.responses.map(r => r.policyId),
            });
        }

        return results;
    }

    /**
     * Check if two policy IDs represent the same policy
     * Handles cases where policy IDs might be hashes or canonical identifiers
     */
    private policiesMatch(policyId1: string, policyId2: string): boolean {
        // Exact match
        if (policyId1 === policyId2) {
            return true;
        }

        // Both are hashes of same length (likely same policy)
        if (policyId1.length === policyId2.length && policyId1.length >= 16) {
            // Consider this a mismatch - require exact hash match
            return false;
        }

        return false;
    }

    /**
     * Create error results for KAOs that couldn't be processed due to federation failure
     */
    private createErrorResultsForFailedKAS(
        kaoIds: string[],
        errorMessage: string,
        kasId: string
    ): IKeyAccessObjectResult[] {
        return kaoIds.map(kaoId => ({
            keyAccessObjectId: kaoId,
            status: 'error' as const,
            error: `Federation failure: ${errorMessage} (target KAS: ${kasId})`,
            signature: {
                alg: 'none',
                sig: '',
            },
        }));
    }

    /**
     * Aggregate multiple policy groups
     */
    aggregateMultiplePolicies(
        aggregatedPolicies: IAggregatedResponse[]
    ): IPolicyGroupResponse[] {
        return aggregatedPolicies.map(agg => ({
            policyId: agg.policyId,
            results: agg.results,
        }));
    }

    /**
     * Validate aggregated response
     * Ensures no duplicate keyAccessObjectIds and all results have signatures
     */
    validateAggregatedResponse(
        response: IPolicyGroupResponse[],
        requestId: string
    ): { valid: boolean; errors: string[] } {
        const errors: string[] = [];
        const seenKaoIds = new Set<string>();

        for (const group of response) {
            for (const result of group.results) {
                // Check for duplicate keyAccessObjectId
                if (seenKaoIds.has(result.keyAccessObjectId)) {
                    errors.push(`Duplicate keyAccessObjectId: ${result.keyAccessObjectId}`);
                }
                seenKaoIds.add(result.keyAccessObjectId);

                // Check for missing signature
                if (!result.signature || !result.signature.alg) {
                    errors.push(`Missing signature for keyAccessObjectId: ${result.keyAccessObjectId}`);
                }

                // Check for missing required fields
                if (!result.status) {
                    errors.push(`Missing status for keyAccessObjectId: ${result.keyAccessObjectId}`);
                }
            }
        }

        if (errors.length > 0) {
            kasLogger.warn('Aggregated response validation failed', {
                requestId,
                errorCount: errors.length,
                errors,
            });
        }

        return {
            valid: errors.length === 0,
            errors,
        };
    }

    /**
     * Get statistics from aggregated response
     */
    getAggregationStats(aggregated: IAggregatedResponse[]): {
        totalResults: number;
        successResults: number;
        errorResults: number;
        localResults: number;
        federatedResults: number;
        downstreamKASCount: number;
        totalAggregationTimeMs: number;
    } {
        const totalResults = aggregated.reduce((sum, agg) => sum + agg.results.length, 0);
        const successResults = aggregated.reduce(
            (sum, agg) => sum + agg.results.filter((r: IKeyAccessObjectResult) => r.status === 'success').length,
            0
        );
        const errorResults = aggregated.reduce(
            (sum, agg) => sum + agg.results.filter((r: IKeyAccessObjectResult) => r.status === 'error').length,
            0
        );
        const localResults = aggregated.reduce((sum, agg) => sum + agg.aggregationMetadata.localCount, 0);
        const federatedResults = aggregated.reduce((sum, agg) => sum + agg.aggregationMetadata.federatedCount, 0);
        const downstreamKASCount = Math.max(
            ...aggregated.map(agg => agg.aggregationMetadata.downstreamKASCount)
        );
        const totalAggregationTimeMs = aggregated.reduce(
            (sum, agg) => sum + agg.aggregationMetadata.aggregationTimeMs,
            0
        );

        return {
            totalResults,
            successResults,
            errorResults,
            localResults,
            federatedResults,
            downstreamKASCount,
            totalAggregationTimeMs,
        };
    }
}

// Export singleton instance
export const responseAggregator = new ResponseAggregator();
