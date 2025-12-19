import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export interface ApiError extends Error {
    statusCode?: number;
    details?: any;
}

export const errorHandler = (
  err: ApiError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
    const requestId = req.headers['x-request-id'] as string;
    const statusCode = err.statusCode || 500;
    const reason = (err as any).reason || (err.details && (err.details as any).reason) || err.message || 'Error';

  // Log error
  logger.error('Request error', {
    requestId,
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    statusCode,
    reason
  });

    // Send error response
    res.status(statusCode).json({
        error: err.name || 'Internal Server Error',
        message: err.message,
        reason,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
        ...(err.details && { details: err.details }),
        requestId
    });
};

export class UnauthorizedError extends Error implements ApiError {
    statusCode = 401;
    constructor(message: string = 'Unauthorized') {
        super(message);
        this.name = 'UnauthorizedError';
    }
}

export class ForbiddenError extends Error implements ApiError {
    statusCode = 403;
    details?: any;

    constructor(message: string = 'Forbidden', details?: any) {
        super(message);
        this.name = 'ForbiddenError';
        this.details = details;
    }
}

export class NotFoundError extends Error implements ApiError {
    statusCode = 404;
    constructor(message: string = 'Not Found') {
        super(message);
        this.name = 'NotFoundError';
    }
}

export class ValidationError extends Error implements ApiError {
    statusCode = 400;
    details?: any;

    constructor(message: string = 'Validation Error', details?: any) {
        super(message);
        this.name = 'ValidationError';
        this.details = details;
    }
}
