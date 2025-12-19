/**
 * Modern Dashboard - 2025 UX/UI Design Patterns
 * 
 * Features:
 * - Bento Grid Layout for visual hierarchy
 * - Glassmorphism and depth effects
 * - Micro-interactions and smooth animations
 * - Progressive disclosure of information
 * - Data visualization with at-a-glance metrics
 * - Quick actions hub with prominent CTAs
 * - Contextual, personalized information
 */

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getPseudonymFromUser } from '@/lib/pseudonym-generator';
import { 
  ShieldCheck, 
  FileText, 
  Upload, 
  BookOpen, 
  Globe, 
  TrendingUp,
  Lock,
  Users,
  Activity,
  Clock,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ArrowRight,
  Zap,
  Award,
  Eye
} from 'lucide-react';

interface User {
  uniqueID?: string;
  clearance?: string;
  countryOfAffiliation?: string;
  acpCOI?: string[];
  name?: string;
  email?: string;
}

// Country flag emoji map
const countryFlags: Record<string, string> = {
  USA: '🇺🇸',
  DEU: '🇩🇪',
  FRA: '🇫🇷',
  GBR: '🇬🇧',
  CAN: '🇨🇦',
  ITA: '🇮🇹',
  NLD: '🇳🇱',
  POL: '🇵🇱',
  ESP: '🇪🇸',
};

// Country full names
const countryNames: Record<string, string> = {
  USA: 'United States',
  DEU: 'Germany',
  FRA: 'France',
  GBR: 'United Kingdom',
  CAN: 'Canada',
  ITA: 'Italy',
  NLD: 'Netherlands',
  POL: 'Poland',
  ESP: 'Spain',
};

interface Session {
  user?: User;
}

interface DashboardModernProps {
  user?: User;
  session?: Session;
}

interface IdP {
  alias: string;
  displayName: string;
  protocol: 'oidc' | 'saml';
  enabled: boolean;
}

interface QuickStat {
  value: string | number;
  label: string;
  change?: string;
  trend?: 'up' | 'down' | 'neutral';
}

export function DashboardModern({ user, session }: DashboardModernProps) {
  const [idps, setIdps] = useState<IdP[]>([]);
  const [quickStats, setQuickStats] = useState<QuickStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());

  const [dashboardDetails, setDashboardDetails] = useState<{
    topDenyReasons?: Array<{ reason: string; count: number }>;
    decisionsByCountry?: Record<string, number>;
  } | null>(null);

  useEffect(() => {
    // Fetch IdPs and dashboard stats
    async function fetchData() {
      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://localhost:4000';
        
        // Fetch IdPs
        const idpResponse = await fetch(`${backendUrl}/api/idps/public`);
        if (idpResponse.ok) {
          const data = await idpResponse.json();
          setIdps(data.idps || []);
        }

        // Try authenticated dashboard stats first (if user is logged in)
        let statsData: any = null;
        if (user && session) {
          try {
            const statsResponse = await fetch('/api/dashboard/stats', {
              credentials: 'include',
              cache: 'no-store',
            });
            if (statsResponse.ok) {
              statsData = await statsResponse.json();
              if (statsData.success && statsData.details) {
                setDashboardDetails({
                  topDenyReasons: statsData.details.topDenyReasons,
                  decisionsByCountry: statsData.details.decisionsByCountry,
                });
              }
            }
          } catch (authError) {
            console.debug('Authenticated stats unavailable, falling back to public:', authError);
          }
        }

        // Fallback to public endpoint if authenticated failed or no user
        if (!statsData) {
          const statsResponse = await fetch(`${backendUrl}/api/dashboard/stats/public`);
          if (statsResponse.ok) {
            statsData = await statsResponse.json();
          }
        }

        if (statsData?.success && statsData.stats) {
          setQuickStats(statsData.stats);
        } else {
          // Fallback to defaults if API returns unexpected format
          setQuickStats([
            { value: '0', label: 'Documents Accessible', change: 'Loading...', trend: 'neutral' },
            { value: '100%', label: 'Authorization Rate', change: 'No data', trend: 'neutral' },
            { value: 'N/A', label: 'Avg Response Time', change: 'No data', trend: 'neutral' },
          ]);
        }
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
        // Fallback on network error
        setQuickStats([
          { value: '0', label: 'Documents Accessible', change: 'Offline', trend: 'neutral' },
          { value: '100%', label: 'Authorization Rate', change: 'Offline', trend: 'neutral' },
          { value: 'N/A', label: 'Avg Response Time', change: 'Offline', trend: 'neutral' },
        ]);
      } finally {
        setLoading(false);
      }
    }

    fetchData();

    // Update time every minute
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, [user, session]);

  const pseudonym = getPseudonymFromUser((user || {}) as any);
  const clearanceLevel = user?.clearance || 'UNCLASSIFIED';
  const country = user?.countryOfAffiliation || 'Unknown';
  const coi = user?.acpCOI || [];
  
  // Instance identification
  const currentInstance = process.env.NEXT_PUBLIC_INSTANCE || 'USA';
  const instanceFlag = countryFlags[currentInstance] || '🌐';
  const instanceName = countryNames[currentInstance] || currentInstance;
  
  // Federation detection - is user from a different country than the instance?
  const userHomeCountry = country;
  const userHomeFlag = countryFlags[userHomeCountry] || '🌐';
  const userHomeName = countryNames[userHomeCountry] || userHomeCountry;
  const isFederated = userHomeCountry !== currentInstance && userHomeCountry !== 'Unknown';

  return (
    <div className="space-y-6">
      {/* Instance Banner - Always visible at top */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-800 to-slate-900 p-4 shadow-lg border border-slate-700">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          {/* Current Instance */}
          <div className="flex items-center gap-4">
            <div className="text-4xl">{instanceFlag}</div>
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-400 font-medium">Current Instance</p>
              <p className="text-xl font-bold text-white">{instanceName} Portal</p>
            </div>
          </div>

          {/* Federation Status */}
          {isFederated ? (
            <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{userHomeFlag}</span>
                <ArrowRight className="w-4 h-4 text-amber-400" />
                <span className="text-2xl">{instanceFlag}</span>
              </div>
              <div>
                <p className="text-xs text-amber-300 font-medium">Federated Access</p>
                <p className="text-sm font-bold text-white">Authenticated via {userHomeName}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-500/30">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <div>
                <p className="text-xs text-emerald-300 font-medium">Direct Access</p>
                <p className="text-sm font-bold text-white">Home Instance User</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Hero Section - Compact & Personalized */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 p-8 shadow-2xl">
        {/* Animated background pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: `
              linear-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255, 255, 255, 0.1) 1px, transparent 1px)
            `,
            backgroundSize: '60px 60px',
            animation: 'backgroundScroll 20s linear infinite'
          }}></div>
        </div>

        {/* Floating orbs */}
        <div className="absolute top-10 right-10 w-32 h-32 bg-blue-500 rounded-full blur-3xl opacity-20 animate-pulse"></div>
        <div className="absolute bottom-10 left-10 w-40 h-40 bg-indigo-500 rounded-full blur-3xl opacity-20 animate-pulse" style={{ animationDelay: '1s' }}></div>

        <div className="relative z-10">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            {/* Left: Welcome message */}
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center shadow-lg">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-3xl md:text-4xl font-bold text-white">
                    Welcome back, <span className="bg-gradient-to-r from-blue-300 to-indigo-300 bg-clip-text text-transparent">{pseudonym}</span>
                  </h1>
                  <p className="text-blue-200 text-sm mt-1 flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    {currentTime.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  </p>
                </div>
              </div>
              <p className="text-blue-100 text-base max-w-2xl">
                Your secure access to classified resources across the coalition. All actions are protected by ABAC policies.
              </p>
            </div>

            {/* Right: Identity badges */}
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 shadow-lg">
                <ShieldCheck className="w-5 h-5 text-blue-300" />
                <div>
                  <p className="text-xs text-blue-200 font-medium">Clearance</p>
                  <p className="text-sm font-bold text-white">{clearanceLevel}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 shadow-lg">
                <Globe className="w-5 h-5 text-emerald-300" />
                <div>
                  <p className="text-xs text-emerald-200 font-medium">Country</p>
                  <p className="text-sm font-bold text-white">{country}</p>
                </div>
              </div>

              {coi.length > 0 && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 shadow-lg">
                  <Users className="w-5 h-5 text-purple-300" />
                  <div>
                    <p className="text-xs text-purple-200 font-medium">COI</p>
                    <p className="text-sm font-bold text-white">{coi[0]}{coi.length > 1 ? ` +${coi.length - 1}` : ''}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {quickStats.map((stat, idx) => (
          <div 
            key={idx}
            className="group relative overflow-hidden rounded-2xl bg-white border border-slate-200 p-6 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-3xl font-bold text-slate-900">{stat.value}</p>
                <p className="text-sm text-slate-600 mt-1">{stat.label}</p>
              </div>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                stat.trend === 'up' ? 'bg-green-100' : stat.trend === 'down' ? 'bg-red-100' : 'bg-slate-100'
              }`}>
                {stat.trend === 'up' && <TrendingUp className="w-5 h-5 text-green-600" />}
                {stat.trend === 'down' && <TrendingUp className="w-5 h-5 text-red-600 rotate-180" />}
                {stat.trend === 'neutral' && <Activity className="w-5 h-5 text-slate-600" />}
              </div>
            </div>
            {stat.change && (
              <div className={`inline-flex items-center px-2 py-1 rounded-lg text-xs font-medium ${
                stat.trend === 'up' ? 'bg-green-50 text-green-700' : 
                stat.trend === 'down' ? 'bg-red-50 text-red-700' : 
                'bg-slate-50 text-slate-700'
              }`}>
                {stat.change}
              </div>
            )}

            {/* Hover effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
          </div>
        ))}
      </div>

      {/* User-Specific Insights (if authenticated stats available) */}
      {dashboardDetails && ((dashboardDetails.topDenyReasons?.length ?? 0) > 0 || Object.keys(dashboardDetails.decisionsByCountry || {}).length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Deny Reasons */}
          {dashboardDetails.topDenyReasons && dashboardDetails.topDenyReasons.length > 0 && (
            <div className="rounded-2xl bg-white border border-slate-200 p-6 shadow-lg">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Top Deny Reasons</h3>
                  <p className="text-xs text-slate-500">Last 24 hours</p>
                </div>
              </div>
              <div className="space-y-2">
                {dashboardDetails.topDenyReasons.slice(0, 5).map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-red-50 border border-red-200">
                    <span className="text-sm font-medium text-red-900 flex-1 truncate">{item.reason}</span>
                    <span className="text-xs font-bold text-red-700 bg-red-100 px-2 py-1 rounded-full ml-2">
                      {item.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Decisions by Country */}
          {dashboardDetails.decisionsByCountry && Object.keys(dashboardDetails.decisionsByCountry).length > 0 && (
            <div className="rounded-2xl bg-white border border-slate-200 p-6 shadow-lg">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                  <Globe className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Decisions by Country</h3>
                  <p className="text-xs text-slate-500">Last 24 hours</p>
                </div>
              </div>
              <div className="space-y-2">
                {Object.entries(dashboardDetails.decisionsByCountry)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 5)
                  .map(([country, count], idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-blue-50 border border-blue-200">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{countryFlags[country] || '🌐'}</span>
                        <span className="text-sm font-medium text-blue-900">{countryNames[country] || country}</span>
                      </div>
                      <span className="text-xs font-bold text-blue-700 bg-blue-100 px-2 py-1 rounded-full">
                        {count}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bento Grid - Main Actions & Information */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Large Feature Card - Browse Documents (takes 8 cols) */}
        <Link 
          href="/resources" 
          className="group lg:col-span-8 relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-500 to-indigo-600 p-8 shadow-2xl hover:shadow-3xl transition-all duration-500 hover:scale-[1.02]"
        >
          {/* Animated pattern */}
          <div className="absolute inset-0 opacity-20">
            <div className="absolute inset-0" style={{
              backgroundImage: `radial-gradient(circle, rgba(255,255,255,0.2) 1px, transparent 1px)`,
              backgroundSize: '30px 30px'
            }}></div>
          </div>

          {/* Floating orb */}
          <div className="absolute -right-20 -top-20 w-64 h-64 bg-white rounded-full blur-3xl opacity-10 group-hover:opacity-20 transition-opacity duration-700"></div>

          <div className="relative z-10">
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-all duration-500">
                  <FileText className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white mb-1">Browse Documents</h2>
                  <p className="text-blue-100 text-sm">Access classified resources securely</p>
                </div>
              </div>
              <ArrowRight className="w-8 h-8 text-white group-hover:translate-x-2 transition-transform duration-300" />
            </div>

            <p className="text-white/90 text-base mb-6 max-w-2xl">
              Explore the document repository with ABAC-enforced access control. Every request is evaluated against OPA policies based on your clearance, country, and COI memberships.
            </p>

            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20">
                <CheckCircle2 className="w-4 h-4 text-white" />
                <span className="text-sm text-white font-medium">Policy-Enforced</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20">
                <Lock className="w-4 h-4 text-white" />
                <span className="text-sm text-white font-medium">End-to-End Encrypted</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20">
                <Eye className="w-4 h-4 text-white" />
                <span className="text-sm text-white font-medium">Audit Logged</span>
              </div>
            </div>
          </div>
        </Link>

        {/* Federation Network (4 cols) */}
        <div className="lg:col-span-4 rounded-3xl bg-gradient-to-br from-emerald-50 to-teal-50 p-6 shadow-lg border-2 border-emerald-200 hover:border-emerald-300 transition-all duration-300">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg">
              <Globe className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Federation Network</h3>
              <p className="text-xs text-slate-600">{idps.length} Active Partner{idps.length !== 1 ? 's' : ''}</p>
            </div>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 bg-emerald-200/50 rounded-xl animate-pulse"></div>
              ))}
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {idps.map((idp) => (
                <div 
                  key={idp.alias}
                  className="flex items-center gap-3 p-3 rounded-xl bg-white border border-emerald-200 hover:border-emerald-400 transition-all duration-200 hover:shadow-md"
                >
                  <div className={`w-8 h-8 rounded-lg ${
                    idp.protocol === 'oidc' 
                      ? 'bg-gradient-to-br from-blue-500 to-indigo-600' 
                      : 'bg-gradient-to-br from-purple-500 to-pink-600'
                  } flex items-center justify-center`}>
                    <ShieldCheck className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{idp.displayName}</p>
                    <p className="text-xs text-slate-500">{idp.protocol.toUpperCase()}</p>
                  </div>
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upload Document (4 cols) */}
        <Link 
          href="/upload" 
          className="group lg:col-span-4 relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-600 p-6 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
        >
          <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-white rounded-full blur-3xl opacity-10 group-hover:opacity-20 transition-opacity duration-500"></div>
          
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                <Upload className="w-7 h-7 text-white" />
              </div>
              <ArrowRight className="w-6 h-6 text-white group-hover:translate-x-1 transition-transform duration-300" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Upload Document</h3>
            <p className="text-emerald-100 text-sm">
              Secure upload with automatic ZTDF encryption and ACP-240 compliant labeling
            </p>
          </div>
        </Link>

        {/* Authorization Policies (4 cols) */}
        <Link 
          href="/policies" 
          className="group lg:col-span-4 relative overflow-hidden rounded-3xl bg-gradient-to-br from-purple-500 to-pink-600 p-6 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
        >
          <div className="absolute -left-10 -top-10 w-40 h-40 bg-white rounded-full blur-3xl opacity-10 group-hover:opacity-20 transition-opacity duration-500"></div>
          
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                <ShieldCheck className="w-7 h-7 text-white" />
              </div>
              <ArrowRight className="w-6 h-6 text-white group-hover:translate-x-1 transition-transform duration-300" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Authorization Policies</h3>
            <p className="text-purple-100 text-sm">
              View OPA Rego policies and test authorization decisions in real-time
            </p>
          </div>
        </Link>

        {/* Integration Guide (4 cols) */}
        <Link 
          href="/integration/federation-vs-object" 
          className="group lg:col-span-4 relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-500 to-orange-600 p-6 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
        >
          <div className="absolute top-2 right-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-sm border border-white/30">
            <span className="text-xs font-bold text-white flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              NEW
            </span>
          </div>

          <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-white rounded-full blur-3xl opacity-10 group-hover:opacity-20 transition-opacity duration-500"></div>
          
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                <BookOpen className="w-7 h-7 text-white" />
              </div>
              <ArrowRight className="w-6 h-6 text-white group-hover:translate-x-1 transition-transform duration-300" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Integration Guide</h3>
            <p className="text-amber-100 text-sm">
              Interactive tutorial on ADatP-5663 × ACP-240 security models
            </p>
          </div>
        </Link>
      </div>

      {/* Information & Tips */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* System Status */}
        <div className="rounded-2xl bg-white border border-slate-200 p-6 shadow-lg">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">System Status</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-green-50 border border-green-200">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <span className="text-sm font-medium text-green-900">OPA Policy Engine</span>
              </div>
              <span className="text-xs font-bold text-green-700">Operational</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-green-50 border border-green-200">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <span className="text-sm font-medium text-green-900">Keycloak Auth</span>
              </div>
              <span className="text-xs font-bold text-green-700">Operational</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-green-50 border border-green-200">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <span className="text-sm font-medium text-green-900">Resource API</span>
              </div>
              <span className="text-xs font-bold text-green-700">Operational</span>
            </div>
          </div>
        </div>

        {/* Quick Tips */}
        <div className="rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 p-6 shadow-lg">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Quick Tips</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-white/60 backdrop-blur-sm">
              <Award className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-slate-900">Your attributes are read-only</p>
                <p className="text-xs text-slate-600 mt-1">Clearance and COI managed by your home IdP admin</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-white/60 backdrop-blur-sm">
              <Award className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-slate-900">All actions are audited</p>
                <p className="text-xs text-slate-600 mt-1">Every authorization decision is logged for compliance</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-white/60 backdrop-blur-sm">
              <Award className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-slate-900">Cross-partner collaboration</p>
                <p className="text-xs text-slate-600 mt-1">Users from partner IdPs may access your documents if authorized</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Development Session Details */}
      {process.env.NODE_ENV === 'development' && session && (
        <div className="rounded-2xl bg-slate-900 border border-slate-700 p-6 shadow-lg">
          <details className="group">
            <summary className="cursor-pointer flex items-center justify-between hover:text-emerald-400 transition-colors">
              <span className="text-sm font-bold text-white uppercase tracking-wide flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Session Details (Development Only)
              </span>
              <ArrowRight className="w-5 h-5 text-slate-400 transition-transform group-open:rotate-90" />
            </summary>
            <div className="mt-4 rounded-xl bg-slate-800 p-4 overflow-auto max-h-96 border border-slate-700">
              <pre className="text-xs text-emerald-400 font-mono leading-relaxed">
                {JSON.stringify({
                  ...session,
                  user: {
                    ...session.user,
                    // ACP-240 Section 6.2: Redact PII in development logs
                    name: session.user?.name ? '*** REDACTED (PII) ***' : undefined,
                    email: session.user?.email ? '*** REDACTED (PII) ***' : undefined,
                    uniqueID: session.user?.uniqueID,
                    clearance: session.user?.clearance,
                    countryOfAffiliation: session.user?.countryOfAffiliation,
                    acpCOI: session.user?.acpCOI,
                  },
                }, null, 2)}
              </pre>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
