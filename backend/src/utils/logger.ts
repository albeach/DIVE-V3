import winston from 'winston';
import path from 'path';

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LOG_FORMAT = process.env.LOG_FORMAT || 'json';

// Define log format
const logFormat = LOG_FORMAT === 'json'
    ? winston.format.json()
    : winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
            return `${timestamp} [${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
        })
    );

// Create logger instance
export const logger = winston.createLogger({
    level: LOG_LEVEL,
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        logFormat
    ),
    defaultMeta: { service: 'dive-v3-backend' },
    transports: [
        // Console output
        new winston.transports.Console(),

        // File output - general logs
        new winston.transports.File({
            filename: path.join(process.cwd(), 'logs', 'app.log'),
            maxsize: 5242880, // 5MB
            maxFiles: 3,
            tailable: true,
            zippedArchive: true
        }),

        // File output - error logs
        new winston.transports.File({
            filename: path.join(process.cwd(), 'logs', 'error.log'),
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 3,
            tailable: true,
            zippedArchive: true
        }),

        // File output - authorization decisions (audit trail)
        new winston.transports.File({
            filename: path.join(process.cwd(), 'logs', 'authz.log'),
            level: 'info',
            maxsize: 10485760, // 10MB
            maxFiles: 5,
            tailable: true,
            zippedArchive: true,
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            )
        })
    ]
});

// Create logs directory if it doesn't exist
import fs from 'fs';
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}
