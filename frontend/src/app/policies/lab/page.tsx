'use client';

import { useState } from 'react';
import PageLayout from '@/components/layout/page-layout';
import { useSession } from 'next-auth/react';
import { redirect } from 'next/navigation';
import UploadPolicyModal from '@/components/policies-lab/UploadPolicyModal';
import PolicyListTab from '@/components/policies-lab/PolicyListTab';
import EvaluateTab from '@/components/policies-lab/EvaluateTab';
import MappingTab from '@/components/policies-lab/MappingTab';

type TabType = 'list' | 'evaluate' | 'mapping';

export default function PoliciesLabPage() {
  const { data: session, status } = useSession();
  const [activeTab, setActiveTab] = useState<TabType>('list');
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!session) {
    redirect('/login');
  }

  const tabs: { id: TabType; label: string; icon: string }[] = [
    { id: 'list', label: 'My Policies', icon: '📝' },
    { id: 'evaluate', label: 'Evaluate', icon: '🧪' },
    { id: 'mapping', label: 'XACML ↔ Rego', icon: '🗺️' },
  ];

  const handleUploadSuccess = () => {
    setRefreshTrigger(prev => prev + 1);
    setActiveTab('list');
  };

  return (
    <PageLayout
      user={session.user}
      breadcrumbs={[
        { label: 'Policies', href: '/policies' },
        { label: 'Lab', href: null },
      ]}
    >
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">
              🧪 Policies Lab
            </h2>
            <p className="text-gray-600 max-w-3xl">
              Interactive environment for comparing and testing OPA Rego and XACML 3.0 authorization policies. 
              Upload policies, build test inputs, and compare decisions side-by-side.
            </p>
          </div>
          <button
            onClick={() => setUploadModalOpen(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Upload Policy
          </button>
        </div>

        {/* Feature Badges */}
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="inline-flex items-center px-3 py-1 rounded-full bg-blue-100 text-blue-800 font-medium">
            📝 Rego + XACML Support
          </span>
          <span className="inline-flex items-center px-3 py-1 rounded-full bg-green-100 text-green-800 font-medium">
            🔒 Sandboxed Evaluation
          </span>
          <span className="inline-flex items-center px-3 py-1 rounded-full bg-purple-100 text-purple-800 font-medium">
            📊 Side-by-Side Comparison
          </span>
          <span className="inline-flex items-center px-3 py-1 rounded-full bg-amber-100 text-amber-800 font-medium">
            🧪 Interactive Testing
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors
                ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              <span className="mr-2">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        {activeTab === 'list' && (
          <PolicyListTab refreshTrigger={refreshTrigger} />
        )}
        {activeTab === 'evaluate' && (
          <EvaluateTab />
        )}
        {activeTab === 'mapping' && (
          <MappingTab />
        )}
      </div>

      {/* Upload Modal */}
      <UploadPolicyModal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onSuccess={handleUploadSuccess}
      />
    </PageLayout>
  );
}
