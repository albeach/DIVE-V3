/**
 * Express Type Extensions
 *
 * Extends Express Request type to include properties
 * added by authentication and authorization middleware.
 */

import { Request } from 'express';

declare global {
    namespace Express {
        interface Request {
            user?: {
                sub: string;
                uniqueID: string;
                clearance?: string;
                countryOfAffiliation?: string;
                acpCOI?: string[];
                email?: string;
                preferred_username?: string;
                roles?: string[];
                role?: string;
                tenant?: string;
                auth_time?: number;
                user_acr?: string;
                user_amr?: string[];
                acr?: string;
                amr?: string[];
                iss?: string;
            };
            enrichedUser?: {
                sub: string;
                uniqueID: string;
                clearance?: string;
                countryOfAffiliation?: string;
                acpCOI?: string[];
                email?: string;
                preferred_username?: string;
                roles?: string[];
                enriched?: boolean;
                enrichments?: string[];
            };
            policyEvaluation?: {
                result: {
                    allow: boolean;
                    reason: string;
                    obligations?: Array<{
                        type: string;
                        resourceId?: string;
                    }>;
                    evaluation_details?: Record<string, unknown>;
                };
            };
            authzObligations?: Array<{
                type: string;
                action: string;
                resourceId: string;
                kaoId?: string;
                kasEndpoint?: string;
                reason: string;
            }>;
            resource?: Record<string, unknown>;
        }
    }
}

export {};
