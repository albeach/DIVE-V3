/**
 * HTTPS Development Server for Next.js
 * Uses Node.js built-in https module for HTTP/1.1 with TLS compatibility
 * Required for: NextAuth state cookie persistence across HTTPS Keycloak redirects
 *
 * HTTP/2 is not compatible with Next.js 16.1.0 + Node.js 24 combination
 * Using HTTPS (HTTP/1.1) instead for reliable compatibility
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const next = require('next');

/**
 * Parse URL using WHATWG URL API (best practice, no deprecation warnings)
 * Returns an object compatible with what Next.js expects from url.parse()
 */
function parseUrl(urlString, baseUrl = 'https://localhost') {
  try {
    const url = new URL(urlString, baseUrl);
    return {
      pathname: url.pathname,
      query: Object.fromEntries(url.searchParams.entries()),
      search: url.search,
      href: url.href,
    };
  } catch {
    // Fallback for malformed URLs
    return { pathname: urlString, query: {}, search: '', href: urlString };
  }
}


const dev = process.env.NODE_ENV !== 'production';
// Explicitly bind to 0.0.0.0 by default. Docker sets HOSTNAME to the container ID,
// which causes the dev server to listen only on that hostname and break localhost healthchecks.
const hostname = process.env.BIND_HOST || process.env.HOST || '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Load SSL certificates (mkcert)
const certPath = process.env.CERT_PATH || process.env.SSL_CERT_PATH || path.join(__dirname, 'certs');

let serverOptions;
try {
  serverOptions = {
    key: fs.readFileSync(path.join(certPath, process.env.KEY_FILE || 'key.pem')),
    cert: fs.readFileSync(path.join(certPath, process.env.CERT_FILE || 'certificate.pem')),
  };
  console.log(`📁 Loading certificates from: ${certPath}`);
} catch (err) {
  console.error(`❌ Failed to load certificates from ${certPath}:`, err.message);
  process.exit(1);
}

app.prepare().then(() => {
  // Using HTTPS (HTTP/1.1) server - HTTP/2 has compatibility issues with Next.js 16.1.0 + Node.js 24
  const server = https.createServer(serverOptions);

  server.on('request', async (req, res) => {
    try {
      if (process.env.DEBUG_HTTP) {
        console.log(`[HTTP/${req.httpVersion}] ${req.method} ${req.url}`);
      }

      const parsedUrl = parseUrl(req.url, `https://${hostname}:${port}`);

      // Note: CSP headers are set in next.config.ts headers() function
      // Custom server still applies Next.js config headers

      // Node.js 24 HTTP/2 compatibility: Direct property patching
      // Add the missing methods that Next.js expects
      if (!res._implicitHeader) {
        res._implicitHeader = function () { }; // No-op for Next.js compatibility
      }

      // Ensure HTTP/1.1 style properties exist
      if (typeof res.statusCode === 'undefined') {
        res.statusCode = 200;
      }

      // Override setHeader to filter out HTTP/2 pseudo-headers that Next.js tries to set
      const originalSetHeader = res.setHeader;
      res.setHeader = function (name, value) {
        // Filter out HTTP/2 pseudo-headers that shouldn't be set manually
        if (name && name.startsWith(':')) {
          return; // Ignore pseudo-headers
        }
        return originalSetHeader.call(this, name, value);
      };

      const wrappedRes = res;

      try {
        await handle(req, wrappedRes, parsedUrl);
      } catch (err) {
        // Node.js 24 HTTP/2 compatibility: Catch and suppress header-related errors
        // Next.js tries to set HTTP/2 pseudo-headers which are invalid in Node.js 24
        if (err.message && err.message.includes('Headers.') && err.message.includes('invalid header name')) {
          console.warn('⚠️  Suppressed HTTP/2 header compatibility warning:', err.message);
          // Don't send error response for header compatibility issues
          return;
        } else {
          throw err; // Re-throw non-header related errors
        }
      }
    } catch (err) {
      console.error('Error handling request:', req.url, err);
      try {
        if (!res.headersSent && !res.destroyed) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Internal Server Error');
        }
      } catch (writeErr) {
        console.error('Failed to send error response:', writeErr);
      }
    }
  });

  server.on('error', (err) => {
    console.error('Server error:', err);
  });

  server.listen(port, hostname, () => {
    // Display localhost for user-friendly output (0.0.0.0 is just for binding)
    const displayHost = hostname === '0.0.0.0' ? 'localhost' : hostname;
    console.log(`> Ready on https://${displayHost}:${port}`);
    console.log(`> HTTPS (HTTP/1.1) enabled via Node.js built-in https`);
    console.log(`> Certificate: ${path.join(certPath, 'certificate.pem')}`);
  });
});
