/**
 * DIVE V3 SP Authentication Middleware
 * Validates Service Provider tokens for federation endpoints
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';
import { SPManagementService } from '../services/sp-management.service';
import { IRequestWithSP, ISPContext } from '../types/sp-federation.types';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import NodeCache from 'node-cache';

const spService = new SPManagementService();
const jwksCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 }); // 1 hour cache

/**
 * Get OAuth public key for verification
 */
const getPublicKey = (): string => {
  const publicKeyPath = process.env.JWT_PUBLIC_KEY_PATH || path.join(__dirname, '../../keys/public.pem');
  
  if (!fs.existsSync(publicKeyPath)) {
    throw new Error('OAuth public key not found');
  }
  
  return fs.readFileSync(publicKeyPath, 'utf8');
};

/**
 * Validate SP JWT token
 */
export async function validateSPToken(token: string): Promise<ISPContext | null> {
  try {
    const publicKey = getPublicKey();
    
    // First verify with our key (for tokens we issued)
    try {
      const decoded = jwt.verify(token, publicKey, { 
        algorithms: ['RS256'],
        issuer: [process.env.OAUTH_ISSUER || 'https://api.dive-v3.mil']
      }) as any;
      
      if (decoded.client_type === 'service_provider') {
        // Load SP configuration
        const sp = await spService.getByClientId(decoded.sub);
        if (!sp || sp.status !== 'ACTIVE') {
          logger.warn('SP token for inactive client', {
            clientId: decoded.sub,
            status: sp?.status
          });
          return null;
        }
        
        // Update last activity
        await spService.updateLastActivity(sp.spId);
        
        return {
          clientId: decoded.sub,
          scopes: decoded.scope.split(' '),
          sp: sp
        };
      }
    } catch (localVerifyError) {
      // Token not issued by us, try external SP JWKS
      logger.debug('Token not issued by DIVE V3, checking external SP JWKS');
    }
    
    // If not our token, check if it's from an external SP
    const decodedHeader = jwt.decode(token, { complete: true });
    if (!decodedHeader) {
      return null;
    }
    
    const kid = decodedHeader.header.kid;
    const payload = decodedHeader.payload as any;
    
    // Look up SP by issuer
    const allSPs = await spService.getAllSPs({ status: 'ACTIVE' });
    const sp = allSPs.find(s => s.jwksUri && payload.iss === s.clientId);
    
    if (!sp || !sp.jwksUri) {
      logger.warn('No SP found for issuer', { issuer: payload.iss });
      return null;
    }
    
    // Get JWKS from SP
    const jwks = await getJWKS(sp.jwksUri);
    const key = jwks.keys.find((k: any) => k.kid === kid);
    
    if (!key) {
      logger.warn('No matching key found in SP JWKS', {
        kid,
        spId: sp.spId,
        availableKids: jwks.keys.map((k: any) => k.kid)
      });
      return null;
    }
    
    // Convert JWK to PEM and verify
    const jwkToPem = require('jwk-to-pem');
    const publicKeyPem = jwkToPem(key);
    
    const verified = jwt.verify(token, publicKeyPem, {
      algorithms: ['RS256', 'ES256'],
      audience: [process.env.DIVE_V3_AUDIENCE || 'dive-v3-api']
    }) as any;
    
    // Extract DIVE V3 claims
    if (!verified.uniqueID || !verified.clearance || !verified.countryOfAffiliation) {
      logger.warn('SP token missing required DIVE V3 claims', {
        spId: sp.spId,
        claims: Object.keys(verified)
      });
      return null;
    }
    
    // Update last activity
    await spService.updateLastActivity(sp.spId);
    
    return {
      clientId: sp.clientId,
      scopes: sp.allowedScopes, // Use configured scopes, not token claims
      sp: sp
    };
    
  } catch (error) {
    logger.error('SP token validation failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return null;
  }
}

/**
 * Get JWKS from external SP
 */
async function getJWKS(jwksUri: string): Promise<any> {
  const cached = jwksCache.get<any>(jwksUri);
  if (cached) {
    return cached;
  }
  
  try {
    const response = await axios.get(jwksUri, {
      timeout: 5000,
      validateStatus: (status) => status === 200
    });
    
    const jwks = response.data;
    jwksCache.set(jwksUri, jwks);
    
    return jwks;
  } catch (error) {
    logger.error('Failed to fetch SP JWKS', {
      jwksUri,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

/**
 * SP authentication middleware
 * Can be used standalone or in combination with user auth
 */
export const spAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const requestId = req.headers['x-request-id'] as string;
  
  try {
    // Extract token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No token provided, continue without SP context
      return next();
    }
    
    const token = authHeader.substring(7);
    
    // Try to validate as SP token
    const spContext = await validateSPToken(token);
    if (spContext) {
      (req as IRequestWithSP).sp = spContext;
      
      logger.info('SP authenticated', {
        requestId,
        clientId: spContext.clientId,
        scopes: spContext.scopes,
        country: spContext.sp.country
      });
    }
    
    next();
    
  } catch (error) {
    logger.error('SP auth middleware error', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Authentication failed',
      requestId
    });
  }
};

/**
 * Require SP authentication
 * Use this for endpoints that MUST have SP token
 */
export const requireSPAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  await spAuthMiddleware(req, res, () => {
    const spContext = (req as IRequestWithSP).sp;
    
    if (!spContext) {
      res.status(401).json({
        error: 'unauthorized_client',
        error_description: 'Valid SP token required'
      });
      return;
    }
    
    next();
  });
};

/**
 * Check SP has required scope
 */
export const requireSPScope = (scope: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const spContext = (req as IRequestWithSP).sp;
    
    if (!spContext) {
      res.status(401).json({
        error: 'unauthorized_client',
        error_description: 'SP authentication required'
      });
      return;
    }
    
    if (!spContext.scopes.includes(scope)) {
      res.status(403).json({
        error: 'insufficient_scope',
        error_description: `Required scope: ${scope}`
      });
      return;
    }
    
    next();
  };
};
