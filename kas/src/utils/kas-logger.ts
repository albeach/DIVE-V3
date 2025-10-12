/**
 * KAS Audit Logger
 * 
 * Implements ACP-240 mandatory audit logging
 * Reference: ACP-240 section 6 (Logging & Auditing)
 */

import winston from 'winston';
import path from 'path';
import { IKASAuditEvent } from '../types/kas.types';

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// Create logger instance
export const kasLogger = winston.createLogger({
    level: LOG_LEVEL,
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'dive-v3-kas' },
    transports: [
        // Console output
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.printf(({ timestamp, level, message, ...meta }) => {
                    return `${timestamp} [KAS ${level}]: ${message} ${Object.keys(meta).length > 1 ? JSON.stringify(meta, null, 2) : ''
                        }`;
                })
            )
        }),

        // File output - general logs
        new winston.transports.File({
            filename: path.join(process.cwd(), 'logs', 'kas.log'),
            maxsize: 10485760, // 10MB
            maxFiles: 5
        }),

        // File output - audit logs (ACP-240 compliance)
        new winston.transports.File({
            filename: path.join(process.cwd(), 'logs', 'kas-audit.log'),
            level: 'info',
            maxsize: 52428800, // 50MB (larger for compliance)
            maxFiles: 10,
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            )
        })
    ]
});

/**
 * Log KAS audit event (ACP-240 mandatory)
 */
export function logKASAuditEvent(event: IKASAuditEvent): void {
    kasLogger.info('KAS Audit Event', {
        eventType: event.eventType,
        timestamp: event.timestamp,
        requestId: event.requestId,
        subject: event.subject,
        resourceId: event.resourceId,
        kaoId: event.kaoId,
        outcome: event.outcome,
        reason: event.reason,
        subjectAttributes: event.subjectAttributes,
        resourceAttributes: event.resourceAttributes,
        latencyMs: event.latencyMs,
        // Map to ACP-240 event categories
        acp240Category: mapToACP240Category(event.eventType)
    });
}

/**
 * Map KAS event type to ACP-240 audit category
 */
function mapToACP240Category(eventType: string): string {
    switch (eventType) {
        case 'KEY_RELEASED':
            return 'DECRYPT';
        case 'KEY_DENIED':
            return 'ACCESS_DENIED';
        case 'KEY_WRAPPED':
            return 'ENCRYPT';
        case 'INTEGRITY_FAILURE':
            return 'ACCESS_MODIFIED';
        case 'POLICY_MISMATCH':
            return 'ACCESS_DENIED';
        default:
            return 'OTHER';
    }
}

// Create logs directory if it doesn't exist
import fs from 'fs';
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

