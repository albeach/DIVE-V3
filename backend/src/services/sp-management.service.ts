/**
 * DIVE V3 SP Management Service
 * Manages external Service Providers registry
 */

import { Collection, Db, MongoClient } from 'mongodb';
import { logger } from '../utils/logger';
import { 
  IExternalSP, 
  ISPRegistrationRequest
} from '../types/sp-federation.types';
import { generateSecureSecret } from '../utils/oauth.utils';
import KcAdminClient from '@keycloak/keycloak-admin-client';
import axios from 'axios';
import crypto from 'crypto';

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017';
const DB_NAME = process.env.MONGODB_DATABASE || 'dive-v3';

export class SPManagementService {
  private db: Db | null = null;
  private collection: Collection<IExternalSP> | null = null;
  private kcAdminClient: KcAdminClient | null = null;

  /**
   * Get MongoDB database connection
   */
  private async getDb(): Promise<Db> {
    if (!this.db) {
      const client = new MongoClient(MONGODB_URL);
      await client.connect();
      this.db = client.db(DB_NAME);
      logger.info('SP Management Service connected to MongoDB');
    }
    return this.db;
  }

  /**
   * Initialize database connection
   */
  private async initialize(): Promise<void> {
    if (!this.collection) {
      const db = await this.getDb();
      this.collection = db.collection<IExternalSP>('external_sps');
      
      // Create indexes
      await this.collection.createIndex({ spId: 1 }, { unique: true });
      await this.collection.createIndex({ clientId: 1 }, { unique: true });
      await this.collection.createIndex({ status: 1 });
      await this.collection.createIndex({ country: 1 });
      
      logger.info('SP Management Service initialized');
    }
  }

  /**
   * Initialize Keycloak admin client
   */
  private async initializeKeycloak(): Promise<KcAdminClient> {
    if (!this.kcAdminClient) {
      this.kcAdminClient = new KcAdminClient({
        baseUrl: process.env.KEYCLOAK_URL || 'http://keycloak:8080',
        realmName: 'master'
      });

      await this.kcAdminClient.auth({
        username: process.env.KEYCLOAK_ADMIN_USERNAME || 'admin',
        password: process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin',
        grantType: 'password',
        clientId: 'admin-cli'
      });
    }

    return this.kcAdminClient;
  }

  /**
   * Register new external SP
   */
  async registerSP(request: ISPRegistrationRequest): Promise<IExternalSP> {
    await this.initialize();
    
    try {
      // Validate technical requirements
      await this.validateTechnicalRequirements(request);
      
      // Generate OAuth client in Keycloak
      const client = await this.createOAuthClient(request);
      
      // Create SP record
      const sp: IExternalSP = {
        spId: this.generateSPId(),
        name: request.name,
        description: request.description,
        organizationType: request.organizationType,
        country: request.country,
        technicalContact: request.technicalContact,
        clientId: client.clientId!,
        clientSecret: client.secret,
        clientType: request.clientType,
        redirectUris: request.redirectUris,
        postLogoutRedirectUris: request.postLogoutRedirectUris || [],
        jwksUri: request.jwksUri,
        tokenEndpointAuthMethod: request.tokenEndpointAuthMethod,
        requirePKCE: request.requirePKCE !== false, // Default true
        allowedScopes: request.allowedScopes,
        allowedGrantTypes: request.allowedGrantTypes,
        attributeRequirements: request.attributeRequirements,
        rateLimit: request.rateLimit || {
          requestsPerMinute: 60,
          burstSize: 10,
          quotaPerDay: 10000
        },
        federationAgreements: [],
        status: 'PENDING',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      // Save to database
      await this.collection!.insertOne(sp);
      
      // Notify approvers
      await this.notifyApprovers(sp);
      
      logger.info('External SP registered', {
        spId: sp.spId,
        name: sp.name,
        country: sp.country,
        clientId: sp.clientId
      });
      
      return sp;
    } catch (error) {
      logger.error('Failed to register SP', {
        error: error instanceof Error ? error.message : 'Unknown error',
        request
      });
      throw error;
    }
  }

  /**
   * Get SP by client ID
   */
  async getByClientId(clientId: string): Promise<IExternalSP | null> {
    await this.initialize();
    return this.collection!.findOne({ clientId });
  }

  /**
   * Get SP by SP ID
   */
  async getBySPId(spId: string): Promise<IExternalSP | null> {
    await this.initialize();
    return this.collection!.findOne({ spId });
  }

  /**
   * Get all SPs
   */
  async getAllSPs(filter?: {
    status?: string;
    country?: string;
    organizationType?: string;
  }): Promise<IExternalSP[]> {
    await this.initialize();
    
    const query: any = {};
    if (filter?.status) query.status = filter.status;
    if (filter?.country) query.country = filter.country;
    if (filter?.organizationType) query.organizationType = filter.organizationType;
    
    return this.collection!.find(query).toArray();
  }

  /**
   * Approve SP
   */
  async approveSP(spId: string, approvedBy: string): Promise<void> {
    await this.initialize();
    const kcAdmin = await this.initializeKeycloak();
    
    const sp = await this.getBySPId(spId);
    if (!sp) {
      throw new Error('SP not found');
    }
    
    if (sp.status !== 'PENDING') {
      throw new Error('SP is not in pending status');
    }
    
    // Enable client in Keycloak
    kcAdmin.setConfig({ realmName: 'dive-v3-external-sp' });
    await kcAdmin.clients.update(
      { id: sp.clientId },
      { enabled: true }
    );
    
    // Update SP status
    await this.collection!.updateOne(
      { spId },
      {
        $set: {
          status: 'ACTIVE',
          approvedBy,
          approvedAt: new Date(),
          updatedAt: new Date()
        }
      }
    );
    
    logger.info('SP approved', {
      spId,
      approvedBy,
      clientId: sp.clientId
    });
  }

  /**
   * Suspend SP
   */
  async suspendSP(spId: string, reason: string): Promise<void> {
    await this.initialize();
    const kcAdmin = await this.initializeKeycloak();
    
    const sp = await this.getBySPId(spId);
    if (!sp) {
      throw new Error('SP not found');
    }
    
    // Disable client in Keycloak
    kcAdmin.setConfig({ realmName: 'dive-v3-external-sp' });
    await kcAdmin.clients.update(
      { id: sp.clientId },
      { enabled: false }
    );
    
    // Update SP status
    await this.collection!.updateOne(
      { spId },
      {
        $set: {
          status: 'SUSPENDED',
          updatedAt: new Date()
        }
      }
    );
    
    logger.warn('SP suspended', {
      spId,
      reason,
      clientId: sp.clientId
    });
  }

  /**
   * Update last activity timestamp
   */
  async updateLastActivity(spId: string): Promise<void> {
    await this.initialize();
    
    await this.collection!.updateOne(
      { spId },
      {
        $set: {
          lastActivity: new Date()
        }
      }
    );
  }

  /**
   * Validate SP technical requirements
   */
  private async validateTechnicalRequirements(request: ISPRegistrationRequest): Promise<void> {
    // Validate JWKS URI is accessible
    if (request.jwksUri) {
      try {
        const response = await axios.get(request.jwksUri, { 
          timeout: 5000,
          validateStatus: (status) => status === 200
        });
        
        if (!response.data.keys || !Array.isArray(response.data.keys)) {
          throw new Error('Invalid JWKS format');
        }
      } catch (error) {
        throw new Error(`JWKS URI validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    // Validate redirect URIs
    for (const uri of request.redirectUris) {
      try {
        const url = new URL(uri);
        if (url.protocol !== 'https:' && !url.hostname.includes('localhost')) {
          throw new Error(`Redirect URI must use HTTPS: ${uri}`);
        }
      } catch (error) {
        throw new Error(`Invalid redirect URI: ${uri}`);
      }
    }
    
    // Validate scopes
    const validScopes = [
      'openid', 'profile', 'email', 'offline_access',
      'resource:read', 'resource:write', 'resource:search'
    ];
    
    for (const scope of request.allowedScopes) {
      if (!validScopes.includes(scope)) {
        throw new Error(`Invalid scope: ${scope}`);
      }
    }
    
    // Validate grant types
    const validGrantTypes = ['authorization_code', 'refresh_token', 'client_credentials'];
    for (const grant of request.allowedGrantTypes) {
      if (!validGrantTypes.includes(grant)) {
        throw new Error(`Invalid grant type: ${grant}`);
      }
    }
  }

  /**
   * Create OAuth client in Keycloak
   */
  private async createOAuthClient(request: ISPRegistrationRequest): Promise<any> {
    const kcAdmin = await this.initializeKeycloak();
    
    // Ensure external SP realm exists
    kcAdmin.setConfig({ realmName: 'dive-v3-external-sp' });
    
    const clientId = `sp-${request.country.toLowerCase()}-${Date.now()}`;
    const clientSecret = request.clientType === 'confidential' ? generateSecureSecret() : undefined;
    
    const client = {
      clientId,
      secret: clientSecret,
      enabled: false, // Start disabled until approved
      clientAuthenticatorType: this.mapAuthMethod(request.tokenEndpointAuthMethod),
      redirectUris: request.redirectUris,
      webOrigins: request.redirectUris.map(uri => new URL(uri).origin),
      standardFlowEnabled: request.allowedGrantTypes.includes('authorization_code'),
      implicitFlowEnabled: false,
      directAccessGrantsEnabled: false,
      serviceAccountsEnabled: request.allowedGrantTypes.includes('client_credentials'),
      authorizationServicesEnabled: false,
      publicClient: request.clientType === 'public',
      protocol: 'openid-connect',
      attributes: {
        'pkce.code.challenge.method': request.requirePKCE ? 'S256' : '',
        'use.refresh.tokens': 'true',
        'client.secret.creation.time': String(Date.now()),
        'dive.v3.sp.id': this.generateSPId(),
        'dive.v3.sp.country': request.country,
        'dive.v3.sp.org.type': request.organizationType
      },
      defaultClientScopes: ['openid', 'profile', 'email'],
      optionalClientScopes: request.allowedScopes.filter(s => 
        !['openid', 'profile', 'email'].includes(s)
      )
    };
    
    const created = await kcAdmin.clients.create(client);
    
    return {
      ...client,
      id: created.id
    };
  }

  /**
   * Generate unique SP ID
   */
  private generateSPId(): string {
    return `SP-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  }

  /**
   * Map auth method to Keycloak format
   */
  private mapAuthMethod(method: string): string {
    switch (method) {
      case 'client_secret_basic':
        return 'client-secret-basic';
      case 'client_secret_post':
        return 'client-secret';
      case 'private_key_jwt':
        return 'client-jwt';
      default:
        return 'client-secret';
    }
  }

  /**
   * Notify approvers about new SP registration
   */
  private async notifyApprovers(sp: IExternalSP): Promise<void> {
    // In production, this would send emails or notifications
    logger.info('Notification: New SP pending approval', {
      spId: sp.spId,
      name: sp.name,
      country: sp.country,
      contact: sp.technicalContact.email
    });
  }
}
