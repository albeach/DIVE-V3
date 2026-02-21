#!/usr/bin/env ts-node
/**
 * DIVE V3 - OPAL Data Publisher
 *
 * Standalone script that publishes policy data updates to OPAL.
 * Can be run as:
 * 1. One-time sync: npm run opal-publisher -- --sync
 * 2. Continuous watcher: npm run opal-publisher -- --watch
 * 3. Health check: npm run opal-publisher -- --health
 *
 * Environment Variables:
 *   OPAL_SERVER_URL - OPAL server URL (default: http://opal-server:7002)
 *   MONGODB_URL - MongoDB connection string
 *   OPAL_DATA_DIR - Path to policy data files
 *
 * @version 1.0.0
 * @date 2025-12-03
 */

import { opalClient } from '../services/opal-client';
import { opalDataService } from '../services/opal-data.service';
import { opalMongoDBSyncService } from '../services/opal-mongodb-sync.service';

// ============================================
// COMMAND LINE INTERFACE
// ============================================

interface ICommandOptions {
  command: 'sync' | 'watch' | 'health' | 'help';
  verbose: boolean;
}

function parseArgs(): ICommandOptions {
  const args = process.argv.slice(2);

  const options: ICommandOptions = {
    command: 'help',
    verbose: false
  };

  for (const arg of args) {
    switch (arg) {
      case '--sync':
      case '-s':
        options.command = 'sync';
        break;
      case '--watch':
      case '-w':
        options.command = 'watch';
        break;
      case '--health':
      case '-h':
        options.command = 'health';
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
      case '--help':
        options.command = 'help';
        break;
    }
  }

  // Default to sync if no command specified but not help
  if (options.command === 'help' && args.length > 0 && !args.includes('--help')) {
    options.command = 'sync';
  }

  return options;
}

function printHelp(): void {
  console.log(`
DIVE V3 - OPAL Data Publisher

Usage: npm run opal-publisher -- [command] [options]

Commands:
  --sync, -s       Perform one-time sync of all data to OPAL
  --watch, -w      Start continuous MongoDB change stream watcher
  --health, -h     Check OPAL server health status
  --help           Show this help message

Options:
  --verbose, -v    Enable verbose logging

Environment Variables:
  OPAL_SERVER_URL  OPAL server URL (default: http://opal-server:7002)
  OPAL_ENABLED     Set to 'false' to disable OPAL integration
  MONGODB_URL      MongoDB connection string for watch mode
  OPAL_DATA_DIR    Path to policy data JSON files

Examples:
  npm run opal-publisher -- --sync          # One-time sync
  npm run opal-publisher -- --watch         # Start watching MongoDB
  npm run opal-publisher -- --health -v     # Check health with verbose output
`);
}

// ============================================
// COMMANDS
// ============================================

async function runHealthCheck(verbose: boolean): Promise<void> {
  console.log('🔍 Checking OPAL Server health...\n');

  const health = await opalClient.checkHealth();

  if (health.healthy) {
    console.log('✅ OPAL Server is healthy');
    console.log(`   OPA Connected: ${health.opaConnected}`);
    console.log(`   Clients Connected: ${health.clientsConnected}`);
    if (health.version) {
      console.log(`   Version: ${health.version}`);
    }
    if (health.lastPolicyUpdate) {
      console.log(`   Last Policy Update: ${health.lastPolicyUpdate}`);
    }
    if (health.lastDataUpdate) {
      console.log(`   Last Data Update: ${health.lastDataUpdate}`);
    }
  } else {
    console.log('❌ OPAL Server is not healthy or not reachable');

    if (!opalClient.isOPALEnabled()) {
      console.log('   Note: OPAL integration is disabled');
    }
  }

  if (verbose) {
    console.log('\nConfiguration:');
    const config = opalClient.getConfig();
    console.log(`   Server URL: ${config.serverUrl}`);
    console.log(`   Data Topics: ${config.dataTopics.join(', ')}`);
    console.log(`   Timeout: ${config.timeoutMs}ms`);

    console.log('\nData Directory:');
    console.log(`   Path: ${opalDataService.getDataDirectory()}`);
  }
}

async function runSync(verbose: boolean): Promise<void> {
  console.log('📦 Starting OPAL data sync...\n');

  // Check if OPAL is enabled
  if (!opalClient.isOPALEnabled()) {
    console.log('⚠️  OPAL is disabled. Performing dry-run sync.\n');
  }

  // Load data from files
  console.log('1. Loading data from files...');
  const data = await opalDataService.loadAllData();

  console.log(`   ✓ Trusted Issuers: ${Object.keys(data.trusted_issuers).length}`);
  console.log(`   ✓ Federation Matrix: ${Object.keys(data.federation_matrix).length} tenants`);
  console.log(`   ✓ COI Members: ${Object.keys(data.coi_members).length} communities`);
  console.log(`   ✓ Tenant Configs: ${Object.keys(data.tenant_configs).length} tenants`);

  if (verbose) {
    console.log('\nData Details:');
    console.log('  Trusted Issuers:');
    for (const [url, issuer] of Object.entries(data.trusted_issuers)) {
      console.log(`    - ${issuer.name} (${issuer.tenant}): ${url}`);
    }
    console.log('  Federation Matrix:');
    for (const [tenant, partners] of Object.entries(data.federation_matrix)) {
      console.log(`    - ${tenant} → [${partners.join(', ')}]`);
    }
  }

  // Sync to OPAL
  console.log('\n2. Publishing to OPAL...');
  const result = await opalDataService.syncAllToOPAL();

  if (result.success) {
    console.log('   ✅ Sync completed successfully');
    console.log(`   Synced at: ${result.syncedAt}`);
    if (result.opalResult?.transactionId) {
      console.log(`   Transaction ID: ${result.opalResult.transactionId}`);
    }
  } else {
    console.log('   ❌ Sync failed');
    console.log(`   Error: ${result.message}`);
  }

  console.log('\n📊 Sync Summary:');
  console.log(`   Sources: ${JSON.stringify(result.sources)}`);
}

async function runWatch(_verbose: boolean): Promise<void> {
  console.log('👀 Starting OPAL MongoDB watcher...\n');

  // Check if OPAL is enabled
  if (!opalClient.isOPALEnabled()) {
    console.log('⚠️  OPAL is disabled. Changes will be logged but not published.\n');
  }

  // Perform initial sync
  console.log('1. Performing initial sync...');
  await runSync(false);

  // Start MongoDB watcher
  console.log('\n2. Starting MongoDB change stream watcher...');
  await opalMongoDBSyncService.startWatching();

  if (opalMongoDBSyncService.isServiceRunning()) {
    console.log('   ✅ Watcher started successfully');
  } else {
    console.log('   ⚠️  Watcher started in polling mode (replica set not available)');
  }

  console.log('\n📡 Listening for changes... (Press Ctrl+C to stop)\n');

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Shutting down...');
    await opalMongoDBSyncService.stop();

    const stats = opalMongoDBSyncService.getStats();
    console.log('\n📊 Session Statistics:');
    console.log(`   Events Processed: ${stats.changeEventsProcessed}`);
    console.log(`   Errors: ${stats.errors}`);
    console.log(`   Last Sync: ${stats.lastSyncAt?.toISOString() || 'N/A'}`);

    process.exit(0);
  });

  // Keep the process running
  await new Promise(() => {});
}

// ============================================
// MAIN
// ============================================

async function main(): Promise<void> {
  const options = parseArgs();

  // Set log level based on verbose flag
  if (!options.verbose) {
    // Reduce logging noise in non-verbose mode
    process.env.LOG_LEVEL = 'warn';
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log('          DIVE V3 - OPAL Data Publisher');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    switch (options.command) {
      case 'health':
        await runHealthCheck(options.verbose);
        break;
      case 'sync':
        await runSync(options.verbose);
        break;
      case 'watch':
        await runWatch(options.verbose);
        break;
      case 'help':
      default:
        printHelp();
        break;
    }
  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

// Run main
main().catch(console.error);
