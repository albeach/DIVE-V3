/**
 * DIVE V3 Clean Stale IdPs Script
 * 
 * Removes Keycloak IdPs that don't have corresponding running spoke containers.
 * This ensures the UI only shows IdPs for active federation partners.
 * 
 * Usage:
 *   npx ts-node src/scripts/clean-stale-idps.ts --dry-run    # Preview changes
 *   npx ts-node src/scripts/clean-stale-idps.ts              # Execute cleanup
 *   npx ts-node src/scripts/clean-stale-idps.ts --force      # Skip confirmation
 * 
 * @version 1.0.0
 * @date 2026-01-17
 */

import axios from 'axios';
import https from 'https';
import { execSync } from 'child_process';
import * as readline from 'readline';

// ============================================
// CONFIGURATION
// ============================================

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'https://localhost:8443';
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'dive-v3-broker-usa';
const KEYCLOAK_ADMIN_USER = process.env.KEYCLOAK_ADMIN_USER || 'admin';
const KEYCLOAK_ADMIN_PASSWORD = process.env.KC_ADMIN_PASSWORD || process.env.KEYCLOAK_ADMIN_PASSWORD || '';

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// ============================================
// HELPERS
// ============================================

async function getKeycloakToken(): Promise<string> {
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
}

async function fetchKeycloakIdPs(token: string): Promise<Array<{ alias: string; displayName: string; enabled: boolean }>> {
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
    enabled: idp.enabled,
  }));
}

function getRunningSpokeCodes(): string[] {
  try {
    const output = execSync(
      'docker ps --format "{{.Names}}" 2>/dev/null | grep -E "dive-spoke-" || true',
      { encoding: 'utf-8' }
    );
    
    const codes = new Set<string>();
    const lines = output.trim().split('\n').filter(Boolean);
    
    for (const line of lines) {
      const match = line.match(/dive-spoke-([a-z]+)-/i);
      if (match) {
        codes.add(match[1].toUpperCase());
      }
    }
    return Array.from(codes);
  } catch {
    return [];
  }
}

function extractInstanceCodeFromAlias(alias: string): string {
  const match = alias.match(/^([a-z]+)-idp$/i);
  return match ? match[1].toUpperCase() : alias.toUpperCase();
}

async function deleteIdP(token: string, alias: string): Promise<boolean> {
  try {
    await axios.delete(
      `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/identity-provider/instances/${alias}`,
      {
        httpsAgent,
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    return true;
  } catch (error) {
    console.error(`  Failed to delete ${alias}:`, error instanceof Error ? error.message : error);
    return false;
  }
}

async function prompt(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

// ============================================
// MAIN
// ============================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');
  const help = args.includes('--help') || args.includes('-h');

  if (help) {
    console.log(`
DIVE V3 Clean Stale IdPs

Usage:
  npx ts-node src/scripts/clean-stale-idps.ts [options]

Options:
  --dry-run   Preview changes without making any modifications
  --force     Skip confirmation prompt
  --help      Show this help message
`);
    process.exit(0);
  }

  console.log('🧹 DIVE V3 Clean Stale IdPs');
  console.log('='.repeat(50));
  console.log();

  if (!KEYCLOAK_ADMIN_PASSWORD) {
    console.error('❌ Error: KC_ADMIN_PASSWORD or KEYCLOAK_ADMIN_PASSWORD environment variable required');
    process.exit(1);
  }

  // Get current state
  console.log('Fetching Keycloak IdPs...');
  const token = await getKeycloakToken();
  const idps = await fetchKeycloakIdPs(token);
  
  console.log('Checking running Docker containers...');
  const runningCodes = getRunningSpokeCodes();
  
  console.log();
  console.log(`📊 Current State:`);
  console.log(`   Keycloak IdPs: ${idps.length}`);
  console.log(`   Running Spokes: ${runningCodes.length} (${runningCodes.join(', ') || 'None'})`);
  console.log();

  // Identify stale IdPs
  const staleIdPs = idps.filter(idp => {
    const code = extractInstanceCodeFromAlias(idp.alias);
    return !runningCodes.includes(code);
  });

  if (staleIdPs.length === 0) {
    console.log('✅ No stale IdPs found. All IdPs have running containers.');
    process.exit(0);
  }

  console.log(`⚠️  Found ${staleIdPs.length} stale IdP(s) to remove:`);
  for (const idp of staleIdPs) {
    const code = extractInstanceCodeFromAlias(idp.alias);
    console.log(`   - ${idp.alias} (${idp.displayName}) [${code}]`);
  }
  console.log();

  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made');
    console.log();
    console.log('Would delete the following IdPs:');
    for (const idp of staleIdPs) {
      console.log(`   DELETE /admin/realms/${KEYCLOAK_REALM}/identity-provider/instances/${idp.alias}`);
    }
    process.exit(0);
  }

  // Confirm deletion
  if (!force) {
    const confirmed = await prompt(`Delete ${staleIdPs.length} stale IdP(s)? (y/n): `);
    if (!confirmed) {
      console.log('Aborted.');
      process.exit(0);
    }
  }

  // Delete stale IdPs
  console.log();
  console.log('🗑️  Deleting stale IdPs...');
  
  let deleted = 0;
  let failed = 0;

  for (const idp of staleIdPs) {
    process.stdout.write(`   Deleting ${idp.alias}... `);
    const success = await deleteIdP(token, idp.alias);
    if (success) {
      console.log('✅');
      deleted++;
    } else {
      console.log('❌');
      failed++;
    }
  }

  console.log();
  console.log('📝 Summary:');
  console.log(`   Deleted: ${deleted}`);
  console.log(`   Failed: ${failed}`);
  
  // Verify final state
  console.log();
  console.log('Verifying final state...');
  const remainingIdPs = await fetchKeycloakIdPs(token);
  console.log(`   Remaining IdPs: ${remainingIdPs.length}`);
  for (const idp of remainingIdPs) {
    console.log(`     - ${idp.alias} (${idp.displayName})`);
  }

  if (failed > 0) {
    process.exit(1);
  }
  
  console.log();
  console.log('✅ Cleanup complete!');
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(2);
});
