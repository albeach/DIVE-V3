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
}

export default function OIDCConfigForm({ config, onChange, errors = {} }: IOIDCConfigFormProps) {
    const handleChange = (field: keyof IOIDCConfig, value: string) => {
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
                    Configure OpenID Connect settings for this identity provider.
                </p>
            </div>

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
                    placeholder="https://idp.example.com/oidc"
                    className={`mt-1 block w-full rounded-md shadow-sm sm:text-sm ${
                        errors.issuer
                            ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                            : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                    }`}
                />
                {errors.issuer && (
                    <p className="mt-1 text-sm text-red-600">{errors.issuer}</p>
                )}
                <p className="mt-1 text-xs text-gray-500">
                    The OIDC issuer URL (e.g., https://accounts.google.com)
                </p>
            </div>

            {/* Client ID */}
            <div>
                <label htmlFor="clientId" className="block text-sm font-medium text-gray-700">
                    Client ID <span className="text-red-500">*</span>
                </label>
                <input
                    type="text"
                    id="clientId"
                    value={config.clientId}
                    onChange={(e) => handleChange('clientId', e.target.value)}
                    placeholder="dive-v3-client"
                    className={`mt-1 block w-full rounded-md shadow-sm sm:text-sm ${
                        errors.clientId
                            ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                            : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                    }`}
                />
                {errors.clientId && (
                    <p className="mt-1 text-sm text-red-600">{errors.clientId}</p>
                )}
            </div>

            {/* Client Secret */}
            <div>
                <label htmlFor="clientSecret" className="block text-sm font-medium text-gray-700">
                    Client Secret <span className="text-red-500">*</span>
                </label>
                <input
                    type="password"
                    id="clientSecret"
                    value={config.clientSecret}
                    onChange={(e) => handleChange('clientSecret', e.target.value)}
                    placeholder="••••••••••••••••"
                    className={`mt-1 block w-full rounded-md shadow-sm sm:text-sm ${
                        errors.clientSecret
                            ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                            : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                    }`}
                />
                {errors.clientSecret && (
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
                    placeholder="https://idp.example.com/oauth/authorize"
                    className={`mt-1 block w-full rounded-md shadow-sm sm:text-sm ${
                        errors.authorizationUrl
                            ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                            : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                    }`}
                />
                {errors.authorizationUrl && (
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
                    placeholder="https://idp.example.com/oauth/token"
                    className={`mt-1 block w-full rounded-md shadow-sm sm:text-sm ${
                        errors.tokenUrl
                            ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                            : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                    }`}
                />
                {errors.tokenUrl && (
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
                    placeholder="https://idp.example.com/userinfo"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                />
                <p className="mt-1 text-xs text-gray-500">Optional: UserInfo endpoint URL</p>
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
                    placeholder="https://idp.example.com/certs"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                />
                <p className="mt-1 text-xs text-gray-500">Optional: JSON Web Key Set URL</p>
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
                    placeholder="openid profile email"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                />
                <p className="mt-1 text-xs text-gray-500">
                    Space-separated list of OAuth scopes (default: openid profile email)
                </p>
            </div>

            {/* Help Text */}
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
        </div>
    );
}

