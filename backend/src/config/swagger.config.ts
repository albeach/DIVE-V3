/**
 * DIVE V3 - OpenAPI/Swagger Configuration
 *
 * Centralized OpenAPI 3.0 specification for all DIVE V3 API endpoints.
 * Supports interactive documentation via Swagger UI.
 *
 * @version 1.0.0
 * @date 2025-12-29
 */

import swaggerJsdoc from 'swagger-jsdoc';
import path from 'path';

const serverUrl = process.env.API_URL || 'https://localhost:4000';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'DIVE V3 API',
      version: '1.0.0',
      description: `
## Coalition-Friendly ICAM API

DIVE V3 is a federated identity and access management platform demonstrating
cross-coalition resource sharing with policy-driven ABAC authorization.

### Key Features
- **Federated Authentication**: Keycloak-brokered identity from USA/NATO partners
- **ABAC Authorization**: OPA-based policy enforcement with ACP-240 compliance
- **Zero Trust Data Format**: ZTDF encryption with policy-bound key release
- **Hub-Spoke Federation**: Distributed resource access across coalition partners

### Authentication
All protected endpoints require a valid JWT Bearer token obtained from Keycloak.
Include the token in the \`Authorization\` header:
\`\`\`
Authorization: Bearer <your-jwt-token>
\`\`\`

### Common Response Codes
| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request - Invalid parameters |
| 401 | Unauthorized - Missing or invalid token |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found |
| 500 | Internal Server Error |
      `,
      contact: {
        name: 'DIVE V3 Team',
        email: 'dive-v3@example.mil',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: serverUrl,
        description: process.env.NODE_ENV === 'production' ? 'Production API Server' : 'Development API Server',
      },
    ],
    tags: [
      {
        name: 'Resources',
        description: 'Document and resource management endpoints',
      },
      {
        name: 'Federation',
        description: 'Hub-Spoke federation and cross-instance operations',
      },
      {
        name: 'Policies',
        description: 'OPA policy management and evaluation',
      },
      {
        name: 'KAS',
        description: 'Key Access Service for ZTDF encryption',
      },
      {
        name: 'Authentication',
        description: 'Token management and session operations',
      },
      {
        name: 'Admin',
        description: 'Administrative operations and system management',
      },
      {
        name: 'Compliance',
        description: 'Audit logs and compliance monitoring',
      },
      {
        name: 'Health',
        description: 'System health and status endpoints',
      },
      {
        name: 'Dashboard',
        description: 'Dashboard statistics and metrics',
      },
      {
        name: 'Spoke Management',
        description: 'Spoke instance operations and failover control',
      },
      {
        name: 'OPAL',
        description: 'Open Policy Administration Layer - policy distribution',
      },
      {
        name: 'COI',
        description: 'Community of Interest management',
      },
      {
        name: 'Clearance',
        description: 'Security clearance level mappings',
      },
      {
        name: 'SPIF',
        description: 'Security Policy Information File - classification markings',
      },
      {
        name: 'Service Providers',
        description: 'Service Provider registration and management',
      },
      {
        name: 'Notifications',
        description: 'User notification system',
      },
      {
        name: 'Analytics',
        description: 'Search analytics and usage tracking',
      },
      {
        name: 'Upload',
        description: 'Document upload with ZTDF encryption',
      },
      {
        name: 'OTP',
        description: 'One-Time Password configuration',
      },
      {
        name: 'Certificates',
        description: 'X.509 certificate management and rotation',
      },
      {
        name: 'Drift Detection',
        description: 'Policy drift detection and reconciliation',
      },
      {
        name: 'Document Conversion',
        description: 'Office document format conversion',
      },
      {
        name: 'Public',
        description: 'Public endpoints (no authentication required)',
      },
      {
        name: 'Metrics',
        description: 'Prometheus metrics and observability',
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token obtained from Keycloak authentication',
        },
      },
      schemas: {
        // Common schemas
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Error type',
              example: 'Forbidden',
            },
            message: {
              type: 'string',
              description: 'Human-readable error message',
              example: 'Insufficient clearance level',
            },
            details: {
              type: 'object',
              description: 'Additional error details',
            },
          },
        },
        Resource: {
          type: 'object',
          properties: {
            resourceId: {
              type: 'string',
              description: 'Unique resource identifier',
              example: 'doc-usa-001',
            },
            title: {
              type: 'string',
              description: 'Document title',
              example: 'Coalition Fuel Inventory Report',
            },
            classification: {
              type: 'string',
              enum: ['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'],
              description: 'Security classification level',
              example: 'SECRET',
            },
            releasabilityTo: {
              type: 'array',
              items: { type: 'string' },
              description: 'ISO 3166-1 alpha-3 country codes',
              example: ['USA', 'GBR', 'CAN'],
            },
            COI: {
              type: 'array',
              items: { type: 'string' },
              description: 'Communities of Interest',
              example: ['FVEY', 'NATO-COSMIC'],
            },
            encrypted: {
              type: 'boolean',
              description: 'Whether resource uses ZTDF encryption',
              example: true,
            },
            creationDate: {
              type: 'string',
              format: 'date-time',
              description: 'ISO 8601 creation timestamp',
            },
          },
          required: ['resourceId', 'title', 'classification', 'releasabilityTo'],
        },
        AuthorizationDecision: {
          type: 'object',
          properties: {
            allow: {
              type: 'boolean',
              description: 'Authorization decision',
              example: true,
            },
            reason: {
              type: 'string',
              description: 'Human-readable decision reason',
              example: 'All authorization checks passed',
            },
            obligations: {
              type: 'array',
              items: { type: 'string' },
              description: 'Required actions (e.g., request KAS key)',
              example: ['request_kas_key'],
            },
            evaluation_details: {
              type: 'object',
              properties: {
                clearance_check: {
                  type: 'string',
                  enum: ['PASS', 'FAIL'],
                },
                releasability_check: {
                  type: 'string',
                  enum: ['PASS', 'FAIL'],
                },
                coi_check: {
                  type: 'string',
                  enum: ['PASS', 'FAIL', 'N/A'],
                },
              },
            },
          },
        },
        FederationSpoke: {
          type: 'object',
          properties: {
            spokeId: {
              type: 'string',
              description: 'Unique spoke identifier',
              example: 'fra-spoke-001',
            },
            name: {
              type: 'string',
              description: 'Human-readable spoke name',
              example: 'France Instance',
            },
            country: {
              type: 'string',
              description: 'ISO 3166-1 alpha-3 country code',
              example: 'FRA',
            },
            status: {
              type: 'string',
              enum: ['pending', 'approved', 'suspended', 'revoked'],
              description: 'Spoke registration status',
            },
            lastHeartbeat: {
              type: 'string',
              format: 'date-time',
              description: 'Last heartbeat timestamp',
            },
          },
        },
        HealthStatus: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['healthy', 'degraded', 'unhealthy'],
              example: 'healthy',
            },
            services: {
              type: 'object',
              properties: {
                mongodb: { type: 'string', example: 'connected' },
                opa: { type: 'string', example: 'connected' },
                keycloak: { type: 'string', example: 'connected' },
                redis: { type: 'string', example: 'connected' },
              },
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        IdP: {
          type: 'object',
          properties: {
            alias: {
              type: 'string',
              description: 'Unique IdP identifier',
              example: 'fra-keycloak',
            },
            displayName: {
              type: 'string',
              description: 'Human-readable name',
              example: 'France Keycloak',
            },
            enabled: {
              type: 'boolean',
              description: 'Whether IdP is active',
              example: true,
            },
            providerId: {
              type: 'string',
              enum: ['oidc', 'saml'],
              description: 'Identity provider protocol',
            },
            config: {
              type: 'object',
              description: 'Protocol-specific configuration',
            },
          },
          required: ['alias', 'displayName', 'providerId'],
        },
        DashboardStats: {
          type: 'object',
          properties: {
            stats: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  value: { type: 'string', example: '1247' },
                  label: { type: 'string', example: 'Documents Accessible' },
                  change: { type: 'string', example: '+3 this week' },
                  trend: { type: 'string', enum: ['up', 'down', 'neutral'] },
                },
              },
            },
            details: {
              type: 'object',
              properties: {
                totalDocuments: { type: 'integer', example: 1247 },
                localDocuments: { type: 'integer', example: 547 },
                federatedDocuments: { type: 'integer', example: 700 },
                totalDecisions: { type: 'integer', example: 1543 },
                allowCount: { type: 'integer', example: 1498 },
                denyCount: { type: 'integer', example: 45 },
                authorizationRate: { type: 'number', example: 97.08 },
                avgResponseTime: { type: 'number', example: 145 },
              },
            },
          },
        },
        SpokeStatus: {
          type: 'object',
          properties: {
            spokeId: {
              type: 'string',
              example: 'fra-spoke-001',
            },
            instanceCode: {
              type: 'string',
              example: 'FRA',
            },
            name: {
              type: 'string',
              example: 'France Instance',
            },
            status: {
              type: 'string',
              enum: ['active', 'pending', 'suspended', 'revoked'],
            },
            isHealthy: {
              type: 'boolean',
              example: true,
            },
            lastHeartbeat: {
              type: 'string',
              format: 'date-time',
            },
            policyVersion: {
              type: 'string',
              example: 'v1.2.3',
            },
          },
        },
        PolicyBundle: {
          type: 'object',
          properties: {
            version: {
              type: 'string',
              example: 'v1.2.3',
            },
            hash: {
              type: 'string',
              description: 'SHA-256 hash of bundle',
            },
            scopes: {
              type: 'array',
              items: { type: 'string' },
              example: ['hub', 'spoke'],
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        COIKey: {
          type: 'object',
          properties: {
            coiId: {
              type: 'string',
              example: 'NATO-SECRET',
            },
            countries: {
              type: 'array',
              items: { type: 'string' },
              description: 'ISO 3166-1 alpha-3 country codes',
              example: ['USA', 'GBR', 'FRA', 'DEU'],
            },
            classification: {
              type: 'string',
              enum: ['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'],
            },
            deprecated: {
              type: 'boolean',
              example: false,
            },
          },
        },
        Notification: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              example: 'notif-123',
            },
            userId: {
              type: 'string',
            },
            type: {
              type: 'string',
              enum: ['info', 'warning', 'error', 'success'],
            },
            title: {
              type: 'string',
              example: 'New document available',
            },
            message: {
              type: 'string',
            },
            read: {
              type: 'boolean',
              example: false,
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        ClearanceMapping: {
          type: 'object',
          properties: {
            country: {
              type: 'string',
              description: 'ISO 3166-1 alpha-3 country code',
              example: 'GBR',
            },
            mappings: {
              type: 'object',
              additionalProperties: {
                type: 'string',
              },
              example: {
                'DV': 'CONFIDENTIAL',
                'SC': 'SECRET',
                'DV-SC': 'TOP_SECRET',
              },
            },
          },
        },
        ComplianceReport: {
          type: 'object',
          properties: {
            standard: {
              type: 'string',
              enum: ['NIST SP 800-63-3', 'NATO ACP-240'],
            },
            overallCompliance: {
              type: 'string',
              enum: ['compliant', 'partial', 'non-compliant'],
            },
            generatedAt: {
              type: 'string',
              format: 'date-time',
            },
            sections: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  section: { type: 'string' },
                  status: { type: 'string', enum: ['pass', 'fail', 'partial'] },
                  findings: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
      },
      responses: {
        Unauthorized: {
          description: 'Missing or invalid authentication token',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
              example: {
                error: 'Unauthorized',
                message: 'Invalid or expired JWT token',
              },
            },
          },
        },
        Forbidden: {
          description: 'Insufficient permissions for requested operation',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
              example: {
                error: 'Forbidden',
                message: 'Country FRA not in releasabilityTo: [USA]',
                details: {
                  clearance_check: 'PASS',
                  releasability_check: 'FAIL',
                },
              },
            },
          },
        },
        NotFound: {
          description: 'Requested resource not found',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
              example: {
                error: 'Not Found',
                message: 'Resource doc-123 not found',
              },
            },
          },
        },
      },
    },
    security: [
      {
        BearerAuth: [],
      },
    ],
  },
  apis: [
    // Use absolute paths to ensure swagger-jsdoc can find the files
    // In development: resolves to /project/backend/src/routes/*.ts
    // In production (dist): resolves to /project/backend/dist/routes/*.js
    path.resolve(__dirname, '../routes/*.{ts,js}'),
    path.resolve(__dirname, '../controllers/*.{ts,js}'),
  ],
};

export const swaggerSpec = swaggerJsdoc(options);

export default swaggerSpec;
