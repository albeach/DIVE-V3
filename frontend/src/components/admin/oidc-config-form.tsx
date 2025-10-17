/**
 * OIDC Configuration Form Component
 * 
 * Step 3 of IdP wizard - OIDC-specific settings
 */

'use client';

import React from 'react';
import { IOIDCConfig } from '@/types/admin.types';

interface IOIDCConfigFormProps {
    config: IOIDCConfig;
    onChange: (config: IOIDCConfig) => void;
    errors?: Record<string, string>;
    readonly?: boolean;  // NEW: For Auth0 auto-populated fields
}

export default function OIDCConfigForm({ config, onChange, errors = {}, readonly = false }: IOIDCConfigFormProps) {
    const [localErrors, setLocalErrors] = React.useState<Record<string, string>>({});

    const validateURL = (url: string): string | null => {
        if (!url) return null;
        
        try {
            const urlObj = new URL(url);
            if (urlObj.protocol !== 'https:') {
                return '⚠️ Must use HTTPS (security requirement)';
            }
            return null;
        } catch (e) {
            return '❌ Invalid URL (must be https://...)';
        }
    };

    const handleChange = (field: keyof IOIDCConfig, value: string) => {
        // Validate URLs in real-time
        if (field === 'issuer' || field === 'authorizationUrl' || field === 'tokenUrl' || field === 'jwksUrl') {
            const error = validateURL(value);
            if (error) {
                setLocalErrors(prev => ({ ...prev, [field]: error }));
            } else {
                setLocalErrors(prev => {
                    const { [field]: removed, ...rest } = prev;
                    return rest;
                });
            }
        }

        onChange({
            ...config,
            [field]: value
        });
    };

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium text-gray-900">OIDC Configuration</h3>
                <p className="mt-1 text-sm text-gray-500">
                    {readonly 
                        ? '✨ Auth0 will automatically configure these settings' 
                        : 'Configure OpenID Connect settings for this identity provider.'
                    }
                </p>
            </div>

            {readonly && (
                <div className="rounded-md bg-blue-50 border border-blue-200 p-4">
                    <div className="flex">
                        <div className="flex-shrink-0">
                            <svg className="h-5 w-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <div className="ml-3 flex-1">
                            <h3 className="text-sm font-bold text-blue-900 mb-1">
                                🚀 Auto-Configured by Auth0
                            </h3>
                            <p className="text-sm text-blue-800 mb-2">
                                These fields have been automatically populated with Auth0 standard endpoints. 
                                Client credentials will be generated when you submit.
                            </p>
                            <p className="text-xs text-blue-700">
                                <strong>What happens next:</strong> Auth0 will create the application and provide 
                                <code className="mx-1 bg-blue-100 px-1 py-0.5 rounded">client_id</code> and 
                                <code className="mx-1 bg-blue-100 px-1 py-0.5 rounded">client_secret</code> automatically.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Issuer URL */}
            <div>
                <label htmlFor="issuer" className="block text-sm font-medium text-gray-700">
                    Issuer URL <span className="text-red-500">*</span>
                </label>
                <input
                    type="url"
                    id="issuer"
                    value={config.issuer}
                    onChange={(e) => handleChange('issuer', e.target.value)}
                    disabled={readonly}
                    placeholder="https://login.microsoftonline.com/tenant-id"
                    className={`mt-1 block w-full rounded-md shadow-sm sm:text-sm ${
                        readonly 
                            ? 'bg-gray-100 cursor-not-allowed text-gray-600 border-gray-300'
                            : (errors.issuer || localErrors.issuer)
                            ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                            : config.issuer && !localErrors.issuer
                            ? 'border-green-300 focus:border-green-500 focus:ring-green-500'
                            : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                    }`}
                />
                {(errors.issuer || localErrors.issuer) && !readonly && (
                    <p className="mt-1 text-sm text-red-600">{errors.issuer || localErrors.issuer}</p>
                )}
                {!readonly && !errors.issuer && !localErrors.issuer && config.issuer && (
                    <p className="mt-1 text-sm text-green-600">✓ Valid HTTPS URL</p>
                )}
                {!readonly && !config.issuer && (
                    <p className="mt-1 text-xs text-gray-500">
                        Must be HTTPS URL (e.g., https://login.microsoftonline.com/common/v2.0)
                    </p>
                )}
            </div>

            {/* Client ID */}
            <div>
                <label htmlFor="clientId" className="block text-sm font-medium text-gray-700">
                    Client ID <span className="text-red-500">*</span>
                    {readonly && <span className="ml-2 text-xs text-blue-600 font-normal">(Will be generated)</span>}
                </label>
                <input
                    type="text"
                    id="clientId"
                    value={config.clientId}
                    onChange={(e) => handleChange('clientId', e.target.value)}
                    disabled={readonly}
                    placeholder="dive-v3-client"
                    className={`mt-1 block w-full rounded-md shadow-sm sm:text-sm ${
                        readonly 
                            ? 'bg-blue-50 cursor-not-allowed text-blue-700 border-blue-200 font-medium'
                            : errors.clientId
                            ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                            : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                    }`}
                />
                {errors.clientId && !readonly && (
                    <p className="mt-1 text-sm text-red-600">{errors.clientId}</p>
                )}
            </div>

            {/* Client Secret */}
            <div>
                <label htmlFor="clientSecret" className="block text-sm font-medium text-gray-700">
                    Client Secret <span className="text-red-500">*</span>
                    {readonly && <span className="ml-2 text-xs text-blue-600 font-normal">(Will be generated)</span>}
                </label>
                <input
                    type={readonly ? 'text' : 'password'}
                    id="clientSecret"
                    value={config.clientSecret}
                    onChange={(e) => handleChange('clientSecret', e.target.value)}
                    disabled={readonly}
                    placeholder="••••••••••••••••"
                    className={`mt-1 block w-full rounded-md shadow-sm sm:text-sm ${
                        readonly 
                            ? 'bg-blue-50 cursor-not-allowed text-blue-700 border-blue-200 font-medium'
                            : errors.clientSecret
                            ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                            : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                    }`}
                />
                {errors.clientSecret && !readonly && (
                    <p className="mt-1 text-sm text-red-600">{errors.clientSecret}</p>
                )}
            </div>

            {/* Authorization URL */}
            <div>
                <label htmlFor="authorizationUrl" className="block text-sm font-medium text-gray-700">
                    Authorization URL <span className="text-red-500">*</span>
                </label>
                <input
                    type="url"
                    id="authorizationUrl"
                    value={config.authorizationUrl}
                    onChange={(e) => handleChange('authorizationUrl', e.target.value)}
                    disabled={readonly}
                    placeholder="https://idp.example.com/oauth/authorize"
                    className={`mt-1 block w-full rounded-md shadow-sm sm:text-sm ${
                        readonly 
                            ? 'bg-gray-100 cursor-not-allowed text-gray-600 border-gray-300'
                            : errors.authorizationUrl
                            ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                            : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                    }`}
                />
                {errors.authorizationUrl && !readonly && (
                    <p className="mt-1 text-sm text-red-600">{errors.authorizationUrl}</p>
                )}
            </div>

            {/* Token URL */}
            <div>
                <label htmlFor="tokenUrl" className="block text-sm font-medium text-gray-700">
                    Token URL <span className="text-red-500">*</span>
                </label>
                <input
                    type="url"
                    id="tokenUrl"
                    value={config.tokenUrl}
                    onChange={(e) => handleChange('tokenUrl', e.target.value)}
                    disabled={readonly}
                    placeholder="https://idp.example.com/oauth/token"
                    className={`mt-1 block w-full rounded-md shadow-sm sm:text-sm ${
                        readonly 
                            ? 'bg-gray-100 cursor-not-allowed text-gray-600 border-gray-300'
                            : errors.tokenUrl
                            ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                            : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                    }`}
                />
                {errors.tokenUrl && !readonly && (
                    <p className="mt-1 text-sm text-red-600">{errors.tokenUrl}</p>
                )}
            </div>

            {/* UserInfo URL (Optional) */}
            <div>
                <label htmlFor="userInfoUrl" className="block text-sm font-medium text-gray-700">
                    UserInfo URL
                </label>
                <input
                    type="url"
                    id="userInfoUrl"
                    value={config.userInfoUrl || ''}
                    onChange={(e) => handleChange('userInfoUrl', e.target.value)}
                    disabled={readonly}
                    placeholder="https://idp.example.com/userinfo"
                    className={`mt-1 block w-full rounded-md shadow-sm sm:text-sm ${
                        readonly 
                            ? 'bg-gray-100 cursor-not-allowed text-gray-600 border-gray-300'
                            : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                    }`}
                />
                {!readonly && <p className="mt-1 text-xs text-gray-500">Optional: UserInfo endpoint URL</p>}
            </div>

            {/* JWKS URL (Optional) */}
            <div>
                <label htmlFor="jwksUrl" className="block text-sm font-medium text-gray-700">
                    JWKS URL
                </label>
                <input
                    type="url"
                    id="jwksUrl"
                    value={config.jwksUrl || ''}
                    onChange={(e) => handleChange('jwksUrl', e.target.value)}
                    disabled={readonly}
                    placeholder="https://idp.example.com/certs"
                    className={`mt-1 block w-full rounded-md shadow-sm sm:text-sm ${
                        readonly 
                            ? 'bg-gray-100 cursor-not-allowed text-gray-600 border-gray-300'
                            : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                    }`}
                />
                {!readonly && <p className="mt-1 text-xs text-gray-500">Optional: JSON Web Key Set URL</p>}
            </div>

            {/* Default Scopes */}
            <div>
                <label htmlFor="defaultScopes" className="block text-sm font-medium text-gray-700">
                    Default Scopes
                </label>
                <input
                    type="text"
                    id="defaultScopes"
                    value={config.defaultScopes || 'openid profile email'}
                    onChange={(e) => handleChange('defaultScopes', e.target.value)}
                    disabled={readonly}
                    placeholder="openid profile email"
                    className={`mt-1 block w-full rounded-md shadow-sm sm:text-sm ${
                        readonly 
                            ? 'bg-gray-100 cursor-not-allowed text-gray-600 border-gray-300'
                            : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                    }`}
                />
                {!readonly && (
                    <p className="mt-1 text-xs text-gray-500">
                        Space-separated list of OAuth scopes (default: openid profile email)
                    </p>
                )}
            </div>

            {/* Help Text */}
            {!readonly && (
                <div className="rounded-md bg-blue-50 p-4">
                    <div className="flex">
                        <div className="flex-shrink-0">
                            <svg
                                className="h-5 w-5 text-blue-400"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                            >
                                <path
                                    fillRule="evenodd"
                                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                                    clipRule="evenodd"
                                />
                            </svg>
                        </div>
                        <div className="ml-3 flex-1">
                            <h3 className="text-sm font-medium text-blue-800">OIDC Discovery</h3>
                            <div className="mt-2 text-sm text-blue-700">
                                <p>
                                    You can find these URLs at the OIDC Discovery endpoint:
                                    <code className="ml-1 rounded bg-blue-100 px-1 py-0.5 text-xs">
                                        /.well-known/openid-configuration
                                    </code>
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

