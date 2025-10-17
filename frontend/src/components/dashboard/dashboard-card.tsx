'use client';

import Link from 'next/link';
import { ReactNode } from 'react';

interface DashboardCardProps {
  href?: string;
  title: string;
  description: string;
  icon: ReactNode;
  delay?: number;
}

export function DashboardCard({ 
  href, 
  title, 
  description, 
  icon, 
  delay = 0 
}: DashboardCardProps) {
  const content = (
    <div className="relative h-full overflow-hidden bg-white rounded-xl border border-gray-200">
      {/* Custom gradient accent - top bar */}
      <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-[#4396ac] to-[#90d56a]" />
      
      {/* Content */}
      <div className="relative h-full p-6 flex flex-col">
        <div className="flex items-start justify-between mb-4">
          <div className="text-4xl animate-float">
            {icon}
          </div>
          {href && (
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#4396ac] to-[#90d56a] flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-sm">
              <svg 
                className="w-4 h-4 text-white group-hover:translate-x-0.5 transition-transform duration-300" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          )}
        </div>
        
        <h3 className="text-lg font-bold text-gray-900 mb-2 group-hover:text-[#4396ac] transition-colors duration-300">
          {title}
        </h3>
        
        <p className="text-sm text-gray-600 leading-relaxed">
          {description}
        </p>

        {/* Hover effect - gradient border bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-100">
          <div className="h-full bg-gradient-to-r from-[#4396ac] to-[#90d56a] w-0 group-hover:w-full transition-all duration-500 ease-out" />
        </div>
      </div>
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="group block shadow-md hover:shadow-xl transition-all duration-500 transform hover:-translate-y-2 animate-fade-in-up rounded-xl"
        style={{ animationDelay: `${delay}ms` }}
      >
        {content}
      </Link>
    );
  }

  return (
    <div 
      className="shadow-md animate-fade-in-up rounded-xl"
      style={{ animationDelay: `${delay}ms` }}
    >
      {content}
    </div>
  );
}

