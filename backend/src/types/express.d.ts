/**
 * Express Type Extensions
 * 
 * Extends Express Request type to include user property
 * added by authentication middleware
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
            };
        }
    }
}

export {};
