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
            acr?: string;
            amr?: string[];
            authTime?: number;
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
    }
}

