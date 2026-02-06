import { z } from 'zod';

/**
 * Zod validation schemas for Session Management API
 * Phase 2: Security Hardening
 * 
 * BEST PRACTICE: All API inputs validated with type-safe schemas
 * - Prevents injection attacks
 * - Ensures data integrity
 * - Provides clear error messages
 */

/**
 * Session Refresh Request Body Schema
 * POST /api/session/refresh
 */
export const sessionRefreshRequestSchema = z.object({
  // Optional force refresh flag (for manual user action)
  forceRefresh: z.boolean().optional(),
  
  // Optional metadata for audit logging
  reason: z.enum(['auto', 'manual', 'warning']).optional().default('manual'),
}).strict(); // Reject unknown fields

/**
 * Session Health Check Query Parameters
 * GET /api/session/refresh
 */
export const sessionHealthQuerySchema = z.object({
  // Include detailed metrics (for debugging)
  includeMetrics: z
    .string()
    .transform((val) => val === 'true')
    .optional(),
}).strict();

/**
 * Session Refresh Response Schema
 * Validates server responses for type safety
 */
export const sessionRefreshResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  expiresIn: z.number().int().positive().optional(),
  expiresAt: z.string().datetime().optional(),
  error: z.string().optional(),
  
  // Detailed error information
  details: z
    .object({
      code: z.enum([
        'NoRefreshToken',
        'RefreshTokenExpired',
        'NetworkError',
        'InternalError',
        'MissingRefreshToken',
      ]).optional(),
      retryable: z.boolean().optional(),
    })
    .optional(),
}).strict();

/**
 * Session Health Response Schema
 */
export const sessionHealthResponseSchema = z.object({
  authenticated: z.boolean(),
  expiresAt: z.string().datetime().nullable(),
  timeUntilExpiry: z.number().int(),
  isExpired: z.boolean(),
  needsRefresh: z.boolean(),
  serverTime: z.number().int().positive(),
  userId: z.string().optional(),
  provider: z.string().optional(),
  
  // Extended metrics (when includeMetrics=true)
  metrics: z
    .object({
      sessionAge: z.number().int().nonnegative().optional(),
      refreshCount: z.number().int().nonnegative().optional(),
      lastRefreshAt: z.string().datetime().optional(),
    })
    .optional(),
}).strict();

/**
 * Type exports for TypeScript
 */
export type SessionRefreshRequest = z.infer<typeof sessionRefreshRequestSchema>;
export type SessionHealthQuery = z.infer<typeof sessionHealthQuerySchema>;
export type SessionRefreshResponse = z.infer<typeof sessionRefreshResponseSchema>;
export type SessionHealthResponse = z.infer<typeof sessionHealthResponseSchema>;

/**
 * Validation helpers for API routes
 */
export const validateSessionRefreshRequest = (data: unknown): SessionRefreshRequest => {
  return sessionRefreshRequestSchema.parse(data);
};

export const validateSessionHealthQuery = (data: unknown): SessionHealthQuery => {
  return sessionHealthQuerySchema.parse(data);
};

export const validateSessionRefreshResponse = (data: unknown): SessionRefreshResponse => {
  return sessionRefreshResponseSchema.parse(data);
};

export const validateSessionHealthResponse = (data: unknown): SessionHealthResponse => {
  return sessionHealthResponseSchema.parse(data);
};
