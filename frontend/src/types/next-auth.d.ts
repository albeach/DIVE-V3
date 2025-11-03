import { DefaultSession } from "next-auth";

declare module "next-auth" {
    interface Session {
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

