import { auth } from "@/auth";
import { redirect } from "next/navigation";
import PageLayout from "@/components/layout/page-layout";
import Link from "next/link";
import PolicyExplorer from "@/components/policies/PolicyExplorer";
import { PolicyComparison } from "@/components/policies/PolicyComparison";
import type { IPolicyMetadata, IPolicyStats } from "@/types/policy.types";

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
          📜 Authorization Policy Suite
        </h2>
        <p className="text-gray-600 max-w-4xl">
          Explore the production OPA (Open Policy Agent) policies that power DIVE’s coalition ABAC engine.
          Filter live metadata, jump into detailed rule explainers, or craft a new Rego draft with the in-browser editor.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="inline-flex items-center px-2 py-1 rounded-md bg-blue-100 text-blue-800 font-semibold">
            🛡️ ACP-240 + STANAG 4774/5636
          </span>
          <span className="inline-flex items-center px-2 py-1 rounded-md bg-emerald-100 text-emerald-800 font-semibold">
            🔁 Fail-Secure Pattern
          </span>
          <Link
            href="/policies/lab"
            className="inline-flex items-center px-3 py-1 rounded-md bg-gray-900 text-white text-xs font-semibold hover:bg-gray-800 transition-colors"
          >
            Launch Policies Lab →
          </Link>
          <Link
            href="/policies/editor"
            className="inline-flex items-center px-3 py-1 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
          >
            Open Policy Editor →
          </Link>
        </div>
      </div>

      {/* Policy Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
        <div className="bg-white shadow rounded-lg p-6 border border-blue-100">
          <p className="text-sm text-gray-500 mb-1">Total Policies</p>
          <p className="text-3xl font-bold text-gray-900">{stats.totalPolicies}</p>
          <p className="text-xs text-gray-400 mt-2">System-managed authorization packages</p>
        </div>
        <div className="bg-white shadow rounded-lg p-6 border border-green-100">
          <p className="text-sm text-gray-500 mb-1">Active Rules</p>
          <p className="text-3xl font-bold text-gray-900">{stats.activeRules}</p>
          <p className="text-xs text-gray-400 mt-2">Fail-secure rule checks across the suite</p>
        </div>
        <div className="bg-white shadow rounded-lg p-6 border border-purple-100">
          <p className="text-sm text-gray-500 mb-1">Test Cases</p>
          <p className="text-3xl font-bold text-gray-900">{stats.totalTests}</p>
          <p className="text-xs text-gray-400 mt-2">OPA unit tests validating decisions</p>
        </div>
        <div className="bg-white shadow rounded-lg p-6 border border-amber-100">
          <p className="text-sm text-gray-500 mb-1">Last Sync</p>
          <p className="text-3xl font-bold text-gray-900">
            {new Date(stats.lastUpdated).toLocaleDateString()}
          </p>
          <p className="text-xs text-gray-400 mt-2">OPA bundle refreshed</p>
        </div>
      </div>

      <PolicyExplorer policies={policies} />

      <div className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white shadow rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Policy Standards Lens</h3>
            <span className="text-xs text-gray-500">5663 vs 240 vs Unified</span>
          </div>
          <PolicyComparison />
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-blue-900 mb-2">Why Rego?</h3>
          <p className="text-sm text-blue-900 mb-4">
            Rego lets us encode ACP-240 rules as readable, testable logic. Each violation function mirrors a real coalition guardrail:
            authentication, clearance, releasability, COI, embargo, and ZTDF integrity. Keep logs lean—decisions capture uniqueID,
            resourceId, decision, and rationale for 90-day audit trails.
          </p>
          <ul className="text-sm text-blue-900 space-y-2">
            <li>• Default deny with explicit violation checks</li>
            <li>• Structured JSON output with obligations for KAS</li>
            <li>• 41+ automated tests via `opa test`</li>
            <li>• Ready for Labs: push drafts directly from the editor</li>
          </ul>
        </div>
      </div>
    </PageLayout>
  );
}

