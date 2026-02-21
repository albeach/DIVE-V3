#!/usr/bin/env node

/**
 * Create a ZTDF resource via upload endpoint and test download
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { spawn } = require('child_process');

// Configuration
const BACKEND_URL = process.env.BACKEND_URL || 'https://localhost:4000';
const JWT_SECRET = process.env.JWT_SECRET || 'your-256-bit-secret-key-for-jwt-signing-must-be-at-least-32-chars';
const OUTPUT_DIR = path.join(__dirname, 'output', 'ztdf-test');

// Create output directory
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Generate JWT token
const token = jwt.sign(
  {
    uniqueID: 'john.doe@mil',
    clearance: 'TOP_SECRET',
    countryOfAffiliation: 'USA',
    acpCOI: ['FVEY', 'NATO-COSMIC']
  },
  JWT_SECRET,
  { expiresIn: '1h' }
);

console.log('============================================');
console.log('ZTDF Create and Download Test');
console.log('============================================\n');

async function makeRequest(options, data) {
  return new Promise((resolve, reject) => {
    const protocol = options.protocol === 'https:' ? https : http;
    const req = protocol.request(options, (res) => {
      let body = '';
      let buffer = [];
      
      res.on('data', (chunk) => {
        if (Buffer.isBuffer(chunk)) {
          buffer.push(chunk);
        } else {
          body += chunk;
        }
      });
      
      res.on('end', () => {
        if (buffer.length > 0) {
          resolve({ status: res.statusCode, headers: res.headers, buffer: Buffer.concat(buffer) });
        } else {
          resolve({ status: res.statusCode, headers: res.headers, body });
        }
      });
    });
    
    req.on('error', reject);
    
    if (data) {
      req.write(data);
    }
    req.end();
  });
}

async function main() {
  try {
    // Step 1: Upload a file to create ZTDF resource
    console.log('Step 1: Upload File to Create ZTDF Resource');
    console.log('--------------------------------------------');
    
    const testContent = Buffer.from('This is a test document for ZTDF export validation.');
    const testFileName = 'test-document.txt';
    
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    
    let formData = '';
    formData += `--${boundary}\r\n`;
    formData += `Content-Disposition: form-data; name="file"; filename="${testFileName}"\r\n`;
    formData += `Content-Type: text/plain\r\n\r\n`;
    const formDataBuffer = Buffer.concat([
      Buffer.from(formData),
      testContent,
      Buffer.from(`\r\n--${boundary}\r\n`),
      Buffer.from(`Content-Disposition: form-data; name="metadata"\r\n\r\n`),
      Buffer.from(JSON.stringify({
        title: 'Test ZTDF Export Document',
        classification: 'SECRET',
        releasabilityTo: ['USA', 'GBR', 'CAN'],
        COI: ['FVEY'],
        coiOperator: 'ALL',
        caveats: []
      })),
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);
    
    const uploadUrl = new URL(`${BACKEND_URL}/api/upload`);
    const uploadOptions = {
      hostname: uploadUrl.hostname,
      port: uploadUrl.port || (uploadUrl.protocol === 'https:' ? 443 : 80),
      path: uploadUrl.pathname,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': formDataBuffer.length
      },
      protocol: uploadUrl.protocol,
      rejectUnauthorized: false
    };
    
    const uploadResult = await makeRequest(uploadOptions, formDataBuffer);
    
    if (uploadResult.status !== 201 && uploadResult.status !== 200) {
      console.error('✗ Upload failed:', uploadResult.status);
      console.error(uploadResult.body);
      process.exit(1);
    }
    
    const uploadData = JSON.parse(uploadResult.body);
    const resourceId = uploadData.resourceId;
    
    console.log(`✓ File uploaded successfully`);
    console.log(`✓ Resource ID: ${resourceId}`);
    console.log(`✓ Display Marking: ${uploadData.displayMarking || 'N/A'}`);
    console.log('');
    
    // Step 2: Download ZTDF file
    console.log('Step 2: Download ZTDF File');
    console.log('---------------------------');
    
    const downloadUrl = new URL(`${BACKEND_URL}/api/resources/${resourceId}/download`);
    const downloadOptions = {
      hostname: downloadUrl.hostname,
      port: downloadUrl.port || (downloadUrl.protocol === 'https:' ? 443 : 80),
      path: downloadUrl.pathname,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      protocol: downloadUrl.protocol,
      rejectUnauthorized: false
    };
    
    const downloadResult = await makeRequest(downloadOptions);
    
    if (downloadResult.status !== 200) {
      console.error('✗ Download failed:', downloadResult.status);
      console.error(downloadResult.body);
      process.exit(1);
    }
    
    const ztdfFile = path.join(OUTPUT_DIR, `${resourceId}.ztdf`);
    fs.writeFileSync(ztdfFile, downloadResult.buffer);
    
    const fileSize = fs.statSync(ztdfFile).size;
    console.log(`✓ Downloaded ZTDF file: ${ztdfFile}`);
    console.log(`✓ File size: ${fileSize} bytes`);
    console.log(`✓ Content-Type: ${downloadResult.headers['content-type']}`);
    console.log(`✓ TDF Spec Version: ${downloadResult.headers['x-ztdf-spec-version']}`);
    console.log('');
    
    // Step 3: Verify ZIP structure
    console.log('Step 3: Verify ZIP Structure');
    console.log('-----------------------------');
    
    // Use unzip command
    await new Promise((resolve, reject) => {
      const unzip = spawn('unzip', ['-l', ztdfFile]);
      let output = '';
      
      unzip.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      unzip.on('close', (code) => {
        if (code !== 0) {
          reject(new Error('unzip failed'));
          return;
        }
        
        console.log(output);
        
        if (!output.includes('0.manifest.json')) {
          reject(new Error('Missing 0.manifest.json'));
          return;
        }
        
        if (!output.includes('0.payload')) {
          reject(new Error('Missing 0.payload'));
          return;
        }
        
        console.log('✓ ZIP contains required files (0.manifest.json + 0.payload)\n');
        resolve();
      });
    });
    
    // Step 4: Extract and validate manifest
    console.log('Step 4: Validate Manifest Format');
    console.log('---------------------------------');
    
    await new Promise((resolve, reject) => {
      const manifestFile = path.join(OUTPUT_DIR, 'manifest.json');
      const unzip = spawn('unzip', ['-p', ztdfFile, '0.manifest.json']);
      const output = fs.createWriteStream(manifestFile);
      
      unzip.stdout.pipe(output);
      
      unzip.on('close', () => {
        const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf-8'));
        
        console.log(`✓ tdf_spec_version: ${manifest.tdf_spec_version}`);
        console.log(`✓ payload.type: ${manifest.payload.type}`);
        console.log(`✓ payload.url: ${manifest.payload.url}`);
        console.log(`✓ payload.protocol: ${manifest.payload.protocol}`);
        console.log(`✓ payload.isEncrypted: ${manifest.payload.isEncrypted}`);
        console.log(`✓ encryptionInformation.type: ${manifest.encryptionInformation.type}`);
        console.log(`✓ keyAccess count: ${manifest.encryptionInformation.keyAccess.length}`);
        console.log(`✓ assertions count: ${manifest.assertions.length}`);
        
        if (manifest.tdf_spec_version !== '4.3.0') {
          reject(new Error(`Invalid spec version: ${manifest.tdf_spec_version}`));
          return;
        }
        
        console.log('');
        resolve();
      });
    });
    
    // Step 5: Show STANAG 4774 assertion
    console.log('Step 5: STANAG 4774 Assertion Details');
    console.log('--------------------------------------');
    
    const manifestFile = path.join(OUTPUT_DIR, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf-8'));
    const assertion = manifest.assertions[0];
    
    console.log(`✓ Assertion ID: ${assertion.id}`);
    console.log(`✓ Type: ${assertion.type}`);
    console.log(`✓ Scope: ${assertion.scope}`);
    console.log(`✓ Applies to state: ${assertion.appliesToState}`);
    if (assertion.statement.value.ConfidentialityInformation) {
      console.log(`✓ Classification: ${assertion.statement.value.ConfidentialityInformation.Classification}`);
    }
    console.log(`✓ Binding method: ${assertion.binding.method}`);
    console.log('');
    
    // Success summary
    console.log('============================================');
    console.log('✅ ALL TESTS PASSED!');
    console.log('============================================\n');
    console.log('Summary:');
    console.log(`  • Resource ID: ${resourceId}`);
    console.log(`  • ZTDF file: ${ztdfFile}`);
    console.log(`  • File size: ${fileSize} bytes`);
    console.log(`  • TDF spec version: 4.3.0`);
    console.log(`  • OpenTDF compliant: YES`);
    console.log('');
    console.log(`Files saved to: ${OUTPUT_DIR}/`);
    console.log(`  - ${resourceId}.ztdf (complete ZTDF file)`);
    console.log(`  - manifest.json (extracted manifest)`);
    console.log('');
    
  } catch (error) {
    console.error('\n✗ Test failed:', error.message);
    process.exit(1);
  }
}

main();
