import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import NodeCache from 'node-cache';
import jwkToPem from 'jwk-to-pem';
import { logger } from '../utils/logger';
import { getResourceById } from '../services/resource.service';
import { isTokenBlacklisted, areUserTokensRevoked } from '../services/token-blacklist.service';

// ============================================
// PEP (Policy Enforcement Point) Middleware
// ============================================
// Week 2: Integrate OPA for ABAC authorization
// Pattern: Validate JWT → Extract attributes → Fetch resource → Call OPA → Enforce decision

// Decision cache (60s TTL)
const decisionCache = new NodeCache({ stdTTL: 60, checkperiod: 120 });

// JWKS cache (1 hour TTL) - cache fetched public keys
const jwksCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });

/**
 * Clear all caches (for testing)
 * @internal
 */
export const clearAuthzCaches = (): void => {
    decisionCache.flushAll();
    jwksCache.flushAll();
};

// OPA endpoint
const OPA_URL = process.env.OPA_URL || 'http://localhost:8181';
const OPA_DECISION_ENDPOINT = `${OPA_URL}/v1/data/dive/authorization`;

/**
 * Interface for JWT payload (Keycloak token)
 * Enhanced with NIST SP 800-63B/C claims for AAL2/FAL2 enforcement
 * Gap #4: Added dutyOrg and orgUnit (ACP-240 Section 2.1)
 */
interface IKeycloakToken {
    sub: string;
    email?: string;
    preferred_username?: string;
    uniqueID?: string;
    clearance?: string;
    countryOfAffiliation?: string;
    acpCOI?: string[];
    dutyOrg?: string;          // Gap #4: User's duty organization (e.g., US_ARMY, FR_DEFENSE_MINISTRY)
    orgUnit?: string;          // Gap #4: User's organizational unit (e.g., CYBER_DEFENSE, INTELLIGENCE)
    exp?: number;
    iat?: number;
    jti?: string;              // JWT ID for revocation
    // AAL2/FAL2 claims (NIST SP 800-63B/C)
    aud?: string | string[];  // Audience (FAL2 - prevents token theft)
    acr?: string;              // Authentication Context Class Reference (AAL level)
    amr?: string[];            // Authentication Methods Reference (MFA factors)
    auth_time?: number;        // Time of authentication (Unix timestamp)
}

/**
 * Interface for OPA input
 * ACP-240 Section 4.3 Enhancement: Added original classification fields
 * Gap #4: Added dutyOrg and orgUnit for organization-based policies
 */
interface IOPAInput {
    input: {
        subject: {
            authenticated: boolean;
            uniqueID: string;
            clearance?: string;                    // DIVE canonical (SECRET, TOP_SECRET, etc.)
            clearanceOriginal?: string;            // NEW: Original national clearance (e.g., "GEHEIM", "SECRET DÉFENSE")
            clearanceCountry?: string;             // NEW: Country that issued clearance (ISO 3166-1 alpha-3)
            countryOfAffiliation?: string;
            acpCOI?: string[];
            dutyOrg?: string;                      // Gap #4: Organization (e.g., US_ARMY, FR_DEFENSE_MINISTRY)
            orgUnit?: string;                      // Gap #4: Organizational Unit (e.g., CYBER_DEFENSE, INTELLIGENCE)
        };
        action: {
            operation: string;
        };
        resource: {
            resourceId: string;
            classification?: string;               // DIVE canonical (SECRET, TOP_SECRET, etc.)
            originalClassification?: string;       // NEW: Original national classification (ACP-240 Section 4.3)
            originalCountry?: string;              // NEW: Country that created classification (ACP-240 Section 4.3)
            natoEquivalent?: string;               // NEW: NATO standard equivalent (ACP-240 Section 4.3)
            releasabilityTo?: string[];
            COI?: string[];
            coiOperator?: string;                  // COI operator: "ALL" | "ANY"
            creationDate?: string;
            encrypted?: boolean;
        };
        context: {
            currentTime: string;
            sourceIP: string;
            deviceCompliant: boolean;
            requestId: string;
            // AAL2/FAL2 context (NIST SP 800-63B/C)
            acr?: string;                          // Authentication Context Class Reference (AAL level)
            amr?: string[];                        // Authentication Methods Reference (MFA factors)
            auth_time?: number;                    // Time of authentication (Unix timestamp)
        };
    };
}

/**
 * Interface for OPA decision (actual response from /v1/data/dive/authorization)
 */
interface IOPAResponse {
    result: {
        decision: {
            allow: boolean;
            reason: string;
            obligations?: Array<{
                type: string;
                resourceId?: string;
            }>;
            evaluation_details?: Record<string, unknown>;
        };
        allow: boolean;
        reason: string;
        obligations?: Array<{
            type: string;
            resourceId?: string;
        }>;
        evaluation_details?: Record<string, unknown>;
        [key: string]: any; // Other rules/tests in the package
    };
}

/**
 * Interface for normalized decision (what we use in middleware)
 */
interface IOPADecision {
    result: {
        allow: boolean;
        reason: string;
        obligations?: Array<{
            type: string;
            resourceId?: string;
        }>;
        evaluation_details?: Record<string, unknown>;
    };
}

/**
 * Extract realm name from token issuer
 * Multi-realm support: Determine which realm issued the token
 */
const getRealmFromToken = (token: string): string => {
    try {
        const decoded = jwt.decode(token, { complete: true });
        if (!decoded || !decoded.payload) {
            return process.env.KEYCLOAK_REALM || 'dive-v3-broker';
        }

        const payload = decoded.payload as any;
        const issuer = payload.iss;

        if (!issuer) {
            return process.env.KEYCLOAK_REALM || 'dive-v3-broker';
        }

        // Extract realm from issuer URL: http://localhost:8081/realms/{realm}
        const match = issuer.match(/\/realms\/([^\/]+)/);
        if (match && match[1]) {
            return match[1];
        }

        return process.env.KEYCLOAK_REALM || 'dive-v3-broker';
    } catch (error) {
        logger.warn('Could not extract realm from token, using default', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return process.env.KEYCLOAK_REALM || 'dive-v3-broker';
    }
};

/**
 * Get signing key from JWKS with multi-realm support
 * Uses direct JWKS fetch instead of jwks-rsa due to compatibility issues
 * 
 * Multi-Realm Migration (Oct 21, 2025):
 * - Dynamically determines JWKS URL based on token issuer
 * - Supports both dive-v3-pilot and dive-v3-broker realms
 * - Caches keys per kid (realm-independent caching)
 */
const getSigningKey = async (header: jwt.JwtHeader, token?: string): Promise<string> => {
    // Determine which realm to fetch JWKS from
    // Default to KEYCLOAK_REALM (dive-v3-broker), but support multi-realm
    const realm = token ? getRealmFromToken(token) : (process.env.KEYCLOAK_REALM || 'dive-v3-broker');

    // FIX: Try both internal (Docker) and external (localhost) URLs for JWKS
    const jwksUris = [
        `${process.env.KEYCLOAK_URL}/realms/${realm}/protocol/openid-connect/certs`,  // Internal: http://keycloak:8080
        `http://localhost:8081/realms/${realm}/protocol/openid-connect/certs`,        // External: http://localhost:8081
    ];

    logger.debug('Getting signing key for token', {
        kid: header.kid,
        alg: header.alg,
        realm,
        jwksUris,
    });

    if (!header.kid) {
        logger.error('Token header missing kid (key ID)');
        throw new Error('Token header missing kid');
    }

    // Check cache first (keys cached by kid, not realm-specific)
    const cachedKey = jwksCache.get<string>(header.kid);
    if (cachedKey) {
        logger.debug('Using cached JWKS public key', { kid: header.kid, realm });
        return cachedKey;
    }

    // Try to fetch JWKS from each URL until one succeeds
    let lastError: Error | null = null;
    for (const jwksUri of jwksUris) {
        try {
            logger.debug('Attempting to fetch JWKS', { jwksUri, kid: header.kid });

            // Fetch JWKS directly from Keycloak
            const response = await axios.get(jwksUri);
            const jwks = response.data;

            // Find the key with matching kid and use="sig"
            const key = jwks.keys.find((k: any) => k.kid === header.kid && k.use === 'sig');

            if (!key) {
                logger.warn('No matching signing key found in JWKS at this URL', {
                    kid: header.kid,
                    realm,
                    jwksUri,
                    availableKids: jwks.keys.map((k: any) => ({ kid: k.kid, use: k.use, alg: k.alg })),
                });
                continue; // Try next URL
            }

            // Convert JWK to PEM format
            const publicKey = jwkToPem(key);

            // Cache the public key
            jwksCache.set(header.kid, publicKey);

            logger.info('Signing key retrieved successfully', {
                kid: header.kid,
                alg: key.alg,
                realm,
                jwksUri,
                hasKey: !!publicKey,
            });

            return publicKey;
        } catch (error) {
            logger.warn('Failed to fetch signing key from this URL, trying next', {
                kid: header.kid,
                realm,
                jwksUri,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            lastError = error instanceof Error ? error : new Error('Unknown error');
        }
    }

    // If we get here, all URLs failed
    logger.error('Failed to fetch signing key from all URLs', {
        kid: header.kid,
        realm,
        jwksUris,
        lastError: lastError?.message,
    });
    throw new Error(`Failed to fetch signing key for kid: ${header.kid}. Last error: ${lastError?.message}`);
};

/**
 * Verify JWT token with dual-issuer support (multi-realm migration)
 * 
 * Multi-Realm Migration (Oct 21, 2025):
 * - Supports both dive-v3-pilot (legacy single-realm) AND dive-v3-broker (multi-realm federation)
 * - Backward compatible: Existing tokens from dive-v3-pilot still work
 * - Forward compatible: New tokens from dive-v3-broker federation accepted
 * - Dual audience support: dive-v3-client AND dive-v3-client-broker
 */
const verifyToken = async (token: string): Promise<IKeycloakToken> => {
    try {
        // First decode the header to get the kid
        const decoded = jwt.decode(token, { complete: true });
        if (!decoded || !decoded.header) {
            throw new Error('Invalid token format');
        }

        // TEST ENVIRONMENT: Allow HS256 tokens without kid for integration tests
        if (process.env.NODE_ENV === 'test' && decoded.header.alg === 'HS256') {
            logger.debug('Using test mode JWT verification (HS256)', {
                alg: decoded.header.alg,
                iss: (decoded.payload as any).iss,
            });

            const jwtSecret = process.env.JWT_SECRET || 'test-secret';

            // Verify HS256 token with shared secret (test only)
            return new Promise((resolve, reject) => {
                jwt.verify(
                    token,
                    jwtSecret,
                    {
                        algorithms: ['HS256'],
                        // In test mode, accept test issuer
                        issuer: ['https://keycloak.dive-v3.local', `${process.env.KEYCLOAK_URL}/realms/dive-v3-pilot`, `${process.env.KEYCLOAK_URL}/realms/dive-v3-broker`],
                        audience: ['dive-v3-client', 'dive-v3-client-broker', 'account'],
                    },
                    (err: any, decodedToken: any) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(decodedToken as IKeycloakToken);
                        }
                    }
                );
            });
        }

        // PRODUCTION: Require RS256 with kid from JWKS
        // Get the signing key (pass token for realm detection)
        const publicKey = await getSigningKey(decoded.header, token);

        // Multi-realm: Accept tokens from both dive-v3-pilot AND dive-v3-broker
        // Docker networking: Accept both internal (keycloak:8080) AND external (localhost:8081) URLs
        const validIssuers: [string, ...string[]] = [
            `${process.env.KEYCLOAK_URL}/realms/dive-v3-pilot`,    // Internal: dive-v3-pilot
            `${process.env.KEYCLOAK_URL}/realms/dive-v3-broker`,   // Internal: dive-v3-broker
            'http://localhost:8081/realms/dive-v3-pilot',          // External: dive-v3-pilot
            'http://localhost:8081/realms/dive-v3-broker',         // External: dive-v3-broker
        ];

        // Multi-realm: Accept tokens for both clients + Keycloak default audience
        const validAudiences: [string, ...string[]] = [
            'dive-v3-client',         // Legacy client
            'dive-v3-client-broker',  // Multi-realm broker client
            'account',                // Keycloak default audience (ID tokens)
        ];

        // Verify the token with the public key
        return new Promise((resolve, reject) => {
            jwt.verify(
                token,
                publicKey,
                {
                    algorithms: ['RS256'],
                    issuer: validIssuers,      // Array of valid issuers (FAL2 compliant)
                    audience: validAudiences,  // Array of valid audiences (FAL2 compliant)
                },
                (err: any, decoded: any) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(decoded as IKeycloakToken);
                    }
                }
            );
        });
    } catch (error) {
        logger.error('Token verification error', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        throw error;
    }
};

/**
 * Validate AAL2 (Authentication Assurance Level 2) requirements
 * Reference: docs/IDENTITY-ASSURANCE-LEVELS.md Lines 46-94
 * 
 * AAL2 Requirements (NIST SP 800-63B):
 * - Multi-factor authentication (MFA) required
 * - At least 2 authentication factors (something you know + something you have)
 * - ACR (Authentication Context Class Reference) indicates AAL2+
 * - AMR (Authentication Methods Reference) shows 2+ factors
 * 
 * Multi-Realm Note (Oct 21, 2025):
 * - Keycloak sets ACR to numeric values (0=AAL1, 1=AAL2, 2=AAL3)
 * - AMR may be JSON-encoded string from user attributes
 * - Must parse AMR before checking array length
 * 
 * @param token - Decoded Keycloak token
 * @param classification - Resource classification level
 * @throws Error if AAL2 requirements not met for classified resources
 */
const validateAAL2 = (token: IKeycloakToken, classification: string): void => {
    // AAL2 requirement only applies to classified resources
    if (classification === 'UNCLASSIFIED') {
        return;
    }

    // Parse AMR - may be JSON-encoded string from Keycloak mapper
    let amrArray: string[] = [];
    if (token.amr) {
        if (Array.isArray(token.amr)) {
            amrArray = token.amr;
        } else if (typeof token.amr === 'string') {
            try {
                const parsed = JSON.parse(token.amr);
                amrArray = Array.isArray(parsed) ? parsed : [parsed];
            } catch {
                amrArray = [token.amr];
            }
        }
    }

    // Check ACR (Authentication Context Class Reference)
    const acr = String(token.acr || '');

    // AAL2 indicators:
    // - String descriptors: "silver", "aal2", "multi-factor", "gold"
    // - Numeric levels: "1" (AAL2), "2" (AAL3)
    // - URN format: "urn:mace:incommon:iap:silver"
    const isAAL2 =
        acr.includes('silver') ||       // InCommon IAP Silver = AAL2
        acr.includes('aal2') ||          // Explicit AAL2
        acr.includes('multi-factor') ||  // Generic MFA indicator
        acr.includes('gold') ||          // InCommon IAP Gold = AAL3 (also satisfies AAL2)
        acr === '1' ||                   // Keycloak numeric: 1 = AAL2
        acr === '2' ||                   // Keycloak numeric: 2 = AAL3 (satisfies AAL2)
        acr === '3';                     // Keycloak numeric: 3 = AAL3+ (satisfies AAL2)

    // If ACR indicates AAL2+, accept it
    if (isAAL2) {
        logger.debug('AAL2 validation passed via ACR', {
            classification,
            acr,
            amr: amrArray,
            factorCount: amrArray.length
        });
        return;
    }

    // Fallback: Check AMR for 2+ factors (allows AAL2 via MFA even if ACR not set correctly)
    // This handles cases where IdP doesn't set proper ACR but does provide AMR
    if (amrArray.length >= 2) {
        logger.info('AAL2 validated via AMR (2+ factors), despite ACR not matching expected values', {
            classification,
            acr,
            amr: amrArray,
            factorCount: amrArray.length,
            note: 'Accepting based on AMR factors - consider configuring IdP to set proper ACR value'
        });
        return;
    }

    // Reject: Neither ACR nor AMR indicate AAL2
    logger.warn('AAL2 validation failed', {
        classification,
        acr,
        amr: amrArray,
        factorCount: amrArray.length,
        reason: 'Classified resources require AAL2 (MFA)'
    });
    throw new Error(`Classified resources require AAL2 (MFA). Current ACR: ${acr || 'missing'}, AMR factors: ${amrArray.length}`);
};

/**
 * Call OPA for authorization decision
 */
const callOPA = async (input: IOPAInput): Promise<IOPADecision> => {
    try {
        logger.debug('Calling OPA for decision', {
            endpoint: OPA_DECISION_ENDPOINT,
            subject: input.input.subject.uniqueID,
            resource: input.input.resource.resourceId,
        });

        const response = await axios.post<IOPAResponse>(OPA_DECISION_ENDPOINT, input, {
            headers: {
                'Content-Type': 'application/json',
            },
            timeout: 5000, // 5 second timeout
        });

        logger.debug('OPA response received', {
            hasResult: !!response.data.result,
            hasDecision: !!response.data.result?.decision,
            responseStructure: Object.keys(response.data),
            resultStructure: response.data.result ? Object.keys(response.data.result).slice(0, 10) : [],
        });

        // OPA returns the decision nested in result.decision
        // Restructure to match our expected IOPADecision interface
        if (response.data.result && response.data.result.decision) {
            return {
                result: response.data.result.decision,
            };
        }

        // Fallback: if decision not nested, use result directly (shouldn't happen)
        return {
            result: {
                allow: response.data.result?.allow || false,
                reason: response.data.result?.reason || 'No decision',
                obligations: response.data.result?.obligations,
                evaluation_details: response.data.result?.evaluation_details,
            },
        };
    } catch (error) {
        logger.error('OPA call failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
            endpoint: OPA_DECISION_ENDPOINT,
        });
        throw new Error('Authorization service unavailable');
    }
};

/**
 * Log authorization decision
 */
const logDecision = (
    requestId: string,
    uniqueID: string,
    resourceId: string,
    decision: boolean,
    reason: string,
    latencyMs: number
): void => {
    const authzLogger = logger.child({ service: 'authz' });

    authzLogger.info('Authorization decision', {
        timestamp: new Date().toISOString(),
        requestId,
        subject: uniqueID,
        resource: resourceId,
        decision: decision ? 'ALLOW' : 'DENY',
        reason,
        latency_ms: latencyMs,
    });
};

/**
 * JWT Authentication middleware (Week 3.2)
 * Verifies JWT token and attaches user info to request
 * Does NOT call OPA - use for endpoints that need auth but handle authz separately
 */
export const authenticateJWT = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string;

    try {
        // Extract JWT token from Authorization header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            logger.warn('Missing Authorization header', { requestId });
            res.status(401).json({
                error: 'Unauthorized',
                message: 'Missing or invalid Authorization header',
                details: {
                    expected: 'Bearer <token>',
                    received: authHeader ? 'Invalid format' : 'Missing',
                },
                requestId
            });
            return;
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix

        // Verify token
        let decodedToken: IKeycloakToken;
        try {
            decodedToken = await verifyToken(token);
        } catch (error) {
            logger.warn('JWT verification failed', {
                requestId,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            res.status(401).json({
                error: 'Unauthorized',
                message: 'Invalid or expired JWT token',
                details: {
                    reason: error instanceof Error ? error.message : 'Token verification failed',
                },
                requestId
            });
            return;
        }

        // Extract user attributes
        const uniqueID = decodedToken.uniqueID || decodedToken.preferred_username || decodedToken.sub;
        const clearance = decodedToken.clearance;
        const countryOfAffiliation = decodedToken.countryOfAffiliation;

        // Handle acpCOI - Keycloak often double-encodes this as JSON string
        let acpCOI: string[] = [];
        if (decodedToken.acpCOI) {
            if (Array.isArray(decodedToken.acpCOI)) {
                // Check if first element is a JSON-encoded string (Keycloak mapper issue)
                if (decodedToken.acpCOI.length > 0 && typeof decodedToken.acpCOI[0] === 'string') {
                    try {
                        const parsed = JSON.parse(decodedToken.acpCOI[0]);
                        if (Array.isArray(parsed)) {
                            acpCOI = parsed;
                        } else {
                            acpCOI = decodedToken.acpCOI;
                        }
                    } catch {
                        // Not JSON, use as-is
                        acpCOI = decodedToken.acpCOI;
                    }
                } else {
                    acpCOI = decodedToken.acpCOI;
                }
            } else if (typeof decodedToken.acpCOI === 'string') {
                // Single string value - try to parse as JSON
                try {
                    const parsed = JSON.parse(decodedToken.acpCOI);
                    if (Array.isArray(parsed)) {
                        acpCOI = parsed;
                    } else {
                        acpCOI = [decodedToken.acpCOI];
                    }
                } catch {
                    // Not JSON, wrap in array
                    acpCOI = [decodedToken.acpCOI];
                }
            }
        }

        // Attach user info to request
        (req as any).user = {
            sub: decodedToken.sub,
            uniqueID,
            clearance,
            countryOfAffiliation,
            acpCOI,
            email: decodedToken.email,
            preferred_username: decodedToken.preferred_username
        };

        logger.info('JWT authentication successful', {
            requestId,
            uniqueID,
            clearance,
            countryOfAffiliation,
            acpCOI,  // DEBUG: Log COI
            acpCOI_raw: decodedToken.acpCOI  // DEBUG: Log raw COI from token
        });

        next();

    } catch (error) {
        logger.error('Authentication middleware error', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Authentication failed',
            requestId
        });
    }
};

/**
 * PEP Authorization Middleware
 * Enforces ABAC policy via OPA before allowing resource access
 */
export const authzMiddleware = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    const startTime = Date.now();
    const requestId = req.headers['x-request-id'] as string;
    const { id: resourceId } = req.params;

    try {
        // ============================================
        // Step 1: Extract and validate JWT token
        // ============================================

        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            logger.warn('Missing Authorization header', {
                requestId,
                headers: Object.keys(req.headers),
            });
            res.status(401).json({
                error: 'Unauthorized',
                message: 'Missing or invalid Authorization header',
                details: {
                    expected: 'Bearer <token>',
                    received: authHeader ? 'Invalid format' : 'Missing',
                },
            });
            return;
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix

        // Decode token header to check kid (without verification)
        let tokenHeader;
        try {
            const headerPart = token.split('.')[0];
            tokenHeader = JSON.parse(Buffer.from(headerPart, 'base64').toString('utf-8'));
            logger.debug('JWT token header', {
                requestId,
                kid: tokenHeader.kid,
                alg: tokenHeader.alg,
                typ: tokenHeader.typ,
            });
        } catch (e) {
            logger.warn('Could not decode token header', { requestId });
        }

        // Log token format for debugging
        logger.debug('Received JWT token', {
            requestId,
            tokenLength: token.length,
            tokenPrefix: token.substring(0, 20) + '...',
        });

        let decodedToken: IKeycloakToken;
        try {
            decodedToken = await verifyToken(token);
        } catch (error) {
            logger.warn('JWT verification failed', {
                requestId,
                error: error instanceof Error ? error.message : 'Unknown error',
                tokenLength: token.length,
                tokenHeader: tokenHeader,
                keycloakUrl: process.env.KEYCLOAK_URL,
                realm: process.env.KEYCLOAK_REALM,
            });
            res.status(401).json({
                error: 'Unauthorized',
                message: 'Invalid or expired JWT token',
                details: {
                    reason: error instanceof Error ? error.message : 'Token verification failed',
                },
            });
            return;
        }

        // ============================================
        // Step 1.5: Check Token Revocation (Gap #7)
        // ============================================
        // Check if token has been blacklisted (logout or manual revocation)
        const jti = decodedToken.jti;
        if (jti && await isTokenBlacklisted(jti)) {
            logger.warn('Blacklisted token detected', {
                requestId,
                jti,
                sub: decodedToken.sub
            });
            res.status(401).json({
                error: 'Unauthorized',
                message: 'Token has been revoked',
                details: {
                    reason: 'Token was blacklisted (user logged out or token manually revoked)',
                    jti: jti,
                    recommendation: 'Please re-authenticate to obtain a new token'
                },
            });
            return;
        }

        // ============================================
        // Step 2: Extract identity attributes
        // Week 3: Use enriched claims if available (from enrichmentMiddleware)
        // ============================================

        // Check if enrichment middleware ran and provided enriched claims
        const tokenData = (req as any).enrichedUser || decodedToken;
        const wasEnriched = (req as any).wasEnriched || false;

        const uniqueID = tokenData.uniqueID || tokenData.preferred_username || tokenData.sub;

        // Check if all user tokens are revoked (global logout)
        if (await areUserTokensRevoked(uniqueID)) {
            logger.warn('User tokens globally revoked', {
                requestId,
                uniqueID
            });
            res.status(401).json({
                error: 'Unauthorized',
                message: 'User session has been terminated',
                details: {
                    reason: 'All user tokens revoked (logout event or account suspension)',
                    uniqueID: uniqueID,
                    recommendation: 'Please re-authenticate'
                },
            });
            return;
        }
        const clearance = tokenData.clearance;
        const countryOfAffiliation = tokenData.countryOfAffiliation;

        // Handle acpCOI - might be double-encoded from Keycloak mapper
        let acpCOI: string[] = [];
        if (tokenData.acpCOI) {
            if (Array.isArray(tokenData.acpCOI)) {
                // If it's an array, check if first element is a JSON string
                if (tokenData.acpCOI.length > 0 && typeof tokenData.acpCOI[0] === 'string') {
                    try {
                        // Try to parse the first element as JSON (handle double-encoding)
                        const parsed = JSON.parse(tokenData.acpCOI[0]);
                        if (Array.isArray(parsed)) {
                            acpCOI = parsed;
                            logger.debug('Parsed double-encoded acpCOI', { original: tokenData.acpCOI, parsed: acpCOI });
                        } else {
                            acpCOI = tokenData.acpCOI;
                        }
                    } catch {
                        // Not JSON, use as-is
                        acpCOI = tokenData.acpCOI;
                    }
                } else {
                    acpCOI = tokenData.acpCOI;
                }
            } else {
                // Not an array, try to parse as JSON
                try {
                    const parsed = JSON.parse(tokenData.acpCOI as any);
                    acpCOI = Array.isArray(parsed) ? parsed : [parsed];
                } catch {
                    acpCOI = [tokenData.acpCOI as any];
                }
            }
        }

        logger.debug('Extracted identity attributes', {
            requestId,
            uniqueID,
            clearance,
            country: countryOfAffiliation,
            coi: acpCOI,
            coiType: typeof acpCOI,
            coiLength: acpCOI.length,
            wasEnriched,
        });

        // ============================================
        // Step 3: Fetch resource metadata
        // ============================================

        const resource = await getResourceById(resourceId);

        if (!resource) {
            res.status(404).json({
                error: 'Not Found',
                message: `Resource ${resourceId} not found`,
            });
            return;
        }

        // ============================================
        // AAL2/FAL2 Validation (NIST SP 800-63B/C)
        // ============================================
        // Validate AAL2 (Authentication Assurance Level 2) for classified resources
        // This check must happen BEFORE OPA authorization to ensure authentication strength
        // Reference: docs/IDENTITY-ASSURANCE-LEVELS.md
        try {
            const classification = resource && 'ztdf' in resource
                ? resource.ztdf.policy.securityLabel.classification
                : (resource as any)?.classification || 'UNCLASSIFIED';

            validateAAL2(decodedToken, classification);
        } catch (error) {
            logger.warn('AAL2 validation failed', {
                requestId,
                error: error instanceof Error ? error.message : 'Unknown error',
                resourceId,
            });
            res.status(403).json({
                error: 'Forbidden',
                message: 'Authentication strength insufficient',
                details: {
                    reason: error instanceof Error ? error.message : 'AAL2 validation failed',
                    requirement: 'Classified resources require AAL2 (Multi-Factor Authentication)',
                    reference: 'NIST SP 800-63B, IDENTITY-ASSURANCE-LEVELS.md'
                },
            });
            return;
        }

        // ============================================
        // Step 4: Check decision cache
        // ============================================

        const cacheKey = `${uniqueID}:${resourceId}:${clearance}:${countryOfAffiliation}`;
        const cachedDecision = decisionCache.get<IOPADecision>(cacheKey);

        if (cachedDecision) {
            logger.debug('Using cached authorization decision', {
                requestId,
                uniqueID,
                resourceId,
            });

            if (!cachedDecision.result.allow) {
                const latencyMs = Date.now() - startTime;
                logDecision(requestId, uniqueID, resourceId, false, cachedDecision.result.reason, latencyMs);

                // Extract resource metadata for error response
                const isZTDF = resource && 'ztdf' in resource;
                const classification = isZTDF
                    ? resource.ztdf.policy.securityLabel.classification
                    : (resource as any).classification;
                const releasabilityTo = isZTDF
                    ? resource.ztdf.policy.securityLabel.releasabilityTo
                    : (resource as any).releasabilityTo;
                const COI = isZTDF
                    ? (resource.ztdf.policy.securityLabel.COI || [])
                    : ((resource as any).COI || []);

                res.status(403).json({
                    error: 'Forbidden',
                    message: 'Access denied',
                    reason: cachedDecision.result.reason,
                    details: {
                        ...(cachedDecision.result.evaluation_details || {}),
                        subject: {
                            uniqueID,
                            clearance,
                            country: countryOfAffiliation,
                            coi: acpCOI
                        },
                        resource: {
                            resourceId: resource.resourceId,
                            title: resource.title,
                            classification,
                            releasabilityTo,
                            coi: COI
                        }
                    },
                });
                return;
            }

            // Cache hit and allow - continue to resource handler
            next();
            return;
        }

        // ============================================
        // Step 5: Construct OPA input
        // ============================================

        // Extract legacy fields from ZTDF resource
        const isZTDF = resource && 'ztdf' in resource;
        const classification = isZTDF
            ? resource.ztdf.policy.securityLabel.classification
            : (resource as any).classification;

        // NEW: Extract original classification fields (ACP-240 Section 4.3)
        const originalClassification = isZTDF
            ? resource.ztdf.policy.securityLabel.originalClassification
            : undefined;
        const originalCountry = isZTDF
            ? resource.ztdf.policy.securityLabel.originalCountry
            : undefined;
        const natoEquivalent = isZTDF
            ? resource.ztdf.policy.securityLabel.natoEquivalent
            : undefined;

        const releasabilityTo = isZTDF
            ? resource.ztdf.policy.securityLabel.releasabilityTo
            : (resource as any).releasabilityTo;
        const COI = isZTDF
            ? (resource.ztdf.policy.securityLabel.COI || [])
            : ((resource as any).COI || []);
        const coiOperator = isZTDF
            ? (resource.ztdf.policy.securityLabel.coiOperator || 'ALL')
            : ((resource as any).coiOperator || 'ALL');
        const creationDate = isZTDF
            ? resource.ztdf.policy.securityLabel.creationDate
            : (resource as any).creationDate;
        const encrypted = isZTDF ? true : ((resource as any).encrypted || false);

        const opaInput: IOPAInput = {
            input: {
                subject: {
                    authenticated: true,
                    uniqueID,
                    clearance,
                    clearanceOriginal: tokenData.clearanceOriginal || clearance, // NEW: ACP-240 Section 4.3
                    clearanceCountry: tokenData.clearanceCountry || countryOfAffiliation, // NEW: ACP-240 Section 4.3
                    countryOfAffiliation,
                    acpCOI,
                    dutyOrg: tokenData.dutyOrg,      // Gap #4: Organization attribute
                    orgUnit: tokenData.orgUnit,      // Gap #4: Organizational unit
                },
                action: {
                    operation: 'view',
                },
                resource: {
                    resourceId: resource.resourceId,
                    classification,
                    originalClassification,          // NEW: ACP-240 Section 4.3
                    originalCountry,                 // NEW: ACP-240 Section 4.3
                    natoEquivalent,                  // NEW: ACP-240 Section 4.3
                    releasabilityTo,
                    COI,
                    coiOperator,
                    creationDate,
                    encrypted,
                },
                context: {
                    currentTime: new Date().toISOString(),
                    sourceIP: (req.ip || req.socket.remoteAddress || 'unknown'),
                    deviceCompliant: true, // Week 3: Add device compliance check
                    requestId,
                    // AAL2/FAL2 context (NIST SP 800-63B/C) - for OPA policy evaluation
                    acr: decodedToken.acr,        // Authentication Context Class Reference
                    amr: decodedToken.amr,        // Authentication Methods Reference
                    auth_time: decodedToken.auth_time, // Time of authentication
                },
            },
        };

        logger.debug('Constructed OPA input with classification equivalency', {
            requestId,
            subject: opaInput.input.subject.uniqueID,
            resource: opaInput.input.resource.resourceId,
            originalClassification: opaInput.input.resource.originalClassification,
            originalCountry: opaInput.input.resource.originalCountry,
            natoEquivalent: opaInput.input.resource.natoEquivalent,
        });

        // ============================================
        // Step 6: Call OPA for authorization decision
        // ============================================

        let opaDecision: IOPADecision;
        try {
            opaDecision = await callOPA(opaInput);
        } catch (error) {
            logger.error('Failed to get authorization decision', {
                requestId,
                error: error instanceof Error ? error.message : 'Unknown error',
            });

            res.status(503).json({
                error: 'Service Unavailable',
                message: 'Authorization service temporarily unavailable',
                details: {
                    service: 'OPA',
                    endpoint: OPA_DECISION_ENDPOINT,
                },
            });
            return;
        }

        // Validate OPA response structure
        if (!opaDecision || !opaDecision.result) {
            logger.error('Invalid OPA response structure', {
                requestId,
                received: opaDecision,
                expected: 'object with result field',
            });

            res.status(500).json({
                error: 'Internal Server Error',
                message: 'Invalid authorization service response',
                details: {
                    reason: 'OPA returned invalid response structure',
                },
            });
            return;
        }

        // ============================================
        // Step 7: Cache decision
        // ============================================

        decisionCache.set(cacheKey, opaDecision);

        // ============================================
        // Step 8: Log decision (ACP-240 compliance)
        // ============================================

        const latencyMs = Date.now() - startTime;
        logDecision(
            requestId,
            uniqueID,
            resourceId,
            opaDecision.result.allow,
            opaDecision.result.reason,
            latencyMs
        );

        // ACP-240: Log DECRYPT event on successful access
        if (opaDecision.result.allow) {
            const { logDecryptEvent } = await import('../utils/acp240-logger');
            logDecryptEvent({
                requestId,
                subject: uniqueID,
                resourceId,
                classification: classification || 'UNCLASSIFIED',
                releasabilityTo: releasabilityTo || [],
                subjectAttributes: {
                    clearance,
                    countryOfAffiliation,
                    acpCOI
                },
                reason: opaDecision.result.reason,
                latencyMs
            });
        }

        // ============================================
        // Step 9: Enforce decision
        // ============================================

        if (!opaDecision.result.allow) {
            // ACP-240: Log ACCESS_DENIED event
            const { logAccessDeniedEvent } = await import('../utils/acp240-logger');
            logAccessDeniedEvent({
                requestId,
                subject: uniqueID,
                resourceId,
                reason: opaDecision.result.reason,
                subjectAttributes: {
                    clearance,
                    countryOfAffiliation,
                    acpCOI
                },
                resourceAttributes: {
                    classification,
                    releasabilityTo,
                    COI
                },
                policyEvaluation: {
                    allow: false,
                    reason: opaDecision.result.reason,
                    evaluation_details: opaDecision.result.evaluation_details
                },
                latencyMs: Date.now() - startTime
            });

            res.status(403).json({
                error: 'Forbidden',
                message: 'Access denied',
                reason: opaDecision.result.reason,
                details: {
                    ...(opaDecision.result.evaluation_details || {}),
                    subject: {
                        uniqueID,
                        clearance,
                        country: countryOfAffiliation,
                        coi: acpCOI
                    },
                    resource: {
                        resourceId: resource.resourceId,
                        title: resource.title,
                        classification,
                        releasabilityTo,
                        coi: COI
                    }
                },
            });
            return;
        }

        // ============================================
        // Step 10: Check obligations (e.g., KAS)
        // ============================================

        if (opaDecision.result.obligations && opaDecision.result.obligations.length > 0) {
            logger.info('Obligations required', {
                requestId,
                resourceId,
                obligations: opaDecision.result.obligations,
            });

            // Week 4: Handle KAS obligations
            // For now, store obligations in request for handler to process
            (req as any).authzObligations = opaDecision.result.obligations;
        }

        // Access granted - continue to resource handler
        logger.info('Access granted', {
            requestId,
            uniqueID,
            resourceId,
            latency_ms: latencyMs,
        });

        next();
    } catch (error) {
        logger.error('Authorization middleware error', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
        });

        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Authorization check failed',
            details: {
                reason: error instanceof Error ? error.message : 'Unknown error',
            },
        });
    }
};

