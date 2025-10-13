/**
 * Upload Routes
 * Week 3.2: Secure File Upload
 * 
 * REST API routes for file upload with ACP-240 compliance
 * Requires authentication and authorization via OPA
 */

import { Router } from 'express';
import { uploadFileHandler } from '../controllers/upload.controller';
import {
    upload,
    handleUploadErrors,
    validateUploadMetadata
} from '../middleware/upload.middleware';
import { authenticateJWT } from '../middleware/authz.middleware';

const router = Router();

/**
 * POST /api/upload
 * Upload classified document with automatic ZTDF conversion
 * 
 * Authentication: Required (JWT token)
 * Authorization: OPA enforces clearance limits (user can only upload ≤ their clearance)
 * 
 * Request:
 * - Content-Type: multipart/form-data
 * - file: <binary> (required) - Max 10MB
 * - classification: string (required) - UNCLASSIFIED|CONFIDENTIAL|SECRET|TOP_SECRET
 * - releasabilityTo: string[] (required) - ISO 3166-1 alpha-3 codes
 * - COI: string[] (optional) - Communities of Interest
 * - caveats: string[] (optional) - NOFORN, RELIDO, etc.
 * - title: string (required) - Max 200 characters
 * - description: string (optional)
 * 
 * Response 201:
 * {
 *   "success": true,
 *   "resourceId": "doc-upload-...",
 *   "ztdfObjectId": "doc-upload-...",
 *   "displayMarking": "SECRET//FVEY//REL USA, GBR",
 *   "metadata": {
 *     "fileSize": 524288,
 *     "mimeType": "application/pdf",
 *     "uploadedAt": "2025-10-13T...",
 *     "uploadedBy": "john.doe@mil",
 *     "classification": "SECRET",
 *     "encrypted": true,
 *     "ztdf": {
 *       "version": "1.0",
 *       "policyHash": "abc123...",
 *       "payloadHash": "def456...",
 *       "kaoCount": 1
 *     }
 *   }
 * }
 * 
 * Response 400: Validation error (invalid file type, missing metadata)
 * Response 401: Unauthorized (missing/invalid JWT)
 * Response 403: Forbidden (upload above user clearance)
 * Response 413: Payload Too Large (file > 10MB)
 */
router.post(
    '/',
    authenticateJWT,                     // 1. Verify JWT token
    upload.single('file'),               // 2. Parse multipart form (Multer)
    handleUploadErrors,                  // 3. Handle Multer errors
    validateUploadMetadata,              // 4. Validate metadata
    uploadFileHandler                    // 5. Process upload
);

export default router;

