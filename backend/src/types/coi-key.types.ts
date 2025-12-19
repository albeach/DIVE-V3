/**
 * COI Key Types
 * 
 * Centralized type definitions for Community of Interest (COI) Keys
 * management system with MongoDB persistence.
 * 
 * Date: October 21, 2025
 */

/**
 * COI Key Entry (Database Schema)
 * 
 * Represents a Community of Interest with its metadata,
 * member countries, and encryption key information.
 */
export interface ICOIKey {
    /** Unique COI identifier (e.g., 'FVEY', 'NATO-COSMIC') */
    coiId: string;

    /** Human-readable name */
    name: string;

    /** Detailed description of the COI */
    description: string;

    /** ISO 3166-1 alpha-3 country codes that are members of this COI */
    memberCountries: string[];

    /** Status of this COI key */
    status: 'active' | 'deprecated' | 'pending';

    /** Color for UI display (hex code) */
    color: string;

    /** Icon emoji for UI display */
    icon: string;

    /** Number of resources using this COI (computed) */
    resourceCount: number;

    /** Encryption algorithm used */
    algorithm: 'AES-256-GCM';

    /** Key version for rotation support */
    keyVersion: number;

    /** Whether this COI is mutually exclusive with others */
    mutuallyExclusiveWith?: string[];

    /** Whether this COI is a subset/superset of another */
    subsetOf?: string;
    supersetOf?: string[];

    /** Creation timestamp */
    createdAt: Date;

    /** Last update timestamp */
    updatedAt: Date;
}

/**
 * COI Key Creation Request (API Input)
 */
export interface ICreateCOIKeyRequest {
    coiId: string;
    name: string;
    description: string;
    memberCountries: string[];
    status?: 'active' | 'deprecated' | 'pending';
    color?: string;
    icon?: string;
    mutuallyExclusiveWith?: string[];
    subsetOf?: string;
    supersetOf?: string[];
}

/**
 * COI Key Update Request (API Input)
 */
export interface IUpdateCOIKeyRequest {
    name?: string;
    description?: string;
    memberCountries?: string[];
    status?: 'active' | 'deprecated' | 'pending';
    color?: string;
    icon?: string;
    mutuallyExclusiveWith?: string[];
    subsetOf?: string;
    supersetOf?: string[];
}

/**
 * COI Key List Response
 */
export interface ICOIKeyListResponse {
    cois: ICOIKey[];
    total: number;
}

/**
 * COI Validation Metadata
 * Used for backwards compatibility with existing validation service
 */
export interface ICOIMembershipMap {
    [coiId: string]: Set<string>;
}
