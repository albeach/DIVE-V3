/**
 * DIVE V3 - Swagger/OpenAPI Routes
 *
 * Serves interactive API documentation via Swagger UI.
 *
 * Endpoints:
 * - GET /api-docs - Swagger UI interface
 * - GET /api-docs/json - OpenAPI JSON specification
 *
 * @version 1.0.0
 * @date 2025-12-29
 */

import { Router, Request, Response } from 'express';
import swaggerUi from 'swagger-ui-express';
import swaggerSpec from '../config/swagger.config';

const router = Router();

// Custom Swagger UI options for DIVE V3 branding
const swaggerUiOptions: swaggerUi.SwaggerUiOptions = {
  customCss: `
    .swagger-ui .topbar {
      background: linear-gradient(135deg, #4396ac 0%, #90d56a 100%);
    }
    .swagger-ui .topbar-wrapper img {
      content: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 30"><text x="10" y="22" fill="white" font-family="system-ui" font-weight="bold" font-size="18">DIVE V3</text></svg>');
    }
    .swagger-ui .info .title {
      color: #4396ac;
    }
    .swagger-ui .btn.authorize {
      background: linear-gradient(135deg, #4396ac 0%, #90d56a 100%);
      border-color: #4396ac;
    }
    .swagger-ui .btn.authorize:hover {
      background: linear-gradient(135deg, #3a8599 0%, #7dc45a 100%);
    }
    .swagger-ui .opblock-tag {
      border-color: #4396ac;
    }
    .swagger-ui .opblock.opblock-get .opblock-summary-method {
      background: #4396ac;
    }
    .swagger-ui .opblock.opblock-post .opblock-summary-method {
      background: #90d56a;
    }
    .swagger-ui .opblock.opblock-put .opblock-summary-method {
      background: #f59e0b;
    }
    .swagger-ui .opblock.opblock-delete .opblock-summary-method {
      background: #ef4444;
    }
  `,
  customSiteTitle: 'DIVE V3 API Documentation',
  customfavIcon: '/favicon.ico',
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    docExpansion: 'none',
    filter: true,
    showExtensions: true,
    showCommonExtensions: true,
    tryItOutEnabled: true,
  },
};

/**
 * @openapi
 * /api-docs/json:
 *   get:
 *     summary: Get OpenAPI specification
 *     description: Returns the complete OpenAPI 3.0 specification in JSON format
 *     tags: [Documentation]
 *     security: []
 *     responses:
 *       200:
 *         description: OpenAPI specification
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
router.get('/json', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// Swagger UI - serve at /api-docs
router.use('/', swaggerUi.serve);
router.get('/', swaggerUi.setup(swaggerSpec, swaggerUiOptions));

export default router;
