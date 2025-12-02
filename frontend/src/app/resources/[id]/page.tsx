'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import PageLayout from '@/components/layout/page-layout';
import AccessDenied from '@/components/authz/access-denied';
import KASRequestModal from '@/components/ztdf/KASRequestModal';
import ContentViewer from '@/components/resources/content-viewer';
import KAOSelector from '@/components/ztdf/KAOSelector';
import { PolicyDecisionReplay } from '@/components/resources/policy-decision-replay';

// Get current instance from environment (FRA, USA, GBR, DEU)
// Used for instance-aware fallbacks in user attributes
const CURRENT_INSTANCE = process.env.NEXT_PUBLIC_INSTANCE || 'USA';

interface IResource {
  resourceId: string;
  title: string;
  classification: string;
  releasabilityTo: string[];
  COI: string[];
  encrypted: boolean;
  creationDate?: string;
  content?: string;
  displayMarking?: string;
  // ACP-240 Section 4.3: Classification Equivalency
  originalClassification?: string;
  originalCountry?: string;
  natoEquivalent?: string;
  ztdf?: {
    version: string;
    objectType: string;
    contentType: string;
    policyVersion: string;
    encryptionAlgorithm: string;
    kaoCount: number;
  };
  metadata?: {
    createdAt?: string;
    updatedAt?: string;
  };
}

interface IAuthzError {
  error: string;
  message: string;
  reason?: string;
  details?: {
    checks?: Record<string, boolean>;
    subject?: {
      uniqueID?: string;
      clearance?: string;
      country?: string;
      coi?: string[];
    };
    resource?: {
      resourceId?: string;
      title?: string;
      classification?: string;
      releasabilityTo?: string[];
      coi?: string[];
    };
  };
}

const classificationColors: Record<string, string> = {
  'UNCLASSIFIED': 'bg-green-100 text-green-800 border-green-300',
  'CONFIDENTIAL': 'bg-yellow-100 text-yellow-800 border-yellow-300',
  'SECRET': 'bg-orange-100 text-orange-800 border-orange-300',
  'TOP_SECRET': 'bg-red-100 text-red-800 border-red-300',
};

/**
 * Extract policy evaluation steps from backend error details
 */
function extractPolicyStepsFromDetails(details: any): Array<{
  rule: string;
  result: "PASS" | "FAIL";
  reason: string;
  attributes: string[];
}> {
  const steps: Array<{
    rule: string;
    result: "PASS" | "FAIL";
    reason: string;
    attributes: string[];
  }> = [];

  // Check if we have the new evaluation_details format from OPA
  if (details.checks) {
    // New format: parse individual check results
    const checks = details.checks;

    // Authentication check
    if (checks.authenticated !== undefined) {
      steps.push({
        rule: "is_not_authenticated",
        result: checks.authenticated ? "PASS" : "FAIL",
        reason: checks.authenticated
          ? "Subject is authenticated"
          : "Subject is not authenticated",
        attributes: ["subject.authenticated"]
      });
    }

    // Required attributes check
    if (checks.required_attributes !== undefined) {
      steps.push({
        rule: "is_missing_required_attributes",
        result: checks.required_attributes ? "PASS" : "FAIL",
        reason: checks.required_attributes
          ? "All required attributes are present and valid"
          : "Missing or invalid required attributes",
        attributes: ["subject.uniqueID", "subject.clearance", "subject.countryOfAffiliation", "resource.classification", "resource.releasabilityTo"]
      });
    }

    // Clearance check
    if (checks.clearance_sufficient !== undefined) {
      steps.push({
        rule: "is_insufficient_clearance",
        result: checks.clearance_sufficient ? "PASS" : "FAIL",
        reason: checks.clearance_sufficient
          ? "User clearance meets or exceeds resource classification"
          : "User clearance is insufficient for resource classification",
        attributes: ["subject.clearance", "resource.classification"]
      });
    }

    // Country releasability check
    if (checks.country_releasable !== undefined) {
      steps.push({
        rule: "is_not_releasable_to_country",
        result: checks.country_releasable ? "PASS" : "FAIL",
        reason: checks.country_releasable
          ? "User country is in resource releasability list"
          : "User country is not authorized for this resource",
        attributes: ["subject.countryOfAffiliation", "resource.releasabilityTo"]
      });
    }

    // COI check
    if (checks.coi_satisfied !== undefined) {
      steps.push({
        rule: "is_coi_violation",
        result: checks.coi_satisfied ? "PASS" : "FAIL",
        reason: checks.coi_satisfied
          ? "User COI matches resource requirements"
          : "User does not have required COI membership",
        attributes: ["subject.acpCOI", "resource.COI"]
      });
    }

    // Embargo check
    if (checks.embargo_passed !== undefined) {
      steps.push({
        rule: "is_under_embargo",
        result: checks.embargo_passed ? "PASS" : "FAIL",
        reason: checks.embargo_passed
          ? "Resource embargo period has expired"
          : "Resource is under embargo and cannot be accessed",
        attributes: ["resource.creationDate", "context.currentTime"]
      });
    }

    // ZTDF integrity check
    if (checks.ztdf_integrity_valid !== undefined) {
      steps.push({
        rule: "is_ztdf_integrity_violation",
        result: checks.ztdf_integrity_valid ? "PASS" : "FAIL",
        reason: checks.ztdf_integrity_valid
          ? "ZTDF integrity validation passed (STANAG 4778 compliant)"
          : "ZTDF integrity validation failed (cryptographic binding compromised)",
        attributes: ["resource.ztdf.policyHash", "resource.ztdf.payloadHash"]
      });
    }

    // Authentication strength check
    if (checks.authentication_strength_sufficient !== undefined) {
      steps.push({
        rule: "is_authentication_strength_insufficient",
        result: checks.authentication_strength_sufficient ? "PASS" : "FAIL",
        reason: checks.authentication_strength_sufficient
          ? "Authentication strength meets AAL2 requirements"
          : "Authentication strength insufficient for classified resource (AAL2 required)",
        attributes: ["context.acr", "context.amr", "resource.classification"]
      });
    }

    // MFA verification check
    if (checks.mfa_verified !== undefined) {
      steps.push({
        rule: "is_mfa_not_verified",
        result: checks.mfa_verified ? "PASS" : "FAIL",
        reason: checks.mfa_verified
          ? "Multi-factor authentication verified"
          : "Multi-factor authentication required but not verified",
        attributes: ["context.amr", "resource.classification"]
      });
    }

  } else {
    // Legacy format: fallback to old parsing logic
    // Check clearance
    if (details.clearance_check !== undefined) {
      steps.push({
        rule: "is_insufficient_clearance",
        result: details.clearance_check ? "PASS" : "FAIL",
        reason: details.clearance_check
          ? "User clearance meets or exceeds resource classification"
          : "User clearance is insufficient for resource classification",
        attributes: ["subject.clearance", "resource.classification"]
      });
    }

    // Check releasability
    if (details.releasability_check !== undefined) {
      steps.push({
        rule: "is_not_releasable_to_country",
        result: details.releasability_check ? "PASS" : "FAIL",
        reason: details.releasability_check
          ? "User country is in resource releasability list"
          : "User country is not authorized for this resource",
        attributes: ["subject.countryOfAffiliation", "resource.releasabilityTo"]
      });
    }

    // Check COI
    if (details.coi_check !== undefined) {
      steps.push({
        rule: "is_coi_violation",
        result: details.coi_check ? "PASS" : "FAIL",
        reason: details.coi_check
          ? "User COI matches resource requirements"
          : "User does not have required COI membership",
        attributes: ["subject.acpCOI", "resource.COI"]
      });
    }

    // Check embargo
    if (details.embargo_check !== undefined) {
      steps.push({
        rule: "is_under_embargo",
        result: details.embargo_check ? "PASS" : "FAIL",
        reason: details.embargo_check
          ? "Resource embargo period has expired"
          : "Resource is under embargo and cannot be accessed",
        attributes: ["resource.creationDate", "context.currentTime"]
      });
    }
  }

  // If no specific checks found, return empty array
  // The calling code will handle generating appropriate steps based on access decision
  return steps;
}

export default function ResourceDetailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const resourceId = params?.id as string;

  const [resource, setResource] = useState<IResource | null>(null);
  const [error, setError] = useState<IAuthzError | null>(null);
  const [loading, setLoading] = useState(true);
  const [showKASModal, setShowKASModal] = useState(false);
  const [decryptedContent, setDecryptedContent] = useState<string | null>(null);
  const [kasError, setKasError] = useState<string | null>(null);
  const [kaoId, setKaoId] = useState<string>('');
  const [suggestedResources, setSuggestedResources] = useState<IResource[]>([]);
  const [kaos, setKaos] = useState<any[]>([]);
  const [selectedKaoId, setSelectedKaoId] = useState<string>('');
  const [policyEvaluation, setPolicyEvaluation] = useState<{
    decision: "ALLOW" | "DENY";
    steps: Array<{
      rule: string;
      result: "PASS" | "FAIL";
      reason: string;
      attributes: string[];
    }>;
    subjectAttributes?: {
      clearance?: string;
      countryOfAffiliation?: string;
      acpCOI?: string[];
    };
    resourceAttributes?: {
      classification?: string;
      releasabilityTo?: string[];
      COI?: string[];
    };
  } | null>(null);

  // Check sessionStorage for decrypted content on mount
  useEffect(() => {
    if (resourceId) {
      const cached = sessionStorage.getItem(`decrypted-${resourceId}`);
      if (cached) {
        setDecryptedContent(cached);
      }
    }
  }, [resourceId]);

  // Redirect to login if not authenticated (separate effect to avoid render-phase updates)
  useEffect(() => {
    if (status !== 'loading' && !session) {
      router.push('/login');
    }
  }, [status, session, router]);

  useEffect(() => {
    if (status === 'loading') return;
    
    if (!session) {
      return;
    }

    async function fetchResource() {
      try {
        // Call server-side API route (NO client-side tokens!)
        const response = await fetch(`/api/resources/${resourceId}`, {
          method: 'GET',
          cache: 'no-store',
        });

        if (!response.ok) {
          const errorData = await response.json();
          setError(errorData);
          setResource(null);

          // Extract policy evaluation data from denial response
          const evalDetails = errorData.details?.evaluation_details || errorData.details;
          const steps = extractPolicyStepsFromDetails(evalDetails || {});
          
          // If no steps extracted but we have a denial, create a fallback denial step
          const finalSteps = steps.length > 0 ? steps : [
            {
              rule: "authorization_check",
              result: "FAIL" as const,
              reason: errorData.details?.reason || errorData.message || "Authorization denied",
              attributes: ["subject", "resource", "context"]
            }
          ];
          
          setPolicyEvaluation({
            decision: "DENY",
            steps: finalSteps,
            subjectAttributes: {
              clearance: errorData.details?.subject?.clearance,
              countryOfAffiliation: errorData.details?.subject?.country,
              acpCOI: errorData.details?.subject?.coi
            },
            resourceAttributes: {
              classification: errorData.details?.resource?.classification,
              releasabilityTo: errorData.details?.resource?.releasabilityTo,
              COI: errorData.details?.resource?.coi
            }
          });

          // Fetch suggested resources when access denied
          fetchSuggestedResources();
        } else {
          const data = await response.json();
          setResource(data);
          setError(null);

          // Use real policy evaluation data from backend if available
          if (data.policyEvaluation?.evaluation_details) {
            const steps = extractPolicyStepsFromDetails(data.policyEvaluation.evaluation_details);
            
            // If no steps were extracted but access was granted, create fallback steps
            const finalSteps = steps.length > 0 ? steps : [
              {
                rule: "is_not_authenticated",
                result: "PASS" as const,
                reason: "Subject is authenticated",
                attributes: ["subject.authenticated"]
              },
              {
                rule: "is_insufficient_clearance",
                result: "PASS" as const,
                reason: `User clearance (${data.policyEvaluation.subject?.clearance || session?.user?.clearance}) meets requirement`,
                attributes: ["subject.clearance", "resource.classification"]
              },
              {
                rule: "is_not_releasable_to_country",
                result: "PASS" as const,
                reason: `User country (${data.policyEvaluation.subject?.country || session?.user?.countryOfAffiliation}) authorized`,
                attributes: ["subject.countryOfAffiliation", "resource.releasabilityTo"]
              },
              {
                rule: "is_coi_violation",
                result: "PASS" as const,
                reason: "COI requirements satisfied",
                attributes: ["subject.acpCOI", "resource.COI"]
              }
            ];
            
            setPolicyEvaluation({
              decision: "ALLOW",
              steps: finalSteps,
              subjectAttributes: {
                clearance: data.policyEvaluation.subject?.clearance,
                countryOfAffiliation: data.policyEvaluation.subject?.country,
                acpCOI: data.policyEvaluation.subject?.coi
              },
              resourceAttributes: {
                classification: data.policyEvaluation.resource?.classification,
                releasabilityTo: data.policyEvaluation.resource?.releasabilityTo,
                COI: data.policyEvaluation.resource?.coi
              }
            });
          } else if (data.policyEvaluation) {
            // policyEvaluation exists but no evaluation_details - use fallback steps
            setPolicyEvaluation({
              decision: "ALLOW",
              steps: [
                {
                  rule: "is_not_authenticated",
                  result: "PASS" as const,
                  reason: "Subject is authenticated",
                  attributes: ["subject.authenticated"]
                },
                {
                  rule: "authorization_check",
                  result: "PASS" as const,
                  reason: data.policyEvaluation.reason || "Access granted by policy",
                  attributes: ["subject", "resource", "context"]
                }
              ],
              subjectAttributes: {
                clearance: data.policyEvaluation.subject?.clearance || session?.user?.clearance,
                countryOfAffiliation: data.policyEvaluation.subject?.country || session?.user?.countryOfAffiliation,
                acpCOI: data.policyEvaluation.subject?.coi || (session?.user as any)?.acpCOI
              },
              resourceAttributes: {
                classification: data.policyEvaluation.resource?.classification || data.classification,
                releasabilityTo: data.policyEvaluation.resource?.releasabilityTo || data.releasabilityTo,
                COI: data.policyEvaluation.resource?.coi || data.COI
              }
            });
          } else {
            // Fallback to mock data if backend doesn't provide policy evaluation
            const mockSteps = [
              {
                rule: "is_not_authenticated",
                result: "PASS" as const,
                reason: "Subject is authenticated",
                attributes: ["subject.authenticated"]
              },
              {
                rule: "is_insufficient_clearance",
                result: "PASS" as const,
                reason: `User clearance (${session?.user?.clearance}) >= resource classification (${data.classification})`,
                attributes: ["subject.clearance", "resource.classification"]
              },
              {
                rule: "is_not_releasable_to_country",
                result: "PASS" as const,
                reason: `User country (${session?.user?.countryOfAffiliation}) in resource releasabilityTo (${data.releasabilityTo?.join(', ')})`,
                attributes: ["subject.countryOfAffiliation", "resource.releasabilityTo"]
              },
              {
                rule: "is_coi_violation",
                result: "PASS" as const,
                reason: data.COI?.length > 0
                  ? `User COI intersects resource COI: ${data.COI.join(', ')}`
                  : "No COI requirements for this resource",
                attributes: ["subject.acpCOI", "resource.COI"]
              }
            ];

            setPolicyEvaluation({
              decision: "ALLOW",
              steps: mockSteps,
              subjectAttributes: {
                clearance: session?.user?.clearance,
                countryOfAffiliation: session?.user?.countryOfAffiliation,
                acpCOI: (session?.user as any)?.acpCOI
              },
              resourceAttributes: {
                classification: data.classification,
                releasabilityTo: data.releasabilityTo,
                COI: data.COI
              }
            });
          }
        }
      } catch (err) {
        setError({
          error: 'Network Error',
          message: 'Failed to fetch resource',
          reason: err instanceof Error ? err.message : 'Unknown error',
        });
        setResource(null);
      } finally {
        setLoading(false);
      }
    }

    async function fetchSuggestedResources() {
      // Fetch resources that user might be able to access (via API route)
      try {
        const response = await fetch('/api/resources', {
          method: 'GET',
          cache: 'no-store',
        });

        if (response.ok) {
          const data = await response.json();
          const allResources = data.resources || [];
          
          // Simple filtering: resources releasable to user's country
          const userCountry = session?.user?.countryOfAffiliation;
          const userClearance = session?.user?.clearance;
          const userCOI = session?.user?.acpCOI || [];
          
          // CRITICAL: RESTRICTED is now a separate level above UNCLASSIFIED
          const clearanceOrder: Record<string, number> = {
            'UNCLASSIFIED': 0,
            'RESTRICTED': 0.5,
            'CONFIDENTIAL': 1,
            'SECRET': 2,
            'TOP_SECRET': 3,
          };

          const suggested = allResources
            .filter((r: IResource) => {
              // Check clearance
              const userLevel = (userClearance ? clearanceOrder[userClearance] : null) || 0;
              const resourceLevel = clearanceOrder[r.classification] || 0;
              const clearanceOk = userLevel >= resourceLevel;
              
              // Check country
              const countryOk = userCountry && r.releasabilityTo.includes(userCountry);
              
              // Check COI (optional)
              const coiOk = r.COI.length === 0 || r.COI.some(coi => userCOI.includes(coi));
              
              // Different from current resource
              const notCurrent = r.resourceId !== resourceId;
              
              return clearanceOk && countryOk && coiOk && notCurrent;
            })
            .slice(0, 5); // Top 5 suggestions
          
          setSuggestedResources(suggested);
        }
      } catch (err) {
        console.error('Failed to fetch suggested resources:', err);
      }
    }

    fetchResource();
  }, [session, status, resourceId, router]);

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading resource...</p>
        </div>
      </div>
    );
  }

  // Get resource metadata from error for AccessDenied component
  // Backend now provides complete resource metadata in error response
  const resourceMetadata = error ? {
    resourceId: error.details?.resource?.resourceId || resourceId,
    title: error.details?.resource?.title || 'Resource',
    classification: error.details?.resource?.classification || 'UNKNOWN',
    releasabilityTo: error.details?.resource?.releasabilityTo || [],
    COI: error.details?.resource?.coi || [],
  } : null;

  const userCountry = (session as any)?.user?.countryOfAffiliation;

  return (
    <PageLayout
      user={session?.user || {}}
      breadcrumbs={[
        { label: 'Resources', href: '/resources' },
        { label: resourceId, href: null }
      ]}
      maxWidth="5xl"
    >
      {error && resourceMetadata ? (
        // ============================================
        // ACCESS DENIED VIEW (Using new component)
        // ============================================
        <AccessDenied
          resource={resourceMetadata}
          denial={error}
          userCountry={userCountry}
          suggestedResources={suggestedResources.map(r => ({
            resourceId: r.resourceId,
            title: r.title,
            classification: r.classification,
            releasabilityTo: r.releasabilityTo,
          }))}
        />
          ) : resource ? (
            // ============================================
            // ACCESS GRANTED VIEW
            // ============================================
            <div className="space-y-6">
              {/* Access Granted - Now at the top */}
              <div className="bg-green-50 border-2 border-green-300 rounded-lg p-6">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <svg
                      className="h-8 w-8 text-green-600"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <div className="ml-4 flex-1">
                    <h2 className="text-2xl font-bold text-green-900 mb-2">
                      ✅ Access Granted
                    </h2>
                    <p className="text-green-800">
                      You have successfully accessed this classified document.
                    </p>
                  </div>
                </div>
              </div>

              {/* 2-Column Layout: Policy Evaluation (Left) + Zero Trust Data Format (Right) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column: Policy Evaluation */}
                <div className="space-y-4">
                  {policyEvaluation && (
                    <PolicyDecisionReplay
                      decision={policyEvaluation.decision}
                      steps={policyEvaluation.steps}
                      isEncrypted={resource?.encrypted || false}
                      subjectAttributes={policyEvaluation.subjectAttributes}
                      resourceAttributes={policyEvaluation.resourceAttributes}
                    />
                  )}
                </div>

                {/* Right Column: STANAG-4774 + Zero Trust Data Format */}
                <div className="space-y-4">
                  {/* STANAG-4774 Display Marking */}
                  {resource.displayMarking && (
                    <div className="bg-gray-50 border-2 border-gray-300 rounded-lg p-4 sm:p-6">
                      <div className="text-center">
                        <h3 className="text-lg font-bold text-gray-900 mb-4">
                          STANAG-4774 Display Marking
                        </h3>
                        <p className="text-xl sm:text-2xl font-bold text-gray-900 font-mono bg-white px-4 py-3 rounded border border-gray-300 mb-4">
                          {resource.displayMarking}
                        </p>

                        {/* Dual-format classification display (ACP-240 Section 4.3) */}
                        {resource.originalClassification && resource.originalCountry && (
                          <div className="mt-4 pt-4 border-t border-gray-300">
                            <p className="text-sm font-medium text-blue-600 uppercase mb-2">Classification Equivalency</p>
                            <div className="flex items-center justify-center gap-2 flex-wrap mb-3">
                              <span className="inline-flex items-center px-3 py-1 rounded-md bg-blue-100 text-blue-900 text-sm font-bold border border-blue-300">
                                {resource.originalClassification} ({resource.originalCountry})
                              </span>
                              <span className="text-gray-400 font-bold">≈</span>
                              <span className="inline-flex items-center px-3 py-1 rounded-md bg-green-100 text-green-900 text-sm font-bold border border-green-300">
                                {resource.natoEquivalent || resource.classification} (NATO)
                              </span>
                            </div>
                            <p className="text-xs text-gray-600">
                              Original: <strong>{resource.originalClassification}</strong> from {resource.originalCountry} •
                              NATO Equivalent: <strong>{resource.natoEquivalent || resource.classification}</strong>
                            </p>
                          </div>
                        )}

                        <div className="mt-4 text-xs text-gray-600 text-center">
                          <p>🔒 Must appear on all</p>
                          <p>extractions & copies</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Zero Trust Data Format */}
                  {resource.ztdf && (
                    <div className="bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 border-2 border-purple-300 rounded-xl p-4 sm:p-6 shadow-lg">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center space-x-3">
                          <div className="flex-shrink-0 relative">
                            <div className="absolute inset-0 bg-purple-400 rounded-full blur-md opacity-50 animate-pulse"></div>
                            <div className="relative w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-purple-600 to-blue-600 rounded-full flex items-center justify-center">
                              <svg className="h-6 w-6 sm:h-7 sm:w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                              </svg>
                            </div>
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="text-lg sm:text-xl font-bold text-gray-900">Zero Trust Data Format</h3>
                              <span className="inline-flex items-center px-2 sm:px-3 py-1 rounded-full text-xs font-bold bg-purple-600 text-white animate-pulse">
                                🔐 KAS Protected
                              </span>
                            </div>
                            <p className="text-xs sm:text-sm text-gray-700 font-medium">Policy-bound encryption • Key Access Service mediation required</p>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-4">
                        <div className="bg-white rounded-lg p-2 sm:p-3 border border-blue-200">
                          <dt className="text-xs font-medium text-gray-500 mb-1">ZTDF Version</dt>
                          <dd className="text-base sm:text-lg font-bold text-gray-900">{resource.ztdf?.version || 'N/A'}</dd>
                        </div>
                        <div className="bg-white rounded-lg p-2 sm:p-3 border border-blue-200">
                          <dt className="text-xs font-medium text-gray-500 mb-1">Encryption</dt>
                          <dd className="text-xs sm:text-sm font-semibold text-gray-900">{resource.ztdf?.encryptionAlgorithm || 'N/A'}</dd>
                        </div>
                        <div className="bg-white rounded-lg p-2 sm:p-3 border border-blue-200">
                          <dt className="text-xs font-medium text-gray-500 mb-1">Key Access Objects</dt>
                          <dd className="text-base sm:text-lg font-bold text-gray-900">{resource.ztdf?.kaoCount || 0}</dd>
                        </div>
                        <div className="bg-white rounded-lg p-2 sm:p-3 border border-blue-200">
                          <dt className="text-xs font-medium text-gray-500 mb-1">Content Type</dt>
                          <dd className="text-xs sm:text-sm font-semibold text-gray-900">{resource.ztdf?.contentType || 'N/A'}</dd>
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-4">
                        <Link
                          href={`/resources/${resourceId}/ztdf`}
                          className="flex-1 inline-flex items-center justify-center px-4 py-2 border-2 border-purple-300 shadow-md text-sm font-bold rounded-lg text-purple-700 bg-white hover:bg-purple-50 hover:border-purple-400 transition-all hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
                        >
                          <svg className="h-4 w-4 sm:h-5 sm:w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <span className="hidden sm:inline">View ZTDF Details</span>
                          <span className="sm:hidden">Details</span>
                        </Link>
                        <a
                          href={`/api/resources/${resourceId}/download`}
                          download={`${resourceId}.ztdf`}
                          className="flex-1 inline-flex items-center justify-center px-4 py-2 border-2 border-green-300 shadow-md text-sm font-bold rounded-lg text-green-700 bg-white hover:bg-green-50 hover:border-green-400 transition-all hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                          title="Download as OpenTDF-compliant ZIP file"
                        >
                          <svg className="h-4 w-4 sm:h-5 sm:w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          <span className="hidden sm:inline">Download ZTDF File</span>
                          <span className="sm:hidden">Download</span>
                        </a>
                      </div>

                      <div className="flex items-start space-x-2 text-xs text-blue-800">
                        <svg className="h-4 w-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                        <p className="text-xs leading-relaxed">
                          This resource is protected using ZTDF (ACP-240 compliant). Security policy is embedded and travels
                          with the data. Cryptographic integrity ensures tamper detection (STANAG 4778).
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>


              <div className="bg-white shadow rounded-lg overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <h1 className="text-2xl font-bold text-gray-900">{resource.title}</h1>
                      <p className="text-sm text-gray-600 mt-1 font-mono">
                        {resource.resourceId}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span
                        className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-bold border-2 ${
                          classificationColors[resource.classification] || 'bg-gray-100 text-gray-800 border-gray-300'
                        }`}
                      >
                        {resource.classification}
                      </span>
                      {/* Show original classification if different (ACP-240 Section 4.3) */}
                      {resource.originalClassification && resource.originalClassification !== resource.classification && (
                        <span className="text-xs text-gray-600 font-semibold">
                          Original: {resource.originalClassification} ({resource.originalCountry})
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                  <dl className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <dt className="font-medium text-gray-500 mb-1">Releasable To</dt>
                      <dd className="font-mono text-gray-900">
                        {resource.releasabilityTo.join(', ')}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-gray-500 mb-1">Communities of Interest</dt>
                      <dd className="font-mono text-gray-900">
                        {resource.COI && resource.COI.length > 0 ? resource.COI.join(', ') : 'None'}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-gray-500 mb-1">Encryption Status</dt>
                      <dd className="font-mono text-gray-900">
                        {resource.encrypted ? '🔐 Encrypted' : '📄 Plaintext'}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="px-6 py-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Document Content</h3>
                  
                  {/* Show decrypted content if available */}
                  {decryptedContent ? (
                    <div className="space-y-4">
                      <div className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300 rounded-xl shadow-sm">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 text-green-800">
                            <div className="flex-shrink-0 w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                              <span className="text-2xl">✅</span>
                            </div>
                            <div>
                              <span className="font-bold block text-lg">Content Decrypted Successfully</span>
                              <span className="text-sm text-green-700">
                                KAS released decryption key • Content cached for this session
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              sessionStorage.removeItem(`decrypted-${resourceId}`);
                              sessionStorage.removeItem(`kas-flow-${resourceId}`);
                              setDecryptedContent(null);
                            }}
                            className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-all hover:shadow-lg flex items-center gap-2"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            Clear Cache
                          </button>
                        </div>
                      </div>
                      
                      {/* Modern Content Viewer */}
                      <ContentViewer
                        content={decryptedContent}
                        contentType={resource.ztdf?.contentType || 'text/plain'}
                        title={resource.title}
                        resourceId={resource.resourceId}
                        classification={resource.classification}
                      />
                    </div>
                  ) : resource.encrypted && !decryptedContent ? (
                    /* Show KAS request interface for encrypted resources */
                    <div className="space-y-6">
                      {/* Fetch KAOs if not already loaded */}
                      {kaos.length === 0 && (
                        <div className="text-center py-6">
                          <button
                            onClick={async () => {
                              try {
                                // Use server-side API route (NO client tokens!)
                                const ztdfResponse = await fetch(`/api/resources/${resourceId}/ztdf`, {
                                  method: 'GET',
                                  cache: 'no-store',
                                });
                                
                                if (ztdfResponse.ok) {
                                  const ztdfData = await ztdfResponse.json();
                                  const fetchedKaos = ztdfData.ztdfDetails?.payload?.keyAccessObjects || [];
                                  setKaos(fetchedKaos);
                                  if (fetchedKaos.length > 0) {
                                    setSelectedKaoId(fetchedKaos[0].kaoId);
                                  }
                                } else {
                                  setKasError('Failed to fetch ZTDF details');
                                }
                              } catch (err) {
                                setKasError('Failed to fetch ZTDF details');
                              }
                            }}
                            className="group inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-purple-600 via-blue-600 to-indigo-600 text-white rounded-xl hover:from-purple-700 hover:via-blue-700 hover:to-indigo-700 transition-all font-bold text-lg shadow-2xl hover:shadow-purple-500/50 hover:scale-105 transform"
                          >
                            <svg className="w-6 h-6 group-hover:rotate-12 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                            </svg>
                            <span>View Decryption Options</span>
                          </button>
                          <p className="mt-4 text-sm text-gray-600">
                            🔐 This content is encrypted with KAS protection
                          </p>
                        </div>
                      )}
                      
                      {/* KAO Selector */}
                      {kaos.length > 0 && (
                        <>
                          <KAOSelector
                            kaos={kaos}
                            selectedKaoId={selectedKaoId}
                            onSelect={setSelectedKaoId}
                            userCountry={session?.user?.countryOfAffiliation || CURRENT_INSTANCE}
                            userCOI={(session?.user as any)?.acpCOI || []}
                            userClearance={session?.user?.clearance || 'UNCLASSIFIED'}
                          />
                          
                          {/* KAS Error Display */}
                          {kasError && (
                            <div className="p-5 bg-red-50 border-2 border-red-300 rounded-xl shadow-lg">
                              <div className="flex items-center gap-3">
                                <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                                  <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                </div>
                                <div className="text-left">
                                  <p className="text-red-900 font-bold mb-1">Access Denied</p>
                                  <p className="text-red-700 text-sm">{kasError}</p>
                                </div>
                              </div>
                            </div>
                          )}
                          
                          {/* Request Key Button */}
                          <div className="text-center">
                            <button
                              onClick={() => {
                                setKasError(null);
                                setKaoId(selectedKaoId);
                                setShowKASModal(true);
                              }}
                              disabled={!selectedKaoId}
                              className={`group inline-flex items-center gap-3 px-8 py-4 rounded-xl transition-all font-bold text-lg shadow-2xl transform ${
                                selectedKaoId
                                  ? 'bg-gradient-to-r from-purple-600 via-blue-600 to-indigo-600 text-white hover:from-purple-700 hover:via-blue-700 hover:to-indigo-700 hover:shadow-purple-500/50 hover:scale-105'
                                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                              }`}
                            >
                              <svg className="w-6 h-6 group-hover:rotate-12 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                              </svg>
                              <span>Request Decryption Key</span>
                              <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                              </svg>
                            </button>
                            <p className="mt-4 text-xs text-gray-500">
                              Protected by ACP-240 policy enforcement • Real-time authorization checks
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  ) : resource.content ? (
                    /* Show regular content */
                    <div className="prose prose-sm max-w-none">
                      <p className="whitespace-pre-wrap text-gray-700">{resource.content}</p>
                    </div>
                  ) : (
                    <p className="text-gray-500 italic">No content available</p>
                  )}
                </div>

                {resource.metadata && (
                  <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">
                      Metadata
                    </h4>
                    <dl className="grid grid-cols-2 gap-4 text-xs text-gray-600">
                      {resource.metadata.createdAt && (
                        <div>
                          <dt className="font-medium">Created</dt>
                          <dd className="font-mono">
                            {new Date(resource.metadata.createdAt).toLocaleString()}
                          </dd>
                        </div>
                      )}
                      {resource.metadata.updatedAt && (
                        <div>
                          <dt className="font-medium">Updated</dt>
                          <dd className="font-mono">
                            {new Date(resource.metadata.updatedAt).toLocaleString()}
                          </dd>
                        </div>
                      )}
                    </dl>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500">Resource not found</p>
            </div>
          )}

      {/* KAS Request Modal */}
      {resource && resource.ztdf && showKASModal && kaoId && (
        <KASRequestModal
          resourceId={resource.resourceId}
          kaoId={kaoId}
          isOpen={showKASModal}
          onClose={() => setShowKASModal(false)}
          onSuccess={(content) => {
            setDecryptedContent(content);
            setShowKASModal(false);
            setKasError(null);
          }}
          onFailure={(reason, details) => {
            setKasError(reason);
            setShowKASModal(false);
          }}
        />
      )}
    </PageLayout>
  );
}

