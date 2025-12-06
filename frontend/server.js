/**
 * HTTP/2 Development Server for Next.js
 * Uses spdy package for HTTP/2 with Node.js http API compatibility
 * Required for: NextAuth state cookie persistence across HTTPS Keycloak redirects
 * 
 * spdy provides HTTP/2 support while maintaining compatibility with
 * Express/Next.js request/response objects
 */

const spdy = require('spdy');
const { parse } = require('url');
const next = require('next');
const fs = require('fs');
const path = require('path');

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Load SSL certificates (mkcert)
const certPath = process.env.CERT_PATH || process.env.SSL_CERT_PATH || '/opt/app/certs';

let serverOptions;
try {
  serverOptions = {
    key: fs.readFileSync(path.join(certPath, process.env.KEY_FILE || 'key.pem')),
    cert: fs.readFileSync(path.join(certPath, process.env.CERT_FILE || 'certificate.pem')),
    spdy: {
      // HTTP/2 in dev can trigger ERR_HTTP2_PROTOCOL_ERROR with some browsers/proxies
      // Fall back to HTTP/1.1 for stability while keeping TLS for NextAuth.
      protocols: ['http/1.1'],
      plain: false, // Use TLS (not plain TCP)
    },
  };
  console.log(`📁 Loading certificates from: ${certPath}`);
} catch (err) {
  console.error(`❌ Failed to load certificates from ${certPath}:`, err.message);
  process.exit(1);
}

app.prepare().then(() => {
  const server = spdy.createServer(serverOptions, async (req, res) => {
    try {
      if (process.env.DEBUG_HTTP) {
        console.log(`[HTTP/${req.httpVersion}] ${req.method} ${req.url}`);
      }

      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error handling request:', req.url, err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end('Internal Server Error');
      }
    }
  });

  server.on('error', (err) => {
    console.error('Server error:', err);
  });

  server.listen(port, hostname, () => {
    console.log(`> Ready on https://${hostname}:${port}`);
    console.log(`> HTTP/2 (h2) and HTTP/1.1 enabled`);
    console.log(`> Certificate: ${path.join(certPath, 'certificate.pem')}`);
  });
});
