'use client';

import { ReactNode } from 'react';

interface StatsCardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  delay?: number;
}

export function StatsCard({ label, value, icon, delay = 0 }: StatsCardProps) {
  return (
    <div 
      className="group relative rounded-xl overflow-hidden shadow-md hover:shadow-xl transition-all duration-500 transform hover:-translate-y-1 animate-fade-in-up bg-white"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Custom gradient accent bar - 508 compliant with dark overlay for text */}
      <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#4396ac] to-[#90d56a]" />
      
      {/* Content */}
      <div className="relative p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-3xl animate-float">
            {icon}
          </div>
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#4396ac] to-[#90d56a] flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-sm">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>
        
        <p className="text-xs text-gray-600 font-semibold mb-1.5 uppercase tracking-wider">
          {label}
        </p>
        
        <p className="text-2xl font-bold text-gray-900 group-hover:text-[#4396ac] transition-colors duration-300 truncate">
          {value}
        </p>

        {/* Animated border */}
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-100">
          <div className="h-full bg-gradient-to-r from-[#4396ac] to-[#90d56a] w-0 group-hover:w-full transition-all duration-700 ease-out" />
        </div>
      </div>
    </div>
  );
}
