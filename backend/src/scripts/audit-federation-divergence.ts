/**
 * DIVE V3 Federation State Audit Script
 * 
 * Audits and reports divergence between:
 * 1. Keycloak IdPs - What the UI currently shows
 * 2. MongoDB spokes collection - What should be the source of truth
 * 3. Running Docker containers - What's actually available
 * 4. OPAL federation matrix - Policy data
 * 5. Static federation registry - Configuration file
 * 
 * Usage:
 *   npx ts-node src/scripts/audit-federation-divergence.ts
 *   npx ts-node src/scripts/audit-federation-divergence.ts --json
 *   npx ts-node src/scripts/audit-federation-divergence.ts --fix (dry-run)
 * 
 * @version 1.0.0
 * @date 2026-01-17
 */

import axios from 'axios';
import https from 'https';
import { MongoClient } from 'mongodb';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// ============================================
// CONFIGURATION
// ============================================

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'https://localhost:8443';
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'dive-v3-broker-usa';
const KEYCLOAK_ADMIN_USER = process.env.KEYCLOAK_ADMIN_USER || process.env.KEYCLOAK_ADMIN_USERNAME || 'admin';
const KEYCLOAK_ADMIN_PASSWORD = process.env.KC_ADMIN_PASSWORD || process.env.KEYCLOAK_ADMIN_PASSWORD || 'DivePilot2025!SecureAdmin';
const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://admin:DivePilot2025!@localhost:27017/dive_resources?authSource=admin';

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// ============================================
// INTERFACES
// ============================================

interface KeycloakIdP {
  alias: string;
  displayName: string;
  providerId: string;
  enabled: boolean;
  config?: Record<string, string>;
}

interface MongoSpoke {
  spokeId: string;
  instanceCode: string;
  name: string;
  status: 'pending' | 'approved' | 'suspended' | 'revoked';
  baseUrl: string;
  apiUrl: string;
  idpUrl: string;
  registeredAt: Date;
  lastHeartbeat?: Date;
}

interface DockerContainer {
  name: string;
  status: string;
  instanceCode: string;
}

interface FederationMatrixEntry {
  instanceCode: string;
  partners: string[];
}

interface AuditReport {
  timestamp: string;
  keycloak: {
    idps: KeycloakIdP[];
    count: number;
    instanceCodes: string[];
  };
  mongodb: {
    spokes: MongoSpoke[];
    count: number;
    activeCount: number;
    instanceCodes: string[];
    activeInstanceCodes: string[];
  };
  docker: {
    containers: DockerContainer[];
    count: number;
    instanceCodes: string[];
  };
  federationMatrix: {
    entries: FederationMatrixEntry[];
    instanceCodes: string[];
  };
  staticRegistry: {
    instances: string[];
    enabledInstances: string[];
  };
  divergence: {
    inKeycloakNotInMongoDB: string[];
    inMongoDBNotInKeycloak: string[];
    inKeycloakNotRunning: string[];
    inMongoDBNotRunning: string[];
    staleIdPs: string[];
    summary: string;
    healthy: boolean;
  };
}

// ============================================
// DATA FETCHERS
// ============================================

async function getKeycloakToken(): Promise<string> {
  try {
    const response = await axios.post(
      `${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`,
      new URLSearchParams({
        grant_type: 'password',
        client_id: 'admin-cli',
        username: KEYCLOAK_ADMIN_USER,
        password: KEYCLOAK_ADMIN_PASSWORD,
      }),
      {
        httpsAgent,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );
    return response.data.access_token;
  } catch (error) {
    console.error('Failed to authenticate to Keycloak:', error instanceof Error ? error.message : error);
    throw error;
  }
}

async function fetchKeycloakIdPs(): Promise<KeycloakIdP[]> {
  try {
    const token = await getKeycloakToken();
    const response = await axios.get(
      `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/identity-provider/instances`,
      {
        httpsAgent,
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    return response.data.map((idp: any) => ({
      alias: idp.alias,
      displayName: idp.displayName || idp.alias,
      providerId: idp.providerId,
      enabled: idp.enabled,
      config: idp.config,
    }));
  } catch (error) {
    console.error('Failed to fetch Keycloak IdPs:', error instanceof Error ? error.message : error);
    return [];
  }
}

async function fetchMongoDBSpokes(): Promise<MongoSpoke[]> {
  let client: MongoClient | null = null;
  try {
    client = new MongoClient(MONGODB_URL);
    await client.connect();
    const db = client.db('dive_resources');
    const spokes = await db.collection('spokes').find({}).toArray();
    return spokes.map((s: any) => ({
      spokeId: s.spokeId,
      instanceCode: s.instanceCode,
      name: s.name,
      status: s.status,
      baseUrl: s.baseUrl,
      apiUrl: s.apiUrl,
      idpUrl: s.idpUrl,
      registeredAt: s.registeredAt,
      lastHeartbeat: s.lastHeartbeat,
    }));
  } catch (error) {
    console.error('Failed to fetch MongoDB spokes:', error instanceof Error ? error.message : error);
    return [];
  } finally {
    if (client) await client.close();
  }
}

function fetchDockerContainers(): DockerContainer[] {
  try {
    const output = execSync(
      'docker ps --format "{{.Names}}|{{.Status}}" 2>/dev/null | grep -E "dive-spoke-" || true',
      { encoding: 'utf-8' }
    );
    
    const containers: DockerContainer[] = [];
    const lines = output.trim().split('\n').filter(Boolean);
    
    for (const line of lines) {
      const [name, status] = line.split('|');
      // Extract instance code from container name: dive-spoke-fra-backend -> FRA
      const match = name.match(/dive-spoke-([a-z]+)-/i);
      if (match) {
        const instanceCode = match[1].toUpperCase();
        // Only add unique instance codes (we only care about one container per spoke)
        if (!containers.some(c => c.instanceCode === instanceCode)) {
          containers.push({ name, status, instanceCode });
        }
      }
    }
    return containers;
  } catch (error) {
    console.error('Failed to fetch Docker containers:', error instanceof Error ? error.message : error);
    return [];
  }
}

function fetchFederationMatrix(): FederationMatrixEntry[] {
  const matrixPath = path.join(__dirname, '..', '..', 'data', 'opal', 'federation_matrix.json');
  try {
    const content = fs.readFileSync(matrixPath, 'utf-8');
    const data = JSON.parse(content);
    const matrix = data.federation_matrix || {};
    return Object.entries(matrix).map(([code, partners]) => ({
      instanceCode: code,
      partners: partners as string[],
    }));
  } catch (error) {
    console.error('Failed to read federation matrix:', error instanceof Error ? error.message : error);
    return [];
  }
}

function fetchStaticRegistry(): { instances: string[]; enabledInstances: string[] } {
  const registryPath = path.join(__dirname, '..', '..', '..', '..', 'config', 'federation-registry.json');
  try {
    const content = fs.readFileSync(registryPath, 'utf-8');
    const data = JSON.parse(content);
    const instances = Object.keys(data.instances || {}).map(k => k.toUpperCase());
    const enabledInstances = Object.entries(data.instances || {})
      .filter(([_, v]: [string, any]) => v.enabled !== false)
      .map(([k]) => k.toUpperCase());
    return { instances, enabledInstances };
  } catch (error) {
    console.error('Failed to read federation registry:', error instanceof Error ? error.message : error);
    return { instances: [], enabledInstances: [] };
  }
}

// ============================================
// ANALYSIS
// ============================================

function extractInstanceCodeFromAlias(alias: string): string {
  // 'deu-idp' -> 'DEU', 'fra-idp' -> 'FRA'
  const match = alias.match(/^([a-z]+)-idp$/i);
  return match ? match[1].toUpperCase() : alias.toUpperCase();
}

function analyzeDivergence(report: AuditReport): void {
  const keycloakCodes = new Set(report.keycloak.instanceCodes);
  const mongoCodes = new Set(report.mongodb.activeInstanceCodes);
  const dockerCodes = new Set(report.docker.instanceCodes);

  // IdPs in Keycloak but not in MongoDB (active)
  report.divergence.inKeycloakNotInMongoDB = Array.from(keycloakCodes)
    .filter(code => !mongoCodes.has(code));

  // Spokes in MongoDB but no IdP in Keycloak
  report.divergence.inMongoDBNotInKeycloak = Array.from(mongoCodes)
    .filter(code => !keycloakCodes.has(code));

  // IdPs in Keycloak but container not running
  report.divergence.inKeycloakNotRunning = Array.from(keycloakCodes)
    .filter(code => !dockerCodes.has(code));

  // Spokes in MongoDB but container not running
  report.divergence.inMongoDBNotRunning = Array.from(mongoCodes)
    .filter(code => !dockerCodes.has(code));

  // Stale IdPs = in Keycloak but BOTH not in MongoDB AND not running
  report.divergence.staleIdPs = Array.from(keycloakCodes)
    .filter(code => !mongoCodes.has(code) && !dockerCodes.has(code));

  // Determine health
  const staleCount = report.divergence.staleIdPs.length;
  const keycloakNotRunning = report.divergence.inKeycloakNotRunning.length;
  
  report.divergence.healthy = staleCount === 0 && keycloakNotRunning === 0;

  // Build summary
  if (report.divergence.healthy) {
    report.divergence.summary = `✅ Federation state is healthy. ${report.keycloak.count} IdPs, ${report.mongodb.activeCount} active spokes, ${report.docker.count} running containers.`;
  } else {
    const issues: string[] = [];
    if (staleCount > 0) {
      issues.push(`${staleCount} stale IdPs (${report.divergence.staleIdPs.join(', ')})`);
    }
    if (keycloakNotRunning > 0) {
      issues.push(`${keycloakNotRunning} IdPs without running containers`);
    }
    report.divergence.summary = `⚠️ Federation state has divergence: ${issues.join('; ')}`;
  }
}

// ============================================
// MAIN
// ============================================

async function runAudit(): Promise<AuditReport> {
  console.log('🔍 DIVE V3 Federation State Audit');
  console.log('='.repeat(50));
  console.log();

  // Fetch all data sources
  console.log('Fetching Keycloak IdPs...');
  const keycloakIdPs = await fetchKeycloakIdPs();
  
  console.log('Fetching MongoDB spokes...');
  const mongoSpokes = await fetchMongoDBSpokes();
  
  console.log('Fetching Docker containers...');
  const dockerContainers = fetchDockerContainers();
  
  console.log('Reading OPAL federation matrix...');
  const federationMatrix = fetchFederationMatrix();
  
  console.log('Reading static federation registry...');
  const staticRegistry = fetchStaticRegistry();
  
  console.log();

  // Build report
  const report: AuditReport = {
    timestamp: new Date().toISOString(),
    keycloak: {
      idps: keycloakIdPs,
      count: keycloakIdPs.length,
      instanceCodes: keycloakIdPs.map(idp => extractInstanceCodeFromAlias(idp.alias)),
    },
    mongodb: {
      spokes: mongoSpokes,
      count: mongoSpokes.length,
      activeCount: mongoSpokes.filter(s => s.status === 'approved').length,
      instanceCodes: mongoSpokes.map(s => s.instanceCode),
      activeInstanceCodes: mongoSpokes.filter(s => s.status === 'approved').map(s => s.instanceCode),
    },
    docker: {
      containers: dockerContainers,
      count: dockerContainers.length,
      instanceCodes: dockerContainers.map(c => c.instanceCode),
    },
    federationMatrix: {
      entries: federationMatrix,
      instanceCodes: federationMatrix.map(e => e.instanceCode),
    },
    staticRegistry,
    divergence: {
      inKeycloakNotInMongoDB: [],
      inMongoDBNotInKeycloak: [],
      inKeycloakNotRunning: [],
      inMongoDBNotRunning: [],
      staleIdPs: [],
      summary: '',
      healthy: false,
    },
  };

  // Analyze divergence
  analyzeDivergence(report);

  return report;
}

function printReport(report: AuditReport, jsonOutput: boolean): void {
  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log('📊 AUDIT RESULTS');
  console.log('='.repeat(50));
  console.log();

  // Keycloak
  console.log('🔐 KEYCLOAK IdPs (what UI displays):');
  console.log(`   Count: ${report.keycloak.count}`);
  console.log(`   Instance Codes: ${report.keycloak.instanceCodes.join(', ') || 'None'}`);
  for (const idp of report.keycloak.idps) {
    console.log(`     - ${idp.alias} (${idp.displayName}) [${idp.enabled ? 'enabled' : 'disabled'}]`);
  }
  console.log();

  // MongoDB
  console.log('🗄️  MONGODB SPOKES (should be source of truth):');
  console.log(`   Total: ${report.mongodb.count}, Active: ${report.mongodb.activeCount}`);
  console.log(`   Active Instance Codes: ${report.mongodb.activeInstanceCodes.join(', ') || 'None'}`);
  for (const spoke of report.mongodb.spokes) {
    console.log(`     - ${spoke.instanceCode} (${spoke.name}) [${spoke.status}]`);
  }
  console.log();

  // Docker
  console.log('🐳 DOCKER CONTAINERS (actually running):');
  console.log(`   Count: ${report.docker.count}`);
  console.log(`   Instance Codes: ${report.docker.instanceCodes.join(', ') || 'None'}`);
  for (const container of report.docker.containers) {
    console.log(`     - ${container.instanceCode}: ${container.name} [${container.status}]`);
  }
  console.log();

  // Divergence Analysis
  console.log('⚖️  DIVERGENCE ANALYSIS');
  console.log('-'.repeat(50));
  
  if (report.divergence.staleIdPs.length > 0) {
    console.log(`   ❌ STALE IdPs (in Keycloak, not in MongoDB, not running):`);
    console.log(`      ${report.divergence.staleIdPs.join(', ')}`);
    console.log(`      → These should be REMOVED from Keycloak`);
  }

  if (report.divergence.inKeycloakNotRunning.length > 0) {
    console.log(`   ⚠️  IdPs without running containers:`);
    console.log(`      ${report.divergence.inKeycloakNotRunning.join(', ')}`);
  }

  if (report.divergence.inKeycloakNotInMongoDB.length > 0) {
    console.log(`   ⚠️  IdPs not registered in MongoDB:`);
    console.log(`      ${report.divergence.inKeycloakNotInMongoDB.join(', ')}`);
  }

  if (report.divergence.inMongoDBNotInKeycloak.length > 0) {
    console.log(`   ⚠️  MongoDB spokes without Keycloak IdP:`);
    console.log(`      ${report.divergence.inMongoDBNotInKeycloak.join(', ')}`);
  }

  console.log();
  console.log('📝 SUMMARY');
  console.log('-'.repeat(50));
  console.log(`   ${report.divergence.summary}`);
  console.log();

  // Recommendations
  if (!report.divergence.healthy) {
    console.log('💡 RECOMMENDATIONS');
    console.log('-'.repeat(50));
    
    if (report.divergence.staleIdPs.length > 0) {
      console.log(`   1. Remove stale IdPs from Keycloak:`);
      for (const code of report.divergence.staleIdPs) {
        console.log(`      DELETE /admin/realms/${KEYCLOAK_REALM}/identity-provider/instances/${code.toLowerCase()}-idp`);
      }
    }

    if (report.divergence.inKeycloakNotInMongoDB.length > 0) {
      console.log(`   2. Register missing spokes in MongoDB or remove orphan IdPs`);
    }

    console.log();
    console.log('   Run with --fix to generate cleanup commands');
  }
}

// CLI
const args = process.argv.slice(2);
const jsonOutput = args.includes('--json');
const showHelp = args.includes('--help') || args.includes('-h');

if (showHelp) {
  console.log(`
DIVE V3 Federation State Audit

Usage:
  npx ts-node src/scripts/audit-federation-divergence.ts [options]

Options:
  --json    Output results as JSON
  --help    Show this help message

Environment Variables:
  KEYCLOAK_URL              Keycloak URL (default: https://localhost:8443)
  KEYCLOAK_REALM            Keycloak realm (default: dive-v3-broker-usa)
  KEYCLOAK_ADMIN_USER       Admin username (default: admin)
  KEYCLOAK_ADMIN_PASSWORD   Admin password
  MONGODB_URL               MongoDB connection string
`);
  process.exit(0);
}

runAudit()
  .then(report => {
    printReport(report, jsonOutput);
    process.exit(report.divergence.healthy ? 0 : 1);
  })
  .catch(error => {
    console.error('Audit failed:', error);
    process.exit(2);
  });
