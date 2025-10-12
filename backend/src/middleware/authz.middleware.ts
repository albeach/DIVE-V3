import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import NodeCache from 'node-cache';
import jwkToPem from 'jwk-to-pem';
import { logger } from '../utils/logger';
import { getResourceById } from '../services/resource.service';

// ============================================
// PEP (Policy Enforcement Point) Middleware
// ============================================
// Week 2: Integrate OPA for ABAC authorization
// Pattern: Validate JWT → Extract attributes → Fetch resource → Call OPA → Enforce decision

// Decision cache (60s TTL)
const decisionCache = new NodeCache({ stdTTL: 60, checkperiod: 120 });

// JWKS cache (1 hour TTL) - cache fetched public keys
const jwksCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });

// OPA endpoint
const OPA_URL = process.env.OPA_URL || 'http://localhost:8181';
const OPA_DECISION_ENDPOINT = `${OPA_URL}/v1/data/dive/authorization`;

/**
 * Interface for JWT payload (Keycloak token)
 */
interface IKeycloakToken {
    sub: string;
    email?: string;
    preferred_username?: string;
    uniqueID?: string;
    clearance?: string;
    countryOfAffiliation?: string;
    acpCOI?: string[];
    exp?: number;
    iat?: number;
}

/**
 * Interface for OPA input
 */
interface IOPAInput {
    input: {
        subject: {
            authenticated: boolean;
            uniqueID: string;
            clearance?: string;
            countryOfAffiliation?: string;
            acpCOI?: string[];
        };
        action: {
            operation: string;
        };
        resource: {
            resourceId: string;
            classification?: string;
            releasabilityTo?: string[];
            COI?: string[];
            creationDate?: string;
            encrypted?: boolean;
        };
        context: {
            currentTime: string;
            sourceIP: string;
            deviceCompliant: boolean;
            requestId: string;
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
 * Get signing key from JWKS
 * Uses direct JWKS fetch instead of jwks-rsa due to compatibility issues
 */
const getSigningKey = async (header: jwt.JwtHeader): Promise<string> => {
    logger.debug('Getting signing key for token', {
        kid: header.kid,
        alg: header.alg,
        jwksUri: `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/certs`,
    });

    if (!header.kid) {
        logger.error('Token header missing kid (key ID)');
        throw new Error('Token header missing kid');
    }

    try {
        // Check cache first
        const cachedKey = jwksCache.get<string>(header.kid);
        if (cachedKey) {
            logger.debug('Using cached JWKS public key', { kid: header.kid });
            return cachedKey;
        }

        // Fetch JWKS directly from Keycloak
        const jwksUrl = `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/certs`;
        const response = await axios.get(jwksUrl);
        const jwks = response.data;

        // Find the key with matching kid and use="sig"
        const key = jwks.keys.find((k: any) => k.kid === header.kid && k.use === 'sig');

        if (!key) {
            logger.error('No matching signing key found in JWKS', {
                kid: header.kid,
                availableKids: jwks.keys.map((k: any) => ({ kid: k.kid, use: k.use, alg: k.alg })),
            });
            throw new Error(`No signing key found for kid: ${header.kid}`);
        }

        // Convert JWK to PEM format
        const publicKey = jwkToPem(key);

        // Cache the public key
        jwksCache.set(header.kid, publicKey);

        logger.debug('Signing key retrieved successfully', {
            kid: header.kid,
            alg: key.alg,
            hasKey: !!publicKey,
        });

        return publicKey;
    } catch (error) {
        logger.error('Failed to fetch signing key', {
            kid: header.kid,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        throw error;
    }
};

/**
 * Verify JWT token
 */
const verifyToken = async (token: string): Promise<IKeycloakToken> => {
    try {
        // First decode the header to get the kid
        const decoded = jwt.decode(token, { complete: true });
        if (!decoded || !decoded.header) {
            throw new Error('Invalid token format');
        }

        // Get the signing key
        const publicKey = await getSigningKey(decoded.header);

        // Verify the token with the public key
        return new Promise((resolve, reject) => {
            jwt.verify(
                token,
                publicKey,
                {
                    algorithms: ['RS256'],
                    issuer: `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}`,
                },
                (err, decoded) => {
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
        // Step 2: Extract identity attributes
        // Week 3: Use enriched claims if available (from enrichmentMiddleware)
        // ============================================

        // Check if enrichment middleware ran and provided enriched claims
        const tokenData = (req as any).enrichedUser || decodedToken;
        const wasEnriched = (req as any).wasEnriched || false;

        const uniqueID = tokenData.uniqueID || tokenData.preferred_username || tokenData.sub;
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

                res.status(403).json({
                    error: 'Forbidden',
                    message: 'Access denied',
                    reason: cachedDecision.result.reason,
                    details: cachedDecision.result.evaluation_details || {},
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
        const releasabilityTo = isZTDF
            ? resource.ztdf.policy.securityLabel.releasabilityTo
            : (resource as any).releasabilityTo;
        const COI = isZTDF
            ? (resource.ztdf.policy.securityLabel.COI || [])
            : ((resource as any).COI || []);
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
                    countryOfAffiliation,
                    acpCOI,
                },
                action: {
                    operation: 'view',
                },
                resource: {
                    resourceId: resource.resourceId,
                    classification,
                    releasabilityTo,
                    COI,
                    creationDate,
                    encrypted,
                },
                context: {
                    currentTime: new Date().toISOString(),
                    sourceIP: (req.ip || req.socket.remoteAddress || 'unknown'),
                    deviceCompliant: true, // Week 3: Add device compliance check
                    requestId,
                },
            },
        };

        logger.debug('Constructed OPA input', {
            requestId,
            subject: opaInput.input.subject.uniqueID,
            resource: opaInput.input.resource.resourceId,
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
                details: opaDecision.result.evaluation_details || {},
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

