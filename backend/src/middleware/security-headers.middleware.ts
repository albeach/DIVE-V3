import helmet from 'helmet';
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

// ============================================
// Security Headers Middleware (Phase 3)
// ============================================
// Purpose: Add HTTP security headers to protect against common web vulnerabilities
// Standards: OWASP Security Headers recommendations

/**
 * Configure and apply security headers using Helmet
 * 
 * Headers applied:
 * - Content-Security-Policy (CSP): Controls resources the browser can load
 * - Strict-Transport-Security (HSTS): Forces HTTPS connections
 * - X-Frame-Options: Prevents clickjacking attacks
 * - X-Content-Type-Options: Prevents MIME-sniffing
 * - Referrer-Policy: Controls referrer information
 * - Permissions-Policy: Controls browser features
 */
export const securityHeaders = helmet({
    // Content Security Policy (CSP)
    // Prevents XSS, clickjacking, and other code injection attacks
    contentSecurityPolicy: {
        useDefaults: false,
        directives: {
            // Default source for all directives
            defaultSrc: ["'self'"],
            
            // Script sources (JavaScript)
            // 'unsafe-inline' needed for inline scripts (consider removing in production with nonce)
            scriptSrc: [
                "'self'",
                "'unsafe-inline'", // TODO: Replace with nonce-based CSP in production
                "https://cdn.jsdelivr.net", // For CDN resources if used
            ],
            
            // Style sources (CSS)
            // 'unsafe-inline' needed for inline styles (consider removing in production with nonce)
            styleSrc: [
                "'self'",
                "'unsafe-inline'", // TODO: Replace with nonce-based CSP in production
                "https://fonts.googleapis.com",
            ],
            
            // Image sources
            imgSrc: [
                "'self'",
                "data:", // Allow data URIs for inline images
                "https:", // Allow HTTPS images (for user avatars, external resources)
            ],
            
            // Font sources
            fontSrc: [
                "'self'",
                "https://fonts.gstatic.com",
                "data:", // Allow data URIs for inline fonts
            ],
            
            // Connection sources (fetch, XMLHttpRequest, WebSocket, EventSource)
            connectSrc: [
                "'self'",
                process.env.KEYCLOAK_URL || "http://localhost:8081",
                process.env.OPA_URL || "http://localhost:8181",
                process.env.KAS_URL || "http://localhost:8080",
            ],
            
            // Frame sources (for iframes)
            frameSrc: ["'none'"], // No iframes allowed by default
            
            // Object sources (for <object>, <embed>, <applet>)
            objectSrc: ["'none'"],
            
            // Base URI (for <base> tag)
            baseUri: ["'self'"],
            
            // Form action (where forms can submit)
            formAction: ["'self'"],
            
            // Frame ancestors (who can embed this page in an iframe)
            frameAncestors: ["'none'"], // Prevent clickjacking
            
            // Upgrade insecure requests (HTTP → HTTPS)
            upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
        },
    },

    // HTTP Strict Transport Security (HSTS)
    // Forces browsers to use HTTPS for all future requests
    hsts: {
        maxAge: 31536000, // 1 year in seconds
        includeSubDomains: true, // Apply to all subdomains
        preload: true, // Enable HSTS preloading
    },

    // X-Frame-Options: DENY
    // Prevents page from being embedded in iframes (clickjacking protection)
    frameguard: {
        action: 'deny',
    },

    // X-Content-Type-Options: nosniff
    // Prevents browsers from MIME-sniffing responses
    noSniff: true,

    // X-DNS-Prefetch-Control: off
    // Controls browser DNS prefetching
    dnsPrefetchControl: {
        allow: false,
    },

    // X-Download-Options: noopen
    // Prevents IE from executing downloads in site's context
    ieNoOpen: true,

    // Referrer-Policy: strict-origin-when-cross-origin
    // Controls referrer information sent with requests
    referrerPolicy: {
        policy: 'strict-origin-when-cross-origin',
    },

    // Permissions-Policy (formerly Feature-Policy)
    // Controls which browser features can be used
    // Note: Helmet v7+ handles this automatically
    // crossOriginEmbedderPolicy: false, // Disabled for compatibility
    // crossOriginOpenerPolicy: false, // Disabled for compatibility
    // crossOriginResourcePolicy: { policy: "same-origin" },
});

/**
 * Custom middleware to add additional security headers
 * and log security header application
 */
export const customSecurityHeaders = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    const requestId = req.headers['x-request-id'] as string;

    // Add custom security headers not covered by Helmet

    // X-Permitted-Cross-Domain-Policies: none
    // Restricts Adobe Flash and PDF cross-domain policies
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');

    // X-XSS-Protection: 0
    // Disable legacy XSS filter (deprecated, CSP is better)
    // Setting to 0 to avoid issues with false positives
    res.setHeader('X-XSS-Protection', '0');

    // Cache-Control for sensitive endpoints
    if (req.path.includes('/api/resources/') || req.path.includes('/api/admin/')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Surrogate-Control', 'no-store');
    }

    // Log security headers for monitoring (debug level)
    if (process.env.LOG_LEVEL === 'debug') {
        logger.debug('Security headers applied', {
            requestId,
            path: req.path,
            method: req.method,
            headers: {
                csp: res.getHeader('Content-Security-Policy') ? 'enabled' : 'disabled',
                hsts: res.getHeader('Strict-Transport-Security') ? 'enabled' : 'disabled',
                xFrameOptions: res.getHeader('X-Frame-Options'),
                xContentTypeOptions: res.getHeader('X-Content-Type-Options'),
                referrerPolicy: res.getHeader('Referrer-Policy'),
            },
        });
    }

    next();
};

/**
 * CORS security configuration
 * To be used with the 'cors' middleware
 * 
 * @returns CORS configuration object
 */
export const getCorsConfig = () => {
    const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS?.split(',') || [
        'http://localhost:3000', // Frontend development
        'http://localhost:4000', // Backend development
    ];

    return {
        origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
            // Allow requests with no origin (e.g., mobile apps, Postman)
            if (!origin) {
                return callback(null, true);
            }

            if (allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                logger.warn('CORS: Blocked request from unauthorized origin', {
                    origin,
                    allowedOrigins,
                });
                callback(new Error('Not allowed by CORS'));
            }
        },
        credentials: true, // Allow cookies and authentication headers
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: [
            'Content-Type',
            'Authorization',
            'X-Request-ID',
            'X-Requested-With',
        ],
        exposedHeaders: [
            'X-Request-ID',
            'RateLimit-Limit',
            'RateLimit-Remaining',
            'RateLimit-Reset',
        ],
        maxAge: 86400, // Cache preflight requests for 24 hours
    };
};

/**
 * Get security headers configuration (for health checks and monitoring)
 */
export const getSecurityHeadersConfig = (): {
    enabled: boolean;
    headers: string[];
    cspDirectives: string[];
} => {
    return {
        enabled: process.env.ENABLE_SECURITY_HEADERS !== 'false',
        headers: [
            'Content-Security-Policy',
            'Strict-Transport-Security',
            'X-Frame-Options',
            'X-Content-Type-Options',
            'Referrer-Policy',
            'X-Permitted-Cross-Domain-Policies',
        ],
        cspDirectives: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: https:",
            "font-src 'self' data:",
            "connect-src 'self'",
            "frame-ancestors 'none'",
        ],
    };
};

