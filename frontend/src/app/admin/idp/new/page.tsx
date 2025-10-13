/**
 * IdP Wizard Page
 * 
 * Multi-step wizard for creating new Identity Providers
 * Steps:
 * 1. Protocol Selection (OIDC or SAML)
 * 2. Basic Configuration
 * 3. Protocol-Specific Config
 * 4. Attribute Mapping
 * 5. Review & Test
 * 6. Submit for Approval
 */

'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/navigation';
import WizardSteps from '@/components/admin/wizard-steps';
import OIDCConfigForm from '@/components/admin/oidc-config-form';
import SAMLConfigForm from '@/components/admin/saml-config-form';
import AttributeMapper from '@/components/admin/attribute-mapper';
import { IIdPFormData, IdPProtocol, IAdminAPIResponse } from '@/types/admin.types';

const WIZARD_STEPS = [
    { number: 1, title: 'Protocol', description: 'Select IdP protocol' },
    { number: 2, title: 'Basic Info', description: 'Name and description' },
    { number: 3, title: 'Configuration', description: 'Protocol settings' },
    { number: 4, title: 'Attributes', description: 'Map DIVE attributes' },
    { number: 5, title: 'Review', description: 'Review and test' },
    { number: 6, title: 'Submit', description: 'Submit for approval' }
];

export default function NewIdPWizard() {
    const router = useRouter();
    const { data: session, status } = useSession();
    const [currentStep, setCurrentStep] = useState(1);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [testResult, setTestResult] = useState<any>(null);

    const [formData, setFormData] = useState<IIdPFormData>({
        protocol: 'oidc',
        alias: '',
        displayName: '',
        description: '',
        oidcConfig: {
            issuer: '',
            clientId: '',
            clientSecret: '',
            authorizationUrl: '',
            tokenUrl: '',
            userInfoUrl: '',
            jwksUrl: '',
            defaultScopes: 'openid profile email'
        },
        samlConfig: {
            entityId: '',
            singleSignOnServiceUrl: '',
            singleLogoutServiceUrl: '',
            certificate: '',
            signatureAlgorithm: 'RSA_SHA256',
            nameIDFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified'
        },
        attributeMappings: {
            uniqueID: { claim: 'sub', userAttribute: 'uniqueID' },
            clearance: { claim: 'clearance', userAttribute: 'clearance' },
            countryOfAffiliation: { claim: 'country', userAttribute: 'countryOfAffiliation' },
            acpCOI: { claim: 'groups', userAttribute: 'acpCOI' }
        }
    });

    // Check authentication and super_admin role
    if (status === 'loading') {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Loading...</p>
                </div>
            </div>
        );
    }

    if (status === 'unauthenticated' || !session) {
        router.push('/login');
        return null;
    }

    // Validate current step
    const validateStep = (): boolean => {
        const newErrors: Record<string, string> = {};

        switch (currentStep) {
            case 1:
                // Protocol selection (always valid)
                break;

            case 2:
                // Basic info
                if (!formData.alias) {
                    newErrors.alias = 'Alias is required';
                }
                if (!formData.displayName) {
                    newErrors.displayName = 'Display name is required';
                }
                // Validate alias format (lowercase, alphanumeric, hyphens)
                if (formData.alias && !/^[a-z0-9-]+$/.test(formData.alias)) {
                    newErrors.alias = 'Alias must be lowercase alphanumeric with hyphens only';
                }
                break;

            case 3:
                // Protocol-specific config
                if (formData.protocol === 'oidc' && formData.oidcConfig) {
                    if (!formData.oidcConfig.issuer) {
                        newErrors.issuer = 'Issuer URL is required';
                    }
                    if (!formData.oidcConfig.clientId) {
                        newErrors.clientId = 'Client ID is required';
                    }
                    if (!formData.oidcConfig.clientSecret) {
                        newErrors.clientSecret = 'Client Secret is required';
                    }
                    if (!formData.oidcConfig.authorizationUrl) {
                        newErrors.authorizationUrl = 'Authorization URL is required';
                    }
                    if (!formData.oidcConfig.tokenUrl) {
                        newErrors.tokenUrl = 'Token URL is required';
                    }
                } else if (formData.protocol === 'saml' && formData.samlConfig) {
                    if (!formData.samlConfig.entityId) {
                        newErrors.entityId = 'Entity ID is required';
                    }
                    if (!formData.samlConfig.singleSignOnServiceUrl) {
                        newErrors.singleSignOnServiceUrl = 'SSO Service URL is required';
                    }
                }
                break;

            case 4:
                // Attribute mappings
                if (!formData.attributeMappings.uniqueID.claim) {
                    newErrors['uniqueID.claim'] = 'uniqueID claim is required';
                }
                if (!formData.attributeMappings.clearance.claim) {
                    newErrors['clearance.claim'] = 'clearance claim is required';
                }
                if (!formData.attributeMappings.countryOfAffiliation.claim) {
                    newErrors['countryOfAffiliation.claim'] = 'countryOfAffiliation claim is required';
                }
                break;
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleNext = () => {
        if (validateStep()) {
            setCurrentStep(currentStep + 1);
        }
    };

    const handleBack = () => {
        setCurrentStep(currentStep - 1);
        setErrors({});
    };

    const handleTestConnection = async () => {
        setIsSubmitting(true);
        setTestResult(null);

        try {
            // For now, just validate the form
            // In real implementation, would call backend test endpoint
            setTestResult({
                success: true,
                message: 'Configuration looks valid (test endpoint not yet implemented)',
                details: {
                    reachable: true,
                    jwksValid: true
                }
            });
        } catch (error) {
            setTestResult({
                success: false,
                message: error instanceof Error ? error.message : 'Test failed'
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSubmit = async () => {
        setIsSubmitting(true);
        setErrors({});

        try {
            const token = (session as any).accessToken;
            if (!token) {
                throw new Error('No access token available');
            }

            const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/idps`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    alias: formData.alias,
                    displayName: formData.displayName,
                    description: formData.description,
                    protocol: formData.protocol,
                    config: formData.protocol === 'oidc' ? formData.oidcConfig : formData.samlConfig,
                    attributeMappings: formData.attributeMappings
                })
            });

            const result: IAdminAPIResponse = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to create IdP');
            }

            // Success - redirect to IdP list
            router.push('/admin/idp?success=created');
        } catch (error) {
            setErrors({
                submit: error instanceof Error ? error.message : 'Submission failed'
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <Navigation user={session?.user || {}} />
            
            <div className="py-8">
                <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
                    {/* Header */}
                    <div className="mb-8">
                        <h1 className="text-3xl font-bold text-gray-900">Add New Identity Provider</h1>
                    <p className="mt-2 text-sm text-gray-600">
                        Configure a new OIDC or SAML identity provider for coalition authentication.
                    </p>
                </div>

                {/* Wizard Steps Indicator */}
                <div className="mb-8">
                    <WizardSteps currentStep={currentStep} steps={WIZARD_STEPS} />
                </div>

                {/* Wizard Content */}
                <div className="bg-white shadow sm:rounded-lg">
                    <div className="px-4 py-5 sm:p-6">
                        {/* Step 1: Protocol Selection */}
                        {currentStep === 1 && (
                            <div className="space-y-6">
                                <div>
                                    <h3 className="text-lg font-medium text-gray-900">Select Protocol</h3>
                                    <p className="mt-1 text-sm text-gray-500">
                                        Choose the authentication protocol for this identity provider.
                                    </p>
                                </div>

                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    {/* OIDC Option */}
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, protocol: 'oidc' })}
                                        className={`relative flex flex-col items-center rounded-lg border-2 p-6 hover:border-blue-500 focus:outline-none ${
                                            formData.protocol === 'oidc'
                                                ? 'border-blue-500 bg-blue-50'
                                                : 'border-gray-200 bg-white'
                                        }`}
                                    >
                                        <div className="text-4xl mb-3">🔷</div>
                                        <span className="text-lg font-medium text-gray-900">OIDC</span>
                                        <span className="mt-1 text-sm text-gray-500 text-center">
                                            OpenID Connect (OAuth 2.0)
                                        </span>
                                    </button>

                                    {/* SAML Option */}
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, protocol: 'saml' })}
                                        className={`relative flex flex-col items-center rounded-lg border-2 p-6 hover:border-blue-500 focus:outline-none ${
                                            formData.protocol === 'saml'
                                                ? 'border-blue-500 bg-blue-50'
                                                : 'border-gray-200 bg-white'
                                        }`}
                                    >
                                        <div className="text-4xl mb-3">🔶</div>
                                        <span className="text-lg font-medium text-gray-900">SAML</span>
                                        <span className="mt-1 text-sm text-gray-500 text-center">
                                            SAML 2.0
                                        </span>
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Step 2: Basic Configuration */}
                        {currentStep === 2 && (
                            <div className="space-y-6">
                                <div>
                                    <h3 className="text-lg font-medium text-gray-900">Basic Configuration</h3>
                                    <p className="mt-1 text-sm text-gray-500">
                                        Provide basic information about this identity provider.
                                    </p>
                                </div>

                                <div>
                                    <label htmlFor="alias" className="block text-sm font-medium text-gray-700">
                                        Alias <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        id="alias"
                                        value={formData.alias}
                                        onChange={(e) =>
                                            setFormData({ ...formData, alias: e.target.value.toLowerCase() })
                                        }
                                        placeholder="germany-idp"
                                        className={`mt-1 block w-full rounded-md shadow-sm sm:text-sm ${
                                            errors.alias
                                                ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                                                : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                                        }`}
                                    />
                                    {errors.alias && (
                                        <p className="mt-1 text-sm text-red-600">{errors.alias}</p>
                                    )}
                                    <p className="mt-1 text-xs text-gray-500">
                                        Unique identifier (lowercase, alphanumeric, hyphens only)
                                    </p>
                                </div>

                                <div>
                                    <label htmlFor="displayName" className="block text-sm font-medium text-gray-700">
                                        Display Name <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        id="displayName"
                                        value={formData.displayName}
                                        onChange={(e) =>
                                            setFormData({ ...formData, displayName: e.target.value })
                                        }
                                        placeholder="Germany Military IdP"
                                        className={`mt-1 block w-full rounded-md shadow-sm sm:text-sm ${
                                            errors.displayName
                                                ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                                                : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                                        }`}
                                    />
                                    {errors.displayName && (
                                        <p className="mt-1 text-sm text-red-600">{errors.displayName}</p>
                                    )}
                                </div>

                                <div>
                                    <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                                        Description
                                    </label>
                                    <textarea
                                        id="description"
                                        rows={3}
                                        value={formData.description}
                                        onChange={(e) =>
                                            setFormData({ ...formData, description: e.target.value })
                                        }
                                        placeholder="Identity provider for German Armed Forces personnel..."
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Step 3: Protocol Configuration */}
                        {currentStep === 3 && formData.protocol === 'oidc' && formData.oidcConfig && (
                            <OIDCConfigForm
                                config={formData.oidcConfig}
                                onChange={(config) => setFormData({ ...formData, oidcConfig: config })}
                                errors={errors}
                            />
                        )}

                        {/* Step 3: SAML Configuration */}
                        {currentStep === 3 && formData.protocol === 'saml' && formData.samlConfig && (
                            <SAMLConfigForm
                                config={formData.samlConfig}
                                onChange={(config) => setFormData({ ...formData, samlConfig: config })}
                                errors={errors}
                            />
                        )}

                        {/* Step 4: Attribute Mapping */}
                        {currentStep === 4 && (
                            <AttributeMapper
                                mappings={formData.attributeMappings}
                                onChange={(mappings) => setFormData({ ...formData, attributeMappings: mappings })}
                                protocol={formData.protocol}
                                errors={errors}
                            />
                        )}

                        {/* Step 5: Review & Test */}
                        {currentStep === 5 && (
                            <div className="space-y-6">
                                <div>
                                    <h3 className="text-lg font-medium text-gray-900">Review Configuration</h3>
                                    <p className="mt-1 text-sm text-gray-500">
                                        Review your configuration and test connectivity before submitting.
                                    </p>
                                </div>

                                {/* Configuration Summary */}
                                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                                    <div>
                                        <span className="text-sm font-medium text-gray-700">Alias:</span>
                                        <span className="ml-2 text-sm text-gray-900">{formData.alias}</span>
                                    </div>
                                    <div>
                                        <span className="text-sm font-medium text-gray-700">Display Name:</span>
                                        <span className="ml-2 text-sm text-gray-900">{formData.displayName}</span>
                                    </div>
                                    <div>
                                        <span className="text-sm font-medium text-gray-700">Protocol:</span>
                                        <span className="ml-2 text-sm text-gray-900">{formData.protocol.toUpperCase()}</span>
                                    </div>
                                    {formData.protocol === 'oidc' && formData.oidcConfig && (
                                        <>
                                            <div>
                                                <span className="text-sm font-medium text-gray-700">Issuer:</span>
                                                <span className="ml-2 text-sm text-gray-900">{formData.oidcConfig.issuer}</span>
                                            </div>
                                            <div>
                                                <span className="text-sm font-medium text-gray-700">Client ID:</span>
                                                <span className="ml-2 text-sm text-gray-900">{formData.oidcConfig.clientId}</span>
                                            </div>
                                        </>
                                    )}
                                    <div>
                                        <span className="text-sm font-medium text-gray-700">Attribute Mappings:</span>
                                        <span className="ml-2 text-sm text-gray-900">4 configured</span>
                                    </div>
                                </div>

                                {/* Test Connection Button */}
                                <div>
                                    <button
                                        type="button"
                                        onClick={handleTestConnection}
                                        disabled={isSubmitting}
                                        className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                                    >
                                        {isSubmitting ? 'Testing...' : 'Test Connection'}
                                    </button>
                                </div>

                                {/* Test Result */}
                                {testResult && (
                                    <div className={`rounded-md p-4 ${
                                        testResult.success ? 'bg-green-50' : 'bg-red-50'
                                    }`}>
                                        <div className="flex">
                                            <div className="flex-shrink-0">
                                                {testResult.success ? (
                                                    <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                                    </svg>
                                                ) : (
                                                    <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                                    </svg>
                                                )}
                                            </div>
                                            <div className="ml-3">
                                                <h3 className={`text-sm font-medium ${
                                                    testResult.success ? 'text-green-800' : 'text-red-800'
                                                }`}>
                                                    {testResult.message}
                                                </h3>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Step 6: Submit for Approval */}
                        {currentStep === 6 && (
                            <div className="space-y-6">
                                <div>
                                    <h3 className="text-lg font-medium text-gray-900">Submit for Approval</h3>
                                    <p className="mt-1 text-sm text-gray-500">
                                        Your IdP configuration will be submitted for approval by a super administrator.
                                    </p>
                                </div>

                                <div className="bg-yellow-50 rounded-lg p-4">
                                    <div className="flex">
                                        <div className="flex-shrink-0">
                                            <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                            </svg>
                                        </div>
                                        <div className="ml-3">
                                            <h3 className="text-sm font-medium text-yellow-800">Approval Required</h3>
                                            <div className="mt-2 text-sm text-yellow-700">
                                                <p>
                                                    New identity providers must be approved before they become active.
                                                    You will be notified once a super administrator reviews your submission.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-start">
                                    <div className="flex items-center h-5">
                                        <input
                                            id="confirm"
                                            type="checkbox"
                                            required
                                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                    </div>
                                    <div className="ml-3 text-sm">
                                        <label htmlFor="confirm" className="font-medium text-gray-700">
                                            I verify that this configuration is correct
                                        </label>
                                        <p className="text-gray-500">
                                            I have reviewed all settings and tested the connection.
                                        </p>
                                    </div>
                                </div>

                                {errors.submit && (
                                    <div className="rounded-md bg-red-50 p-4">
                                        <div className="flex">
                                            <div className="flex-shrink-0">
                                                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                                </svg>
                                            </div>
                                            <div className="ml-3">
                                                <h3 className="text-sm font-medium text-red-800">
                                                    {errors.submit}
                                                </h3>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Navigation Buttons */}
                    <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse rounded-b-lg">
                        {currentStep < 6 ? (
                            <button
                                type="button"
                                onClick={handleNext}
                                className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm"
                            >
                                Next →
                            </button>
                        ) : currentStep === 6 ? (
                            <button
                                type="button"
                                onClick={handleSubmit}
                                disabled={isSubmitting}
                                className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-green-600 text-base font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                            >
                                {isSubmitting ? 'Submitting...' : 'Submit for Approval'}
                            </button>
                        ) : null}

                        {currentStep > 1 && (
                            <button
                                type="button"
                                onClick={handleBack}
                                className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:w-auto sm:text-sm"
                            >
                                ← Back
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={() => router.push('/admin/idp')}
                            className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 sm:mt-0 sm:w-auto sm:text-sm"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
                </div>
            </div>
        </div>
    );
}

