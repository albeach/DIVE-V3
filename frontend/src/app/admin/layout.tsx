import React from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { AdminCommandPaletteWrapper } from '@/components/admin/AdminCommandPaletteWrapper';

/**
 * Admin Layout with Role-Based Access Control
 *
 * This layout ONLY handles authorization - it checks for admin role.
 * Admin pages use the standard PageLayout for consistent navigation.
 *
 * Requires 'dive-admin', 'admin', or 'super_admin' role to access admin pages.
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

  // Render children with global command palette
  return (
    <>
      {children}
      <AdminCommandPaletteWrapper />
    </>
  );
}
