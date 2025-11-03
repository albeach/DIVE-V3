/**
 * DIVE V3 SP Registry Validation Schemas
 * Zod schemas for SP registration and management forms
 */

import { z } from 'zod';

/**
 * URL validation (HTTPS required for production, HTTP allowed for localhost)
 */
const urlSchema = z.string()
  .min(1, 'URL is required')
  .url('Must be a valid URL')
  .refine((url) => {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.protocol === 'https:' || 
             parsedUrl.hostname === 'localhost' || 
             parsedUrl.hostname === '127.0.0.1';
    } catch {
      return false;
    }
  }, { message: 'URL must use HTTPS (except localhost)' });

/**
 * Email validation
 */
const emailSchema = z.string().email().toLowerCase();

/**
 * Phone validation (optional, E.164 format)
 */
const phoneSchema = z.string().regex(/^\+?[1-9]\d{1,14}$/).optional();

/**
 * SP Registration Form Schema
 */
export const spRegistrationSchema = z.object({
  name: z.string()
    .min(3, 'Name must be at least 3 characters')
    .max(100, 'Name must be at most 100 characters'),
  
  description: z.string()
    .max(500, 'Description must be at most 500 characters')
    .optional(),
  
  organizationType: z.enum(['GOVERNMENT', 'MILITARY', 'CONTRACTOR', 'ACADEMIC'], {
    message: 'Please select an organization type'
  }),
  
  country: z.string()
    .length(3, 'Country code must be ISO 3166-1 alpha-3 (e.g., USA, FRA, GBR)')
    .toUpperCase(),
  
  technicalContact: z.object({
    name: z.string()
      .min(2, 'Contact name must be at least 2 characters')
      .max(100, 'Contact name must be at most 100 characters'),
    email: emailSchema,
    phone: phoneSchema
  }),
  
  clientType: z.enum(['confidential', 'public'], {
    message: 'Please select a client type'
  }),
  
  redirectUris: z.array(urlSchema)
    .min(1, 'At least one redirect URI is required')
    .max(10, 'Maximum 10 redirect URIs allowed'),
  
  postLogoutRedirectUris: z.array(urlSchema)
    .max(10, 'Maximum 10 post-logout redirect URIs allowed')
    .optional(),
  
  jwksUri: urlSchema.optional(),
  
  tokenEndpointAuthMethod: z.enum(['client_secret_basic', 'client_secret_post', 'private_key_jwt'], {
    message: 'Please select a token endpoint authentication method'
  }),
  
  requirePKCE: z.boolean().default(true),
  
  allowedScopes: z.array(z.string())
    .min(1, 'At least one scope is required')
    .refine((scopes) => {
      const validScopes = [
        'openid', 'profile', 'email', 'offline_access',
        'resource:read', 'resource:write', 'resource:search',
        'scim:read', 'scim:write'
      ];
      return scopes.every(scope => validScopes.includes(scope));
    }, { message: 'Invalid scope selected' }),
  
  allowedGrantTypes: z.array(z.string())
    .min(1, 'At least one grant type is required')
    .refine((grants) => {
      const validGrants = ['authorization_code', 'refresh_token', 'client_credentials'];
      return grants.every(grant => validGrants.includes(grant));
    }, { message: 'Invalid grant type selected' }),
  
  attributeRequirements: z.object({
    clearance: z.boolean(),
    country: z.boolean(),
    coi: z.boolean().optional(),
    customAttributes: z.array(z.string()).optional()
  }),
  
  rateLimit: z.object({
    requestsPerMinute: z.number()
      .min(1, 'Must allow at least 1 request per minute')
      .max(1000, 'Maximum 1000 requests per minute')
      .default(60),
    burstSize: z.number()
      .min(1, 'Burst size must be at least 1')
      .max(100, 'Maximum burst size is 100')
      .default(10),
    quotaPerDay: z.number()
      .min(1, 'Daily quota must be at least 1')
      .max(1000000, 'Maximum daily quota is 1,000,000')
      .default(10000)
      .optional()
  }).optional()
});

export type SPRegistrationFormData = z.infer<typeof spRegistrationSchema>;

/**
 * SP Update Form Schema (all fields optional)
 */
export const spUpdateSchema = spRegistrationSchema.partial().extend({
  spId: z.string().min(1, 'SP ID is required')
});

export type SPUpdateFormData = z.infer<typeof spUpdateSchema>;

/**
 * Federation Agreement Schema
 */
export const federationAgreementSchema = z.object({
  countries: z.array(z.string().length(3, 'Country code must be ISO 3166-1 alpha-3'))
    .min(1, 'At least one country is required'),
  
  classifications: z.array(z.enum(['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET']))
    .min(1, 'At least one classification is required'),
  
  validUntil: z.date()
    .min(new Date(), 'Valid until date must be in the future')
});

export type FederationAgreementFormData = z.infer<typeof federationAgreementSchema>;

/**
 * SP Approval Schema
 */
export const spApprovalSchema = z.object({
  action: z.enum(['approve', 'reject']),
  reason: z.string().max(500, 'Reason must be at most 500 characters').optional()
});

export type SPApprovalFormData = z.infer<typeof spApprovalSchema>;

/**
 * SP Suspension Schema
 */
export const spSuspensionSchema = z.object({
  reason: z.string()
    .min(10, 'Suspension reason must be at least 10 characters')
    .max(500, 'Suspension reason must be at most 500 characters')
});

export type SPSuspensionFormData = z.infer<typeof spSuspensionSchema>;

/**
 * Redirect URI input validation (single URI)
 */
export const redirectUriSchema = urlSchema;

/**
 * JWKS URI validation with connectivity check (frontend pre-validation)
 */
export const jwksUriPreValidationSchema = urlSchema;

/**
 * Client ID format validation
 */
export const clientIdSchema = z.string().regex(/^sp-[a-z]{3}-\d+$/, {
  message: 'Invalid client ID format (expected: sp-xxx-timestamp)'
});

/**
 * SP ID format validation
 */
export const spIdSchema = z.string().regex(/^SP-\d+-[A-F0-9]{8}$/, {
  message: 'Invalid SP ID format (expected: SP-timestamp-HEX)'
});

