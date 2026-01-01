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
    './src/routes/*.ts',
    './src/controllers/*.ts',
  ],
};

export const swaggerSpec = swaggerJsdoc(options);

export default swaggerSpec;
