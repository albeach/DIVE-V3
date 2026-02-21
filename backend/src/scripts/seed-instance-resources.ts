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

import { Db, Collection } from 'mongodb';
import * as fs from 'fs';
import * as path from 'path';
import { generateDisplayMarking, COIOperator, ClassificationLevel } from '../types/ztdf.types';
import { encryptContent, computeSHA384, computeObjectHash } from '../utils/ztdf.utils';
import { validateCOICoherence } from '../services/coi-validation.service';
import { getMongoDBPassword, isGCPSecretsAvailable } from '../utils/gcp-secrets';
import { CLEARANCE_EQUIVALENCY_TABLE } from '../services/clearance-mapper.service';
import { getDb, mongoSingleton } from '../utils/mongodb-singleton';
import { getSecureHttpsAgent } from '../utils/https-agent';

// ============================================
// CONFIGURATION
// ============================================

// Detect if running inside Docker container
const IS_DOCKER = process.env.CONTAINER === 'docker' || fs.existsSync('/.dockerenv') || (process.env.HOSTNAME?.startsWith('dive-v3'));

// Resolve paths differently for Docker vs local execution
const BACKEND_ROOT = IS_DOCKER ? '/app' : path.resolve(__dirname, '../..');
const PROJECT_ROOT = IS_DOCKER ? '/app' : path.resolve(__dirname, '../../..');
// REMOVED: JSON file paths - all data must come from MongoDB (SSOT)
// Federation registry: MongoDB federation_spokes collection (via Hub API)
// KAS registry: MongoDB kas_registry collection (via Hub API or local MongoDB)
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
 * Derived from CLEARANCE_EQUIVALENCY_TABLE (SSOT) — takes the first
 * national equivalent for each country at each level.
 *
 * Countries not in the SSOT fall back to NATO standard labels via
 * getOriginalClassification().
 */
const LOCALE_CLASSIFICATIONS: Record<string, Record<string, string>> = {};
for (const mapping of CLEARANCE_EQUIVALENCY_TABLE) {
    for (const [country, variants] of Object.entries(mapping.nationalEquivalents)) {
        if (country === 'INDUSTRY') continue;
        if (!LOCALE_CLASSIFICATIONS[country]) {
            LOCALE_CLASSIFICATIONS[country] = {};
        }
        LOCALE_CLASSIFICATIONS[country][mapping.standardLevel] = variants[0];
    }
}

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
// MULTI-FILE TYPE SEEDING CONFIGURATION
// ============================================

/**
 * File type categories for distribution grouping
 */
type FileTypeCategory = 'document' | 'structured' | 'presentation' | 'multimedia' | 'image' | 'text';

/**
 * Configuration for each supported file type
 */
interface IFileTypeConfig {
    /** MIME type (e.g., 'application/pdf') */
    mimeType: string;
    /** File extension without dot (e.g., 'pdf') */
    extension: string;
    /** Category for grouping */
    category: FileTypeCategory;
    /** Distribution weight (relative percentage) */
    weight: number;
    /** Template filenames from examples directory */
    templates: string[];
    /** Whether to generate XMP sidecar */
    generateXMP: boolean;
    /** Display name for logging */
    displayName: string;
}

/**
 * Loaded template file with metadata
 */
interface ITemplateFile {
    filename: string;
    buffer: Buffer;
    mimeType: string;
    extension: string;
    size: number;
    sha256: string;
}

/**
 * Template cache for performance
 */
interface ITemplateCache {
    templates: Map<string, ITemplateFile[]>;
    loaded: boolean;
    loadedAt?: Date;
}

/**
 * File type configurations with templates from /examples/examples/
 * Weights sum to 100 for realistic distribution
 */
const FILE_TYPE_CONFIGS: IFileTypeConfig[] = [
    // Documents (40% total)
    {
        mimeType: 'application/pdf',
        extension: 'pdf',
        category: 'document',
        weight: 20,
        templates: ['pdf_NU_d5a24f38.pdf', 'pdf_NR_3b4603b8.pdf', 'pdf_NC_5adbce6e.pdf'],
        generateXMP: true,
        displayName: 'PDF'
    },
    {
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        extension: 'docx',
        category: 'document',
        weight: 20,
        templates: ['docx_NU_a3c05573.docx', 'docx_NR_a53cb023.docx', 'docx_NC_82797d3f.docx'],
        generateXMP: false,
        displayName: 'Word Document'
    },
    // Presentations (10%)
    {
        mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        extension: 'pptx',
        category: 'presentation',
        weight: 10,
        templates: ['pptx_NU_d84ede3a.pptx', 'pptx_NR_56001dc4.pptx', 'pptx_NC_8887cb3c.pptx'],
        generateXMP: false,
        displayName: 'PowerPoint'
    },
    // Structured Data (20% total)
    {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        extension: 'xlsx',
        category: 'structured',
        weight: 8,
        templates: ['xlsx_NU_1cc225f0.xlsx', 'xlsx_NR_79a55828.xlsx', 'xlsx_NC_5cd830e9.xlsx'],
        generateXMP: false,
        displayName: 'Excel'
    },
    {
        mimeType: 'application/json',
        extension: 'json',
        category: 'structured',
        weight: 5,
        templates: ['json_NC_1227530e.json'],
        generateXMP: false,
        displayName: 'JSON'
    },
    {
        mimeType: 'text/csv',
        extension: 'csv',
        category: 'structured',
        weight: 4,
        templates: ['csv_NR_d33bce9e.csv'],
        generateXMP: false,
        displayName: 'CSV'
    },
    {
        mimeType: 'application/xml',
        extension: 'xml',
        category: 'structured',
        weight: 3,
        templates: ['xml_NU_1e1919b9.xml'],
        generateXMP: false,
        displayName: 'XML'
    },
    // Multimedia (15% total)
    {
        mimeType: 'video/mp4',
        extension: 'mp4',
        category: 'multimedia',
        weight: 7,
        templates: ['mp4_NU_sample.mp4'],
        generateXMP: true,
        displayName: 'MP4 Video'
    },
    {
        mimeType: 'audio/mpeg',
        extension: 'mp3',
        category: 'multimedia',
        weight: 4,
        templates: ['mp3_NU_sample.mp3'],
        generateXMP: true,
        displayName: 'MP3 Audio'
    },
    {
        mimeType: 'audio/mp4',
        extension: 'm4a',
        category: 'multimedia',
        weight: 4,
        templates: ['m4a_NU_sample.m4a'],
        generateXMP: true,
        displayName: 'M4A Audio'
    },
    // Images (10% total)
    {
        mimeType: 'image/jpeg',
        extension: 'jpg',
        category: 'image',
        weight: 7,
        templates: ['jpg_NC_d4fbd366.jpg'],
        generateXMP: true,
        displayName: 'JPEG Image'
    },
    {
        mimeType: 'image/png',
        extension: 'png',
        category: 'image',
        weight: 3,
        templates: ['NATO_UNCLASSIFIED_marking_frame_v2.png'],
        generateXMP: true,
        displayName: 'PNG Image'
    },
    // Text (5% total)
    {
        mimeType: 'text/plain',
        extension: 'txt',
        category: 'text',
        weight: 3,
        templates: ['txt_NU_cc4a1101.txt'],
        generateXMP: false,
        displayName: 'Text'
    },
    {
        mimeType: 'text/html',
        extension: 'html',
        category: 'text',
        weight: 2,
        templates: ['html_NR_6de40c5e.html'],
        generateXMP: false,
        displayName: 'HTML'
    }
];

/**
 * Template cache - loaded on first use
 */
const templateCache: ITemplateCache = {
    templates: new Map(),
    loaded: false
};

/**
 * Template directory path
 */
const TEMPLATE_DIR = IS_DOCKER
    ? '/app/examples/examples'
    : path.join(PROJECT_ROOT, 'examples/examples');

/**
 * Load all template files from examples directory into cache
 */
async function loadTemplates(): Promise<void> {
    if (templateCache.loaded) return;

    console.log(`\n📁 Loading template files from ${TEMPLATE_DIR}...\n`);

    if (!fs.existsSync(TEMPLATE_DIR)) {
        console.warn(`   ⚠️  Template directory not found: ${TEMPLATE_DIR}`);
        console.warn(`   Multi-file seeding will fall back to text-only mode`);
        templateCache.loaded = true;
        return;
    }

    let totalLoaded = 0;

    for (const config of FILE_TYPE_CONFIGS) {
        const templates: ITemplateFile[] = [];

        for (const filename of config.templates) {
            const filePath = path.join(TEMPLATE_DIR, filename);

            if (!fs.existsSync(filePath)) {
                console.warn(`   ⚠️  Template not found: ${filename}`);
                continue;
            }

            try {
                const buffer = fs.readFileSync(filePath);
                const crypto = await import('crypto');
                const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

                templates.push({
                    filename,
                    buffer,
                    mimeType: config.mimeType,
                    extension: config.extension,
                    size: buffer.length,
                    sha256
                });
            } catch (err) {
                console.warn(`   ⚠️  Failed to load template ${filename}: ${err}`);
            }
        }

        if (templates.length > 0) {
            templateCache.templates.set(config.extension, templates);
            totalLoaded += templates.length;
            console.log(`   ✅ Loaded ${templates.length} ${config.displayName} template(s)`);
        }
    }

    templateCache.loaded = true;
    templateCache.loadedAt = new Date();
    console.log(`\n   Total: ${totalLoaded} templates loaded\n`);
}

/**
 * Select file type based on configured weights
 */
function selectFileType(configs: IFileTypeConfig[] = FILE_TYPE_CONFIGS): IFileTypeConfig {
    const weights = configs.map(c => c.weight);
    return weightedRandom(configs, weights);
}

/**
 * Select random template for a file type from cache
 */
function selectTemplate(extension: string): ITemplateFile | null {
    const templates = templateCache.templates.get(extension);
    if (!templates || templates.length === 0) return null;
    return random(templates);
}

/**
 * Generate STANAG 4778 BDO (Binding Data Object) XML for a seeded resource
 * Compliant with ADatP-4778.2 Edition A sidecar binding profile
 */
function generateBDO(
    filename: string,
    mimeType: string,
    metadata: {
        classification: ClassificationLevel;
        resourceId: string;
        creationDateTime: string;
    }
): string {
    // Map DIVE classification levels to NATO marking text
    const classificationMap: Record<string, string> = {
        'UNCLASSIFIED': 'UNCLASSIFIED',
        'RESTRICTED': 'RESTRICTED',
        'CONFIDENTIAL': 'CONFIDENTIAL',
        'SECRET': 'SECRET',
        'TOP_SECRET': 'TOP SECRET'
    };

    const natoClassification = classificationMap[metadata.classification] || metadata.classification;

    return `<?xml version="1.0" encoding="UTF-8"?>
<mb:BindingInformation xmlns:mb="urn:nato:stanag:4778:bindinginformation:1:0"
                       xmlns:xmime="http://www.w3.org/2005/05/xmlmime">
  <mb:MetadataBindingContainer>
    <mb:MetadataBinding>
      <mb:Metadata>
        <slab:originatorConfidentialityLabel xmlns:slab="urn:nato:stanag:4774:confidentialitymetadatalabel:1:0">
          <slab:ConfidentialityInformation>
            <slab:PolicyIdentifier>NATO</slab:PolicyIdentifier>
            <slab:Classification>${natoClassification}</slab:Classification>
          </slab:ConfidentialityInformation>
          <slab:CreationDateTime>${metadata.creationDateTime}</slab:CreationDateTime>
        </slab:originatorConfidentialityLabel>
      </mb:Metadata>
      <mb:DataReference URI="./${filename}" xmime:contentType="${mimeType}" />
    </mb:MetadataBinding>
  </mb:MetadataBindingContainer>
</mb:BindingInformation>`;
}

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
    federationAgreements?: Record<string, unknown>[];
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
        byFileType?: Record<string, number>;
    };
    seedBatchId: string;
    duration_ms: number;
    mongodbUri: string; // Sanitized
    fileTypeMode?: 'text' | 'multi';
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
    /** File type mode: 'text' (legacy), 'multi' (new default) */
    fileTypeMode: 'text' | 'multi';
    /** Exclude multimedia files (video/audio) for faster seeding */
    noMultimedia: boolean;
}

function parseArgs(): ISeedOptions {
    const args = process.argv.slice(2);

    // INSTANCE_CODE from environment takes precedence (ISO 3166-1 alpha-3)
    // This enables Docker exec with: INSTANCE_CODE=EST npm run seed:instance
    const envInstance = process.env.INSTANCE_CODE?.toUpperCase();

    // Check environment for file type mode
    const envFileTypeMode = process.env.SEED_FILE_TYPE_MODE?.toLowerCase();

    const options: ISeedOptions = {
        instance: envInstance || 'USA',  // Use env var or default to USA
        count: 5000,  // Default: 5000 ZTDF encrypted documents per instance
        dryRun: false,
        replace: false,
        batchSize: 100,
        verbose: false,
        fileTypeMode: (envFileTypeMode === 'text' || envFileTypeMode === 'multi') ? envFileTypeMode : 'multi',
        noMultimedia: process.env.SEED_NO_MULTIMEDIA === 'true'
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
        } else if (arg.startsWith('--file-type-mode=')) {
            const mode = arg.split('=')[1].toLowerCase();
            if (mode === 'text' || mode === 'multi') {
                options.fileTypeMode = mode;
            } else {
                console.warn(`⚠️  Invalid file type mode: ${mode}. Using default 'multi'.`);
            }
        } else if (arg === '--no-multimedia') {
            options.noMultimedia = true;
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
DIVE V3 - Instance-Aware Multi-Format Resource Seeding Script

USAGE:
    npm run seed:instance -- [OPTIONS]

OPTIONS:
    --instance=CODE         Instance to seed: USA, FRA, GBR, DEU, or ALL (default: USA)
    --count=N               Number of documents to seed (1-20000, default: 5000)
    --file-type-mode=MODE   File type mode: text, multi (default: multi)
    --no-multimedia         Exclude video/audio files from seeding (faster)
    --dry-run               Validate templates and show distribution without seeding
    --replace               Delete existing generated documents before seeding
    --batch-size=N          Documents per batch (default: 100)
    --verbose, -v           Show detailed progress
    --help, -h              Show this help message

FILE TYPE MODES:
    text    - Text files only (legacy behavior, fastest)
    multi   - Multiple file types with realistic distribution (recommended):
              PDF (20%), DOCX (20%), XLSX (8%), PPTX (10%), MP4 (7%),
              MP3 (4%), M4A (4%), JPG (7%), PNG (3%), JSON (5%),
              CSV (4%), XML (3%), TXT (3%), HTML (2%)

ENVIRONMENT VARIABLES:
    SEED_FILE_TYPE_MODE     Set default file type mode (text, multi)
    SEED_NO_MULTIMEDIA      Set to 'true' to exclude video/audio

EXAMPLES:
    npm run seed:instance -- --instance=USA                       # Seed 5000 multi-type docs
    npm run seed:instance -- --instance=USA --file-type-mode=text # Text-only (legacy)
    npm run seed:instance -- --instance=USA --no-multimedia       # Skip video/audio
    npm run seed:instance -- --instance=FRA --count=5000          # Seed 5000 docs to FRA
    npm run seed:instance -- --instance=ALL                       # Seed all instances
    npm run seed:instance -- --dry-run --instance=GBR             # Validate without seeding
    npm run seed:instance -- --instance=DEU --replace             # Replace existing data
    `);
}

// ============================================
// CONFIGURATION LOADERS
// ============================================

/**
 * Load federation registry from MongoDB (SSOT) - NO JSON FILES
 *
 * For Hub: Query local MongoDB federation_spokes collection
 * For Spokes: Query Hub API /api/federation/spokes
 */
async function loadFederationRegistry(): Promise<IFederationRegistry> {
    const instanceCode = process.env.INSTANCE_CODE || 'USA';
    const isSpoke = instanceCode !== 'USA';

    if (isSpoke) {
        // Spoke mode: Query Hub API
        try {
            // NOTE: localhost fallback is acceptable for seeding scripts running in Docker
            // This is a development/testing environment, not production code
            const hubBackendUrl = process.env.HUB_BACKEND_URL || process.env.BACKEND_URL || 'https://localhost:4000';
            const axios = (await import('axios')).default;

            console.log(`   🔍 Querying Hub federation registry API (spoke mode: ${instanceCode})`);
            const response = await axios.get(`${hubBackendUrl}/api/federation/spokes`, {
                httpsAgent: getSecureHttpsAgent(),
                timeout: 10000
            });

            if (response.data?.spokes) {
                const spokes = response.data.spokes;
                console.log(`   ✅ Loaded ${spokes.length} spokes from Hub registry (federated mode)`);

                // Convert API response to legacy format
                const instances: Record<string, IInstanceConfig> = {};
                for (const spoke of spokes) {
                    instances[spoke.instanceCode.toLowerCase()] = {
                        instanceCode: spoke.instanceCode,
                        name: spoke.name,
                        services: {
                            frontend: { externalPort: spoke.frontendPort || 3000 },
                            backend: { externalPort: spoke.backendPort || 4000 },
                            keycloak: { externalPort: spoke.keycloakPort || 8443 }
                        }
                    };
                }

                return { instances, version: '2.0' };
            }
        } catch (error) {
            // IMPROVED (2026-01-28): Better error diagnostics for federation registry failures
            const errorMsg = error instanceof Error ? error.message : 'Unknown';
            const axiosError = error as any;

            if (axiosError?.response?.status === 401) {
                console.warn(`   ⚠️ Hub federation registry API returned 401 (Unauthorized)`);
                console.warn(`   ℹ️  This is OK during initial deployment - falling back to local MongoDB`);
            } else if (axiosError?.code === 'ECONNREFUSED') {
                console.warn(`   ⚠️ Hub backend not reachable - falling back to local MongoDB`);
            } else {
                console.warn(`   ⚠️ Could not query Hub federation registry API: ${errorMsg}`);
            }
            console.warn(`   ℹ️  Will attempt to load federation data from local MongoDB instead`);
        }
    }

    // Hub mode: Query local MongoDB
    try {
        await mongoSingleton.connect();
        const db = getDb();
        const collection = db.collection('federation_spokes');

        const spokes = await collection.find({}).toArray();
        // Singleton manages lifecycle - no need to close

        if (spokes.length > 0) {
            console.log(`   ✅ Loaded ${spokes.length} spokes from MongoDB (SSOT)`);

            const instances: Record<string, IInstanceConfig> = {};
            for (const spoke of spokes) {
                instances[spoke.instanceCode.toLowerCase()] = {
                    instanceCode: spoke.instanceCode,
                    name: spoke.name,
                    services: {
                        frontend: { externalPort: spoke.frontendPort || 3000 },
                        backend: { externalPort: spoke.backendPort || 4000 },
                        keycloak: { externalPort: spoke.keycloakPort || 8443 },
                        mongodb: {
                            name: 'mongodb',
                            containerName: `dive-${spoke.instanceCode.toLowerCase()}-mongodb`,
                            internalPort: 27017,
                            externalPort: spoke.mongodbPort || 27017
                        }
                    }
                };
            }

            return { instances, version: '2.0' };
        }
    } catch (error) {
        console.warn('   ⚠️ Could not load from MongoDB');
    }

    // CRITICAL: NO JSON FILE FALLBACK - MongoDB is SSOT
    console.error('   ❌ No federation registry available (MongoDB empty)');
    console.error('   Solution: Register spokes via API or run federation setup');
    return { instances: {}, version: '2.0' };
}

async function loadKASRegistry(): Promise<IKASRegistry> {
    const instanceCode = process.env.INSTANCE_CODE || 'USA';
    const isSpoke = instanceCode !== 'USA';

    // CRITICAL FIX: Spokes should query Hub KAS registry API, not local MongoDB
    // Hub has the centralized KAS registry, spokes don't maintain their own
    if (isSpoke) {
        try {
            // NOTE: localhost fallback is acceptable for seeding scripts running in Docker
            // This is a development/testing environment, not production code
            const hubBackendUrl = process.env.HUB_BACKEND_URL || process.env.BACKEND_URL || 'https://localhost:4000';
            const axios = (await import('axios')).default;

            console.log(`   🔍 Querying Hub KAS registry API (spoke mode: ${instanceCode})`);
            const response = await axios.get(`${hubBackendUrl}/api/kas/registry`, {
                httpsAgent: getSecureHttpsAgent(),
                timeout: 10000
            });

            if (response.data?.kasServers && response.data.kasServers.length > 0) {
                const kasServers = response.data.kasServers;
                console.log(`   ✅ Loaded ${kasServers.length} KAS servers from Hub registry (federated mode)`);

                // Convert API response to legacy format
                return {
                    kasServers: kasServers.map((k: { kasId: string; kasUrl: string; organization: string; countryCode?: string; instanceCode?: string; internalKasUrl?: string; authConfig?: { jwtIssuer?: string }; supportedCOIs?: string[] }) => ({
                        kasId: k.kasId,
                        organization: k.organization,
                        countryCode: k.countryCode || k.instanceCode, // Use countryCode from API
                        kasUrl: k.kasUrl,
                        internalKasUrl: k.internalKasUrl || k.kasUrl,
                        authMethod: 'jwt' as const,
                        authConfig: {
                            jwtIssuer: k.authConfig?.jwtIssuer || '',
                            jwtAudience: 'dive-v3-broker-usa'
                        },
                        trustLevel: k.trustLevel || 'medium',
                        supportedCountries: k.supportedCountries || [],
                        supportedCOIs: k.supportedCOIs || [],
                        metadata: {
                            version: '1.0.0',
                            capabilities: k.metadata?.capabilities || [],
                            contact: k.contact || '',
                            lastVerified: new Date().toISOString()
                        }
                    })),
                    version: '2.0',
                    federationTrust: {
                        trustMatrix: {} // Federation trust handled by Hub
                    }
                };
            }
        } catch (error) {
            console.warn(`   ⚠️ Could not query Hub KAS registry API: ${error instanceof Error ? error.message : 'Unknown'}`);
            console.warn(`   Falling back to local MongoDB/file`);
        }
    }

    // Hub mode OR spoke fallback: Try to load from local MongoDB
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
                    countryCode: k.countryCode, // Use actual countryCode field
                    kasUrl: k.kasUrl,
                    internalKasUrl: k.internalKasUrl || k.kasUrl,
                    authMethod: k.authMethod,
                    authConfig: {
                        jwtIssuer: k.authConfig.jwtIssuer,
                        jwtAudience: k.authConfig.jwtAudience || 'dive-v3-broker-usa'
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
                    trustMatrix: {} // Populated from federation agreements if applicable
                }
            };
        }
    } catch (error) {
        console.warn('   ⚠️ Could not load from MongoDB');
    }

    // CRITICAL: NO JSON FILE FALLBACK - MongoDB is SSOT
    // If MongoDB is empty, KAS registry must be populated via API or seeding
    console.error('   ❌ No KAS registry available (MongoDB empty)');
    console.error('   Solution: Register KAS servers via API or run KAS seeding');
    return {
        kasServers: [],
        version: '2.0',
        federationTrust: { trustMatrix: {} }
    };
}

function getInstanceConfig(registry: IFederationRegistry, instanceCode: string): IInstanceConfig {
    const key = instanceCode.toLowerCase();
    const config = registry.instances[key];

    // If config not in registry, check if we're seeding the local instance
    // For local instance seeding, we can use environment variables (SSOT)
    if (!config) {
        const localInstanceCode = (process.env.INSTANCE_CODE || process.env.INSTANCE_REALM || 'USA').toUpperCase();
        if (instanceCode.toUpperCase() === localInstanceCode) {
            // Seeding local instance - create minimal config from environment variables
            const instanceName = process.env.INSTANCE_NAME || instanceCode;
            const mongoDatabase = process.env.MONGODB_DATABASE || `dive-v3-${key}`;

            console.warn(`   ⚠️  Instance ${instanceCode} not in federation registry`);
            console.warn(`   ℹ️  Using environment variables for local instance seeding (SSOT)`);

            return {
                code: instanceCode.toUpperCase(),
                name: instanceName,
                type: 'local' as const,
                enabled: true,
                deployment: {
                    host: 'localhost',
                    domain: 'dive25.com'
                },
                services: {
                    mongodb: {
                        name: 'mongodb',
                        containerName: `dive-spoke-${key}-mongodb`,
                        internalPort: 27017,
                        externalPort: parseInt(process.env.MONGO_PORT || '27017', 10)
                    }
                },
                mongodb: {
                    database: mongoDatabase,
                    user: process.env.MONGODB_USER || 'admin'
                }
            };
        }

        // Not local instance and not in registry - fail
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
    // CRITICAL: Use MONGODB_DATABASE from environment (SSOT for database name)
    // This ensures seeding uses the same database as the running backend
    let database = process.env.MONGODB_DATABASE || config.mongodb.database;

    // Check if MONGODB_URL is set (e.g., when running inside Docker)
    const envMongoUrl = process.env.MONGODB_URL;
    if (envMongoUrl) {
        // Parse the env URL to extract credentials
        const urlMatch = envMongoUrl.match(/mongodb:\/\/([^:]+):([^@]+)@([^:/]+):?(\d+)?\/?(.*)/);
        if (urlMatch) {
            const [, user, password, host, port] = urlMatch;
            // Use database from MONGODB_DATABASE env var (runtime SSOT), not URL path or config
            // CRITICAL FIX (2026-01-25): Add directConnection=true for single-node replica sets
            // Without this, MongoClient tries topology discovery using 'localhost' which fails inside Docker
            // Preserve TLS and other connection options from original MONGODB_URL
            const tlsParam = envMongoUrl.includes('tls=true') ? '&tls=true' : '';
            const uri = `mongodb://${host}:${port || 27017}/${database}?directConnection=true${tlsParam}`;
            console.log(`   Using MONGODB_URL from environment`);
            console.log(`   Database: ${database} (from MONGODB_DATABASE env var)`);
            console.log(`   MongoDB URI: ${uri}&authSource=admin`);
            console.log(`   Auth User: ${user}, Password length: ${password.length} chars`);
            return { uri, user, password, database };
        }
    }

    // Determine host: use 'mongo' inside Docker, 'localhost' otherwise
    const isDocker = process.env.CONTAINER === 'docker' || process.env.HOSTNAME?.startsWith('dive-v3');
    const defaultHost = isDocker ? 'mongo' : 'localhost';
    const host = config.type === 'remote' ? config.deployment.host : defaultHost;
    const port = config.services.mongodb.externalPort;
    // database already declared above - use it here
    const user = config.mongodb.user;

    // Get password from GCP Secret Manager or fallback to environment variable
    const password = await getMongoDBPassword(instanceCode);

    // URI without credentials - auth passed separately to MongoClient
    // Add directConnection=true for single-node replica sets
    // Add tls=true when MongoDB is configured with --tlsMode requireTLS
    const tlsParam = (process.env.MONGODB_URL || '').includes('tls=true') ? '&tls=true' : '';
    const uri = `mongodb://${host}:${port}/${database}?directConnection=true${tlsParam}`;

    // Debug logging
    console.log(`   MongoDB URI: ${uri}&authSource=admin`);
    console.log(`   Database: ${database}`);
    console.log(`   Auth User: ${user}, Password length: ${password.length} chars`);

    return { uri, user, password, database };
}

function getKASServersForInstance(kasRegistry: IKASRegistry, instanceCode: string): IKASServer[] {
    const servers: IKASServer[] = [];

    // DEBUG: Log available KAS servers for troubleshooting
    if (kasRegistry.kasServers && kasRegistry.kasServers.length > 0) {
        console.log(`   🔍 Filtering KAS servers for instance: ${instanceCode}`);
        console.log(`   Available KAS servers:`, kasRegistry.kasServers.map(k => `${k.kasId} (country: ${k.countryCode})`).join(', '));
    }

    // Find KAS where countryCode matches (SSOT: ISO 3166-1 alpha-3)
    const localKas = kasRegistry.kasServers?.find(k => k.countryCode === instanceCode);

    if (localKas) {
        console.log(`   ✅ Found local KAS for ${instanceCode}: ${localKas.kasId}`);
        servers.push(localKas);
    } else {
        console.warn(`   ⚠️  No KAS server found with countryCode=${instanceCode}`);
    }

    // Add trusted partner KAS servers from trust matrix
    const trustMatrix = kasRegistry.federationTrust?.trustMatrix;
    const localKasId = localKas?.kasId;

    if (localKasId && trustMatrix && trustMatrix[localKasId]) {
        for (const partnerKasId of trustMatrix[localKasId]) {
            const partnerKas = kasRegistry.kasServers?.find(k => k.kasId === partnerKasId);
            if (partnerKas) {
                console.log(`   ✅ Added trusted partner KAS: ${partnerKas.kasId}`);
                servers.push(partnerKas);
            }
        }
    }

    console.log(`   📊 Total KAS servers for ${instanceCode}: ${servers.length}`);
    return servers;
}

// ============================================
// DYNAMIC COI TEMPLATE BUILDER (MongoDB SSOT)
// ============================================

/**
 * Build COI templates dynamically from MongoDB coi_definitions collection
 * This eliminates hardcoded country arrays and ensures SSOT consistency
 *
 * @param db MongoDB database connection
 * @returns Array of COI templates with weights and instance affinity
 */
async function buildCoiTemplatesFromDatabase(db: Db): Promise<ICOITemplate[]> {
    const coiCollection = db.collection('coi_definitions');
    const coiDefs = await coiCollection.find({ enabled: true }).toArray();

    console.log(`📚 Building COI templates from MongoDB (${coiDefs.length} definitions)`);

    const templates: ICOITemplate[] = [];

    // Helper to get COI members
    const getMembers = (coiId: string): string[] => {
        const coi = coiDefs.find((c: { coiId: string }) => c.coiId === coiId);
        return coi?.memberCountries || coi?.members || [];
    };

    // ============================================
    // US-ONLY templates (7%)
    // ============================================
    const usOnlyMembers = getMembers('US-ONLY');
    if (usOnlyMembers.length > 0) {
        templates.push(
            {
                coi: ['US-ONLY'],
                coiOperator: 'ALL',
                releasabilityTo: usOnlyMembers,
                caveats: ['NOFORN'],
                description: 'US-ONLY with NOFORN caveat',
                weight: 3.5,
                industryAllowed: false,
                instanceAffinity: ['USA']
            },
            {
                coi: ['US-ONLY'],
                coiOperator: 'ALL',
                releasabilityTo: usOnlyMembers,
                caveats: [],
                description: 'US-only (no foreign release)',
                weight: 3.5,
                industryAllowed: true,
                instanceAffinity: ['USA']
            }
        );
    }

    // ============================================
    // Bilateral COIs (11%)
    // ============================================
    const bilaterals = [
        { id: 'CAN-US', weight: 3.7, affinity: ['USA'] },
        { id: 'GBR-US', weight: 3.7, affinity: ['USA', 'GBR'] },
        { id: 'FRA-US', weight: 3.6, affinity: ['USA', 'FRA'] },
        { id: 'DEU-US', weight: 3.6, affinity: ['USA', 'DEU'] }
    ];

    for (const bil of bilaterals) {
        const members = getMembers(bil.id);
        if (members.length > 0) {
            templates.push({
                coi: [bil.id],
                coiOperator: 'ALL',
                releasabilityTo: members,
                caveats: [],
                description: `${bil.id} bilateral`,
                weight: bil.weight,
                industryAllowed: true,
                instanceAffinity: bil.affinity
            });
        }
    }

    // ============================================
    // Multilateral COIs
    // ============================================
    const multilaterals = [
        { id: 'FVEY', weight: 7, industry: false, affinity: ['USA', 'GBR'] },
        { id: 'AUKUS', weight: 4, industry: false, affinity: ['GBR', 'USA', 'AUS'] },
        { id: 'NATO', weight: 8, industry: false, affinityFromMembers: true },
        { id: 'NATO-COSMIC', weight: 3, industry: false, affinity: ['USA', 'GBR', 'FRA', 'DEU'] },
        { id: 'EU-RESTRICTED', weight: 5, industry: false, affinityFromMembers: true },
        { id: 'QUAD', weight: 4, industry: false, affinity: ['USA', 'AUS', 'IND', 'JPN'] }
    ];

    for (const multi of multilaterals) {
        const members = getMembers(multi.id);
        if (members.length > 0) {
            templates.push({
                coi: [multi.id],
                coiOperator: 'ALL',
                releasabilityTo: members,
                caveats: [],
                description: `${multi.id} membership`,
                weight: multi.weight,
                industryAllowed: multi.industry,
                instanceAffinity: multi.affinityFromMembers ? members : multi.affinity
            });
        }
    }

    // ============================================
    // Combatant Commands (16%)
    // ============================================
    const cocoms = [
        { id: 'NORTHCOM', weight: 3.2, industry: true },
        { id: 'EUCOM', weight: 3.4, industry: false },
        { id: 'PACOM', weight: 3.3, industry: false },
        { id: 'CENTCOM', weight: 3.1, industry: false },
        { id: 'SOCOM', weight: 3.0, industry: false }
    ];

    for (const cocom of cocoms) {
        const members = getMembers(cocom.id);
        if (members.length > 0) {
            templates.push({
                coi: [cocom.id],
                coiOperator: 'ALL',
                releasabilityTo: members,
                caveats: [],
                description: `${cocom.id} theater`,
                weight: cocom.weight,
                industryAllowed: cocom.industry,
                instanceAffinity: ['USA']
            });
        }
    }

    // ============================================
    // Program COIs (18%)
    // ============================================
    const programs = [
        { id: 'Alpha', relTo: ['USA', 'GBR', 'FRA'], weight: 6 },
        { id: 'Beta', relTo: ['USA', 'DEU'], weight: 6 },
        { id: 'Gamma', relTo: ['USA', 'CAN'], weight: 6 }
    ];

    for (const prog of programs) {
        if (coiDefs.find((c: { coiId: string }) => c.coiId === prog.id)) {
            templates.push({
                coi: [prog.id],
                coiOperator: 'ALL',
                releasabilityTo: prog.relTo,
                caveats: [],
                description: `${prog.id} classified program`,
                weight: prog.weight,
                industryAllowed: false,
                instanceAffinity: prog.relTo
            });
        }
    }

    // ============================================
    // Multi-COI templates (ANY operator) - 10%
    // ============================================
    const multiCOIs = [
        { cois: ['NATO', 'QUAD'], weight: 2.5 },
        { cois: ['EUCOM', 'PACOM'], weight: 2.5 },
        { cois: ['NORTHCOM', 'EUCOM'], weight: 2.5 },
        { cois: ['Alpha', 'FVEY'], weight: 2.5 }
    ];

    for (const config of multiCOIs) {
        const allMembers = new Set<string>();
        let hasAll = true;

        for (const coiId of config.cois) {
            const members = getMembers(coiId);
            if (members.length === 0) {
                hasAll = false;
                break;
            }
            members.forEach(m => allMembers.add(m));
        }

        if (hasAll) {
            templates.push({
                coi: config.cois,
                coiOperator: 'ANY',
                releasabilityTo: Array.from(allMembers),
                caveats: [],
                description: `${config.cois.join(' or ')} membership`,
                weight: config.weight,
                industryAllowed: false
            });
        }
    }

    // ============================================
    // No-COI templates (20%)
    // ============================================
    templates.push(
        {
            coi: [],
            coiOperator: 'ALL',
            releasabilityTo: ['USA', 'FRA', 'DEU', 'GBR', 'CAN'],
            caveats: [],
            description: 'No COI - industry releasability',
            weight: 7,
            industryAllowed: true,
            instanceAffinity: ['USA', 'FRA', 'GBR', 'DEU']
        },
        {
            coi: [],
            coiOperator: 'ALL',
            releasabilityTo: ['USA', 'GBR', 'CAN', 'AUS'],
            caveats: [],
            description: 'No COI - Five Eyes subset',
            weight: 7,
            industryAllowed: true,
            instanceAffinity: ['USA', 'GBR']
        }
    );

    const fveyMembers = getMembers('FVEY');
    if (fveyMembers.length > 0) {
        templates.push({
            coi: [],
            coiOperator: 'ALL',
            releasabilityTo: fveyMembers,
            caveats: [],
            description: 'No COI - FVEY releasability',
            weight: 3,
            industryAllowed: true
        });
    }

    const natoMembers = getMembers('NATO');
    if (natoMembers.length > 0) {
        templates.push({
            coi: [],
            coiOperator: 'ALL',
            releasabilityTo: ['USA', 'GBR', 'FRA', 'DEU', 'CAN', 'HUN', 'POL', 'ROU'],
            caveats: [],
            description: 'No COI - NATO subset',
            weight: 3.4,
            industryAllowed: true,
            instanceAffinity: ['USA', 'FRA', 'GBR', 'DEU']
        });
    }

    console.log(`✅ Built ${templates.length} COI templates from MongoDB SSOT`);
    return templates;
}

// ============================================
// COI TEMPLATES (DYNAMICALLY LOADED FROM MONGODB)
// ============================================

// Templates are built from MongoDB coi_definitions at runtime
// See buildCoiTemplatesFromDatabase() function above
let COI_TEMPLATES: ICOITemplate[] = [
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
    seedBatchId: string,
    fileTypeMode: 'text' | 'multi' = 'multi',
    noMultimedia: boolean = false
) {
    // Check if KAS servers are available
    if (!kasServers || kasServers.length === 0) {
        throw new Error(`No KAS servers configured for instance ${instanceCode}. Cannot create ZTDF documents without KAS.`);
    }

    // Validate instance code is valid ISO 3166-1 alpha-3 or custom test code
    if (!validateCountryCode(instanceCode)) {
        throw new Error(`Invalid instance code: ${instanceCode}. Must be ISO 3166-1 alpha-3 (e.g., USA, FRA, GBR) or custom test code (e.g., TST, DEV, QAA).`);
    }

    const classification = selectClassification();

    // Use instance-weighted COI template selection
    const coiTemplate = selectCOITemplate(instanceCode);
    const { coi: COI, coiOperator, releasabilityTo, caveats, industryAllowed } = coiTemplate;

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
        throw new Error(`Template validation failed for ${coiTemplate.description}: ${validation.errors.join('; ')}`);
    }

    // Random creation date (past 12 months)
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const creationDate = randomDate(oneYearAgo, new Date());
    const currentTimestamp = new Date().toISOString();

    // ============================================
    // FILE TYPE SELECTION (Multi-format support)
    // ============================================

    let selectedFileType: IFileTypeConfig;
    let fileTemplate: ITemplateFile | null = null;
    let contentBuffer: Buffer;
    let mimeType: string;
    let fileExtension: string;
    let fileCategory: FileTypeCategory;
    let templateFilename: string | undefined;

    if (fileTypeMode === 'text' || !templateCache.loaded || templateCache.templates.size === 0) {
        // Legacy text-only mode OR templates not available
        mimeType = 'text/plain';
        fileExtension = 'txt';
        fileCategory = 'text';
        selectedFileType = FILE_TYPE_CONFIGS.find(c => c.extension === 'txt')!;
    } else {
        // Multi-file mode - select file type based on weighted distribution
        let availableConfigs = FILE_TYPE_CONFIGS;

        // Filter out multimedia if requested
        if (noMultimedia) {
            availableConfigs = FILE_TYPE_CONFIGS.filter(c => c.category !== 'multimedia');
        }

        // Only use file types that have loaded templates
        availableConfigs = availableConfigs.filter(c => {
            const templates = templateCache.templates.get(c.extension);
            return templates && templates.length > 0;
        });

        if (availableConfigs.length === 0) {
            // Fallback to text if no templates available
            mimeType = 'text/plain';
            fileExtension = 'txt';
            fileCategory = 'text';
            selectedFileType = FILE_TYPE_CONFIGS.find(c => c.extension === 'txt')!;
        } else {
            selectedFileType = selectFileType(availableConfigs);
            fileTemplate = selectTemplate(selectedFileType.extension);

            if (fileTemplate) {
                mimeType = fileTemplate.mimeType;
                fileExtension = fileTemplate.extension;
                fileCategory = selectedFileType.category;
                templateFilename = fileTemplate.filename;
            } else {
                // Fallback to text if template selection failed
                mimeType = 'text/plain';
                fileExtension = 'txt';
                fileCategory = 'text';
                selectedFileType = FILE_TYPE_CONFIGS.find(c => c.extension === 'txt')!;
            }
        }
    }

    // Resource ID format: doc-<ISO3166-3>-<batchId>-<sequence>-<ext>
    // Example: doc-USA-abc12345-00001-pdf
    const resourceId = `doc-${instanceCode}-${seedBatchId}-${index.toString().padStart(5, '0')}`;

    // Instance-specific title with file type
    const titlePrefixes = TITLE_TEMPLATES[instanceCode] || TITLE_TEMPLATES.USA;
    const title = `${random(titlePrefixes)} - ${random(TITLE_SUBJECTS)} ${index}`;

    // Generate content based on mode
    if (fileTemplate && fileTemplate.buffer) {
        // Use template file content (binary files like PDF, DOCX, MP4, etc.)
        contentBuffer = fileTemplate.buffer;
    } else {
        // Generate text content (text mode or fallback)
        const textContent = `${classification} Document: ${title}\n\n` +
            `This document contains ${classification.toLowerCase()} information for coalition operations.\n` +
            `COI: ${COI.length > 0 ? COI.join(', ') : 'None'} (Operator: ${coiOperator})\n` +
            `Releasable to: ${releasabilityTo.join(', ')}\n` +
            `${caveats.length > 0 ? `Caveats: ${caveats.join(', ')}\n` : ''}` +
            `Industry Accessible: ${industryAllowed ? 'Yes' : 'No'}\n` +
            `\nDocument ID: ${resourceId}\n` +
            `Instance: ${instanceCode}\n` +
            `Created: ${creationDate.toISOString()}\n\n` +
            `OPERATIONAL SUMMARY:\nThis is sample classified content for demonstration purposes.\n` +
            `Template: ${coiTemplate.description}`;
        contentBuffer = Buffer.from(textContent);
    }

    // Generate STANAG 4778 BDO (Binding Data Object)
    const bdoXml = generateBDO(
        `${resourceId}.${fileExtension}`,
        mimeType,
        {
            classification,
            resourceId,
            creationDateTime: currentTimestamp
        }
    );

    // Encrypt content
    const selectedCOI = COI.length > 0 ? COI[0] : 'DEFAULT';
    const encryptionResult = encryptContent(contentBuffer.toString('base64'), resourceId, selectedCOI);
    const wrappedKey = encryptionResult.dek;

    // Create manifest with dynamic content type
    const manifest = {
        version: '1.0',
        objectId: resourceId,
        objectType: fileCategory,
        contentType: mimeType,
        fileExtension: fileExtension,
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
        size: Buffer.from(encryptionResult.encryptedData, 'base64').length,
        storageMode: 'inline' // CRITICAL: Required for backend decryption logic
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
        releasabilityTo: releasabilityTo, // Correct field name per OPA policies
        COI,
        coiOperator,
        encrypted: true,
        encryptedContent: chunk.encryptedData,
        releasableToIndustry: industryAllowed,
        originRealm: instanceCode,
        // Country for localized classification normalization (ACP-240)
        country: instanceCode,
        // Multi-format file type fields
        fileType: fileExtension,
        mimeType: mimeType,
        fileCategory: fileCategory,
        templateUsed: templateFilename,
        // STANAG 4778 Binding Data Object
        bdoXml: bdoXml,
        // ZTDF structure
        ztdf: ztdfObject,
        // Legacy structure (kept for backwards compatibility)
        legacy: {
            classification,
            releasabilityTo: releasabilityTo, // Correct field name
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

    // Load templates if multi-file mode
    if (options.fileTypeMode === 'multi') {
        await loadTemplates();
    }

    // Get MongoDB connection details from GCP Secret Manager or environment
    const gcpAvailable = await isGCPSecretsAvailable();
    const mongoConnection = await getMongoDBConnection(config, instanceCode);
    const kasServers = getKASServersForInstance(kasRegistry, instanceCode);

    // Determine file type mode description
    const fileTypeModeDesc = options.fileTypeMode === 'multi'
        ? `multi (PDF, DOCX, XLSX, MP4, etc.)${options.noMultimedia ? ' [no multimedia]' : ''}`
        : 'text (legacy)';

    console.log(`\n🌱 Seeding ${instanceCode} (${config.name})`);
    console.log(`   MongoDB: ${mongoConnection.database} @ port ${config.services.mongodb.externalPort}`);
    console.log(`   Secrets: ${gcpAvailable ? '🔐 GCP Secret Manager' : '📁 Environment Variables'}`);
    console.log(`   KAS Servers: ${kasServers.map(k => k.kasId).join(', ')}`);
    console.log(`   Documents: ${options.count}`);
    console.log(`   Batch Size: ${options.batchSize}`);
    console.log(`   File Types: ${fileTypeModeDesc}`);
    console.log(`   Mode: ${options.dryRun ? 'DRY RUN' : (options.replace ? 'REPLACE' : 'APPEND')}\n`);

    // Initialize distribution counters
    const distribution: ISeedManifest['distribution'] = {
        byClassification: {},
        byCOI: {},
        byKASCount: {},
        byIndustryAccess: { 'true': 0, 'false': 0 },
        byFileType: {}
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

        // Get available file type configs for simulation
        let availableConfigs = FILE_TYPE_CONFIGS;
        if (options.noMultimedia) {
            availableConfigs = FILE_TYPE_CONFIGS.filter(c => c.category !== 'multimedia');
        }
        // In multi mode, filter to configs with loaded templates
        if (options.fileTypeMode === 'multi' && templateCache.loaded) {
            availableConfigs = availableConfigs.filter(c => {
                const templates = templateCache.templates.get(c.extension);
                return templates && templates.length > 0;
            });
        }

        // Simulate distribution with instance-weighted COI selection
        for (let i = 0; i < options.count; i++) {
            const classification = selectClassification();
            const coiTemplate = selectCOITemplate(instanceCode); // Instance-weighted selection

            distribution.byClassification[classification] = (distribution.byClassification[classification] || 0) + 1;

            const coiKey = coiTemplate.coi.length > 0 ? coiTemplate.coi[0] : 'NO_COI';
            distribution.byCOI[coiKey] = (distribution.byCOI[coiKey] || 0) + 1;

            const kaoCount = coiTemplate.coi.length > 1 ? coiTemplate.coi.length : (Math.random() < 0.5 ? 1 : (Math.random() < 0.67 ? 2 : 3));
            distribution.byKASCount[kaoCount.toString()] = (distribution.byKASCount[kaoCount.toString()] || 0) + 1;

            distribution.byIndustryAccess[coiTemplate.industryAllowed.toString()]++;

            // Simulate file type selection
            if (options.fileTypeMode === 'multi' && availableConfigs.length > 0) {
                const fileType = selectFileType(availableConfigs);
                distribution.byFileType = distribution.byFileType || {};
                distribution.byFileType[fileType.extension] = (distribution.byFileType[fileType.extension] || 0) + 1;
            } else {
                distribution.byFileType = distribution.byFileType || {};
                distribution.byFileType['txt'] = (distribution.byFileType['txt'] || 0) + 1;
            }
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
            mongodbUri: `mongodb://***@localhost:${config.services.mongodb.externalPort}/${config.mongodb.database}`,
            fileTypeMode: options.fileTypeMode
        };
    }

    // Connect to MongoDB using singleton (uses MONGODB_URL from environment)
    // The mongoConnection was built from getMongoDBConnection which respects MONGODB_URL env var
    try {
        await mongoSingleton.connect();
        console.log('✅ Connected to MongoDB\n');

        // CRITICAL: Use database from mongoConnection (from MONGODB_URL), not config
        const db = getDb();
        const collection = db.collection('resources');

        // ============================================
        // PRE-FLIGHT VALIDATION (ZTDF REQUIREMENTS)
        // ============================================
        console.log('🔍 Pre-flight validation: Checking ZTDF requirements...\n');

        // Validate COI definitions exist
        const coiCollection = db.collection('coi_definitions');
        const coiCount = await coiCollection.countDocuments();
        // CRITICAL: initialize-coi-keys.ts creates 22 COI definitions (verified by manual count)
        // COIs: FVEY, NATO, NATO-COSMIC, US-ONLY, CAN-US, GBR-US, FRA-US, DEU-US,
        // AUKUS, QUAD, EU-RESTRICTED, NORTHCOM, EUCOM, PACOM, CENTCOM, SOCOM,
        // Alpha, Beta, Gamma, TEST-COI, NEW-COI, PACIFIC-ALLIANCE (22 total)
        const expectedCoiCount = 22; // Fixed from 23 to 22 (2026-01-28) - matches initialize-coi-keys.ts actual count

        if (coiCount < expectedCoiCount) {
            throw new Error(
                `ZTDF validation failed: Insufficient COI definitions in MongoDB.\n` +
                `Found: ${coiCount}, Expected: ${expectedCoiCount}\n` +
                `Solution: Run initialize-coi-keys.ts to populate all ${expectedCoiCount} COIs\n` +
                `Command: docker exec dive-hub-backend npx tsx src/scripts/initialize-coi-keys.ts`
            );
        }
        console.log(`   ✅ COI Definitions: ${coiCount}/${expectedCoiCount}\n`);

        // Validate all template COIs exist in MongoDB
        const allTemplateCOIs = new Set<string>();
        COI_TEMPLATES.forEach(t => t.coi.forEach(c => allTemplateCOIs.add(c)));

        const existingCOIs = new Set((await coiCollection.find({}).toArray()).map(c => c.coiId));
        const missingCOIs = Array.from(allTemplateCOIs).filter(c => !existingCOIs.has(c));

        if (missingCOIs.length > 0) {
            throw new Error(
                `ZTDF validation failed: Template COIs not found in MongoDB: ${missingCOIs.join(', ')}\n` +
                `Solution: Update initialize-coi-keys.ts to include these COIs or remove them from templates`
            );
        }
        console.log(`   ✅ All ${allTemplateCOIs.size} template COIs validated\n`);

        // Validate KAS servers are available and approved
        if (kasServers.length === 0) {
            throw new Error(
                `ZTDF validation failed: No KAS servers available for instance ${instanceCode}\n` +
                `Solution: Register and approve KAS server for this instance\n` +
                `Command: curl -X POST https://localhost:4000/api/kas/register -d '{"kasId":"${instanceCode.toLowerCase()}-kas",...}'`
            );
        }

        // Check KAS approval status
        const kasCollection = db.collection('kas_registry');
        const approvedKasCount = await kasCollection.countDocuments({
            status: 'active',
            enabled: true
        });

        if (approvedKasCount === 0) {
            throw new Error(
                `ZTDF validation failed: No active KAS servers found\n` +
                `Available KAS: ${kasServers.map(k => k.kasId).join(', ')}\n` +
                `Solution: Ensure KAS servers are enabled and active in MongoDB`
            );
        }
        // NOTE: kasServers.length is instance-filtered (only KAS servers for this instance)
        // approvedKasCount is from MongoDB (all active KAS servers across all instances)
        console.log(`   ✅ KAS Servers: ${approvedKasCount} active in registry, ${kasServers.length} available for ${instanceCode}\n`);

        console.log('✅ Pre-flight validation passed - ZTDF encryption requirements met\n');
        console.log('🔐 ACP-240 Compliance: 100% ZTDF encryption enforced (no plaintext fallback)\n');

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
                    batchPromises.push(createZTDFDocument(
                        i + 1,
                        instanceCode,
                        kasServers,
                        seedBatchId,
                        options.fileTypeMode,
                        options.noMultimedia
                    ));
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

                    // Track file type distribution
                    const fileType = doc.fileType || 'txt';
                    distribution.byFileType = distribution.byFileType || {};
                    distribution.byFileType[fileType] = (distribution.byFileType[fileType] || 0) + 1;
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
            version: '1.1.0',  // Updated version for multi-file support
            totalDocuments: totalCount,
            distribution,
            seedBatchId,
            duration_ms: duration,
            mongodbUri: `mongodb://***@localhost:${config.services.mongodb.externalPort}/${config.mongodb.database}`,
            fileTypeMode: options.fileTypeMode
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
        // Singleton manages lifecycle - no need to close
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

    // Show file type distribution if available
    if (distribution.byFileType && Object.keys(distribution.byFileType).length > 0) {
        console.log('\nFile Types:');
        const sortedFileTypes = Object.entries(distribution.byFileType)
            .sort((a, b) => b[1] - a[1]);
        for (const [ext, value] of sortedFileTypes) {
            const pct = ((value / total) * 100).toFixed(1);
            const fileConfig = FILE_TYPE_CONFIGS.find(c => c.extension === ext);
            const displayName = fileConfig?.displayName || ext.toUpperCase();
            console.log(`   ${displayName.padEnd(15)} ${value.toString().padStart(6)} (${pct.padStart(5)}%)`);
        }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

// ============================================
// MAIN
// ============================================

async function main() {
    console.log('\n╔══════════════════════════════════════════════════════════════════╗');
    console.log('║       DIVE V3 - Multi-Format Resource Seeding Script             ║');
    console.log('║       Version 1.1.0 - January 25, 2026                            ║');
    console.log('╚══════════════════════════════════════════════════════════════════╝\n');

    // Clean up old seed manifest files before starting
    cleanupOldManifests();

    const options = parseArgs();

    // Load configurations
    console.log('📋 Loading configuration...');
    const federationRegistry = await loadFederationRegistry();
    const kasRegistry = await loadKASRegistry();
    console.log(`   Found ${Object.keys(federationRegistry.instances).length} instances`);
    console.log(`   Found ${kasRegistry.kasServers?.length || 0} KAS servers\n`);

    // Build COI templates from MongoDB (SSOT)
    console.log('🔧 Building COI templates from MongoDB...');

    // Connect using singleton (uses MONGODB_URL from environment)
    await mongoSingleton.connect();
    const db = getDb();
    COI_TEMPLATES = await buildCoiTemplatesFromDatabase(db);
    // Singleton manages lifecycle - no need to close

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
