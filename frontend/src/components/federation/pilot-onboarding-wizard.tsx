'use client';

/**
 * Pilot Onboarding Wizard
 * 
 * Streamlined 3-step wizard for partner onboarding during pilot demos.
 * Demonstrates the frictionless approach to federation while
 * acknowledging STANAGs and ACP-240 compliance requirements.
 * 
 * P0 Fix (Jan 2025): Now actually creates IdP in Keycloak via backend API
 */

import React, { useState } from 'react';
import { useSession } from 'next-auth/react';
import { getFlagComponent } from '../ui/flags';

interface OnboardingStep {
  id: number;
  title: string;
  description: string;
}

const STEPS: OnboardingStep[] = [
  { 
    id: 1, 
    title: 'Partner Details', 
    description: 'Basic information about the partner organization' 
  },
  { 
    id: 2, 
    title: 'Technical Setup', 
    description: 'OIDC/SAML configuration and attribute mapping' 
  },
  { 
    id: 3, 
    title: 'Review & Activate', 
    description: 'Verify settings and enable federation' 
  },
];

// Pre-configured partners for pilot quick-add
const QUICK_ADD_PARTNERS = [
  { code: 'ITA', name: 'Italy', flag: 'ITA' },
  { code: 'ESP', name: 'Spain', flag: 'ESP' },
  { code: 'NLD', name: 'Netherlands', flag: 'NLD' },
  { code: 'POL', name: 'Poland', flag: 'POL' },
  { code: 'BEL', name: 'Belgium', flag: 'BEL' },
  { code: 'NOR', name: 'Norway', flag: 'NOR' },
];

interface PilotOnboardingWizardProps {
  instanceCode: string;
  onComplete?: (partnerCode: string) => void;
  onCancel?: () => void;
  className?: string;
}

export default function PilotOnboardingWizard({
  instanceCode,
  onComplete,
  onCancel,
  className = '',
}: PilotOnboardingWizardProps) {
  const { data: session } = useSession();
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedPartner, setSelectedPartner] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    organizationName: '',
    countryCode: '',
    adminEmail: '',
    federationType: 'oidc' as 'oidc' | 'saml',
    discoveryUrl: '',
    clientId: '',
    autoMapAttributes: true,
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const handleQuickAdd = (partnerCode: string) => {
    setSelectedPartner(partnerCode);
    const partner = QUICK_ADD_PARTNERS.find(p => p.code === partnerCode);
    if (partner) {
      setFormData(prev => ({
        ...prev,
        organizationName: `${partner.name} Ministry of Defense`,
        countryCode: partner.code,
        adminEmail: `admin@${partner.code.toLowerCase()}.dive-pilot.example`,
        discoveryUrl: `https://${partner.code.toLowerCase()}-idp.dive25.com/realms/dive-v3-broker/.well-known/openid-configuration`,
        clientId: `dive-v3-client-${partner.code.toLowerCase()}`,
      }));
      setCurrentStep(2); // Skip to technical setup
    }
  };
  
  const handleComplete = async () => {
    setIsProcessing(true);
    setError(null);
    
    try {
      // Validate session and token
      if (!session) {
        throw new Error('Authentication required. Please log in.');
      }
      
      const token = (session as any)?.accessToken;
      if (!token) {
        throw new Error('No access token available. Please log out and log in again.');
      }
      
      // Validate required fields
      if (!formData.countryCode || !formData.discoveryUrl) {
        throw new Error('Please complete all required fields.');
      }
      
      // Parse discovery URL to extract issuer
      let issuer: string;
      let authorizationUrl: string;
      let tokenUrl: string;
      let userInfoUrl: string;
      let jwksUrl: string;
      
      if (formData.federationType === 'oidc') {
        // Extract issuer from discovery URL
        issuer = formData.discoveryUrl.replace('/.well-known/openid-configuration', '').replace('/.well-known/openid-configuration/', '');
        authorizationUrl = `${issuer}/protocol/openid-connect/auth`;
        tokenUrl = `${issuer}/protocol/openid-connect/token`;
        userInfoUrl = `${issuer}/protocol/openid-connect/userinfo`;
        jwksUrl = `${issuer}/protocol/openid-connect/certs`;
      } else {
        // SAML - would need metadata URL parsing (simplified for now)
        throw new Error('SAML federation not yet supported in pilot wizard. Use full onboarding wizard.');
      }
      
      // Build OIDC configuration
      const oidcConfig = {
        issuer,
        authorizationUrl,
        tokenUrl,
        userInfoUrl,
        jwksUrl,
        clientId: formData.clientId || `dive-v3-client-${formData.countryCode.toLowerCase()}`,
        clientSecret: '', // Will be set via federation secret sync
        validateSignature: true,
        defaultScopes: 'openid profile email'
      };
      
      // Create attribute mappings if auto-map is enabled
      const attributeMappings = formData.autoMapAttributes ? {
        uniqueID: { claim: 'uniqueID', userAttribute: 'uniqueID' },
        clearance: { claim: 'clearance', userAttribute: 'clearance' },
        countryOfAffiliation: { claim: 'countryOfAffiliation', userAttribute: 'countryOfAffiliation' },
        acpCOI: { claim: 'acpCOI', userAttribute: 'acpCOI' }
      } : {
        uniqueID: { claim: 'sub', userAttribute: 'uniqueID' },
        clearance: { claim: 'clearance', userAttribute: 'clearance' },
        countryOfAffiliation: { claim: 'countryOfAffiliation', userAttribute: 'countryOfAffiliation' },
        acpCOI: { claim: 'acpCOI', userAttribute: 'acpCOI' }
      };
      
      // Build request body matching backend API format
      const requestBody = {
        alias: `${formData.countryCode.toLowerCase()}-federation`,
        displayName: `${formData.organizationName || formData.countryCode} Federation`,
        description: `Federation partner: ${formData.organizationName || formData.countryCode}`,
        protocol: formData.federationType,
        config: oidcConfig,
        attributeMappings
      };
      
      console.log('[Pilot] Creating federation partner:', {
        alias: requestBody.alias,
        displayName: requestBody.displayName,
        protocol: requestBody.protocol
      });
      
      // Call backend API
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
      const response = await fetch(`${backendUrl}/api/admin/idps`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(errorData.message || `Failed to create federation partner: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      console.log('[Pilot] Federation partner created successfully:', result);
      
      setIsProcessing(false);
      onComplete?.(selectedPartner || formData.countryCode);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to onboard federation partner';
      console.error('[Pilot] Onboarding failed:', err);
      setError(errorMessage);
      setIsProcessing(false);
    }
  };
  
  const renderStepIndicator = () => (
    <div className="flex items-center justify-between mb-8">
      {STEPS.map((step, index) => (
        <React.Fragment key={step.id}>
          <div className="flex items-center">
            <div 
              className={`
                w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                ${currentStep >= step.id 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-200 text-gray-600'
                }
                ${currentStep === step.id ? 'ring-2 ring-blue-300 ring-offset-2' : ''}
              `}
            >
              {currentStep > step.id ? '✓' : step.id}
            </div>
            <div className="ml-3 hidden sm:block">
              <div className={`text-sm font-medium ${currentStep >= step.id ? 'text-gray-900' : 'text-gray-500'}`}>
                {step.title}
              </div>
              <div className="text-xs text-gray-500">{step.description}</div>
            </div>
          </div>
          {index < STEPS.length - 1 && (
            <div className={`flex-1 h-0.5 mx-4 ${currentStep > step.id ? 'bg-blue-600' : 'bg-gray-200'}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
  
  const renderStep1 = () => (
    <div className="space-y-6">
      {/* Quick Add Section */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-3">Quick Add Partner</h4>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {QUICK_ADD_PARTNERS.map(partner => {
            const FlagIcon = getFlagComponent(partner.code);
            const isSelected = selectedPartner === partner.code;
            return (
              <button
                key={partner.code}
                onClick={() => handleQuickAdd(partner.code)}
                className={`
                  flex flex-col items-center p-3 rounded-lg border-2 transition-all
                  ${isSelected 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                  }
                `}
              >
                <FlagIcon size={32} />
                <span className="text-xs font-medium mt-1">{partner.code}</span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Pre-configured partners for instant demo setup
        </p>
      </div>
      
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="px-2 bg-white text-gray-500">or configure manually</span>
        </div>
      </div>
      
      {/* Manual Configuration */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Organization Name
          </label>
          <input
            type="text"
            value={formData.organizationName}
            onChange={e => setFormData(prev => ({ ...prev, organizationName: e.target.value }))}
            placeholder="e.g., Italy Ministry of Defense"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Country Code (ISO 3166-1 alpha-3)
          </label>
          <input
            type="text"
            value={formData.countryCode}
            onChange={e => setFormData(prev => ({ ...prev, countryCode: e.target.value.toUpperCase() }))}
            placeholder="e.g., ITA"
            maxLength={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 uppercase"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Admin Contact Email
          </label>
          <input
            type="email"
            value={formData.adminEmail}
            onChange={e => setFormData(prev => ({ ...prev, adminEmail: e.target.value }))}
            placeholder="admin@organization.gov"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>
    </div>
  );
  
  const renderStep2 = () => (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Federation Protocol
        </label>
        <div className="flex gap-4">
          {(['oidc', 'saml'] as const).map(type => (
            <button
              key={type}
              onClick={() => setFormData(prev => ({ ...prev, federationType: type }))}
              className={`
                flex-1 py-3 px-4 rounded-lg border-2 text-center transition-all
                ${formData.federationType === type 
                  ? 'border-blue-500 bg-blue-50' 
                  : 'border-gray-200 hover:border-blue-300'
                }
              `}
            >
              <div className="font-medium">{type.toUpperCase()}</div>
              <div className="text-xs text-gray-500">
                {type === 'oidc' ? 'OpenID Connect' : 'SAML 2.0'}
              </div>
            </button>
          ))}
        </div>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {formData.federationType === 'oidc' ? 'Discovery URL' : 'Metadata URL'}
        </label>
        <input
          type="url"
          value={formData.discoveryUrl}
          onChange={e => setFormData(prev => ({ ...prev, discoveryUrl: e.target.value }))}
          placeholder={formData.federationType === 'oidc' 
            ? 'https://idp.example.com/.well-known/openid-configuration'
            : 'https://idp.example.com/metadata.xml'
          }
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
      
      {formData.federationType === 'oidc' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Client ID
          </label>
          <input
            type="text"
            value={formData.clientId}
            onChange={e => setFormData(prev => ({ ...prev, clientId: e.target.value }))}
            placeholder="dive-v3-client"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      )}
      
      <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
        <input
          type="checkbox"
          id="autoMapAttributes"
          checked={formData.autoMapAttributes}
          onChange={e => setFormData(prev => ({ ...prev, autoMapAttributes: e.target.checked }))}
          className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
        />
        <label htmlFor="autoMapAttributes" className="text-sm text-gray-700">
          <span className="font-medium">Auto-map attributes</span>
          <span className="block text-xs text-gray-500">
            Automatically map clearance, countryOfAffiliation, and COI attributes
          </span>
        </label>
      </div>
      
      {/* Pilot Mode Notice */}
      <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg text-sm">
        <div className="flex items-center gap-2 font-medium text-purple-800">
          <div className="w-2 h-2 bg-purple-500 rounded-full" />
          Pilot Mode: Attribute Mapping
        </div>
        <p className="text-xs text-purple-600 mt-1">
          ACP-240 compliant attribute normalization will be applied automatically.
          Production deployments require manual review of attribute mappings.
        </p>
      </div>
    </div>
  );
  
  const renderStep3 = () => {
    const FlagIcon = getFlagComponent(selectedPartner || formData.countryCode || 'USA');
    
    return (
      <div className="space-y-6">
        <div className="p-4 bg-gray-50 rounded-lg">
          <h4 className="text-sm font-medium text-gray-700 mb-4">Configuration Summary</h4>
          
          <div className="flex items-center gap-4 mb-4 pb-4 border-b border-gray-200">
            <FlagIcon size={48} />
            <div>
              <div className="font-semibold text-gray-900">
                {formData.organizationName || 'New Partner Organization'}
              </div>
              <div className="text-sm text-gray-500">
                {selectedPartner || formData.countryCode} • {formData.federationType.toUpperCase()}
              </div>
            </div>
          </div>
          
          <dl className="grid grid-cols-1 gap-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Admin Contact</dt>
              <dd className="font-medium text-gray-900">{formData.adminEmail}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Discovery URL</dt>
              <dd className="font-medium text-gray-900 truncate max-w-xs">{formData.discoveryUrl}</dd>
            </div>
            {formData.clientId && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Client ID</dt>
                <dd className="font-medium text-gray-900">{formData.clientId}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-gray-500">Auto-map Attributes</dt>
              <dd className="font-medium text-gray-900">{formData.autoMapAttributes ? 'Yes' : 'No'}</dd>
            </div>
          </dl>
        </div>
        
        {/* Compliance Acknowledgment */}
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h4 className="text-sm font-medium text-blue-800 mb-2">Standards Compliance</h4>
          <ul className="text-xs text-blue-700 space-y-1">
            <li className="flex items-center gap-2">
              <span className="text-green-500">✓</span>
              ACP-240 attribute normalization enabled
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-500">✓</span>
              ISO 3166-1 alpha-3 country codes
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-500">✓</span>
              STANAG 4774/5636 labeling (acknowledged)
            </li>
          </ul>
          <p className="text-xs text-blue-600 mt-2 italic">
            Note: Full compliance validation deferred for pilot demonstration
          </p>
        </div>
        
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center gap-2 text-red-800">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-medium">Error</span>
            </div>
            <p className="text-sm text-red-700 mt-2">{error}</p>
          </div>
        )}
        
        {isProcessing && (
          <div className="flex items-center justify-center gap-3 py-4">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-gray-600">Configuring federation...</span>
          </div>
        )}
      </div>
    );
  };
  
  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return selectedPartner || (formData.organizationName && formData.countryCode);
      case 2:
        return formData.discoveryUrl && (formData.federationType === 'saml' || formData.clientId);
      case 3:
        return true;
      default:
        return false;
    }
  };
  
  return (
    <div className={`bg-white rounded-xl shadow-lg p-6 max-w-2xl mx-auto ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Add Federation Partner</h2>
          <p className="text-sm text-gray-500">Pilot Mode - Streamlined Onboarding</p>
        </div>
        <button 
          onClick={onCancel}
          className="text-gray-400 hover:text-gray-600"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      {/* Step Indicator */}
      {renderStepIndicator()}
      
      {/* Step Content */}
      <div className="mb-8">
        {currentStep === 1 && renderStep1()}
        {currentStep === 2 && renderStep2()}
        {currentStep === 3 && renderStep3()}
      </div>
      
      {/* Navigation */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-200">
        <button
          onClick={() => setCurrentStep(prev => Math.max(1, prev - 1))}
          disabled={currentStep === 1}
          className={`
            px-4 py-2 text-sm font-medium rounded-lg
            ${currentStep === 1 
              ? 'text-gray-300 cursor-not-allowed' 
              : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
            }
          `}
        >
          ← Back
        </button>
        
        {currentStep < 3 ? (
          <button
            onClick={() => setCurrentStep(prev => prev + 1)}
            disabled={!canProceed()}
            className={`
              px-6 py-2 text-sm font-medium rounded-lg
              ${canProceed()
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }
            `}
          >
            Continue →
          </button>
        ) : (
          <button
            onClick={handleComplete}
            disabled={isProcessing}
            className={`
              px-6 py-2 text-sm font-medium rounded-lg
              ${isProcessing
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-green-600 text-white hover:bg-green-700'
              }
            `}
          >
            {isProcessing ? 'Activating...' : 'Activate Partner'}
          </button>
        )}
      </div>
    </div>
  );
}





