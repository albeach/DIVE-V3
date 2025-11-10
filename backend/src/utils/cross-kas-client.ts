/**
 * Cross-KAS Client for Backend
 * 
 * Handles requests to external KAS instances with proper authentication
 * and policy translation.
 */

import axios, { AxiosInstance } from 'axios';
import https from 'https';
import fs from 'fs';
import { logger } from './logger';

export interface IExternalKASConfig {
    kasId: string;
    kasUrl: string;
    authMethod: 'mtls' | 'apikey' | 'jwt' | 'oauth2';
    authConfig: {
        clientCert?: string;
        clientKey?: string;
        caCert?: string;
        apiKey?: string;
        apiKeyHeader?: string;
        jwtIssuer?: string;
        oauth2ClientId?: string;
        oauth2ClientSecret?: string;
        oauth2TokenUrl?: string;
    };
}

/**
 * Create authenticated HTTP client for external KAS
 */
export function createKASClient(config: IExternalKASConfig): AxiosInstance {
    const axiosConfig: any = {
        baseURL: config.kasUrl,
        timeout: 10000,
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'DIVE-V3-Backend/1.0',
        },
    };

    switch (config.authMethod) {
        case 'mtls':
            if (config.authConfig.clientCert && config.authConfig.clientKey) {
                axiosConfig.httpsAgent = new https.Agent({
                    cert: fs.readFileSync(config.authConfig.clientCert),
                    key: fs.readFileSync(config.authConfig.clientKey),
                    ca: config.authConfig.caCert 
                        ? fs.readFileSync(config.authConfig.caCert)
                        : undefined,
                    rejectUnauthorized: !!config.authConfig.caCert,
                });
            }
            break;

        case 'apikey':
            const headerName = config.authConfig.apiKeyHeader || 'X-API-Key';
            axiosConfig.headers[headerName] = config.authConfig.apiKey;
            break;

        case 'jwt':
        case 'oauth2':
            // Token will be added per-request
            break;
    }

    return axios.create(axiosConfig);
}

/**
 * Request key from external KAS
 */
export async function requestKeyFromExternalKAS(
    config: IExternalKASConfig,
    request: {
        resourceId: string;
        kaoId: string;
        wrappedKey: string;
        bearerToken: string;
        requestId: string;
        requestTimestamp: string;
    }
): Promise<any> {
    const client = createKASClient(config);
    
    logger.info('Requesting key from external KAS', {
        requestId: request.requestId,
        kasId: config.kasId,
        kasUrl: config.kasUrl,
    });

    try {
        const response = await client.post('/request-key', {
            resourceId: request.resourceId,
            kaoId: request.kaoId,
            wrappedKey: request.wrappedKey,
            bearerToken: request.bearerToken,
            requestId: request.requestId,
            requestTimestamp: request.requestTimestamp,
        });

        logger.info('Key request successful from external KAS', {
            requestId: request.requestId,
            kasId: config.kasId,
        });

        return response.data;
    } catch (error: any) {
        logger.error('Key request failed from external KAS', {
            requestId: request.requestId,
            kasId: config.kasId,
            error: error.message,
            status: error.response?.status,
        });

        throw error;
    }
}

/**
 * Check if KAS URL is external (not DIVE V3 KAS)
 */
export function isExternalKAS(kasUrl: string): boolean {
    const diveKasUrl = process.env.KAS_URL || 'http://kas:8080';
    const diveKasHost = new URL(diveKasUrl).hostname;
    
    try {
        const kasHost = new URL(kasUrl).hostname;
        return kasHost !== diveKasHost && 
               kasHost !== 'localhost' && 
               kasHost !== 'kas';
    } catch {
        return false;
    }
}

