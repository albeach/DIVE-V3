/**
 * Paginated Search API Proxy Route
 *
 * Phase 1: Performance Foundation
 * Phase 4: Federation Support
 *
 * Proxies search requests to backend:
 * - Local search: /api/resources/search (single instance)
 * - Federated search: /federated-query (multiple instances)
 *
 * Security: Tokens accessed server-side only via session validation
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { accounts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { updateAccountTokensByUserId } from '@/lib/db/operations';
import { getBackendUrl } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

// Allow self-signed certs in local/dev (backend uses mkcert)
if (process.env.NODE_ENV !== 'production') {
}

/**
 * POST /api/resources/search
 * Server-side paginated search with facets
 * Automatically routes to federated endpoint when multiple instances selected
 */
export async function POST(request: NextRequest) {
    try {
        // Use the robust session validation utility (includes automatic token refresh)
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json(
                { error: 'Unauthorized', message: 'Invalid or expired JWT token' },
                { status: 401 }
            );
        }

        // Get tokens with automatic refresh if needed
        let account;
        try {
            const accountResults = await db
                .select()
                .from(accounts)
                .where(eq(accounts.userId, session.user.id))
                .limit(1);
            account = accountResults[0];

            if (!account?.access_token) {
                console.error('[SearchAPI] No access token in account', {
                    userId: session.user.id.substring(0, 8) + '...',
                });
                return NextResponse.json(
                    { error: 'Unauthorized', message: 'Invalid or expired JWT token' },
                    { status: 401 }
                );
            }

            // CRITICAL FIX: Check if token is expired and refresh if needed
            const currentTime = Math.floor(Date.now() / 1000);
            const timeUntilExpiry = (account.expires_at || 0) - currentTime;
            const needsRefresh = timeUntilExpiry <= 60; // Less than 1 minute

            if (needsRefresh && account.refresh_token) {
                console.log('[SearchAPI] Token needs refresh', {
                    userId: session.user.id.substring(0, 8) + '...',
                    timeUntilExpiry,
                });

                try {
                    const refreshUrl = `${process.env.KEYCLOAK_URL}/realms/${process.env.NEXT_PUBLIC_KEYCLOAK_REALM}/protocol/openid-connect/token`;
                    const response = await fetch(refreshUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: new URLSearchParams({
                            client_id: process.env.KEYCLOAK_CLIENT_ID!,
                            client_secret: process.env.KEYCLOAK_CLIENT_SECRET!,
                            grant_type: 'refresh_token',
                            refresh_token: account.refresh_token!,
                        }),
                    });

                    const tokens = await response.json();

                    if (!response.ok) {
                        console.error('[SearchAPI] Token refresh failed', { error: tokens.error });
                        return NextResponse.json(
                            { error: 'Unauthorized', message: 'Invalid or expired JWT token' },
                            { status: 401 }
                        );
                    }

                    const newExpiresAt = currentTime + tokens.expires_in;
                    await updateAccountTokensByUserId(session.user.id, {
                        access_token: tokens.access_token,
                        id_token: tokens.id_token,
                        expires_at: newExpiresAt,
                        refresh_token: tokens.refresh_token || account.refresh_token,
                    });

                    account.access_token = tokens.access_token;

                    console.log('[SearchAPI] Token refreshed successfully');
                } catch (refreshError) {
                    console.error('[SearchAPI] Token refresh exception:', refreshError);
                    // If not expired yet, use existing token
                    if (timeUntilExpiry > 0) {
                        console.warn('[SearchAPI] Using existing token despite refresh failure');
                    } else {
                        return NextResponse.json(
                            { error: 'Unauthorized', message: 'Invalid or expired JWT token' },
                            { status: 401 }
                        );
                    }
                }
            }
        } catch (error) {
            console.error('[SearchAPI] Error getting tokens:', error);
            return NextResponse.json(
                { error: 'Unauthorized', message: 'Invalid or expired JWT token' },
                { status: 401 }
            );
        }

        // Step 3: Get request body
        const body = await request.json().catch(() => ({}));

        // Step 4: Determine if federated search is needed
        // Use federated endpoint when:
        // - Multiple instances are selected, OR
        // - A single non-local instance is selected (e.g., NLD spoke)
        // Local instance (USA/Hub) uses local search for best performance
        const instances = body.filters?.instances || [];
        const currentInstance = process.env.INSTANCE_CODE || 'USA';

        // Check if any selected instance is NOT the current (local) instance
        const hasRemoteInstances = instances.some((inst: string) => inst !== currentInstance);
        const isFederated = instances.length > 1 || hasRemoteInstances;

        const backendUrl = getBackendUrl();

        let backendResponse: Response;

        if (isFederated) {
            // Federated search: Query all selected instances in parallel
            console.log('[SearchAPI] Federated search for instances:', instances, 'currentInstance:', currentInstance);

            // Transform request for federated-query endpoint
            // CRITICAL: Backend reads classification/releasableTo/coi/limit at top level,
            // NOT nested inside filters/pagination objects
            const federatedBody = {
                query: body.query || '',
                classification: body.filters?.classifications || undefined,
                releasableTo: body.filters?.countries || undefined,
                coi: body.filters?.cois || undefined,
                encrypted: body.filters?.encrypted,
                instances: instances.length > 0 ? instances : ['USA', 'FRA', 'GBR', 'DEU'],
                limit: body.pagination?.limit || 50,
                offset: 0,
                sort: body.sort,
                includeFacets: body.includeFacets !== false,
            };

            backendResponse = await fetch(`${backendUrl}/api/resources/federated-query`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${account.access_token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(federatedBody),
                cache: 'no-store',
            });
        } else {
            // Local search: Query only local instance
            console.log('[SearchAPI] Using local search endpoint');

            backendResponse = await fetch(`${backendUrl}/api/resources/search`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${account.access_token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
                cache: 'no-store',
            });
        }

        // Get the raw text first to see what we're dealing with
        const responseText = await backendResponse.text();

        // Parse and forward
        let data;
        try {
            data = JSON.parse(responseText);
        } catch {
            return NextResponse.json(
                { error: 'ParseError', message: 'Failed to parse backend response', raw: responseText.slice(0, 500) },
                { status: 502 }
            );
        }

        if (!backendResponse.ok) {
            console.error('[SearchAPI] Backend error:', {
                status: backendResponse.status,
                isFederated,
                instances,
                error: data.message || data.error,
                details: data,
            });
            return NextResponse.json(
                {
                    error: 'BackendError',
                    message: data.message || `Backend returned ${backendResponse.status}`,
                    details: data,
                },
                { status: backendResponse.status }
            );
        }

        // For federated responses, transform to match expected format
        if (isFederated && data.results) {
            // Federated response has different structure, normalize it
            // Use totalResults (deduplicated count) as primary — this is the accurate post-dedup count
            // Fall back to totalAccessible (pre-dedup sum) only if totalResults not available
            const totalCount = data.totalResults || data.totalAccessible || data.results?.length || 0;

            // Build instance facets from instanceResults if available
            const instanceFacets = data.instanceResults
                ? Object.entries(data.instanceResults).map(([instance, info]: [string, any]) => ({
                    value: instance,
                    count: info.accessibleCount || info.count || 0,
                  }))
                : [];

            const normalizedResponse = {
                results: data.results.map((r: any) => ({
                    resourceId: r.resourceId,
                    title: r.title,
                    classification: r.classification,
                    releasabilityTo: r.releasabilityTo || [],
                    COI: r.COI || r.coi || [],
                    encrypted: r.encrypted || false,
                    ztdfVersion: r.ztdfVersion,
                    kaoCount: r.kaoCount,
                    originRealm: r.originRealm || r.source || r.sourceInstance,
                })),
                facets: data.facets ? {
                    ...data.facets,
                    // Ensure instances facet includes per-instance counts from instanceResults
                    instances: data.facets.instances?.length ? data.facets.instances : instanceFacets,
                } : {
                    classifications: [],
                    countries: [],
                    cois: [],
                    instances: instanceFacets,
                    encryptionStatus: [],
                    fileTypes: [],
                },
                stats: data.stats || undefined,
                pagination: {
                    nextCursor: data.pagination?.nextCursor || null,
                    prevCursor: data.pagination?.prevCursor || null,
                    totalCount,
                    hasMore: data.results?.length >= (body.pagination?.limit || 50),
                    pageSize: data.pagination?.pageSize || body.pagination?.limit || 50,
                },
                timing: {
                    searchMs: data.executionTimeMs || 0,
                    facetMs: 0,
                    totalMs: data.executionTimeMs || 0,
                },
            };

            // Diagnostic: Log per-instance federation results
            const instanceSummary = data.instanceResults
                ? Object.entries(data.instanceResults).map(([inst, info]: [string, any]) => ({
                    instance: inst,
                    count: info.count,
                    accessibleCount: info.accessibleCount,
                    latencyMs: info.latencyMs,
                    error: info.error || null,
                    circuitBreaker: info.circuitBreakerState,
                }))
                : [];

            console.log('[SearchAPI] Federated response:', {
                totalAccessible: data.totalAccessible,
                totalResults: data.totalResults,
                normalizedTotalCount: totalCount,
                resultCount: data.results?.length,
                instanceSummary,
                missingInstances: instances.filter(
                    (i: string) => !data.instanceResults?.[i]
                ),
            });

            return NextResponse.json(normalizedResponse);
        }

        // Forward backend response to client
        return new NextResponse(responseText, {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
            },
        });

    } catch (error) {
        console.error('[PaginatedSearchAPI] Error:', error);
        return NextResponse.json(
            {
                error: 'InternalError',
                message: error instanceof Error ? error.message : 'Internal server error',
                stack: error instanceof Error ? error.stack : undefined,
            },
            { status: 500 }
        );
    }
}
