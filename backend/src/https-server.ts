/**
 * HTTPS Server Wrapper for Backend
 * Uses self-signed certificates for local development
 * Required for: HTTPS-only frontend to call backend without mixed content errors
 * 
 * Single HTTPS Server (Best Practice):
 * - HTTPS (4000): All access (browser + Docker internal)
 * - Containers trust self-signed certs via NODE_TLS_REJECT_UNAUTHORIZED=0
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import app from './server';

const PORT = parseInt(process.env.PORT || '4000', 10);
const certPath = process.env.SSL_CERT_PATH || '/opt/keycloak/certs';

// Load SSL certificates (shared with Keycloak and Frontend)
const httpsOptions = {
  key: fs.readFileSync(path.join(certPath, 'key.pem')),
  cert: fs.readFileSync(path.join(certPath, 'certificate.pem')),
};

// Create HTTPS server
const server = https.createServer(httpsOptions, app);

server.listen(PORT, () => {
  console.log(`✅ Backend HTTPS server running on https://0.0.0.0:${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   SSL Certificates: ${certPath}`);
  console.log(`   External access: https://localhost:${PORT}`);
  console.log(`   Docker internal: https://backend:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTPS server');
  server.close(() => {
    console.log('HTTPS server closed');
  });
});

export { server };

