'use client';

/**
 * ACP-240 Compliance Dashboard
 * 
 * Showcases DIVE V3's PERFECT (100%) NATO ACP-240 compliance
 * with beautiful modern UI/UX and interactive visualizations
 */

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import PageLayout from '@/components/layout/page-layout';
import { 
  Shield, 
  Award, 
  CheckCircle2, 
  TrendingUp, 
  Key,
  Users,
  Globe,
  FileCheck,
  Server,
  Lock,
  Zap,
  Target
} from 'lucide-react';
import Link from 'next/link';

interface ComplianceStatus {
  level: string;
  percentage: number;
  badge: string;
  totalRequirements: number;
  compliantRequirements: number;
  certificationDate: string;
  sections: Array<{
    id: number;
    name: string;
    total: number;
    compliant: number;
    percentage: number;
  }>;
  keyAchievements: Array<{
    id: string;
    title: string;
    description: string;
    icon: string;
    status: string;
    testsPassing: number;
  }>;
  testMetrics: {
    total: number;
    passing: number;
    failing: number;
    passRate: number;
    coverage: number;
  };
  deploymentStatus: {
    ready: boolean;
    classification: string;
    environment: string;
    certificateId: string;
  };
}

export default function ComplianceDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  const [complianceData, setComplianceData] = useState<ComplianceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Redirect to login if not authenticated (separate effect to avoid render-phase updates)
  useEffect(() => {
    if (status !== 'loading' && !session) {
      router.push('/login');
    }
  }, [status, session, router]);

  useEffect(() => {
    if (status === 'loading') return;
    
    // Only run on client-side
    if (typeof window === 'undefined') {
      return;
    }
    
    if (!session) {
      return;
    }

    async function fetchComplianceStatus() {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://localhost:4000';
      
      try {
        const response = await fetch(`${backendUrl}/api/compliance/status`, {
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error('Failed to fetch compliance status');
        }

        const data = await response.json();
        setComplianceData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load compliance data');
        console.error('Error fetching compliance:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchComplianceStatus();
  }, [session, status, router]);

  if (status === 'loading' || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 font-medium">Loading compliance dashboard...</p>
        </div>
      </div>
    );
  }

  if (!session || !complianceData) {
    return null;
  }

  const achievementIcons: Record<string, React.ReactNode> = {
    'multi-kas': <Key className="w-6 h-6" />,
    'coi-keys': <Users className="w-6 h-6" />,
    'x509-pki': <FileCheck className="w-6 h-6" />,
    'classification-equiv': <Globe className="w-6 h-6" />,
    'identity-assurance': <Shield className="w-6 h-6" />,
  };

  const achievementLinks: Record<string, string> = {
    'multi-kas': '/compliance/multi-kas',
    'coi-keys': '/compliance/coi-keys',
    'x509-pki': '/compliance/certificates',
    'classification-equiv': '/compliance/classifications',
    'identity-assurance': '/compliance/identity-assurance',
  };

  return (
    <PageLayout
      user={session.user}
      breadcrumbs={[
        { label: 'Compliance', href: null }
      ]}
    >
      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Quick Navigation Cards */}
      <div className="mb-8 grid md:grid-cols-2 gap-6">
        {/* Integration Guide Card */}
        <Link href="/integration/federation-vs-object">
          <div className="bg-gradient-to-br from-indigo-500 via-purple-500 to-amber-500 rounded-xl p-8 text-white shadow-2xl hover:shadow-3xl hover:scale-[1.03] transition-all duration-300 cursor-pointer h-full">
            <div className="flex items-start gap-4">
              <div className="p-4 bg-white/20 backdrop-blur-sm rounded-xl">
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-2xl font-bold">Standards Integration Guide</h3>
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-white/30 backdrop-blur-sm animate-pulse">
                    NEW
                  </span>
                </div>
                <p className="text-white/90 mb-4 text-lg">
                  Interactive tutorial: ADatP-5663 (Federation) × ACP-240 (Object)
                </p>
                <ul className="space-y-2 text-sm text-white/80 mb-4">
                  <li className="flex items-center gap-2">
                    <span className="text-white">✓</span>
                    <span>8 interactive components</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-white">✓</span>
                    <span>Side-by-side comparison views</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-white">✓</span>
                    <span>Step-by-step decision replay</span>
                  </li>
                </ul>
                <div className="flex items-center gap-2 text-lg font-bold">
                  <span>Explore Now</span>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </Link>

        {/* Classification Matrix Card */}
        <Link href="/compliance/classifications">
          <div className="bg-gradient-to-br from-teal-500 to-cyan-600 rounded-xl p-8 text-white shadow-2xl hover:shadow-3xl hover:scale-[1.03] transition-all duration-300 cursor-pointer h-full">
            <div className="flex items-start gap-4">
              <div className="p-4 bg-white/20 backdrop-blur-sm rounded-xl">
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-2xl font-bold mb-3">Classification Matrix</h3>
                <p className="text-white/90 mb-4 text-lg">
                  12-nation equivalency table (ACP-240 §4.3)
                </p>
                <div className="flex items-center gap-2 text-lg font-bold">
                  <span>View Matrix</span>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </Link>
      </div>

      {/* Core Conformance Section */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-3">
          <Zap className="w-7 h-7 text-yellow-500" />
          Core Conformance
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {complianceData.keyAchievements.map((achievement) => (
            <Link
              key={achievement.id}
              href={achievementLinks[achievement.id] || '/compliance'}
              className="group"
            >
              <div className="bg-gradient-to-br from-white to-gray-50 rounded-xl p-6 border-2 border-gray-200 shadow-md hover:shadow-xl hover:scale-105 hover:border-blue-400 transition-all duration-300 cursor-pointer h-full">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl text-white group-hover:scale-110 transition-transform">
                    {achievementIcons[achievement.id]}
                  </div>
                  <span className="text-3xl" role="img" aria-label={achievement.title}>
                    {achievement.icon}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">
                  {achievement.title}
                </h3>
                <p className="text-sm text-gray-600 mb-3">
                  {achievement.description}
                </p>
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    {achievement.status}
                  </span>
                  <span className="text-xs font-bold text-blue-600">
                    {achievement.testsPassing} tests ✓
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Compliance by Section */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-3">
          <TrendingUp className="w-7 h-7 text-green-500" />
          Compliance by Section
        </h2>
        <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Section
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Topic
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Requirements
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Compliant
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Progress
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {complianceData.sections.map((section, idx) => (
                  <tr 
                    key={section.id}
                    className={`hover:bg-blue-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-bold text-sm">
                        {section.id}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-semibold text-gray-900">{section.name}</div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="text-sm font-mono text-gray-700">{section.total}</span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="text-sm font-mono font-bold text-green-600">{section.compliant}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 bg-gray-200 rounded-full h-3 overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-green-400 to-emerald-500 rounded-full transition-all duration-500"
                            style={{ width: `${section.percentage}%` }}
                          />
                        </div>
                        <span className="text-sm font-bold text-gray-700 min-w-[50px] text-right">
                          {section.percentage}%
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {section.percentage === 100 ? (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800">
                          <CheckCircle2 className="w-4 h-4 mr-1" />
                          Perfect
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-yellow-100 text-yellow-800">
                          Partial
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Test Metrics & Deployment Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Test Metrics Card */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border-2 border-blue-200 shadow-lg">
          <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <CheckCircle2 className="w-6 h-6 text-green-600" />
            Test Coverage
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-gray-700 font-medium">Total Tests:</span>
              <span className="text-2xl font-bold text-gray-900">{complianceData.testMetrics.total}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-700 font-medium">Passing:</span>
              <span className="text-2xl font-bold text-green-600">{complianceData.testMetrics.passing}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-700 font-medium">Pass Rate:</span>
              <span className="text-2xl font-bold text-blue-600">{complianceData.testMetrics.passRate}%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-700 font-medium">Code Coverage:</span>
              <span className="text-2xl font-bold text-purple-600">{complianceData.testMetrics.coverage}%</span>
            </div>
          </div>
        </div>

        {/* Deployment Status Card */}
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-6 border-2 border-green-200 shadow-lg">
          <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Lock className="w-6 h-6 text-green-600" />
            Deployment Status
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-gray-700 font-medium">Production Ready:</span>
              <span className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-bold bg-green-500 text-white">
                <CheckCircle2 className="w-4 h-4 mr-2" />
                {complianceData.deploymentStatus.ready ? 'YES' : 'NO'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-700 font-medium">Max Classification:</span>
              <span className="px-4 py-2 rounded-lg text-sm font-bold bg-red-100 text-red-800 border-2 border-red-300">
                {complianceData.deploymentStatus.classification}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-700 font-medium">Environment:</span>
              <span className="px-4 py-2 rounded-lg text-sm font-bold bg-blue-100 text-blue-800">
                {complianceData.deploymentStatus.environment}
              </span>
            </div>
            <div className="mt-4 pt-4 border-t border-green-200">
              <p className="text-xs text-gray-600 font-medium mb-2">Certificate ID:</p>
              <p className="font-mono text-xs text-gray-800 bg-white px-3 py-2 rounded border border-gray-300 break-all">
                {complianceData.deploymentStatus.certificateId}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Links to Deep Dives */}
      <div className="mt-8 bg-gradient-to-r from-indigo-50 via-blue-50 to-purple-50 rounded-xl p-6 border border-indigo-200">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Explore Compliance Features</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Link 
            href="/compliance/multi-kas"
            className="flex flex-col items-center gap-2 p-4 bg-white rounded-lg hover:bg-blue-50 hover:shadow-md transition-all border border-gray-200"
          >
            <Key className="w-8 h-8 text-blue-600" />
            <span className="text-sm font-semibold text-gray-900 text-center">Multi-KAS</span>
          </Link>
          <Link 
            href="/compliance/coi-keys"
            className="flex flex-col items-center gap-2 p-4 bg-white rounded-lg hover:bg-blue-50 hover:shadow-md transition-all border border-gray-200"
          >
            <Users className="w-8 h-8 text-purple-600" />
            <span className="text-sm font-semibold text-gray-900 text-center">COI Keys</span>
          </Link>
          <Link 
            href="/compliance/classifications"
            className="flex flex-col items-center gap-2 p-4 bg-white rounded-lg hover:bg-blue-50 hover:shadow-md transition-all border border-gray-200"
          >
            <Globe className="w-8 h-8 text-green-600" />
            <span className="text-sm font-semibold text-gray-900 text-center">Classifications</span>
          </Link>
          <Link 
            href="/compliance/certificates"
            className="flex flex-col items-center gap-2 p-4 bg-white rounded-lg hover:bg-blue-50 hover:shadow-md transition-all border border-gray-200"
          >
            <FileCheck className="w-8 h-8 text-orange-600" />
            <span className="text-sm font-semibold text-gray-900 text-center">X.509 PKI</span>
          </Link>
        </div>
      </div>
    </PageLayout>
  );
}
