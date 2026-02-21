/**
 * DIVE V3 SP Registry - New SP Registration Form
 * Multi-step form for registering external Service Providers
 */

'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import PageLayout from '@/components/layout/page-layout';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { spRegistrationSchema, type SPRegistrationFormData } from '@/lib/validations/sp-registry';
import { AVAILABLE_SCOPES, AVAILABLE_GRANT_TYPES, NATO_COUNTRIES, ORGANIZATION_TYPES } from '@/types/sp-federation.types';
import { InteractiveBreadcrumbs } from '@/components/ui/interactive-breadcrumbs';

export default function NewSPRegistrationPage() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(1);

  // Form handling with Zod validation
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
    setValue,
    getValues,
    trigger
  } = useForm<SPRegistrationFormData>({
    resolver: zodResolver(spRegistrationSchema) as any, // Type cast to resolve duplicate type issue
    mode: 'onChange', // Enable real-time validation
    defaultValues: {
      clientType: 'confidential',
      requirePKCE: true,
      allowedScopes: ['openid', 'profile', 'email'],
      allowedGrantTypes: ['authorization_code', 'refresh_token'],
      redirectUris: [''], // Start with one empty field
      attributeRequirements: {
        clearance: true,
        country: true,
        coi: false
      },
      rateLimit: {
        requestsPerMinute: 60,
        burstSize: 10,
        quotaPerDay: 10000
      }
    }
  });

  // Watch fields for dynamic updates
  const clientType = watch('clientType');
  const redirectUris = watch('redirectUris', ['']);

  // Validate current step before proceeding
  const validateStep = async (step: number): Promise<boolean> => {
    let fieldsToValidate: (keyof SPRegistrationFormData)[] = [];

    switch (step) {
      case 1: // Basic Information
        fieldsToValidate = ['name', 'organizationType', 'country', 'technicalContact'];
        break;
      case 2: // OAuth Configuration
        fieldsToValidate = ['clientType', 'redirectUris', 'tokenEndpointAuthMethod', 'allowedScopes', 'allowedGrantTypes'];
        break;
      case 3: // Authorization & Rate Limits
        fieldsToValidate = ['attributeRequirements', 'rateLimit'];
        break;
      default:
        return true;
    }

    const result = await trigger(fieldsToValidate);
    return result;
  };

  // Handle next button with validation
  const handleNext = async () => {
    const isValid = await validateStep(currentStep);
    if (isValid) {
      setCurrentStep(currentStep + 1);
    } else {
      // Show error message
      setError('Please fix the validation errors before proceeding');
      // Scroll to top to show errors
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Handle form submission
  const onSubmit = async (data: SPRegistrationFormData) => {
    try {
      setSubmitting(true);
      setError(null);

      const response = await fetch('/api/admin/sp-registry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to register SP');
      }

      const result = await response.json();
      
      // Show success and redirect to detail page
      router.push(`/admin/sp-registry/${result.spId}?registered=true`);
    } catch (err) {
      console.error('Registration error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  };

  // Redirect if not authenticated
  React.useEffect(() => {
    if (sessionStatus === 'unauthenticated') {
      router.push('/login');
    }
  }, [sessionStatus, router]);

  if (sessionStatus === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600"></div>
          <p className="mt-4 text-lg text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (sessionStatus === 'unauthenticated') {
    return null;
  }

  const totalSteps = 4;
  const stepTitles = [
    'Basic Information',
    'OAuth Configuration',
    'Authorization & Rate Limits',
    'Review & Submit'
  ];

  return (
    <PageLayout
      user={session?.user || {}}
    >
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 py-8">
        {/* Header */}
        <div className="mb-6 bg-white rounded-xl shadow-lg border border-slate-200 p-6">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            ➕ Register New Service Provider
          </h1>
          <p className="mt-2 text-slate-600">Complete the registration form to add a new external SP</p>
        </div>

        {/* Progress Bar */}
        <div className="mb-6 bg-white rounded-xl shadow-lg border border-slate-200 p-6">
          <div className="flex items-center justify-between">
            {stepTitles.map((title, index) => {
              const stepNumber = index + 1;
              const isActive = stepNumber === currentStep;
              const isCompleted = stepNumber < currentStep;

              return (
                <React.Fragment key={stepNumber}>
                  <div className="flex flex-col items-center flex-1">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all ${
                      isCompleted
                        ? 'bg-green-600 text-white'
                        : isActive
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-500'
                    }`}>
                      {isCompleted ? '✓' : stepNumber}
                    </div>
                    <div className={`mt-2 text-sm font-medium ${
                      isActive ? 'text-blue-600' : 'text-gray-500'
                    }`}>
                      {title}
                    </div>
                  </div>
                  {stepNumber < totalSteps && (
                    <div className={`flex-1 h-1 mx-4 rounded ${
                      stepNumber < currentStep ? 'bg-green-600' : 'bg-gray-200'
                    }`} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-8">
            {/* Error Message */}
            {error && (
              <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4">
                <p className="text-red-800 font-medium">❌ {error}</p>
              </div>
            )}

            {/* Step 1: Basic Information */}
            {currentStep === 1 && (
              <div className="space-y-6">
                <h2 className="text-2xl font-bold text-slate-800 mb-4">Basic Information</h2>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    SP Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    {...register('name')}
                    type="text"
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., France Defense Ministry"
                  />
                  {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Description
                  </label>
                  <textarea
                    {...register('description')}
                    rows={3}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Brief description of the organization..."
                  />
                  {errors.description && <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>}
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Organization Type <span className="text-red-500">*</span>
                    </label>
                    <select
                      {...register('organizationType')}
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Select type...</option>
                      {ORGANIZATION_TYPES.map(type => (
                        <option key={type.value} value={type.value}>{type.label}</option>
                      ))}
                    </select>
                    {errors.organizationType && <p className="mt-1 text-sm text-red-600">{errors.organizationType.message}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Country <span className="text-red-500">*</span>
                    </label>
                    <select
                      {...register('country')}
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Select country...</option>
                      {NATO_COUNTRIES.map(country => (
                        <option key={country.code} value={country.code}>{country.name} ({country.code})</option>
                      ))}
                    </select>
                    {errors.country && <p className="mt-1 text-sm text-red-600">{errors.country.message}</p>}
                  </div>
                </div>

                <h3 className="text-xl font-bold text-slate-800 mt-8 mb-4">Technical Contact</h3>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Contact Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    {...register('technicalContact.name')}
                    type="text"
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="John Doe"
                  />
                  {errors.technicalContact?.name && <p className="mt-1 text-sm text-red-600">{errors.technicalContact.name.message}</p>}
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      {...register('technicalContact.email')}
                      type="email"
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="john.doe@example.mil"
                    />
                    {errors.technicalContact?.email && <p className="mt-1 text-sm text-red-600">{errors.technicalContact.email.message}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Phone (optional)
                    </label>
                    <input
                      {...register('technicalContact.phone')}
                      type="tel"
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="+1234567890"
                    />
                    {errors.technicalContact?.phone && <p className="mt-1 text-sm text-red-600">{errors.technicalContact.phone.message}</p>}
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: OAuth Configuration */}
            {currentStep === 2 && (
              <div className="space-y-6">
                <h2 className="text-2xl font-bold text-slate-800 mb-4">OAuth Configuration</h2>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Client Type <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center space-x-2">
                      <input
                        {...register('clientType')}
                        type="radio"
                        value="confidential"
                        className="w-4 h-4 text-blue-600"
                      />
                      <span>Confidential (server-side)</span>
                    </label>
                    <label className="flex items-center space-x-2">
                      <input
                        {...register('clientType')}
                        type="radio"
                        value="public"
                        className="w-4 h-4 text-blue-600"
                      />
                      <span>Public (client-side)</span>
                    </label>
                  </div>
                  {errors.clientType && <p className="mt-1 text-sm text-red-600">{errors.clientType.message}</p>}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Redirect URIs <span className="text-red-500">*</span>
                  </label>
                  <p className="text-sm text-slate-500 mb-2">
                    Add at least one HTTPS redirect URI (e.g., https://your-app.example.mil/callback)
                  </p>
                  <div className="space-y-2">
                    {(redirectUris || ['']). map((_, index) => (
                      <div key={index} className="flex gap-2">
                        <input
                          {...register(`redirectUris.${index}` as any)}
                          type="url"
                          className={`flex-1 px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                            errors.redirectUris?.[index] ? 'border-red-500' : 'border-slate-300'
                          }`}
                          placeholder="https://your-sp.example.mil/callback"
                        />
                        {redirectUris.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              const currentUris = getValues('redirectUris') || [];
                              setValue('redirectUris', currentUris.filter((_, i) => i !== index));
                            }}
                            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                    {(redirectUris || []).map((_, index) => 
                      errors.redirectUris?.[index] && (
                        <p key={`error-${index}`} className="text-sm text-red-600">
                          Redirect URI {index + 1}: {errors.redirectUris[index]?.message}
                        </p>
                      )
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        const currentUris = getValues('redirectUris') || [];
                        setValue('redirectUris', [...currentUris, '']);
                      }}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      + Add Redirect URI
                    </button>
                  </div>
                  {errors.redirectUris && typeof errors.redirectUris.message === 'string' && (
                    <p className="mt-1 text-sm text-red-600">{errors.redirectUris.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    JWKS URI (optional, for JWT validation)
                  </label>
                  <input
                    {...register('jwksUri')}
                    type="url"
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="https://your-sp.example.mil/.well-known/jwks.json"
                  />
                  {errors.jwksUri && <p className="mt-1 text-sm text-red-600">{errors.jwksUri.message}</p>}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Token Endpoint Auth Method <span className="text-red-500">*</span>
                  </label>
                  <select
                    {...register('tokenEndpointAuthMethod')}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="client_secret_post">Client Secret (POST)</option>
                    <option value="client_secret_basic">Client Secret (Basic Auth)</option>
                    <option value="private_key_jwt">Private Key JWT</option>
                  </select>
                  {errors.tokenEndpointAuthMethod && <p className="mt-1 text-sm text-red-600">{errors.tokenEndpointAuthMethod.message}</p>}
                </div>

                <div>
                  <label className="flex items-center space-x-2">
                    <input
                      {...register('requirePKCE')}
                      type="checkbox"
                      className="w-4 h-4 text-blue-600"
                    />
                    <span className="text-sm font-semibold text-slate-700">Require PKCE (recommended)</span>
                  </label>
                </div>
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="mt-8 flex justify-between">
              <button
                type="button"
                onClick={() => currentStep > 1 && setCurrentStep(currentStep - 1)}
                disabled={currentStep === 1}
                className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                ← Previous
              </button>

              {currentStep < totalSteps ? (
                <button
                  type="button"
                  onClick={handleNext}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-all"
                >
                  Next →
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-semibold hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {submitting ? 'Registering...' : '✓ Register SP'}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </PageLayout>
  );
}
