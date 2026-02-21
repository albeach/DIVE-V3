// Quick test - just download an existing ZTDF resource
const https = require('https');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, 'output', 'ztdf-test');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Use a known test resource from seeded data
const RESOURCE_ID = 'doc-secret-fvey-rel-usa-gbr-can';
const ZTDF_FILE = path.join(OUTPUT_DIR, `${RESOURCE_ID}.ztdf`);

console.log('Testing ZTDF download without authentication...\n');
console.log(`Attempting to download: ${RESOURCE_ID}`);

const options = {
  hostname: 'localhost',
  port: 4000,
  path: `/api/resources/${RESOURCE_ID}/download`,
  method: 'GET',
  rejectUnauthorized: false
};

const req = https.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  console.log(`Headers:`, res.headers);
  
  if (res.statusCode === 401) {
    console.log('\n✗ 401 Unauthorized - JWT required (expected behavior)');
    console.log('✓ Endpoint exists and requires authentication');
    process.exit(0);
  }
  
  const chunks = [];
  res.on('data', (chunk) => chunks.push(chunk));
  res.on('end', () => {
    const buffer = Buffer.concat(chunks);
    fs.writeFileSync(ZTDF_FILE, buffer);
    console.log(`\n✓ Downloaded: ${ZTDF_FILE} (${buffer.length} bytes)`);
  });
});

req.on('error', (e) => {
  console.error(`✗ Request failed: ${e.message}`);
  process.exit(1);
});

req.end();
