'use client';

import { useState } from 'react';

interface AccordionItemProps {
  title: string;
  icon: React.ReactNode;
  iconBgColor: string;
  iconColor: string;
  children: React.ReactNode;
  delay: string;
  isOpen: boolean;
  onToggle: () => void;
}

function AccordionItem({ title, icon, iconBgColor, iconColor, children, delay, isOpen, onToggle }: AccordionItemProps) {
  return (
    <div className={`bg-white/80 backdrop-blur-sm rounded-xl border border-amber-200 shadow-sm hover:shadow-md transition-all duration-300 animate-fade-in-up overflow-hidden`} style={{ animationDelay: delay }}>
      <button
        onClick={onToggle}
        className="w-full flex items-start space-x-3 p-4 text-left hover:bg-amber-50/50 transition-colors duration-200"
      >
        <div className={`flex-shrink-0 w-8 h-8 rounded-lg ${iconBgColor} flex items-center justify-center`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-bold ${iconColor} uppercase tracking-wide`}>{title}</p>
        </div>
        <div className="flex-shrink-0">
          <svg 
            className={`w-5 h-5 text-gray-500 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {isOpen && (
        <div className="px-4 pb-4 animate-fade-in-up">
          <div className="text-sm text-gray-700 leading-relaxed pt-2 border-t border-amber-100">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

export function InformationPanelModern() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggleAccordion = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="group rounded-2xl bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 p-6 shadow-lg border-2 border-amber-200 hover:border-amber-300 transition-all duration-500 animate-fade-in-up relative overflow-hidden" style={{ animationDelay: '100ms' }}>
      {/* Animated gradient border */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
        <div className="absolute inset-0 bg-gradient-to-r from-amber-400 via-orange-400 to-yellow-400 animate-gradient-x opacity-20" />
      </div>

      {/* Floating particles effect */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute w-2 h-2 bg-amber-400 rounded-full top-4 right-1/4 animate-float opacity-40" style={{ animationDelay: '0.5s' }} />
        <div className="absolute w-1.5 h-1.5 bg-orange-400 rounded-full top-8 left-1/3 animate-float opacity-40" style={{ animationDelay: '1.5s' }} />
        <div className="absolute w-2 h-2 bg-yellow-400 rounded-full bottom-6 right-2/3 animate-float opacity-40" style={{ animationDelay: '2.5s' }} />
      </div>

      <div className="relative z-10">
        <div className="flex items-start space-x-4">
          {/* Animated Icon */}
          <div className="flex-shrink-0">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl blur-lg animate-pulse opacity-50" />
              <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg transform group-hover:scale-110 group-hover:rotate-3 transition-all duration-500">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              {/* Pulse ring */}
              <div className="absolute inset-0 rounded-2xl border-2 border-amber-400 animate-ping opacity-20" />
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-gray-900 flex items-center mb-4">
              <span className="mr-2">💡</span>
              Information & Support
            </h3>

            {/* Accordion Items */}
            <div className="space-y-2">
              <AccordionItem
                title="OPA Policy Engine"
                icon={
                  <svg className="w-4 h-4 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                }
                iconBgColor="bg-indigo-100"
                iconColor="text-indigo-900"
                delay="200ms"
                isOpen={openIndex === 0}
                onToggle={() => toggleAccordion(0)}
              >
                <strong>Open Policy Agent (OPA)</strong> evaluates every resource access using <span className="font-semibold text-gray-900">attribute-based policies</span> (ABAC). Decisions consider clearance, country, COI membership, and classification levels.
              </AccordionItem>

              <AccordionItem
                title="Key Access Service (KAS)"
                icon={
                  <svg className="w-4 h-4 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                  </svg>
                }
                iconBgColor="bg-purple-100"
                iconColor="text-purple-900"
                delay="300ms"
                isOpen={openIndex === 1}
                onToggle={() => toggleAccordion(1)}
              >
                <strong>KAS</strong> manages cryptographic keys for encrypted documents. Each key request re-evaluates authorization policies in real-time, ensuring <span className="font-semibold text-gray-900">policy-bound encryption</span>.
              </AccordionItem>

              <AccordionItem
                title="ABAC Authorization"
                icon={
                  <svg className="w-4 h-4 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                    <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                  </svg>
                }
                iconBgColor="bg-emerald-100"
                iconColor="text-emerald-900"
                delay="400ms"
                isOpen={openIndex === 2}
                onToggle={() => toggleAccordion(2)}
              >
                Access decisions use <span className="font-semibold text-gray-900">ACP-240 compliant policies</span>: clearance level, releasability (countries), COI tags, and temporal constraints (embargoes).
              </AccordionItem>

              <AccordionItem
                title="Identity Federation"
                icon={
                  <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
                    <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
                  </svg>
                }
                iconBgColor="bg-blue-100"
                iconColor="text-blue-900"
                delay="500ms"
                isOpen={openIndex === 3}
                onToggle={() => toggleAccordion(3)}
              >
                <strong>Keycloak</strong> brokers identities from partner IdPs and normalizes claims. Your attributes are <span className="font-semibold text-gray-900">read-only</span> and managed by your home IdP administrator.
              </AccordionItem>

              {/* Support Action */}
              <div className="animate-fade-in-up pt-2" style={{ animationDelay: '600ms' }}>
                <button className="w-full px-5 py-3 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold rounded-xl shadow-md hover:shadow-lg hover:scale-105 transition-all duration-300 flex items-center justify-center group/btn btn-hover-glow">
                  <svg className="w-5 h-5 mr-2 group-hover/btn:rotate-12 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span>Contact Support</span>
                  <svg className="w-4 h-4 ml-2 group-hover/btn:translate-x-1 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
