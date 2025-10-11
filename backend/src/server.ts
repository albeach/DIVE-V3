import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from 'dotenv';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/error.middleware';
import resourceRoutes from './routes/resource.routes';
import healthRoutes from './routes/health.routes';

// Load environment variables
config({ path: '.env.local' });

const app: Application = express();
const PORT = process.env.PORT || 4000;

// ============================================
// Middleware
// ============================================

// Security headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            connectSrc: ["'self'", process.env.KEYCLOAK_BASE_URL || 'http://localhost:8081']
        }
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true
    }
}));

// CORS
app.use(cors({
    origin: process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID']
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
    const requestId = req.headers['x-request-id'] || `req-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    req.headers['x-request-id'] = requestId as string;

    logger.info({
        requestId,
        method: req.method,
        path: req.path,
        ip: req.ip
    }, 'Incoming request');

    next();
});

// ============================================
// Routes
// ============================================

app.use('/health', healthRoutes);
app.use('/api/resources', resourceRoutes);

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        service: 'DIVE V3 Backend API',
        version: '1.0.0',
        status: 'running',
        timestamp: new Date().toISOString()
    });
});

// ============================================
// Error Handling
// ============================================

app.use(errorHandler);

// ============================================
// Server Startup
// ============================================

app.listen(PORT, () => {
    logger.info({
        port: PORT,
        env: process.env.NODE_ENV,
        keycloak: process.env.KEYCLOAK_URL,
        opa: process.env.OPA_URL,
        mongodb: process.env.MONGODB_URL
    }, 'DIVE V3 Backend API started');
});

export default app;

