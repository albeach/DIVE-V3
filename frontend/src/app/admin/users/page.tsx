/**
 * User Management Page
 * 
 * Manage Keycloak users, clearances, and access controls
 * 
 * Integrates:
 * - PageLoader from shared components
 * - RequirePermission for access control
 * - ThemedSection for consistent styling
 * - RefreshButton for consistent UX
 * - SessionBar for session awareness
 */

'use client';

import React from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import PageLayout from '@/components/layout/page-layout';
import UserList from '@/components/admin/users/user-list';
import { 
  PageLoader, 
  RefreshButton,
  ThemedSection,
  SessionBar,
  AdminPageTransition,
  AnimatedButton,
} from '@/components/admin/shared';
import { RequirePermission, useAdminPermissions } from '@/lib/admin-permissions';
import { Users, UserPlus, Shield } from 'lucide-react';
import { InteractiveBreadcrumbs } from '@/components/ui/interactive-breadcrumbs';

export default function UsersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { can } = useAdminPermissions();
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const refreshKey = React.useRef(0);

  // Redirect to login if not authenticated
  React.useEffect(() => {
    if (status !== 'loading' && status === 'unauthenticated') {
      router.push('/');
    }
  }, [status, router]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    refreshKey.current += 1;
    // Simulate refresh delay for UX
    setTimeout(() => setIsRefreshing(false), 500);
  };

  if (status === 'loading') {
    return <PageLoader message="Loading User Management..." />;
  }

  if (status === 'unauthenticated') {
    return null;
  }

  return (
    <PageLayout
      user={session?.user || {}}
    >
      <AdminPageTransition pageKey="/admin/users">
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
        {/* Header */}
        <div className="mb-6 bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-slate-200 dark:border-gray-700 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg">
                <Users className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 data-testid="admin-heading" className="text-2xl font-bold text-gray-900 dark:text-white">
                  User Management
                </h1>
                <p className="text-gray-500 dark:text-gray-400">
                  Manage users, clearances, and access controls
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Session indicator */}
              <SessionBar />
              
              {/* Add User button - only if permitted */}
              <RequirePermission permission="users:create">
                <AnimatedButton
                  onClick={() => router.push('/admin/users/new')}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-md"
                >
                  <UserPlus className="w-4 h-4" />
                  Add User
                </AnimatedButton>
              </RequirePermission>
              
              {/* Refresh button */}
              <RefreshButton 
                onClick={handleRefresh} 
                loading={isRefreshing}
              />
            </div>
          </div>

          {/* Permission badges */}
          <div className="mt-4 flex flex-wrap gap-2">
            {can('users:create') && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded text-xs font-medium">
                <Shield className="w-3 h-3" />
                Create
              </span>
            )}
            {can('users:update') && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded text-xs font-medium">
                <Shield className="w-3 h-3" />
                Edit
              </span>
            )}
            {can('users:delete') && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded text-xs font-medium">
                <Shield className="w-3 h-3" />
                Delete
              </span>
            )}
            {can('users:assign-roles') && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded text-xs font-medium">
                <Shield className="w-3 h-3" />
                Assign Roles
              </span>
            )}
          </div>
        </div>

        {/* User List - wrapped in themed section */}
        <ThemedSection>
          <UserList key={refreshKey.current} />
        </ThemedSection>
      </div>
      </AdminPageTransition>
    </PageLayout>
  );
}
