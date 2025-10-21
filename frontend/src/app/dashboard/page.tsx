import { auth } from "@/auth";
import { redirect } from "next/navigation";
import PageLayout from "@/components/layout/page-layout";
import { DashboardCard } from "@/components/dashboard/dashboard-card";
import { ProfileBadge } from "@/components/dashboard/profile-badge";
import { CompactProfile } from "@/components/dashboard/compact-profile";
import { FederationPartners } from "@/components/dashboard/federation-partners";
import { InformationPanel } from "@/components/dashboard/information-panel";

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

      {/* Side-by-side: Security Profile & Federation Partners */}
      <div className="mb-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Security Profile & IdP Info */}
        <CompactProfile user={session.user || {}} />

        {/* Right: Federation Partners */}
        <FederationPartners />
      </div>

      {/* Information & Support Panel */}
      <div className="mb-8">
        <InformationPanel />
      </div>

      {/* Main Action Cards */}
      <div className="mb-8">
        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <DashboardCard
            href="/resources"
            title="Browse Documents"
            description="Access classified documents based on your security attributes and authorization policies"
            icon="📄"
            delay={150}
          />

          <DashboardCard
            href="/upload"
            title="Upload Document"
            description="Upload files with automatic ZTDF encryption and ACP-240 compliant security labeling"
            icon="📤"
            delay={200}
          />

          <DashboardCard
            href="/policies"
            title="Authorization Policies"
            description="View OPA Rego policies and test authorization decisions with real-time feedback"
            icon="📜"
            delay={250}
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

