"use client";

import { useSession } from "next-auth/react";

export function UserInfo() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <div className="p-6 bg-white border border-gray-200 rounded-lg">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-300 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            <div className="h-3 bg-gray-200 rounded"></div>
            <div className="h-3 bg-gray-200 rounded w-5/6"></div>
            <div className="h-3 bg-gray-200 rounded w-4/6"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="p-6 bg-white border border-gray-200 rounded-lg">
        <p className="text-gray-500">Not authenticated</p>
      </div>
    );
  }

  return (
    <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900 mb-4 border-b pb-2">
        Identity Attributes
      </h3>
      <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex flex-col">
          <dt className="text-sm font-medium text-gray-500 mb-1">User ID</dt>
          <dd className="font-mono text-sm text-gray-900 bg-gray-50 px-3 py-2 rounded">
            {session.user?.uniqueID || 'Not Available'}
          </dd>
        </div>
        
        <div className="flex flex-col">
          <dt className="text-sm font-medium text-gray-500 mb-1">Name</dt>
          <dd className="font-mono text-sm text-gray-900 bg-gray-50 px-3 py-2 rounded">
            {session.user?.name || 'Not Available'}
          </dd>
        </div>
        
        <div className="flex flex-col">
          <dt className="text-sm font-medium text-gray-500 mb-1">Email</dt>
          <dd className="font-mono text-sm text-gray-900 bg-gray-50 px-3 py-2 rounded">
            {session.user?.email || 'Not Available'}
          </dd>
        </div>
        
        <div className="flex flex-col">
          <dt className="text-sm font-medium text-gray-500 mb-1">Clearance Level</dt>
          <dd className="font-mono text-sm font-semibold text-gray-900 bg-orange-50 px-3 py-2 rounded border-l-4 border-orange-500">
            {session.user?.clearance || 'Not Set'}
          </dd>
        </div>
        
        <div className="flex flex-col">
          <dt className="text-sm font-medium text-gray-500 mb-1">Country of Affiliation</dt>
          <dd className="font-mono text-sm text-gray-900 bg-blue-50 px-3 py-2 rounded border-l-4 border-blue-500">
            {session.user?.countryOfAffiliation || 'Not Set'}
          </dd>
        </div>
        
        <div className="flex flex-col">
          <dt className="text-sm font-medium text-gray-500 mb-1">Communities of Interest</dt>
          <dd className="font-mono text-xs text-gray-900 bg-purple-50 px-3 py-2 rounded border-l-4 border-purple-500">
            {session.user?.acpCOI && session.user.acpCOI.length > 0 
              ? session.user.acpCOI.join(', ')
              : 'None'}
          </dd>
        </div>
      </dl>
      
      <div className="mt-6 pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-500">
          <span className="font-semibold">Note:</span> These attributes are used for authorization decisions
          when accessing classified documents. Clearance level must meet or exceed document classification.
        </p>
      </div>
    </div>
  );
}

