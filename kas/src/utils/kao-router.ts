/**
 * KAO Router Utility
 * 
 * Routes keyAccessObjects to appropriate KAS instances based on URL analysis.
 * Implements Phase 3.1: Foreign KAO Detection
 * 
 * Reference: kas/IMPLEMENTATION-HANDOFF.md Phase 3.1
 * Trace: KAS-REQ-100 (Federation), KAS-REQ-101 (KAO Routing)
 */

import { IKeyAccessObject } from '../types/rewrap.types';
import { kasRegistry } from './kas-federation';
import { kasLogger } from './kas-logger';

// ============================================
// Types
// ============================================

export interface IKAORoutingDecision {
    /** Target KAS type */
    target: 'local' | 'remote';
    
    /** KAS identifier (null for local) */
    kasId: string | null;
    
    /** KAS URL (null for local) */
    kasUrl: string | null;
    
    /** Routing confidence */
    confidence: 'high' | 'medium' | 'low';
    
    /** Routing reason */
    reason: string;
}

export interface IRoutedKAOGroup {
    /** Target KAS identifier ('local' or kasId) */
    target: string;
    
    /** KAS URL (null for local) */
    kasUrl: string | null;
    
    /** Grouped KAOs for this target */
    kaos: IKeyAccessObject[];
}

// ============================================
// KAO Router
// ============================================

export class KAORouter {
    private localUrls: Set<string>;
    private localKasId: string;
    
    constructor() {
        // Initialize local KAS patterns
        this.localUrls = new Set([
            'localhost',
            '127.0.0.1',
            '0.0.0.0',
            '::1',
        ]);
        
        // Add configured local KAS URL
        const kasUrl = process.env.KAS_URL;
        if (kasUrl) {
            this.localUrls.add(kasUrl);
        }
        
        // Determine local KAS ID from environment or hostname
        this.localKasId = process.env.KAS_ID || 'kas-local';
        
        kasLogger.info('KAO Router initialized', {
            localKasId: this.localKasId,
            localUrlPatterns: Array.from(this.localUrls),
        });
    }
    
    /**
     * Determine target KAS for a single keyAccessObject
     */
    routeKAO(kao: IKeyAccessObject): IKAORoutingDecision {
        const kaoUrl = kao.url;
        
        // Check if URL matches local patterns
        const isLocal = this.isLocalURL(kaoUrl);
        
        if (isLocal) {
            return {
                target: 'local',
                kasId: null,
                kasUrl: null,
                confidence: 'high',
                reason: 'URL matches local KAS patterns',
            };
        }
        
        // Attempt to match against KAS registry
        const kasEntry = this.findKASByURL(kaoUrl);
        
        if (kasEntry) {
            return {
                target: 'remote',
                kasId: kasEntry.kasId,
                kasUrl: kasEntry.kasUrl,
                confidence: 'high',
                reason: `URL matched registry entry: ${kasEntry.kasId}`,
            };
        }
        
        // Unknown KAS URL
        return {
            target: 'remote',
            kasId: null,
            kasUrl: kaoUrl,
            confidence: 'low',
            reason: 'URL not found in registry, treating as remote',
        };
    }
    
    /**
     * Group keyAccessObjects by target KAS
     * Returns map: kasId -> KAOs for that KAS
     */
    groupKAOsByTarget(kaos: IKeyAccessObject[]): Map<string, IRoutedKAOGroup> {
        const groups = new Map<string, IRoutedKAOGroup>();
        
        for (const kao of kaos) {
            const routing = this.routeKAO(kao);
            
            // Use 'local' or kasId as key
            const targetKey = routing.target === 'local' ? 'local' : (routing.kasId || 'unknown');
            
            if (!groups.has(targetKey)) {
                groups.set(targetKey, {
                    target: targetKey,
                    kasUrl: routing.kasUrl,
                    kaos: [],
                });
            }
            
            groups.get(targetKey)!.kaos.push(kao);
        }
        
        kasLogger.debug('Grouped KAOs by target', {
            totalKAOs: kaos.length,
            targetCount: groups.size,
            targets: Array.from(groups.keys()),
        });
        
        return groups;
    }
    
    /**
     * Separate local and foreign KAOs
     */
    separateLocalAndForeign(kaos: IKeyAccessObject[]): {
        local: IKeyAccessObject[];
        foreign: Map<string, IRoutedKAOGroup>;
    } {
        const groups = this.groupKAOsByTarget(kaos);
        
        const local = groups.get('local')?.kaos || [];
        
        // Remove 'local' from map to get only foreign KAOs
        groups.delete('local');
        
        return {
            local,
            foreign: groups,
        };
    }
    
    /**
     * Check if URL is for local KAS
     */
    private isLocalURL(url: string): boolean {
        try {
            const parsedUrl = new URL(url);
            const hostname = parsedUrl.hostname.toLowerCase();
            
            // Check against local patterns
            for (const pattern of this.localUrls) {
                if (hostname.includes(pattern.toLowerCase())) {
                    return true;
                }
            }
            
            // Check if URL matches configured KAS_URL
            const configuredUrl = process.env.KAS_URL;
            if (configuredUrl && url.startsWith(configuredUrl)) {
                return true;
            }
            
            return false;
            
        } catch (error) {
            kasLogger.warn('Failed to parse KAO URL', {
                url,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            return false;
        }
    }
    
    /**
     * Find KAS entry in registry by URL
     * Matches against MongoDB-loaded registry (SSOT)
     */
    private findKASByURL(url: string): any | null {
        const allKAS = kasRegistry.listAll();
        
        try {
            const parsedUrl = new URL(url);
            const hostname = parsedUrl.hostname.toLowerCase();
            
            kasLogger.debug('Finding KAS by URL', {
                url,
                hostname,
                registrySize: allKAS.length,
            });
            
            // Match by hostname (exact match)
            for (const kas of allKAS) {
                try {
                    const kasUrlObj = new URL(kas.kasUrl);
                    if (kasUrlObj.hostname.toLowerCase() === hostname) {
                        kasLogger.debug('KAS matched by hostname', {
                            kasId: kas.kasId,
                            hostname,
                        });
                        return kas;
                    }
                } catch (e) {
                    kasLogger.warn('Invalid KAS URL in registry', {
                        kasId: kas.kasId,
                        kasUrl: kas.kasUrl,
                    });
                }
            }
            
            // Fallback: Check if URL starts with KAS base URL
            for (const kas of allKAS) {
                const baseUrl = kas.kasUrl.replace(/\/request-key$/, '').replace(/\/rewrap$/, '');
                if (url.startsWith(baseUrl)) {
                    kasLogger.debug('KAS matched by base URL', {
                        kasId: kas.kasId,
                        baseUrl,
                    });
                    return kas;
                }
            }
            
            kasLogger.debug('No KAS matched for URL', { url, hostname });
            return null;
            
        } catch (error) {
            kasLogger.warn('Failed to match KAO URL to registry', {
                url,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            return null;
        }
    }
    
    /**
     * Get statistics for KAO routing
     */
    getRoutingStats(kaos: IKeyAccessObject[]): {
        total: number;
        local: number;
        remote: number;
        unknownKAS: number;
        targetDistribution: Map<string, number>;
    } {
        const groups = this.groupKAOsByTarget(kaos);
        
        const local = groups.get('local')?.kaos.length || 0;
        const unknownKAS = groups.get('unknown')?.kaos.length || 0;
        
        const targetDistribution = new Map<string, number>();
        for (const [target, group] of groups.entries()) {
            targetDistribution.set(target, group.kaos.length);
        }
        
        const remote = kaos.length - local;
        
        return {
            total: kaos.length,
            local,
            remote,
            unknownKAS,
            targetDistribution,
        };
    }
}

// Export singleton instance
export const kaoRouter = new KAORouter();
