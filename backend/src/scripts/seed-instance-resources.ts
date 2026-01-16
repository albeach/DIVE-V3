/**
 * DIVE V3 - Instance-Aware Resource Seeding Script
 *
 * Seeds 5,000 ZTDF-encrypted resources per instance (default) with comprehensive coverage of:
 * - Classifications: UNCLASSIFIED, RESTRICTED, CONFIDENTIAL, SECRET, TOP_SECRET (evenly distributed)
 * - COIs: 28+ validated templates (US-ONLY, FVEY, NATO, bilateral, multi-COI, etc.)
 * - Multi-KAS: Single, dual, and triple KAS configurations
 * - Releasability: Instance-specific and coalition-wide distribution
 * - Industry Access: Government-only and industry-accessible resources
 *
 * Usage:
 *   npm run seed:instance -- --instance=USA              # Seed 5000 docs to USA (default)
 *   npm run seed:instance -- --instance=FRA --count=5000 # Seed 5000 docs to FRA
 *   npm run seed:instance -- --instance=ALL              # Seed all instances
 *   npm run seed:instance -- --dry-run --instance=GBR    # Validate without seeding
 *   npm run seed:instance -- --instance=DEU --replace    # Replace existing data
 *
 * Date: December 18, 2025
 * Version: 1.1.0 - Standardized on 5000 ZTDF documents per instance
 */

import { MongoClient, Db, Collection } from 'mongodb';
import * as fs from 'fs';
import * as path from 'path';
import { generateDisplayMarking, COIOperator, ClassificationLevel } from '../types/ztdf.types';
import { encryptContent, computeSHA384, computeObjectHash } from '../utils/ztdf.utils';
import { validateCOICoherence } from '../services/coi-validation.service';
import { getMongoDBPassword, isGCPSecretsAvailable } from '../utils/gcp-secrets';

// ============================================
// CONFIGURATION
// ============================================

// Detect if running inside Docker container
const IS_DOCKER = process.env.CONTAINER === 'docker' || fs.existsSync('/.dockerenv') || (process.env.HOSTNAME?.startsWith('dive-v3'));

// Resolve paths differently for Docker vs local execution
const BACKEND_ROOT = IS_DOCKER ? '/app' : path.resolve(__dirname, '../..');
const PROJECT_ROOT = IS_DOCKER ? '/app' : path.resolve(__dirname, '../../..');
const FEDERATION_REGISTRY_PATH = IS_DOCKER
    ? '/app/config/federation-registry.json'
    : path.join(PROJECT_ROOT, 'config/federation-registry.json');
const KAS_REGISTRY_PATH = IS_DOCKER
    ? '/app/config/kas-registry.json'
    : path.join(PROJECT_ROOT, 'config/kas-registry.json');
const SEED_LOG_DIR = path.join(BACKEND_ROOT, 'logs/seed');

// Ensure log directory exists
try {
    if (!fs.existsSync(SEED_LOG_DIR)) {
        fs.mkdirSync(SEED_LOG_DIR, { recursive: true });
    }
} catch (e) {
    console.warn(`Warning: Could not create log directory ${SEED_LOG_DIR}: ${e}`);
}

// ============================================
// ISO 3166-1 ALPHA-3 COUNTRY CODES
// ============================================

/**
 * Valid ISO 3166-1 alpha-3 country codes for DIVE V3
 * All document country codes MUST be in this list
 */
const ISO_3166_1_ALPHA_3: Record<string, string> = {
    // FVEY Nations
    'USA': 'United States',
    'GBR': 'United Kingdom',
    'CAN': 'Canada',
    'AUS': 'Australia',
    'NZL': 'New Zealand',
    // NATO Europe
    'FRA': 'France',
    'DEU': 'Germany',
    'ITA': 'Italy',
    'ESP': 'Spain',
    'POL': 'Poland',
    'NLD': 'Netherlands',
    'BEL': 'Belgium',
    'NOR': 'Norway',
    'DNK': 'Denmark',
    'PRT': 'Portugal',
    'GRC': 'Greece',
    'TUR': 'Turkey',
    'CZE': 'Czech Republic',
    'HUN': 'Hungary',
    'ROU': 'Romania',
    'BGR': 'Bulgaria',
    'SVK': 'Slovakia',
    'SVN': 'Slovenia',
    'HRV': 'Croatia',
    'ALB': 'Albania',
    'MNE': 'Montenegro',
    'MKD': 'North Macedonia',
    'EST': 'Estonia',
    'LVA': 'Latvia',
    'LTU': 'Lithuania',
    'LUX': 'Luxembourg',
    'ISL': 'Iceland',
    'FIN': 'Finland',
    'SWE': 'Sweden',
    // Other NATO/Partners
    'MEX': 'Mexico',
    // QUAD/Pacific
    'JPN': 'Japan',
    'IND': 'India',
    'KOR': 'South Korea',
    'PHL': 'Philippines',
    // EU-only (non-NATO)
    'AUT': 'Austria',
    'IRL': 'Ireland',
    'MLT': 'Malta',
    'CYP': 'Cyprus',
    // Middle East (CENTCOM)
    'SAU': 'Saudi Arabia',
    'ARE': 'United Arab Emirates',
    'QAT': 'Qatar',
    'KWT': 'Kuwait',
    'BHR': 'Bahrain',
    'JOR': 'Jordan',
    'EGY': 'Egypt'
};

/**
 * Custom test/development codes that are allowed for non-production instances
 * These enable testing and development without requiring real country codes
 */
const CUSTOM_TEST_CODES: Record<string, string> = {
    'TST': 'Test Instance',
    'DEV': 'Development Instance',
    'QAA': 'QA Instance A',
    'QAB': 'QA Instance B',
    'STG': 'Staging Instance',
    'DMO': 'Demo Instance',
    'TRN': 'Training Instance',
    'SND': 'Sandbox Instance',
    'ORF': 'Orphan Test',
    'TMP': 'Temporary Instance',
    'LOC': 'Local Development',
    'INT': 'Integration Test',
    'UAT': 'User Acceptance Test',
    'PRF': 'Performance Test',
    'SEC': 'Security Test'
};

/**
 * Check if a code is a valid custom test code
 */
function isCustomTestCode(code: string): boolean {
    return code in CUSTOM_TEST_CODES;
}

/**
 * Validate that a country code is a valid ISO 3166-1 alpha-3 code or custom test code
 */
function validateCountryCode(code: string): boolean {
    return code in ISO_3166_1_ALPHA_3 || isCustomTestCode(code);
}

/**
 * Validate all country codes in an array
 */
function validateCountryCodes(codes: string[]): { valid: boolean; invalid: string[] } {
    const invalid = codes.filter(c => !validateCountryCode(c));
    return {
        valid: invalid.length === 0,
        invalid
    };
}

// ============================================
// LOCALE-SPECIFIC CLASSIFICATION MAPPINGS
// ============================================

/**
 * ACP-240 Section 4.3: Classification Equivalency
 *
 * Maps NATO standard classification levels to national language terms.
 * This enables proper "originalClassification" labeling per source nation,
 * while maintaining NATO equivalency for authorization decisions.
 *
 * Reference: STANAG 4774/5636 Classification and Handling Markings
 */
const LOCALE_CLASSIFICATIONS: Record<string, Record<string, string>> = {
    // FVEY Nations (English-speaking)
    USA: {
        UNCLASSIFIED: 'UNCLASSIFIED',
        RESTRICTED: 'RESTRICTED',
        CONFIDENTIAL: 'CONFIDENTIAL',
        SECRET: 'SECRET',
        TOP_SECRET: 'TOP SECRET'
    },
    GBR: {
        UNCLASSIFIED: 'OFFICIAL',
        RESTRICTED: 'OFFICIAL',
        CONFIDENTIAL: 'OFFICIAL-SENSITIVE',
        SECRET: 'SECRET',
        TOP_SECRET: 'TOP SECRET'
    },
    CAN: {
        UNCLASSIFIED: 'UNCLASSIFIED',
        RESTRICTED: 'PROTECTED A',
        CONFIDENTIAL: 'PROTECTED B',
        SECRET: 'SECRET',
        TOP_SECRET: 'TOP SECRET'
    },
    AUS: {
        UNCLASSIFIED: 'OFFICIAL',
        RESTRICTED: 'OFFICIAL',
        CONFIDENTIAL: 'OFFICIAL:SENSITIVE',
        SECRET: 'SECRET',
        TOP_SECRET: 'TOP SECRET'
    },
    NZL: {
        UNCLASSIFIED: 'UNCLASSIFIED',
        RESTRICTED: 'RESTRICTED',
        CONFIDENTIAL: 'CONFIDENTIAL',
        SECRET: 'SECRET',
        TOP_SECRET: 'TOP SECRET'
    },

    // French-speaking Nations
    FRA: {
        UNCLASSIFIED: 'NON PROTÉGÉ',
        RESTRICTED: 'DIFFUSION RESTREINTE',
        CONFIDENTIAL: 'CONFIDENTIEL DÉFENSE',
        SECRET: 'SECRET DÉFENSE',
        TOP_SECRET: 'TRÈS SECRET DÉFENSE'
    },
    BEL: {
        UNCLASSIFIED: 'NON CLASSIFIÉ',
        RESTRICTED: 'DIFFUSION RESTREINTE',
        CONFIDENTIAL: 'CONFIDENTIEL',
        SECRET: 'SECRET',
        TOP_SECRET: 'TRÈS SECRET'
    },
    LUX: {
        UNCLASSIFIED: 'NON CLASSIFIÉ',
        RESTRICTED: 'DIFFUSION RESTREINTE',
        CONFIDENTIAL: 'CONFIDENTIEL',
        SECRET: 'SECRET',
        TOP_SECRET: 'TRÈS SECRET'
    },

    // German-speaking Nations
    DEU: {
        UNCLASSIFIED: 'OFFEN',
        RESTRICTED: 'FÜR DEN DIENSTGEBRAUCH',
        CONFIDENTIAL: 'VS-VERTRAULICH',
        SECRET: 'GEHEIM',
        TOP_SECRET: 'STRENG GEHEIM'
    },
    AUT: {
        UNCLASSIFIED: 'OFFEN',
        RESTRICTED: 'EINGESCHRÄNKT',
        CONFIDENTIAL: 'VERTRAULICH',
        SECRET: 'GEHEIM',
        TOP_SECRET: 'STRENG GEHEIM'
    },

    // Spanish-speaking Nations
    ESP: {
        UNCLASSIFIED: 'SIN CLASIFICAR',
        RESTRICTED: 'USO OFICIAL',
        CONFIDENTIAL: 'CONFIDENCIAL',
        SECRET: 'SECRETO',
        TOP_SECRET: 'ALTO SECRETO'
    },
    MEX: {
        UNCLASSIFIED: 'NO CLASIFICADO',
        RESTRICTED: 'USO OFICIAL',
        CONFIDENTIAL: 'CONFIDENCIAL',
        SECRET: 'SECRETO',
        TOP_SECRET: 'ALTO SECRETO'
    },

    // Italian
    ITA: {
        UNCLASSIFIED: 'NON CLASSIFICATO',
        RESTRICTED: 'RISERVATO',
        CONFIDENTIAL: 'RISERVATO',
        SECRET: 'SEGRETO',
        TOP_SECRET: 'SEGRETISSIMO'
    },

    // Portuguese
    PRT: {
        UNCLASSIFIED: 'NÃO CLASSIFICADO',
        RESTRICTED: 'RESERVADO',
        CONFIDENTIAL: 'CONFIDENCIAL',
        SECRET: 'SECRETO',
        TOP_SECRET: 'MUITO SECRETO'
    },

    // Nordic Countries
    NOR: {
        UNCLASSIFIED: 'UGRADERT',
        RESTRICTED: 'BEGRENSET',
        CONFIDENTIAL: 'FORTROLIG',
        SECRET: 'HEMMELIG',
        TOP_SECRET: 'STRENGT HEMMELIG'
    },
    DNK: {
        UNCLASSIFIED: 'UKLASSIFICERET',
        RESTRICTED: 'TIL TJENESTEBRUG',
        CONFIDENTIAL: 'FORTROLIGT',
        SECRET: 'HEMMELIGT',
        TOP_SECRET: 'YDERST HEMMELIGT'
    },
    SWE: {
        UNCLASSIFIED: 'ÖPPEN',
        RESTRICTED: 'BEGRÄNSAD',
        CONFIDENTIAL: 'KONFIDENTIELLT',
        SECRET: 'HEMLIGT',
        TOP_SECRET: 'KVALIFICERAT HEMLIGT'
    },
    FIN: {
        UNCLASSIFIED: 'JULKINEN',
        RESTRICTED: 'RAJOITETTU',
        CONFIDENTIAL: 'LUOTTAMUKSELLINEN',
        SECRET: 'SALAINEN',
        TOP_SECRET: 'ERITTÄIN SALAINEN'
    },
    ISL: {
        UNCLASSIFIED: 'ÓFLOKAÐ',
        RESTRICTED: 'TAKMARKAÐ',
        CONFIDENTIAL: 'TRÚNAÐARMÁL',
        SECRET: 'LEYNDARMÁL',
        TOP_SECRET: 'MJÖG LEYNDARMÁL'
    },

    // Central/Eastern Europe
    POL: {
        UNCLASSIFIED: 'JAWNE',
        RESTRICTED: 'ZASTRZEŻONE',
        CONFIDENTIAL: 'POUFNE',
        SECRET: 'TAJNE',
        TOP_SECRET: 'ŚCIŚLE TAJNE'
    },
    CZE: {
        UNCLASSIFIED: 'NEUTAJOVANÉ',
        RESTRICTED: 'VYHRAZENÉ',
        CONFIDENTIAL: 'DŮVĚRNÉ',
        SECRET: 'TAJNÉ',
        TOP_SECRET: 'PŘÍSNĚ TAJNÉ'
    },
    HUN: {
        UNCLASSIFIED: 'NYÍLT',
        RESTRICTED: 'KORLÁTOZOTT TERJESZTÉSŰ',
        CONFIDENTIAL: 'BIZALMAS',
        SECRET: 'TITKOS',
        TOP_SECRET: 'SZIGORÚAN TITKOS'
    },
    SVK: {
        UNCLASSIFIED: 'NEUTAJOVANÉ',
        RESTRICTED: 'VYHRADENÉ',
        CONFIDENTIAL: 'DÔVERNÉ',
        SECRET: 'TAJNÉ',
        TOP_SECRET: 'PRÍSNE TAJNÉ'
    },
    SVN: {
        UNCLASSIFIED: 'NEKLASIFICIRANO',
        RESTRICTED: 'INTERNO',
        CONFIDENTIAL: 'ZAUPNO',
        SECRET: 'TAJNO',
        TOP_SECRET: 'STROGO TAJNO'
    },
    HRV: {
        UNCLASSIFIED: 'NEKLASIFICIRANO',
        RESTRICTED: 'INTERNO',
        CONFIDENTIAL: 'POVJERLJIVO',
        SECRET: 'TAJNO',
        TOP_SECRET: 'VRLO TAJNO'
    },
    ROU: {
        UNCLASSIFIED: 'NECLASIFICAT',
        RESTRICTED: 'UZUL OFICIAL',
        CONFIDENTIAL: 'CONFIDENȚIAL',
        SECRET: 'SECRET',
        TOP_SECRET: 'STRICT SECRET'
    },
    BGR: {
        UNCLASSIFIED: 'НЕКЛАСИФИЦИРАНО',
        RESTRICTED: 'ЗА СЛУЖЕБНО ПОЛЗВАНЕ',
        CONFIDENTIAL: 'ПОВЕРИТЕЛНО',
        SECRET: 'СЕКРЕТНО',
        TOP_SECRET: 'СТРОГО СЕКРЕТНО'
    },

    // Baltic States
    EST: {
        UNCLASSIFIED: 'AVALIK',
        RESTRICTED: 'PIIRATUD',
        CONFIDENTIAL: 'KONFIDENTSIAALNE',
        SECRET: 'SALAJANE',
        TOP_SECRET: 'TÄIESTI SALAJANE'
    },
    LVA: {
        UNCLASSIFIED: 'NEKLASIFICĒTA',
        RESTRICTED: 'IEROBEŽOTAS PIEEJAMĪBAS',
        CONFIDENTIAL: 'KONFIDENCIĀLA',
        SECRET: 'SLEPENA',
        TOP_SECRET: 'SEVIŠĶI SLEPENA'
    },
    LTU: {
        UNCLASSIFIED: 'NESLAPTA',
        RESTRICTED: 'RIBOTO NAUDOJIMO',
        CONFIDENTIAL: 'KONFIDENCIALI',
        SECRET: 'SLAPTA',
        TOP_SECRET: 'VISIŠKAI SLAPTA'
    },

    // Southeastern Europe
    ALB: {
        UNCLASSIFIED: 'I PAKLASIFIKUAR',
        RESTRICTED: 'PËRDORIM I KUFIZUAR',
        CONFIDENTIAL: 'KONFIDENCIAL',
        SECRET: 'SEKRET',
        TOP_SECRET: 'TEPER SEKRET'
    },
    MNE: {
        UNCLASSIFIED: 'NEKLASIFIKOVANO',
        RESTRICTED: 'INTERNO',
        CONFIDENTIAL: 'POVJERLJIVO',
        SECRET: 'TAJNO',
        TOP_SECRET: 'STROGO TAJNO'
    },
    MKD: {
        UNCLASSIFIED: 'НЕКЛАСИФИЦИРАНО',
        RESTRICTED: 'ИНТЕРНО',
        CONFIDENTIAL: 'ДОВЕРЛИВО',
        SECRET: 'ТАЈНО',
        TOP_SECRET: 'СТРОГО ТАЈНО'
    },
    GRC: {
        UNCLASSIFIED: 'ΑΔΙΑΒΑΘΜΗΤΟ',
        RESTRICTED: 'ΠΕΡΙΟΡΙΣΜΕΝΗΣ ΧΡΗΣΗΣ',
        CONFIDENTIAL: 'ΕΜΠΙΣΤΕΥΤΙΚΟ',
        SECRET: 'ΑΠΟΡΡΗΤΟ',
        TOP_SECRET: 'ΑΚΡΩΣ ΑΠΟΡΡΗΤΟ'
    },

    // Turkey
    TUR: {
        UNCLASSIFIED: 'TASNIF DIŞI',
        RESTRICTED: 'SINIRLI',
        CONFIDENTIAL: 'HİZMETE ÖZEL',
        SECRET: 'GİZLİ',
        TOP_SECRET: 'ÇOK GİZLİ'
    },

    // Netherlands
    NLD: {
        UNCLASSIFIED: 'ONGERUBRICEERD',
        RESTRICTED: 'DEPARTEMENTAAL VERTROUWELIJK',
        CONFIDENTIAL: 'VERTROUWELIJK',
        SECRET: 'GEHEIM',
        TOP_SECRET: 'ZEER GEHEIM'
    }
};

/**
 * Get locale-specific classification label for a country
 *
 * @param instanceCode - ISO 3166-1 alpha-3 country code
 * @param natoLevel - NATO standard classification level
 * @returns Native language classification term
 */
function getOriginalClassification(instanceCode: string, natoLevel: string): string {
    const countryMap = LOCALE_CLASSIFICATIONS[instanceCode];

    if (!countryMap) {
        // Fallback to NATO standard for unmapped countries
        console.warn(`No locale classification mapping for ${instanceCode}, using NATO standard`);
        return natoLevel;
    }

    return countryMap[natoLevel] || natoLevel;
}

/**
 * Instance-specific country affiliations for weighted COI selection
 */
const INSTANCE_COUNTRY_AFFILIATIONS: Record<string, {
    primaryCountry: string;
    regionalPartners: string[];
    preferredCOIs: string[];
    weightMultiplier: number;
}> = {
    'USA': {
        primaryCountry: 'USA',
        regionalPartners: ['CAN', 'MEX', 'GBR', 'AUS', 'NZL'],
        preferredCOIs: ['US-ONLY', 'FVEY', 'NORTHCOM', 'CAN-US', 'AUKUS'],
        weightMultiplier: 1.5
    },
    'FRA': {
        primaryCountry: 'FRA',
        regionalPartners: ['DEU', 'ITA', 'ESP', 'BEL', 'NLD'],
        preferredCOIs: ['FRA-US', 'NATO', 'NATO-COSMIC', 'EU-RESTRICTED', 'EUCOM'],
        weightMultiplier: 1.5
    },
    'GBR': {
        primaryCountry: 'GBR',
        regionalPartners: ['USA', 'AUS', 'CAN', 'NZL'],
        preferredCOIs: ['GBR-US', 'FVEY', 'AUKUS', 'NATO', 'SOCOM'],
        weightMultiplier: 1.5
    },
    'DEU': {
        primaryCountry: 'DEU',
        regionalPartners: ['FRA', 'POL', 'NLD', 'BEL', 'AUT'],
        preferredCOIs: ['NATO', 'NATO-COSMIC', 'EU-RESTRICTED', 'EUCOM'],
        weightMultiplier: 1.5
    }
};

// ============================================
// TYPES
// ============================================

interface IFederationRegistry {
    instances: Record<string, IInstanceConfig>;
    defaults: {
        realm: string;
        clientId: string;
        testUserPassword: string;
    };
}

interface IInstanceConfig {
    code: string;
    name: string;
    type: 'local' | 'remote';
    enabled: boolean;
    deployment: {
        host: string;
        domain: string;
    };
    urls?: {
        app: string;
        api: string;
        idp: string;
    };
    services: {
        mongodb: {
            name: string;
            containerName: string;
            internalPort: number;
            externalPort: number;
        };
    };
    mongodb: {
        database: string;
        user: string;
    };
}

interface IKASRegistry {
    kasServers: IKASServer[];  // Matches backend/config/kas-registry.json structure
    federationTrust?: {
        trustMatrix?: Record<string, string[]>;
    };
    federationAgreements?: any[];
}

interface IKASServer {
    kasId: string;
    organization: string;
    countryCode: string;  // ISO 3166-1 alpha-3 - SSOT for KAS home country
    supportedCountries?: string[];  // ISO codes this KAS can serve (defaults to [countryCode])
    kasUrl: string;
    internalKasUrl?: string;  // Optional for MongoDB registrations
    supportedCOIs: string[];
}

interface ICOITemplate {
    coi: string[];
    coiOperator: COIOperator;
    releasabilityTo: string[];
    caveats: string[];
    description: string;
    weight: number; // Distribution weight
    industryAllowed: boolean; // Industry access control
    instanceAffinity?: string[]; // Instances that should favor this template
}

interface ISeedManifest {
    instanceCode: string;
    instanceName: string;
    timestamp: string;
    version: string;
    totalDocuments: number;
    distribution: {
        byClassification: Record<string, number>;
        byCOI: Record<string, number>;
        byKASCount: Record<string, number>;
        byIndustryAccess: Record<string, number>;
    };
    seedBatchId: string;
    duration_ms: number;
    mongodbUri: string; // Sanitized
}

interface ISeedCheckpoint {
    instanceCode: string;
    seedBatchId: string;
    totalCount: number;
    completedCount: number;
    lastCompletedBatch: number;
    startTime: string;
    lastUpdateTime: string;
    status: 'in_progress' | 'completed' | 'failed';
    error?: string;
}

// ============================================
// CLI ARGUMENT PARSING
// ============================================

interface ISeedOptions {
    instance: string;
    count: number;
    dryRun: boolean;
    replace: boolean;
    batchSize: number;
    verbose: boolean;
}

function parseArgs(): ISeedOptions {
    const args = process.argv.slice(2);

    // INSTANCE_CODE from environment takes precedence (ISO 3166-1 alpha-3)
    // This enables Docker exec with: INSTANCE_CODE=EST npm run seed:instance
    const envInstance = process.env.INSTANCE_CODE?.toUpperCase();

    const options: ISeedOptions = {
        instance: envInstance || 'USA',  // Use env var or default to USA
        count: 5000,  // Default: 5000 ZTDF encrypted documents per instance
        dryRun: false,
        replace: false,
        batchSize: 100,
        verbose: false
    };

    for (const arg of args) {
        if (arg.startsWith('--instance=')) {
            options.instance = arg.split('=')[1].toUpperCase();  // CLI overrides env
        } else if (arg.startsWith('--count=')) {
            options.count = parseInt(arg.split('=')[1], 10);
        } else if (arg === '--dry-run') {
            options.dryRun = true;
        } else if (arg === '--replace') {
            options.replace = true;
        } else if (arg.startsWith('--batch-size=')) {
            options.batchSize = parseInt(arg.split('=')[1], 10);
        } else if (arg === '--verbose' || arg === '-v') {
            options.verbose = true;
        } else if (arg === '--help' || arg === '-h') {
            showHelp();
            process.exit(0);
        }
    }

    // Validate count
    options.count = Math.max(1, Math.min(20000, options.count));

    return options;
}

// ============================================
// CHECKPOINT MANAGEMENT (Resilience)
// ============================================

const CHECKPOINT_DIR = path.join(SEED_LOG_DIR, 'checkpoints');

// Ensure checkpoint directory exists
if (!fs.existsSync(CHECKPOINT_DIR)) {
    fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
}

function getCheckpointPath(instanceCode: string, seedBatchId: string): string {
    return path.join(CHECKPOINT_DIR, `${instanceCode}-${seedBatchId}.checkpoint.json`);
}

function saveCheckpoint(checkpoint: ISeedCheckpoint): void {
    const checkpointPath = getCheckpointPath(checkpoint.instanceCode, checkpoint.seedBatchId);
    fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2));
}

function loadCheckpoint(instanceCode: string, seedBatchId: string): ISeedCheckpoint | null {
    const checkpointPath = getCheckpointPath(instanceCode, seedBatchId);
    if (fs.existsSync(checkpointPath)) {
        try {
            return JSON.parse(fs.readFileSync(checkpointPath, 'utf-8'));
        } catch {
            return null;
        }
    }
    return null;
}

function findIncompleteCheckpoint(instanceCode: string): ISeedCheckpoint | null {
    if (!fs.existsSync(CHECKPOINT_DIR)) return null;

    const files = fs.readdirSync(CHECKPOINT_DIR)
        .filter(f => f.startsWith(`${instanceCode}-`) && f.endsWith('.checkpoint.json'));

    for (const file of files.sort().reverse()) {
        try {
            const checkpoint = JSON.parse(fs.readFileSync(path.join(CHECKPOINT_DIR, file), 'utf-8')) as ISeedCheckpoint;
            if (checkpoint.status === 'in_progress') {
                return checkpoint;
            }
        } catch {
            // Ignore corrupt checkpoint files
        }
    }
    return null;
}

function deleteCheckpoint(instanceCode: string, seedBatchId: string): void {
    const checkpointPath = getCheckpointPath(instanceCode, seedBatchId);
    if (fs.existsSync(checkpointPath)) {
        fs.unlinkSync(checkpointPath);
    }
}

/**
 * Clean up old seed manifest files (older than 7 days)
 * Prevents accumulation of manifest files in logs/seed directory
 */
function cleanupOldManifests(): void {
    if (!fs.existsSync(SEED_LOG_DIR)) return;

    const now = Date.now();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
    let deletedCount = 0;

    try {
        const files = fs.readdirSync(SEED_LOG_DIR)
            .filter(f => f.startsWith('seed-manifest-') && f.endsWith('.json'));

        for (const file of files) {
            const filePath = path.join(SEED_LOG_DIR, file);
            try {
                const stats = fs.statSync(filePath);
                const age = now - stats.mtimeMs;

                if (age > maxAge) {
                    fs.unlinkSync(filePath);
                    deletedCount++;
                }
            } catch (err) {
                // Ignore errors for individual files
                console.warn(`Warning: Could not delete ${file}: ${err}`);
            }
        }

        if (deletedCount > 0) {
            console.log(`🧹 Cleaned up ${deletedCount} old seed manifest files (older than 7 days)\n`);
        }
    } catch (err) {
        console.warn(`Warning: Could not cleanup old manifests: ${err}`);
    }
}

function showHelp(): void {
    console.log(`
DIVE V3 - Instance-Aware Resource Seeding Script

USAGE:
    npm run seed:instance -- [OPTIONS]

OPTIONS:
    --instance=CODE     Instance to seed: USA, FRA, GBR, DEU, or ALL (default: USA)
    --count=N           Number of documents to seed (1-20000, default: 5000)
    --dry-run           Validate templates and show distribution without seeding
    --replace           Delete existing generated documents before seeding
    --batch-size=N      Documents per batch (default: 100)
    --verbose, -v       Show detailed progress
    --help, -h          Show this help message

EXAMPLES:
    npm run seed:instance -- --instance=USA                # Seed 5000 docs to USA
    npm run seed:instance -- --instance=FRA --count=5000   # Seed 5000 docs to FRA
    npm run seed:instance -- --instance=ALL                # Seed all instances
    npm run seed:instance -- --dry-run --instance=GBR      # Validate without seeding
    npm run seed:instance -- --instance=DEU --replace      # Replace existing data
    `);
}

// ============================================
// CONFIGURATION LOADERS
// ============================================

function loadFederationRegistry(): IFederationRegistry {
    const content = fs.readFileSync(FEDERATION_REGISTRY_PATH, 'utf-8');
    return JSON.parse(content);
}

async function loadKASRegistry(): Promise<IKASRegistry> {
    // Try to load from MongoDB (SSOT) first
    try {
        const { MongoKasRegistryStore } = await import('../models/kas-registry.model');
        const kasStore = new MongoKasRegistryStore();
        await kasStore.initialize();

        // Get all active KAS servers from database
        const kasServers = await kasStore.findAll();
        const activeServers = kasServers.filter(k => k.enabled && k.status === 'active');

        if (activeServers.length > 0) {
            console.log(`   ✅ Loaded ${activeServers.length} KAS servers from MongoDB (SSOT)`);

            // Convert to legacy format for compatibility
            return {
                kasServers: activeServers.map(k => ({
                    kasId: k.kasId,
                    organization: k.organization,
                    countryCode: k.kasId.split('-')[0].toUpperCase(), // Extract from kasId (e.g., hun-kas -> HUN)
                    kasUrl: k.kasUrl,
                    internalKasUrl: k.kasUrl, // Use same URL for now
                    authMethod: k.authMethod,
                    authConfig: {
                        jwtIssuer: k.authConfig.jwtIssuer,
                        jwtAudience: k.authConfig.jwtAudience || 'dive-v3-broker'
                    },
                    trustLevel: k.trustLevel,
                    supportedCountries: k.supportedCountries,
                    supportedCOIs: k.supportedCOIs,
                    policyTranslation: k.policyTranslation,
                    metadata: {
                        version: k.metadata.version,
                        capabilities: k.metadata.capabilities,
                        contact: k.metadata.contact || '',
                        lastVerified: k.metadata.lastVerified?.toISOString() || new Date().toISOString()
                    }
                })),
                version: '2.0',
                federationTrust: {
                    trustMatrix: {} // TODO: Build from agreements if needed
                }
            };
        }
    } catch (error) {
        console.warn('   ⚠️ Could not load from MongoDB, falling back to file');
    }

    // Fallback to file
    const content = fs.readFileSync(KAS_REGISTRY_PATH, 'utf-8');
    return JSON.parse(content);
}

function getInstanceConfig(registry: IFederationRegistry, instanceCode: string): IInstanceConfig {
    const key = instanceCode.toLowerCase();
    const config = registry.instances[key];
    if (!config) {
        throw new Error(`Unknown instance: ${instanceCode}. Valid instances: ${Object.keys(registry.instances).join(', ')}`);
    }

    // Ensure mongodb configuration exists (provide defaults if missing)
    if (!config.mongodb) {
        config.mongodb = {
            database: `dive-${key}`,
            user: `dive-${key}-user`
        };
    }

    return config;
}

interface IMongoConnection {
    uri: string;
    user: string;
    password: string;
    database: string;
}

async function getMongoDBConnection(config: IInstanceConfig, instanceCode: string): Promise<IMongoConnection & { database: string }> {
    // Check if MONGODB_URL is set (e.g., when running inside Docker)
    const envMongoUrl = process.env.MONGODB_URL;
    if (envMongoUrl) {
        // Parse the env URL to extract credentials
        const urlMatch = envMongoUrl.match(/mongodb:\/\/([^:]+):([^@]+)@([^:/]+):?(\d+)?\/?(.*)/);
        if (urlMatch) {
            const [, user, password, host, port, dbPath] = urlMatch;
            // CRITICAL: Use database from MONGODB_URL, not config (they can differ!)
            const database = dbPath?.split('?')[0] || config.mongodb.database;
            const uri = `mongodb://${host}:${port || 27017}/${database}`;
            console.log(`   Using MONGODB_URL from environment`);
            console.log(`   MongoDB URI: ${uri}?authSource=admin`);
            console.log(`   Database: ${database}`);
            console.log(`   Auth User: ${user}, Password length: ${password.length} chars`);
            return { uri, user, password, database };
        }
    }

    // Determine host: use 'mongo' inside Docker, 'localhost' otherwise
    const isDocker = process.env.CONTAINER === 'docker' || process.env.HOSTNAME?.startsWith('dive-v3');
    const defaultHost = isDocker ? 'mongo' : 'localhost';
    const host = config.type === 'remote' ? config.deployment.host : defaultHost;
    const port = config.services.mongodb.externalPort;
    const database = config.mongodb.database;
    const user = config.mongodb.user;

    // Get password from GCP Secret Manager or fallback to environment variable
    const password = await getMongoDBPassword(instanceCode);

    // URI without credentials - auth passed separately to MongoClient
    const uri = `mongodb://${host}:${port}/${database}`;

    // Debug logging
    console.log(`   MongoDB URI: ${uri}?authSource=admin`);
    console.log(`   Database: ${database}`);
    console.log(`   Auth User: ${user}, Password length: ${password.length} chars`);

    return { uri, user, password, database };
}

function getKASServersForInstance(kasRegistry: IKASRegistry, instanceCode: string): IKASServer[] {
    const servers: IKASServer[] = [];
    // Find KAS where countryCode matches (SSOT: ISO 3166-1 alpha-3)
    const localKas = kasRegistry.kasServers?.find(k => k.countryCode === instanceCode);

    if (localKas) {
        servers.push(localKas);
    }

    // Add trusted partner KAS servers from trust matrix
    const trustMatrix = kasRegistry.federationTrust?.trustMatrix;
    const localKasId = localKas?.kasId;

    if (localKasId && trustMatrix && trustMatrix[localKasId]) {
        for (const partnerKasId of trustMatrix[localKasId]) {
            const partnerKas = kasRegistry.kasServers?.find(k => k.kasId === partnerKasId);
            if (partnerKas) {
                servers.push(partnerKas);
            }
        }
    }

    return servers;
}

// ============================================
// COI TEMPLATES (28+ VALIDATED TEMPLATES)
// ============================================

const COI_TEMPLATES: ICOITemplate[] = [
    // ============================================
    // US-ONLY templates (7%) - USA instance affinity
    // ============================================
    {
        coi: ['US-ONLY'],
        coiOperator: 'ALL',
        releasabilityTo: ['USA'],
        caveats: ['NOFORN'],
        description: 'US-ONLY with NOFORN caveat',
        weight: 3.5,
        industryAllowed: false,
        instanceAffinity: ['USA']
    },
    {
        coi: ['US-ONLY'],
        coiOperator: 'ALL',
        releasabilityTo: ['USA'],
        caveats: [],
        description: 'US-only (no foreign release)',
        weight: 3.5,
        industryAllowed: true,
        instanceAffinity: ['USA']
    },

    // ============================================
    // Bilateral templates (11%) - Instance-specific affinity
    // ============================================
    {
        coi: ['CAN-US'],
        coiOperator: 'ALL',
        releasabilityTo: ['CAN', 'USA'],
        caveats: [],
        description: 'Canada-US bilateral',
        weight: 3.7,
        industryAllowed: true,
        instanceAffinity: ['USA']
    },
    {
        coi: ['GBR-US'],
        coiOperator: 'ALL',
        releasabilityTo: ['GBR', 'USA'],
        caveats: [],
        description: 'UK-US bilateral',
        weight: 3.7,
        industryAllowed: true,
        instanceAffinity: ['USA', 'GBR']
    },
    {
        coi: ['FRA-US'],
        coiOperator: 'ALL',
        releasabilityTo: ['FRA', 'USA'],
        caveats: [],
        description: 'France-US bilateral',
        weight: 3.6,
        industryAllowed: true,
        instanceAffinity: ['USA', 'FRA']
    },
    // DEU-specific bilateral
    {
        coi: ['DEU-US'],
        coiOperator: 'ALL',
        releasabilityTo: ['DEU', 'USA'],
        caveats: [],
        description: 'Germany-US bilateral',
        weight: 3.6,
        industryAllowed: true,
        instanceAffinity: ['USA', 'DEU']
    },

    // ============================================
    // FVEY (7%) - USA, GBR instance affinity
    // ============================================
    {
        coi: ['FVEY'],
        coiOperator: 'ALL',
        releasabilityTo: ['USA', 'GBR', 'CAN', 'AUS', 'NZL'],
        caveats: [],
        description: 'Five Eyes full membership',
        weight: 7,
        industryAllowed: false,
        instanceAffinity: ['USA', 'GBR']
    },

    // ============================================
    // AUKUS (4%) - GBR instance affinity
    // ============================================
    {
        coi: ['AUKUS'],
        coiOperator: 'ALL',
        releasabilityTo: ['AUS', 'GBR', 'USA'],
        caveats: [],
        description: 'AUKUS trilateral',
        weight: 4,
        industryAllowed: false,
        instanceAffinity: ['USA', 'GBR']
    },

    // ============================================
    // NATO (7%) - All NATO instances
    // ============================================
    {
        coi: ['NATO'],
        coiOperator: 'ALL',
        releasabilityTo: ['USA', 'GBR', 'FRA', 'DEU', 'ITA', 'ESP', 'POL', 'CAN', 'HUN', 'ROU', 'TUR'],
        caveats: [],
        description: 'NATO subset (major partners)',
        weight: 3.5,
        industryAllowed: true,
        instanceAffinity: ['USA', 'FRA', 'GBR', 'DEU', 'HUN']
    },
    {
        coi: ['NATO-COSMIC'],
        coiOperator: 'ALL',
        releasabilityTo: ['USA', 'GBR', 'FRA', 'DEU', 'HUN'],
        caveats: [],
        description: 'NATO COSMIC TOP SECRET',
        weight: 3.5,
        industryAllowed: false,
        instanceAffinity: ['USA', 'FRA', 'GBR', 'DEU', 'HUN']
    },
    // HUN-US bilateral - DISABLED (COI not registered)
    // {
    //     coi: ['HUN-US'],
    //     coiOperator: 'ALL',
    //     releasabilityTo: ['HUN', 'USA'],
    //     caveats: [],
    //     description: 'Hungary-US bilateral',
    //     weight: 3.6,
    //     industryAllowed: true,
    //     instanceAffinity: ['USA', 'HUN']
    // },

    // ============================================
    // EU (4%) - FRA, DEU instance affinity
    // ============================================
    {
        coi: ['EU-RESTRICTED'],
        coiOperator: 'ALL',
        releasabilityTo: ['FRA', 'DEU', 'ITA', 'ESP', 'POL', 'BEL', 'NLD'],
        caveats: [],
        description: 'EU Restricted (no US)',
        weight: 4,
        industryAllowed: true,
        instanceAffinity: ['FRA', 'DEU']
    },

    // ============================================
    // Regional Commands (18%)
    // ============================================
    {
        coi: ['QUAD'],
        coiOperator: 'ALL',
        releasabilityTo: ['USA', 'AUS', 'IND', 'JPN'],
        caveats: [],
        description: 'Quad partnership',
        weight: 3.6,
        industryAllowed: true,
        instanceAffinity: ['USA']
    },
    {
        coi: ['NORTHCOM'],
        coiOperator: 'ALL',
        releasabilityTo: ['USA', 'CAN', 'MEX'],
        caveats: [],
        description: 'North American Command',
        weight: 3.6,
        industryAllowed: true,
        instanceAffinity: ['USA']
    },
    {
        coi: ['EUCOM'],
        coiOperator: 'ALL',
        releasabilityTo: ['USA', 'DEU', 'GBR', 'FRA', 'ITA', 'ESP', 'POL'],
        caveats: [],
        description: 'European Command partners',
        weight: 3.6,
        industryAllowed: true,
        instanceAffinity: ['USA', 'FRA', 'GBR', 'DEU']
    },
    {
        coi: ['PACOM'],
        coiOperator: 'ALL',
        releasabilityTo: ['USA', 'JPN', 'KOR', 'AUS', 'NZL', 'PHL'],
        caveats: [],
        description: 'Pacific Command partners',
        weight: 3.6,
        industryAllowed: true,
        instanceAffinity: ['USA']
    },
    {
        coi: ['SOCOM'],
        coiOperator: 'ALL',
        releasabilityTo: ['USA', 'GBR', 'CAN', 'AUS', 'NZL'],
        caveats: [],
        description: 'Special Operations Command (FVEY)',
        weight: 3.6,
        industryAllowed: false,
        instanceAffinity: ['USA', 'GBR']
    },

    // ============================================
    // Multi-COI templates (18%) - Varied instance affinity
    // ============================================
    {
        coi: ['NATO', 'QUAD'],
        coiOperator: 'ANY',
        releasabilityTo: ['USA', 'GBR', 'FRA', 'DEU', 'ITA', 'ESP', 'POL', 'CAN', 'AUS', 'IND', 'JPN'],
        caveats: [],
        description: 'NATO + QUAD (Multi-COI with 2 KAOs)',
        weight: 3.6,
        industryAllowed: true,
        instanceAffinity: ['USA']
    },
    {
        coi: ['EUCOM', 'PACOM'],
        coiOperator: 'ANY',
        releasabilityTo: ['USA', 'DEU', 'GBR', 'FRA', 'ITA', 'ESP', 'POL', 'JPN', 'KOR', 'AUS', 'NZL', 'PHL'],
        caveats: [],
        description: 'EUCOM + PACOM (Multi-COI)',
        weight: 3.6,
        industryAllowed: true,
        instanceAffinity: ['USA']
    },
    {
        coi: ['NORTHCOM', 'EUCOM'],
        coiOperator: 'ANY',
        releasabilityTo: ['USA', 'CAN', 'MEX', 'DEU', 'GBR', 'FRA', 'ITA', 'ESP', 'POL'],
        caveats: [],
        description: 'NORTHCOM + EUCOM (Multi-COI)',
        weight: 3.6,
        industryAllowed: true,
        instanceAffinity: ['USA', 'DEU']
    },
    {
        coi: ['CAN-US', 'GBR-US'],
        coiOperator: 'ANY',
        releasabilityTo: ['USA', 'CAN', 'GBR'],
        caveats: [],
        description: 'CAN-US + GBR-US (Multi-bilateral COI)',
        weight: 3.6,
        industryAllowed: true,
        instanceAffinity: ['USA', 'GBR']
    },
    {
        coi: ['FRA-US', 'GBR-US'],
        coiOperator: 'ANY',
        releasabilityTo: ['USA', 'FRA', 'GBR'],
        caveats: [],
        description: 'FRA-US + GBR-US (Multi-bilateral COI)',
        weight: 3.6,
        industryAllowed: true,
        instanceAffinity: ['USA', 'FRA', 'GBR']
    },
    // DEU-specific multi-COI
    {
        coi: ['NATO', 'EU-RESTRICTED'],
        coiOperator: 'ANY',
        releasabilityTo: ['USA', 'GBR', 'FRA', 'DEU', 'ITA', 'ESP', 'POL', 'BEL', 'NLD', 'CAN'],
        caveats: [],
        description: 'NATO + EU (Multi-COI)',
        weight: 3.6,
        industryAllowed: true,
        instanceAffinity: ['FRA', 'DEU']
    },

    // ============================================
    // No-Affiliation COIs (18%) - All instances
    // ============================================
    {
        coi: ['Alpha'],
        coiOperator: 'ALL',
        releasabilityTo: ['USA', 'GBR', 'CAN'],
        caveats: [],
        description: 'Alpha community (no country affiliation)',
        weight: 3.6,
        industryAllowed: true,
        instanceAffinity: ['USA', 'GBR']
    },
    {
        coi: ['Beta'],
        coiOperator: 'ALL',
        releasabilityTo: ['USA', 'FRA', 'DEU'],
        caveats: [],
        description: 'Beta community (no country affiliation)',
        weight: 3.6,
        industryAllowed: true,
        instanceAffinity: ['FRA', 'DEU']
    },
    {
        coi: ['Gamma'],
        coiOperator: 'ALL',
        releasabilityTo: ['USA', 'GBR', 'AUS', 'CAN'],
        caveats: [],
        description: 'Gamma community (no country affiliation)',
        weight: 3.6,
        industryAllowed: true,
        instanceAffinity: ['USA', 'GBR']
    },
    {
        coi: ['Alpha', 'Beta'],
        coiOperator: 'ANY',
        releasabilityTo: ['USA', 'GBR', 'CAN', 'FRA', 'DEU'],
        caveats: [],
        description: 'Alpha + Beta (Multi-COI, no country affiliation)',
        weight: 3.6,
        industryAllowed: true,
        instanceAffinity: ['USA', 'FRA', 'GBR', 'DEU']
    },
    {
        coi: ['Gamma', 'FVEY'],
        coiOperator: 'ANY',
        releasabilityTo: ['USA', 'GBR', 'CAN', 'AUS', 'NZL'],
        caveats: [],
        description: 'Gamma + FVEY (Mixed COI types)',
        weight: 3.6,
        industryAllowed: false,
        instanceAffinity: ['USA', 'GBR']
    },

    // ============================================
    // No COI templates (10%) - Instance-specific releasability
    // ============================================
    {
        coi: [],
        coiOperator: 'ALL',
        releasabilityTo: ['USA'],
        caveats: [],
        description: 'No COI - USA releasability',
        weight: 3.3,
        industryAllowed: true,
        instanceAffinity: ['USA']
    },
    {
        coi: [],
        coiOperator: 'ALL',
        releasabilityTo: ['FRA'],
        caveats: [],
        description: 'No COI - FRA releasability',
        weight: 3.3,
        industryAllowed: true,
        instanceAffinity: ['FRA']
    },
    {
        coi: [],
        coiOperator: 'ALL',
        releasabilityTo: ['GBR'],
        caveats: [],
        description: 'No COI - GBR releasability',
        weight: 3.3,
        industryAllowed: true,
        instanceAffinity: ['GBR']
    },
    {
        coi: [],
        coiOperator: 'ALL',
        releasabilityTo: ['DEU'],
        caveats: [],
        description: 'No COI - DEU releasability',
        weight: 3.3,
        industryAllowed: true,
        instanceAffinity: ['DEU']
    },
    {
        coi: [],
        coiOperator: 'ALL',
        releasabilityTo: ['HUN'],
        caveats: [],
        description: 'No COI - HUN releasability',
        weight: 3.3,
        industryAllowed: true,
        instanceAffinity: ['HUN']
    },
    {
        coi: [],
        coiOperator: 'ALL',
        releasabilityTo: ['USA', 'HUN'],
        caveats: [],
        description: 'No COI - USA-HUN bilateral releasability',
        weight: 3.3,
        industryAllowed: true,
        instanceAffinity: ['USA', 'HUN']
    },
    {
        coi: [],
        coiOperator: 'ALL',
        releasabilityTo: ['USA', 'GBR', 'CAN', 'AUS', 'NZL'],
        caveats: [],
        description: 'No COI - FVEY releasability',
        weight: 3.3,
        industryAllowed: true,
        instanceAffinity: ['USA', 'GBR']
    },
    {
        coi: [],
        coiOperator: 'ALL',
        releasabilityTo: ['USA', 'GBR', 'FRA', 'DEU', 'CAN', 'HUN', 'POL', 'ROU'],
        caveats: [],
        description: 'No COI - NATO subset releasability',
        weight: 3.4,
        industryAllowed: true,
        instanceAffinity: ['USA', 'FRA', 'GBR', 'DEU']
    }
];

// Classification distribution (Realistic weighted - matches DoD/NATO document patterns)
// Best practice: Inverted pyramid reflects real-world classification distribution
// For 5000 docs: ~1000 UNCL, ~750 RESTR, ~1250 CONF, ~1250 SECRET, ~750 TS
const CLASSIFICATION_WEIGHTS: Record<ClassificationLevel, number> = {
    'UNCLASSIFIED': 20,   // 20% - Common operational documents
    'RESTRICTED': 15,     // 15% - Limited distribution
    'CONFIDENTIAL': 25,   // 25% - Most common for gov/mil
    'SECRET': 25,         // 25% - Frequent in coalition ops
    'TOP_SECRET': 15      // 15% - Sparse, high-value intel
};

// ============================================
// DOCUMENT GENERATION
// ============================================

// Instance-specific title templates
const TITLE_TEMPLATES: Record<string, string[]> = {
    USA: [
        'US Defense Strategy', 'Pentagon Analysis', 'DoD Intelligence Brief',
        'CENTCOM Operations', 'State Department Report', 'NSA Assessment',
        'CIA Intelligence Summary', 'USSOCOM Mission Brief', 'Joint Chiefs Report'
    ],
    FRA: [
        'French Defense Ministry Report', 'DGSE Intelligence Brief', 'NATO-FRA Operations',
        'European Security Assessment', 'Ministère des Armées Analysis', 'OTAN Strategic Plan',
        'French Military Intelligence', 'EU Defense Cooperation', 'Mediterranean Security'
    ],
    GBR: [
        'UK Ministry of Defence Report', 'MI6 Intelligence Assessment', 'NATO-GBR Operations',
        'Five Eyes Security Brief', 'British Army Analysis', 'Royal Navy Strategic Plan',
        'GCHQ Signals Intelligence', 'UK Intelligence Summary', 'Commonwealth Security'
    ],
    DEU: [
        'German Defense Ministry Report', 'BND Intelligence Brief', 'NATO-DEU Operations',
        'Bundeswehr Analysis', 'European Security Initiative', 'German Military Intelligence',
        'EU Defense Integration', 'Baltic Security Assessment', 'Central European Strategy'
    ]
};

const TITLE_SUBJECTS = [
    'Northern Flank', 'Southern Theater', 'Eastern Border', 'Western Alliance',
    'Arctic Operations', 'Mediterranean', 'Baltic Sea', 'North Atlantic',
    'Pacific Region', 'Middle East', 'Central Europe', 'Balkans',
    'Cyber Domain', 'Space Operations', 'Maritime Security', 'Air Superiority',
    'Counter-Terrorism', 'Logistics Support', 'Training Exercise', 'Coalition Strategy'
];

function random<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

function weightedRandom<T>(items: T[], weights: number[]): T {
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let random = Math.random() * totalWeight;

    for (let i = 0; i < items.length; i++) {
        if (random < weights[i]) {
            return items[i];
        }
        random -= weights[i];
    }

    return items[items.length - 1];
}

function selectClassification(): ClassificationLevel {
    const levels = Object.keys(CLASSIFICATION_WEIGHTS) as ClassificationLevel[];
    const weights = levels.map(l => CLASSIFICATION_WEIGHTS[l]);
    return weightedRandom(levels, weights);
}

/**
 * Select a COI template with instance-specific weighting
 * Templates with instanceAffinity matching the current instance get boosted weights
 */
function selectCOITemplate(instanceCode: string): ICOITemplate {
    const affinity = INSTANCE_COUNTRY_AFFILIATIONS[instanceCode];
    const weightMultiplier = affinity?.weightMultiplier || 1.0;

    const weights = COI_TEMPLATES.map(t => {
        // Boost weight for templates with instance affinity
        if (t.instanceAffinity?.includes(instanceCode)) {
            return t.weight * weightMultiplier;
        }
        return t.weight;
    });

    return weightedRandom(COI_TEMPLATES, weights);
}

function randomDate(startDate: Date, endDate: Date): Date {
    const start = startDate.getTime();
    const end = endDate.getTime();
    return new Date(start + Math.random() * (end - start));
}

async function createZTDFDocument(
    index: number,
    instanceCode: string,
    kasServers: IKASServer[],
    seedBatchId: string
) {
    // Check if KAS servers are available
    if (!kasServers || kasServers.length === 0) {
        throw new Error(`No KAS servers configured for instance ${instanceCode}. Cannot create ZTDF documents without KAS.`);
    }

    // Validate instance code is valid ISO 3166-1 alpha-3 or custom test code
    if (!validateCountryCode(instanceCode)) {
        throw new Error(`Invalid instance code: ${instanceCode}. Must be ISO 3166-1 alpha-3 (e.g., USA, FRA, GBR) or custom test code (e.g., TST, DEV, QAA).`);
    }

    // Resource ID format: doc-<ISO3166-3>-<batchId>-<sequence>
    // Example: doc-USA-abc12345-00001
    const resourceId = `doc-${instanceCode}-${seedBatchId}-${index.toString().padStart(5, '0')}`;
    const classification = selectClassification();

    // Use instance-weighted COI template selection
    const template = selectCOITemplate(instanceCode);
    const { coi: COI, coiOperator, releasabilityTo, caveats, industryAllowed } = template;

    // Validate all country codes in releasabilityTo are valid ISO 3166-1 alpha-3
    const countryValidation = validateCountryCodes(releasabilityTo);
    if (!countryValidation.valid) {
        throw new Error(
            `Invalid ISO 3166-1 alpha-3 country codes in releasabilityTo: ${countryValidation.invalid.join(', ')}. ` +
            `All country codes must be 3 uppercase letters (e.g., USA, FRA, GBR, DEU).`
        );
    }

    // Validate COI coherence (should always pass for templates)
    const validation = await validateCOICoherence({
        classification,
        releasabilityTo,
        COI,
        coiOperator,
        caveats
    });

    if (!validation.valid) {
        throw new Error(`Template validation failed for ${template.description}: ${validation.errors.join('; ')}`);
    }

    // Random creation date (past 12 months)
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const creationDate = randomDate(oneYearAgo, new Date());
    const currentTimestamp = new Date().toISOString();

    // Instance-specific title
    const titlePrefixes = TITLE_TEMPLATES[instanceCode] || TITLE_TEMPLATES.USA;
    const title = `${random(titlePrefixes)} - ${random(TITLE_SUBJECTS)} ${index}`;

    // Generate content
    const content = `${classification} Document: ${title}\n\n` +
        `This document contains ${classification.toLowerCase()} information for coalition operations.\n` +
        `COI: ${COI.length > 0 ? COI.join(', ') : 'None'} (Operator: ${coiOperator})\n` +
        `Releasable to: ${releasabilityTo.join(', ')}\n` +
        `${caveats.length > 0 ? `Caveats: ${caveats.join(', ')}\n` : ''}` +
        `Industry Accessible: ${industryAllowed ? 'Yes' : 'No'}\n` +
        `\nDocument ID: ${resourceId}\n` +
        `Instance: ${instanceCode}\n` +
        `Created: ${creationDate.toISOString()}\n\n` +
        `OPERATIONAL SUMMARY:\nThis is sample classified content for demonstration purposes.\n` +
        `Template: ${template.description}`;

    // Encrypt content
    const selectedCOI = COI.length > 0 ? COI[0] : 'DEFAULT';
    const encryptionResult = encryptContent(content, resourceId, selectedCOI);
    const wrappedKey = encryptionResult.dek;

    // Create manifest
    const manifest = {
        version: '1.0',
        objectId: resourceId,
        objectType: 'document',
        contentType: 'text/plain',
        owner: `system-seed-${instanceCode.toLowerCase()}`,
        ownerOrganization: `${instanceCode}_GOVERNMENT`,
        createdAt: currentTimestamp,
        payloadSize: Buffer.from(encryptionResult.encryptedData, 'base64').length
    };

    // Create security label with locale-aware classification (ACP-240 Section 4.3)
    const securityLabel = {
        classification,
        originalClassification: getOriginalClassification(instanceCode, classification),
        originalCountry: instanceCode,
        natoEquivalent: classification,
        releasabilityTo,
        COI,
        coiOperator,
        caveats,
        originatingCountry: instanceCode,
        creationDate: currentTimestamp,
        releasableToIndustry: industryAllowed,
        displayMarking: generateDisplayMarking({
            classification,
            releasabilityTo,
            COI,
            coiOperator,
            caveats,
            originatingCountry: instanceCode,
            creationDate: currentTimestamp
        })
    };

    // Create policy assertions
    const policyAssertions = [
        { type: 'clearance-required', value: classification },
        { type: 'countries-allowed', value: releasabilityTo.join(',') },
        { type: 'coi-required', value: COI.join(',') },
        { type: 'coi-operator', value: coiOperator },
        { type: 'industry-access', value: industryAllowed.toString() }
    ];

    // Determine KAS count based on COI
    let kaoCount: number;
    if (COI.length > 1) {
        kaoCount = COI.length; // Multi-COI = 1 KAO per COI
    } else {
        const rand = Math.random();
        if (rand < 0.5) {
            kaoCount = 1; // 50% Single KAS
        } else if (rand < 0.8) {
            kaoCount = 2; // 30% Dual KAS
        } else {
            kaoCount = 3; // 20% Triple KAS
        }
    }

    // Create Key Access Objects using available KAS servers
    const keyAccessObjects = [];
    for (let i = 0; i < Math.min(kaoCount, kasServers.length); i++) {
        const kasServer = kasServers[i];
        const kaoId = COI.length > 1 && i < COI.length
            ? `kao-${COI[i]}-${resourceId}`
            : `kao-${kasServer.kasId}-${i}-${resourceId}`;

        keyAccessObjects.push({
            kaoId,
            kasUrl: `${kasServer.kasUrl}/request-key`,
            kasId: kasServer.kasId,
            wrappedKey,
            wrappingAlgorithm: 'RSA-OAEP-256',
            policyBinding: {
                clearanceRequired: classification,
                countriesAllowed: releasabilityTo,
                coiRequired: COI.length > 1 && i < COI.length ? [COI[i]] : COI
            }
        });
    }

    // If we need more KAOs than available KAS servers, repeat
    while (keyAccessObjects.length < kaoCount) {
        const kasServer = kasServers[keyAccessObjects.length % kasServers.length];
        const i = keyAccessObjects.length;
        keyAccessObjects.push({
            kaoId: `kao-${kasServer.kasId}-${i}-${resourceId}`,
            kasUrl: `${kasServer.kasUrl}/request-key`,
            kasId: kasServer.kasId,
            wrappedKey,
            wrappingAlgorithm: 'RSA-OAEP-256',
            policyBinding: {
                clearanceRequired: classification,
                countriesAllowed: releasabilityTo,
                coiRequired: COI
            }
        });
    }

    // Create policy with hash
    const policy = {
        version: '1.0',
        policyVersion: '1.0',
        securityLabel,
        policyAssertions
    };
    const policyHash = computeObjectHash(policy);
    const policyWithHash = { ...policy, policyHash };

    // Create encrypted chunk
    const chunk = {
        chunkId: 0,
        encryptedData: encryptionResult.encryptedData,
        integrityHash: computeSHA384(encryptionResult.encryptedData),
        size: Buffer.from(encryptionResult.encryptedData, 'base64').length
    };

    // Create payload
    const payload = {
        encryptionAlgorithm: 'AES-256-GCM',
        iv: encryptionResult.iv,
        authTag: encryptionResult.authTag,
        keyAccessObjects,
        encryptedChunks: [chunk],
        payloadHash: computeSHA384(chunk.encryptedData)
    };

    // Assemble ZTDF object
    const ztdfObject = { manifest, policy: policyWithHash, payload };

    return {
        resourceId,
        title,
        // Top-level fields for search/filter compatibility
        classification,
        releasableTo: releasabilityTo, // FIXED: Use correct field name (releasableTo not releasabilityTo)
        COI,
        coiOperator,
        encrypted: true,
        encryptedContent: chunk.encryptedData,
        releasableToIndustry: industryAllowed,
        originRealm: instanceCode,
        // Country for localized classification normalization (ACP-240)
        country: instanceCode,
        // ZTDF structure
        ztdf: ztdfObject,
        // Legacy structure (kept for backwards compatibility)
        legacy: {
            classification,
            releasableTo: releasabilityTo, // FIXED: Use correct field name
            COI,
            coiOperator,
            encrypted: true,
            encryptedContent: chunk.encryptedData,
            releasableToIndustry: industryAllowed
        },
        seedBatchId,
        instanceCode,
        createdAt: creationDate,
        updatedAt: new Date()
    };
}

// ============================================
// SEEDING ORCHESTRATION
// ============================================

async function seedInstance(
    instanceCode: string,
    options: ISeedOptions,
    federationRegistry: IFederationRegistry,
    kasRegistry: IKASRegistry
): Promise<ISeedManifest> {
    const startTime = Date.now();
    const seedBatchId = `seed-${Date.now()}`;
    const config = getInstanceConfig(federationRegistry, instanceCode);

    // Get MongoDB connection details from GCP Secret Manager or environment
    const gcpAvailable = await isGCPSecretsAvailable();
    const mongoConnection = await getMongoDBConnection(config, instanceCode);
    const kasServers = getKASServersForInstance(kasRegistry, instanceCode);

    console.log(`\n🌱 Seeding ${instanceCode} (${config.name})`);
    console.log(`   MongoDB: ${mongoConnection.database} @ port ${config.services.mongodb.externalPort}`);
    console.log(`   Secrets: ${gcpAvailable ? '🔐 GCP Secret Manager' : '📁 Environment Variables'}`);
    console.log(`   KAS Servers: ${kasServers.map(k => k.kasId).join(', ')}`);
    console.log(`   Documents: ${options.count}`);
    console.log(`   Batch Size: ${options.batchSize}`);
    console.log(`   Mode: ${options.dryRun ? 'DRY RUN' : (options.replace ? 'REPLACE' : 'APPEND')}\n`);

    // Initialize distribution counters
    const distribution: ISeedManifest['distribution'] = {
        byClassification: {},
        byCOI: {},
        byKASCount: {},
        byIndustryAccess: { 'true': 0, 'false': 0 }
    };

    // Validate instance code is ISO 3166-1 alpha-3 or custom test code
    if (!validateCountryCode(instanceCode)) {
        const allCodes = [...Object.keys(ISO_3166_1_ALPHA_3), ...Object.keys(CUSTOM_TEST_CODES)];
        throw new Error(`Invalid instance code: ${instanceCode}. Valid codes: ${allCodes.join(', ')}`);
    }

    // Display validation message with appropriate label
    const codeName = ISO_3166_1_ALPHA_3[instanceCode] || CUSTOM_TEST_CODES[instanceCode] || instanceCode;
    const codeType = isCustomTestCode(instanceCode) ? 'Custom Test Code' : 'ISO 3166-1 alpha-3';
    console.log(`   ✅ Instance Code ${instanceCode} validated (${codeType}: ${codeName})\n`);

    if (options.dryRun) {
        console.log('🧪 DRY RUN: Validating templates and showing expected distribution...\n');
        console.log(`   Instance-weighted COI selection for: ${instanceCode}`);
        const affinity = INSTANCE_COUNTRY_AFFILIATIONS[instanceCode];
        if (affinity) {
            console.log(`   Preferred COIs: ${affinity.preferredCOIs.join(', ')}`);
            console.log(`   Weight Multiplier: ${affinity.weightMultiplier}x\n`);
        }

        // Simulate distribution with instance-weighted COI selection
        for (let i = 0; i < options.count; i++) {
            const classification = selectClassification();
            const template = selectCOITemplate(instanceCode); // Instance-weighted selection

            distribution.byClassification[classification] = (distribution.byClassification[classification] || 0) + 1;

            const coiKey = template.coi.length > 0 ? template.coi[0] : 'NO_COI';
            distribution.byCOI[coiKey] = (distribution.byCOI[coiKey] || 0) + 1;

            const kaoCount = template.coi.length > 1 ? template.coi.length : (Math.random() < 0.5 ? 1 : (Math.random() < 0.67 ? 2 : 3));
            distribution.byKASCount[kaoCount.toString()] = (distribution.byKASCount[kaoCount.toString()] || 0) + 1;

            distribution.byIndustryAccess[template.industryAllowed.toString()]++;
        }

        showDistributionSummary(distribution, options.count);

        return {
            instanceCode,
            instanceName: config.name,
            timestamp: new Date().toISOString(),
            version: '1.0.0',
            totalDocuments: options.count,
            distribution,
            seedBatchId,
            duration_ms: Date.now() - startTime,
            mongodbUri: `mongodb://***@localhost:${config.services.mongodb.externalPort}/${config.mongodb.database}`
        };
    }

    // Connect to MongoDB with credentials from GCP Secret Manager
    const client = new MongoClient(mongoConnection.uri, {
        auth: {
            username: mongoConnection.user,
            password: mongoConnection.password
        },
        authSource: 'admin',
        connectTimeoutMS: 10000,
        serverSelectionTimeoutMS: 10000
    });

    try {
        await client.connect();
        console.log('✅ Connected to MongoDB\n');

        // CRITICAL: Use database from mongoConnection (from MONGODB_URL), not config
        const db = client.db(mongoConnection.database);
        const collection = db.collection('resources');

        // Create indexes
        await collection.createIndex({ resourceId: 1 }, { unique: true });
        await collection.createIndex({ 'ztdf.policy.securityLabel.classification': 1 });
        await collection.createIndex({ 'ztdf.policy.securityLabel.COI': 1 });
        await collection.createIndex({ seedBatchId: 1 });
        await collection.createIndex({ instanceCode: 1 });

        // Clear existing if replace mode - DELETE ALL RESOURCES FOR THIS INSTANCE
        // This ensures no legacy plaintext resources remain (ACP-240 compliance)
        if (options.replace) {
            // First, delete all legacy patterns (ita-intel-*, ita-doc-*, etc.)
            const legacyPattern = new RegExp(`^${instanceCode.toLowerCase()}-`);
            const legacyResult = await collection.deleteMany({
                resourceId: { $regex: legacyPattern }
            });

            // Then delete ZTDF pattern resources
            const ztdfResult = await collection.deleteMany({
                $or: [
                    { resourceId: { $regex: /^doc-/ } },
                    { seedBatchId: { $exists: true } },
                    { instanceCode: instanceCode },
                    { instance: instanceCode }
                ]
            });

            const totalDeleted = legacyResult.deletedCount + ztdfResult.deletedCount;
            console.log(`🗑️  Deleted ${totalDeleted} existing documents (${legacyResult.deletedCount} legacy + ${ztdfResult.deletedCount} ZTDF)\n`);
            console.log(`   ✅ All plaintext resources removed - ACP-240 compliance ensured\n`);
        }

        // Initialize checkpoint for resilience
        const checkpoint: ISeedCheckpoint = {
            instanceCode,
            seedBatchId,
            totalCount: options.count,
            completedCount: 0,
            lastCompletedBatch: -1,
            startTime: new Date().toISOString(),
            lastUpdateTime: new Date().toISOString(),
            status: 'in_progress'
        };
        saveCheckpoint(checkpoint);
        console.log(`💾 Checkpoint created: ${seedBatchId}\n`);

        // Seed in batches with checkpoint tracking
        const totalBatches = Math.ceil(options.count / options.batchSize);
        let successfulBatches = 0;
        let failedAttempts = 0;
        const MAX_RETRY_ATTEMPTS = 3;

        for (let batch = 0; batch < totalBatches; batch++) {
            const batchStart = batch * options.batchSize;
            const batchEnd = Math.min(batchStart + options.batchSize, options.count);
            const documents = [];

            try {
                // Generate documents for this batch
                const batchPromises = [];
                for (let i = batchStart; i < batchEnd; i++) {
                    batchPromises.push(createZTDFDocument(i + 1, instanceCode, kasServers, seedBatchId));
                }

                const batchDocs = await Promise.all(batchPromises);

                // Update distribution counters
                for (const doc of batchDocs) {
                    const classification = doc.legacy.classification;
                    distribution.byClassification[classification] = (distribution.byClassification[classification] || 0) + 1;

                    const coiKey = doc.legacy.COI.length > 0 ? doc.legacy.COI[0] : 'NO_COI';
                    distribution.byCOI[coiKey] = (distribution.byCOI[coiKey] || 0) + 1;

                    const kaoCount = doc.ztdf.payload.keyAccessObjects.length.toString();
                    distribution.byKASCount[kaoCount] = (distribution.byKASCount[kaoCount] || 0) + 1;

                    distribution.byIndustryAccess[doc.legacy.releasableToIndustry?.toString() || 'false']++;
                }

                documents.push(...batchDocs);

                // Insert batch with retry logic
                let insertSuccess = false;
                for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS && !insertSuccess; attempt++) {
                    try {
                        await collection.insertMany(documents, { ordered: false });
                        insertSuccess = true;
                    } catch (insertError: unknown) {
                        const err = insertError as { code?: number; message?: string };
                        if (err.code === 11000) {
                            // Duplicate key error - documents already exist, consider it success
                            console.log(`\n   ⚠️  Batch ${batch + 1}: Some documents already exist (skipping duplicates)`);
                            insertSuccess = true;
                        } else if (attempt < MAX_RETRY_ATTEMPTS - 1) {
                            console.log(`\n   ⚠️  Batch ${batch + 1} insert failed (attempt ${attempt + 1}/${MAX_RETRY_ATTEMPTS}), retrying...`);
                            await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                        } else {
                            throw insertError;
                        }
                    }
                }

                // Update checkpoint
                successfulBatches++;
                checkpoint.completedCount = batchEnd;
                checkpoint.lastCompletedBatch = batch;
                checkpoint.lastUpdateTime = new Date().toISOString();
                saveCheckpoint(checkpoint);

                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                const docsPerSec = ((batchEnd) / (Date.now() - startTime) * 1000).toFixed(1);

                if (options.verbose) {
                    console.log(`   ✅ Batch ${batch + 1}/${totalBatches}: ${batchEnd - batchStart} docs (${batchStart + 1}-${batchEnd}) | ${elapsed}s | ${docsPerSec} docs/s`);
                } else {
                    process.stdout.write(`\r   ✅ Progress: ${batchEnd}/${options.count} (${Math.round(batchEnd / options.count * 100)}%)`);
                }

                failedAttempts = 0; // Reset failed attempts on success

            } catch (batchError) {
                failedAttempts++;
                console.error(`\n   ❌ Batch ${batch + 1} failed: ${batchError}`);

                if (failedAttempts >= MAX_RETRY_ATTEMPTS) {
                    checkpoint.status = 'failed';
                    checkpoint.error = `Failed at batch ${batch + 1}: ${batchError}`;
                    checkpoint.lastUpdateTime = new Date().toISOString();
                    saveCheckpoint(checkpoint);
                    throw new Error(`Seeding failed after ${MAX_RETRY_ATTEMPTS} consecutive batch failures. Checkpoint saved for recovery.`);
                }

                // Retry the same batch
                batch--;
                await new Promise(r => setTimeout(r, 2000));
            }
        }

        console.log('\n');
        showDistributionSummary(distribution, options.count);

        // Verify count
        const totalCount = await collection.countDocuments({ seedBatchId });
        console.log(`\n✅ Verified: ${totalCount} documents seeded to ${instanceCode}\n`);

        // Mark checkpoint as completed
        checkpoint.status = 'completed';
        checkpoint.completedCount = totalCount;
        checkpoint.lastUpdateTime = new Date().toISOString();
        saveCheckpoint(checkpoint);
        console.log(`💾 Checkpoint marked as completed\n`);

        const duration = Date.now() - startTime;
        const manifest: ISeedManifest = {
            instanceCode,
            instanceName: config.name,
            timestamp: new Date().toISOString(),
            version: '1.0.0',
            totalDocuments: totalCount,
            distribution,
            seedBatchId,
            duration_ms: duration,
            mongodbUri: `mongodb://***@localhost:${config.services.mongodb.externalPort}/${config.mongodb.database}`
        };

        // Save manifest
        const manifestPath = path.join(SEED_LOG_DIR, `seed-manifest-${instanceCode.toLowerCase()}-${seedBatchId}.json`);
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
        console.log(`📋 Manifest saved: ${manifestPath}\n`);

        // Clean up checkpoint after successful completion
        deleteCheckpoint(instanceCode, seedBatchId);
        console.log(`🗑️  Checkpoint cleaned up\n`);

        return manifest;

    } finally {
        await client.close();
    }
}

function showDistributionSummary(distribution: ISeedManifest['distribution'], total: number): void {
    console.log('📊 Distribution Summary:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('Classification:');
    for (const [key, value] of Object.entries(distribution.byClassification).sort()) {
        const pct = ((value / total) * 100).toFixed(1);
        console.log(`   ${key.padEnd(15)} ${value.toString().padStart(6)} (${pct.padStart(5)}%)`);
    }

    console.log('\nTop COIs:');
    const sortedCOIs = Object.entries(distribution.byCOI)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
    for (const [key, value] of sortedCOIs) {
        const pct = ((value / total) * 100).toFixed(1);
        console.log(`   ${key.padEnd(15)} ${value.toString().padStart(6)} (${pct.padStart(5)}%)`);
    }

    console.log('\nKAS Distribution:');
    for (const [key, value] of Object.entries(distribution.byKASCount).sort()) {
        const pct = ((value / total) * 100).toFixed(1);
        const label = key === '1' ? 'Single KAS' : `${key} KAS (Multi)`;
        console.log(`   ${label.padEnd(15)} ${value.toString().padStart(6)} (${pct.padStart(5)}%)`);
    }

    console.log('\nIndustry Access:');
    const industryYes = distribution.byIndustryAccess['true'] || 0;
    const industryNo = distribution.byIndustryAccess['false'] || 0;
    console.log(`   Allowed:       ${industryYes.toString().padStart(6)} (${((industryYes / total) * 100).toFixed(1).padStart(5)}%)`);
    console.log(`   Gov-Only:      ${industryNo.toString().padStart(6)} (${((industryNo / total) * 100).toFixed(1).padStart(5)}%)`);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

// ============================================
// MAIN
// ============================================

async function main() {
    console.log('\n╔══════════════════════════════════════════════════════════════════╗');
    console.log('║       DIVE V3 - Instance-Aware Resource Seeding Script           ║');
    console.log('║       Version 1.0.0 - November 29, 2025                           ║');
    console.log('╚══════════════════════════════════════════════════════════════════╝\n');

    // Clean up old seed manifest files before starting
    cleanupOldManifests();

    const options = parseArgs();

    // Load configurations
    console.log('📋 Loading configuration...');
    const federationRegistry = loadFederationRegistry();
    const kasRegistry = await loadKASRegistry();
    console.log(`   Found ${Object.keys(federationRegistry.instances).length} instances`);
    console.log(`   Found ${kasRegistry.kasServers?.length || 0} KAS servers\n`);

    // Validate COI templates
    console.log('✅ Validating COI templates...');
    for (const template of COI_TEMPLATES) {
        const validation = await validateCOICoherence({
            classification: 'SECRET',
            releasabilityTo: template.releasabilityTo,
            COI: template.coi,
            coiOperator: template.coiOperator,
            caveats: template.caveats
        });

        if (!validation.valid) {
            console.error(`❌ Template validation failed: ${template.description}`);
            console.error(`   Errors: ${validation.errors.join('; ')}`);
            process.exit(1);
        }
    }
    console.log(`   ✅ All ${COI_TEMPLATES.length} templates validated\n`);

    const manifests: ISeedManifest[] = [];

    if (options.instance === 'ALL') {
        // Seed all instances
        for (const instanceKey of Object.keys(federationRegistry.instances)) {
            const instanceCode = instanceKey.toUpperCase();
            try {
                const manifest = await seedInstance(instanceCode, options, federationRegistry, kasRegistry);
                manifests.push(manifest);
            } catch (error) {
                console.error(`❌ Failed to seed ${instanceCode}:`, error);
            }
        }
    } else {
        // Seed single instance
        const manifest = await seedInstance(options.instance, options, federationRegistry, kasRegistry);
        manifests.push(manifest);
    }

    // Summary
    console.log('\n╔══════════════════════════════════════════════════════════════════╗');
    console.log('║                       SEEDING COMPLETE                            ║');
    console.log('╠══════════════════════════════════════════════════════════════════╣');

    let totalDocs = 0;
    let totalTime = 0;

    for (const manifest of manifests) {
        totalDocs += manifest.totalDocuments;
        totalTime += manifest.duration_ms;
        console.log(`║  ${manifest.instanceCode.padEnd(4)} (${manifest.instanceName.padEnd(20)}): ${manifest.totalDocuments.toString().padStart(6)} docs in ${(manifest.duration_ms / 1000).toFixed(1)}s`);
    }

    console.log('╠══════════════════════════════════════════════════════════════════╣');
    console.log(`║  Total: ${totalDocs.toString().padStart(6)} documents in ${(totalTime / 1000).toFixed(1)}s`);
    console.log('╚══════════════════════════════════════════════════════════════════╝\n');
}

// Run
main()
    .then(() => {
        console.log('✅ Seeding script completed successfully\n');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Seeding script failed:', error);
        process.exit(1);
    });
