'use client';

/**
 * Enhanced Landing Page Preview - 2025 UI/UX Design Patterns
 * 
 * This is a PREVIEW page showcasing modern design enhancements.
 * Access at: /landing-preview
 * 
 * Features demonstrated:
 * - Bento Grid Layout
 * - Enhanced Micro-interactions
 * - Fluid Typography
 * - Status Indicators
 * - Progressive Disclosure
 * - Loading Skeletons
 * - Spatial Depth
 */

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { IdpSelector } from '@/components/auth/idp-selector';
import { Globe2, Target, Shield, MapPin, Users, Lock, Sparkles, ArrowRight, CheckCircle2, Activity, Zap } from 'lucide-react';
import { 
  InstanceHeroBadge, 
  IdpSectionHeader, 
  CoalitionPartnersFooter,
  LocalizedFeatureBadges,
  LocalizedPilotCapabilities 
} from '@/components/ui/instance-hero-badge';
import { useInstanceTheme } from '@/components/ui/theme-provider';
import Link from 'next/link';

export default function LandingPreviewPage() {
  const router = useRouter();
  const { instanceCode, instanceName, strings } = useInstanceTheme();
  const [isVisible, setIsVisible] = useState(false);
  const [ripples, setRipples] = useState<Array<{x: number, y: number, id: number}>>([]);
  const rippleId = useRef(0);
  const heroRef = useRef<HTMLDivElement>(null);
  const featuresRef = useRef<HTMLDivElement>(null);

  // Intersection Observer for scroll animations
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { threshold: 0.1 }
    );
    
    if (heroRef.current) observer.observe(heroRef.current);
    if (featuresRef.current) observer.observe(featuresRef.current);
    
    return () => observer.disconnect();
  }, []);

  // Ripple effect handler
  const handleRipple = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const id = rippleId.current++;
    setRipples([...ripples, { x, y, id }]);
    setTimeout(() => setRipples(prev => prev.filter(r => r.id !== id)), 600);
  };

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: 'var(--instance-banner-bg, linear-gradient(135deg, #1a365d 0%, #2b6cb0 100%))' }}>
      {/* Preview Banner */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-purple-600 via-pink-600 to-orange-600 text-white py-2 px-4 text-center text-sm font-bold shadow-lg animate-pulse">
        🎨 PREVIEW MODE - Enhanced 2025 UI/UX Design Patterns | 
        <Link href="/" className="ml-2 underline hover:no-underline">← Back to Original</Link>
      </div>

      {/* Enhanced Digital Grid Background */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute inset-0" style={{
          backgroundImage: `
            linear-gradient(rgba(0, 154, 179, 0.3) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 154, 179, 0.3) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
          animation: 'backgroundScroll 20s linear infinite'
        }}></div>
      </div>

      {/* Floating Particles */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-white/30 rounded-full animate-float"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 4}s`,
              animationDuration: `${4 + Math.random() * 4}s`
            }}
          />
        ))}
      </div>

      {/* Main Content */}
      <div className="relative pt-16 pb-12 px-4 min-h-screen flex items-center">
        <div className="max-w-7xl mx-auto w-full">
          {/* Bento Grid Layout */}
          <div className="grid grid-cols-12 gap-4 md:gap-6 auto-rows-fr">
            
            {/* Hero Card - Spans 8 columns, 2 rows */}
            <div 
              ref={heroRef}
              className="col-span-12 md:col-span-8 row-span-2 bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 overflow-hidden animate-fade-in-up"
            >
              {/* Header with enhanced depth */}
              <div className="relative px-6 py-5 overflow-hidden" style={{ background: 'var(--instance-banner-bg)' }}>
                {/* Multi-layer glow effect */}
                <div 
                  className="absolute inset-0 opacity-30 blur-2xl"
                  style={{ background: 'var(--instance-banner-bg)' }}
                />
                
                {/* Grid pattern overlay */}
                <div className="absolute inset-0 opacity-20" style={{
                  backgroundImage: `
                    linear-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(255, 255, 255, 0.1) 1px, transparent 1px)
                  `,
                  backgroundSize: '30px 30px'
                }}></div>

                {/* Content */}
                <div className="relative flex flex-col md:flex-row items-center gap-4 md:gap-6">
                  {/* Logo with magnetic hover */}
                  <div className="flex-shrink-0 group cursor-pointer">
                    <div className="absolute inset-0 border-4 border-white/30 rounded-full opacity-0 group-hover:opacity-100 animate-ping transition-opacity"></div>
                    <div className="relative">
                      <img 
                        src="/DIVE-Logo.png" 
                        alt="DIVE Logo" 
                        className="h-32 w-32 md:h-40 md:w-40 drop-shadow-2xl animate-float-logo group-hover:scale-110 transition-transform duration-500"
                      />
                    </div>
                  </div>

                  {/* Text content with fluid typography */}
                  <div className="flex-1 text-center md:text-left">
                    <div className="mb-2">
                      <InstanceHeroBadge size="lg" className="justify-center md:justify-start" />
                    </div>
                    
                    <h1 className="fluid-heading-1 font-bold text-white mb-2 tracking-tight">
                      DIVE V3
                    </h1>
                    
                    <div className="inline-block px-3 py-1.5 bg-white/20 backdrop-blur-sm rounded-full border border-white/30 mb-2">
                      <p className="fluid-body text-white font-semibold">
                        Digital Interoperability Verification Experiment
                      </p>
                    </div>
                    
                    <p className="text-white/90 fluid-body leading-relaxed mb-2">
                      Coalition Identity & Access Management Platform
                    </p>
                    
                    <LocalizedFeatureBadges />
                  </div>
                </div>
              </div>

              {/* IdP Selector Section */}
              <div className="p-8 md:p-12">
                <IdpSectionHeader />
                <IdpSelector />
              </div>
            </div>

            {/* Status Card - Spans 4 columns */}
            <div className="col-span-12 md:col-span-4 bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-3xl shadow-xl border border-emerald-200 p-6 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="fluid-text-xl font-bold text-gray-900 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-emerald-600" />
                  System Status
                </h3>
                <div className="relative">
                  <div className="absolute inset-0 bg-emerald-500 rounded-full animate-ping opacity-75"></div>
                  <div className="relative w-3 h-3 bg-emerald-500 rounded-full"></div>
                </div>
              </div>
              
              {/* Metrics Grid */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-white/60 backdrop-blur-sm rounded-xl p-4 border border-emerald-200">
                  <div className="text-2xl font-bold text-emerald-600">99.9%</div>
                  <div className="text-xs text-gray-600 mt-1">Uptime</div>
                </div>
                <div className="bg-white/60 backdrop-blur-sm rounded-xl p-4 border border-emerald-200">
                  <div className="text-2xl font-bold text-emerald-600">4</div>
                  <div className="text-xs text-gray-600 mt-1">Active IdPs</div>
                </div>
              </div>
              
              {/* Progress Bar */}
              <div>
                <div className="flex justify-between text-xs text-gray-600 mb-2">
                  <span>Federation Health</span>
                  <span className="font-bold">95%</span>
                </div>
                <div className="h-2 bg-white/60 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-full transition-all duration-1000"
                    style={{ width: '95%' }}
                  />
                </div>
              </div>

              {/* Quick Actions */}
              <div className="mt-6 pt-4 border-t border-emerald-200">
                <Link 
                  href="/dashboard"
                  className="flex items-center justify-between p-3 bg-white/60 backdrop-blur-sm rounded-xl hover:bg-white/80 transition-all duration-300 group"
                >
                  <span className="text-sm font-semibold text-gray-900">Go to Dashboard</span>
                  <ArrowRight className="w-4 h-4 text-gray-600 group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>
            </div>

            {/* Feature Cards - Varied Sizes */}
            <div 
              ref={featuresRef}
              className="col-span-12 md:col-span-6 lg:col-span-4 bg-white rounded-3xl shadow-xl border border-gray-200 p-6 hover:shadow-2xl transition-all duration-300 hover:-translate-y-2 group cursor-pointer"
              onClick={handleRipple}
              style={{ animationDelay: '0.4s' }}
            >
              {/* Ripple effects */}
              {ripples.map(ripple => (
                <div
                  key={ripple.id}
                  className="absolute rounded-full bg-[var(--instance-primary)]/20 animate-ping"
                  style={{
                    left: ripple.x - 10,
                    top: ripple.y - 10,
                    width: 20,
                    height: 20,
                  }}
                />
              ))}

              {/* Background glow on hover */}
              <div 
                className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 blur-xl transition-opacity duration-500"
                style={{ background: 'var(--instance-banner-bg)' }}
              />

              <div className="relative z-10">
                <div className="mb-4 flex items-center justify-center">
                  <div className="relative w-16 h-16 flex items-center justify-center">
                    <div className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-500/20 to-cyan-500/20 opacity-0 group-hover:opacity-100 blur-lg transition-opacity duration-300"></div>
                    <Globe2 className="relative w-8 h-8 text-[#009ab3] group-hover:scale-110 group-hover:rotate-6 transition-all duration-300" />
                  </div>
                </div>
                <h4 className="fluid-text-lg font-bold text-gray-900 mb-2 text-center group-hover:text-[var(--instance-primary)] transition-colors">
                  Multi-IdP Federation
                </h4>
                <p className="text-sm text-gray-600 leading-relaxed text-center">
                  Seamless authentication across USA/NATO partners
                </p>
              </div>
            </div>

            {/* Wide Feature Card */}
            <div className="col-span-12 md:col-span-6 lg:col-span-8 bg-gradient-to-br from-purple-50 to-pink-50 rounded-3xl shadow-xl border border-purple-200 p-6 hover:shadow-2xl transition-all duration-300 hover:-translate-y-2 group">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                    <Target className="w-8 h-8 text-white" />
                  </div>
                </div>
                <div className="flex-1">
                  <h4 className="fluid-text-xl font-bold text-gray-900 mb-2 group-hover:text-purple-600 transition-colors">
                    ABAC Authorization
                  </h4>
                  <p className="text-sm text-gray-600 leading-relaxed mb-3">
                    Attribute-based access control with OPA policies ensures precise, policy-driven authorization decisions.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <span className="px-2 py-1 bg-white/60 rounded-md text-xs font-semibold text-purple-700">OPA</span>
                    <span className="px-2 py-1 bg-white/60 rounded-md text-xs font-semibold text-purple-700">Rego</span>
                    <span className="px-2 py-1 bg-white/60 rounded-md text-xs font-semibold text-purple-700">ABAC</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Medium Feature Cards */}
            {[
              { Icon: Shield, title: "Clearance-Based Access", desc: "UNCLASSIFIED to TOP_SECRET enforcement", color: "from-red-500/10 to-orange-500/10", iconColor: "text-red-600" },
              { Icon: MapPin, title: "Coalition Releasability", desc: "Country-based information sharing controls", color: "from-green-500/10 to-emerald-500/10", iconColor: "text-[#79d85a]" },
              { Icon: Users, title: "COI Management", desc: "Community of Interest tagging & access", color: "from-yellow-500/10 to-amber-500/10", iconColor: "text-amber-500" },
              { Icon: Lock, title: "Encrypted Documents", desc: "KAS-enabled policy-bound encryption", color: "from-indigo-500/10 to-violet-500/10", iconColor: "text-indigo-600" },
            ].map((feature, idx) => (
              <div
                key={idx}
                className="col-span-12 md:col-span-6 lg:col-span-4 group relative p-6 bg-white rounded-3xl border border-gray-200 hover:border-transparent transition-all duration-300 hover:shadow-2xl hover:-translate-y-2 overflow-hidden animate-fade-in-up"
                style={{ animationDelay: `${0.6 + idx * 0.1}s` }}
              >
                {/* Animated gradient background on hover */}
                <div 
                  className={`absolute inset-0 bg-gradient-to-br ${feature.color} opacity-0 group-hover:opacity-100 transition-opacity duration-300`}
                />

                {/* Shimmer effect */}
                <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out">
                  <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12"></div>
                </div>

                {/* Content */}
                <div className="relative z-10">
                  <div className="mb-4 flex items-center justify-center">
                    <div className="relative w-14 h-14 flex items-center justify-center">
                      <div 
                        className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-20 blur-lg transition-all duration-300"
                        style={{ background: feature.iconColor }}
                      ></div>
                      <feature.Icon 
                        className={`relative ${feature.iconColor} transition-all duration-300 group-hover:scale-110 group-hover:rotate-6`}
                        size={32}
                        strokeWidth={2}
                      />
                    </div>
                  </div>

                  <h4 className="fluid-text-lg font-bold text-gray-900 mb-2 text-center transition-all duration-300">
                    <span className="bg-gradient-to-r from-gray-900 to-gray-900 group-hover:from-[#009ab3] group-hover:to-[#79d85a] bg-clip-text group-hover:text-transparent transition-all duration-300">
                      {feature.title}
                    </span>
                  </h4>

                  <p className="text-sm text-gray-600 leading-relaxed text-center group-hover:text-gray-700 transition-colors duration-300">
                    {feature.desc}
                  </p>
                </div>
              </div>
            ))}

            {/* Footer Card - Full Width */}
            <div className="col-span-12 bg-white/95 backdrop-blur-xl rounded-3xl shadow-xl border border-gray-200 p-8 animate-fade-in-up" style={{ animationDelay: '1s' }}>
              <CoalitionPartnersFooter />
            </div>
          </div>
        </div>
      </div>

      {/* Add CSS for fluid typography */}
      <style jsx>{`
        .fluid-heading-1 {
          font-size: clamp(2rem, 5vw + 1rem, 4rem);
          line-height: 1.1;
        }
        .fluid-text-xl {
          font-size: clamp(1.25rem, 2vw + 0.5rem, 1.5rem);
        }
        .fluid-text-lg {
          font-size: clamp(1.125rem, 1.5vw + 0.5rem, 1.25rem);
        }
        .fluid-body {
          font-size: clamp(1rem, 1vw + 0.5rem, 1.125rem);
          line-height: 1.6;
        }
        @keyframes backgroundScroll {
          from { background-position: 0 0; }
          to { background-position: 50px 50px; }
        }
      `}</style>
    </div>
  );
}



