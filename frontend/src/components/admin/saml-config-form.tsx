/**
 * SAML Configuration Form Component
 * 
 * Step 3 of IdP wizard - SAML-specific settings
 */

'use client';

import React from 'react';
import { ISAMLConfig } from '@/types/admin.types';

interface ISAMLConfigFormProps {
    config: ISAMLConfig;
    onChange: (config: ISAMLConfig) => void;
    errors?: Record<string, string>;
    accessToken?: string;  // For backend validation
}

export default function SAMLConfigForm({ config, onChange, errors = {}, accessToken }: ISAMLConfigFormProps) {
    const [localErrors, setLocalErrors] = React.useState<Record<string, string>>({});
    const [validationStatus, setValidationStatus] = React.useState<Record<string, 'validating' | 'valid' | 'invalid' | null>>({});

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

    // Upload SAML metadata XML file
    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const text = await file.text();
            // Use proxy route (handles auth server-side)
            const response = await fetch(`/api/admin/idps/parse/saml-metadata`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({ metadataXml: text })
            });

            const result = await response.json();

            if (response.ok && result.formData) {
                // Auto-populate form with parsed data
                onChange({
                    ...config,
                    ...result.formData
                });
                setValidationStatus(prev => ({ ...prev, entityId: 'valid', singleSignOnServiceUrl: 'valid' }));
            } else {
                setLocalErrors(prev => ({ ...prev, file: result.error || 'Failed to parse metadata' }));
            }
        } catch (error) {
            setLocalErrors(prev => ({ ...prev, file: `Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}` }));
        }
    };

    const handleChange = (field: keyof ISAMLConfig, value: string) => {
        // Validate URLs in real-time
        if (field === 'singleSignOnServiceUrl' || field === 'singleLogoutServiceUrl') {
            const error = validateURL(value);
            if (error) {
                setLocalErrors(prev => ({ ...prev, [field]: error }));
                setValidationStatus(prev => ({ ...prev, [field]: 'invalid' }));
            } else {
                setLocalErrors(prev => {
                    const { [field]: removed, ...rest } = prev;
                    return rest;
                });
                setValidationStatus(prev => ({ ...prev, [field]: 'valid' }));
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
                <h3 className="text-lg font-medium text-gray-900">SAML Configuration</h3>
                <p className="mt-1 text-sm text-gray-500">
                    Configure SAML 2.0 settings for this identity provider.
                </p>
            </div>

            {/* Upload Metadata File */}
            {accessToken && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <label className="block text-sm font-semibold text-blue-900 mb-2">
                        📄 Quick Setup: Upload SAML Metadata XML
                    </label>
                    <p className="text-xs text-blue-700 mb-3">
                        Upload your IdP's SAML metadata XML file to auto-populate all fields.
                    </p>
                    <input
                        type="file"
                        accept=".xml,application/xml,text/xml"
                        onChange={handleFileUpload}
                        className="block w-full text-sm text-blue-900
                            file:mr-4 file:py-2 file:px-4
                            file:rounded-md file:border-0
                            file:text-sm file:font-semibold
                            file:bg-blue-600 file:text-white
                            hover:file:bg-blue-700
                            file:cursor-pointer cursor-pointer"
                    />
                    {localErrors.file && (
                        <p className="mt-2 text-sm text-red-600">{localErrors.file}</p>
                    )}
                </div>
            )}

            {/* Entity ID */}
            <div>
                <label htmlFor="entityId" className="block text-sm font-medium text-gray-700">
                    Entity ID <span className="text-red-500">*</span>
                </label>
                <input
                    type="text"
                    id="entityId"
                    value={config.entityId}
                    onChange={(e) => handleChange('entityId', e.target.value)}
                    placeholder="dive-v3-saml-client"
                    className={`mt-1 block w-full rounded-md shadow-sm sm:text-sm ${
                        errors.entityId
                            ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                            : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                    }`}
                />
                {errors.entityId && (
                    <p className="mt-1 text-sm text-red-600">{errors.entityId}</p>
                )}
                <p className="mt-1 text-xs text-gray-500">
                    The SAML entity ID for this client
                </p>
            </div>

            {/* SSO Service URL */}
            <div>
                <label htmlFor="singleSignOnServiceUrl" className="block text-sm font-medium text-gray-700">
                    Single Sign-On Service URL <span className="text-red-500">*</span>
                </label>
                <input
                    type="url"
                    id="singleSignOnServiceUrl"
                    value={config.singleSignOnServiceUrl}
                    onChange={(e) => handleChange('singleSignOnServiceUrl', e.target.value)}
                    placeholder="https://idp.example.com/saml/sso"
                    className={`mt-1 block w-full rounded-md shadow-sm sm:text-sm ${
                        errors.singleSignOnServiceUrl
                            ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                            : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                    }`}
                />
                {errors.singleSignOnServiceUrl && (
                    <p className="mt-1 text-sm text-red-600">{errors.singleSignOnServiceUrl}</p>
                )}
                <p className="mt-1 text-xs text-gray-500">
                    The SSO endpoint where SAML authentication requests are sent
                </p>
            </div>

            {/* SLO Service URL (Optional) */}
            <div>
                <label htmlFor="singleLogoutServiceUrl" className="block text-sm font-medium text-gray-700">
                    Single Logout Service URL
                </label>
                <input
                    type="url"
                    id="singleLogoutServiceUrl"
                    value={config.singleLogoutServiceUrl || ''}
                    onChange={(e) => handleChange('singleLogoutServiceUrl', e.target.value)}
                    placeholder="https://idp.example.com/saml/slo"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                />
                <p className="mt-1 text-xs text-gray-500">
                    Optional: Single Logout (SLO) endpoint
                </p>
            </div>

            {/* Certificate */}
            <div>
                <label htmlFor="signingCertificate" className="block text-sm font-medium text-gray-700">
                    X.509 Certificate
                </label>
                <textarea
                    id="signingCertificate"
                    rows={8}
                    value={config.signingCertificate || ''}
                    onChange={(e) => handleChange('signingCertificate', e.target.value)}
                    placeholder="-----BEGIN CERTIFICATE-----&#10;MIIDXTCCAkWgAwIBAgIJAKZ...&#10;-----END CERTIFICATE-----"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm font-mono text-xs"
                />
                <p className="mt-1 text-xs text-gray-500">
                    Optional: IdP's public certificate for signature verification (PEM format)
                </p>
            </div>

            {/* Signature Algorithm */}
            <div>
                <label htmlFor="signatureAlgorithm" className="block text-sm font-medium text-gray-700">
                    Signature Algorithm
                </label>
                <select
                    id="signatureAlgorithm"
                    value={config.signatureAlgorithm || 'RSA_SHA256'}
                    onChange={(e) => handleChange('signatureAlgorithm', e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                >
                    <option value="RSA_SHA256">RSA with SHA-256</option>
                    <option value="RSA_SHA512">RSA with SHA-512</option>
                    <option value="RSA_SHA1">RSA with SHA-1 (legacy)</option>
                    <option value="DSA_SHA1">DSA with SHA-1 (legacy)</option>
                </select>
                <p className="mt-1 text-xs text-gray-500">
                    Signature algorithm for SAML assertions (default: RSA-SHA256)
                </p>
            </div>

            {/* Name ID Format */}
            <div>
                <label htmlFor="nameIDFormat" className="block text-sm font-medium text-gray-700">
                    Name ID Format
                </label>
                <select
                    id="nameIDFormat"
                    value={
                        config.nameIDPolicyFormat ||
                        'urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified'
                    }
                    onChange={(e) => handleChange('nameIDPolicyFormat', e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                >
                    <option value="urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified">
                        Unspecified
                    </option>
                    <option value="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">
                        Email Address
                    </option>
                    <option value="urn:oasis:names:tc:SAML:2.0:nameid-format:persistent">
                        Persistent
                    </option>
                    <option value="urn:oasis:names:tc:SAML:2.0:nameid-format:transient">
                        Transient
                    </option>
                </select>
                <p className="mt-1 text-xs text-gray-500">
                    Name ID format requested from the IdP
                </p>
            </div>

            {/* Advanced Settings Divider */}
            <div className="border-t border-gray-200 pt-6">
                <h4 className="text-base font-medium text-gray-900">Advanced Settings</h4>
                <p className="mt-1 text-sm text-gray-500">
                    Optional signature and validation settings
                </p>
            </div>

            {/* Want Assertions Signed */}
            <div className="flex items-start">
                <div className="flex items-center h-5">
                    <input
                        id="wantAssertionsSigned"
                        type="checkbox"
                        checked={config.wantAssertionsSigned || false}
                        onChange={(e) =>
                            onChange({ ...config, wantAssertionsSigned: e.target.checked })
                        }
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                </div>
                <div className="ml-3 text-sm">
                    <label htmlFor="wantAssertionsSigned" className="font-medium text-gray-700">
                        Want Assertions Signed
                    </label>
                    <p className="text-gray-500">
                        Require SAML assertions to be signed by the IdP
                    </p>
                </div>
            </div>

            {/* Want AuthN Requests Signed */}
            <div className="flex items-start">
                <div className="flex items-center h-5">
                    <input
                        id="wantAuthnRequestsSigned"
                        type="checkbox"
                        checked={config.wantAuthnRequestsSigned || false}
                        onChange={(e) =>
                            onChange({ ...config, wantAuthnRequestsSigned: e.target.checked })
                        }
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                </div>
                <div className="ml-3 text-sm">
                    <label htmlFor="wantAuthnRequestsSigned" className="font-medium text-gray-700">
                        Want AuthN Requests Signed
                    </label>
                    <p className="text-gray-500">
                        Sign outgoing SAML authentication requests
                    </p>
                </div>
            </div>

            {/* Validate Signature */}
            <div className="flex items-start">
                <div className="flex items-center h-5">
                    <input
                        id="validateSignature"
                        type="checkbox"
                        checked={config.validateSignature !== 'false'}
                        onChange={(e) =>
                            onChange({ ...config, validateSignature: e.target.checked ? 'true' : 'false' })
                        }
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                </div>
                <div className="ml-3 text-sm">
                    <label htmlFor="validateSignature" className="font-medium text-gray-700">
                        Validate Signature
                    </label>
                    <p className="text-gray-500">
                        Validate signatures on SAML responses (recommended)
                    </p>
                </div>
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
                        <h3 className="text-sm font-medium text-blue-800">SAML Metadata</h3>
                        <div className="mt-2 text-sm text-blue-700">
                            <p>
                                You can often find these values in the IdP's SAML metadata XML file.
                                Look for <code className="bg-blue-100 px-1 py-0.5 rounded text-xs">SingleSignOnService</code> and{' '}
                                <code className="bg-blue-100 px-1 py-0.5 rounded text-xs">X509Certificate</code> elements.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Security Note */}
            <div className="rounded-md bg-yellow-50 p-4">
                <div className="flex">
                    <div className="flex-shrink-0">
                        <svg
                            className="h-5 w-5 text-yellow-400"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                        >
                            <path
                                fillRule="evenodd"
                                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                                clipRule="evenodd"
                            />
                        </svg>
                    </div>
                    <div className="ml-3 flex-1">
                        <h3 className="text-sm font-medium text-yellow-800">Security Best Practices</h3>
                        <div className="mt-2 text-sm text-yellow-700">
                            <ul className="list-disc list-inside space-y-1">
                                <li>Always enable signature validation in production</li>
                                <li>Use strong signature algorithms (RSA-SHA256 or higher)</li>
                                <li>Verify the certificate comes from a trusted source</li>
                                <li>Test thoroughly before enabling in production</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

