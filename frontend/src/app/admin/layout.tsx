import React from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import AdminBreadcrumbs from '@/components/admin/AdminBreadcrumbs';

/**
 * Admin Layout with Role-Based Access Control
 * 
 * Requires 'dive-admin' role to access admin pages.
 * Regular users are redirected to dashboard.
 * Unauthenticated users are redirected to login.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side authentication check
  const session = await auth();

  // Not authenticated - redirect to home
  if (!session || !session.user) {
    redirect('/');
  }

  // Check for admin role
  const userRoles = session.user.roles || [];
  const isAdmin = userRoles.includes('dive-admin') || 
                  userRoles.includes('admin') ||
                  userRoles.includes('super_admin');

  // Not an admin - redirect to dashboard with message
  if (!isAdmin) {
    redirect('/dashboard?error=unauthorized');
  }

  return (
    <div className="flex min-h-screen w-full flex-col lg:flex-row">
      <AdminSidebar />
      <div className="flex flex-col flex-1 min-h-screen">
        <header className="flex h-14 lg:h-[60px] items-center gap-4 border-b bg-gray-100/40 px-6 dark:bg-gray-800/40">
          <div className="w-full flex-1">
            <AdminBreadcrumbs />
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
              Admin
            </span>
            <span>{session.user.name || session.user.email}</span>
          </div>
        </header>
        <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6 bg-gray-50 dark:bg-gray-900">
          {children}
        </main>
      </div>
    </div>
  );
}
