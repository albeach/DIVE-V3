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
import PageLayout from '@/components/layout/page-layout';
import WizardSteps from '@/components/admin/wizard-steps';
import OIDCConfigForm from '@/components/admin/oidc-config-form';
import SAMLConfigForm from '@/components/admin/saml-config-form';
import AttributeMapper from '@/components/admin/attribute-mapper';
import RiskScoreBadge from '@/components/admin/risk-score-badge';
import RiskBreakdown from '@/components/admin/risk-breakdown';
import ComplianceStatusCard from '@/components/admin/compliance-status-card';
import SLACountdown from '@/components/admin/sla-countdown';
import { IIdPFormData, IdPProtocol, IAdminAPIResponse, IIdentityProvider } from '@/types/admin.types';

const WIZARD_STEPS = [
    { number: 1, title: 'Protocol', description: 'Select IdP protocol' },
    { number: 2, title: 'Basic Info', description: 'Name and description' },
    { number: 3, title: 'Configuration', description: 'Protocol settings' },
    { number: 4, title: 'Documentation', description: 'Upload compliance docs (optional)' },
    { number: 5, title: 'Attributes', description: 'Map DIVE attributes' },
    { number: 6, title: 'Review', description: 'Review configuration' },
    { number: 7, title: 'Submit', description: 'Submit for approval' },
    { number: 8, title: 'Results', description: 'Validation & risk assessment' }
];

// Phase 4: Federation Partner Registry (pre-configured partners)
interface FederationPartner {
    code: string;
    name: string;
    idpUrl: string;
    realm: string;
    clientId: string;
    protocol: 'oidc' | 'saml';
    enabled: boolean;
}

const FEDERATION_PARTNERS: FederationPartner[] = [
    {
        code: 'USA',
        name: 'United States',
        idpUrl: 'https://usa-idp.dive25.com',
        realm: 'dive-v3-broker',
        clientId: 'dive-v3-broker',
        protocol: 'oidc',
        enabled: true
    },
    {
        code: 'FRA',
        name: 'France',
        idpUrl: 'https://fra-idp.dive25.com',
        realm: 'dive-v3-broker',
        clientId: 'dive-v3-broker',
        protocol: 'oidc',
        enabled: true
    },
    {
        code: 'GBR',
        name: 'United Kingdom',
        idpUrl: 'https://gbr-idp.dive25.com',
        realm: 'dive-v3-broker',
        clientId: 'dive-v3-broker',
        protocol: 'oidc',
        enabled: true
    },
    {
        code: 'DEU',
        name: 'Germany',
        idpUrl: 'https://deu-idp.prosecurity.biz',
        realm: 'dive-v3-broker',
        clientId: 'dive-v3-broker',
        protocol: 'oidc',
        enabled: true
    },
    {
        code: 'CAN',
        name: 'Canada',
        idpUrl: 'https://can-idp.dive25.com',
        realm: 'dive-v3-broker',
        clientId: 'dive-v3-broker',
        protocol: 'oidc',
        enabled: false // Not yet deployed
    },
    {
        code: 'ESP',
        name: 'Spain',
        idpUrl: 'https://esp-idp.dive25.com',
        realm: 'dive-v3-broker',
        clientId: 'dive-v3-broker',
        protocol: 'oidc',
        enabled: false // Not yet deployed
    }
];

export default function NewIdPWizard() {
    const router = useRouter();
    const { data: session, status } = useSession();
    const [currentStep, setCurrentStep] = useState(1);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [testResult, setTestResult] = useState<any>(null);
    const [submissionResult, setSubmissionResult] = useState<any>(null);

    const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
    const [isValidating, setIsValidating] = useState(false);

    // Phase 4: Federation Partner Quick-Add
    const [isFederationMode, setIsFederationMode] = useState(false);
    const [selectedPartner, setSelectedPartner] = useState<FederationPartner | null>(null);

    const [formData, setFormData] = useState<IIdPFormData>({
        providerId: 'oidc',
        alias: '',
        displayName: '',
        enabled: true,
        trustLevel: 'development',
        description: '',
        oidcConfig: {
            issuer: '',
            clientId: '',
            clientSecret: '',
            authorizationUrl: '',
            tokenUrl: '',
            userInfoUrl: '',
            jwksUri: '',
            defaultScope: 'openid profile email'
        },
        samlConfig: {
            entityId: '',
            singleSignOnServiceUrl: '',
            singleLogoutServiceUrl: '',
            signingCertificate: '',
            nameIDPolicyFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified'
        },
        attributeMappings: [
            { source: 'sub', target: 'uniqueID', required: true, description: 'Unique user identifier' },
            { source: 'clearance', target: 'clearance', required: true, description: 'Security clearance level' },
            { source: 'country', target: 'countryOfAffiliation', required: true, description: 'Country of affiliation' },
            { source: 'groups', target: 'acpCOI', required: false, description: 'Community of Interest' }
        ],
        // Auth0 Integration (Week 3.4.6)
        useAuth0: false,
        auth0Protocol: 'oidc',
        auth0AppType: 'spa',
        // Phase 2: Operational data - BACKEND will determine from discovery document
        // User cannot game these - auto-detected from endpoint testing
        operationalData: undefined,
        
        // Phase 2: Compliance documents - optional uploads
        complianceDocuments: {
            mfaPolicy: '',
            acp240Certificate: '',
            stanag4774Certification: '',
            auditPlan: ''
        },
        // Metadata
        metadata: {
            country: 'USA',
            organization: '',
            contactEmail: '',
            contactPhone: ''
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
                // Protocol selection
                // Phase 4: Require partner selection in federation mode
                if (isFederationMode && !selectedPartner) {
                    newErrors.partner = 'Please select a federation partner';
                }
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
                if (formData.providerId === 'oidc' && formData.oidcConfig) {
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
                } else if (formData.providerId === 'saml' && formData.samlConfig) {
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
                if (!formData.attributeMappings) {
                    newErrors['attributeMappings'] = 'Attribute mappings are required';
                    break;
                }

                const uniqueIdMapping = formData.attributeMappings.find(m => m.target === 'uniqueID');
                const clearanceMapping = formData.attributeMappings.find(m => m.target === 'clearance');
                const countryMapping = formData.attributeMappings.find(m => m.target === 'countryOfAffiliation');

                if (!uniqueIdMapping?.source) {
                    newErrors['uniqueID.claim'] = 'uniqueID claim is required';
                }
                if (!clearanceMapping?.source) {
                    newErrors['clearance.claim'] = 'clearance claim is required';
                }
                if (!countryMapping?.source) {
                    newErrors['countryOfAffiliation.claim'] = 'countryOfAffiliation claim is required';
                }
                break;
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleNext = () => {
        if (validateStep()) {
            // Phase 4: Skip to Review (step 6) for federation partner quick-add
            if (isFederationMode && selectedPartner && currentStep === 1) {
                // Jump to Review step since all config is auto-populated
                setCurrentStep(6);
            } else {
                setCurrentStep(currentStep + 1);
            }
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
            // Submit via internal API proxy so tokens stay server-side
            console.log('[DEBUG] Starting IdP submission...', {
                alias: formData.alias,
                protocol: formData.providerId
            });

            // Create Keycloak IdP configuration
            const keycloakConfig = formData.providerId === 'oidc'
                ? formData.oidcConfig
                : formData.samlConfig;

            const requestBody = {
                alias: formData.alias,
                displayName: formData.displayName,
                description: formData.description,
                protocol: formData.providerId,
                config: keycloakConfig,
                attributeMappings: formData.attributeMappings,
                // Phase 2: Operational data and compliance
                operationalData: formData.operationalData,
                complianceDocuments: formData.complianceDocuments,
                metadata: {
                    ...(formData.metadata || {}),
                    contactEmail: formData.metadata?.contactEmail || session?.user?.email || 'admin@example.com',
                    organization: formData.metadata?.organization || formData.displayName
                }
            };

            console.log('[DEBUG] Request body:', JSON.stringify(requestBody, null, 2));

            const response = await fetch('/api/admin/idps', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            console.log('[DEBUG] Response status:', response.status);

            const result: IAdminAPIResponse<IIdentityProvider> = await response.json();
            console.log('[DEBUG] Response body:', result);

            if (!response.ok) {
                console.error('[DEBUG] Submission failed!', {
                    status: response.status,
                    error: result.error,
                    message: result.message,
                    hasValidationResults: !!result.data?.validationResults,
                    hasCriticalFailures: !!result.data?.criticalFailures
                });

                // DETAILED ERROR HANDLING
                if (result.data?.validationResults) {
                    // Phase 1 validation failed - show detailed results
                    setSubmissionResult({
                        status: 'validation-failed',
                        validationResults: result.data.validationResults,
                        preliminaryScore: result.data.preliminaryScore,
                        criticalFailures: result.data.criticalFailures,
                        error: result.message || result.error
                    });
                    setCurrentStep(7); // Show results page with errors
                } else {
                    // Other error - show in current step with full details
                    const errorMessage = result.message || result.error || 'Failed to create IdP';
                    console.error('[DEBUG] Full error:', errorMessage);
                    throw new Error(`${errorMessage} (Status: ${response.status})`);
                }
                return;
            }

            console.log('[DEBUG] Submission successful!');

            // PHASE 2 FIX: Store submission results and show them to user
            setSubmissionResult({
                ...result.data
            });
            
            // Move to results step instead of redirecting immediately
            setCurrentStep(8);
        } catch (error) {
            setErrors({
                submit: error instanceof Error ? error.message : 'Submission failed'
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <PageLayout 
            user={session?.user || {}}
            breadcrumbs={[
                { label: 'Admin', href: '/admin/dashboard' },
                { label: 'IdP Management', href: '/admin/idp' },
                { label: 'Add New IdP', href: null }
            ]}
            maxWidth="5xl"
        >
            {/* Modern Hero Header */}
            <div className="mb-10">
                <div className="flex items-start gap-6">
                    <div className="flex-shrink-0">
                        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center shadow-xl shadow-blue-500/30 transform hover:scale-110 hover:rotate-3 transition-all duration-300">
                            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                            </svg>
                        </div>
                    </div>
                    <div className="flex-1">
                        <h1 className="text-5xl font-black bg-gradient-to-r from-gray-900 via-blue-900 to-purple-900 bg-clip-text text-transparent tracking-tight">
                            Connect External Identity Provider
                        </h1>
                        <p className="mt-3 text-lg text-gray-600 font-medium">
                            Connect your organization's existing identity provider to DIVE for federated authentication
                        </p>
                    </div>
                </div>
            </div>

            {/* Modern Progress Indicator */}
            <div className="mb-10">
                <div className="relative">
                    {/* Background track */}
                    <div className="absolute top-5 left-0 w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 opacity-50" />
                </div>

                    {/* Animated progress */}
                    <div 
                        className="absolute top-5 left-0 h-2 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 rounded-full shadow-lg shadow-blue-500/40 transition-all duration-700 ease-out"
                        style={{ width: `${(currentStep / WIZARD_STEPS.length) * 100}%` }}
                    >
                        <div className="absolute inset-0 bg-white/30 animate-pulse" />
                    </div>
                    
                    {/* Step indicators */}
                    <div className="relative flex justify-between">
                        {WIZARD_STEPS.map((step, idx) => (
                            <div key={step.number} className="flex flex-col items-center" style={{ animationDelay: `${idx * 50}ms` }}>
                                <div className={`relative w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-500 ${
                                    step.number < currentStep 
                                        ? 'bg-gradient-to-br from-green-500 to-emerald-600 text-white shadow-lg shadow-green-500/50 scale-105' 
                                        : step.number === currentStep
                                        ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-2xl shadow-blue-600/70 scale-125 ring-4 ring-blue-200'
                                        : 'bg-white border-2 border-gray-300 text-gray-400 scale-90'
                                }`}>
                                    {step.number < currentStep ? (
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                    ) : (
                                        step.number
                                    )}
                                    {step.number === currentStep && (
                                        <div className="absolute inset-0 rounded-full bg-blue-400 animate-ping opacity-75" />
                                    )}
                                </div>
                                <div className={`mt-2 text-center max-w-[90px] transition-opacity duration-300 ${
                                    step.number === currentStep ? 'opacity-100' : 'opacity-60'
                                }`}>
                                    <p className={`text-[10px] font-bold leading-tight ${
                                        step.number === currentStep ? 'text-blue-600' : 'text-gray-600'
                                    }`}>
                                        {step.title}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Wizard Card with subtle glow */}
            <div className="relative">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl opacity-20 blur-xl" />
                <div className="relative bg-white shadow-2xl rounded-2xl border border-gray-100">
                    <div className="px-6 py-8 sm:p-10">
                        {/* Step 1: Protocol Selection */}
                        {currentStep === 1 && (
                            <div className="space-y-8">
                                <div className="text-center">
                                    <h3 className="text-2xl font-bold text-gray-900">Choose Protocol</h3>
                                    <p className="mt-2 text-gray-600">
                                        Select your identity provider's authentication protocol
                                    </p>
                                </div>

                                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                                    {/* OIDC - Modern 3D Card */}
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, protocol: 'oidc' })}
                                        className="group relative transform transition-all duration-300 hover:scale-105 focus:outline-none"
                                    >
                                        <div className={`absolute -inset-0.5 rounded-2xl transition-opacity duration-300 ${
                                            formData.providerId === 'oidc' 
                                                ? 'bg-gradient-to-r from-blue-600 to-cyan-500 opacity-75 blur-sm' 
                                                : 'bg-gradient-to-r from-blue-400 to-cyan-400 opacity-0 group-hover:opacity-50 blur-sm'
                                        }`} />
                                        
                                        <div className={`relative flex flex-col items-center rounded-2xl p-8 transition-all duration-300 ${
                                            formData.providerId === 'oidc'
                                                ? 'bg-gradient-to-br from-blue-600 to-cyan-600 text-white shadow-2xl'
                                                : 'bg-white text-gray-900 shadow-lg group-hover:shadow-xl'
                                        }`}>
                                            <div className={`text-6xl mb-3 transition-transform duration-300 ${
                                                formData.providerId === 'oidc' ? 'scale-110' : 'group-hover:scale-110'
                                            }`}>
                                                🔷
                                            </div>
                                            <span className={`text-xl font-bold mb-1 ${formData.providerId === 'oidc' ? 'text-white' : 'text-gray-900'}`}>
                                                OIDC
                                            </span>
                                            <span className={`text-sm ${formData.providerId === 'oidc' ? 'text-blue-100' : 'text-gray-600'}`}>
                                                OpenID Connect
                                            </span>
                                            {formData.providerId === 'oidc' && (
                                                <div className="absolute top-3 right-3 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-md">
                                                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                    </svg>
                                                </div>
                                            )}
                                        </div>
                                    </button>

                                    {/* SAML - Modern 3D Card */}
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, protocol: 'saml' })}
                                        className="group relative transform transition-all duration-300 hover:scale-105 focus:outline-none"
                                    >
                                        <div className={`absolute -inset-0.5 rounded-2xl transition-opacity duration-300 ${
                                            formData.providerId === 'saml' 
                                                ? 'bg-gradient-to-r from-orange-600 to-pink-500 opacity-75 blur-sm' 
                                                : 'bg-gradient-to-r from-orange-400 to-pink-400 opacity-0 group-hover:opacity-50 blur-sm'
                                        }`} />
                                        
                                        <div className={`relative flex flex-col items-center rounded-2xl p-8 transition-all duration-300 ${
                                            formData.providerId === 'saml'
                                                ? 'bg-gradient-to-br from-orange-600 to-pink-600 text-white shadow-2xl'
                                                : 'bg-white text-gray-900 shadow-lg group-hover:shadow-xl'
                                        }`}>
                                            <div className={`text-6xl mb-3 transition-transform duration-300 ${
                                                formData.providerId === 'saml' ? 'scale-110' : 'group-hover:scale-110'
                                            }`}>
                                                🔶
                                            </div>
                                            <span className={`text-xl font-bold mb-1 ${formData.providerId === 'saml' ? 'text-white' : 'text-gray-900'}`}>
                                                SAML
                                            </span>
                                            <span className={`text-sm ${formData.providerId === 'saml' ? 'text-orange-100' : 'text-gray-600'}`}>
                                                SAML 2.0
                                            </span>
                                            {formData.providerId === 'saml' && (
                                                <div className="absolute top-3 right-3 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-md">
                                                    <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                    </svg>
                                                </div>
                                            )}
                                        </div>
                                    </button>
                                </div>

                                {/* Phase 4: Federation Partner Quick-Add */}
                                <div className="relative mt-8 pt-8 border-t border-gray-200">
                                    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-white px-4">
                                        <span className="text-sm font-medium text-gray-500">Or quick-add a federation partner</span>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsFederationMode(true);
                                            setFormData({ ...formData, protocol: 'oidc' });
                                        }}
                                        className="group relative w-full transform transition-all duration-300 hover:scale-[1.02] focus:outline-none"
                                    >
                                        <div className={`absolute -inset-0.5 rounded-2xl transition-opacity duration-300 ${
                                            isFederationMode 
                                                ? 'bg-gradient-to-r from-emerald-600 to-teal-500 opacity-75 blur-sm' 
                                                : 'bg-gradient-to-r from-emerald-400 to-teal-400 opacity-0 group-hover:opacity-50 blur-sm'
                                        }`} />
                                        
                                        <div className={`relative flex items-center gap-6 rounded-2xl p-6 transition-all duration-300 ${
                                            isFederationMode
                                                ? 'bg-gradient-to-br from-emerald-600 to-teal-600 text-white shadow-2xl'
                                                : 'bg-white text-gray-900 shadow-lg group-hover:shadow-xl border-2 border-dashed border-gray-300 group-hover:border-emerald-400'
                                        }`}>
                                            <div className={`text-5xl transition-transform duration-300 ${
                                                isFederationMode ? 'scale-110' : 'group-hover:scale-110'
                                            }`}>
                                                🌐
                                            </div>
                                            <div className="flex-1 text-left">
                                                <span className={`text-xl font-bold block ${isFederationMode ? 'text-white' : 'text-gray-900'}`}>
                                                    DIVE V3 Federation Partner
                                                </span>
                                                <span className={`text-sm ${isFederationMode ? 'text-emerald-100' : 'text-gray-600'}`}>
                                                    Instantly connect a pre-configured coalition partner (&lt;5 min setup)
                                                </span>
                                            </div>
                                            <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${
                                                isFederationMode ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-700'
                                            }`}>
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                                </svg>
                                                <span className="text-sm font-semibold">Quick Setup</span>
                                            </div>
                                            {isFederationMode && (
                                                <div className="absolute top-3 right-3 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-md">
                                                    <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                    </svg>
                                                </div>
                                            )}
                                        </div>
                                    </button>

                                    {/* Partner Selector (shown when federation mode is active) */}
                                    {isFederationMode && (
                                        <div className="mt-6 space-y-4 animate-in slide-in-from-top-4 duration-300">
                                            <h4 className="text-lg font-semibold text-gray-900">Select Federation Partner</h4>
                                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                                {FEDERATION_PARTNERS.filter(p => p.enabled).map((partner) => (
                                                    <button
                                                        key={partner.code}
                                                        type="button"
                                                        onClick={() => {
                                                            setSelectedPartner(partner);
                                                            // Auto-populate form data
                                                            setFormData({
                                                                ...formData,
                                                                protocol: partner.protocol,
                                                                alias: `${partner.code.toLowerCase()}-idp`,
                                                                displayName: `${partner.name} IdP`,
                                                                description: `Federation partner: ${partner.name}`,
                                                                oidcConfig: {
                                                                    issuer: `${partner.idpUrl}/realms/${partner.realm}`,
                                                                    clientId: partner.clientId,
                                                                    clientSecret: '', // To be provided
                                                                    authorizationUrl: `${partner.idpUrl}/realms/${partner.realm}/protocol/openid-connect/auth`,
                                                                    tokenUrl: `${partner.idpUrl}/realms/${partner.realm}/protocol/openid-connect/token`,
                                                                    userInfoUrl: `${partner.idpUrl}/realms/${partner.realm}/protocol/openid-connect/userinfo`,
                                                                    jwksUri: `${partner.idpUrl}/realms/${partner.realm}/protocol/openid-connect/certs`,
                                                                    defaultScope: 'openid profile email clearance countryOfAffiliation acpCOI'
                                                                },
                                                                metadata: {
                                                                    ...formData.metadata,
                                                                    country: partner.code,
                                                                    organization: `${partner.name} Government`
                                                                }
                                                            });
                                                        }}
                                                        className={`relative p-4 rounded-xl border-2 transition-all duration-200 ${
                                                            selectedPartner?.code === partner.code
                                                                ? 'border-emerald-500 bg-emerald-50 shadow-lg'
                                                                : 'border-gray-200 hover:border-emerald-300 hover:bg-emerald-50/50'
                                                        }`}
                                                    >
                                                        <div className="text-3xl mb-2">
                                                            {partner.code === 'USA' && '🇺🇸'}
                                                            {partner.code === 'FRA' && '🇫🇷'}
                                                            {partner.code === 'GBR' && '🇬🇧'}
                                                            {partner.code === 'DEU' && '🇩🇪'}
                                                            {partner.code === 'CAN' && '🇨🇦'}
                                                            {partner.code === 'ESP' && '🇪🇸'}
                                                        </div>
                                                        <div className="font-semibold text-gray-900">{partner.name}</div>
                                                        <div className="text-xs text-gray-500 mt-1">{partner.code}</div>
                                                        {selectedPartner?.code === partner.code && (
                                                            <div className="absolute top-2 right-2 w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center">
                                                                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                                </svg>
                                                            </div>
                                                        )}
                                                    </button>
                                                ))}
                                            </div>

                                            {/* Coming Soon Partners */}
                                            <div className="mt-4">
                                                <p className="text-xs text-gray-500 mb-2">Coming soon:</p>
                                                <div className="flex gap-2">
                                                    {FEDERATION_PARTNERS.filter(p => !p.enabled).map((partner) => (
                                                        <span key={partner.code} className="px-3 py-1 bg-gray-100 text-gray-500 rounded-full text-xs">
                                                            {partner.code === 'CAN' && '🇨🇦'} {partner.code === 'ESP' && '🇪🇸'} {partner.name}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Quick Setup Note */}
                                            {selectedPartner && (
                                                <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                                                    <div className="flex items-start gap-3">
                                                        <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
                                                            <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                            </svg>
                                                        </div>
                                                        <div>
                                                            <h5 className="font-semibold text-emerald-900">Auto-Configured for {selectedPartner.name}</h5>
                                                            <p className="text-sm text-emerald-700 mt-1">
                                                                OIDC endpoints, attribute mappings, and security settings have been pre-populated.
                                                                You only need to provide the <strong>client secret</strong> (obtain from {selectedPartner.name} admin).
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Cancel Federation Mode */}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setIsFederationMode(false);
                                                    setSelectedPartner(null);
                                                }}
                                                className="text-sm text-gray-500 hover:text-gray-700 underline"
                                            >
                                                ← Back to manual configuration
                                            </button>
                                        </div>
                                    )}
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
                        {currentStep === 3 && formData.providerId === 'oidc' && formData.oidcConfig && (
                            <OIDCConfigForm
                                config={formData.oidcConfig}
                                onChange={(config) => setFormData({ ...formData, oidcConfig: config })}
                                errors={errors}
                                readonly={formData.useAuth0}
                                accessToken={(session as any)?.accessToken}
                            />
                        )}

                        {/* Step 3: SAML Configuration */}
                        {currentStep === 3 && formData.providerId === 'saml' && formData.samlConfig && (
                            <SAMLConfigForm
                                config={formData.samlConfig}
                                onChange={(config) => setFormData({ ...formData, samlConfig: config })}
                                errors={errors}
                                accessToken={(session as any)?.accessToken}
                            />
                        )}

                        {/* Step 4: Supporting Documentation (Optional) */}
                        {currentStep === 4 && (
                            <div className="space-y-6">
                                <div>
                                    <h3 className="text-lg font-medium text-gray-900">Supporting Documentation (Optional)</h3>
                                    <p className="mt-1 text-sm text-gray-600">
                                        Upload or reference supporting documentation. These are <strong>optional</strong> and improve your approval chances.
                                    </p>
                                </div>

                                {/* Info Card - Auto-Detection */}
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                    <h4 className="font-semibold text-blue-900 flex items-center gap-2 mb-2">
                                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        Automatic Security Assessment
                                    </h4>
                                    <p className="text-sm text-blue-800">
                                        We will automatically assess your IdP's security configuration by testing:
                                    </p>
                                    <ul className="mt-2 text-sm text-blue-900 space-y-1 ml-4">
                                        <li>✓ TLS version and cipher strength (connects to your endpoint)</li>
                                        <li>✓ Cryptographic algorithms (analyzes your JWKS/certificates)</li>
                                        <li>✓ MFA support (checks discovery document)</li>
                                        <li>✓ Endpoint reachability (tests connectivity)</li>
                                    </ul>
                                    <p className="mt-3 text-xs text-blue-700">
                                        <strong>These cannot be gamed</strong> - we verify by connecting to your actual endpoints!
                                    </p>
                                </div>

                                {/* Compliance Documentation - Upload References */}
                                <div className="bg-gray-50 rounded-lg p-4 space-y-4">
                                    <div>
                                        <h4 className="font-semibold text-gray-900">📋 Compliance Documentation</h4>
                                        <p className="text-sm text-gray-600 mt-1">
                                            Provide references to compliance documents. Admins will verify these during review.
                                        </p>
                                    </div>
                                    
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">
                                            MFA Policy Document
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.complianceDocuments?.mfaPolicy || ''}
                                            onChange={(e) => setFormData({
                                                ...formData,
                                                complianceDocuments: {
                                                    ...formData.complianceDocuments!,
                                                    mfaPolicy: e.target.value
                                                }
                                            })}
                                            placeholder="e.g., MFA-Policy-2024.pdf or URL to policy"
                                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                                        />
                                        <p className="mt-1 text-xs text-gray-500">Optional: Reference to your MFA enforcement policy</p>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">
                                            ACP-240 Certification
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.complianceDocuments?.acp240Certificate || ''}
                                            onChange={(e) => setFormData({
                                                ...formData,
                                                complianceDocuments: {
                                                    ...formData.complianceDocuments!,
                                                    acp240Certificate: e.target.value
                                                }
                                            })}
                                            placeholder="e.g., ACP-240-Cert-2024.pdf"
                                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                                        />
                                        <p className="mt-1 text-xs text-gray-500">Optional: NATO ACP-240 certification (improves score)</p>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">
                                            STANAG 4774 Certification
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.complianceDocuments?.stanag4774Certification || ''}
                                            onChange={(e) => setFormData({
                                                ...formData,
                                                complianceDocuments: {
                                                    ...formData.complianceDocuments!,
                                                    stanag4774Certification: e.target.value
                                                }
                                            })}
                                            placeholder="e.g., STANAG-4774-Cert.pdf"
                                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                                        />
                                        <p className="mt-1 text-xs text-gray-500">Optional: NATO security labeling certification</p>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">
                                            Audit/Logging Documentation
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.complianceDocuments?.auditPlan || ''}
                                            onChange={(e) => setFormData({
                                                ...formData,
                                                complianceDocuments: {
                                                    ...formData.complianceDocuments!,
                                                    auditPlan: e.target.value
                                                }
                                            })}
                                            placeholder="e.g., Audit-Plan-2024.pdf or logging policy"
                                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                                        />
                                        <p className="mt-1 text-xs text-gray-500">Optional: Audit plan or logging policy reference</p>
                                    </div>

                                    <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mt-4">
                                        <p className="text-xs text-yellow-800">
                                            <strong>Note:</strong> Admins will verify these documents during review. Providing valid documentation improves your approval speed and risk score. Leaving fields blank is acceptable - the system will score based on technical validation only.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 5: Attribute Mapping (moved from Step 4) */}
                        {currentStep === 5 && (
                            <AttributeMapper
                                mappings={Object.fromEntries((formData.attributeMappings || []).map(m => [m.target, m])) as any}
                                onChange={(mappings) => setFormData({
                                    ...formData,
                                    attributeMappings: Object.values(mappings)
                                })}
                                protocol={formData.providerId}
                                errors={errors}
                            />
                        )}

                        {/* Step 6: Review & Test (moved from Step 5) */}
                        {currentStep === 6 && (
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
                                        <span className="ml-2 text-sm text-gray-900">{formData.providerId.toUpperCase()}</span>
                                    </div>
                                    {formData.providerId === 'oidc' && formData.oidcConfig && (
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

                        {/* Step 7: Submit for Approval (moved from Step 6) */}
                        {currentStep === 7 && (
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
                                    <div className="rounded-md bg-red-50 border border-red-200 p-4">
                                        <div className="flex">
                                            <div className="flex-shrink-0">
                                                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                                </svg>
                                            </div>
                                            <div className="ml-3 flex-1">
                                                <h3 className="text-sm font-bold text-red-800 mb-1">
                                                    Submission Failed
                                                </h3>
                                                <p className="text-sm text-red-700">
                                                    {errors.submit}
                                                </p>
                                                <p className="mt-2 text-xs text-red-600">
                                                    Please check your configuration and try again, or contact an administrator if the problem persists.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Step 8: Results - Phase 2 Validation & Risk Assessment (moved from Step 7) */}
                        {currentStep === 8 && submissionResult && (
                            <div className="space-y-8">
                                <div>
                                    <h3 className="text-2xl font-bold text-gray-900">
                                        {submissionResult.status === 'validation-failed' ? '⚠️ Validation Results' : '✅ Submission Complete!'}
                                    </h3>
                                    <p className="mt-2 text-sm text-gray-600">
                                        {submissionResult.status === 'validation-failed' 
                                            ? 'Your configuration has validation issues. Review the details below and fix before resubmitting.'
                                            : 'Your Identity Provider has been validated and assessed. Review the results below.'
                                        }
                                    </p>
                    </div>

                                {/* Validation Failed Banner */}
                                {submissionResult.status === 'validation-failed' && (
                                    <div className="rounded-xl p-6 bg-red-50 border-2 border-red-200">
                                        <div className="flex items-center gap-4">
                                            <div className="text-4xl">❌</div>
                                            <div className="flex-1">
                                                <h4 className="text-lg font-bold text-red-900">Validation Failed</h4>
                                                <p className="text-sm text-red-700 mt-1">
                                                    {submissionResult.error || 'Configuration contains critical security issues'}
                                                </p>
                                                {submissionResult.criticalFailures && submissionResult.criticalFailures.length > 0 && (
                                                    <ul className="mt-3 space-y-1">
                                                        {submissionResult.criticalFailures.map((failure: string, idx: number) => (
                                                            <li key={idx} className="text-sm text-red-800 flex items-start gap-2">
                                                                <span>•</span>
                                                                <span>{failure}</span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Status Banner (Success/Pending/Rejected) */}
                                {submissionResult.status !== 'validation-failed' && (
                                    <div className={`rounded-xl p-6 ${
                                        submissionResult.status === 'approved' ? 'bg-green-50 border-2 border-green-200' :
                                        submissionResult.status === 'rejected' ? 'bg-red-50 border-2 border-red-200' :
                                        'bg-blue-50 border-2 border-blue-200'
                                    }`}>
                                    <div className="flex items-center gap-4">
                                        <div className="text-4xl">
                                            {submissionResult.status === 'approved' ? '🎉' :
                                             submissionResult.status === 'rejected' ? '❌' :
                                             '⏳'}
                                        </div>
                                        <div className="flex-1">
                                            <h4 className="text-lg font-bold">
                                                {submissionResult.status === 'approved' ? 'Auto-Approved!' :
                                                 submissionResult.status === 'rejected' ? 'Automatically Rejected' :
                                                 'Pending Review'}
                                            </h4>
                                            <p className="text-sm text-gray-700 mt-1">
                                                {submissionResult.approvalDecision?.reason || 'Awaiting administrator review'}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                                )}

                                {/* Phase 2: Risk Score Badge */}
                                {submissionResult.comprehensiveRiskScore && submissionResult.status !== 'validation-failed' && (
                                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                                        <h4 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                            🏆 Risk Assessment
                                        </h4>
                                        <RiskScoreBadge 
                                            score={submissionResult.comprehensiveRiskScore.total}
                                            maxScore={100}
                                            tier={submissionResult.comprehensiveRiskScore.tier}
                                            riskLevel={submissionResult.comprehensiveRiskScore.riskLevel}
                                            size="lg"
                                        />
                                    </div>
                                )}

                                {/* Phase 2: Risk Breakdown */}
                                {submissionResult.comprehensiveRiskScore && (
                                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                                        <h4 className="text-lg font-semibold mb-4">📊 Risk Score Breakdown</h4>
                                        <RiskBreakdown breakdown={submissionResult.comprehensiveRiskScore.breakdown} />
                                    </div>
                                )}

                                {/* Phase 2: Compliance Status */}
                                {submissionResult.complianceCheck && (
                                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                                        <h4 className="text-lg font-semibold mb-4">📋 Compliance Status</h4>
                                        <ComplianceStatusCard complianceCheck={submissionResult.complianceCheck} />
                                    </div>
                                )}

                                {/* Phase 2: SLA Countdown (if fast-track or standard review) */}
                                {submissionResult.approvalDecision?.slaDeadline && submissionResult.status === 'pending' && (
                                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                                        <h4 className="text-lg font-semibold mb-4">⏱️ Review Deadline</h4>
                                        <SLACountdown 
                                            slaDeadline={submissionResult.approvalDecision.slaDeadline}
                                            slaStatus={submissionResult.slaStatus || 'within'}
                                            action={submissionResult.approvalDecision.action}
                                        />
                                        <p className="mt-2 text-xs text-gray-600">
                                            {submissionResult.approvalDecision.action === 'fast-track' ? 
                                                'Fast-track review (2-hour SLA)' : 
                                                'Standard review (24-hour SLA)'}
                                        </p>
                                    </div>
                                )}

                                {/* Next Steps */}
                                {submissionResult.approvalDecision?.nextSteps && (
                                    <div className="bg-blue-50 rounded-xl border border-blue-200 p-6">
                                        <h4 className="text-lg font-semibold text-blue-900 mb-3">📝 Next Steps</h4>
                                        <ul className="space-y-2">
                                            {submissionResult.approvalDecision.nextSteps.map((step: string, idx: number) => (
                                                <li key={idx} className="flex items-start gap-2 text-sm text-blue-800">
                                                    <span className="font-bold">{idx + 1}.</span>
                                                    <span>{step}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {/* Action Buttons */}
                                <div className="flex gap-4">
                                    {submissionResult.status === 'pending' && (
                                        <button
                                            onClick={() => router.push('/admin/approvals')}
                                            className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                                        >
                                            View in Approval Queue
                                        </button>
                                    )}
                                    <button
                                        onClick={() => router.push('/admin/idp')}
                                        className={`${submissionResult.status === 'pending' ? 'flex-1' : 'w-full'} px-6 py-3 bg-gray-600 text-white rounded-lg font-semibold hover:bg-gray-700 transition-colors`}
                                    >
                                        Return to IdP Management
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Navigation Buttons - Hide on Step 8 (Results) */}
                    {currentStep < 8 && (
                    <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse rounded-b-lg">
                            {currentStep < 7 ? (
                            <button
                                type="button"
                                onClick={handleNext}
                                disabled={isFederationMode && currentStep === 1 && !selectedPartner}
                                className={`w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 text-base font-medium text-white sm:ml-3 sm:w-auto sm:text-sm ${
                                    isFederationMode && selectedPartner && currentStep === 1
                                        ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700'
                                        : 'bg-blue-600 hover:bg-blue-700'
                                } ${isFederationMode && currentStep === 1 && !selectedPartner ? 'opacity-50 cursor-not-allowed' : ''} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`}
                            >
                                {isFederationMode && selectedPartner && currentStep === 1 
                                    ? '⚡ Skip to Review' 
                                    : 'Next →'}
                            </button>
                            ) : currentStep === 7 ? (
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
                    )}
                    </div>
                </div>
        </PageLayout>
    );
}
