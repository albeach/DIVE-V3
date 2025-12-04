import React from 'react';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import AdminBreadcrumbs from '@/components/admin/AdminBreadcrumbs';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen w-full flex-col lg:flex-row">
      <AdminSidebar />
      <div className="flex flex-col flex-1 min-h-screen">
        <header className="flex h-14 lg:h-[60px] items-center gap-4 border-b bg-gray-100/40 px-6 dark:bg-gray-800/40">
          <div className="w-full flex-1">
            <AdminBreadcrumbs />
          </div>
        </header>
        <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6 bg-gray-50 dark:bg-gray-900">
          {children}
        </main>
      </div>
    </div>
  );
}

