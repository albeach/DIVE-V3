import { DefaultSession } from "next-auth";

/**
 * NextAuth Type Extensions for DIVE V3
 * 
 * SECURITY NOTE (2025 Best Practices):
 * - Tokens (idToken, accessToken, refreshToken) are NOT sent to client
 * - These fields exist ONLY for server-side API routes and callbacks
 * - Client session objects only contain user profile data
 * - Token validation happens exclusively server-side
 */

declare module "next-auth" {
    interface Session {
        // ⚠️ DEPRECATED - Server-side only, not sent to client
        // These exist for backward compatibility but should not be used
        idToken?: string;
        refreshToken?: string;
        accessToken?: string;
        
        acr?: string;
        amr?: string[];
        authTime?: number;
        user: {
            id: string;
            uniqueID?: string;
            clearance?: string;
            countryOfAffiliation?: string;
            acpCOI?: string[];
            roles?: string[];
            // AAL/MFA Claims (NIST SP 800-63B) - Added Nov 3, 2025
            acr?: string;           // Authentication Context Class Reference (AAL level)
            amr?: string[];         // Authentication Methods Reference (e.g., ["pwd", "otp"])
            auth_time?: number;     // Unix timestamp of authentication event
        } & DefaultSession["user"];
    }

    interface Profile {
        uniqueID?: string;
        clearance?: string;
        countryOfAffiliation?: string;
        acpCOI?: string[];
    }
}

declare module "next-auth/jwt" {
    interface JWT {
        // Server-side only - used in JWT strategy (not applicable with database strategy)
        idToken?: string;
        refreshToken?: string;
        accessToken?: string;
        uniqueID?: string;
        clearance?: string;
        countryOfAffiliation?: string;
        acpCOI?: string[];
        roles?: string[];
        // AAL/MFA Claims (NIST SP 800-63B) - Added Nov 3, 2025
        acr?: string;           // Authentication Context Class Reference
        amr?: string[];         // Authentication Methods Reference
        auth_time?: number;     // Unix timestamp of authentication event
    }
}
