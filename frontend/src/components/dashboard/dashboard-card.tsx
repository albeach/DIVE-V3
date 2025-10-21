'use client';

import Link from 'next/link';
import { ReactNode } from 'react';

interface DashboardCardProps {
  href?: string;
  title: string;
  description: string;
  icon: ReactNode;
  gradient: string;
  delay?: number;
}

export function DashboardCard({ 
  href, 
  title, 
  description, 
  icon,
  gradient,
  delay = 0 
}: DashboardCardProps) {
  const content = (
    <div className="relative h-full overflow-hidden rounded-2xl">
      {/* Glassmorphism background with gradient */}
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-5`} />
      <div className="absolute inset-0 backdrop-blur-xl bg-white/80 border-2 border-gray-200/50" />
      
      {/* Animated gradient border on hover */}
      <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br ${gradient} p-[2px] rounded-2xl`}>
        <div className="h-full w-full bg-white rounded-2xl" />
      </div>

      {/* Floating gradient orb effect */}
      <div className={`absolute -top-24 -right-24 w-48 h-48 bg-gradient-to-br ${gradient} opacity-20 blur-3xl group-hover:opacity-30 transition-opacity duration-700 rounded-full`} />
      
      {/* Content */}
      <div className="relative h-full p-6 flex flex-col">
        {/* Icon container with gradient */}
        <div className="mb-6">
          <div className="relative inline-block">
            {/* Glow effect behind icon */}
            <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-20 blur-xl group-hover:opacity-40 transition-opacity duration-500 rounded-2xl scale-110`} />
            {/* Icon background */}
            <div className={`relative w-14 h-14 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-all duration-500`}>
              {icon}
            </div>
            {/* Pulse ring on hover */}
            <div className={`absolute inset-0 rounded-2xl border-2 bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-20 group-hover:scale-125 transition-all duration-700`} />
          </div>
        </div>
        
        {/* Title */}
        <h3 className="text-xl font-bold text-gray-900 mb-3 group-hover:bg-gradient-to-r group-hover:from-[#4396ac] group-hover:to-[#90d56a] group-hover:bg-clip-text group-hover:text-transparent transition-all duration-300">
          {title}
        </h3>
        
        {/* Description */}
        <p className="text-sm text-gray-600 leading-relaxed mb-6 flex-grow">
          {description}
        </p>

        {/* Arrow indicator with gradient */}
        {href && (
          <div className="flex items-center justify-end">
            <div className="flex items-center space-x-2 text-sm font-semibold text-gray-700 group-hover:text-gray-900 transition-colors duration-300">
              <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">Explore</span>
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center group-hover:scale-110 group-hover:translate-x-1 transition-all duration-300 shadow-md`}>
                <svg 
                  className="w-5 h-5 text-white" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom gradient bar that grows on hover */}
      <div className="absolute bottom-0 left-0 right-0 h-1 overflow-hidden rounded-b-2xl">
        <div className={`h-full bg-gradient-to-r ${gradient} w-0 group-hover:w-full transition-all duration-700 ease-out`} />
      </div>
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="group block shadow-lg hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-2 animate-fade-in-up"
        style={{ animationDelay: `${delay}ms` }}
      >
        {content}
      </Link>
    );
  }

  return (
    <div 
      className="shadow-lg animate-fade-in-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      {content}
    </div>
  );
}
