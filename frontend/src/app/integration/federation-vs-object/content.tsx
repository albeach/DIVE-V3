"use client";

import { SplitViewStorytelling } from "@/components/integration/SplitViewStorytelling";
import { FlowMap } from "@/components/integration/FlowMap";
import { GlassDashboard } from "@/components/integration/GlassDashboard";
import { AttributeDiff } from "@/components/integration/AttributeDiff";
import { DecisionReplay } from "@/components/integration/DecisionReplay";
import { ZTDFViewer } from "@/components/integration/ZTDFViewer";
import { JWTLens } from "@/components/integration/JWTLens";
import { FusionMode } from "@/components/integration/FusionMode";
import { useStandardsLens } from "@/contexts/StandardsLensContext";
import Link from "next/link";

/**
 * Integration Content Component
 * 
 * Main content for the integration page (separated for server/client boundary)
 */
export default function IntegrationContent() {
  const { activeLens, is5663Active, is240Active, isUnifiedActive } = useStandardsLens();

  return (
    <div>
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-indigo-500 via-purple-500 to-amber-500 text-white rounded-2xl p-8 mb-8 shadow-xl">
        <div className="text-center">
          <h1 className="text-3xl sm:text-4xl font-bold mb-3">
            Federation ↔ Object Security
          </h1>
          <p className="text-lg text-indigo-100 mb-2">
            ADatP-5663 (Identity) × ACP-240 (Data)
          </p>
          <p className="text-sm text-indigo-200 max-w-2xl mx-auto mb-4">
            Interactive tutorial showing how identity federation and data-centric security integrate
          </p>

          {/* Active Lens Indicator */}
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/20 backdrop-blur-md rounded-lg">
            <span className="text-xs font-medium">Active View:</span>
            <span className="font-bold text-base">
              {is5663Active && '🔵 Federation (5663)'}
              {is240Active && '🟠 Object (240)'}
              {isUnifiedActive && '🟢 Unified (Both)'}
            </span>
          </div>
        </div>
      </div>

      {/* Quick Nav */}
      <div className="mb-8">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            Related Resources
          </h2>
          <div className="grid md:grid-cols-3 gap-4">
            <Link 
              href="/compliance"
              className="p-4 border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:border-teal-500 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-all"
            >
              <div className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                ✅ Compliance Dashboard
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                View ACP-240 compliance status
              </div>
            </Link>
            <Link 
              href="/compliance/classifications"
              className="p-4 border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:border-teal-500 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-all"
            >
              <div className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                🌍 Classification Matrix
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                12-nation equivalency table
              </div>
            </Link>
            <Link 
              href="/policies"
              className="p-4 border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:border-teal-500 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-all"
            >
              <div className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                📜 OPA Policies
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                View authorization rules
              </div>
            </Link>
          </div>
        </div>
      </div>

      {/* Introduction Card */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-8 mb-8">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
          Understanding the Integration
        </h2>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-lg font-semibold text-indigo-600 dark:text-indigo-400 mb-2">
              ADatP-5663: Federation Model
            </h3>
            <p className="text-gray-700 dark:text-gray-300 mb-3">
              Focuses on <strong>identity federation</strong> across trust domains.
            </p>
            <ul className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
              <li>• IdP-to-SP bilateral trust</li>
              <li>• Ephemeral tokens (≤ 60 min)</li>
              <li>• Subject identity assertion</li>
              <li>• AAL/FAL assurance levels</li>
            </ul>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-amber-600 dark:text-amber-400 mb-2">
              ACP-240: Object Model
            </h3>
            <p className="text-gray-700 dark:text-gray-300 mb-3">
              Focuses on <strong>data-centric security</strong>.
            </p>
            <ul className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
              <li>• Object-to-consumer crypto trust</li>
              <li>• Persistent encryption (at rest)</li>
              <li>• Policy-bound encryption (ZTDF)</li>
              <li>• KAS mediation & integrity</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Components */}
      <SplitViewStorytelling />
      <FlowMap />
      <GlassDashboard />
      <AttributeDiff />
      <DecisionReplay />

      {/* Conditional Components */}
      {(is240Active || isUnifiedActive) && <ZTDFViewer />}
      {(is5663Active || isUnifiedActive) && <JWTLens />}

      <FusionMode />

      {/* Lens Effect Indicator */}
      {!isUnifiedActive && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-300 dark:border-yellow-700 rounded-xl p-6 mb-8">
          <div className="text-center">
            <p className="text-sm font-semibold text-yellow-900 dark:text-yellow-100 mb-2">
              🔍 You're viewing in <strong>{is5663Active ? 'Federation (5663)' : 'Object (240)'}</strong> mode
            </p>
            <p className="text-xs text-yellow-800 dark:text-yellow-200">
              {is5663Active 
                ? 'ZTDF Viewer is hidden. Switch to Unified or 240 mode to see object details.'
                : 'JWT Lens is hidden. Switch to Unified or 5663 mode to see federation details.'
              }
            </p>
          </div>
        </div>
      )}

      {/* Integration Notes */}
      <div className="bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-700 rounded-xl p-6 mb-8">
        <h3 className="text-lg font-semibold text-teal-900 dark:text-teal-100 mb-3">
          How They Work Together
        </h3>
        <p className="text-sm text-teal-800 dark:text-teal-200 mb-3">
          <strong>Overlap:</strong> Both rely on ABAC (subject/resource/environment/action attributes)
        </p>
        <p className="text-sm text-teal-800 dark:text-teal-200">
          <strong>Divergence:</strong> 5663 = WHO can authenticate, 240 = WHAT data can be accessed
        </p>
      </div>

      {/* Reference Links */}
      <div className="grid md:grid-cols-2 gap-6 mb-8">
        <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-lg p-6">
          <h4 className="font-semibold text-indigo-900 dark:text-indigo-100 mb-3">
            ADatP-5663 References
          </h4>
          <ul className="space-y-1 text-sm text-indigo-800 dark:text-indigo-200">
            <li>• §2.4 Federated Authentication</li>
            <li>• §4.4 Minimum Subject Attributes</li>
            <li>• §5.1 IdP Requirements</li>
            <li>• §6.2-6.8 Federated Access Control</li>
          </ul>
        </div>
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-6">
          <h4 className="font-semibold text-amber-900 dark:text-amber-100 mb-3">
            ACP-240 References
          </h4>
          <ul className="space-y-1 text-sm text-amber-800 dark:text-amber-200">
            <li>• §4 Data Markings (STANAG 4774/4778)</li>
            <li>• §5 ZTDF & Cryptography</li>
            <li>• §5.2 Key Access Service</li>
            <li>• §6 Logging & Auditing</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
