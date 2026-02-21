"use client";

import { useSession } from "next-auth/react";

export function UserInfo() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <div className="rounded-xl bg-white shadow-md overflow-hidden animate-pulse">
        <div className="h-1.5 bg-gray-300" />
        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="h-8 w-8 bg-gray-300 rounded-full" />
            <div className="h-10 w-10 bg-gray-200 rounded-full" />
          </div>
          <div className="h-3 bg-gray-300 rounded w-1/3 mb-3" />
          <div className="h-8 bg-gray-200 rounded mb-3" />
          <div className="h-8 bg-gray-200 rounded mb-3" />
          <div className="h-8 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="rounded-xl bg-white shadow-md overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-[#4396ac] to-[#90d56a]" />
        <div className="p-5">
          <p className="text-gray-500">Not authenticated</p>
        </div>
      </div>
    );
  }

  return (
    <div className="group relative rounded-xl bg-white shadow-md hover:shadow-xl transition-all duration-500 transform hover:-translate-y-1 overflow-hidden animate-fade-in-up" style={{ animationDelay: '150ms' }}>
      {/* Custom gradient accent bar - matches stats cards */}
      <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#4396ac] to-[#90d56a]" />
      
      {/* Content */}
      <div className="relative p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="text-3xl animate-float">
            👤
          </div>
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#4396ac] to-[#90d56a] flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-sm">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>
        
        <p className="text-xs text-gray-600 font-semibold mb-2 uppercase tracking-wider">
          Identity Attributes
        </p>
        
        {/* Stacked Values - clean and minimal */}
        <div className="space-y-2">
          <div className="flex items-start">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-500 mb-0.5">User ID</p>
              <p className="text-sm font-mono font-semibold text-gray-900 truncate group-hover:text-[#4396ac] transition-colors duration-300">
                {session.user?.uniqueID || 'Not Available'}
              </p>
            </div>
          </div>
          
          <div className="flex items-start">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-500 mb-0.5">Name</p>
              <p className="text-sm font-mono font-semibold text-gray-900 truncate group-hover:text-[#4396ac] transition-colors duration-300">
                {session.user?.name || 'Not Available'}
              </p>
            </div>
          </div>
          
          <div className="flex items-start">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-500 mb-0.5">Email</p>
              <p className="text-sm font-mono font-semibold text-gray-900 truncate group-hover:text-[#4396ac] transition-colors duration-300">
                {session.user?.email || 'Not Available'}
              </p>
            </div>
          </div>
        </div>

        {/* Animated border - matches stats cards */}
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-100">
          <div className="h-full bg-gradient-to-r from-[#4396ac] to-[#90d56a] w-0 group-hover:w-full transition-all duration-700 ease-out" />
        </div>
      </div>
    </div>
  );
}
