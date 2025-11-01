'use client';

/**
 * Multi-KAS Architecture Visualizer
 * 
 * Interactive visualization of coalition-scalable Multi-KAS architecture
 * Shows how 1-4 KAOs per resource enable instant coalition growth
 */

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import PageLayout from '@/components/layout/page-layout';
import { 
  Server, 
  Key, 
  Shield, 
  Zap, 
  CheckCircle2, 
  Activity,
  Globe,
  Lock,
  ArrowRight,
  TrendingUp,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface KASEndpoint {
  id: string;
  name: string;
  url: string;
  country: string;
  status: string;
  uptime: number;
  requestsToday: number;
}

interface MultiKasData {
  title: string;
  description: string;
  kasEndpoints: KASEndpoint[];
  benefits: Array<{
    title: string;
    description: string;
    icon: string;
  }>;
  exampleScenario: {
    resourceId: string;
    title: string;
    classification: string;
    releasabilityTo: string[];
    COI: string[];
    kaoCount: number;
    kaos: Array<{
      id: string;
      kasEndpoint: string;
      wrappedKey: string;
      coi: string;
    }>;
  };
  flowSteps: Array<{
    step: number;
    title: string;
    description: string;
  }>;
}

export default function MultiKasPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  const [multiKasData, setMultiKasData] = useState<MultiKasData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedKAS, setSelectedKAS] = useState<string | null>(null);
  const [isAccordionOpen, setIsAccordionOpen] = useState(false);

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

    async function fetchMultiKasData() {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://localhost:4000';
      
      try {
        const response = await fetch(`${backendUrl}/api/compliance/multi-kas`, {
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error('Failed to fetch Multi-KAS data');
        }

        const data = await response.json();
        setMultiKasData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load Multi-KAS data');
        console.error('Error fetching Multi-KAS:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchMultiKasData();
  }, [session, status, router]);

  if (status === 'loading' || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 font-medium">Loading Multi-KAS architecture...</p>
        </div>
      </div>
    );
  }

  if (!session || !multiKasData) {
    return null;
  }

  const statusColors: Record<string, string> = {
    active: 'bg-green-100 text-green-800 border-green-300',
    degraded: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    down: 'bg-red-100 text-red-800 border-red-300',
  };

  const benefitIcons: Record<string, React.ReactNode> = {
    '⚡': <Zap className="w-6 h-6 text-yellow-500" />,
    '🏛️': <Shield className="w-6 h-6 text-blue-600" />,
    '🔄': <Activity className="w-6 h-6 text-green-600" />,
    '🚀': <TrendingUp className="w-6 h-6 text-purple-600" />,
  };

  return (
    <PageLayout
      user={session.user}
      breadcrumbs={[
        { label: 'Compliance', href: '/compliance' },
        { label: 'Multi-KAS', href: null }
      ]}
    >
      {/* Hero Section */}
      <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 rounded-2xl p-8 md:p-12 mb-8 shadow-2xl">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: `radial-gradient(circle at 30% 50%, white 2px, transparent 2px)`,
            backgroundSize: '60px 60px'
          }} />
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-4 bg-white/20 backdrop-blur-sm rounded-2xl">
              <Key className="w-10 h-10 text-white" />
            </div>
            <div>
              <h1 className="text-4xl md:text-5xl font-bold text-white mb-2">
                {multiKasData.title}
              </h1>
              <p className="text-blue-100 text-lg max-w-3xl">
                {multiKasData.description}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* How Multi-KAS Works Accordion */}
      <div className="mb-8">
        <button
          onClick={() => setIsAccordionOpen(!isAccordionOpen)}
          className="w-full bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border-2 border-blue-200 hover:border-blue-400 transition-all hover:shadow-lg group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="w-6 h-6 text-blue-600" />
              <h2 className="text-xl font-bold text-gray-900">
                How Multi-KAS Works in DIVE V3
              </h2>
              <span className="px-3 py-1 bg-blue-200 text-blue-800 text-xs font-bold rounded-full">
                Technical Details
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-blue-600 font-semibold group-hover:text-blue-700">
                {isAccordionOpen ? 'Hide Details' : 'Show Details'}
              </span>
              {isAccordionOpen ? (
                <ChevronUp className="w-6 h-6 text-blue-600 group-hover:text-blue-700 transition-transform" />
              ) : (
                <ChevronDown className="w-6 h-6 text-blue-600 group-hover:text-blue-700 transition-transform group-hover:translate-y-0.5" />
              )}
            </div>
          </div>
        </button>

        {/* Accordion Content with Smooth Animation */}
        <div
          className={`overflow-hidden transition-all duration-500 ease-in-out ${
            isAccordionOpen ? 'max-h-[2000px] opacity-100 mt-4' : 'max-h-0 opacity-0'
          }`}
        >
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border-2 border-blue-200 space-y-4">
            <div className="bg-white rounded-lg p-4 border border-blue-200 hover:shadow-md transition-shadow">
              <h3 className="font-bold text-gray-900 mb-2 flex items-center gap-2">
                <span className="text-2xl">📤</span>
                1. Upload Phase (Resource Creation)
              </h3>
              <p className="text-sm text-gray-700">
                When you upload an encrypted resource, <code className="px-2 py-1 bg-gray-100 rounded text-xs">upload.service.ts</code> automatically 
                creates <strong>1-4 Key Access Objects (KAOs)</strong> based on the resource's <code className="text-blue-600">releasabilityTo</code> and 
                <code className="text-purple-600">COI</code> tags. Each KAO wraps the data encryption key (DEK) with a different KAS's public key.
              </p>
            </div>

            <div className="bg-white rounded-lg p-4 border border-blue-200 hover:shadow-md transition-shadow">
              <h3 className="font-bold text-gray-900 mb-2 flex items-center gap-2">
                <span className="text-2xl">🔍</span>
                2. Access Phase (Key Request)
              </h3>
              <p className="text-sm text-gray-700">
                When you try to view a resource, <code className="px-2 py-1 bg-gray-100 rounded text-xs">resource.service.ts</code> selects the 
                <strong>optimal KAS</strong> based on your attributes (country, COI membership). It sends a rewrap request to that KAS, which 
                re-evaluates the OPA policy before releasing the key.
              </p>
            </div>

            <div className="bg-white rounded-lg p-4 border border-blue-200 hover:shadow-md transition-shadow">
              <h3 className="font-bold text-gray-900 mb-2 flex items-center gap-2">
                <span className="text-2xl">⚙️</span>
                Current Implementation Status
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="font-semibold text-green-700 mb-1">✅ Implemented:</p>
                  <ul className="list-disc list-inside text-gray-700 space-y-1">
                    <li>Single KAS (localhost:8080)</li>
                    <li>Multi-KAO creation logic</li>
                    <li>COI-based key selection</li>
                    <li>KAS request/response flow</li>
                  </ul>
                </div>
                <div>
                  <p className="font-semibold text-blue-700 mb-1">🎯 Shown Below (Demo):</p>
                  <ul className="list-disc list-inside text-gray-700 space-y-1">
                    <li>6 distributed KAS endpoints</li>
                    <li>Nation-specific KAS instances</li>
                    <li>COI community KAS services</li>
                    <li>Production architecture vision</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-r from-yellow-50 to-amber-50 rounded-lg p-4 border-2 border-yellow-300">
              <p className="text-sm text-gray-800">
                <strong className="text-yellow-800">💡 Production Deployment:</strong> In production, each nation/COI would host 
                their own KAS endpoint. The endpoints shown below represent the <strong>target architecture</strong> for coalition 
                deployment, demonstrating how DIVE V3 enables instant coalition growth without re-encrypting historical data.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* KAS Endpoints Grid */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-3">
          <Server className="w-7 h-7 text-blue-600" />
          KAS Endpoints (Production Architecture)
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          Click any endpoint to see detailed information and usage statistics
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {multiKasData.kasEndpoints.map((kas) => (
            <div
              key={kas.id}
              onClick={() => setSelectedKAS(kas.id === selectedKAS ? null : kas.id)}
              className={`bg-white rounded-xl p-6 border-2 shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer ${
                selectedKAS === kas.id
                  ? 'border-blue-500 ring-4 ring-blue-100 scale-105'
                  : 'border-gray-200 hover:border-blue-300'
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-3 rounded-xl ${
                    kas.status === 'active' ? 'bg-green-100' : 'bg-gray-100'
                  }`}>
                    <Server className={`w-6 h-6 ${
                      kas.status === 'active' ? 'text-green-600' : 'text-gray-400'
                    }`} />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900">{kas.name}</h3>
                    <p className="text-xs text-gray-500 font-mono">{kas.country}</p>
                  </div>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
                  statusColors[kas.status] || statusColors.active
                }`}>
                  {kas.status.toUpperCase()}
                </span>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Endpoint URL:</p>
                  <p className="text-xs font-mono bg-gray-100 px-2 py-1 rounded border border-gray-300 break-all">
                    {kas.url}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Uptime:</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-200 rounded-full h-2">
                        <div 
                          className="h-full bg-gradient-to-r from-green-400 to-emerald-500 rounded-full"
                          style={{ width: `${kas.uptime}%` }}
                        />
                      </div>
                      <span className="text-xs font-bold text-green-600">{kas.uptime}%</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Requests Today:</p>
                    <p className="text-sm font-bold text-blue-600">{kas.requestsToday.toLocaleString()}</p>
                  </div>
                </div>
              </div>

              {selectedKAS === kas.id && (
                <div className="mt-4 pt-4 border-t border-blue-300 animate-fade-in">
                  <p className="text-xs text-blue-600 font-bold flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-4 h-4" />
                    Selected - View details below ↓
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Selected KAS Detailed Panel */}
      {selectedKAS && multiKasData.kasEndpoints.find(k => k.id === selectedKAS) && (
        <div className="mb-8 animate-fade-in">
          <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-3">
            <Activity className="w-7 h-7 text-green-600" />
            {multiKasData.kasEndpoints.find(k => k.id === selectedKAS)?.name} - Detailed View
          </h2>
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-6 border-2 border-green-300 shadow-xl">
            {(() => {
              const kas = multiKasData.kasEndpoints.find(k => k.id === selectedKAS)!;
              return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Left Column: Technical Details */}
                  <div className="space-y-4">
                    <div>
                      <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                        <Server className="w-5 h-5 text-blue-600" />
                        Technical Specifications
                      </h3>
                      <div className="space-y-2">
                        <div className="bg-white rounded-lg p-3 border border-green-200">
                          <p className="text-xs text-gray-500 mb-1">Endpoint URL:</p>
                          <p className="text-sm font-mono font-bold text-gray-900 break-all">{kas.url}</p>
                        </div>
                        <div className="bg-white rounded-lg p-3 border border-green-200">
                          <p className="text-xs text-gray-500 mb-1">Country/COI:</p>
                          <p className="text-sm font-bold text-gray-900">{kas.country}</p>
                        </div>
                        <div className="bg-white rounded-lg p-3 border border-green-200">
                          <p className="text-xs text-gray-500 mb-1">Protocol:</p>
                          <p className="text-sm font-bold text-gray-900">HTTPS/TLS 1.3 + RSA-2048</p>
                        </div>
                        <div className="bg-white rounded-lg p-3 border border-green-200">
                          <p className="text-xs text-gray-500 mb-1">Response Time:</p>
                          <p className="text-sm font-bold text-green-600">~45ms (p95)</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Usage Statistics */}
                  <div className="space-y-4">
                    <div>
                      <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-purple-600" />
                        Usage Statistics
                      </h3>
                      <div className="space-y-3">
                        <div className="bg-white rounded-lg p-4 border border-green-200">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-gray-600">Uptime (24h)</span>
                            <span className="text-2xl font-bold text-green-600">{kas.uptime}%</span>
                          </div>
                          <div className="bg-gray-200 rounded-full h-2">
                            <div 
                              className="h-full bg-gradient-to-r from-green-400 to-emerald-500 rounded-full"
                              style={{ width: `${kas.uptime}%` }}
                            />
                          </div>
                        </div>

                        <div className="bg-white rounded-lg p-4 border border-green-200">
                          <p className="text-xs text-gray-500 mb-1">Requests Today:</p>
                          <p className="text-3xl font-bold text-blue-600">{kas.requestsToday.toLocaleString()}</p>
                          <p className="text-xs text-gray-500 mt-1">Avg: ~87 requests/hour</p>
                        </div>

                        <div className="bg-white rounded-lg p-4 border border-green-200">
                          <p className="text-xs text-gray-500 mb-1">Success Rate:</p>
                          <p className="text-2xl font-bold text-green-600">99.97%</p>
                          <p className="text-xs text-gray-500 mt-1">3 failed requests today</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Full Width: Usage Scenarios */}
                  <div className="md:col-span-2">
                    <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                      <Lock className="w-5 h-5 text-orange-600" />
                      When This KAS Is Used
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {kas.country === 'USA' && (
                        <>
                          <div className="bg-white rounded-lg p-3 border border-green-200">
                            <p className="text-sm font-semibold text-gray-900 mb-1">🇺🇸 US Users Accessing US-ONLY Resources</p>
                            <p className="text-xs text-gray-600">Resources tagged <code className="px-1 py-0.5 bg-gray-100 rounded">releasabilityTo: ["USA"]</code></p>
                          </div>
                          <div className="bg-white rounded-lg p-3 border border-green-200">
                            <p className="text-sm font-semibold text-gray-900 mb-1">🔒 Highest Security Classifications</p>
                            <p className="text-xs text-gray-600">TOP_SECRET/SCI resources restricted to US nationals</p>
                          </div>
                        </>
                      )}
                      {kas.country === 'FVEY' && (
                        <>
                          <div className="bg-white rounded-lg p-3 border border-green-200">
                            <p className="text-sm font-semibold text-gray-900 mb-1">👁️ Five Eyes Intelligence Sharing</p>
                            <p className="text-xs text-gray-600">Resources tagged <code className="px-1 py-0.5 bg-gray-100 rounded">COI: ["FVEY"]</code></p>
                          </div>
                          <div className="bg-white rounded-lg p-3 border border-green-200">
                            <p className="text-sm font-semibold text-gray-900 mb-1">🌐 USA, GBR, CAN, AUS, NZL Users</p>
                            <p className="text-xs text-gray-600">Preferred KAS for FVEY member access</p>
                          </div>
                        </>
                      )}
                      {kas.country === 'NATO' && (
                        <>
                          <div className="bg-white rounded-lg p-3 border border-green-200">
                            <p className="text-sm font-semibold text-gray-900 mb-1">🛡️ NATO Alliance Operations</p>
                            <p className="text-xs text-gray-600">Resources tagged <code className="px-1 py-0.5 bg-gray-100 rounded">COI: ["NATO-COSMIC"]</code></p>
                          </div>
                          <div className="bg-white rounded-lg p-3 border border-green-200">
                            <p className="text-sm font-semibold text-gray-900 mb-1">🌍 32 NATO Member Nations</p>
                            <p className="text-xs text-gray-600">Fallback KAS for NATO users when national KAS unavailable</p>
                          </div>
                        </>
                      )}
                      {(kas.country === 'GBR' || kas.country === 'FRA' || kas.country === 'CAN') && (
                        <>
                          <div className="bg-white rounded-lg p-3 border border-green-200">
                            <p className="text-sm font-semibold text-gray-900 mb-1">🏛️ National Sovereignty</p>
                            <p className="text-xs text-gray-600">{kas.country} controls own key custody and access policies</p>
                          </div>
                          <div className="bg-white rounded-lg p-3 border border-green-200">
                            <p className="text-sm font-semibold text-gray-900 mb-1">🤝 Bilateral Agreements</p>
                            <p className="text-xs text-gray-600">Handles {kas.country}-US bilateral resources</p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Call to Action */}
                  <div className="md:col-span-2 bg-gradient-to-r from-blue-100 to-indigo-100 rounded-lg p-4 border-2 border-blue-300">
                    <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                      This KAS endpoint is currently <span className="text-green-600 uppercase">{kas.status}</span> and processing requests
                    </p>
                    <p className="text-xs text-gray-700 mt-2">
                      In production, this endpoint would be managed by {kas.country === 'USA' ? 'DoD' : kas.country === 'NATO' ? 'NATO CIS' : kas.country + ' government'} infrastructure teams with dedicated monitoring, backup, and failover capabilities.
                    </p>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Architecture Diagram */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-3">
          <Globe className="w-7 h-7 text-indigo-600" />
          Multi-KAS Flow
        </h2>
        <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-8 border-2 border-gray-300 shadow-inner">
          <div className="flex flex-wrap items-center justify-center gap-6">
            {multiKasData.flowSteps.map((flowStep, idx) => (
              <div key={flowStep.step} className="flex items-center gap-6">
                {/* Step Card */}
                <div className="bg-white rounded-xl p-6 shadow-lg border-2 border-blue-200 w-64 hover:scale-105 transition-transform">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg">
                      {flowStep.step}
                    </div>
                    <h3 className="font-bold text-gray-900 text-sm leading-tight">
                      {flowStep.title}
                    </h3>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    {flowStep.description}
                  </p>
                </div>

                {/* Arrow */}
                {idx < multiKasData.flowSteps.length - 1 && (
                  <ArrowRight className="w-8 h-8 text-blue-400 flex-shrink-0 animate-pulse" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Example Scenario */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-3">
          <Lock className="w-7 h-7 text-purple-600" />
          Example: Multi-KAO Resource
        </h2>
        <div className="bg-white rounded-xl p-6 border-2 border-purple-200 shadow-lg">
          <div className="mb-6">
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              {multiKasData.exampleScenario.title}
            </h3>
            <div className="flex flex-wrap gap-3 mb-4">
              <span className="px-4 py-2 rounded-lg text-sm font-bold bg-orange-100 text-orange-800 border-2 border-orange-300">
                {multiKasData.exampleScenario.classification}
              </span>
              <span className="px-4 py-2 rounded-lg text-sm font-bold bg-blue-100 text-blue-800">
                {multiKasData.exampleScenario.kaoCount} KAOs
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">Releasable To:</p>
                <div className="flex flex-wrap gap-2">
                  {multiKasData.exampleScenario.releasabilityTo.map((country) => (
                    <span key={country} className="px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800">
                      {country}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">Communities of Interest:</p>
                <div className="flex flex-wrap gap-2">
                  {multiKasData.exampleScenario.COI.map((coi) => (
                    <span key={coi} className="px-3 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800">
                      {coi}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-6">
            <h4 className="font-bold text-gray-900 mb-4">Key Access Objects (KAOs):</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {multiKasData.exampleScenario.kaos.map((kao, idx) => (
                <div key={kao.id} className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg p-4 border border-indigo-200">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 bg-indigo-600 rounded-lg">
                      <Key className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">KAO #{idx + 1}</p>
                      <p className="text-xs text-gray-600">{kao.coi}</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <p className="text-xs text-gray-600">KAS Endpoint:</p>
                      <p className="text-xs font-mono font-bold text-indigo-700">{kao.kasEndpoint}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">Wrapped Key:</p>
                      <p className="text-xs font-mono bg-white px-2 py-1 rounded border border-gray-300 truncate">
                        {kao.wrappedKey}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Benefits Section */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-3">
          <Zap className="w-7 h-7 text-yellow-500" />
          Coalition Benefits
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {multiKasData.benefits.map((benefit) => (
            <div key={benefit.title} className="bg-white rounded-xl p-6 border-2 border-gray-200 shadow-md hover:shadow-xl hover:scale-105 transition-all">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl">
                  {benefitIcons[benefit.icon] || <Zap className="w-6 h-6 text-white" />}
                </div>
                <span className="text-3xl" role="img" aria-label={benefit.title}>{benefit.icon}</span>
              </div>
              <h3 className="font-bold text-gray-900 mb-2">{benefit.title}</h3>
              <p className="text-sm text-gray-600">{benefit.description}</p>
            </div>
          ))}
        </div>
      </div>
    </PageLayout>
  );
}

