/**
 * Shared Admin Authentication Middleware for Next.js API Routes
 *
 * Modern 2026 security patterns:
 * - Standardized authentication using validateSession()
 * - Automatic token refresh handling
 * - Consistent role-based authorization
 * - Standardized error responses
 * - Request logging for audit trail
 *
 * Usage in API routes:
 * ```typescript
 * import { withAdminAuth } from '@/middleware/admin-auth';
 *
 * export const GET = withAdminAuth(async (request, { session, tokens }) => {
 *   // Your handler logic here
 *   return NextResponse.json({ success: true, data: {} });
 * });
 *
 * // With super admin requirement
 * export const POST = withAdminAuth(
 *   async (request, { session, tokens }) => {
 *     // Handler logic
 *   },
 *   { requireSuperAdmin: true }
 * );
 * ```
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateSession, getSessionTokens, type SessionValidationResult, type SessionTokens } from '@/lib/session-validation';
import { hasAdminRole, isSuperAdmin } from '@/lib/admin-role-utils';
import type { Session } from 'next-auth';

/**
 * Admin auth context provided to route handlers
 */
export interface AdminAuthContext {
    session: Session;
    tokens: SessionTokens;
    userId: string;
    isAdmin: boolean;
    isSuperAdmin: boolean;
}

/**
 * Combined context for route handlers with dynamic params
 */
export interface AdminRouteContext<TParams = any> extends AdminAuthContext {
    params?: Promise<TParams>;
}

/**
 * Admin auth options
 */
export interface AdminAuthOptions {
    /**
     * Require super_admin role (default: false)
     */
    requireSuperAdmin?: boolean;

    /**
     * Custom role check function
     */
    customRoleCheck?: (session: Session) => boolean;

    /**
     * Skip token validation (use for routes that don't call backend)
     */
    skipTokens?: boolean;

    /**
     * Enable request logging for audit
     */
    enableAuditLog?: boolean;
}

/**
 * Admin route handler type
 * Supports both simple handlers and handlers with route context (for dynamic routes)
 */
export type AdminRouteHandler<TParams = any> = (
    request: NextRequest,
    context: AdminRouteContext<TParams>
) => Promise<Response> | Response;

/**
 * Standard error response format matching backend IAdminAPIResponse
 */
function createErrorResponse(
    error: string,
    message: string,
    status: number,
    requestId?: string
): Response {
    return NextResponse.json(
        {
            success: false,
            error,
            message,
            requestId: requestId || `req-${Date.now()}`,
        },
        { status }
    );
}

/**
 * Wrap an admin route handler with authentication and authorization
 *
 * @param handler - The route handler function
 * @param options - Authentication options
 * @returns Wrapped handler with auth checks
 */
export function withAdminAuth<TParams = any>(
    handler: AdminRouteHandler<TParams>,
    options: AdminAuthOptions = {}
): (request: NextRequest, routeContext?: { params: Promise<TParams> }) => Promise<Response> {
    return async (request: NextRequest, routeContext?: { params: Promise<TParams> }): Promise<Response> => {
        const requestId = request.headers.get('x-request-id') || `req-${Date.now()}`;
        const startTime = Date.now();

        try {
            // Step 1: Validate session
            const validation: SessionValidationResult = await validateSession();

            if (!validation.isValid || !validation.session) {
                const errorMessage = validation.error
                    ? `Session validation failed: ${validation.error}`
                    : 'No active session found';

                if (options.enableAuditLog) {
                    console.warn('[AdminAuth] Unauthorized access attempt', {
                        requestId,
                        path: request.nextUrl.pathname,
                        error: validation.error,
                    });
                }

                return createErrorResponse(
                    'Unauthorized',
                    errorMessage,
                    401,
                    requestId
                );
            }

            const { session } = validation;

            // Step 2: Check admin role
            const isAdmin = hasAdminRole({
                roles: session.user.roles,
                name: session.user.name || undefined,
                email: session.user.email || undefined,
            });

            if (!isAdmin && !options.customRoleCheck?.(session)) {
                if (options.enableAuditLog) {
                    console.warn('[AdminAuth] Non-admin user attempted admin access', {
                        requestId,
                        path: request.nextUrl.pathname,
                        user: session.user.name || session.user.email,
                        roles: session.user.roles,
                    });
                }

                return createErrorResponse(
                    'Forbidden',
                    'Admin role required to access this resource',
                    403,
                    requestId
                );
            }

            // Step 3: Check super admin if required
            if (options.requireSuperAdmin) {
                const isSuperAdminUser = isSuperAdmin({
                    roles: session.user.roles,
                    name: session.user.name || undefined,
                });

                if (!isSuperAdminUser) {
                    if (options.enableAuditLog) {
                        console.warn('[AdminAuth] Non-super-admin attempted super-admin operation', {
                            requestId,
                            path: request.nextUrl.pathname,
                            user: session.user.name || session.user.email,
                            roles: session.user.roles,
                        });
                    }

                    return createErrorResponse(
                        'Forbidden',
                        'Super admin role required to perform this operation',
                        403,
                        requestId
                    );
                }
            }

            // Step 4: Get session tokens (unless skipped)
            let tokens: SessionTokens;

            if (options.skipTokens) {
                // Provide dummy tokens if skipped
                tokens = {
                    accessToken: '',
                    idToken: '',
                    expiresAt: 0,
                };
            } else {
                try {
                    tokens = await getSessionTokens();
                } catch (tokenError) {
                    console.error('[AdminAuth] Failed to get session tokens', {
                        requestId,
                        error: tokenError instanceof Error ? tokenError.message : 'Unknown error',
                    });

                    return createErrorResponse(
                        'Unauthorized',
                        'Failed to retrieve authentication tokens. Please try again.',
                        401,
                        requestId
                    );
                }
            }

            // Step 5: Build auth context (merge with route params if provided)
            const authContext: AdminRouteContext<TParams> = {
                session,
                tokens,
                userId: validation.userId || session.user.id,
                isAdmin,
                isSuperAdmin: options.requireSuperAdmin || isSuperAdmin({
                    roles: session.user.roles,
                    name: session.user.name || undefined,
                }),
                params: routeContext?.params,
            };

            // Step 6: Audit log (if enabled)
            if (options.enableAuditLog) {
                console.info('[AdminAuth] Admin request authenticated', {
                    requestId,
                    path: request.nextUrl.pathname,
                    method: request.method,
                    user: session.user.name || session.user.email,
                    roles: session.user.roles,
                    isSuperAdmin: authContext.isSuperAdmin,
                });
            }

            // Step 7: Call the actual handler
            const response = await handler(request, authContext);

            // Add request ID to response headers
            const headers = new Headers(response.headers);
            headers.set('x-request-id', requestId);
            headers.set('x-response-time', `${Date.now() - startTime}ms`);

            return new Response(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers,
            });

        } catch (error) {
            console.error('[AdminAuth] Unexpected error', {
                requestId,
                path: request.nextUrl.pathname,
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined,
            });

            return createErrorResponse(
                'InternalServerError',
                'An unexpected error occurred. Please try again.',
                500,
                requestId
            );
        }
    };
}

/**
 * Helper: Create admin fetch wrapper with authentication
 *
 * Use this for making authenticated requests to the backend from admin API routes
 *
 * @param tokens - Session tokens from AdminAuthContext
 * @param backendUrl - Backend URL (defaults to env var)
 */
export function createAdminBackendFetch(tokens: SessionTokens, backendUrl?: string) {
    const baseUrl = backendUrl || process.env.BACKEND_URL || 'http://localhost:3001';

    return async (endpoint: string, options: RequestInit = {}) => {
        const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;

        const headers = new Headers(options.headers || {});
        headers.set('Authorization', `Bearer ${tokens.accessToken}`);
        headers.set('Content-Type', 'application/json');

        const response = await fetch(url, {
            ...options,
            headers,
        });

        return response;
    };
}

/**
 * Simplified wrapper for routes that only need authentication (no super admin)
 */
export const withAuth = (handler: AdminRouteHandler) =>
    withAdminAuth(handler, { enableAuditLog: true });

/**
 * Wrapper for routes that require super admin role
 */
export const withSuperAdmin = (handler: AdminRouteHandler) =>
    withAdminAuth(handler, { requireSuperAdmin: true, enableAuditLog: true });

/**
 * Wrapper for routes that don't call the backend (no tokens needed)
 */
export const withAdminAuthSkipTokens = (handler: AdminRouteHandler) =>
    withAdminAuth(handler, { skipTokens: true, enableAuditLog: true });

export default withAdminAuth;
