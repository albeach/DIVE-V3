/**
 * Clearance Mapper Service
 *
 * Maps national clearance levels to standardized DIVE clearance levels
 * Required for multi-realm MFA enforcement
 *
 * Phase 2: MongoDB SSOT Integration (with static fallback)
 * Date: 2026-01-04 (Updated)
 */

import { logger } from '../utils/logger';
import { getDb } from '../utils/mongodb-singleton';
import { ClearanceEquivalencyDBService } from './clearance-equivalency-db.service';

// MongoDB service instance (lazy-loaded)
let dbService: ClearanceEquivalencyDBService | null = null;
let dbServiceInitialized = false;

/**
 * Standardized DIVE clearance levels
 * These are used for MFA enforcement and authorization decisions
 */
export type DiveClearanceLevel =
    | 'UNCLASSIFIED'
    | 'RESTRICTED'
    | 'CONFIDENTIAL'
    | 'SECRET'
    | 'TOP_SECRET';

/**
 * National clearance systems
 * Extended to support all 32 NATO members + partners
 */
export type NationalClearanceSystem =
    // Existing (10)
    | 'USA'       // United States
    | 'FRA'       // France
    | 'CAN'       // Canada
    | 'GBR'       // United Kingdom
    | 'DEU'       // Germany
    | 'ITA'       // Italy
    | 'ESP'       // Spain
    | 'POL'       // Poland
    | 'NLD'       // Netherlands
    | 'INDUSTRY'  // Industry partners
    // NEW - 22 NATO Members (Phase 1)
    | 'ALB'       // Albania
    | 'BEL'       // Belgium
    | 'BGR'       // Bulgaria
    | 'CZE'       // Czech Republic
    | 'DNK'       // Denmark
    | 'EST'       // Estonia
    | 'FIN'       // Finland
    | 'GRC'       // Greece
    | 'HRV'       // Croatia
    | 'HUN'       // Hungary
    | 'ISL'       // Iceland
    | 'LTU'       // Lithuania
    | 'LUX'       // Luxembourg
    | 'LVA'       // Latvia
    | 'MKD'       // North Macedonia
    | 'MNE'       // Montenegro
    | 'NOR'       // Norway
    | 'NZL'       // New Zealand (Five Eyes partner)
    | 'PRT'       // Portugal
    | 'ROU'       // Romania
    | 'SVK'       // Slovakia
    | 'SVN'       // Slovenia
    | 'SWE'       // Sweden
    | 'TUR';      // Turkey

/**
 * Clearance mapping entry
 */
export interface IClearanceMapping {
    standardLevel: DiveClearanceLevel;
    nationalEquivalents: Record<string, string[]>;
    mfaRequired: boolean;
    description: string;
}

/**
 * Comprehensive clearance equivalency table
 *
 * Based on NATO STANAG 4774, bilateral security agreements,
 * and national security classification systems
 */
export const CLEARANCE_EQUIVALENCY_TABLE: IClearanceMapping[] = [
    // Level 0: Unclassified
    {
        standardLevel: 'UNCLASSIFIED',
        nationalEquivalents: {
            // Existing (10) — includes normalization variants (underscores, accents, colloquial)
            USA: ['UNCLASSIFIED', 'U'],
            FRA: ['NON CLASSIFIÉ', 'NON CLASSIFIE', 'NON_CLASSIFIE', 'NON PROTÉGÉ', 'NON_PROTEGE', 'NON PROTEGE'],
            CAN: ['UNCLASSIFIED', 'U'],
            GBR: ['UNCLASSIFIED', 'PROTECT'],
            DEU: ['OFFEN'],
            ITA: ['NON CLASSIFICATO', 'NON_CLASSIFICATO'],
            ESP: ['NO CLASIFICADO', 'NO_CLASIFICADO', 'SIN CLASIFICAR'],
            POL: ['NIEJAWNE', 'JAWNY'],
            NLD: ['NIET-GERUBRICEERD', 'NIET GERUBRICEERD', 'NIET_GERUBRICEERD'],
            INDUSTRY: ['UNCLASSIFIED', 'PUBLIC'],
            // NEW - 22 NATO Members
            ALB: ['JOSEKRET', 'I PAKONTROLLUAR'],
            BEL: ['NIET GERUBRICEERD', 'NON CLASSIFIÉ'],  // Dutch/French bilingual
            BGR: ['НЕСЕКРЕТНО', 'NESEKRETNO'],  // Cyrillic + Latin
            CZE: ['NEUNTAJOVANÉ'],
            DNK: ['OFFENTLIG'],
            EST: ['AVALIK'],
            FIN: ['JULKINEN', 'OFFENTLIG'],  // Finnish/Swedish bilingual
            GRC: ['ΑΔΙΑΒΆΘΜΗΤΟ', 'ADIAVÁTHMITO'],  // Greek + Latin
            HRV: ['JAVNO'],
            HUN: ['NYÍLT', 'NYILT'],  // With/without diacritic
            ISL: ['ÓTRÚNAÐARMÁL', 'OTRUNDARMÁL'],  // With/without diacritic
            LTU: ['NESLAPTAI'],
            LUX: ['NON CLASSIFIÉ', 'NICHT KLASSIFIZIERT', 'NET KLASSÉIERT'],  // French/German/Luxembourgish
            LVA: ['NESLEPENI'],
            MKD: ['НЕСЕКРЕТНО', 'NESEKRETNO'],  // Cyrillic + Latin
            MNE: ['НЕСЕКРЕТНО', 'NESEKRETNO'],  // Cyrillic + Latin (Serbian)
            NOR: ['OFFENTLIG'],
            NZL: ['UNCLASSIFIED'],
            PRT: ['NÃO CLASSIFICADO', 'NAO CLASSIFICADO'],  // With/without tilde
            ROU: ['NESECREAT'],
            SVK: ['NEKLASIFIKOVANÉ', 'NEKLASIFIKOVANE'],  // With/without diacritic
            SVN: ['NEZAVAROVANO'],
            SWE: ['OFFENTLIG'],
            TUR: ['GİZLİLİK DERECESİ YOK', 'GIZLILIK DERECESI YOK']  // With/without diacritic
        },
        mfaRequired: false,
        description: 'Public or unclassified information'
    },

    // Level 0.5: Restricted (AAL1 like UNCLASSIFIED, but separate clearance level)
    // CRITICAL: RESTRICTED is above UNCLASSIFIED in the hierarchy
    // - UNCLASSIFIED users CANNOT access RESTRICTED content
    // - RESTRICTED users CAN access UNCLASSIFIED content
    // - Both remain AAL1 (no MFA required)
    {
        standardLevel: 'RESTRICTED',
        nationalEquivalents: {
            // Existing (10) — includes normalization variants
            USA: ['RESTRICTED', 'FOUO', 'FOR OFFICIAL USE ONLY'],
            FRA: ['DIFFUSION RESTREINTE', 'DIFFUSION_RESTREINTE', 'RESTREINT'],
            CAN: ['PROTECTED A', 'PROTECTED-A', 'PROTECTED_A'],
            GBR: ['OFFICIAL', 'OFFICIAL-SENSITIVE', 'OFFICIAL SENSITIVE', 'OFFICIAL_SENSITIVE', 'RESTRICTED'],
            DEU: ['VS-NUR FÜR DEN DIENSTGEBRAUCH', 'VS-NUR FUR DEN DIENSTGEBRAUCH', 'VS-NFD', 'VS-NUR_FÜR_DEN_DIENSTGEBRAUCH'],
            ITA: ['USO UFFICIALE', 'AD USO UFFICIALE'],
            ESP: ['DIFUSIÓN LIMITADA', 'DIFUSION LIMITADA', 'DIFUSION_LIMITADA'],
            POL: ['UŻYTEK SŁUŻBOWY', 'UZYTEK SLUZBOWY'],
            NLD: ['DEPARTEMENTAAL VERTROUWELIJK', 'DEPARTEMENTAAL_VERTROUWELIJK'],
            INDUSTRY: ['INTERNAL', 'INTERNAL USE ONLY', 'INTERNAL_USE_ONLY'],
            // NEW - 22 NATO Members
            ALB: ['KUFIZUAR', 'I KUFIZUAR'],
            BEL: ['BEPERKTE VERSPREIDING', 'DIFFUSION RESTREINTE'],  // Dutch/French
            BGR: ['ОГРАНИЧЕН', 'OGRANICHEN'],  // Cyrillic + Latin
            CZE: ['OMEZENÉ ŠÍŘENÍ', 'OMEZENE SIRENI'],  // With/without diacritics
            DNK: ['BEGRÆNSET', 'BEGRAENSET'],  // With/without diacritic
            EST: ['PIIRATUD'],
            FIN: ['RAJOITETTU', 'BEGRÄNSAD'],  // Finnish/Swedish
            GRC: ['ΠΕΡΙΟΡΙΣΜΈΝΟ', 'PERIORISMENO'],  // Greek + Latin
            HRV: ['OGRANIČENO', 'OGRANICENO'],  // With/without diacritic
            HUN: ['KORLÁTOZOTT TERJESZTÉSŰ', 'KORLATOZOTT TERJESZTESU'],  // With/without diacritics
            ISL: ['TAKMARKAÐ', 'TAKMARKAD'],  // With/without diacritic
            LTU: ['RIBOTA SKLAIDA'],
            LUX: ['DIFFUSION RESTREINTE', 'BESCHRÄNKTE VERBREITUNG', 'VERBREEDUNG LIMITÉIERT'],  // French/German/Lux
            LVA: ['IEROBEŽOTS'],
            MKD: ['ОГРАНИЧЕНО', 'OGRANIČENO'],  // Cyrillic + Latin
            MNE: ['ОГРАНИЧЕНО', 'OGRANIČENO'],  // Cyrillic + Latin
            NOR: ['BEGRENSET'],
            NZL: ['RESTRICTED', 'IN CONFIDENCE'],
            PRT: ['DIFUSÃO LIMITADA', 'DIFUSAO LIMITADA'],  // With/without tilde
            ROU: ['DIFUZARE LIMITATĂ', 'DIFUZARE LIMITATA'],  // With/without diacritic
            SVK: ['VYHRADENÉ', 'VYHRADENE'],  // With/without diacritic
            SVN: ['INTERNO'],
            SWE: ['BEGRÄNSAD', 'BEGRANSAD'],  // With/without diacritic
            TUR: ['HİZMETE ÖZEL', 'HIZMETE OZEL', 'KISITLI']  // With/without diacritic
        },
        mfaRequired: false,
        description: 'Limited distribution, official use only (AAL1, but above UNCLASSIFIED)'
    },

    // Level 2: Confidential
    {
        standardLevel: 'CONFIDENTIAL',
        nationalEquivalents: {
            // Existing (10) — includes normalization variants
            USA: ['CONFIDENTIAL', 'C'],
            FRA: [
                'CONFIDENTIEL',
                'CONFIDENTIEL DÉFENSE',
                'CONFIDENTIEL DEFENSE',
                'CONFIDENTIEL-DÉFENSE',
                'CONFIDENTIEL-DEFENSE',
                'CONFIDENTIEL_DEFENSE',
                'CONFIDENTIAL'
            ],
            CAN: ['CONFIDENTIAL', 'PROTECTED B', 'PROTECTED-B', 'PROTECTED_B'],
            GBR: ['CONFIDENTIAL'],
            DEU: ['VS-VERTRAULICH', 'VERTRAULICH'],
            ITA: ['RISERVATO', 'RISERVATISSIMO'],
            ESP: ['CONFIDENCIAL'],
            POL: ['ZASTRZEŻONE', 'ZASTRZEZONY', 'ZASTRZEZIONE', 'POUFNE'],
            NLD: ['VERTROUWELIJK'],
            INDUSTRY: ['CONFIDENTIAL', 'PROPRIETARY', 'COMPANY_CONFIDENTIAL'],
            // NEW - 22 NATO Members
            ALB: ['KONFIDENCIAL', 'I FSHEHTË SHËRBIMI'],  // Albanian
            BEL: ['VERTROUWELIJK', 'CONFIDENTIEL'],  // Dutch/French
            BGR: ['ПОВЕРИТЕЛНО', 'POVERITELNO'],  // Cyrillic + Latin
            CZE: ['DŮVĚRNÉ', 'DUVERNÉ'],  // With/without diacritics
            DNK: ['FORTROLIGT'],
            EST: ['KONFIDENTSIAALNE'],
            FIN: ['LUOTTAMUKSELLINEN', 'KONFIDENTIELL'],  // Finnish/Swedish
            GRC: ['ΕΜΠΙΣΤΕΥΤΙΚΌ', 'EMPISTEFTIKO'],  // Greek + Latin
            HRV: ['POVJERLJIVO'],
            HUN: ['BIZALMAS'],
            ISL: ['TRÚNAÐARMÁL', 'TRUNADARMÁL'],  // With/without diacritic
            LTU: ['KONFIDENCIALU'],
            LUX: ['CONFIDENTIEL', 'VERTRAULICH', 'VERTRAUENSVÄERDEG'],  // French/German/Lux
            LVA: ['KONFIDENCIĀLS', 'KONFIDENCIALS'],  // With/without diacritic
            MKD: ['ДОВЕРЛИВО', 'DOVERЛIVO'],  // Cyrillic + Latin
            MNE: ['ПОВЕРЉИВО', 'POVERLJIVO'],  // Cyrillic + Latin
            NOR: ['KONFIDENSIELT'],
            NZL: ['CONFIDENTIAL'],
            PRT: ['CONFIDENCIAL'],
            ROU: ['CONFIDENȚIAL', 'CONFIDENTIAL'],  // With/without diacritic
            SVK: ['DÔVERNÉ', 'DOVERNE'],  // With/without diacritic
            SVN: ['ZAUPNO'],
            SWE: ['KONFIDENTIELL'],  // Swedish for confidential
            TUR: ['ÖZEL', 'OZEL', 'GİZLİ DERECELİ']  // With/without diacritic
        },
        mfaRequired: true,
        description: 'Information requiring protection'
    },

    // Level 2: Secret
    {
        standardLevel: 'SECRET',
        nationalEquivalents: {
            // Existing (10) — includes normalization variants
            USA: ['SECRET', 'S'],
            FRA: [
                'SECRET',
                'SECRET DÉFENSE',
                'SECRET DEFENSE',
                'SECRET-DÉFENSE',
                'SECRET-DEFENSE',
                'SECRET_DEFENSE'
            ],
            CAN: ['SECRET', 'PROTECTED C', 'PROTECTED-C'],
            GBR: ['SECRET'],
            DEU: ['GEHEIM', 'VS-GEHEIM'],
            ITA: ['SEGRETO'],
            ESP: ['SECRETO'],
            POL: ['TAJNE', 'TAJNY'],
            NLD: ['GEHEIM'],
            INDUSTRY: ['SECRET', 'TRADE SECRET', 'SENSITIVE'],
            // NEW - 22 NATO Members
            ALB: ['SEKRET', 'I FSHEHTË'],  // Albanian
            BEL: ['GEHEIM', 'SECRET'],  // Dutch/French
            BGR: ['СЕКРЕТНО', 'SEKRETNO'],  // Cyrillic + Latin
            CZE: ['TAJNÉ', 'TAJNE'],  // With/without diacritic
            DNK: ['HEMMELIGT'],
            EST: ['SALAJANE'],
            FIN: ['SALAINEN', 'HEMLIG'],  // Finnish/Swedish
            GRC: ['ΑΠΌΡΡΗΤΟ', 'APORRETO'],  // Greek + Latin
            HRV: ['TAJNO'],
            HUN: ['TITKOS'],
            ISL: ['LEYNDARMÁL', 'LEYNDARMAL'],  // With/without diacritic
            LTU: ['SLAPTAI'],
            LUX: ['SECRET', 'GEHEIM'],  // French/German
            LVA: ['SLEPENS'],
            MKD: ['ТАЈНО', 'TAJNO'],  // Cyrillic + Latin
            MNE: ['ТАЈНО', 'TAJNO'],  // Cyrillic + Latin
            NOR: ['HEMMELIG'],
            NZL: ['SECRET'],
            PRT: ['SECRETO'],
            ROU: ['SECRET'],
            SVK: ['TAJNÉ', 'TAJNE'],  // With/without diacritic
            SVN: ['TAJNO'],
            SWE: ['HEMLIG'],
            TUR: ['GİZLİ', 'GIZLI']  // With/without diacritic
        },
        mfaRequired: true,
        description: 'Sensitive information requiring strict protection'
    },

    // Level 3: Top Secret
    {
        standardLevel: 'TOP_SECRET',
        nationalEquivalents: {
            // Existing (10) — includes normalization variants
            USA: ['TOP SECRET', 'TS', 'TOP_SECRET'],
            FRA: [
                'TRÈS SECRET',
                'TRÈS SECRET DÉFENSE',
                'TRES SECRET DEFENSE',
                'TRÈS-SECRET-DÉFENSE',
                'TRES-SECRET-DEFENSE',
                'TRES_SECRET_DEFENSE',
                'TOP SECRET'
            ],
            CAN: ['TOP SECRET', 'TS', 'TOP_SECRET'],
            GBR: ['TOP SECRET', 'TS'],
            DEU: ['STRENG GEHEIM', 'STRENG_GEHEIM', 'STRENGGEHEIM'],
            ITA: ['SEGRETISSIMO'],
            ESP: ['ALTO SECRETO', 'ALTO_SECRETO'],
            POL: ['ŚCIŚLE TAJNE', 'SCISLE TAJNE', 'ŚCIŚLE_TAJNY', 'SCISLE TAJNY'],
            NLD: ['ZEER GEHEIM', 'ZEER_GEHEIM', 'STGGEHEIM'],
            INDUSTRY: ['TOP SECRET', 'HIGHLY CONFIDENTIAL', 'HIGHLY_SENSITIVE', 'HIGHLY SENSITIVE'],
            // NEW - 22 NATO Members
            ALB: ['TEPËR SEKRET', 'TEPER SEKRET', 'SHUMË I FSHEHTË'],  // Albanian (with/without diacritics)
            BEL: ['ZEER GEHEIM', 'TRÈS SECRET'],  // Dutch/French
            BGR: ['СТРОГО СЕКРЕТНО', 'STROGO SEKRETNO'],  // Cyrillic + Latin
            CZE: ['PŘÍSNĚ TAJNÉ', 'PRISNE TAJNE'],  // With/without diacritics
            DNK: ['YDERST HEMMELIGT'],
            EST: ['TÄIESTI SALAJANE', 'TAIESTI SALAJANE'],  // With/without diacritic
            FIN: ['ERITTÄIN SALAINEN', 'ERITTAIN SALAINEN', 'HÖGST HEMLIG'],  // Finnish (with/without ä) + Swedish
            GRC: ['ΆΚΡΩΣ ΑΠΌΡΡΗΤΟ', 'AKROS APORRETO'],  // Greek + Latin
            HRV: ['VRLO TAJNO'],
            HUN: ['SZIGORÚAN TITKOS', 'SZIGORUAN TITKOS'],  // With/without diacritic
            ISL: ['ALGJÖRT LEYNDARMÁL', 'ALGJORT LEYNDARMAL'],  // With/without diacritics
            LTU: ['VISIŠKAI SLAPTAI', 'VISISKAI SLAPTAI'],  // With/without diacritic
            LUX: ['TRÈS SECRET', 'STRENG GEHEIM', 'GANZ GEHEIM'],  // French/German variations
            LVA: ['SEVIŠĶI SLEPENS', 'SEVISKI SLEPENS'],  // With/without diacritic
            MKD: ['СТРОГО ДОВЕРЛИВО', 'STROGO DOVERЛIVO'],  // Cyrillic + Latin
            MNE: ['СТРОГО ПОВЕРЉИВО', 'STROGO POVERLJIVO'],  // Cyrillic + Latin
            NOR: ['STRENGT HEMMELIG'],
            NZL: ['TOP SECRET', 'TS'],
            PRT: ['MUITO SECRETO'],
            ROU: ['STRICT SECRET'],
            SVK: ['PRÍSNE TAJNÉ', 'PRISNE TAJNE'],  // With/without diacritic
            SVN: ['STROGO TAJNO'],
            SWE: ['KVALIFICERAT HEMLIG'],
            TUR: ['ÇOK GİZLİ', 'COK GIZLI']  // With/without diacritics
        },
        mfaRequired: true,
        description: 'Highly sensitive information requiring maximum protection'
    }
];

/**
 * Feature flag for MongoDB SSOT
 * Enabled by default — MongoDB is the runtime SSOT for clearance mappings.
 * The static TypeScript table is the seed source and fallback.
 * Disable with CLEARANCE_DB_ENABLED=false if MongoDB is unavailable.
 */
const USE_MONGODB = process.env.CLEARANCE_DB_ENABLED !== 'false';

/**
 * Get or create MongoDB service instance
 * Lazy initialization to avoid startup dependencies
 */
async function getDBService(): Promise<ClearanceEquivalencyDBService | null> {
    if (!USE_MONGODB) {
        return null;
    }

    if (!dbServiceInitialized) {
        try {
            // Use singleton connection instead of creating new client
            const db = getDb();

            dbService = new ClearanceEquivalencyDBService(db);
            // Auto-seed: ensure clearance_equivalency collection is populated from SSOT table.
            // initialize() is idempotent — skips if collection already has data.
            await dbService.initialize();
            dbServiceInitialized = true;
            logger.info('MongoDB clearance equivalency service initialized', {
                enabled: true,
                mode: 'ssot'
            });
        } catch (error) {
            logger.error('Failed to initialize MongoDB clearance service', {
                error: error instanceof Error ? error.message : String(error),
                fallback: 'static-mappings'
            });
            dbServiceInitialized = true; // Prevent retry loops
            dbService = null;
        }
    }

    return dbService;
}

/**
 * Map national clearance level to DIVE standard clearance (Async version with MongoDB SSOT)
 *
 * Phase 2: Uses MongoDB SSOT with static fallback
 *
 * Priority:
 * 1. MongoDB (if enabled via CLEARANCE_DB_ENABLED=true)
 * 2. Static TypeScript table (fallback)
 *
 * @param nationalClearance - National clearance level
 * @param country - ISO 3166 alpha-3 country code
 * @returns DIVE standard clearance level
 */
export async function mapNationalClearanceAsync(
    nationalClearance: string,
    country: NationalClearanceSystem
): Promise<DiveClearanceLevel> {
    // Try MongoDB first (if enabled)
    if (USE_MONGODB) {
        try {
            const service = await getDBService();
            if (service) {
                const result = await service.getNationalMapping(nationalClearance, country);
                logger.debug('Clearance mapped via MongoDB', {
                    nationalClearance,
                    country,
                    result,
                    source: 'mongodb'
                });
                return result;
            }
        } catch (error) {
            logger.warn('MongoDB clearance lookup failed, falling back to static', {
                error: error instanceof Error ? error.message : String(error),
                nationalClearance,
                country
            });
            // Fall through to static fallback
        }
    }

    // Fallback to static TypeScript table
    return mapNationalClearanceStatic(nationalClearance, country);
}

/**
 * Map national clearance level to DIVE standard clearance (Synchronous version)
 *
 * DEPRECATED in favor of mapNationalClearanceAsync() for MongoDB support
 * Kept for backwards compatibility
 *
 * @deprecated Use mapNationalClearanceAsync() for MongoDB SSOT support
 */
export function mapNationalClearance(
    nationalClearance: string,
    country: NationalClearanceSystem
): DiveClearanceLevel {
    return mapNationalClearanceStatic(nationalClearance, country);
}

/**
 * Map national clearance to DIVE standard (Static TypeScript table)
 *
 * Internal function used as fallback when MongoDB is unavailable
 * Also used by synchronous mapNationalClearance() for backwards compatibility
 * Map national clearance to DIVE standard (Static TypeScript table)
 *
 * Internal function used as fallback when MongoDB is unavailable
 * Also used by synchronous mapNationalClearance() for backwards compatibility
 *
 * Handles both national-specific labels and NATO standard labels.
 * Case-insensitive matching with support for multiple formats.
 *
 * @param nationalClearance - National clearance level (e.g., "CONFIDENTIEL DÉFENSE")
 * @param country - ISO 3166 alpha-3 country code (e.g., "FRA")
 * @returns DIVE standard clearance level
 */
function mapNationalClearanceStatic(
    nationalClearance: string,
    country: NationalClearanceSystem
): DiveClearanceLevel {
    // Handle null/undefined/empty
    if (!nationalClearance || nationalClearance.trim() === '') {
        logger.warn('Empty clearance provided, defaulting to UNCLASSIFIED', { country });
        return 'UNCLASSIFIED';
    }

    // Normalize input - collapse multiple spaces
    const normalized = nationalClearance.trim().replace(/\s+/g, ' ').toUpperCase();

    logger.debug('Mapping national clearance', {
        nationalClearance,
        country,
        normalized
    });

    // Search equivalency table
    for (const mapping of CLEARANCE_EQUIVALENCY_TABLE) {
        const countryEquivalents = mapping.nationalEquivalents[country] || [];

        for (const equivalent of countryEquivalents) {
            if (equivalent.toUpperCase() === normalized) {
                logger.info('Clearance mapped successfully', {
                    nationalClearance,
                    country,
                    standardLevel: mapping.standardLevel
                });

                return mapping.standardLevel;
            }
        }
    }

    // Fallback: Check if it's already a standard level
    const standardLevels: DiveClearanceLevel[] = [
        'UNCLASSIFIED',
        'RESTRICTED',
        'CONFIDENTIAL',
        'SECRET',
        'TOP_SECRET'
    ];

    for (const level of standardLevels) {
        if (level === normalized || level.replace('_', ' ') === normalized) {
            logger.info('Clearance already in standard format', {
                nationalClearance,
                standardLevel: level
            });
            return level;
        }
    }

    // Ultimate fallback: return UNCLASSIFIED and log warning
    logger.warn('Unknown clearance level, defaulting to UNCLASSIFIED', {
        nationalClearance,
        country,
        normalized
    });

    return 'UNCLASSIFIED';
}

/**
 * Check if MFA is required for a given clearance level
 *
 * @param clearance - DIVE standard clearance level
 * @returns true if MFA required, false otherwise
 */
export function isMFARequired(clearance: DiveClearanceLevel): boolean {
    const mapping = CLEARANCE_EQUIVALENCY_TABLE.find(
        m => m.standardLevel === clearance
    );

    return mapping?.mfaRequired ?? true;  // Default to true for safety
}

/**
 * Get all national equivalents for a DIVE clearance level
 *
 * @param standardLevel - DIVE standard clearance level
 * @param country - ISO 3166 alpha-3 country code (optional, returns all if not specified)
 * @returns Array of national clearance equivalents
 */
export function getNationalEquivalents(
    standardLevel: DiveClearanceLevel,
    country?: NationalClearanceSystem
): string[] {
    const mapping = CLEARANCE_EQUIVALENCY_TABLE.find(
        m => m.standardLevel === standardLevel
    );

    if (!mapping) {
        return [];
    }

    if (country) {
        return mapping.nationalEquivalents[country] || [];
    }

    // Return all equivalents from all countries
    return Object.values(mapping.nationalEquivalents).flat();
}

/**
 * Map clearance from Keycloak token attribute (Async version with MongoDB SSOT)
 *
 * Phase 2: Uses MongoDB SSOT with static fallback
 *
 * Handles various formats and provides realm-specific mapping
 *
 * @param clearanceAttribute - Clearance from Keycloak token
 * @param realmName - Keycloak realm name (e.g., "dive-v3-fra")
 * @returns DIVE standard clearance level
 */
export async function mapClearanceFromTokenAsync(
    clearanceAttribute: string | string[] | undefined,
    realmName: string
): Promise<DiveClearanceLevel> {
    // Handle undefined or empty
    if (!clearanceAttribute ||
        (Array.isArray(clearanceAttribute) && clearanceAttribute.length === 0)) {
        logger.warn('No clearance attribute in token, defaulting to UNCLASSIFIED', {
            realmName
        });
        return 'UNCLASSIFIED';
    }

    // Handle array (Keycloak sometimes returns arrays)
    const clearanceValue = Array.isArray(clearanceAttribute)
        ? clearanceAttribute[0]
        : clearanceAttribute;

    // Final check after array extraction
    if (!clearanceValue) {
        logger.warn('Empty clearance value in token, defaulting to UNCLASSIFIED', {
            realmName
        });
        return 'UNCLASSIFIED';
    }

    // Determine country from realm name
    const country = getCountryFromRealm(realmName);

    return await mapNationalClearanceAsync(clearanceValue, country);
}

/**
 * Map clearance from Keycloak token attribute (Synchronous version)
 *
 * DEPRECATED in favor of mapClearanceFromTokenAsync() for MongoDB support
 * Kept for backwards compatibility
 *
 * @deprecated Use mapClearanceFromTokenAsync() for MongoDB SSOT support
 */
export function mapClearanceFromToken(
    clearanceAttribute: string | string[] | undefined,
    realmName: string
): DiveClearanceLevel {
    // Handle undefined or empty
    if (!clearanceAttribute ||
        (Array.isArray(clearanceAttribute) && clearanceAttribute.length === 0)) {
        logger.warn('No clearance attribute in token, defaulting to UNCLASSIFIED', {
            realmName
        });
        return 'UNCLASSIFIED';
    }

    // Handle array (Keycloak sometimes returns arrays)
    const clearanceValue = Array.isArray(clearanceAttribute)
        ? clearanceAttribute[0]
        : clearanceAttribute;

    // Final check after array extraction
    if (!clearanceValue) {
        logger.warn('Empty clearance value in token, defaulting to UNCLASSIFIED', {
            realmName
        });
        return 'UNCLASSIFIED';
    }

    // Determine country from realm name
    const country = getCountryFromRealm(realmName);

    return mapNationalClearance(clearanceValue, country);
}

/**
 * Extract country code from realm name
 *
 * @param realmName - Keycloak realm name (e.g., "dive-v3-fra", "usa-realm-broker")
 * @returns National clearance system identifier
 */
export function getCountryFromRealm(realmName: string): NationalClearanceSystem {
    const normalized = realmName.toLowerCase();

    // Existing (10)
    if (normalized.includes('usa') || normalized.includes('us-')) {
        return 'USA';
    }
    if (normalized.includes('fra') || normalized.includes('france')) {
        return 'FRA';
    }
    if (normalized.includes('can') || normalized.includes('canada')) {
        return 'CAN';
    }
    if (normalized.includes('gbr') || normalized.includes('uk') || normalized.includes('britain')) {
        return 'GBR';
    }
    if (normalized.includes('deu') || normalized.includes('germany') || normalized.includes('german')) {
        return 'DEU';
    }
    if (normalized.includes('ita') || normalized.includes('italy') || normalized.includes('italian')) {
        return 'ITA';
    }
    if (normalized.includes('esp') || normalized.includes('spain') || normalized.includes('spanish')) {
        return 'ESP';
    }
    if (normalized.includes('pol') || normalized.includes('poland') || normalized.includes('polish')) {
        return 'POL';
    }
    if (normalized.includes('nld') || normalized.includes('netherlands') || normalized.includes('dutch')) {
        return 'NLD';
    }
    if (normalized.includes('industry') || normalized.includes('partner')) {
        return 'INDUSTRY';
    }

    // NEW - 22 NATO Members
    if (normalized.includes('alb') || normalized.includes('albania')) {
        return 'ALB';
    }
    if (normalized.includes('bel') || normalized.includes('belgium') || normalized.includes('belgique')) {
        return 'BEL';
    }
    if (normalized.includes('bgr') || normalized.includes('bulgaria')) {
        return 'BGR';
    }
    if (normalized.includes('cze') || normalized.includes('czech')) {
        return 'CZE';
    }
    if (normalized.includes('dnk') || normalized.includes('denmark') || normalized.includes('danish')) {
        return 'DNK';
    }
    if (normalized.includes('est') || normalized.includes('estonia')) {
        return 'EST';
    }
    if (normalized.includes('fin') || normalized.includes('finland') || normalized.includes('finnish')) {
        return 'FIN';
    }
    if (normalized.includes('grc') || normalized.includes('greece') || normalized.includes('greek')) {
        return 'GRC';
    }
    if (normalized.includes('hrv') || normalized.includes('croatia')) {
        return 'HRV';
    }
    if (normalized.includes('hun') || normalized.includes('hungary') || normalized.includes('hungarian')) {
        return 'HUN';
    }
    if (normalized.includes('isl') || normalized.includes('iceland')) {
        return 'ISL';
    }
    if (normalized.includes('ltu') || normalized.includes('lithuania')) {
        return 'LTU';
    }
    if (normalized.includes('lux') || normalized.includes('luxembourg')) {
        return 'LUX';
    }
    if (normalized.includes('lva') || normalized.includes('latvia')) {
        return 'LVA';
    }
    if (normalized.includes('mkd') || normalized.includes('macedonia') || normalized.includes('north macedonia')) {
        return 'MKD';
    }
    if (normalized.includes('mne') || normalized.includes('montenegro')) {
        return 'MNE';
    }
    if (normalized.includes('nor') || normalized.includes('norway') || normalized.includes('norwegian')) {
        return 'NOR';
    }
    if (normalized.includes('nzl') || normalized.includes('new zealand') || normalized.includes('newzealand')) {
        return 'NZL';
    }
    if (normalized.includes('prt') || normalized.includes('portugal') || normalized.includes('portuguese')) {
        return 'PRT';
    }
    if (normalized.includes('rou') || normalized.includes('romania')) {
        return 'ROU';
    }
    if (normalized.includes('svk') || normalized.includes('slovakia')) {
        return 'SVK';
    }
    if (normalized.includes('svn') || normalized.includes('slovenia')) {
        return 'SVN';
    }
    if (normalized.includes('swe') || normalized.includes('sweden') || normalized.includes('swedish')) {
        return 'SWE';
    }
    if (normalized.includes('tur') || normalized.includes('turkey') || normalized.includes('turkish')) {
        return 'TUR';
    }

    // Default to USA for unknown realms (including broker)
    logger.warn('Unknown realm, defaulting to USA clearance system', {
        realmName
    });
    return 'USA';
}

/**
 * Validate clearance mapping configuration
 *
 * Ensures all mappings are properly configured
 * Should be called at service startup
 *
 * @returns Validation result
 */
export function validateClearanceMapping(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check that all standard levels are present
    const standardLevels: DiveClearanceLevel[] = [
        'UNCLASSIFIED',
        'RESTRICTED',
        'CONFIDENTIAL',
        'SECRET',
        'TOP_SECRET'
    ];

    const mappedLevels = CLEARANCE_EQUIVALENCY_TABLE.map(m => m.standardLevel);

    for (const level of standardLevels) {
        if (!mappedLevels.includes(level)) {
            errors.push(`Missing mapping for standard level: ${level}`);
        }
    }

    // Check that each mapping has equivalents for all countries
    const requiredCountries: NationalClearanceSystem[] = [
        // Existing (10)
        'USA', 'FRA', 'CAN', 'GBR', 'DEU', 'ITA', 'ESP', 'POL', 'NLD', 'INDUSTRY',
        // NEW - 22 NATO Members
        'ALB', 'BEL', 'BGR', 'CZE', 'DNK', 'EST', 'FIN', 'GRC', 'HRV', 'HUN',
        'ISL', 'LTU', 'LUX', 'LVA', 'MKD', 'MNE', 'NOR', 'NZL', 'PRT', 'ROU',
        'SVK', 'SVN', 'SWE', 'TUR'
    ];

    for (const mapping of CLEARANCE_EQUIVALENCY_TABLE) {
        for (const country of requiredCountries) {
            if (!mapping.nationalEquivalents[country] || mapping.nationalEquivalents[country].length === 0) {
                errors.push(`Missing equivalents for ${country} at level ${mapping.standardLevel}`);
            }
        }
    }

    const valid = errors.length === 0;

    if (valid) {
        logger.info('Clearance mapping validation successful', {
            mappingsCount: CLEARANCE_EQUIVALENCY_TABLE.length,
            countriesCount: requiredCountries.length
        });
    } else {
        logger.error('Clearance mapping validation failed', { errors });
    }

    return { valid, errors };
}
