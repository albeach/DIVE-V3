'use client';

import { useSession } from 'next-auth/react';
import { redirect } from 'next/navigation';
import PageLayout from '@/components/layout/page-layout';
import PolicyEditorPanel from '@/components/policies/PolicyEditorPanel';

export default function PolicyEditorPage() {
  const { data: session, status } = useSession();

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

  return (
    <PageLayout 
      user={session.user}
      breadcrumbs={[
        { label: 'Policies', href: '/policies' },
        { label: 'Policy Editor', href: null }
      ]}
    >
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          📝 OPA Policy Editor
        </h2>
        <p className="text-gray-600 dark:text-gray-400 max-w-4xl">
          Create, edit, and validate Rego policies with templates, visual wizard, and local linting. 
          Push drafts directly to Policies Lab for evaluation and testing.
        </p>
      </div>

      <PolicyEditorPanel />
    </PageLayout>
  );
}
