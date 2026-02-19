/**
 * HTTPS Production Server for Next.js Standalone Mode
 *
 * Uses NextServer from next/dist/server/next-server (standalone-compatible)
 * instead of require('next') which pulls in webpack and other build dependencies.
 *
 * Zero Trust: ALL internal traffic must be TLS-encrypted.
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);
const certPath = process.env.CERT_PATH || process.env.SSL_CERT_PATH || path.join(__dirname, 'certs');

// Try to load TLS certificates
let httpsOptions = null;
try {
  const keyFile = process.env.KEY_FILE || 'key.pem';
  const certFile = process.env.CERT_FILE || 'certificate.pem';

  // Try certificate.pem first, fallback to fullchain.pem
  let certFilePath = path.join(certPath, certFile);
  if (!fs.existsSync(certFilePath)) {
    certFilePath = path.join(certPath, 'fullchain.pem');
  }

  httpsOptions = {
    key: fs.readFileSync(path.join(certPath, keyFile)),
    cert: fs.readFileSync(certFilePath),
  };
  console.log(`[server] TLS certificates loaded from: ${certPath}`);
} catch (err) {
  console.warn(`[server] TLS certificates not found at ${certPath}: ${err.message}`);
  console.warn('[server] Falling back to HTTP (not recommended for production)');
}

// Load Next.js server (standalone-compatible import)
const NextServer = require('next/dist/server/next-server').default;

const nextServer = new NextServer({
  hostname,
  port,
  dir: path.join(__dirname),
  dev: false,
  customServer: true,
  conf: require(path.join(__dirname, '.next/required-server-files.json')).config,
});

const handler = nextServer.getRequestHandler();

// Create HTTPS or HTTP server
const server = httpsOptions
  ? https.createServer(httpsOptions, handler)
  : http.createServer(handler);

server.listen(port, hostname, () => {
  const protocol = httpsOptions ? 'https' : 'http';
  const displayHost = hostname === '0.0.0.0' ? 'localhost' : hostname;
  console.log(`> Ready on ${protocol}://${displayHost}:${port}`);
  if (httpsOptions) {
    console.log('> Zero Trust: HTTPS enabled (internal TLS)');
  }
});

server.on('error', (err) => {
  console.error('[server] Error:', err);
  process.exit(1);
});
