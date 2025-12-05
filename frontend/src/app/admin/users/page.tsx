'use client';

import { useSession } from 'next-auth/react';
import AdminLayout from '../layout';
import UserList from '@/components/admin/users/user-list';

export default function UsersPage() {
  const { data: session } = useSession();

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage users, clearances, and access controls for your sovereign node.
          </p>
        </div>

        <UserList />
      </div>
    </AdminLayout>
  );
}



