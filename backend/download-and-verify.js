// Download ZTDF via frontend API and verify
const https = require('https');
const fs = require('fs');
const { execSync } = require('child_process');

const RESOURCE_ID = 'doc-generated-1763356678763-0133';
const OUTPUT_DIR = './output/proof-test';
const ZTDF_FILE = `${OUTPUT_DIR}/${RESOURCE_ID}.ztdf`;

// Create output directory
execSync(`mkdir -p ${OUTPUT_DIR}`, { stdio: 'ignore' });

console.log('🔥 COMPLETE ZTDF DOWNLOAD & VERIFICATION TEST');
console.log('════════════════════════════════════════════════════════════\n');

// Since we don't have session cookie, let's verify the file that browser downloaded
// by having the user run this in browser console and give us the base64

console.log('Step 1: Browser Console Download');
console.log('─────────────────────────────────────────────────────────────');
console.log('Run this in browser console on the resource page:\n');

const browserScript = `
const resourceId = '${RESOURCE_ID}';
fetch(\`/api/resources/\${resourceId}/download\`)
  .then(res => res.arrayBuffer())
  .then(buffer => {
    const bytes = new Uint8Array(buffer);
    const binary = String.fromCharCode.apply(null, Array.from(bytes));
    const base64 = btoa(binary);
    
    // Save to file system via Node.js
    const fs = require('fs');
    fs.writeFileSync('${ZTDF_FILE}', Buffer.from(base64, 'base64'));
    console.log('✅ Saved to: ${ZTDF_FILE}');
    console.log('Size:', buffer.byteLength, 'bytes');
  });
`;

console.log(browserScript);
console.log('\n');
console.log('OR run Node.js version below...\n');
