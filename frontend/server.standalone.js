/**
 * HTTPS Production Server for Next.js Standalone Mode
 *
 * Uses NextServer from next/dist/server/next-server (standalone-compatible)
 * instead of require('next') which pulls in webpack and other build dependencies.
 *
 * Serves _next/static/* files directly (standalone mode does not serve them
 * when customServer is true — they must be handled here or by a CDN).
 *
 * Zero Trust: ALL internal traffic must be TLS-encrypted.
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);
const certPath = process.env.CERT_PATH || process.env.SSL_CERT_PATH || path.join(__dirname, 'certs');

// MIME types for static assets
const MIME_TYPES = {
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.map': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
};

// Try to load TLS certificates
let httpsOptions = null;
try {
  const keyFile = process.env.KEY_FILE || 'key.pem';
  const certFile = process.env.CERT_FILE || 'certificate.pem';

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

const nextHandler = nextServer.getRequestHandler();

/**
 * Serve static files from .next/static/ and public/ directories.
 * Returns true if the request was handled, false otherwise.
 */
function serveStatic(req, res) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  let filePath = null;

  if (pathname.startsWith('/_next/static/')) {
    // Map /_next/static/* → .next/static/*
    filePath = path.join(__dirname, '.next', 'static', pathname.slice('/_next/static/'.length));
  } else if (!pathname.startsWith('/_next/') && !pathname.startsWith('/api/')) {
    // Try public/ directory for non-API, non-_next routes
    const publicPath = path.join(__dirname, 'public', pathname);
    if (fs.existsSync(publicPath) && fs.statSync(publicPath).isFile()) {
      filePath = publicPath;
    }
  }

  if (!filePath) return false;

  // Prevent directory traversal
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(__dirname))) return false;

  try {
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return false;

    const ext = path.extname(resolved).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const stream = fs.createReadStream(resolved);
    stream.pipe(res);
    return true;
  } catch {
    return false;
  }
}

// Request handler: static files first, then Next.js
function handler(req, res) {
  if (serveStatic(req, res)) return;
  nextHandler(req, res);
}

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
