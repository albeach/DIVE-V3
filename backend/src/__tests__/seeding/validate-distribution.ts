#!/usr/bin/env npx tsx
/**
 * MongoDB File Type Distribution Validator
 *
 * Validates that seeded resources match expected distribution percentages
 * and verifies data integrity for multi-format seeding.
 *
 * Usage:
 *   npx tsx validate-distribution.ts --instance USA --expected-count 5000
 *   npx tsx validate-distribution.ts --instance USA --tolerance 5
 */

import { MongoClient, Db } from 'mongodb';

interface FileTypeDistribution {
  fileType: string;
  count: number;
  percentage: number;
  expectedPercentage: number;
  variance: number;
}

interface ValidationResult {
  instance: string;
  totalResources: number;
  expectedCount: number;
  distribution: FileTypeDistribution[];
  missingFileTypes: string[];
  unexpectedFileTypes: string[];
  passedValidation: boolean;
  errors: string[];
  warnings: string[];
}

// Expected distribution based on FILE_TYPE_CONFIGS weights
const EXPECTED_DISTRIBUTION: Record<string, number> = {
  pdf: 20,
  docx: 20,
  xlsx: 8,
  pptx: 10,
  mp4: 7,
  mp3: 4,
  m4a: 4,
  jpg: 5,
  png: 5,
  txt: 3,
  html: 2,
  csv: 5,
  json: 4,
  xml: 3,
};

const ALL_FILE_TYPES = Object.keys(EXPECTED_DISTRIBUTION);

class DistributionValidator {
  private client: MongoClient;
  private db!: Db;
  private instanceCode: string;
  private tolerance: number;

  constructor(instanceCode: string, tolerance: number = 5) {
    this.instanceCode = instanceCode;
    this.tolerance = tolerance;
    const mongoUri = process.env.MONGODB_URI || `mongodb://mongodb-${instanceCode.toLowerCase()}:27017`;
    this.client = new MongoClient(mongoUri);
  }

  async connect(): Promise<void> {
    await this.client.connect();
    const dbName = `dive_${this.instanceCode.toLowerCase()}`;
    this.db = this.client.db(dbName);
    console.log(`✓ Connected to MongoDB: ${dbName}`);
  }

  async disconnect(): Promise<void> {
    await this.client.close();
    console.log('✓ Disconnected from MongoDB');
  }

  async getTotalCount(): Promise<number> {
    const count = await this.db.collection('resources').countDocuments({
      instanceCode: this.instanceCode,
    });
    return count;
  }

  async getFileTypeDistribution(): Promise<Map<string, number>> {
    const pipeline = [
      { $match: { instanceCode: this.instanceCode } },
      { $group: { _id: '$fileType', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ];

    const results = await this.db.collection('resources').aggregate(pipeline).toArray();

    const distribution = new Map<string, number>();
    for (const result of results) {
      if (result._id) {
        distribution.set(result._id, result.count);
      }
    }

    return distribution;
  }

  async getSeedManifestDistribution(): Promise<any> {
    const seedManifest = await this.db.collection('seed_manifests').findOne(
      { instanceCode: this.instanceCode },
      { sort: { timestamp: -1 } }
    );

    return seedManifest?.distribution || null;
  }

  async validateDistribution(expectedCount?: number): Promise<ValidationResult> {
    const totalResources = await this.getTotalCount();
    const distribution = await getFileTypeDistribution();

    const result: ValidationResult = {
      instance: this.instanceCode,
      totalResources,
      expectedCount: expectedCount || totalResources,
      distribution: [],
      missingFileTypes: [],
      unexpectedFileTypes: [],
      passedValidation: true,
      errors: [],
      warnings: [],
    };

    // Check total count
    if (expectedCount && Math.abs(totalResources - expectedCount) > this.tolerance) {
      result.errors.push(
        `Total resource count mismatch: expected ${expectedCount}, got ${totalResources}`
      );
      result.passedValidation = false;
    }

    // Analyze distribution for each expected file type
    for (const [fileType, expectedPct] of Object.entries(EXPECTED_DISTRIBUTION)) {
      const count = distribution.get(fileType) || 0;
      const actualPct = totalResources > 0 ? (count / totalResources) * 100 : 0;
      const variance = actualPct - expectedPct;

      const distItem: FileTypeDistribution = {
        fileType,
        count,
        percentage: parseFloat(actualPct.toFixed(2)),
        expectedPercentage: expectedPct,
        variance: parseFloat(variance.toFixed(2)),
      };

      result.distribution.push(distItem);

      // Check if variance exceeds tolerance
      if (Math.abs(variance) > this.tolerance) {
        result.warnings.push(
          `${fileType}: ${actualPct.toFixed(1)}% (expected ${expectedPct}%, variance ${variance > 0 ? '+' : ''}${variance.toFixed(1)}%)`
        );
      }

      // Check if file type is missing
      if (count === 0) {
        result.missingFileTypes.push(fileType);
        result.errors.push(`File type missing: ${fileType}`);
        result.passedValidation = false;
      }
    }

    // Check for unexpected file types
    for (const [fileType, count] of distribution.entries()) {
      if (!ALL_FILE_TYPES.includes(fileType)) {
        result.unexpectedFileTypes.push(fileType);
        result.warnings.push(`Unexpected file type found: ${fileType} (${count} instances)`);
      }
    }

    return result;
  }

  async validateZTDFStructure(): Promise<{ valid: number; invalid: number; errors: string[] }> {
    const resources = await this.db
      .collection('resources')
      .find({ instanceCode: this.instanceCode })
      .limit(100)
      .toArray();

    let valid = 0;
    let invalid = 0;
    const errors: string[] = [];

    for (const resource of resources) {
      try {
        // Check required ZTDF fields
        if (!resource.ztdf) {
          throw new Error(`Missing ztdf field: ${resource._id}`);
        }

        if (!resource.ztdf.manifest) {
          throw new Error(`Missing ztdf.manifest: ${resource._id}`);
        }

        if (!resource.ztdf.manifest.contentType) {
          throw new Error(`Missing ztdf.manifest.contentType: ${resource._id}`);
        }

        if (!resource.ztdf.manifest.policy) {
          throw new Error(`Missing ztdf.manifest.policy: ${resource._id}`);
        }

        if (!resource.fileType) {
          throw new Error(`Missing fileType: ${resource._id}`);
        }

        // Validate contentType matches fileType
        const expectedMimeType = this.getExpectedMimeType(resource.fileType);
        if (expectedMimeType && resource.ztdf.manifest.contentType !== expectedMimeType) {
          errors.push(
            `MIME type mismatch for ${resource._id}: expected ${expectedMimeType}, got ${resource.ztdf.manifest.contentType}`
          );
        }

        valid++;
      } catch (error) {
        invalid++;
        if (error instanceof Error) {
          errors.push(error.message);
        }
      }
    }

    return { valid, invalid, errors: errors.slice(0, 10) }; // Return first 10 errors
  }

  async validateBDOStructure(): Promise<{ valid: number; invalid: number; errors: string[] }> {
    const resources = await this.db
      .collection('resources')
      .find({
        instanceCode: this.instanceCode,
        bdoXml: { $exists: true },
      })
      .limit(100)
      .toArray();

    let valid = 0;
    let invalid = 0;
    const errors: string[] = [];

    for (const resource of resources) {
      try {
        const bdoXml = resource.bdoXml;

        if (!bdoXml) {
          continue; // BDO is optional for some file types
        }

        // Validate BDO structure
        if (!bdoXml.includes('mb:BindingInformation')) {
          throw new Error(`Invalid BDO root element: ${resource._id}`);
        }

        if (!bdoXml.includes('slab:originatorConfidentialityLabel')) {
          throw new Error(`Missing STANAG 4774 namespace: ${resource._id}`);
        }

        if (!bdoXml.includes('<slab:Classification>')) {
          throw new Error(`Missing classification element: ${resource._id}`);
        }

        if (!bdoXml.includes('mb:DataReference')) {
          throw new Error(`Missing DataReference: ${resource._id}`);
        }

        if (!bdoXml.includes('xmime:contentType')) {
          throw new Error(`Missing xmime:contentType: ${resource._id}`);
        }

        valid++;
      } catch (error) {
        invalid++;
        if (error instanceof Error) {
          errors.push(error.message);
        }
      }
    }

    return { valid, invalid, errors: errors.slice(0, 10) };
  }

  private getExpectedMimeType(fileType: string): string | null {
    const mimeTypes: Record<string, string> = {
      pdf: 'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      mp4: 'video/mp4',
      mp3: 'audio/mpeg',
      m4a: 'audio/mp4',
      jpg: 'image/jpeg',
      png: 'image/png',
      txt: 'text/plain',
      html: 'text/html',
      csv: 'text/csv',
      json: 'application/json',
      xml: 'application/xml',
    };

    return mimeTypes[fileType] || null;
  }

  printResults(result: ValidationResult): void {
    console.log('\n' + '='.repeat(80));
    console.log('  MULTI-FORMAT SEEDING - DISTRIBUTION VALIDATION REPORT');
    console.log('='.repeat(80) + '\n');

    console.log(`Instance:         ${result.instance}`);
    console.log(`Total Resources:  ${result.totalResources}`);
    if (result.expectedCount) {
      console.log(`Expected Count:   ${result.expectedCount}`);
    }
    console.log(`Tolerance:        ±${this.tolerance}%\n`);

    // Print distribution table
    console.log('File Type Distribution:');
    console.log('─'.repeat(80));
    console.log(
      `${'Type'.padEnd(10)} ${'Count'.padStart(8)} ${'Actual'.padStart(10)} ${'Expected'.padStart(10)} ${'Variance'.padStart(10)} ${'Status'.padEnd(10)}`
    );
    console.log('─'.repeat(80));

    for (const dist of result.distribution.sort((a, b) => b.count - a.count)) {
      const variance = dist.variance;
      const status =
        Math.abs(variance) <= this.tolerance
          ? '✓ OK'
          : Math.abs(variance) <= this.tolerance * 2
          ? '⚠ WARN'
          : '✗ FAIL';

      const varianceStr =
        variance > 0 ? `+${variance.toFixed(1)}%` : `${variance.toFixed(1)}%`;

      console.log(
        `${dist.fileType.padEnd(10)} ${String(dist.count).padStart(8)} ${(dist.percentage.toFixed(1) + '%').padStart(10)} ${(dist.expectedPercentage.toFixed(1) + '%').padStart(10)} ${varianceStr.padStart(10)} ${status.padEnd(10)}`
      );
    }

    console.log('─'.repeat(80) + '\n');

    // Print errors
    if (result.errors.length > 0) {
      console.log('Errors:');
      for (const error of result.errors) {
        console.log(`  ✗ ${error}`);
      }
      console.log('');
    }

    // Print warnings
    if (result.warnings.length > 0) {
      console.log('Warnings:');
      for (const warning of result.warnings) {
        console.log(`  ⚠ ${warning}`);
      }
      console.log('');
    }

    // Print missing/unexpected file types
    if (result.missingFileTypes.length > 0) {
      console.log(`Missing File Types: ${result.missingFileTypes.join(', ')}\n`);
    }

    if (result.unexpectedFileTypes.length > 0) {
      console.log(`Unexpected File Types: ${result.unexpectedFileTypes.join(', ')}\n`);
    }

    // Final result
    console.log('='.repeat(80));
    if (result.passedValidation) {
      console.log('  ✓ VALIDATION PASSED');
    } else {
      console.log('  ✗ VALIDATION FAILED');
    }
    console.log('='.repeat(80) + '\n');
  }
}

async function main() {
  const args = process.argv.slice(2);
  let instance = 'USA';
  let expectedCount: number | undefined;
  let tolerance = 5;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--instance' && args[i + 1]) {
      instance = args[i + 1].toUpperCase();
      i++;
    } else if (args[i] === '--expected-count' && args[i + 1]) {
      expectedCount = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--tolerance' && args[i + 1]) {
      tolerance = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--help') {
      console.log('Usage: npx tsx validate-distribution.ts [options]');
      console.log('');
      console.log('Options:');
      console.log('  --instance <code>         Instance code (default: USA)');
      console.log('  --expected-count <num>    Expected resource count');
      console.log('  --tolerance <pct>         Tolerance percentage (default: 5)');
      console.log('  --help                    Show this help message');
      process.exit(0);
    }
  }

  const validator = new DistributionValidator(instance, tolerance);

  try {
    await validator.connect();

    // Validate distribution
    console.log('Analyzing file type distribution...');
    const result = await validator.validateDistribution(expectedCount);
    validator.printResults(result);

    // Validate ZTDF structure
    console.log('Validating ZTDF structure (sample of 100)...');
    const ztdfResult = await validator.validateZTDFStructure();
    console.log(
      `  Valid: ${ztdfResult.valid}, Invalid: ${ztdfResult.invalid}`
    );
    if (ztdfResult.errors.length > 0) {
      console.log('  Errors:');
      ztdfResult.errors.forEach((err) => console.log(`    - ${err}`));
    }
    console.log('');

    // Validate BDO structure
    console.log('Validating BDO structure (sample of 100)...');
    const bdoResult = await validator.validateBDOStructure();
    console.log(
      `  Valid: ${bdoResult.valid}, Invalid: ${bdoResult.invalid}`
    );
    if (bdoResult.errors.length > 0) {
      console.log('  Errors:');
      bdoResult.errors.forEach((err) => console.log(`    - ${err}`));
    }
    console.log('');

    await validator.disconnect();

    // Exit with appropriate code
    process.exit(result.passedValidation ? 0 : 1);
  } catch (error) {
    console.error('Validation failed:', error);
    await validator.disconnect();
    process.exit(1);
  }
}

main();
