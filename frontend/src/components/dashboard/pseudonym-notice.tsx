'use client';

import { getPseudonymFromUser } from '@/lib/pseudonym-generator';
import { useState } from 'react';

interface User {
  uniqueID?: string | null;
  name?: string | null;
  email?: string | null;
  clearance?: string | null;
  countryOfAffiliation?: string | null;
  acpCOI?: string[] | null;
}

interface PseudonymNoticeProps {
  user: User;
}

export function PseudonymNotice({ user }: PseudonymNoticeProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const pseudonym = getPseudonymFromUser(user as any);

  return (
    <div className="group rounded-2xl bg-gradient-to-br from-cyan-50 via-blue-50 to-indigo-50 p-6 shadow-lg border-2 border-cyan-200 hover:border-cyan-300 transition-all duration-500 animate-fade-in-up relative overflow-hidden">
      {/* Animated gradient border */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-400 animate-gradient-x opacity-20" />
      </div>

      {/* Floating particles effect */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute w-2 h-2 bg-cyan-400 rounded-full top-4 left-1/4 animate-float opacity-40" style={{ animationDelay: '0s' }} />
        <div className="absolute w-1.5 h-1.5 bg-blue-400 rounded-full top-8 right-1/3 animate-float opacity-40" style={{ animationDelay: '1s' }} />
        <div className="absolute w-2 h-2 bg-indigo-400 rounded-full bottom-6 left-2/3 animate-float opacity-40" style={{ animationDelay: '2s' }} />
      </div>

      <div className="relative z-10">
        <div className="flex items-start space-x-4">
          {/* Animated Icon */}
          <div className="flex-shrink-0">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-400 to-indigo-500 rounded-2xl blur-lg animate-pulse opacity-50" />
              <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-indigo-600 flex items-center justify-center shadow-lg transform group-hover:scale-110 group-hover:rotate-3 transition-all duration-500">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              {/* Pulse ring */}
              <div className="absolute inset-0 rounded-2xl border-2 border-cyan-400 animate-ping opacity-20" />
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-bold text-gray-900 flex items-center">
                <span className="mr-2">🌊</span>
                Your Pseudonym
              </h3>
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="px-3 py-1 text-xs font-bold text-cyan-700 hover:text-cyan-900 bg-white/60 hover:bg-white rounded-full transition-all duration-300 hover:scale-105 flex items-center space-x-1 shadow-sm"
              >
                <span>{isExpanded ? 'Less' : 'Why?'}</span>
                <svg 
                  className={`w-3 h-3 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>

            {/* Pseudonym Display */}
            <div className="mb-3">
              <div className="inline-flex items-center px-4 py-2 rounded-xl bg-white/80 backdrop-blur-sm border-2 border-cyan-300 shadow-md group-hover:shadow-lg transition-all duration-300">
                <span className="text-xl font-bold bg-gradient-to-r from-cyan-600 to-indigo-600 bg-clip-text text-transparent">
                  {pseudonym}
                </span>
              </div>
            </div>

            {/* Brief explanation */}
            <p className="text-sm text-gray-700 leading-relaxed">
              <span className="font-semibold text-cyan-700">Privacy Protection:</span> We use a pseudonym instead of your real name to comply with <span className="font-mono text-xs bg-white/60 px-1.5 py-0.5 rounded">ACP-240 Section 6.2</span> PII minimization requirements.
            </p>

            {/* Expandable detailed explanation */}
            <div 
              className={`transition-all duration-500 ease-in-out overflow-hidden ${
                isExpanded ? 'max-h-96 opacity-100 mt-4' : 'max-h-0 opacity-0'
              }`}
            >
              <div className="pt-4 border-t-2 border-white/50">
                <div className="space-y-3">
                  <div className="flex items-start space-x-3 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-cyan-200 flex items-center justify-center mt-0.5">
                      <svg className="w-3.5 h-3.5 text-cyan-700" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-900">Generated from Your Unique ID</p>
                      <p className="text-xs text-gray-600 mt-0.5">Your pseudonym is deterministically generated from your UUID, ensuring consistency across sessions.</p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3 animate-fade-in-up" style={{ animationDelay: '200ms' }}>
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-200 flex items-center justify-center mt-0.5">
                      <svg className="w-3.5 h-3.5 text-blue-700" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-900">No PII in Logs or Audit Trails</p>
                      <p className="text-xs text-gray-600 mt-0.5">Only your pseudonym appears in system logs, protecting your personal information.</p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3 animate-fade-in-up" style={{ animationDelay: '300ms' }}>
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-200 flex items-center justify-center mt-0.5">
                      <svg className="w-3.5 h-3.5 text-indigo-700" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-900">Coalition Security Standard</p>
                      <p className="text-xs text-gray-600 mt-0.5">NATO ACP-240 requires PII minimization in federated environments to protect user privacy across partner nations.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
