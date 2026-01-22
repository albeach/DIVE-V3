/**
 * DIVE V3 - Request Context Utility
 *
 * Provides request ID correlation and standardized error handling
 * for observability across all services.
 *
 * Usage:
 *   import { withRequestId, createRequestId, formatError } from './request-context';
 *
 *   const requestId = createRequestId();
 *   logger.info('Operation started', { requestId });
 *
 *   // Or use middleware
 *   app.use(withRequestId);
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from './logger';

// =============================================================================
// REQUEST ID MANAGEMENT
// =============================================================================

/**
 * Generate a unique request ID
 */
export function createRequestId(): string {
  return `req-${uuidv4().slice(0, 8)}-${Date.now()}`;
}

/**
 * Express middleware to ensure request ID on all requests
 */
export function withRequestId(req: Request, res: Response, next: NextFunction): void {
  // Get from header or generate new
  const requestId = (req.headers['x-request-id'] as string) || createRequestId();

  // Set on request for downstream use
  (req as any).requestId = requestId;

  // Set response header for tracing
  res.setHeader('X-Request-ID', requestId);

  next();
}

/**
 * Get request ID from request object
 */
export function getRequestId(req: Request): string {
  return (req as any).requestId || (req.headers['x-request-id'] as string) || 'unknown';
}

// =============================================================================
// STANDARDIZED ERROR HANDLING
// =============================================================================

export interface IErrorContext {
  requestId?: string;
  component?: string;
  operation?: string;
  userId?: string;
  instanceCode?: string;
  additionalContext?: Record<string, unknown>;
}

export interface IFormattedError {
  error: string;
  message: string;
  code?: string;
  requestId: string;
  timestamp: string;
  component?: string;
  operation?: string;
  stack?: string;
  details?: Record<string, unknown>;
}

/**
 * Format error for structured logging
 */
export function formatError(error: unknown, context: IErrorContext = {}): IFormattedError {
  const requestId = context.requestId || 'unknown';
  const timestamp = new Date().toISOString();

  if (error instanceof Error) {
    return {
      error: error.name,
      message: error.message,
      requestId,
      timestamp,
      component: context.component,
      operation: context.operation,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      details: context.additionalContext
    };
  }

  return {
    error: 'UnknownError',
    message: String(error),
    requestId,
    timestamp,
    component: context.component,
    operation: context.operation,
    details: context.additionalContext
  };
}

/**
 * Log error with full context
 */
export function logError(error: unknown, context: IErrorContext = {}): void {
  const formatted = formatError(error, context);

  logger.error(formatted.message, {
    requestId: formatted.requestId,
    error: formatted.error,
    component: formatted.component,
    operation: formatted.operation,
    stack: formatted.stack,
    details: formatted.details,
    timestamp: formatted.timestamp
  });
}

/**
 * Create a standardized error response for API endpoints
 */
export function createErrorResponse(
  error: unknown,
  context: IErrorContext = {},
  statusCode: number = 500
): { statusCode: number; body: IFormattedError } {
  const formatted = formatError(error, context);

  // Remove stack trace for production responses
  if (process.env.NODE_ENV === 'production') {
    delete formatted.stack;
  }

  return {
    statusCode,
    body: formatted
  };
}

// =============================================================================
// PROMISE ERROR HANDLING
// =============================================================================

/**
 * Wrap async function with standardized error handling
 * Replaces .catch(console.error) pattern
 */
export function withErrorHandling<T>(
  fn: () => Promise<T>,
  context: IErrorContext
): Promise<T | null> {
  return fn().catch((error) => {
    logError(error, context);
    return null;
  });
}

/**
 * Create a safe async wrapper that logs errors but doesn't throw
 * Use for non-critical operations that should not block
 */
export function safeAsync<T>(
  fn: () => Promise<T>,
  context: IErrorContext,
  defaultValue: T
): Promise<T> {
  return fn().catch((error) => {
    logError(error, {
      ...context,
      additionalContext: {
        ...context.additionalContext,
        isSafeAsync: true,
        defaultValueReturned: true
      }
    });
    return defaultValue;
  });
}

/**
 * Create a critical async wrapper that logs and re-throws
 * Use for critical operations that must succeed
 */
export function criticalAsync<T>(
  fn: () => Promise<T>,
  context: IErrorContext
): Promise<T> {
  return fn().catch((error) => {
    logError(error, {
      ...context,
      additionalContext: {
        ...context.additionalContext,
        isCritical: true
      }
    });
    throw error;
  });
}

// =============================================================================
// EXPRESS ERROR HANDLER
// =============================================================================

/**
 * Express error handling middleware
 * Use as the last middleware in the chain
 */
export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const requestId = getRequestId(req);

  const { statusCode, body } = createErrorResponse(error, {
    requestId,
    operation: `${req.method} ${req.path}`,
    component: 'ExpressErrorHandler'
  });

  res.status(statusCode).json(body);
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  createRequestId,
  withRequestId,
  getRequestId,
  formatError,
  logError,
  createErrorResponse,
  withErrorHandling,
  safeAsync,
  criticalAsync,
  errorHandler
};
