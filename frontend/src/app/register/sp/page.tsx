/**
 * DIVE V3 SP Self-Service Registration Portal
 * Phase 4, Task 1.2: Public SP Registration for External Organizations
 * 
 * Allows external organizations (contractors, partners) to self-register
 * as OAuth clients. Registration requires:
 * 1. Federated authentication (user must be logged in via IdP)
 * 2. Organization details auto-populated from token claims
 * 3. Approval workflow (SuperAdmin review)
 * 
 * NATO Compliance: ACP-240 §4.5 (External Entity Registration)
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';
import Link from 'next/link';

// Registration steps
const REGISTRATION_STEPS = [
    { number: 1, title: 'Authentication', description: 'Sign in with your organization' },
    { number: 2, title: 'Organization', description: 'Verify organization details' },
    { number: 3, title: 'Application', description: 'Configure your application' },
    { number: 4, title: 'Review', description: 'Review and submit' },
    { number: 5, title: 'Submitted', description: 'Pending approval' }
];

// Available countries for SP registration
const SP_COUNTRIES = [
    { code: 'USA', name: 'United States', flag: '🇺🇸' },
    { code: 'GBR', name: 'United Kingdom', flag: '🇬🇧' },
    { code: 'FRA', name: 'France', flag: '🇫🇷' },
    { code: 'DEU', name: 'Germany', flag: '🇩🇪' },
    { code: 'CAN', name: 'Canada', flag: '🇨🇦' },
    { code: 'AUS', name: 'Australia', flag: '🇦🇺' },
    { code: 'NZL', name: 'New Zealand', flag: '🇳🇿' },
    { code: 'ITA', name: 'Italy', flag: '🇮🇹' },
    { code: 'ESP', name: 'Spain', flag: '🇪🇸' },
    { code: 'NLD', name: 'Netherlands', flag: '🇳🇱' },
    { code: 'BEL', name: 'Belgium', flag: '🇧🇪' },
    { code: 'POL', name: 'Poland', flag: '🇵🇱' },
    { code: 'NOR', name: 'Norway', flag: '🇳🇴' },
    { code: 'DNK', name: 'Denmark', flag: '🇩🇰' }
];

// Organization types
const ORG_TYPES = [
    { value: 'defense_contractor', label: 'Defense Contractor' },
    { value: 'government_agency', label: 'Government Agency' },
    { value: 'research_institution', label: 'Research Institution' },
    { value: 'nato_partner', label: 'NATO Partner Organization' },
    { value: 'other', label: 'Other' }
];

// Classification levels
const MAX_CLASSIFICATIONS = [
    { value: 'UNCLASSIFIED', label: 'UNCLASSIFIED', color: 'bg-green-100 text-green-800' },
    { value: 'CONFIDENTIAL', label: 'CONFIDENTIAL', color: 'bg-blue-100 text-blue-800' },
    { value: 'SECRET', label: 'SECRET', color: 'bg-orange-100 text-orange-800' }
];

interface SPFormData {
    // Organization
    organizationName: string;
    organizationType: string;
    country: string;
    website: string;

    // Contact
    contactName: string;
    contactEmail: string;
    contactPhone: string;

    // Application
    applicationName: string;
    applicationDescription: string;
    redirectUris: string[];
    maxClassification: string;
    requestedCOIs: string[];

    // Rate limits
    requestedRateLimit: number;
}

export default function SPSelfServiceRegistration() {
    const router = useRouter();
    const { data: session, status: sessionStatus } = useSession();
    const [currentStep, setCurrentStep] = useState(1);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [registrationId, setRegistrationId] = useState<string | null>(null);

    const [formData, setFormData] = useState<SPFormData>({
        organizationName: '',
        organizationType: 'defense_contractor',
        country: '',
        website: '',
        contactName: '',
        contactEmail: '',
        contactPhone: '',
        applicationName: '',
        applicationDescription: '',
        redirectUris: [''],
        maxClassification: 'CONFIDENTIAL',
        requestedCOIs: [],
        requestedRateLimit: 60
    });

    // Auto-populate from session when authenticated
    useEffect(() => {
        if (session?.user) {
            const user = session.user as any;
            setFormData(prev => ({
                ...prev,
                contactName: user.name || '',
                contactEmail: user.email || '',
                country: user.countryOfAffiliation || '',
                organizationName: user.organization || prev.organizationName
            }));
            // Move to step 2 after authentication
            if (currentStep === 1) {
                setCurrentStep(2);
            }
        }
    }, [session, currentStep]);

    // Handle form field changes
    const handleChange = (field: keyof SPFormData, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    // Handle redirect URI changes
    const handleRedirectUriChange = (index: number, value: string) => {
        const newUris = [...formData.redirectUris];
        newUris[index] = value;
        setFormData(prev => ({ ...prev, redirectUris: newUris }));
    };

    const addRedirectUri = () => {
        setFormData(prev => ({ ...prev, redirectUris: [...prev.redirectUris, ''] }));
    };

    const removeRedirectUri = (index: number) => {
        if (formData.redirectUris.length > 1) {
            const newUris = formData.redirectUris.filter((_, i) => i !== index);
            setFormData(prev => ({ ...prev, redirectUris: newUris }));
        }
    };

    // Validate current step
    const validateStep = (): boolean => {
        setError(null);

        switch (currentStep) {
            case 2: // Organization
                if (!formData.organizationName) {
                    setError('Organization name is required');
                    return false;
                }
                if (!formData.country) {
                    setError('Country is required');
                    return false;
                }
                break;

            case 3: // Application
                if (!formData.applicationName) {
                    setError('Application name is required');
                    return false;
                }
                if (formData.redirectUris.length === 0 || !formData.redirectUris[0]) {
                    setError('At least one redirect URI is required');
                    return false;
                }
                // Validate URIs
                for (const uri of formData.redirectUris) {
                    if (uri && !uri.startsWith('https://') && !uri.startsWith('http://localhost')) {
                        setError('Redirect URIs must use HTTPS (except localhost for development)');
                        return false;
                    }
                }
                break;
        }

        return true;
    };

    // Handle next step
    const handleNext = () => {
        if (validateStep()) {
            setCurrentStep(prev => prev + 1);
        }
    };

    // Handle form submission
    const handleSubmit = async () => {
        setSubmitting(true);
        setError(null);

        try {
            const response = await fetch('/api/public/sp-registration', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    ...formData,
                    redirectUris: formData.redirectUris.filter(uri => uri.trim() !== ''),
                    submittedBy: session?.user?.email,
                    submittedAt: new Date().toISOString()
                })
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.message || 'Registration failed');
            }

            const data = await response.json();
            setRegistrationId(data.registrationId);
            setCurrentStep(5); // Move to submitted step

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Registration failed');
        } finally {
            setSubmitting(false);
        }
    };

    // Render step indicator
    const renderStepIndicator = () => (
        <div className="mb-8">
            <div className="relative flex justify-between">
                {REGISTRATION_STEPS.map((step, idx) => (
                    <div key={step.number} className="flex flex-col items-center z-10">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-300 ${
                            step.number < currentStep
                                ? 'bg-emerald-500 text-white'
                                : step.number === currentStep
                                ? 'bg-blue-600 text-white ring-4 ring-blue-200'
                                : 'bg-gray-200 text-gray-500'
                        }`}>
                            {step.number < currentStep ? (
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                            ) : (
                                step.number
                            )}
                        </div>
                        <div className="mt-2 text-center">
                            <p className={`text-xs font-semibold ${
                                step.number === currentStep ? 'text-blue-600' : 'text-gray-500'
                            }`}>
                                {step.title}
                            </p>
                        </div>
                    </div>
                ))}
                {/* Progress line */}
                <div className="absolute top-5 left-0 w-full h-0.5 bg-gray-200 -z-0">
                    <div
                        className="h-full bg-emerald-500 transition-all duration-500"
                        style={{ width: `${((currentStep - 1) / (REGISTRATION_STEPS.length - 1)) * 100}%` }}
                    />
                </div>
            </div>
        </div>
    );

    // Step 1: Authentication
    const renderAuthStep = () => (
        <div className="text-center py-12">
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Sign In to Register</h2>
            <p className="text-gray-600 mb-8 max-w-md mx-auto">
                To register your organization as a Service Provider, please sign in with your federated identity.
                Your organization details will be automatically populated from your credentials.
            </p>
            <button
                onClick={() => signIn('keycloak')}
                className="inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg hover:shadow-xl"
            >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
                Sign In with Federation IdP
            </button>
            <p className="mt-6 text-sm text-gray-500">
                Already registered?{' '}
                <Link href="/register/sp/status" className="text-blue-600 hover:underline">
                    Check registration status
                </Link>
            </p>
        </div>
    );

    // Step 2: Organization Details
    const renderOrgStep = () => (
        <div className="space-y-6">
            <div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">Organization Details</h2>
                <p className="text-gray-600">Verify and complete your organization information.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Organization Name <span className="text-red-500">*</span>
                    </label>
                    <input
                        type="text"
                        value={formData.organizationName}
                        onChange={(e) => handleChange('organizationName', e.target.value)}
                        placeholder="Lockheed Martin Corporation"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Organization Type <span className="text-red-500">*</span>
                    </label>
                    <select
                        value={formData.organizationType}
                        onChange={(e) => handleChange('organizationType', e.target.value)}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                        {ORG_TYPES.map(type => (
                            <option key={type.value} value={type.value}>{type.label}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Country <span className="text-red-500">*</span>
                    </label>
                    <select
                        value={formData.country}
                        onChange={(e) => handleChange('country', e.target.value)}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                        <option value="">Select country...</option>
                        {SP_COUNTRIES.map(country => (
                            <option key={country.code} value={country.code}>
                                {country.flag} {country.name}
                            </option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Website
                    </label>
                    <input
                        type="url"
                        value={formData.website}
                        onChange={(e) => handleChange('website', e.target.value)}
                        placeholder="https://www.example.com"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                </div>
            </div>

            <div className="border-t pt-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Technical Contact</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Contact Name
                        </label>
                        <input
                            type="text"
                            value={formData.contactName}
                            onChange={(e) => handleChange('contactName', e.target.value)}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Email <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="email"
                            value={formData.contactEmail}
                            onChange={(e) => handleChange('contactEmail', e.target.value)}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Phone
                        </label>
                        <input
                            type="tel"
                            value={formData.contactPhone}
                            onChange={(e) => handleChange('contactPhone', e.target.value)}
                            placeholder="+1 (555) 123-4567"
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                </div>
            </div>
        </div>
    );

    // Step 3: Application Configuration
    const renderAppStep = () => (
        <div className="space-y-6">
            <div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">Application Configuration</h2>
                <p className="text-gray-600">Configure your OAuth 2.0 client application.</p>
            </div>

            <div className="space-y-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Application Name <span className="text-red-500">*</span>
                    </label>
                    <input
                        type="text"
                        value={formData.applicationName}
                        onChange={(e) => handleChange('applicationName', e.target.value)}
                        placeholder="My Logistics Dashboard"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Description
                    </label>
                    <textarea
                        value={formData.applicationDescription}
                        onChange={(e) => handleChange('applicationDescription', e.target.value)}
                        rows={3}
                        placeholder="Describe what your application does..."
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Redirect URIs <span className="text-red-500">*</span>
                    </label>
                    <p className="text-xs text-gray-500 mb-2">
                        Where users will be redirected after authentication (must use HTTPS except localhost)
                    </p>
                    {formData.redirectUris.map((uri, index) => (
                        <div key={index} className="flex gap-2 mb-2">
                            <input
                                type="url"
                                value={uri}
                                onChange={(e) => handleRedirectUriChange(index, e.target.value)}
                                placeholder="https://app.example.com/callback"
                                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                            {formData.redirectUris.length > 1 && (
                                <button
                                    type="button"
                                    onClick={() => removeRedirectUri(index)}
                                    className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            )}
                        </div>
                    ))}
                    <button
                        type="button"
                        onClick={addRedirectUri}
                        className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                    >
                        + Add another redirect URI
                    </button>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Maximum Classification Level
                    </label>
                    <p className="text-xs text-gray-500 mb-2">
                        The highest classification your application will access
                    </p>
                    <div className="flex gap-4">
                        {MAX_CLASSIFICATIONS.map(level => (
                            <button
                                key={level.value}
                                type="button"
                                onClick={() => handleChange('maxClassification', level.value)}
                                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                                    formData.maxClassification === level.value
                                        ? `${level.color} ring-2 ring-offset-2 ring-blue-500`
                                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                            >
                                {level.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );

    // Step 4: Review
    const renderReviewStep = () => (
        <div className="space-y-6">
            <div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">Review Registration</h2>
                <p className="text-gray-600">Please review your registration details before submitting.</p>
            </div>

            <div className="bg-gray-50 rounded-xl p-6 space-y-6">
                <div>
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Organization</h3>
                    <dl className="grid grid-cols-2 gap-4">
                        <div>
                            <dt className="text-sm text-gray-500">Name</dt>
                            <dd className="font-medium text-gray-900">{formData.organizationName}</dd>
                        </div>
                        <div>
                            <dt className="text-sm text-gray-500">Type</dt>
                            <dd className="font-medium text-gray-900">
                                {ORG_TYPES.find(t => t.value === formData.organizationType)?.label}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-sm text-gray-500">Country</dt>
                            <dd className="font-medium text-gray-900">
                                {SP_COUNTRIES.find(c => c.code === formData.country)?.flag}{' '}
                                {SP_COUNTRIES.find(c => c.code === formData.country)?.name}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-sm text-gray-500">Contact</dt>
                            <dd className="font-medium text-gray-900">{formData.contactEmail}</dd>
                        </div>
                    </dl>
                </div>

                <div className="border-t pt-6">
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Application</h3>
                    <dl className="grid grid-cols-2 gap-4">
                        <div>
                            <dt className="text-sm text-gray-500">Name</dt>
                            <dd className="font-medium text-gray-900">{formData.applicationName}</dd>
                        </div>
                        <div>
                            <dt className="text-sm text-gray-500">Max Classification</dt>
                            <dd>
                                <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${
                                    MAX_CLASSIFICATIONS.find(c => c.value === formData.maxClassification)?.color
                                }`}>
                                    {formData.maxClassification}
                                </span>
                            </dd>
                        </div>
                        <div className="col-span-2">
                            <dt className="text-sm text-gray-500">Redirect URIs</dt>
                            <dd className="font-mono text-sm text-gray-900">
                                {formData.redirectUris.filter(u => u).map((uri, i) => (
                                    <div key={i}>{uri}</div>
                                ))}
                            </dd>
                        </div>
                    </dl>
                </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <div className="flex gap-3">
                    <svg className="w-6 h-6 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div>
                        <h4 className="font-semibold text-amber-800">Approval Required</h4>
                        <p className="text-sm text-amber-700 mt-1">
                            Your registration will be reviewed by a DIVE administrator. 
                            You will receive an email notification when your application is approved.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );

    // Step 5: Submitted
    const renderSubmittedStep = () => (
        <div className="text-center py-12">
            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Registration Submitted!</h2>
            <p className="text-gray-600 mb-6 max-w-md mx-auto">
                Your Service Provider registration has been submitted successfully.
                You will receive an email at <strong>{formData.contactEmail}</strong> when your application is approved.
            </p>

            {registrationId && (
                <div className="bg-gray-50 rounded-xl p-4 max-w-md mx-auto mb-8">
                    <p className="text-sm text-gray-500 mb-1">Registration ID</p>
                    <p className="font-mono text-lg font-bold text-gray-900">{registrationId}</p>
                </div>
            )}

            <div className="flex justify-center gap-4">
                <Link
                    href="/"
                    className="px-6 py-3 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors"
                >
                    Return Home
                </Link>
                <Link
                    href={`/register/sp/status?id=${registrationId}`}
                    className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                    Check Status
                </Link>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
            {/* Header */}
            <header className="bg-white/80 backdrop-blur-sm border-b border-gray-200">
                <div className="max-w-4xl mx-auto px-6 py-4">
                    <div className="flex items-center justify-between">
                        <Link href="/" className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
                                <span className="text-white font-bold text-lg">D</span>
                            </div>
                            <span className="font-bold text-xl text-gray-900">DIVE V3</span>
                        </Link>
                        {session?.user && (
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                                <span>Signed in as</span>
                                <span className="font-medium">{session.user.email}</span>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-4xl mx-auto px-6 py-8">
                <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
                    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-6">
                        <h1 className="text-2xl font-bold text-white">Service Provider Registration</h1>
                        <p className="text-blue-100 mt-1">
                            Register your organization to access DIVE V3 resources
                        </p>
                    </div>

                    <div className="p-8">
                        {renderStepIndicator()}

                        {/* Error Display */}
                        {error && (
                            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                                {error}
                            </div>
                        )}

                        {/* Step Content */}
                        {currentStep === 1 && renderAuthStep()}
                        {currentStep === 2 && renderOrgStep()}
                        {currentStep === 3 && renderAppStep()}
                        {currentStep === 4 && renderReviewStep()}
                        {currentStep === 5 && renderSubmittedStep()}

                        {/* Navigation Buttons */}
                        {currentStep > 1 && currentStep < 5 && (
                            <div className="mt-8 pt-6 border-t flex justify-between">
                                <button
                                    type="button"
                                    onClick={() => setCurrentStep(prev => prev - 1)}
                                    className="px-6 py-3 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    ← Back
                                </button>

                                {currentStep < 4 ? (
                                    <button
                                        type="button"
                                        onClick={handleNext}
                                        className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                                    >
                                        Continue →
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={handleSubmit}
                                        disabled={submitting}
                                        className="px-8 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold rounded-lg hover:from-emerald-700 hover:to-teal-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {submitting ? (
                                            <span className="flex items-center gap-2">
                                                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                                </svg>
                                                Submitting...
                                            </span>
                                        ) : (
                                            'Submit Registration'
                                        )}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}












