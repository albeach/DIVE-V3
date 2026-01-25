#!/usr/bin/env npx tsx
/**
 * ZTDF Structure Validator
 *
 * Deep validation of ZTDF (Zero Trust Data Format) document structure
 * for multi-format seeded resources.
 *
 * Validates:
 * - ZTDF manifest structure
 * - Encryption metadata (AES-256-GCM)
 * - Policy bindings
 * - Classification and releasability
 * - Content type mappings
 * - STANAG 4778 BDO structure
 *
 * Usage:
 *   npx tsx validate-ztdf-structure.ts --instance USA --sample 100
 *   npx tsx validate-ztdf-structure.ts --instance USA --deep
 */

import { MongoClient, Db, ObjectId } from 'mongodb';
import { XMLParser } from 'fast-xml-parser';

interface ZTDFManifest {
  contentType?: string;
  policy?: {
    classification?: string;
    releasability?: string[];
    coi?: string[];
  };
  encryptionMethod?: string;
  integrityAlgorithm?: string;
}

interface ValidationIssue {
  resourceId: string;
  severity: 'error' | 'warning' | 'info';
  category: string;
  message: string;
  field?: string;
}

interface ValidationReport {
  instance: string;
  totalSampled: number;
  validDocuments: number;
  invalidDocuments: number;
  issues: ValidationIssue[];
  summary: {
    ztdfStructure: { valid: number; invalid: number };
    encryption: { valid: number; invalid: number };
    policyBindings: { valid: number; invalid: number };
    bdoStructure: { valid: number; invalid: number };
    contentTypes: { valid: number; invalid: number };
  };
}

class ZTDFValidator {
  private client: MongoClient;
  private db!: Db;
  private instanceCode: string;
  private xmlParser: XMLParser;

  constructor(instanceCode: string) {
    this.instanceCode = instanceCode;
    const mongoUri = process.env.MONGODB_URI || `mongodb://mongodb-${instanceCode.toLowerCase()}:27017`;
    this.client = new MongoClient(mongoUri);
    this.xmlParser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
    });
  }

  async connect(): Promise<void> {
    await this.client.connect();
    const dbName = `dive_${this.instanceCode.toLowerCase()}`;
    this.db = this.client.db(dbName);
    console.log(`✓ Connected to MongoDB: ${dbName}`);
  }

  async disconnect(): Promise<void> {
    await this.client.close();
  }

  async validateSample(sampleSize: number = 100): Promise<ValidationReport> {
    const resources = await this.db
      .collection('resources')
      .find({ instanceCode: this.instanceCode })
      .limit(sampleSize)
      .toArray();

    const report: ValidationReport = {
      instance: this.instanceCode,
      totalSampled: resources.length,
      validDocuments: 0,
      invalidDocuments: 0,
      issues: [],
      summary: {
        ztdfStructure: { valid: 0, invalid: 0 },
        encryption: { valid: 0, invalid: 0 },
        policyBindings: { valid: 0, invalid: 0 },
        bdoStructure: { valid: 0, invalid: 0 },
        contentTypes: { valid: 0, invalid: 0 },
      },
    };

    console.log(`Validating ${resources.length} resources...\n`);

    for (const resource of resources) {
      const resourceId = resource._id.toString();
      let hasErrors = false;

      // Validate ZTDF structure
      const ztdfIssues = this.validateZTDFStructure(resource);
      if (ztdfIssues.length > 0) {
        report.issues.push(...ztdfIssues);
        report.summary.ztdfStructure.invalid++;
        hasErrors = true;
      } else {
        report.summary.ztdfStructure.valid++;
      }

      // Validate encryption metadata
      const encryptionIssues = this.validateEncryption(resource);
      if (encryptionIssues.length > 0) {
        report.issues.push(...encryptionIssues);
        report.summary.encryption.invalid++;
        hasErrors = true;
      } else {
        report.summary.encryption.valid++;
      }

      // Validate policy bindings
      const policyIssues = this.validatePolicyBindings(resource);
      if (policyIssues.length > 0) {
        report.issues.push(...policyIssues);
        report.summary.policyBindings.invalid++;
        hasErrors = true;
      } else {
        report.summary.policyBindings.valid++;
      }

      // Validate content type
      const contentTypeIssues = this.validateContentType(resource);
      if (contentTypeIssues.length > 0) {
        report.issues.push(...contentTypeIssues);
        report.summary.contentTypes.invalid++;
        hasErrors = true;
      } else {
        report.summary.contentTypes.valid++;
      }

      // Validate BDO structure (if present)
      if (resource.bdoXml) {
        const bdoIssues = this.validateBDO(resource);
        if (bdoIssues.length > 0) {
          report.issues.push(...bdoIssues);
          report.summary.bdoStructure.invalid++;
          hasErrors = true;
        } else {
          report.summary.bdoStructure.valid++;
        }
      }

      if (hasErrors) {
        report.invalidDocuments++;
      } else {
        report.validDocuments++;
      }
    }

    return report;
  }

  private validateZTDFStructure(resource: any): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const resourceId = resource._id.toString();

    // Check ZTDF field exists
    if (!resource.ztdf) {
      issues.push({
        resourceId,
        severity: 'error',
        category: 'ztdf_structure',
        message: 'Missing ztdf field',
        field: 'ztdf',
      });
      return issues;
    }

    // Check manifest exists
    if (!resource.ztdf.manifest) {
      issues.push({
        resourceId,
        severity: 'error',
        category: 'ztdf_structure',
        message: 'Missing ztdf.manifest',
        field: 'ztdf.manifest',
      });
      return issues;
    }

    const manifest: ZTDFManifest = resource.ztdf.manifest;

    // Validate required manifest fields
    if (!manifest.contentType) {
      issues.push({
        resourceId,
        severity: 'error',
        category: 'ztdf_structure',
        message: 'Missing contentType in manifest',
        field: 'ztdf.manifest.contentType',
      });
    }

    if (!manifest.policy) {
      issues.push({
        resourceId,
        severity: 'error',
        category: 'ztdf_structure',
        message: 'Missing policy in manifest',
        field: 'ztdf.manifest.policy',
      });
    }

    // Check for payload field
    if (!resource.ztdf.payload && !resource.ztdf.encryptedData) {
      issues.push({
        resourceId,
        severity: 'warning',
        category: 'ztdf_structure',
        message: 'Missing encrypted payload data',
        field: 'ztdf.payload',
      });
    }

    return issues;
  }

  private validateEncryption(resource: any): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const resourceId = resource._id.toString();

    if (!resource.ztdf?.manifest) {
      return issues; // Already caught by structure validation
    }

    const manifest = resource.ztdf.manifest;

    // Check encryption method
    if (manifest.encryptionMethod) {
      const validMethods = ['AES-256-GCM', 'aes-256-gcm', 'AES256GCM'];
      const method = manifest.encryptionMethod.toUpperCase().replace(/-/g, '');

      if (!validMethods.some((m) => m.toUpperCase().replace(/-/g, '') === method)) {
        issues.push({
          resourceId,
          severity: 'error',
          category: 'encryption',
          message: `Invalid encryption method: ${manifest.encryptionMethod} (expected AES-256-GCM)`,
          field: 'ztdf.manifest.encryptionMethod',
        });
      }
    } else {
      issues.push({
        resourceId,
        severity: 'warning',
        category: 'encryption',
        message: 'Encryption method not specified',
        field: 'ztdf.manifest.encryptionMethod',
      });
    }

    // Check integrity algorithm
    if (manifest.integrityAlgorithm) {
      const validAlgorithms = ['GMAC', 'SHA-256', 'SHA256'];
      if (!validAlgorithms.includes(manifest.integrityAlgorithm)) {
        issues.push({
          resourceId,
          severity: 'warning',
          category: 'encryption',
          message: `Unusual integrity algorithm: ${manifest.integrityAlgorithm}`,
          field: 'ztdf.manifest.integrityAlgorithm',
        });
      }
    }

    // Check for encryption metadata
    if (!resource.ztdf.kasUrl && !resource.ztdf.kasUrls) {
      issues.push({
        resourceId,
        severity: 'warning',
        category: 'encryption',
        message: 'Missing KAS URL(s) for key retrieval',
        field: 'ztdf.kasUrl',
      });
    }

    return issues;
  }

  private validatePolicyBindings(resource: any): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const resourceId = resource._id.toString();

    if (!resource.ztdf?.manifest?.policy) {
      return issues; // Already caught by structure validation
    }

    const policy = resource.ztdf.manifest.policy;

    // Validate classification
    if (!policy.classification) {
      issues.push({
        resourceId,
        severity: 'error',
        category: 'policy',
        message: 'Missing classification in policy',
        field: 'ztdf.manifest.policy.classification',
      });
    } else {
      const validClassifications = [
        'UNCLASSIFIED',
        'CONFIDENTIAL',
        'SECRET',
        'TOP SECRET',
        'CUI',
      ];
      if (!validClassifications.includes(policy.classification.toUpperCase())) {
        issues.push({
          resourceId,
          severity: 'warning',
          category: 'policy',
          message: `Unusual classification: ${policy.classification}`,
          field: 'ztdf.manifest.policy.classification',
        });
      }
    }

    // Validate releasability
    if (policy.releasability && !Array.isArray(policy.releasability)) {
      issues.push({
        resourceId,
        severity: 'error',
        category: 'policy',
        message: 'Releasability must be an array',
        field: 'ztdf.manifest.policy.releasability',
      });
    }

    // Validate COI (Community of Interest)
    if (policy.coi && !Array.isArray(policy.coi)) {
      issues.push({
        resourceId,
        severity: 'error',
        category: 'policy',
        message: 'COI must be an array',
        field: 'ztdf.manifest.policy.coi',
      });
    }

    // Check for at least one policy constraint
    if (!policy.releasability && !policy.coi && !policy.dissemination) {
      issues.push({
        resourceId,
        severity: 'warning',
        category: 'policy',
        message: 'No policy constraints defined (releasability, COI, or dissemination)',
        field: 'ztdf.manifest.policy',
      });
    }

    return issues;
  }

  private validateContentType(resource: any): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const resourceId = resource._id.toString();

    const fileType = resource.fileType;
    const contentType = resource.ztdf?.manifest?.contentType;

    if (!fileType) {
      issues.push({
        resourceId,
        severity: 'error',
        category: 'content_type',
        message: 'Missing fileType field',
        field: 'fileType',
      });
      return issues;
    }

    if (!contentType) {
      return issues; // Already caught by structure validation
    }

    // Validate MIME type matches file type
    const expectedMimeType = this.getExpectedMimeType(fileType);
    if (expectedMimeType && contentType !== expectedMimeType) {
      issues.push({
        resourceId,
        severity: 'error',
        category: 'content_type',
        message: `MIME type mismatch: expected ${expectedMimeType} for ${fileType}, got ${contentType}`,
        field: 'ztdf.manifest.contentType',
      });
    }

    return issues;
  }

  private validateBDO(resource: any): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const resourceId = resource._id.toString();
    const bdoXml = resource.bdoXml;

    if (!bdoXml || typeof bdoXml !== 'string') {
      issues.push({
        resourceId,
        severity: 'warning',
        category: 'bdo',
        message: 'BDO XML is not a valid string',
        field: 'bdoXml',
      });
      return issues;
    }

    // Validate XML structure
    try {
      const parsed = this.xmlParser.parse(bdoXml);

      // Check root element
      if (!parsed['mb:BindingInformation'] && !parsed.BindingInformation) {
        issues.push({
          resourceId,
          severity: 'error',
          category: 'bdo',
          message: 'Invalid BDO root element (expected mb:BindingInformation)',
          field: 'bdoXml',
        });
      }
    } catch (error) {
      issues.push({
        resourceId,
        severity: 'error',
        category: 'bdo',
        message: `BDO XML parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        field: 'bdoXml',
      });
      return issues;
    }

    // Validate required elements
    const requiredElements = [
      'mb:BindingInformation',
      'slab:originatorConfidentialityLabel',
      'slab:Classification',
      'mb:DataReference',
      'xmime:contentType',
    ];

    for (const element of requiredElements) {
      if (!bdoXml.includes(element)) {
        issues.push({
          resourceId,
          severity: 'error',
          category: 'bdo',
          message: `Missing required BDO element: ${element}`,
          field: 'bdoXml',
        });
      }
    }

    // Validate namespace declarations
    const requiredNamespaces = [
      'xmlns:mb="urn:nato:stanag:4778:bindinginformation',
      'xmlns:slab="urn:nato:stanag:4774:confidentialitymetadatalabel',
      'xmlns:xmime="http://www.w3.org/2005/05/xmlmime',
    ];

    for (const ns of requiredNamespaces) {
      if (!bdoXml.includes(ns)) {
        issues.push({
          resourceId,
          severity: 'warning',
          category: 'bdo',
          message: `Missing namespace declaration: ${ns}...`,
          field: 'bdoXml',
        });
      }
    }

    // Validate classification matches resource
    const classificationMatch = bdoXml.match(/<slab:Classification>(.*?)<\/slab:Classification>/);
    if (classificationMatch) {
      const bdoClassification = classificationMatch[1];
      const resourceClassification = resource.classification;

      // Map UNCLASSIFIED to NATO UNCLASSIFIED
      const expectedNATOClass = resourceClassification === 'UNCLASSIFIED' ? 'NATO UNCLASSIFIED' : resourceClassification;

      if (bdoClassification !== expectedNATOClass && bdoClassification !== resourceClassification) {
        issues.push({
          resourceId,
          severity: 'warning',
          category: 'bdo',
          message: `BDO classification (${bdoClassification}) may not match resource (${resourceClassification})`,
          field: 'bdoXml',
        });
      }
    }

    return issues;
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

  printReport(report: ValidationReport): void {
    console.log('\n' + '='.repeat(80));
    console.log('  ZTDF STRUCTURE VALIDATION REPORT');
    console.log('='.repeat(80) + '\n');

    console.log(`Instance:          ${report.instance}`);
    console.log(`Total Sampled:     ${report.totalSampled}`);
    console.log(`Valid Documents:   ${report.validDocuments} (${((report.validDocuments / report.totalSampled) * 100).toFixed(1)}%)`);
    console.log(`Invalid Documents: ${report.invalidDocuments} (${((report.invalidDocuments / report.totalSampled) * 100).toFixed(1)}%)`);
    console.log('');

    // Print summary table
    console.log('Validation Summary:');
    console.log('─'.repeat(80));
    console.log(`${'Category'.padEnd(25)} ${'Valid'.padStart(10)} ${'Invalid'.padStart(10)} ${'Success Rate'.padStart(15)}`);
    console.log('─'.repeat(80));

    const categories = [
      { name: 'ZTDF Structure', data: report.summary.ztdfStructure },
      { name: 'Encryption Metadata', data: report.summary.encryption },
      { name: 'Policy Bindings', data: report.summary.policyBindings },
      { name: 'Content Types', data: report.summary.contentTypes },
      { name: 'BDO Structure', data: report.summary.bdoStructure },
    ];

    for (const category of categories) {
      const total = category.data.valid + category.data.invalid;
      const rate = total > 0 ? ((category.data.valid / total) * 100).toFixed(1) + '%' : 'N/A';

      console.log(
        `${category.name.padEnd(25)} ${String(category.data.valid).padStart(10)} ${String(category.data.invalid).padStart(10)} ${rate.padStart(15)}`
      );
    }

    console.log('─'.repeat(80) + '\n');

    // Group issues by severity and category
    const errorIssues = report.issues.filter((i) => i.severity === 'error');
    const warningIssues = report.issues.filter((i) => i.severity === 'warning');

    if (errorIssues.length > 0) {
      console.log(`Errors (${errorIssues.length}):`);
      const errorsByCategory = this.groupBy(errorIssues, 'category');
      for (const [category, issues] of Object.entries(errorsByCategory)) {
        console.log(`  ${category}: ${issues.length} error(s)`);
        issues.slice(0, 5).forEach((issue: ValidationIssue) => {
          console.log(`    ✗ [${issue.resourceId.substring(0, 8)}...] ${issue.message}`);
        });
        if (issues.length > 5) {
          console.log(`    ... and ${issues.length - 5} more`);
        }
      }
      console.log('');
    }

    if (warningIssues.length > 0 && warningIssues.length <= 20) {
      console.log(`Warnings (${warningIssues.length}):`);
      const warningsByCategory = this.groupBy(warningIssues, 'category');
      for (const [category, issues] of Object.entries(warningsByCategory)) {
        console.log(`  ${category}: ${issues.length} warning(s)`);
      }
      console.log('');
    } else if (warningIssues.length > 20) {
      console.log(`Warnings: ${warningIssues.length} (use --verbose to see details)\n`);
    }

    // Final verdict
    console.log('='.repeat(80));
    if (report.invalidDocuments === 0) {
      console.log('  ✓ ALL DOCUMENTS VALID');
    } else {
      const successRate = ((report.validDocuments / report.totalSampled) * 100).toFixed(1);
      console.log(`  ⚠ ${report.invalidDocuments} DOCUMENT(S) WITH ISSUES (${successRate}% success rate)`);
    }
    console.log('='.repeat(80) + '\n');
  }

  private groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
    return array.reduce((result, item) => {
      const groupKey = String(item[key]);
      if (!result[groupKey]) {
        result[groupKey] = [];
      }
      result[groupKey].push(item);
      return result;
    }, {} as Record<string, T[]>);
  }
}

async function main() {
  const args = process.argv.slice(2);
  let instance = 'USA';
  let sampleSize = 100;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--instance' && args[i + 1]) {
      instance = args[i + 1].toUpperCase();
      i++;
    } else if (args[i] === '--sample' && args[i + 1]) {
      sampleSize = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--deep') {
      sampleSize = 1000;
    } else if (args[i] === '--help') {
      console.log('Usage: npx tsx validate-ztdf-structure.ts [options]');
      console.log('');
      console.log('Options:');
      console.log('  --instance <code>    Instance code (default: USA)');
      console.log('  --sample <num>       Sample size (default: 100)');
      console.log('  --deep               Deep validation (sample 1000)');
      console.log('  --help               Show this help message');
      process.exit(0);
    }
  }

  const validator = new ZTDFValidator(instance);

  try {
    await validator.connect();

    const report = await validator.validateSample(sampleSize);
    validator.printReport(report);

    await validator.disconnect();

    // Exit with appropriate code
    process.exit(report.invalidDocuments === 0 ? 0 : 1);
  } catch (error) {
    console.error('Validation failed:', error);
    await validator.disconnect();
    process.exit(1);
  }
}

main();
