'use client';

/**
 * COI Community Keys Explainer
 * 
 * Visual guide to Community of Interest (COI) based encryption
 * Shows how COI keys enable zero re-encryption coalition growth
 */

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import PageLayout from '@/components/layout/page-layout';
import { 
  Users, 
  Key, 
  Zap, 
  CheckCircle2, 
  TrendingUp,
  Globe,
  Shield,
  ArrowRight,
  FileCheck
} from 'lucide-react';

interface COI {
  id: string;
  name: string;
  description: string;
  members: string[];
  color: string;
  icon: string;
  status: string;
  resourceCount: number;
}

interface CoiKeysData {
  title: string;
  description: string;
  registeredCOIs: number;
  totalKeysGenerated: number;
  keyAlgorithm: string;
  cois: COI[];
  selectionAlgorithm: {
    title: string;
    steps: Array<{
      priority: number;
      rule: string;
      example: string;
    }>;
  };
  benefits: Array<{
    title: string;
    description: string;
    impact: string;
    icon: string;
  }>;
}

export default function CoiKeysPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  const [coiKeysData, setCoiKeysData] = useState<CoiKeysData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCOI, setSelectedCOI] = useState<string | null>(null);

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

    async function fetchCoiKeysData() {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://localhost:4000';
      
      try {
        const response = await fetch(`${backendUrl}/api/compliance/coi-keys`, {
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error('Failed to fetch COI keys data');
        }

        const data = await response.json();
        setCoiKeysData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load COI keys data');
        console.error('Error fetching COI keys:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchCoiKeysData();
  }, [session, status, router]);

  if (status === 'loading' || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-purple-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 font-medium">Loading COI keys data...</p>
        </div>
      </div>
    );
  }

  if (!session || !coiKeysData) {
    return null;
  }

  const selectedCoiData = selectedCOI ? coiKeysData.cois.find(c => c.id === selectedCOI) : null;

  return (
    <PageLayout
      user={session.user}
      breadcrumbs={[
        { label: 'Compliance', href: '/compliance' },
        { label: 'COI Keys', href: null }
      ]}
    >
      {/* Hero Section */}
      <div className="relative overflow-hidden bg-gradient-to-br from-purple-600 via-indigo-600 to-blue-700 rounded-2xl p-8 md:p-12 mb-8 shadow-2xl">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: `radial-gradient(circle at 40% 40%, white 2px, transparent 2px)`,
            backgroundSize: '50px 50px'
          }} />
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-4 bg-white/20 backdrop-blur-sm rounded-2xl">
              <Users className="w-10 h-10 text-white" />
            </div>
            <div>
              <h1 className="text-4xl md:text-5xl font-bold text-white mb-2">
                {coiKeysData.title}
              </h1>
              <p className="text-purple-100 text-lg max-w-3xl">
                {coiKeysData.description}
              </p>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20">
              <p className="text-white/80 text-sm font-medium mb-1">Registered COIs</p>
              <p className="text-3xl font-bold text-white">{coiKeysData.registeredCOIs}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20">
              <p className="text-white/80 text-sm font-medium mb-1">Keys Generated</p>
              <p className="text-3xl font-bold text-white">{coiKeysData.totalKeysGenerated}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20">
              <p className="text-white/80 text-sm font-medium mb-1">Encryption</p>
              <p className="text-lg font-bold text-white">{coiKeysData.keyAlgorithm}</p>
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

      {/* COI Registry */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-3">
          <Globe className="w-7 h-7 text-indigo-600" />
          Community of Interest Registry
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {coiKeysData.cois.map((coi) => (
            <div
              key={coi.id}
              onClick={() => setSelectedCOI(coi.id === selectedCOI ? null : coi.id)}
              className={`bg-white rounded-xl p-6 border-2 shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer ${
                selectedCOI === coi.id
                  ? 'border-purple-500 ring-4 ring-purple-100 scale-105'
                  : 'border-gray-200 hover:border-purple-300'
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div 
                    className="p-3 rounded-xl text-white font-bold text-2xl"
                    style={{ backgroundColor: coi.color }}
                  >
                    {coi.icon}
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 text-sm leading-tight">{coi.name}</h3>
                    <p className="text-xs text-gray-500 font-mono">{coi.id}</p>
                  </div>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800 border border-green-300">
                  {coi.status.toUpperCase()}
                </span>
              </div>

              <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                {coi.description}
              </p>

              <div className="mb-4">
                <p className="text-xs text-gray-500 mb-2">Member Countries ({coi.members.length}):</p>
                <div className="flex flex-wrap gap-1">
                  {coi.members.slice(0, 8).map((member) => (
                    <span key={member} className="px-2 py-1 rounded text-xs font-bold bg-gray-100 text-gray-700">
                      {member}
                    </span>
                  ))}
                  {coi.members.length > 8 && (
                    <span className="px-2 py-1 rounded text-xs font-bold bg-gray-100 text-gray-500">
                      +{coi.members.length - 8}
                    </span>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Resources:</span>
                  <span className="text-lg font-bold text-blue-600">{coi.resourceCount}</span>
                </div>
              </div>

              {selectedCOI === coi.id && (
                <div className="mt-4 pt-4 border-t border-gray-200 animate-fade-in">
                  <p className="text-xs text-purple-600 font-semibold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    Selected for details
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Selected COI Details */}
      {selectedCoiData && (
        <div className="mb-8 animate-fade-in">
          <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-3">
            <Shield className="w-7 h-7 text-purple-600" />
            {selectedCoiData.name} Details
          </h2>
          <div 
            className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl p-6 border-2 shadow-lg"
            style={{ borderColor: selectedCoiData.color }}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-bold text-gray-900 mb-3">Overview</h3>
                <p className="text-sm text-gray-700 mb-4">{selectedCoiData.description}</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">COI ID:</span>
                    <span className="text-sm font-mono font-bold text-gray-900">{selectedCoiData.id}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Status:</span>
                    <span className="text-sm font-bold text-green-600">{selectedCoiData.status}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Resources Encrypted:</span>
                    <span className="text-sm font-bold text-blue-600">{selectedCoiData.resourceCount}</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-bold text-gray-900 mb-3">Member Countries ({selectedCoiData.members.length})</h3>
                <div className="bg-white rounded-lg p-4 border border-gray-300 max-h-64 overflow-y-auto">
                  <div className="grid grid-cols-3 gap-2">
                    {selectedCoiData.members.map((member) => (
                      <div key={member} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
                        <Globe className="w-4 h-4 text-gray-500" />
                        <span className="text-sm font-bold text-gray-900">{member}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Selection Algorithm */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-3">
          <Key className="w-7 h-7 text-yellow-600" />
          {coiKeysData.selectionAlgorithm.title}
        </h2>
        <div className="bg-white rounded-xl p-6 border-2 border-yellow-200 shadow-lg">
          <p className="text-sm text-gray-600 mb-6">
            DIVE V3 intelligently selects the optimal COI key based on resource attributes using this priority-ordered algorithm:
          </p>
          <div className="space-y-4">
            {coiKeysData.selectionAlgorithm.steps.map((step, idx) => (
              <div key={step.priority} className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-white font-bold text-lg shadow-md">
                  {step.priority}
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-gray-900 mb-1">{step.rule}</h4>
                  <p className="text-sm text-gray-600 font-mono bg-gray-100 px-3 py-2 rounded border border-gray-300">
                    {step.example}
                  </p>
                </div>
                {idx < coiKeysData.selectionAlgorithm.steps.length - 1 && (
                  <ArrowRight className="flex-shrink-0 w-6 h-6 text-yellow-400 mt-3" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Benefits Section */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-3">
          <Zap className="w-7 h-7 text-purple-600" />
          Coalition Benefits
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {coiKeysData.benefits.map((benefit) => (
            <div key={benefit.title} className="bg-gradient-to-br from-white to-purple-50 rounded-xl p-6 border-2 border-purple-200 shadow-md hover:shadow-xl hover:scale-105 transition-all">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl">
                  {benefit.icon === '⚡' && <Zap className="w-6 h-6 text-white" />}
                  {benefit.icon === '🚀' && <TrendingUp className="w-6 h-6 text-white" />}
                  {benefit.icon === '📈' && <TrendingUp className="w-6 h-6 text-white" />}
                </div>
                <span className="text-3xl" role="img" aria-label={benefit.title}>{benefit.icon}</span>
              </div>
              <h3 className="font-bold text-gray-900 mb-2">{benefit.title}</h3>
              <p className="text-sm text-gray-600 mb-3">{benefit.description}</p>
              <div className="pt-3 border-t border-purple-200">
                <p className="text-xs text-purple-600 font-bold uppercase">Impact: {benefit.impact}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Real-World Scenario */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-8 border-2 border-blue-200 shadow-lg">
        <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-3">
          <FileCheck className="w-6 h-6 text-blue-600" />
          Real-World Scenario: Adding Australia to FVEY Coalition
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg p-6 border-2 border-red-200">
            <h4 className="font-bold text-red-700 mb-3 flex items-center gap-2">
              <span className="text-2xl">❌</span>
              Without COI Keys (Traditional Approach)
            </h4>
            <ol className="space-y-2 text-sm text-gray-700">
              <li className="flex items-start gap-2">
                <span className="font-bold text-red-600">1.</span>
                <span>Identify ALL historical FVEY documents (thousands)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold text-red-600">2.</span>
                <span>Decrypt each document with existing keys</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold text-red-600">3.</span>
                <span>Re-encrypt each with new 5-nation key</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold text-red-600">4.</span>
                <span>Update all metadata and indexes</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold text-red-600">5.</span>
                <span className="font-bold">Result: Days/weeks of downtime, massive compute cost</span>
              </li>
            </ol>
          </div>

          <div className="bg-white rounded-lg p-6 border-2 border-green-200">
            <h4 className="font-bold text-green-700 mb-3 flex items-center gap-2">
              <span className="text-2xl">✅</span>
              With COI Keys (DIVE V3 Approach)
            </h4>
            <ol className="space-y-2 text-sm text-gray-700">
              <li className="flex items-start gap-2">
                <span className="font-bold text-green-600">1.</span>
                <span>Grant Australia access to FVEY-KAS endpoint</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold text-green-600">2.</span>
                <span>Update OPA policy: releasabilityTo += "AUS"</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold text-green-600">3.</span>
                <span>Australian users authenticate and request resources</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold text-green-600">4.</span>
                <span>KAS validates policy, releases FVEY community key</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold text-green-600">5.</span>
                <span className="font-bold">Result: Instant access in minutes, zero re-encryption</span>
              </li>
            </ol>
          </div>
        </div>

        <div className="mt-6 bg-gradient-to-r from-green-100 to-emerald-100 rounded-lg p-4 border-2 border-green-300">
          <p className="text-sm font-bold text-green-800 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" />
            Time Savings: Weeks reduced to minutes | Cost Savings: Millions of compute cycles avoided | Coalition Agility: Maximum
          </p>
        </div>
      </div>
    </PageLayout>
  );
}
