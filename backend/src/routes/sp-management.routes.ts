/**
 * DIVE V3 SP Management Routes
 * Service Provider registry endpoints
 *
 * All routes require admin authentication (enforced by adminAuthMiddleware)
 *
 * Routes:
 * - GET /api/sp-management/sps - List all SPs
 * - GET /api/sp-management/sps/:spId - Get SP details
 * - POST /api/sp-management/register - Register new SP
 * - PUT /api/sp-management/sps/:spId - Update SP
 * - DELETE /api/sp-management/sps/:spId - Delete SP
 * - POST /api/sp-management/sps/:spId/approve - Approve/Reject SP
 * - POST /api/sp-management/sps/:spId/suspend - Suspend/Reactivate SP
 * - POST /api/sp-management/sps/:spId/regenerate-secret - Regenerate client secret
 * - GET /api/sp-management/sps/:spId/activity - Get activity logs
 *
 * @swagger
 * tags:
 *   - name: Service Provider Management
 *     description: OIDC Service Provider registration and lifecycle management
 */

import { Router } from 'express';
import { adminAuthMiddleware } from '../middleware/admin-auth.middleware';
import {
  listSPs,
  getSPById,
  registerSP,
  updateSP,
  deleteSP,
  approveSP,
  suspendSP,
  regenerateSecret,
  getSPActivity
} from '../controllers/sp-management.controller';

const router = Router();

// ============================================
// Apply admin authentication to all routes
// ============================================
router.use(adminAuthMiddleware);

// ============================================
// Service Provider Management Routes
// ============================================

/**
 * @swagger
 * /api/sp-management/sps:
 *   get:
 *     summary: List all Service Providers
 *     description: Returns paginated list of registered OIDC Service Providers with optional filtering by status, country, organization type, and search
 *     tags: [Service Provider Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, ACTIVE, SUSPENDED, REVOKED]
 *         description: Filter by SP status
 *       - in: query
 *         name: country
 *         schema:
 *           type: string
 *         description: ISO 3166-1 alpha-3 country code (e.g., USA, FRA, CAN)
 *       - in: query
 *         name: organizationType
 *         schema:
 *           type: string
 *           enum: [GOVERNMENT, MILITARY, INDUSTRY, ACADEMIC]
 *         description: Filter by organization type
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name, client ID, or technical contact
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Results per page
 *     responses:
 *       200:
 *         description: Paginated list of Service Providers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         description: Server error
 */
router.get('/sps', listSPs);

/**
 * @swagger
 * /api/sp-management/sps/{spId}:
 *   get:
 *     summary: Get Service Provider details
 *     description: Retrieves complete configuration and metadata for a specific Service Provider
 *     tags: [Service Provider Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: spId
 *         required: true
 *         schema:
 *           type: string
 *         description: Service Provider unique identifier
 *     responses:
 *       200:
 *         description: Service Provider details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 spId:
 *                   type: string
 *                 clientId:
 *                   type: string
 *                 name:
 *                   type: string
 *                 status:
 *                   type: string
 *                 country:
 *                   type: string
 *                 organizationType:
 *                   type: string
 *                 redirectUris:
 *                   type: array
 *                   items:
 *                     type: string
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: Service Provider not found
 *       500:
 *         description: Server error
 */
router.get('/sps/:spId', getSPById);

/**
 * @swagger
 * /api/sp-management/register:
 *   post:
 *     summary: Register new Service Provider
 *     description: Creates a new OIDC Service Provider registration with PENDING status awaiting approval
 *     tags: [Service Provider Management]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - country
 *               - organizationType
 *               - redirectUris
 *               - technicalContact
 *             properties:
 *               name:
 *                 type: string
 *                 description: Service Provider name
 *               country:
 *                 type: string
 *                 description: ISO 3166-1 alpha-3 country code
 *               organizationType:
 *                 type: string
 *                 enum: [GOVERNMENT, MILITARY, INDUSTRY, ACADEMIC]
 *               redirectUris:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: OAuth2 redirect URIs
 *               technicalContact:
 *                 type: object
 *                 properties:
 *                   name:
 *                     type: string
 *                   email:
 *                     type: string
 *                   phone:
 *                     type: string
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Service Provider registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 spId:
 *                   type: string
 *                 clientId:
 *                   type: string
 *                 status:
 *                   type: string
 *                   enum: [PENDING]
 *       400:
 *         description: Invalid request body
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         description: Server error
 */
router.post('/register', registerSP);

/**
 * @swagger
 * /api/sp-management/sps/{spId}:
 *   put:
 *     summary: Update Service Provider configuration
 *     description: Updates SP configuration including redirect URIs, contact information, and metadata
 *     tags: [Service Provider Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: spId
 *         required: true
 *         schema:
 *           type: string
 *         description: Service Provider unique identifier
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               redirectUris:
 *                 type: array
 *                 items:
 *                   type: string
 *               technicalContact:
 *                 type: object
 *                 properties:
 *                   name:
 *                     type: string
 *                   email:
 *                     type: string
 *                   phone:
 *                     type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Service Provider updated successfully
 *       400:
 *         description: Invalid request body
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: Service Provider not found
 *       500:
 *         description: Server error
 */
router.put('/sps/:spId', updateSP);

/**
 * @swagger
 * /api/sp-management/sps/{spId}:
 *   delete:
 *     summary: Delete Service Provider
 *     description: Permanently removes a Service Provider registration. Sets status to REVOKED and removes from Keycloak.
 *     tags: [Service Provider Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: spId
 *         required: true
 *         schema:
 *           type: string
 *         description: Service Provider unique identifier
 *     responses:
 *       200:
 *         description: Service Provider deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Service Provider deleted successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: Service Provider not found
 *       500:
 *         description: Server error
 */
router.delete('/sps/:spId', deleteSP);

/**
 * @swagger
 * /api/sp-management/sps/{spId}/approve:
 *   post:
 *     summary: Approve or reject Service Provider
 *     description: Approves or rejects a PENDING Service Provider registration. Approval creates the client in Keycloak and sets status to ACTIVE.
 *     tags: [Service Provider Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: spId
 *         required: true
 *         schema:
 *           type: string
 *         description: Service Provider unique identifier
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - action
 *               - approvedBy
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [approve, reject]
 *                 description: Approval decision
 *               reason:
 *                 type: string
 *                 description: Reason for approval or rejection
 *               approvedBy:
 *                 type: string
 *                 description: Admin user ID making the decision
 *     responses:
 *       200:
 *         description: Action completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 status:
 *                   type: string
 *                   enum: [ACTIVE, REVOKED]
 *       400:
 *         description: Invalid action or SP not in PENDING status
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: Service Provider not found
 *       500:
 *         description: Server error
 */
router.post('/sps/:spId/approve', approveSP);

/**
 * @swagger
 * /api/sp-management/sps/{spId}/suspend:
 *   post:
 *     summary: Suspend or reactivate Service Provider
 *     description: Toggles SP between ACTIVE and SUSPENDED states. Suspension disables the client in Keycloak.
 *     tags: [Service Provider Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: spId
 *         required: true
 *         schema:
 *           type: string
 *         description: Service Provider unique identifier
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *               - suspendedBy
 *             properties:
 *               reason:
 *                 type: string
 *                 minLength: 10
 *                 description: Reason for suspension (minimum 10 characters)
 *               suspendedBy:
 *                 type: string
 *                 description: Admin user ID performing the action
 *     responses:
 *       200:
 *         description: Suspension status toggled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 status:
 *                   type: string
 *                   enum: [SUSPENDED, ACTIVE]
 *       400:
 *         description: Invalid request or reason too short
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: Service Provider not found
 *       500:
 *         description: Server error
 */
router.post('/sps/:spId/suspend', suspendSP);

/**
 * @swagger
 * /api/sp-management/sps/{spId}/regenerate-secret:
 *   post:
 *     summary: Regenerate client secret
 *     description: Generates a new client secret for confidential OIDC clients. Previous secret is immediately invalidated.
 *     tags: [Service Provider Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: spId
 *         required: true
 *         schema:
 *           type: string
 *         description: Service Provider unique identifier
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - regeneratedBy
 *             properties:
 *               regeneratedBy:
 *                 type: string
 *                 description: Admin user ID performing the action
 *     responses:
 *       200:
 *         description: Client secret regenerated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 clientSecret:
 *                   type: string
 *                   description: New client secret (only shown once)
 *       400:
 *         description: Invalid request or SP is public client
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: Service Provider not found
 *       500:
 *         description: Server error
 */
router.post('/sps/:spId/regenerate-secret', regenerateSecret);

/**
 * @swagger
 * /api/sp-management/sps/{spId}/activity:
 *   get:
 *     summary: Get Service Provider activity logs
 *     description: Returns audit trail of all administrative actions performed on this Service Provider
 *     tags: [Service Provider Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: spId
 *         required: true
 *         schema:
 *           type: string
 *         description: Service Provider unique identifier
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of logs to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Pagination offset
 *     responses:
 *       200:
 *         description: Activity log entries
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 logs:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *                       action:
 *                         type: string
 *                       performedBy:
 *                         type: string
 *                       details:
 *                         type: object
 *                 total:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 offset:
 *                   type: integer
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: Service Provider not found
 *       500:
 *         description: Server error
 */
router.get('/sps/:spId/activity', getSPActivity);

export default router;
