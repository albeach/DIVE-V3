/**
 * HTTPS Development Server for Next.js
 * Uses mkcert certificates for local development
 * Required for: NextAuth state cookie persistence across HTTPS Keycloak redirects
 */

const { createServer } = require('https');
const { parse } = require('url');
const next = require('next');
const fs = require('fs');
const path = require('path');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Load SSL certificates (mkcert)
// Priority: /opt/app/certs (mkcert) > /opt/keycloak/certs (fallback)
const certPath = process.env.CERT_PATH || process.env.SSL_CERT_PATH || '/opt/app/certs';
const httpsOptions = {
  key: fs.readFileSync(path.join(certPath, process.env.KEY_FILE || 'key.pem')),
  cert: fs.readFileSync(path.join(certPath, process.env.CERT_FILE || 'certificate.pem')),
};

console.log(`📁 Loading certificates from: ${certPath}`);

app.prepare().then(() => {
  createServer(httpsOptions, async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  })
    .once('error', (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Ready on https://${hostname}:${port}`);
      console.log(`> Certificate: ${path.join(certPath, 'certificate.pem')}`);
    });
});

