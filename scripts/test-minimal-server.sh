#!/usr/bin/env bash
# Test minimal server in container
docker run --rm -it --entrypoint sh -e NODE_ENV=production -v /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/certs/mkcert:/app/certs dive-hub-frontend:latest -c "
cat > /tmp/minimal-server.js << 'EOF'
const https = require('https');
const fs = require('fs');
const path = require('path');
const next = require('next');

const dev = false;
const hostname = '0.0.0.0';
const port = 3000;

const certPath = '/app/certs';
const serverOptions = {
  key: fs.readFileSync(path.join(certPath, 'key.pem')),
  cert: fs.readFileSync(path.join(certPath, 'certificate.pem')),
};

console.log('Creating Next app...');
const app = next({ dev, hostname, port });

app.prepare().then(() => {
  console.log('App prepared, exiting test');
  process.exit(0);
}).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
EOF

node /tmp/minimal-server.js
"
