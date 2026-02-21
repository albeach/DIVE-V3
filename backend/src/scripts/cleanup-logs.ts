/**
 * Log Cleanup Script
 * 
 * Cleans up old log files and seed manifests to prevent disk space issues
 * 
 * Usage:
 *   npm run cleanup-logs
 *   tsx src/scripts/cleanup-logs.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const LOGS_DIR = path.join(process.cwd(), 'logs');
const SEED_LOG_DIR = path.join(LOGS_DIR, 'seed');
const MAX_MANIFEST_AGE_DAYS = 7;
const MAX_CHECKPOINT_AGE_DAYS = 3;

function cleanupOldManifests(): number {
    if (!fs.existsSync(SEED_LOG_DIR)) return 0;

    const now = Date.now();
    const maxAge = MAX_MANIFEST_AGE_DAYS * 24 * 60 * 60 * 1000;
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
                console.warn(`Warning: Could not delete ${file}: ${err}`);
            }
        }
    } catch (err) {
        console.error(`Error cleaning manifests: ${err}`);
    }

    return deletedCount;
}

function cleanupOldCheckpoints(): number {
    const checkpointDir = path.join(SEED_LOG_DIR, 'checkpoints');
    if (!fs.existsSync(checkpointDir)) return 0;

    const now = Date.now();
    const maxAge = MAX_CHECKPOINT_AGE_DAYS * 24 * 60 * 60 * 1000;
    let deletedCount = 0;

    try {
        const files = fs.readdirSync(checkpointDir)
            .filter(f => f.endsWith('.checkpoint.json'));

        for (const file of files) {
            const filePath = path.join(checkpointDir, file);
            try {
                const stats = fs.statSync(filePath);
                const age = now - stats.mtimeMs;

                if (age > maxAge) {
                    fs.unlinkSync(filePath);
                    deletedCount++;
                }
            } catch (err) {
                console.warn(`Warning: Could not delete checkpoint ${file}: ${err}`);
            }
        }
    } catch (err) {
        console.error(`Error cleaning checkpoints: ${err}`);
    }

    return deletedCount;
}

function cleanupOldLogFiles(): { app: number; error: number; authz: number } {
    if (!fs.existsSync(LOGS_DIR)) return { app: 0, error: 0, authz: 0 };

    const counts = { app: 0, error: 0, authz: 0 };

    // Clean up app.log files beyond maxFiles: 5
    const appFiles = fs.readdirSync(LOGS_DIR)
        .filter(f => /^app\d*\.log$/.test(f))
        .map(f => ({
            name: f,
            path: path.join(LOGS_DIR, f),
            num: f === 'app.log' ? 0 : parseInt(f.replace('app', '').replace('.log', '')) || 0
        }))
        .sort((a, b) => b.num - a.num);

    // Keep only the 5 most recent (app.log + app1.log through app4.log)
    const appToDelete = appFiles.slice(5);
    for (const file of appToDelete) {
        try {
            fs.unlinkSync(file.path);
            counts.app++;
        } catch (err) {
            console.warn(`Warning: Could not delete ${file.name}: ${err}`);
        }
    }

    // Clean up error.log files beyond maxFiles: 5
    const errorFiles = fs.readdirSync(LOGS_DIR)
        .filter(f => /^error\d*\.log$/.test(f))
        .map(f => ({
            name: f,
            path: path.join(LOGS_DIR, f),
            num: f === 'error.log' ? 0 : parseInt(f.replace('error', '').replace('.log', '')) || 0
        }))
        .sort((a, b) => b.num - a.num);

    const errorToDelete = errorFiles.slice(5);
    for (const file of errorToDelete) {
        try {
            fs.unlinkSync(file.path);
            counts.error++;
        } catch (err) {
            console.warn(`Warning: Could not delete ${file.name}: ${err}`);
        }
    }

    // Clean up authz.log files beyond maxFiles: 10
    const authzFiles = fs.readdirSync(LOGS_DIR)
        .filter(f => /^authz\d*\.log$/.test(f))
        .map(f => ({
            name: f,
            path: path.join(LOGS_DIR, f),
            num: f === 'authz.log' ? 0 : parseInt(f.replace('authz', '').replace('.log', '')) || 0
        }))
        .sort((a, b) => b.num - a.num);

    const authzToDelete = authzFiles.slice(10);
    for (const file of authzToDelete) {
        try {
            fs.unlinkSync(file.path);
            counts.authz++;
        } catch (err) {
            console.warn(`Warning: Could not delete ${file.name}: ${err}`);
        }
    }

    return counts;
}

async function main() {
    console.log('🧹 Starting log cleanup...\n');

    const manifestCount = cleanupOldManifests();
    const checkpointCount = cleanupOldCheckpoints();
    const logCounts = cleanupOldLogFiles();

    console.log('✅ Cleanup complete!\n');
    console.log(`   Seed manifests deleted: ${manifestCount}`);
    console.log(`   Checkpoints deleted: ${checkpointCount}`);
    console.log(`   App log files deleted: ${logCounts.app}`);
    console.log(`   Error log files deleted: ${logCounts.error}`);
    console.log(`   Authz log files deleted: ${logCounts.authz}`);
    console.log(`   Total files deleted: ${manifestCount + checkpointCount + logCounts.app + logCounts.error + logCounts.authz}\n`);
}

main().catch(console.error);
