import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from 'dotenv';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/error.middleware';
import resourceRoutes from './routes/resource.routes';
import healthRoutes from './routes/health.routes';
import policyRoutes from './routes/policy.routes';
import uploadRoutes from './routes/upload.routes';
import adminRoutes from './routes/admin.routes';
import publicRoutes from './routes/public.routes';
import complianceRoutes from './routes/compliance.routes';
import coiKeysRoutes from './routes/coi-keys.routes';
import authRoutes from './controllers/auth.controller';  // Gap #7: Token revocation

// Load environment variables from parent directory
config({ path: '../.env.local' });

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
app.use((req, _res, next) => {
  const requestId = req.headers['x-request-id'] || `req-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  req.headers['x-request-id'] = requestId as string;

  logger.info('Incoming request', {
    requestId,
    method: req.method,
    path: req.path,
    ip: req.ip
  });

  next();
});

// ============================================
// Routes
// ============================================

app.use('/health', healthRoutes);
app.use('/api', publicRoutes);  // Public routes (no auth required)
app.use('/api/resources', resourceRoutes);
app.use('/api/policies', policyRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/compliance', complianceRoutes);
app.use('/api/coi-keys', coiKeysRoutes);
app.use('/api/auth', authRoutes);  // Gap #7: Token revocation endpoints

// Root endpoint
app.get('/', (_req, res) => {
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
  logger.info('DIVE V3 Backend API started', {
    port: PORT,
    env: process.env.NODE_ENV,
    keycloak: process.env.KEYCLOAK_URL,
    opa: process.env.OPA_URL,
    mongodb: process.env.MONGODB_URL
  });
});

export default app;

