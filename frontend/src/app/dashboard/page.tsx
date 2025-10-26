import { auth } from "@/auth";
import { redirect } from "next/navigation";
import PageLayout from "@/components/layout/page-layout";
import { DashboardCard } from "@/components/dashboard/dashboard-card";
import { ProfileBadge } from "@/components/dashboard/profile-badge";
import { PseudonymNotice } from "@/components/dashboard/pseudonym-notice";
import { IdpInfo } from "@/components/dashboard/idp-info";
import { FederationPartnersRevamped } from "@/components/dashboard/federation-partners-revamped";
import { InformationPanelModern } from "@/components/dashboard/information-panel-modern";

export default async function DashboardPage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  return (
    <PageLayout 
      user={session.user}
      breadcrumbs={[
        { label: 'Dashboard', href: null }
      ]}
    >
      {/* Hero Section with inline Profile Badge */}
      <div className="mb-8 animate-fade-in-up">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 mb-6">
          <div className="flex-1">
            <h1 className="text-4xl md:text-5xl font-bold mb-3">
              <span className="bg-gradient-to-r from-[#4396ac] via-[#6cb38b] to-[#90d56a] bg-clip-text text-transparent animate-gradient">
                Welcome to DIVE
              </span>
            </h1>
            <p className="text-base text-gray-600 leading-relaxed max-w-2xl">
              You have successfully authenticated. Your identity attributes have been normalized and will be used 
              for attribute-based authorization decisions across the federation.
            </p>
          </div>
          
          {/* Inline Profile Badge */}
          <div className="flex-shrink-0 lg:max-w-xl">
            <ProfileBadge user={session.user || {}} />
          </div>
        </div>
      </div>

      {/* Side-by-side: Pseudonym Notice & IdP Info */}
      <div className="mb-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Pseudonym Explanation */}
        <PseudonymNotice user={session.user || {}} />

        {/* Right: IdP Info */}
        <IdpInfo user={session.user || {}} />
      </div>

      {/* Side-by-side: Federation Network & Information & Support */}
      <div className="mb-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Federation Network */}
        <FederationPartnersRevamped user={session.user || {}} />

        {/* Right: Information & Support */}
        <InformationPanelModern />
      </div>

      {/* Divider with gradient */}
      <div className="mb-8">
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t-2 border-gray-200"></div>
          </div>
          <div className="relative flex justify-center">
            <div className="px-6 py-2 bg-gradient-to-r from-[#4396ac] via-[#6cb38b] to-[#90d56a] rounded-full shadow-lg animate-bounce-subtle">
              <span className="text-white font-bold text-sm uppercase tracking-wider">Your Actions</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions - Modernized */}
      <div className="mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <DashboardCard
            href="/resources"
            title="Browse Documents"
            description="Access classified documents based on your security attributes and authorization policies"
            icon={
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            }
            gradient="from-blue-500 to-indigo-600"
            delay={0}
          />

          <DashboardCard
            href="/upload"
            title="Upload Document"
            description="Upload files with automatic ZTDF encryption and ACP-240 compliant security labeling"
            icon={
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            }
            gradient="from-emerald-500 to-teal-600"
            delay={50}
          />

          <DashboardCard
            href="/policies"
            title="Authorization Policies"
            description="View OPA Rego policies and test authorization decisions with real-time feedback"
            icon={
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            }
            gradient="from-purple-500 to-pink-600"
            delay={100}
          />

          <DashboardCard
            href="/integration/federation-vs-object"
            title="Integration Guide"
            description="Interactive tutorial: ADatP-5663 (Federation) × ACP-240 (Object) security models"
            icon={
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            }
            gradient="from-amber-500 to-orange-600"
            delay={150}
            badge="NEW"
          />
        </div>
      </div>

      {/* Development Session Details */}
      {process.env.NODE_ENV === 'development' && (
        <div className="mt-8 rounded-xl bg-white p-5 shadow-md border border-gray-200 animate-fade-in-up" style={{ animationDelay: '300ms' }}>
          <details className="group">
            <summary className="cursor-pointer font-semibold text-gray-900 mb-2 flex items-center justify-between hover:text-[#4396ac] transition-colors text-sm">
              <span className="flex items-center uppercase tracking-wide">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
                Session Details (Development Only)
              </span>
              <svg className="w-4 h-4 transition-transform group-open:rotate-180 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </summary>
            <div className="mt-3 rounded-lg bg-gray-900 p-4 overflow-auto max-h-96 border border-gray-700">
              <pre className="text-xs text-green-400 font-mono leading-relaxed">
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
    </PageLayout>
  );
}

