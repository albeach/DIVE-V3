import { auth } from "@/auth";
import { redirect } from "next/navigation";
import PageLayout from "@/components/layout/page-layout";
import Link from "next/link";

interface IPolicyMetadata {
  policyId: string;
  name: string;
  description: string;
  version: string;
  package: string;
  ruleCount: number;
  testCount: number;
  lastModified: string;
  status: 'active' | 'draft' | 'deprecated';
}

interface IPolicyStats {
  totalPolicies: number;
  activeRules: number;
  totalTests: number;
  lastUpdated: string;
}

async function getPolicies(): Promise<{ policies: IPolicyMetadata[], stats: IPolicyStats }> {
  // Server component: Use Docker network name for internal communication
  // In Docker: backend:4000, Outside Docker: localhost:4000
  const backendUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'https://localhost:4000';
  
  try {
    const response = await fetch(`${backendUrl}/api/policies`, {
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error('Failed to fetch policies');
    }

    const data = await response.json();
    return {
      policies: data.policies || [],
      stats: data.stats || { totalPolicies: 0, activeRules: 0, totalTests: 0, lastUpdated: new Date().toISOString() }
    };
  } catch (error) {
    console.error('Error fetching policies:', error);
    return {
      policies: [],
      stats: { totalPolicies: 0, activeRules: 0, totalTests: 0, lastUpdated: new Date().toISOString() }
    };
  }
}

const statusColors: Record<string, string> = {
  'active': 'bg-green-100 text-green-800 border-green-300',
  'draft': 'bg-yellow-100 text-yellow-800 border-yellow-300',
  'deprecated': 'bg-gray-100 text-gray-800 border-gray-300',
};

export default async function PoliciesPage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  const { policies, stats } = await getPolicies();

  return (
    <PageLayout 
      user={session.user}
      breadcrumbs={[
        { label: 'Policies', href: null }
      ]}
    >
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">
          📜 Authorization Policies
        </h2>
        <p className="text-gray-600">
          View OPA (Open Policy Agent) Rego policies that govern access control decisions.
          Explore policy logic, test decisions interactively, and understand authorization rules.
        </p>
        <div className="mt-3 flex items-center gap-2 text-sm">
          <span className="inline-flex items-center px-2 py-1 rounded-md bg-blue-100 text-blue-800 font-semibold">
            🛡️ ACP-240 Compliant
          </span>
          <span className="text-gray-600">
            Attribute-Based Access Control | Fail-Secure Pattern | ZTDF Integrity Checks
          </span>
        </div>
      </div>

      {/* Policy Statistics */}
      <div className="grid grid-cols-3 gap-6 mb-8">
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="flex items-center justify-center h-12 w-12 rounded-md bg-blue-500 text-white">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
            </div>
            <div className="ml-5">
              <dl>
                <dt className="text-sm font-medium text-gray-500">Total Policies</dt>
                <dd className="text-2xl font-bold text-gray-900">{stats.totalPolicies}</dd>
              </dl>
            </div>
          </div>
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="flex items-center justify-center h-12 w-12 rounded-md bg-green-500 text-white">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <div className="ml-5">
              <dl>
                <dt className="text-sm font-medium text-gray-500">Active Rules</dt>
                <dd className="text-2xl font-bold text-gray-900">{stats.activeRules}</dd>
              </dl>
            </div>
          </div>
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="flex items-center justify-center h-12 w-12 rounded-md bg-purple-500 text-white">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
            </div>
            <div className="ml-5">
              <dl>
                <dt className="text-sm font-medium text-gray-500">Test Cases</dt>
                <dd className="text-2xl font-bold text-gray-900">{stats.totalTests}</dd>
              </dl>
            </div>
          </div>
        </div>
      </div>

      {/* Policy List */}
      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <ul className="divide-y divide-gray-200">
          {policies.length === 0 ? (
            <li className="px-6 py-8 text-center text-gray-500">
              No policies available
            </li>
          ) : (
            policies.map((policy) => (
              <li key={policy.policyId}>
                <Link
                  href={`/policies/${policy.policyId}`}
                  className="block hover:bg-gray-50 transition-colors"
                >
                  <div className="px-6 py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-gray-900">
                            {policy.name}
                          </h3>
                          <span
                            className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${
                              statusColors[policy.status] || 'bg-gray-100 text-gray-800 border-gray-300'
                            }`}
                          >
                            {policy.status.toUpperCase()}
                          </span>
                          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
                            v{policy.version}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mb-3">
                          {policy.description}
                        </p>
                        <div className="flex items-center gap-6 text-sm text-gray-600">
                          <div>
                            <span className="font-medium">Package:</span>{' '}
                            <span className="font-mono text-xs">{policy.package}</span>
                          </div>
                          <div>
                            <span className="font-medium">Rules:</span>{' '}
                            <span className="font-semibold text-gray-900">{policy.ruleCount}</span>
                          </div>
                          <div>
                            <span className="font-medium">Tests:</span>{' '}
                            <span className="font-semibold text-gray-900">{policy.testCount}</span>
                          </div>
                          <div>
                            <span className="font-medium">Modified:</span>{' '}
                            <span className="text-xs">{new Date(policy.lastModified).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                      <div className="ml-4 flex-shrink-0">
                        <svg
                          className="h-5 w-5 text-gray-400"
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                    </div>
                  </div>
                </Link>
              </li>
            ))
          )}
        </ul>
      </div>

      {/* Help Text */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-blue-900 mb-2">
          ℹ️ About Authorization Policies
        </h3>
        <p className="text-sm text-blue-800">
          These policies are written in <strong>Rego</strong> (Open Policy Agent language) and implement the 
          <strong> ACP-240 Data-Centric Security</strong> framework. Each policy evaluates subject attributes 
          (clearance, country, COI), resource requirements (classification, releasability), and context 
          (time, device compliance) to make authorization decisions. Click on a policy to view its source code 
          and test decisions interactively.
        </p>
      </div>
    </PageLayout>
  );
}

